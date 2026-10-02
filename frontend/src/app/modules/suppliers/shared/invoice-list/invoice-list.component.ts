import { CommonModule } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { FILTRO_FACTURA_PROVEEDOR_POR_DEFECTO } from '../../constants/suppliers.constants';
import { FacturaProveedor, FiltroFacturaProveedor } from '../../models/supplier.models';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.scss'],
})
export class InvoiceListComponent {
  // Inputs
  invoices = input<FacturaProveedor[]>([]);
  loading = input(false);
  filter = input<FiltroFacturaProveedor>(FILTRO_FACTURA_PROVEEDOR_POR_DEFECTO);

  // Outputs
  invoiceSelect = output<FacturaProveedor>();
  filterChange = output<Partial<FiltroFacturaProveedor>>();

  // Signals internos
  searchTerm = signal('');
  selectedStatus = signal<string>('todos');

  // Computed signals
  filteredInvoices = computed(() => {
    const invoices = this.invoices();
    const search = this.searchTerm().toLowerCase();
    const status = this.selectedStatus();

    let filtered = invoices;

    // Filtro por búsqueda
    if (search) {
      filtered = filtered.filter(
        (factura) =>
          factura.numeroFactura.toLowerCase().includes(search) ||
          factura.observaciones?.toLowerCase().includes(search)
      );
    }

    // Filtro por estado
    if (status !== 'todos') {
      filtered = filtered.filter((factura) => factura.estado === status);
    }

    // Ordenamiento
    filtered.sort((a, b) => {
      switch (this.filter().ordenarPor) {
        case 'fechaVencimiento':
          const aDueDate = a.fechaVencimiento?.getTime() || 0;
          const bDueDate = b.fechaVencimiento?.getTime() || 0;
          return this.filter().orden === 'asc' ? aDueDate - bDueDate : bDueDate - aDueDate;
        case 'monto':
          return this.filter().orden === 'asc' ? a.monto - b.monto : b.monto - a.monto;
        case 'fechaRegistro':
          return this.filter().orden === 'asc'
            ? a.fechaRegistro.getTime() - b.fechaRegistro.getTime()
            : b.fechaRegistro.getTime() - a.fechaRegistro.getTime();
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
    this.filterChange.emit({ estado: status as any });
  }

  onInvoiceClick(invoice: FacturaProveedor): void {
    this.invoiceSelect.emit(invoice);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
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

  getDaysUntilDue(dueDate?: Date): number {
    if (!dueDate) return Infinity; // Si no hay fecha de vencimiento, no está vencida
    const today = new Date();
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isOverdue(dueDate?: Date): boolean {
    return this.getDaysUntilDue(dueDate) < 0;
  }
}
