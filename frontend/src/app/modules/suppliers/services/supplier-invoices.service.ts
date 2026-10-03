import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  docData,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { Observable, filter, map, takeUntil } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import {
  FACTURAS_PROVEEDOR_COLLECTION,
  PAGOS_SUBCOLLECTION,
} from '../constants/suppliers.constants';
import {
  CrearFacturaProveedorDto,
  EstadoFactura,
  FacturaProveedor,
  PagoDto,
} from '../models/supplier.models';
import {
  getOutstandingSupplierBalance,
  normalizeInvoiceCancellationReason,
  validateInvoiceOpening,
  validateSupplierInvoiceBalance,
  readSupplierFinancialTotals,
} from './supplier-finance.policy';
import { recordSupplierPayment } from './supplier-payment.transaction';

@Injectable({
  providedIn: 'root',
})
export class SupplierInvoicesService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private businessContext = inject(BusinessContextService);
  private loadRevision = 0;
  constructor() {
    this.businessContext.context$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.loadRevision++;
      this.facturasSignal.set([]);
      this.loadingSignal.set(false);
      this.refreshError.set(null);
    });
  }

  // Signals para estado reactivo
  private facturasSignal = signal<FacturaProveedor[]>([]);
  private loadingSignal = signal(false);
  readonly refreshError = signal<string | null>(null);

  // Getters públicos
  readonly facturas = this.facturasSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  private getColeccionFacturasProveedor() {
    const userId = this.businessContext.requireOwnerUid();
    if (!userId) throw new Error('Usuario no autenticado');
    return collection(this.firestore, `usuarios/${userId}/${FACTURAS_PROVEEDOR_COLLECTION}`);
  }

  private getDocumentoFactura(facturaId: string) {
    const userId = this.businessContext.requireOwnerUid();
    if (!userId) throw new Error('Usuario no autenticado');
    return doc(this.firestore, `usuarios/${userId}/${FACTURAS_PROVEEDOR_COLLECTION}/${facturaId}`);
  }

  private getDocumentoProveedor(proveedorId: string) {
    const userId = this.businessContext.requireOwnerUid();
    if (!userId) throw new Error('Usuario no autenticado');
    return doc(this.firestore, `usuarios/${userId}/proveedores/${proveedorId}`);
  }

  private getColeccionPagos(facturaId: string) {
    const facturaRef = this.getDocumentoFactura(facturaId);
    return collection(facturaRef, PAGOS_SUBCOLLECTION);
  }

  async loadInvoices(supplierId?: string): Promise<void> {
    this.refreshError.set(null);
    const revision = ++this.loadRevision;
    this.loadingSignal.set(true);
    try {
      const facturasRef = this.getColeccionFacturasProveedor();
      let q = query(facturasRef, orderBy('fechaVencimiento', 'asc'));

      if (supplierId) {
        q = query(
          facturasRef,
          where('proveedorId', '==', supplierId),
          orderBy('fechaVencimiento', 'asc')
        );
      }

      const snapshot = await getDocs(q);
      const facturas = snapshot.docs.map((doc) => {
        const data = doc.data() as any;
        validateSupplierInvoiceBalance(data);
        return {
          ...data,
          id: doc.id,
          monto: Number(data.monto),
          montoPagado: Number(data.montoPagado ?? 0),
          pagos: this.readPayments(data.pagos, data.pagosPorId),
          fechaVencimiento: this.readDate(data.fechaVencimiento),
          fechaEmision: this.readDate(data.fechaEmision, true)!,
          fechaRegistro: this.readDate(data.fechaRegistro) ?? this.readDate(data.fechaEmision, true)!,
          ultimaModificacion: this.readDate(data.ultimaModificacion) ?? this.readDate(data.fechaEmision, true)!,
        } as FacturaProveedor;
      });

      if (revision === this.loadRevision) this.facturasSignal.set(facturas);
    } catch (error) {
      console.error('Error cargando facturas:', error);
      throw error;
    } finally {
      if (revision === this.loadRevision) this.loadingSignal.set(false);
    }
  }

  async createInvoice(dto: CrearFacturaProveedorDto): Promise<string> {
    const assertSession = this.captureWriteSession();
    validateInvoiceOpening(dto.monto, dto.estado, dto.montoPagado);
    const facturasRef = this.getColeccionFacturasProveedor();
    if (!dto.proveedorId.trim() || !dto.numeroFactura.trim() || dto.proveedorId.includes('/')) {
      throw new Error('Selecciona un proveedor y un número de factura válidos.');
    }
    if (!(dto.fechaEmision instanceof Date) || !Number.isFinite(dto.fechaEmision.getTime()) ||
        (dto.fechaVencimiento && !Number.isFinite(dto.fechaVencimiento.getTime()))) {
      throw new Error('Las fechas de la factura no son válidas.');
    }

    const facturaData = {
      proveedorId: dto.proveedorId,
      numeroFactura: dto.numeroFactura,
      fechaEmision: dto.fechaEmision,
      fechaVencimiento: dto.fechaVencimiento || null,
      monto: dto.monto,
      estado: dto.estado,
      montoPagado: dto.montoPagado,
      pagos: [],
      observaciones: dto.observaciones || '',
      registradoPor: this.auth.currentUser?.uid,
      isFacturaLocal: dto.isFacturaLocal || false,
      operacionId: dto.operacionId || null,
      fechaRegistro: serverTimestamp(),
      ultimaModificacion: serverTimestamp(),
    };

    // Same supplier/reference means the same logical invoice on retry.
    const invoiceKey = encodeURIComponent(JSON.stringify([dto.proveedorId, dto.numeroFactura.trim()]));
    if (invoiceKey.length > 1000) throw new Error('La referencia de factura es demasiado larga.');
    const facturaDocRef = doc(facturasRef, invoiceKey);

    // Actualizar estadísticas del proveedor
    const proveedorRef = this.getDocumentoProveedor(dto.proveedorId);
    const montoPendiente = dto.monto - dto.montoPagado;
    await runTransaction(this.firestore, async (transaction) => {
      assertSession();
      const existing = await transaction.get(facturaDocRef);
      if (existing.exists()) {
        const data = existing.data();
        if (data['monto'] !== dto.monto || data['proveedorId'] !== dto.proveedorId ||
            data['fechaEmision']?.toMillis?.() !== dto.fechaEmision.getTime() ||
            (data['fechaVencimiento']?.toMillis?.() ?? null) !== (dto.fechaVencimiento?.getTime() ?? null) ||
            (data['observaciones'] ?? '') !== (dto.observaciones ?? '')) {
          throw new Error('Ya existe esa factura del proveedor con datos diferentes.');
        }
        return;
      }
      const supplier = await transaction.get(proveedorRef);
      if (!supplier.exists()) throw new Error('El proveedor ya no existe. Requiere revisión.');
      const totals = readSupplierFinancialTotals(supplier.data());
      assertSession();
      transaction.set(facturaDocRef, facturaData);
      transaction.update(proveedorRef, {
        deuda_total: totals.debt + dto.monto, pagado: totals.paid + dto.montoPagado,
        pendiente: totals.pending + montoPendiente, ultima_modificacion: serverTimestamp(),
      });
    });

    // Recargar facturas
    await this.refreshAfterCommit();

    return facturaDocRef.id;
  }

  async addPayment(facturaId: string, pagoDto: PagoDto): Promise<void> {
    const ownerUid = this.businessContext.requireOwnerUid();
    const revision = this.loadRevision;
    const actorUid = this.auth.currentUser?.uid;
    if (!actorUid) throw new Error('Usuario no autenticado.');
    const operationId = pagoDto.operationId ?? doc(this.getColeccionPagos(facturaId)).id;
    await recordSupplierPayment(this.firestore, ownerUid, actorUid, facturaId, { ...pagoDto, operationId }, () => {
      const context = this.businessContext.context();
      if (context.status === 'signed-out' || context.ownerUid !== ownerUid || context.actorUid !== actorUid) {
        throw new Error('La sesión cambió. Revisa el comprobante antes de continuar.');
      }
    });
    if (revision === this.loadRevision) await this.refreshAfterCommit();
  }

  async deleteInvoice(facturaId: string, cancellationReason: string): Promise<void> {
    const assertSession = this.captureWriteSession();
    const reason = normalizeInvoiceCancellationReason(cancellationReason);
    const facturaRef = this.getDocumentoFactura(facturaId);
    const actorUid = this.auth.currentUser?.uid;
    await runTransaction(this.firestore, async (transaction) => {
      assertSession();
      const facturaSnap = await transaction.get(facturaRef);
      if (!facturaSnap.exists()) throw new Error('Factura no encontrada.');

      const facturaData = facturaSnap.data() as FacturaProveedor;
      if (facturaData.estado === 'anulada') return;
      const monto = Number(facturaData.monto);
      const montoPagado = Number(facturaData.montoPagado ?? 0);
      if (!Number.isFinite(monto) || monto <= 0 || !Number.isFinite(montoPagado) || montoPagado < 0) {
        throw new Error('La factura tiene importes incompatibles y requiere revisión.');
      }
      if (montoPagado > 0) {
        throw new Error('No se puede anular una factura con pagos. Registra una nota de crédito cuando ese flujo esté disponible.');
      }

      const proveedorRef = doc(facturaRef.parent.parent!, `proveedores/${facturaData.proveedorId}`);
      const supplier = await transaction.get(proveedorRef);
      if (!supplier.exists()) throw new Error('El proveedor ya no existe. Requiere revisión.');
      const totals = readSupplierFinancialTotals(supplier.data());
      const tolerance = Math.max(1e-9, monto * Number.EPSILON * 16);
      if (monto - totals.debt > tolerance || monto - totals.pending > tolerance) {
        throw new Error('El saldo del proveedor no coincide con la factura. Requiere conciliación.');
      }
      assertSession();
      transaction.update(facturaRef, {
        estado: 'anulada',
        anuladaAt: serverTimestamp(),
        anulacionMotivo: reason,
        anuladaPor: actorUid,
        ultimaModificacion: serverTimestamp(),
      });
      transaction.update(proveedorRef, {
        deuda_total: Math.abs(totals.debt - monto) <= tolerance ? 0 : totals.debt - monto,
        pendiente: Math.abs(totals.pending - monto) <= tolerance ? 0 : totals.pending - monto,
        ultima_modificacion: serverTimestamp(),
      });
    });

    // Recargar facturas
    await this.refreshAfterCommit();
  }

  private async refreshAfterCommit(): Promise<void> {
    try { await this.loadInvoices(); }
    catch { this.refreshError.set('El cambio se guardó, pero no se pudo actualizar la lista. Pulsa Actualizar para consultar los saldos vigentes.'); }
  }

  private captureWriteSession(): () => void {
    const initial = this.businessContext.context();
    if (initial.status === 'signed-out') throw new Error('Usuario no autenticado.');
    return () => {
      const current = this.businessContext.context();
      if (current.status === 'signed-out' || current.ownerUid !== initial.ownerUid || current.actorUid !== initial.actorUid) {
        throw new Error('La sesión cambió. Revisa la operación antes de continuar.');
      }
    };
  }

  getFacturaById(facturaId: string): Observable<FacturaProveedor | null> {
    const facturaRef = this.getDocumentoFactura(facturaId);
    const initial = this.businessContext.context();
    return docData(facturaRef, { idField: 'id' }).pipe(
      takeUntil(this.businessContext.context$.pipe(filter(current =>
        current.status === 'signed-out' || initial.status === 'signed-out' ||
        current.ownerUid !== initial.ownerUid || current.actorUid !== initial.actorUid))),
      map((data) => {
        if (!data) return null;

        const facturaData = data as any;
        validateSupplierInvoiceBalance(facturaData);
        return {
          ...facturaData,
          monto: Number(facturaData.monto),
          montoPagado: Number(facturaData.montoPagado ?? 0),
          pagos: this.readPayments(facturaData.pagos, facturaData.pagosPorId),
          fechaVencimiento: this.readDate(facturaData.fechaVencimiento),
          fechaEmision: this.readDate(facturaData.fechaEmision, true)!,
          fechaRegistro: this.readDate(facturaData.fechaRegistro) ?? this.readDate(facturaData.fechaEmision, true)!,
          ultimaModificacion: this.readDate(facturaData.ultimaModificacion) ?? this.readDate(facturaData.fechaEmision, true)!,
        } as FacturaProveedor;
      })
    );
  }

  getFacturasByProveedor(proveedorId: string): FacturaProveedor[] {
    return this.facturasSignal().filter((factura) => factura.proveedorId === proveedorId);
  }

  getFacturasVencidas(): FacturaProveedor[] {
    const ahora = new Date();
    return this.facturasSignal().filter(
      (factura) =>
        factura.estado !== 'pagada' && factura.estado !== 'anulada' && factura.fechaVencimiento && factura.fechaVencimiento < ahora
    );
  }

  getFacturasPendientes(): FacturaProveedor[] {
    return this.facturasSignal().filter((factura) => factura.estado === 'pendiente');
  }

  getDeudaTotal(): number {
    return this.facturasSignal()
      .reduce((sum, factura) => sum + getOutstandingSupplierBalance(factura), 0);
  }

  private readPayments(payments: any, paymentsById?: any): FacturaProveedor['pagos'] {
    const merged = new Map<string, any>();
    for (const [index, payment] of (Array.isArray(payments) ? payments : []).entries()) {
      if (payment && typeof payment === 'object') {
        const id = payment.id ?? `legacy-${index}`;
        merged.set(id, { ...payment, id });
      }
    }
    if (paymentsById && typeof paymentsById === 'object' && !Array.isArray(paymentsById)) {
      for (const [id, payment] of Object.entries(paymentsById)) {
        if (payment && typeof payment === 'object') merged.set(id, { ...payment, id });
      }
    }
    return [...merged.values()].map(payment => {
      const date = payment.fecha?.toDate?.() ?? (payment.fecha instanceof Date ? payment.fecha : new Date(payment.fecha));
      if (!Number.isFinite(date.getTime()) || !Number.isFinite(Number(payment.monto)) || Number(payment.monto) <= 0) {
        throw new Error('Hay un comprobante con fecha o monto inválido. Revisa la factura antes de calcular sus estadísticas.');
      }
      return { ...payment, monto: Number(payment.monto), fecha: date };
    }).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }

  private readDate(value: any, required = false): Date | undefined {
    if (value === null || value === undefined) {
      if (required) throw new Error('Hay una factura sin fecha de emisión. Revisa el registro antes de calcular sus estadísticas.');
      return undefined;
    }
    const date = value?.toDate?.() ?? (value instanceof Date ? value : new Date(value));
    if (!Number.isFinite(date.getTime())) throw new Error('Hay una factura con una fecha inválida.');
    return date;
  }
}
