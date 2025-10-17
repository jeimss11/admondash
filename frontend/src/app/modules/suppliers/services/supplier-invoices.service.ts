import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  docData,
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
  PAYMENTS_SUBCOLLECTION,
  SUPPLIER_INVOICES_COLLECTION,
} from '../constants/suppliers.constants';
import {
  CreateInvoiceDto,
  InvoiceStatus,
  PaymentDto,
  SupplierInvoice,
} from '../models/supplier.models';

@Injectable({
  providedIn: 'root',
})
export class SupplierInvoicesService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  // Signals para estado reactivo
  private invoicesSignal = signal<SupplierInvoice[]>([]);
  private loadingSignal = signal(false);

  // Getters públicos
  readonly invoices = this.invoicesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  private getUserInvoicesCollection() {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('Usuario no autenticado');
    return collection(this.firestore, `usuarios/${userId}/${SUPPLIER_INVOICES_COLLECTION}`);
  }

  private getInvoiceDoc(invoiceId: string) {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('Usuario no autenticado');
    return doc(this.firestore, `usuarios/${userId}/${SUPPLIER_INVOICES_COLLECTION}/${invoiceId}`);
  }

  private getSupplierDoc(supplierId: string) {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('Usuario no autenticado');
    return doc(this.firestore, `usuarios/${userId}/proveedores/${supplierId}`);
  }

  private getPaymentsCollection(invoiceId: string) {
    const invoiceRef = this.getInvoiceDoc(invoiceId);
    return collection(invoiceRef, PAYMENTS_SUBCOLLECTION);
  }

  async loadInvoices(supplierId?: string): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const invoicesRef = this.getUserInvoicesCollection();
      let q = query(invoicesRef, orderBy('dueDate', 'asc'));

      if (supplierId) {
        q = query(invoicesRef, where('supplierId', '==', supplierId), orderBy('dueDate', 'asc'));
      }

      const snapshot = await getDocs(q);
      const invoices = snapshot.docs.map((doc) => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          ...data,
          dueDate: data.dueDate?.toDate() || new Date(),
          issueDate: data.issueDate?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as SupplierInvoice;
      });

      this.invoicesSignal.set(invoices);
    } catch (error) {
      console.error('Error loading invoices:', error);
      throw error;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async createInvoice(dto: CreateInvoiceDto): Promise<string> {
    const batch = writeBatch(this.firestore);
    const invoicesRef = this.getUserInvoicesCollection();

    const invoiceData = {
      ...dto,
      status: 'pending' as InvoiceStatus,
      issueDate: new Date(),
      payments: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const invoiceDocRef = doc(invoicesRef);
    batch.set(invoiceDocRef, invoiceData);

    // Actualizar estadísticas del proveedor
    const supplierRef = this.getSupplierDoc(dto.supplierId);
    batch.update(supplierRef, {
      deuda_total: increment(dto.amount),
      pendiente: increment(dto.amount),
      ultima_modificacion: serverTimestamp(),
    });

    await batch.commit();

    // Recargar facturas
    await this.loadInvoices();

    return invoiceDocRef.id;
  }

  async addPayment(invoiceId: string, paymentDto: PaymentDto): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Obtener la factura actual
    const invoiceRef = this.getInvoiceDoc(invoiceId);
    const invoiceSnap = await getDocs(query(collection(this.firestore, invoiceRef.path)));
    const invoiceData = invoiceSnap.docs[0]?.data() as any;

    if (!invoiceData) throw new Error('Factura no encontrada');

    // Crear el pago
    const paymentsRef = this.getPaymentsCollection(invoiceId);
    const paymentData = {
      amount: paymentDto.amount,
      date: new Date(),
      type: paymentDto.type,
      notes: paymentDto.notes,
      createdAt: serverTimestamp(),
    };

    const paymentDocRef = doc(paymentsRef);
    batch.set(paymentDocRef, paymentData);

    // Calcular nuevo estado de la factura
    const currentPaid =
      invoiceData.payments?.reduce((sum: number, p: any) => sum + p.amount, 0) || 0;
    const newTotalPaid = currentPaid + paymentDto.amount;
    const remainingAmount = invoiceData.amount - newTotalPaid;

    let newStatus: InvoiceStatus;
    if (remainingAmount <= 0) {
      newStatus = 'paid';
    } else if (newTotalPaid > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'pending';
    }

    // Actualizar factura
    batch.update(invoiceRef, {
      status: newStatus,
      payments: [...(invoiceData.payments || []), { ...paymentData, id: paymentDocRef.id }],
      updatedAt: serverTimestamp(),
    });

    // Actualizar estadísticas del proveedor
    const supplierRef = this.getSupplierDoc(invoiceData.supplierId);
    const paidIncrement = paymentDto.amount;
    const pendingDecrement =
      paymentDto.type === 'full' ? invoiceData.amount - currentPaid : paymentDto.amount;

    batch.update(supplierRef, {
      pagado: increment(paidIncrement),
      pendiente: increment(-pendingDecrement),
      ultima_modificacion: serverTimestamp(),
    });

    await batch.commit();

    // Recargar facturas
    await this.loadInvoices();
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Obtener datos de la factura antes de eliminar
    const invoiceRef = this.getInvoiceDoc(invoiceId);
    const invoiceSnap = await getDocs(query(collection(this.firestore, invoiceRef.path)));
    const invoiceData = invoiceSnap.docs[0]?.data() as any;

    if (invoiceData) {
      // Revertir estadísticas del proveedor
      const supplierRef = this.getSupplierDoc(invoiceData.supplierId);
      const unpaidAmount =
        invoiceData.amount -
        (invoiceData.payments?.reduce((sum: number, p: any) => sum + p.amount, 0) || 0);

      batch.update(supplierRef, {
        deuda_total: increment(-invoiceData.amount),
        pendiente: increment(-unpaidAmount),
        ultima_modificacion: serverTimestamp(),
      });
    }

    // Eliminar factura
    batch.delete(invoiceRef);

    await batch.commit();

    // Recargar facturas
    await this.loadInvoices();
  }

  getInvoiceById(invoiceId: string): Observable<SupplierInvoice | null> {
    const invoiceRef = this.getInvoiceDoc(invoiceId);
    return docData(invoiceRef, { idField: 'id' }).pipe(
      map((data) => {
        if (!data) return null;

        const invoiceData = data as any;
        return {
          ...invoiceData,
          dueDate: invoiceData.dueDate?.toDate() || new Date(),
          issueDate: invoiceData.issueDate?.toDate() || new Date(),
          createdAt: invoiceData.createdAt?.toDate() || new Date(),
          updatedAt: invoiceData.updatedAt?.toDate() || new Date(),
        } as SupplierInvoice;
      })
    );
  }

  getInvoicesBySupplier(supplierId: string): SupplierInvoice[] {
    return this.invoicesSignal().filter((invoice) => invoice.supplierId === supplierId);
  }

  getOverdueInvoices(): SupplierInvoice[] {
    const now = new Date();
    return this.invoicesSignal().filter(
      (invoice) => invoice.status !== 'paid' && invoice.dueDate < now
    );
  }

  getPendingInvoices(): SupplierInvoice[] {
    return this.invoicesSignal().filter((invoice) => invoice.status === 'pending');
  }

  getTotalDebt(): number {
    return this.invoicesSignal()
      .filter((invoice) => invoice.status !== 'paid')
      .reduce((sum, invoice) => {
        const paid = invoice.payments?.reduce((pSum, payment) => pSum + payment.amount, 0) || 0;
        return sum + (invoice.amount - paid);
      }, 0);
  }
}
