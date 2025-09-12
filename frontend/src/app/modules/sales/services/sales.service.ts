import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
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
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, catchError, firstValueFrom, of } from 'rxjs';

export interface Venta {
  id?: string;
  factura: string; // Cambiado de numeroFactura a factura para coincidir con Firestore
  cliente: string;
  productos: VentaProducto[];
  descuento: string; // Cambiado a string para coincidir con Firestore
  eliminado: boolean;
  fecha: string; // Cambiado a string para coincidir con Firestore
  fecha2: string; // Campo adicional que existe en Firestore
  ultima_modificacion: Date | string | FieldValue;
}

export interface VentaProducto {
  nombre: string;
  cantidad: string; // Cambiado a string para coincidir con Firestore
  precio: string; // Cambiado de precioUnitario a precio para coincidir con Firestore
  subtotal: string; // Campo adicional que existe en Firestore
  total: string; // Cambiado a string para coincidir con Firestore
}

@Injectable({ providedIn: 'root' })
export class SalesService {
  private ventas: Venta[] = [];

  constructor(private firestore: Firestore, private auth: Auth) {}

  private get userId(): string | undefined {
    return this.auth.currentUser?.uid;
  }

  private get ventasCollection(): CollectionReference<DocumentData> | undefined {
    if (!this.userId) return undefined;
    return collection(this.firestore, `usuarios/${this.userId}/ventas_appweb`);
  }

  getVentas(): Observable<Venta[]> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');
    const q = query(this.ventasCollection, where('eliminado', '==', false));
    return collectionData(q, { idField: 'factura' }) as Observable<Venta[]>;
  }

  async addVenta(
    venta: Omit<Venta, 'id' | 'fecha' | 'fecha2' | 'eliminado' | 'ultima_modificacion'>
  ): Promise<void> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');

    const fechaActual = new Date();
    const nuevaVenta: Venta = {
      ...venta,
      fecha: fechaActual.toLocaleDateString('es-ES').replace(/\//g, '-'), // Formato: dd-mm-yyyy
      fecha2: fechaActual.toISOString().split('T')[0], // Formato: yyyy-mm-dd
      eliminado: false,
      ultima_modificacion: serverTimestamp(),
    };

    const docRef = doc(this.ventasCollection);
    await setDoc(docRef, nuevaVenta);
  }

  async updateVenta(venta: Venta): Promise<void> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');
    const docRef = await this.findDocByFactura(this.ventasCollection, venta.factura);
    await updateDoc(docRef, {
      ...venta,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async deleteVenta(factura: string): Promise<void> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');
    const docRef = await this.findDocByFactura(this.ventasCollection, factura);
    await updateDoc(docRef, {
      eliminado: true,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async getVentaById(factura: string): Promise<Venta | undefined> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');
    const q = query(this.ventasCollection, where('factura', '==', factura));
    const snapshot = await getDocs(q);
    return snapshot.empty
      ? undefined
      : ({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Venta);
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
    const fecha = new Date();
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');

    // Obtener el último número de factura del día
    const ventasHoy = await this.getVentasHoy();
    const ultimoNumero = ventasHoy.length + 1;

    return `F${year}${month}${day}${String(ultimoNumero).padStart(3, '0')}`;
  }

  private async getVentasHoy(): Promise<Venta[]> {
    if (!this.ventasCollection) return [];

    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${year}-${month}-${day}`;

    // Para mañana (fin del día de hoy)
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const yearManana = manana.getFullYear();
    const monthManana = String(manana.getMonth() + 1).padStart(2, '0');
    const dayManana = String(manana.getDate()).padStart(2, '0');
    const fechaManana = `${yearManana}-${monthManana}-${dayManana}`;

    const q = query(
      this.ventasCollection,
      where('eliminado', '==', false),
      where('fecha2', '>=', fechaHoy),
      where('fecha2', '<', fechaManana)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Venta));
  }

  // Estadísticas de ventas
  async getEstadisticasVentas(): Promise<{
    ventasHoy: number;
    totalHoy: number;
    ventasMes: number;
    totalMes: number;
  }> {
    const ventas = await firstValueFrom(this.getVentas().pipe(catchError(() => of([]))));

    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${year}-${month}-${day}`;

    // Inicio del mes
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const yearMes = inicioMes.getFullYear();
    const monthMes = String(inicioMes.getMonth() + 1).padStart(2, '0');
    const dayMes = String(inicioMes.getDate()).padStart(2, '0');
    const fechaInicioMes = `${yearMes}-${monthMes}-${dayMes}`;

    const ventasHoy = ventas.filter((v: Venta) => v.fecha2 >= fechaHoy);
    const ventasMes = ventas.filter((v: Venta) => v.fecha2 >= fechaInicioMes);

    // Calcular totales sumando los totales de todos los productos de cada venta
    const totalHoy = ventasHoy.reduce((sum: number, v: Venta) => {
      const ventaTotal = v.productos.reduce(
        (prodSum: number, prod: VentaProducto) => prodSum + parseFloat(prod.total),
        0
      );
      return sum + ventaTotal;
    }, 0);

    const totalMes = ventasMes.reduce((sum: number, v: Venta) => {
      const ventaTotal = v.productos.reduce(
        (prodSum: number, prod: VentaProducto) => prodSum + parseFloat(prod.total),
        0
      );
      return sum + ventaTotal;
    }, 0);

    return {
      ventasHoy: ventasHoy.length,
      totalHoy,
      ventasMes: ventasMes.length,
      totalMes,
    };
  }
}
