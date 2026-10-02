import { Injectable } from '@angular/core';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { assertAdministrativeTestWriteEnabled, isAdministrativeTestWriteEnabled } from '../../../core/integration/local-real-firestore-test.policy';

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

  constructor(private firestore: Firestore, private businessContext: BusinessContextService) {}

  /** The mobile client may later replace this document with an absolute stock value. */
  get sharedProductWritesEnabled(): boolean {
    const context = this.businessContext.context();
    return isAdministrativeTestWriteEnabled(context.status === 'signed-out' ? null : context.ownerUid);
  }

  private get userId(): string {
    return this.businessContext.requireOwnerUid();
  }

  private get productosCollection(): CollectionReference<DocumentData> | undefined {
    return collection(this.firestore, `usuarios/${this.userId}/productos`);
  }

  getProductos(): Observable<Producto[]> {
    if (!this.productosCollection) throw new Error('Usuario no autenticado');
    const q = query(this.productosCollection, where('eliminado', '==', false));
    return collectionData(q, { idField: 'codigo' }) as Observable<Producto[]>;
  }

  async addProducto(producto: Producto): Promise<void> {
    const normalized = this.normalizeProduct(producto);
    const reference = doc(this.productosCollection!, normalized.codigo);
    await runTransaction(this.firestore, async (transaction) => {
      this.assertTestProductWrite();
      if ((await transaction.get(reference)).exists()) {
        throw new Error(`Ya existe un producto con el código ${normalized.codigo}.`);
      }
      transaction.set(reference, {
        ...normalized,
        eliminado: false,
        ultima_modificacion: serverTimestamp(),
      });
    });
  }

  async updateProducto(producto: Producto): Promise<void> {
    const normalized = this.normalizeProduct(producto);
    const reference = doc(this.productosCollection!, normalized.codigo);
    await runTransaction(this.firestore, async (transaction) => {
      this.assertTestProductWrite();
      if (!(await transaction.get(reference)).exists()) {
        throw new Error('No se encontró el producto que intenta editar.');
      }
      transaction.set(reference, {
        ...normalized,
        ultima_modificacion: serverTimestamp(),
      }, { merge: true });
    });
  }

  async deleteProducto(codigo: string): Promise<void> {
    const normalizedCode = codigo.trim();
    if (!normalizedCode) throw new Error('El código del producto es obligatorio.');
    const reference = doc(this.productosCollection!, normalizedCode);
    await runTransaction(this.firestore, async (transaction) => {
      this.assertTestProductWrite();
      if (!(await transaction.get(reference)).exists()) {
        throw new Error('No se encontró el producto que intenta eliminar.');
      }
      transaction.set(reference, {
        eliminado: true,
        ultima_modificacion: serverTimestamp(),
      }, { merge: true });
    });
  }

  async getProductoByCodigo(codigo: string): Promise<Producto | undefined> {
    if (!this.productosCollection) throw new Error('Usuario no autenticado');
    const ref = doc(this.productosCollection, codigo);
    const snapshot = await getDocs(query(this.productosCollection, where('codigo', '==', codigo)));
    return snapshot.empty ? undefined : (snapshot.docs[0].data() as Producto);
  }

  async adjustStock(
    codigo: string,
    cantidad: number,
    tipo: 'entrada' | 'salida',
    motivo?: string
  ): Promise<void> {
    const normalizedCode = codigo.trim();
    if (!normalizedCode || !Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error('El ajuste requiere código y una cantidad positiva.');
    }
    if (motivo !== undefined && motivo.trim().length > 500) {
      throw new Error('El motivo del ajuste no puede superar 500 caracteres.');
    }
    const reference = doc(this.productosCollection!, normalizedCode);
    await runTransaction(this.firestore, async (transaction) => {
      this.assertTestProductWrite();
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('No se encontró el producto para ajustar.');
      const current = Number(snapshot.data()['cantidad']);
      if (!Number.isFinite(current)) {
        throw new Error('La cantidad actual del producto no es válida para un ajuste manual.');
      }
      const next = tipo === 'entrada' ? current + cantidad : current - cantidad;
      if (next < 0) throw new Error('La salida no puede dejar el producto con cantidad negativa.');
      transaction.set(reference, {
        cantidad: String(next),
        ultima_modificacion: serverTimestamp(),
      }, { merge: true });
    });
  }

  getHistorialMovimientos(codigo: string): Observable<any[]> {
    return of(this.historialMovimientos[codigo] || []);
  }

  private assertTestProductWrite(): void {
    assertAdministrativeTestWriteEnabled(this.userId);
  }

  private normalizeProduct(producto: Producto): Pick<Producto, 'codigo' | 'nombre' | 'cantidad' | 'valor'> {
    const codigo = producto.codigo?.trim();
    const nombre = producto.nombre?.trim();
    const cantidad = String(producto.cantidad ?? '').trim();
    const valor = String(producto.valor ?? '').trim();
    if (!codigo || !nombre) throw new Error('El producto requiere código y nombre.');
    if (!this.isNonNegativeDecimal(cantidad) || !this.isNonNegativeDecimal(valor)) {
      throw new Error('Cantidad y valor deben ser números decimales no negativos.');
    }
    return { codigo, nombre, cantidad, valor };
  }

  private isNonNegativeDecimal(value: string): boolean {
    const numeric = Number(value);
    return value.length > 0 && Number.isFinite(numeric) && numeric >= 0;
  }
}
