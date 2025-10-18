import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FacturaProveedor, Supplier } from '../models/supplier.models';
import { SupplierAnalyticsService } from '../services/supplier-analytics.service';
import { SupplierInvoicesService } from '../services/supplier-invoices.service';
import { SuppliersService } from '../services/suppliers.service';
import { InvoiceDetailModalComponent } from '../shared/invoice-detail-modal/invoice-detail-modal.component';
import { SupplierInvoicesListComponent } from '../shared/supplier-invoices-list/supplier-invoices-list.component';

@Component({
  selector: 'app-supplier-dashboard',
  standalone: true,
  imports: [CommonModule, SupplierInvoicesListComponent, InvoiceDetailModalComponent],
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
    // Efecto para cargar datos cuando cambia el supplier
    effect(() => {
      const supplier = this.supplier();
      if (supplier) {
        this.loadSupplierInvoices(supplier.id);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const supplierId = this.route.snapshot.paramMap.get('id');
    if (!supplierId) {
      console.error('No supplier ID provided');
      return;
    }

    this.loading.set(true);
    try {
      // Cargar datos del proveedor
      const supplier = await this.loadSupplierById(supplierId);
      if (supplier) {
        this.supplier.set(supplier);
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
      const suppliers = this.suppliersService.suppliers();
      const supplier = suppliers.find((s) => s.id === id);

      if (supplier) {
        return supplier;
      }

      // Si no está en la lista, intentar cargarlo individualmente
      const supplier$ = this.suppliersService.getSupplierById(id);
      return await new Promise<Supplier | null>((resolve) => {
        supplier$.subscribe({
          next: (supplier) => resolve(supplier),
          error: () => resolve(null),
        });
      });
    } catch (error) {
      console.error('Error getting supplier by ID:', error);
      return null;
    }
  }

  private async loadSupplierInvoices(supplierId: string): Promise<void> {
    try {
      await this.invoicesService.loadInvoices(supplierId);
      this.supplierInvoices.set(this.invoicesService.getFacturasByProveedor(supplierId));
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
