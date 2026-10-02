import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  arrayUnion,
  collection,
  doc,
  docData,
  getDocs,
  increment,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
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
} from './supplier-finance.policy';

@Injectable({
  providedIn: 'root',
})
export class SupplierInvoicesService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  // Signals para estado reactivo
  private facturasSignal = signal<FacturaProveedor[]>([]);
  private loadingSignal = signal(false);

  // Getters públicos
  readonly facturas = this.facturasSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  private getColeccionFacturasProveedor() {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('Usuario no autenticado');
    return collection(this.firestore, `usuarios/${userId}/${FACTURAS_PROVEEDOR_COLLECTION}`);
  }

  private getDocumentoFactura(facturaId: string) {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('Usuario no autenticado');
    return doc(this.firestore, `usuarios/${userId}/${FACTURAS_PROVEEDOR_COLLECTION}/${facturaId}`);
  }

  private getDocumentoProveedor(proveedorId: string) {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('Usuario no autenticado');
    return doc(this.firestore, `usuarios/${userId}/proveedores/${proveedorId}`);
  }

  private getColeccionPagos(facturaId: string) {
    const facturaRef = this.getDocumentoFactura(facturaId);
    return collection(facturaRef, PAGOS_SUBCOLLECTION);
  }

  async loadInvoices(supplierId?: string): Promise<void> {
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
        return {
          id: doc.id,
          ...data,
          fechaVencimiento: data.fechaVencimiento?.toDate() || undefined,
          fechaEmision: data.fechaEmision?.toDate() || new Date(),
          fechaRegistro: data.fechaRegistro?.toDate() || new Date(),
          ultimaModificacion: data.ultimaModificacion?.toDate() || new Date(),
        } as FacturaProveedor;
      });

      this.facturasSignal.set(facturas);
    } catch (error) {
      console.error('Error cargando facturas:', error);
      throw error;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async createInvoice(dto: CrearFacturaProveedorDto): Promise<string> {
    validateInvoiceOpening(dto.monto, dto.estado, dto.montoPagado);
    const batch = writeBatch(this.firestore);
    const facturasRef = this.getColeccionFacturasProveedor();

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

    const facturaDocRef = doc(facturasRef);
    batch.set(facturaDocRef, facturaData);

    // Actualizar estadísticas del proveedor
    const proveedorRef = this.getDocumentoProveedor(dto.proveedorId);
    const montoPendiente = dto.monto - dto.montoPagado;
    batch.update(proveedorRef, {
      deuda_total: increment(dto.monto),
      pagado: increment(dto.montoPagado),
      pendiente: increment(montoPendiente),
      ultima_modificacion: serverTimestamp(),
    });

    await batch.commit();

    // Recargar facturas
    await this.loadInvoices();

    return facturaDocRef.id;
  }

  async addPayment(facturaId: string, pagoDto: PagoDto): Promise<void> {
    const facturaRef = this.getDocumentoFactura(facturaId);
    if (!Number.isFinite(pagoDto.monto) || pagoDto.monto <= 0) {
      throw new Error('El pago debe ser un valor mayor que cero.');
    }

    const pagosRef = this.getColeccionPagos(facturaId);
    const operationId = pagoDto.operationId ?? doc(pagosRef).id;
    const pagoDocRef = doc(pagosRef, operationId);
    const fechaPago = new Date();

    await runTransaction(this.firestore, async (transaction) => {
      const [facturaSnap, pagoExistente] = await Promise.all([
        transaction.get(facturaRef),
        transaction.get(pagoDocRef),
      ]);
      // A retry must not add a second payment or alter totals again.
      if (pagoExistente.exists()) return;
      if (!facturaSnap.exists()) throw new Error('Factura no encontrada.');

      const facturaData = facturaSnap.data() as FacturaProveedor;
      const monto = Number(facturaData.monto);
      const pagadoActual = Number(facturaData.montoPagado ?? 0);
      if (!Number.isFinite(monto) || monto <= 0 || !Number.isFinite(pagadoActual) || pagadoActual < 0) {
        throw new Error('La factura tiene importes incompatibles y requiere revisión.');
      }

      const pendienteActual = monto - pagadoActual;
      if (pendienteActual <= 0) throw new Error('La factura ya no tiene saldo pendiente.');
      if (pagoDto.monto > pendienteActual) {
        throw new Error('El pago supera el saldo pendiente de la factura.');
      }

      const totalPagado = pagadoActual + pagoDto.monto;
      const montoPendiente = monto - totalPagado;
      const nuevoEstado: EstadoFactura = montoPendiente === 0 ? 'pagada' : 'parcial';
      const pagoResumen = {
        id: pagoDocRef.id,
        monto: pagoDto.monto,
        fecha: fechaPago,
        tipo: pagoDto.tipo,
        observaciones: pagoDto.observaciones ?? '',
        operationId,
      };
      const proveedorRef = this.getDocumentoProveedor(facturaData.proveedorId);

      transaction.set(pagoDocRef, {
        ...pagoResumen,
        fechaRegistro: serverTimestamp(),
      });
      transaction.update(facturaRef, {
        estado: nuevoEstado,
        montoPagado: totalPagado,
        pagos: arrayUnion(pagoResumen),
        ultimaModificacion: serverTimestamp(),
      });
      transaction.update(proveedorRef, {
        pagado: increment(pagoDto.monto),
        pendiente: increment(-pagoDto.monto),
        ultima_modificacion: serverTimestamp(),
      });
    });

    // Recargar facturas
    await this.loadInvoices();
  }

  async deleteInvoice(facturaId: string, cancellationReason: string): Promise<void> {
    const reason = normalizeInvoiceCancellationReason(cancellationReason);
    const facturaRef = this.getDocumentoFactura(facturaId);
    await runTransaction(this.firestore, async (transaction) => {
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

      const proveedorRef = this.getDocumentoProveedor(facturaData.proveedorId);
      transaction.update(facturaRef, {
        estado: 'anulada',
        anuladaAt: serverTimestamp(),
        anulacionMotivo: reason,
        anuladaPor: this.auth.currentUser?.uid,
        ultimaModificacion: serverTimestamp(),
      });
      transaction.update(proveedorRef, {
        deuda_total: increment(-monto),
        pendiente: increment(-monto),
        ultima_modificacion: serverTimestamp(),
      });
    });

    // Recargar facturas
    await this.loadInvoices();
  }

  getFacturaById(facturaId: string): Observable<FacturaProveedor | null> {
    const facturaRef = this.getDocumentoFactura(facturaId);
    return docData(facturaRef, { idField: 'id' }).pipe(
      map((data) => {
        if (!data) return null;

        const facturaData = data as any;
        return {
          ...facturaData,
          fechaVencimiento: facturaData.fechaVencimiento?.toDate() || undefined,
          fechaEmision: facturaData.fechaEmision?.toDate() || new Date(),
          fechaRegistro: facturaData.fechaRegistro?.toDate() || new Date(),
          ultimaModificacion: facturaData.ultimaModificacion?.toDate() || new Date(),
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
}
