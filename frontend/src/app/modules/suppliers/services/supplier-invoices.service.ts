import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  docData,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
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
      registradoPor: dto.registradoPor,
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
    const batch = writeBatch(this.firestore);

    // Obtener la factura actual
    const facturaRef = this.getDocumentoFactura(facturaId);
    const facturaSnap = await getDocs(query(collection(this.firestore, facturaRef.path)));
    const facturaData = facturaSnap.docs[0]?.data() as any;

    if (!facturaData) throw new Error('Factura no encontrada');

    // Crear el pago
    const pagosRef = this.getColeccionPagos(facturaId);
    const pagoData = {
      monto: pagoDto.monto,
      fecha: new Date(),
      tipo: pagoDto.tipo,
      observaciones: pagoDto.observaciones,
      fechaRegistro: serverTimestamp(),
    };

    const pagoDocRef = doc(pagosRef);
    batch.set(pagoDocRef, pagoData);

    // Calcular nuevo estado de la factura
    const pagadoActual = facturaData.pagos?.reduce((sum: number, p: any) => sum + p.monto, 0) || 0;
    const totalPagado = pagadoActual + pagoDto.monto;
    const montoPendiente = facturaData.monto - totalPagado;

    let nuevoEstado: EstadoFactura;
    if (montoPendiente <= 0) {
      nuevoEstado = 'pagada';
    } else if (totalPagado > 0) {
      nuevoEstado = 'parcial';
    } else {
      nuevoEstado = 'pendiente';
    }

    // Actualizar factura
    batch.update(facturaRef, {
      estado: nuevoEstado,
      montoPagado: totalPagado,
      pagos: [...(facturaData.pagos || []), { ...pagoData, id: pagoDocRef.id }],
      ultimaModificacion: serverTimestamp(),
    });

    // Actualizar estadísticas del proveedor
    const proveedorRef = this.getDocumentoProveedor(facturaData.proveedorId);
    const incrementoPagado = pagoDto.monto;
    const decrementoPendiente =
      pagoDto.tipo === 'completo' ? facturaData.monto - pagadoActual : pagoDto.monto;

    batch.update(proveedorRef, {
      pagado: increment(incrementoPagado),
      pendiente: increment(-decrementoPendiente),
      ultima_modificacion: serverTimestamp(),
    });

    await batch.commit();

    // Recargar facturas
    await this.loadInvoices();
  }

  async deleteInvoice(facturaId: string): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Obtener la factura
    const facturaRef = this.getDocumentoFactura(facturaId);
    const facturaSnap = await getDoc(facturaRef);
    const facturaData = facturaSnap.data() as FacturaProveedor;

    if (!facturaData) throw new Error('Factura no encontrada');

    // Eliminar pagos asociados
    const pagosRef = this.getColeccionPagos(facturaId);
    const pagosSnap = await getDocs(pagosRef);
    pagosSnap.forEach((pagoDoc) => {
      batch.delete(pagoDoc.ref);
    });

    // Actualizar estadísticas del proveedor
    const proveedorRef = this.getDocumentoProveedor(facturaData.proveedorId);
    const decrementoPagado = facturaData.montoPagado || 0;
    const decrementoPendiente = facturaData.monto - decrementoPagado;

    batch.update(proveedorRef, {
      deuda_total: increment(-facturaData.monto),
      pagado: increment(-decrementoPagado),
      pendiente: increment(-decrementoPendiente),
      ultima_modificacion: serverTimestamp(),
    });

    // Eliminar factura
    batch.delete(facturaRef);

    await batch.commit();

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
        factura.estado !== 'pagada' && factura.fechaVencimiento && factura.fechaVencimiento < ahora
    );
  }

  getFacturasPendientes(): FacturaProveedor[] {
    return this.facturasSignal().filter((factura) => factura.estado === 'pendiente');
  }

  getDeudaTotal(): number {
    return this.facturasSignal()
      .filter((factura) => factura.estado !== 'pagada')
      .reduce((sum, factura) => {
        const pagado = factura.pagos?.reduce((pSum, pago) => pSum + pago.monto, 0) || 0;
        return sum + (factura.monto - pagado);
      }, 0);
  }
}
