import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FacturaProveedor } from '../../models/supplier.models';

@Component({
  selector: 'app-supplier-invoices-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (invoices().length === 0) {
    <div class="text-center py-4">
      <i class="fas fa-file-invoice-dollar fa-2x text-muted mb-2"></i>
      <p class="text-muted">No hay facturas para este proveedor</p>
    </div>
    } @else {
    <div class="table-responsive">
      <table class="table table-hover mb-0">
        <thead class="table-light">
          <tr>
            <th>Fecha</th>
            <th>Número</th>
            <th>Monto</th>
            <th>Vencimiento</th>
            <th>Estado</th>
            <th class="text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          @for (invoice of invoices(); track invoice.id) {
          <tr [class.table-warning]="invoice.estado === 'vencida'">
            <td>{{ invoice.fechaRegistro | date : 'short' }}</td>
            <td>
              <strong>{{ invoice.numeroFactura }}</strong>
            </td>
            <td>{{ formatCurrency(invoice.monto) }}</td>
            <td>
              <span [class.text-danger]="isOverdue(invoice)">
                {{ invoice.fechaVencimiento | date : 'shortDate' }}
                @if (isOverdue(invoice)) {
                <i class="fas fa-exclamation-triangle text-danger ms-1" title="Factura vencida"></i>
                }
              </span>
            </td>
            <td>
              <span class="badge" [class]="getStatusBadgeClass(invoice.estado)">
                {{ getStatusText(invoice.estado) }}
              </span>
            </td>
            <td class="text-center">
              <button
                class="btn btn-sm btn-outline-primary"
                (click)="onInvoiceSelect(invoice)"
                title="Ver Detalles"
              >
                <i class="fas fa-eye"></i>
              </button>
            </td>
          </tr>
          }
        </tbody>
      </table>
    </div>
    }
  `,
})
export class SupplierInvoicesListComponent {
  invoices = input<FacturaProveedor[]>([]);
  invoiceSelect = output<FacturaProveedor>();

  onInvoiceSelect(invoice: FacturaProveedor): void {
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

  isOverdue(invoice: FacturaProveedor): boolean {
    return (
      invoice.estado === 'vencida' ||
      (invoice.fechaVencimiento ? invoice.fechaVencimiento < new Date() : false)
    );
  }
}
