import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupplierInvoice, InvoiceFilter } from '../../models/supplier.models';
import {
  DEFAULT_INVOICE_FILTER,
  INVOICE_STATUS_OPTIONS,
} from '../../constants/suppliers.constants';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.scss'],
})
export class InvoiceListComponent {
  // Inputs
  invoices = input<SupplierInvoice[]>([]);
  loading = input(false);
  filter = input<InvoiceFilter>(DEFAULT_INVOICE_FILTER);

  // Outputs
  invoiceSelect = output<SupplierInvoice>();
  filterChange = output<Partial<InvoiceFilter>>();

  // Signals internos
  searchTerm = signal('');
  selectedStatus = signal<string>('all');

  // Computed signals
  filteredInvoices = computed(() => {
    const invoices = this.invoices();
    const search = this.searchTerm().toLowerCase();
    const status = this.selectedStatus();

    let filtered = invoices;

    // Filtro por búsqueda
    if (search) {
      filtered = filtered.filter(
        (invoice) =>
          invoice.number.toLowerCase().includes(search) ||
          invoice.notes?.toLowerCase().includes(search)
      );
    }

    // Filtro por estado
    if (status !== 'all') {
      filtered = filtered.filter((invoice) => invoice.status === status);
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      switch (this.filter().sortBy) {
        case 'dueDate':
          return this.filter().sortOrder === 'asc'
            ? a.dueDate.getTime() - b.dueDate.getTime()
            : b.dueDate.getTime() - a.dueDate.getTime();
        case 'amount':
          return this.filter().sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount;
        case 'createdAt':
          return this.filter().sortOrder === 'asc'
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime();
        default:
          return 0;
      }
    });

    return filtered;
  });

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
  }

  onStatusChange(status: string): void {
    this.selectedStatus.set(status);
    this.filterChange.emit({ status: status as any });
  }

  onInvoiceClick(invoice: SupplierInvoice): void {
    this.invoiceSelect.emit(invoice);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'paid':
        return 'badge-success';
      case 'partial':
        return 'badge-warning';
      case 'pending':
        return 'badge-secondary';
      case 'overdue':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  }

  getDaysUntilDue(dueDate: Date): number {
    const today = new Date();
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isOverdue(dueDate: Date): boolean {
    return this.getDaysUntilDue(dueDate) < 0;
  }
}
