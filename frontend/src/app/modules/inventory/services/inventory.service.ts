import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  CollectionReference,
  DocumentData,
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
import { Observable, from, of } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Producto {
  codigo: string;
  nombre: string;
  cantidad: string;
  valor: string;
  eliminado: boolean;
  ultima_modificacion: Date | string;
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private productos: Producto[] = [];
  private historialMovimientos: { [codigo: string]: any[] } = {};

  constructor(private firestore: Firestore, private auth: Auth) {}

  private get userId(): string | undefined {
    return this.auth.currentUser?.uid;
  }

  private get productosCollection(): CollectionReference<DocumentData> | undefined {
    if (!this.userId) return undefined;
    return collection(this.firestore, `usuarios/${this.userId}/productos`);
  }

  getProductos(): Observable<Producto[]> {
    if (!this.productosCollection) throw new Error('Usuario no autenticado');
    const q = query(this.productosCollection, where('eliminado', '==', false));
    return collectionData(q, { idField: 'codigo' }) as Observable<Producto[]>;
  }

  async addProducto(producto: Producto): Promise<void> {
    if (!this.productosCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.productosCollection, producto.codigo);
    await setDoc(ref, {
      ...producto,
      eliminado: false,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async updateProducto(producto: Producto): Promise<void> {
    if (!this.productosCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.productosCollection, producto.codigo);
    await updateDoc(ref, {
      ...producto,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async deleteProducto(codigo: string): Promise<void> {
    if (!this.productosCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.productosCollection, codigo);
    await updateDoc(ref, {
      eliminado: true,
      ultima_modificacion: serverTimestamp(),
    });
  }

  async getProductoByCodigo(codigo: string): Promise<Producto | undefined> {
    if (!this.productosCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.productosCollection, codigo);
    const snapshot = await getDocs(query(this.productosCollection, where('codigo', '==', codigo)));
    return snapshot.empty ? undefined : (snapshot.docs[0].data() as Producto);
  }

  adjustStock(
    codigo: string,
    cantidad: number,
    tipo: 'entrada' | 'salida',
    motivo?: string
  ): Observable<void> {
    if (!this.productosCollection) {
      throw new Error('Usuario no autenticado');
    }

    const producto = this.productos.find((p) => p.codigo === codigo);
    if (!producto) {
      throw new Error('Producto no encontrado');
    }

    const ajuste = tipo === 'entrada' ? cantidad : -cantidad;
    const nuevaCantidad = Number(producto.cantidad) + ajuste;

    if (nuevaCantidad < 0) {
      throw new Error('El ajuste no puede resultar en un stock negativo');
    }

    producto.cantidad = String(nuevaCantidad);

    // Registrar el movimiento en el historial
    if (!this.historialMovimientos[codigo]) {
      this.historialMovimientos[codigo] = [];
    }
    this.historialMovimientos[codigo].push({
      fecha: new Date(),
      tipo,
      cantidad,
      motivo: motivo || 'Sin motivo',
    });

    // Actualizar en Firestore
    const ref = doc(this.productosCollection, codigo);
    return from(
      updateDoc(ref, {
        cantidad: producto.cantidad,
        ultima_modificacion: serverTimestamp(),
      })
    ).pipe(map(() => undefined));
  }

  getHistorialMovimientos(codigo: string): Observable<any[]> {
    return of(this.historialMovimientos[codigo] || []);
  }
}
