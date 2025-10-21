import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, map, tap } from 'rxjs';
import {
  CreateSupplierDto,
  Supplier,
  SupplierStats,
  UpdateSupplierDto,
} from '../models/supplier.models';

@Injectable({
  providedIn: 'root',
})
export class SuppliersService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  // Signals para estado reactivo
  private suppliersSignal = signal<Supplier[]>([]);
  private loadingSignal = signal(false);

  // Getters públicos
  readonly suppliers = this.suppliersSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly suppliers$ = toObservable(this.suppliersSignal);

  private getUserSuppliersCollection() {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('Usuario no autenticado');
    return collection(this.firestore, `usuarios/${userId}/proveedores`);
  }

  private getSupplierDoc(supplierId: string) {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('Usuario no autenticado');
    return doc(this.firestore, `usuarios/${userId}/proveedores/${supplierId}`);
  }

  async loadSuppliers(): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const suppliersRef = this.getUserSuppliersCollection();
      const q = query(suppliersRef, orderBy('proveedor', 'asc'));

      const suppliers$ = collectionData(q, { idField: 'id' }).pipe(
        map((docs) =>
          docs.map(
            (doc) =>
              ({
                ...doc,
                ultima_modificacion: doc['ultima_modificacion']?.toDate() || new Date(),
              } as Supplier)
          )
        ),
        tap((suppliers) => this.suppliersSignal.set(suppliers))
      );

      // Ejecutar la consulta
      const snapshot = await getDocs(q);
      const suppliers = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
            ultima_modificacion: doc.data()['ultima_modificacion']?.toDate() || new Date(),
          } as Supplier)
      );

      this.suppliersSignal.set(suppliers);
    } catch (error) {
      console.error('Error loading suppliers:', error);
      throw error;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async createSupplier(dto: CreateSupplierDto): Promise<string> {
    const suppliersRef = this.getUserSuppliersCollection();

    // Solo guardar información básica del proveedor
    const supplierData: any = {
      proveedor: dto.proveedor,
      contacto: dto.contacto,
      estado: 'activo' as const,
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
    await this.loadSuppliers();

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
    await this.loadSuppliers();
  }

  async deleteSupplier(id: string): Promise<void> {
    const supplierRef = this.getSupplierDoc(id);
    await deleteDoc(supplierRef);

    // Recargar lista
    await this.loadSuppliers();
  }

  getSupplierById(id: string): Observable<Supplier | null> {
    const supplierRef = this.getSupplierDoc(id);
    return docData(supplierRef, { idField: 'id' }).pipe(
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

  async updateSupplierStats(
    supplierId: string,
    stats: Partial<Pick<Supplier, 'deuda_total' | 'pagado' | 'pendiente'>>
  ): Promise<void> {
    const supplierRef = this.getSupplierDoc(supplierId);

    // Filtrar campos undefined
    const updateData: any = {
      ultima_modificacion: serverTimestamp(),
    };

    if (stats.deuda_total !== undefined) updateData.deuda_total = stats.deuda_total;
    if (stats.pagado !== undefined) updateData.pagado = stats.pagado;
    if (stats.pendiente !== undefined) updateData.pendiente = stats.pendiente;

    await updateDoc(supplierRef, updateData);

    // Actualizar en la lista local
    const currentSuppliers = this.suppliersSignal();
    const updatedSuppliers = currentSuppliers.map((supplier) =>
      supplier.id === supplierId
        ? { ...supplier, ...stats, ultima_modificacion: new Date() }
        : supplier
    );
    this.suppliersSignal.set(updatedSuppliers);
  }

  getSupplierStats(): SupplierStats {
    const suppliers = this.suppliersSignal();

    return {
      total_proveedores: suppliers.length,
      proveedores_activos: suppliers.filter((s) => s.estado === 'activo').length,
      deuda_total: suppliers.reduce((sum, s) => sum + (s.deuda_total || 0), 0),
      pagado_mes: 0, // TODO: Implementar cálculo mensual
      facturas_pendientes: suppliers.reduce((sum, s) => sum + ((s.pendiente || 0) > 0 ? 1 : 0), 0),
      facturas_vencidas: 0, // TODO: Implementar cálculo de vencidas
    };
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
