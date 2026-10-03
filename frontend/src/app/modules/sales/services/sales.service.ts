import { Injectable } from '@angular/core';
import {
  CollectionReference,
  DocumentData,
  FieldValue,
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { OperatorSessionService } from '../../../core/integration/operator-session.service';
import { businessDate, businessDisplayDate, businessMonthStart } from '../../../core/integration/business-date';
import { createWebInvoiceNumber, webSaleDocumentId, validateWebSaleAmounts } from './web-sale.policy';
import { readWebSaleReportRecord } from '../../../core/integration/web-sales-report.contract';
import { createWebSaleWithStock, cancelWebSaleWithStock } from './web-sale-stock.transaction';

export interface Venta {
  id?: string;
  factura: string; // Cambiado de numeroFactura a factura para coincidir con Firestore
  cliente: string;
  productos: VentaProducto[];
  descuento: string; // Cambiado a string para coincidir con Firestore
  discountType?: 'percentage' | 'amount';
  discountAmount?: string;
  subtotal?: string;
  total?: string;
  ownerUid?: string;
  createdByUid?: string;
  /** Same seller identifier used by impresora: admon, seller1, seller2 or seller3. */
  role?: string;
  source?: 'web';
  createdAt?: FieldValue;
  eliminado: boolean;
  // IMPORTANTE: fecha es solo para VISUALIZACIÓN (formato: dd-mm-yyyy)
  // Para operaciones de filtrado, comparación y consultas, usar SIEMPRE fecha2
  fecha: string; // Formato: dd-mm-yyyy (ejemplo: 22-12-2025) - SOLO VISUALIZACIÓN
  fecha2: string; // Formato: yyyy-mm-dd (ejemplo: 2025-12-22) - USAR PARA FILTRADO Y OPERACIONES
  ultima_modificacion: Date | string | FieldValue;
}

export interface VentaProducto {
  /** Código estable del mismo catálogo compartido con impresora. */
  codigo?: string;
  nombre: string;
  cantidad: string; // Cambiado a string para coincidir con Firestore
  precio: string; // Cambiado de precioUnitario a precio para coincidir con Firestore
  subtotal: string; // Campo adicional que existe en Firestore
  total: string; // Cambiado a string para coincidir con Firestore
}

@Injectable({ providedIn: 'root' })
export class SalesService {
  constructor(
    private firestore: Firestore,
    private businessContext: BusinessContextService,
    private operatorSession: OperatorSessionService
  ) {}

  private get ownerUid(): string {
    return this.businessContext.requireOwnerUid();
  }

  private get ventasCollection(): CollectionReference<DocumentData> | undefined {
    return collection(this.firestore, `usuarios/${this.ownerUid}/ventas_appweb`);
  }

  getVentas(): Observable<Venta[]> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');
    const q = query(this.ventasCollection, where('eliminado', '==', false));
    return collectionData(q, { idField: 'id' }) as Observable<Venta[]>;
  }

  async addVenta(
    venta: Omit<Venta, 'id' | 'fecha' | 'fecha2' | 'eliminado' | 'ultima_modificacion'>
  ): Promise<'created' | 'already-exists'> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');

    validateWebSaleAmounts(venta);
    const fechaActual = new Date();
    const ownerUid = this.ownerUid;
    const context = this.businessContext.context();
    const actorUid = context.status === 'signed-out' ? ownerUid : context.actorUid;
    const operator = this.requireOperator();
    const assertSession = this.captureSession(ownerUid, actorUid, operator.id);
    const nuevaVenta: Venta = {
      ...venta,
      fecha: businessDisplayDate(fechaActual).replace(/\//g, '-'),
      fecha2: businessDate(fechaActual),
      eliminado: false,
      ownerUid,
      createdByUid: actorUid,
      role: operator.id,
      source: 'web',
      ultima_modificacion: serverTimestamp(),
    };

    // A retry of the same logical invoice targets the same web-only document.
    // This is intentionally unrelated to the document IDs used by mobile ventas.
    return createWebSaleWithStock(this.firestore, ownerUid, webSaleDocumentId(venta.factura), nuevaVenta, assertSession);
  }

  async updateVenta(venta: Venta): Promise<void> {
    validateWebSaleAmounts(venta);
    const ownerUid = this.ownerUid;
    const context = this.businessContext.context();
    if (context.status === 'signed-out') throw new Error('Usuario no autenticado');
    const operator = this.requireOperator();
    const assertSession = this.captureSession(ownerUid, context.actorUid, operator.id);
    const saleCollection = collection(this.firestore, `usuarios/${ownerUid}/ventas_appweb`);
    const { id, ...data } = venta;
    const docRef = id ? doc(saleCollection, id) : await this.findDocByFactura(saleCollection, venta.factura);
    await runTransaction(this.firestore, async transaction => {
      assertSession();
      const current = await transaction.get(docRef);
      if (!current.exists()) throw new Error('La venta ya no existe.');
      const persisted = current.data() as DocumentData;
      if (persisted['stockImpact']) throw new Error('Una venta que descontó inventario no puede editarse. Anúlala y registra la venta corregida.');
      if (persisted['eliminado'] === true) throw new Error('Una venta anulada no puede editarse.');
      if (persisted['factura'] !== venta.factura || persisted['ownerUid'] !== venta.ownerUid ||
          persisted['createdByUid'] !== venta.createdByUid || persisted['source'] !== venta.source) {
        throw new Error('La identidad y autoría de una venta existente no pueden cambiarse.');
      }
      if ('stockImpact' in data || 'stockReversal' in data) throw new Error('No se puede modificar la evidencia de inventario.');
      assertSession();
      transaction.update(docRef, { ...data, ultima_modificacion: serverTimestamp() });
    });
  }

  async deleteVenta(venta: Pick<Venta, 'id' | 'factura'>): Promise<void> {
    const ownerUid = this.ownerUid;
    const context = this.businessContext.context();
    if (context.status === 'signed-out') throw new Error('Usuario no autenticado');
    const operator = this.requireOperator();
    const assertSession = this.captureSession(ownerUid, context.actorUid, operator.id);
    const saleCollection = collection(this.firestore, `usuarios/${ownerUid}/ventas_appweb`);
    const docRef = venta.id
      ? doc(saleCollection, venta.id)
      : await this.findDocByFactura(saleCollection, venta.factura);
    assertSession();
    await cancelWebSaleWithStock(this.firestore, ownerUid, docRef.id, context.actorUid, operator.id, assertSession);
  }

  async getVentaById(factura: string): Promise<Venta | undefined> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');
    const q = query(this.ventasCollection, where('factura', '==', factura));
    const snapshot = await getDocs(q);
    if (snapshot.size > 1) throw new Error('Hay varias ventas con esa factura. Revisa el registro antes de continuar.');
    return snapshot.empty
      ? undefined
      : ({ ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as Venta);
  }

  // Método auxiliar para encontrar documento por número de factura
  private async findDocByFactura(
    collection: CollectionReference<DocumentData>,
    factura: string
  ): Promise<any> {
    const q = query(collection, where('factura', '==', factura));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      throw new Error(`No se encontró venta con factura: ${factura}`);
    }

    if (snapshot.size > 1) {
      throw new Error(`Múltiples ventas encontradas con factura: ${factura}`);
    }

    return snapshot.docs[0].ref;
  }

  // Método para generar número de factura único
  async generarNumeroFactura(): Promise<string> {
    const entropy = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}${Math.random()}`;
    return createWebInvoiceNumber(Date.now(), entropy);
  }

  // IMPORTANTE: Este método usa fecha2 para filtrado porque tiene formato yyyy-mm-dd
  // que es compatible con comparaciones de strings y consultas de Firestore
  private async getVentasHoy(): Promise<Venta[]> {
    if (!this.ventasCollection) return [];

    const fechaHoy = businessDate();

    // Filtrar por fecha2 (formato yyyy-mm-dd) para operaciones correctas
    const q = query(
      this.ventasCollection,
      where('eliminado', '==', false),
      where('fecha2', '==', fechaHoy)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Venta));
  }

  // Estadísticas de ventas
  // IMPORTANTE: Usa fecha2 para todas las operaciones de filtrado y comparación
  async getEstadisticasVentas(loadedSales?: Venta[]): Promise<{
    ventasHoy: number;
    totalHoy: number;
    ventasMes: number;
    totalMes: number;
  }> {
    const ventas = loadedSales ?? await firstValueFrom(this.getVentas());

    const fechaHoy = businessDate();
    const fechaInicioMes = businessMonthStart();

    // Filtrar por fecha2 (formato yyyy-mm-dd) para operaciones correctas
    const ventasHoy = ventas.filter((v: Venta) => v.fecha2 === fechaHoy);
    const ventasMes = ventas.filter((v: Venta) => v.fecha2 >= fechaInicioMes && v.fecha2 <= fechaHoy);

    // Calcular totales sumando los totales de todos los productos de cada venta
    const totalHoy = ventasHoy.reduce((sum: number, v: Venta) => {
      const record = readWebSaleReportRecord(v.id ?? v.factura, v);
      if (record.total === null) throw new Error('Hay ventas sin total verificable. Revisa el reporte de datos.');
      const ventaTotal = Number(record.total);
      return sum + ventaTotal;
    }, 0);

    const totalMes = ventasMes.reduce((sum: number, v: Venta) => {
      const record = readWebSaleReportRecord(v.id ?? v.factura, v);
      if (record.total === null) throw new Error('Hay ventas sin total verificable. Revisa el reporte de datos.');
      const ventaTotal = Number(record.total);
      return sum + ventaTotal;
    }, 0);

    return {
      ventasHoy: ventasHoy.length,
      totalHoy,
      ventasMes: ventasMes.length,
      totalMes,
    };
  }

  private requireOperator() {
    const operator = this.operatorSession.active();
    if (!operator) throw new Error('Selecciona un usuario operativo antes de registrar cambios.');
    return operator;
  }

  private captureSession(ownerUid: string, actorUid: string, role: string): () => void {
    return () => {
      const current = this.businessContext.context();
      if (current.status === 'signed-out' || current.ownerUid !== ownerUid || current.actorUid !== actorUid ||
          this.operatorSession.active()?.id !== role) {
        throw new Error('La sesión o el usuario operativo cambió. Revisa la operación antes de continuar.');
      }
    };
  }
}
