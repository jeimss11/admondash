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
import { Observable } from 'rxjs';

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
    return collectionData(q, { idField: 'id' }) as Observable<Venta[]>;
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
    const ref = doc(this.ventasCollection, venta.id!);
    await updateDoc(ref, {
      ...venta,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async deleteVenta(id: string): Promise<void> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.ventasCollection, id);
    await updateDoc(ref, {
      eliminado: true,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async getVentaById(id: string): Promise<Venta | undefined> {
    if (!this.ventasCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.ventasCollection, id);
    const snapshot = await getDocs(query(this.ventasCollection, where('id', '==', id)));
    return snapshot.empty ? undefined : (snapshot.docs[0].data() as Venta);
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
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);

    const q = query(
      this.ventasCollection,
      where('eliminado', '==', false),
      where('fecha', '>=', inicioDia),
      where('fecha', '<', finDia)
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
    const ventas = (await this.getVentas().toPromise()) || [];

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    const ventasHoy = ventas.filter((v) => {
      // Parsear fecha desde string (formato: dd-mm-yyyy o yyyy-mm-dd)
      const fechaStr = v.fecha2 || v.fecha;
      const fechaVenta = new Date(fechaStr);
      return fechaVenta >= inicioDia;
    });

    const ventasMes = ventas.filter((v) => {
      // Parsear fecha desde string (formato: dd-mm-yyyy o yyyy-mm-dd)
      const fechaStr = v.fecha2 || v.fecha;
      const fechaVenta = new Date(fechaStr);
      return fechaVenta >= inicioMes;
    });

    // Calcular totales sumando los totales de todos los productos de cada venta
    const totalHoy = ventasHoy.reduce((sum, v) => {
      const ventaTotal = v.productos.reduce((prodSum, prod) => prodSum + parseFloat(prod.total), 0);
      return sum + ventaTotal;
    }, 0);

    const totalMes = ventasMes.reduce((sum, v) => {
      const ventaTotal = v.productos.reduce((prodSum, prod) => prodSum + parseFloat(prod.total), 0);
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
