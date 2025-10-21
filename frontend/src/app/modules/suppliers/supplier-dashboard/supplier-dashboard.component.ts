import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FacturaProveedor, Supplier } from '../models/supplier.models';
import { SupplierAnalyticsService } from '../services/supplier-analytics.service';
import { SupplierInvoicesService } from '../services/supplier-invoices.service';
import { SuppliersService } from '../services/suppliers.service';
import { InvoiceDetailModalComponent } from '../shared/invoice-detail-modal/invoice-detail-modal.component';
import { InvoiceFormModalComponent } from '../shared/invoice-form-modal/invoice-form-modal.component';
import { SupplierInvoicesListComponent } from '../shared/supplier-invoices-list/supplier-invoices-list.component';

@Component({
  selector: 'app-supplier-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    SupplierInvoicesListComponent,
    InvoiceDetailModalComponent,
    InvoiceFormModalComponent,
  ],
  templateUrl: './supplier-dashboard.component.html',
  styleUrls: ['./supplier-dashboard.component.scss'],
})
export class SupplierDashboardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private suppliersService = inject(SuppliersService);
  private invoicesService = inject(SupplierInvoicesService);
  private analyticsService = inject(SupplierAnalyticsService);

  // Signals para estado
  supplier = signal<Supplier | null>(null);
  supplierInvoices = signal<FacturaProveedor[]>([]);
  loading = signal(false);
  selectedInvoice = signal<FacturaProveedor | null>(null);
  showInvoiceModal = signal(false);
  showNewInvoiceModal = signal(false);

  // Computed signals
  supplierStats = computed(() => {
    const supplier = this.supplier();
    const invoices = this.supplierInvoices();
    if (!supplier) return null;

    const paidInvoices = invoices.filter((inv) => inv.estado === 'pagada');
    const pendingInvoices = invoices.filter(
      (inv) => inv.estado === 'pendiente' || inv.estado === 'parcial'
    );
    const overdueInvoices = invoices.filter((inv) => inv.estado === 'vencida');

    return {
      totalInvoices: invoices.length,
      paidInvoices: paidInvoices.length,
      pendingInvoices: pendingInvoices.length,
      overdueInvoices: overdueInvoices.length,
      totalAmount: invoices.reduce((sum, inv) => sum + inv.monto, 0),
      paidAmount: paidInvoices.reduce((sum, inv) => sum + inv.monto, 0),
      pendingAmount: pendingInvoices.reduce((sum, inv) => {
        const paid = inv.pagos?.reduce((pSum, pago) => pSum + pago.monto, 0) || 0;
        return sum + (inv.monto - paid);
      }, 0),
    };
  });

  paymentTrends = computed(() => {
    const supplier = this.supplier();
    if (!supplier) return { labels: [], data: [] };
    return this.analyticsService.getSupplierPaymentHistory(supplier.id);
  });

  constructor() {
    // No necesitamos effect aquí ya que cargamos las facturas directamente en ngOnInit
  }

  async ngOnInit(): Promise<void> {
    const supplierId = this.route.snapshot.paramMap.get('id');
    if (!supplierId) {
      console.error('No supplier ID provided');
      return;
    }

    this.loading.set(true);
    try {
      // Asegurarse de que los proveedores estén cargados
      if (this.suppliersService.suppliers().length === 0) {
        await this.suppliersService.loadSuppliers();
      }

      // Asegurarse de que las facturas estén cargadas (solo si no lo están)
      if (this.invoicesService.facturas().length === 0) {
        await this.invoicesService.loadInvoices();
      }

      // Cargar datos del proveedor
      const supplier = await this.loadSupplierById(supplierId);
      if (supplier) {
        this.supplier.set(supplier);
        // Cargar facturas del proveedor inmediatamente
        await this.loadSupplierInvoices(supplier.id);
      } else {
        console.error('Supplier not found');
      }
    } catch (error) {
      console.error('Error loading supplier:', error);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSupplierById(id: string): Promise<Supplier | null> {
    try {
      // Buscar en la lista de proveedores ya cargada
      const suppliers = this.suppliersService.suppliers();
      const supplier = suppliers.find((s) => s.id === id);

      if (supplier) {
        return supplier;
      }

      // Si no está en la lista, intentar cargarlo individualmente desde Firestore
      console.warn(`Supplier ${id} not found in loaded suppliers, fetching individually`);
      return await new Promise<Supplier | null>((resolve) => {
        const subscription = this.suppliersService.getSupplierById(id).subscribe({
          next: (supplier) => {
            subscription.unsubscribe();
            resolve(supplier);
          },
          error: (error) => {
            console.error('Error fetching supplier individually:', error);
            subscription.unsubscribe();
            resolve(null);
          },
        });
      });
    } catch (error) {
      console.error('Error getting supplier by ID:', error);
      return null;
    }
  }

  private async loadSupplierInvoices(supplierId: string): Promise<void> {
    try {
      // Reutilizar las facturas ya cargadas en lugar de hacer una nueva consulta
      const allInvoices = this.invoicesService.facturas();
      const supplierInvoices = allInvoices.filter((invoice) => invoice.proveedorId === supplierId);
      this.supplierInvoices.set(supplierInvoices);
    } catch (error) {
      console.error('Error loading supplier invoices:', error);
    }
  }

  onInvoiceSelect(invoice: FacturaProveedor): void {
    this.selectedInvoice.set(invoice);
    this.showInvoiceModal.set(true);
  }

  onCloseInvoiceModal(): void {
    this.selectedInvoice.set(null);
    this.showInvoiceModal.set(false);
  }

  onNewInvoice(): void {
    this.showNewInvoiceModal.set(true);
  }

  onCloseNewInvoiceModal(): void {
    this.showNewInvoiceModal.set(false);
  }

  onInvoiceCreated(invoice: FacturaProveedor): void {
    this.supplierInvoices.update((current) => [...current, invoice]);
    this.onCloseNewInvoiceModal();
  }

  onInvoiceUpdated(invoice: FacturaProveedor): void {
    this.supplierInvoices.update((current) =>
      current.map((inv) => (inv.id === invoice.id ? invoice : inv))
    );
    this.onCloseInvoiceModal();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pagada':
        return 'badge-success';
      case 'parcial':
        return 'badge-warning';
      case 'pendiente':
        return 'badge-secondary';
      case 'vencida':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'pagada':
        return 'Pagada';
      case 'parcial':
        return 'Parcial';
      case 'pendiente':
        return 'Pendiente';
      case 'vencida':
        return 'Vencida';
      default:
        return status;
    }
  }

  goBack(): void {
    this.router.navigate(['/suppliers']);
  }
}
