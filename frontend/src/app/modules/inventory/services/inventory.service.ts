import { Injectable } from '@angular/core';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, of, startWith, switchMap } from 'rxjs';
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
    return this.businessContext.context$.pipe(switchMap((context) => {
      if (context.status === 'signed-out') return of([] as Producto[]);
      const q = query(collection(this.firestore, `usuarios/${context.ownerUid}/productos`), where('eliminado', '==', false));
      return (collectionData(q, { idField: 'codigo' }) as Observable<Producto[]>).pipe(startWith([] as Producto[]));
    }));
  }

  async addProducto(producto: Producto): Promise<void> {
    const ownerUid = this.userId;
    const normalized = this.normalizeProduct(producto);
    const reference = doc(this.productosCollection!, normalized.codigo);
    await runTransaction(this.firestore, async (transaction) => {
      this.assertTestProductWrite(ownerUid);
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
    const ownerUid = this.userId;
    const normalized = this.normalizeProduct(producto);
    const reference = doc(this.productosCollection!, normalized.codigo);
    await runTransaction(this.firestore, async (transaction) => {
      this.assertTestProductWrite(ownerUid);
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
    const ownerUid = this.userId;
    const normalizedCode = codigo.trim();
    if (!normalizedCode) throw new Error('El código del producto es obligatorio.');
    const reference = doc(this.productosCollection!, normalizedCode);
    await runTransaction(this.firestore, async (transaction) => {
      this.assertTestProductWrite(ownerUid);
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
    const ownerUid = this.userId;
    const normalizedCode = codigo.trim();
    if (!normalizedCode || normalizedCode.includes('/')) throw new Error('El código del producto no es válido.');
    const snapshot = await getDoc(doc(this.firestore, `usuarios/${ownerUid}/productos/${normalizedCode}`));
    if (this.userId !== ownerUid) throw new Error('La sesión cambió durante la consulta.');
    return snapshot.exists() ? { ...snapshot.data(), codigo: snapshot.id } as Producto : undefined;
  }

  async adjustStock(
    codigo: string,
    cantidad: number,
    tipo: 'entrada' | 'salida',
    motivo?: string
  ): Promise<void> {
    const ownerUid = this.userId;
    const normalizedCode = codigo.trim();
    if (!normalizedCode || !Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error('El ajuste requiere código y una cantidad positiva.');
    }
    if (tipo !== 'entrada' && tipo !== 'salida') throw new Error('El tipo de ajuste no es válido.');
    if (motivo !== undefined && motivo.trim().length > 500) {
      throw new Error('El motivo del ajuste no puede superar 500 caracteres.');
    }
    const reference = doc(this.productosCollection!, normalizedCode);
    await runTransaction(this.firestore, async (transaction) => {
      this.assertTestProductWrite(ownerUid);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('No se encontró el producto para ajustar.');
      const rawQuantity = snapshot.data()['cantidad'];
      const current = Number(rawQuantity);
      if (rawQuantity === undefined || rawQuantity === null || String(rawQuantity).trim() === '' || !Number.isFinite(current)) {
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

  private assertTestProductWrite(expectedUid: string): void {
    if (this.userId !== expectedUid) throw new Error('La sesión cambió durante la operación.');
    assertAdministrativeTestWriteEnabled(expectedUid);
  }

  private normalizeProduct(producto: Producto): Pick<Producto, 'codigo' | 'nombre' | 'cantidad' | 'valor'> {
    const codigo = producto.codigo?.trim();
    const nombre = producto.nombre?.trim();
    const cantidad = String(producto.cantidad ?? '').trim();
    const valor = String(producto.valor ?? '').trim();
    if (!codigo || codigo.includes('/') || !nombre) throw new Error('El producto requiere código válido y nombre.');
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
