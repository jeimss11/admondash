import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FacturaProveedor, Supplier } from '../models/supplier.models';
import { SupplierAnalyticsService } from '../services/supplier-analytics.service';
import { SupplierInvoicesService } from '../services/supplier-invoices.service';
import { SuppliersService } from '../services/suppliers.service';
import { InvoiceDetailModalComponent } from '../shared/invoice-detail-modal/invoice-detail-modal.component';
import { SupplierFormComponent } from '../supplier-form/supplier-form.component';

@Component({
  selector: 'app-suppliers-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, InvoiceDetailModalComponent, SupplierFormComponent],
  templateUrl: './suppliers-dashboard.component.html',
  styleUrls: ['./suppliers-dashboard.component.scss'],
})
export class SuppliersDashboardComponent implements OnInit {
  private analyticsService = inject(SupplierAnalyticsService);
  private invoicesService = inject(SupplierInvoicesService);
  private suppliersService = inject(SuppliersService);

  // Estado del modal
  showInvoiceModal = signal(false);
  selectedInvoice = signal<FacturaProveedor | null>(null);
  showAddSupplierModal = signal(false);
  refreshing = signal(false);

  // Datos del dashboard
  supplierStats = this.analyticsService.supplierStats;
  overdueInvoices = this.analyticsService.overdueInvoices;

  // Facturas recientes
  recentInvoices = computed(() => {
    const allInvoices = this.invoicesService.facturas() as FacturaProveedor[];
    const suppliers = this.suppliersService.suppliers() as Supplier[];

    return allInvoices
      .sort(
        (a: FacturaProveedor, b: FacturaProveedor) =>
          new Date(b.fechaEmision).getTime() - new Date(a.fechaEmision).getTime()
      )
      .slice(0, 5)
      .map((invoice) => ({
        ...invoice,
        supplierName:
          suppliers.find((s) => s.id === invoice.proveedorId)?.proveedor || 'Proveedor desconocido',
      }));
  });

  // Proveedores con más facturas pendientes
  topPendingSuppliers = computed(() => {
    const suppliers = this.suppliersService.suppliers() as Supplier[];
    const invoices = this.invoicesService.facturas() as FacturaProveedor[];

    return suppliers
      .map((supplier: Supplier) => {
        const supplierInvoices = invoices.filter(
          (inv: FacturaProveedor) => inv.proveedorId === supplier.id
        );
        const pendingAmount = supplierInvoices
          .filter((inv: FacturaProveedor) => inv.estado !== 'pagada')
          .reduce((sum: number, inv: FacturaProveedor) => sum + inv.monto, 0);

        return {
          ...supplier,
          pendingAmount,
          invoiceCount: supplierInvoices.length,
        };
      })
      .filter((s: any) => s.pendingAmount > 0)
      .sort((a: any, b: any) => b.pendingAmount - a.pendingAmount)
      .slice(0, 5);
  });

  ngOnInit() {
    // Los datos se cargan automáticamente a través de los servicios
  }

  // Métodos para el modal
  onViewInvoice(invoice: FacturaProveedor) {
    this.selectedInvoice.set(invoice);
    this.showInvoiceModal.set(true);
  }

  onCloseInvoiceModal() {
    this.showInvoiceModal.set(false);
    this.selectedInvoice.set(null);
  }

  // Métodos para el modal de agregar proveedor
  openAddSupplierModal() {
    this.showAddSupplierModal.set(true);
  }

  closeAddSupplierModal() {
    this.showAddSupplierModal.set(false);
  }

  onSupplierCreated(supplier: Supplier) {
    // El servicio se actualiza automáticamente
    this.closeAddSupplierModal();
  }

  // Utilidades
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  async refreshData(): Promise<void> {
    this.refreshing.set(true);
    try {
      // Recargar datos de los servicios
      await this.suppliersService.loadSuppliers();
      await this.invoicesService.loadInvoices();
      // Los analytics se actualizan automáticamente por las señales
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      this.refreshing.set(false);
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pagada':
        return 'badge-success';
      case 'pendiente':
        return 'badge-warning';
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
      case 'pendiente':
        return 'Pendiente';
      case 'vencida':
        return 'Vencida';
      default:
        return 'Desconocido';
    }
  }
}
