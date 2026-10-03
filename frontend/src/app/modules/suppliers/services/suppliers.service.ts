import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BusinessContextService } from '../../../core/integration/business-context.service';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  addDoc,
  collection,
  doc,
  docData,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, filter, map, takeUntil } from 'rxjs';
import {
  CreateSupplierDto,
  Supplier,
  UpdateSupplierDto,
} from '../models/supplier.models';

@Injectable({
  providedIn: 'root',
})
export class SuppliersService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private businessContext = inject(BusinessContextService);
  private loadRevision = 0;
  constructor() {
    this.businessContext.context$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.loadRevision++;
      this.suppliersSignal.set([]);
      this.loadingSignal.set(false);
      this.refreshError.set(null);
    });
  }

  // Signals para estado reactivo
  private suppliersSignal = signal<Supplier[]>([]);
  private loadingSignal = signal(false);
  readonly refreshError = signal<string | null>(null);

  // Getters públicos
  readonly suppliers = this.suppliersSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly suppliers$ = toObservable(this.suppliersSignal);

  private getUserSuppliersCollection() {
    const userId = this.businessContext.requireOwnerUid();
    if (!userId) throw new Error('Usuario no autenticado');
    return collection(this.firestore, `usuarios/${userId}/proveedores`);
  }

  private getSupplierDoc(supplierId: string) {
    const userId = this.businessContext.requireOwnerUid();
    if (!userId) throw new Error('Usuario no autenticado');
    return doc(this.firestore, `usuarios/${userId}/proveedores/${supplierId}`);
  }

  async loadSuppliers(): Promise<void> {
    this.refreshError.set(null);
    const revision = ++this.loadRevision;
    this.loadingSignal.set(true);
    try {
      const suppliersRef = this.getUserSuppliersCollection();
      const q = query(suppliersRef, orderBy('proveedor', 'asc'));

      // Ejecutar la consulta
      const snapshot = await getDocs(q);
      const suppliers = snapshot.docs.map(
        (doc) =>
          ({
            ...doc.data(),
            id: doc.id,
            ultima_modificacion: doc.data()['ultima_modificacion']?.toDate() || new Date(),
          } as Supplier)
      );

      if (revision === this.loadRevision) this.suppliersSignal.set(suppliers);
    } catch (error) {
      console.error('Error loading suppliers:', error);
      throw error;
    } finally {
      if (revision === this.loadRevision) this.loadingSignal.set(false);
    }
  }

  async createSupplier(dto: CreateSupplierDto): Promise<string> {
    const suppliersRef = this.getUserSuppliersCollection();

    // Solo guardar información básica del proveedor
    const supplierData: any = {
      proveedor: dto.proveedor,
      contacto: dto.contacto,
      estado: 'activo' as const,
      deuda_total: 0,
      pagado: 0,
      pendiente: 0,
      ultima_modificacion: serverTimestamp(),
    };

    // Agregar campos opcionales solo si tienen valor
    if (dto.email) supplierData.email = dto.email;
    if (dto.telefono) supplierData.telefono = dto.telefono;
    if (dto.direccion && dto.direccion.calle) {
      supplierData.direccion = {
        calle: dto.direccion.calle,
        ciudad: dto.direccion.ciudad || '',
        departamento: dto.direccion.departamento || '',
        codigo_postal: dto.direccion.codigo_postal || '',
        pais: dto.direccion.pais || 'Colombia',
      };
    }

    const docRef = await addDoc(suppliersRef, supplierData);

    // Recargar lista
    await this.refreshAfterCommit();

    return docRef.id;
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto): Promise<void> {
    const supplierRef = this.getSupplierDoc(id);

    // Limpiar campos undefined/null antes de enviar a Firestore
    const updateData: any = {
      ultima_modificacion: serverTimestamp(),
    };

    // Agregar campos solo si tienen valor (no undefined/null)
    if (dto.proveedor !== undefined) updateData.proveedor = dto.proveedor;
    if (dto.contacto !== undefined) updateData.contacto = dto.contacto;
    if (dto.email !== undefined && dto.email !== null) updateData.email = dto.email;
    if (dto.telefono !== undefined && dto.telefono !== null) updateData.telefono = dto.telefono;
    if (dto.direccion !== undefined && dto.direccion !== null) {
      updateData.direccion = {
        calle: dto.direccion.calle || '',
        ciudad: dto.direccion.ciudad || '',
        departamento: dto.direccion.departamento || '',
        codigo_postal: dto.direccion.codigo_postal || '',
        pais: dto.direccion.pais || 'Colombia',
      };
    }
    if (dto.estado !== undefined) updateData.estado = dto.estado;

    await updateDoc(supplierRef, updateData);

    // Recargar lista
    await this.refreshAfterCommit();
  }

  async deleteSupplier(id: string): Promise<void> {
    const supplierRef = this.getSupplierDoc(id);
    // Supplier invoices and payments reference this document. A physical delete
    // would orphan that history and make balances impossible to reconcile.
    await updateDoc(supplierRef, {
      estado: 'inactivo',
      ultima_modificacion: serverTimestamp(),
    });

    // Keep the archived supplier visible to historical invoices and reports.
    await this.refreshAfterCommit();
  }

  private async refreshAfterCommit(): Promise<void> {
    try { await this.loadSuppliers(); }
    catch { this.refreshError.set('El proveedor se guardó, pero la lista no pudo actualizarse. Pulsa Actualizar.'); }
  }

  getSupplierById(id: string): Observable<Supplier | null> {
    const supplierRef = this.getSupplierDoc(id);
    const initial = this.businessContext.context();
    return docData(supplierRef, { idField: 'id' }).pipe(
      takeUntil(this.businessContext.context$.pipe(filter(current =>
        current.status === 'signed-out' || initial.status === 'signed-out' ||
        current.ownerUid !== initial.ownerUid || current.actorUid !== initial.actorUid))),
      map((data) => {
        if (!data) return null;

        const supplierData = data as any; // Type assertion for Firestore data
        return {
          ...supplierData,
          ultima_modificacion: supplierData.ultima_modificacion?.toDate() || new Date(),
        } as Supplier;
      })
    );
  }

  searchSuppliers(searchTerm: string): Supplier[] {
    const suppliers = this.suppliersSignal();
    const term = searchTerm.toLowerCase();

    return suppliers.filter(
      (supplier) =>
        supplier.proveedor.toLowerCase().includes(term) ||
        supplier.contacto.toLowerCase().includes(term) ||
        supplier.email?.toLowerCase().includes(term)
    );
  }
}
