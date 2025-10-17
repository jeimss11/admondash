import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentDto, SupplierInvoice } from '../../models/supplier.models';
import { SupplierInvoicesService } from '../../services/supplier-invoices.service';

@Component({
  selector: 'app-invoice-detail-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-detail-modal.component.html',
  styleUrls: ['./invoice-detail-modal.component.scss'],
})
export class InvoiceDetailModalComponent {
  private invoicesService = inject(SupplierInvoicesService);

  // Inputs
  invoice = input<SupplierInvoice | null>(null);
  show = input(false);

  // Outputs
  close = output<void>();
  invoiceUpdated = output<SupplierInvoice>();

  // Signals internos
  showPaymentForm = signal(false);
  paymentAmount = signal(0);
  paymentNotes = signal('');
  isProcessingPayment = signal(false);
  errors = signal<string[]>([]);

  // Computed signals
  today = new Date();

  remainingAmount = computed(() => {
    const invoice = this.invoice();
    if (!invoice) return 0;

    const paid = invoice.payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;
    return invoice.amount - paid;
  });

  isFullyPaid = computed(() => this.remainingAmount() <= 0);

  onClose(): void {
    this.showPaymentForm.set(false);
    this.paymentAmount.set(0);
    this.paymentNotes.set('');
    this.errors.set([]);
    this.close.emit();
  }

  onAddPayment(): void {
    this.showPaymentForm.set(true);
    this.paymentAmount.set(this.remainingAmount());
  }

  onCancelPayment(): void {
    this.showPaymentForm.set(false);
    this.paymentAmount.set(0);
    this.paymentNotes.set('');
    this.errors.set([]);
  }

  async onConfirmPayment(): Promise<void> {
    const invoice = this.invoice();
    if (!invoice) return;

    const amount = this.paymentAmount();
    const notes = this.paymentNotes();

    if (amount <= 0) {
      this.errors.set(['El monto del pago debe ser mayor a cero']);
      return;
    }

    if (amount > this.remainingAmount()) {
      this.errors.set(['El monto del pago no puede ser mayor al saldo pendiente']);
      return;
    }

    this.isProcessingPayment.set(true);
    this.errors.set([]);

    try {
      const paymentDto: PaymentDto = {
        invoiceId: invoice.id,
        amount,
        type: amount >= this.remainingAmount() ? 'full' : 'partial',
        notes: notes || undefined,
      };

      await this.invoicesService.addPayment(invoice.id, paymentDto);

      // Recargar la factura actualizada
      const updatedInvoice = await new Promise<SupplierInvoice>((resolve) => {
        this.invoicesService.getInvoiceById(invoice.id).subscribe({
          next: (inv) => {
            if (inv) resolve(inv);
          },
        });
      });

      this.invoiceUpdated.emit(updatedInvoice);
      this.onCancelPayment();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      this.errors.set([error.message || 'Error al procesar el pago']);
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  async onMarkAsPaid(): Promise<void> {
    const invoice = this.invoice();
    if (!invoice || this.isFullyPaid()) return;

    if (!confirm(`¿Marcar la factura ${invoice.number} como pagada completamente?`)) {
      return;
    }

    this.isProcessingPayment.set(true);
    this.errors.set([]);

    try {
      const paymentDto: PaymentDto = {
        invoiceId: invoice.id,
        amount: this.remainingAmount(),
        type: 'full',
        notes: 'Marcada como pagada manualmente',
      };

      await this.invoicesService.addPayment(invoice.id, paymentDto);

      // Recargar la factura actualizada
      const updatedInvoice = await new Promise<SupplierInvoice>((resolve) => {
        this.invoicesService.getInvoiceById(invoice.id).subscribe({
          next: (inv) => {
            if (inv) resolve(inv);
          },
        });
      });

      this.invoiceUpdated.emit(updatedInvoice);
    } catch (error: any) {
      console.error('Error marking invoice as paid:', error);
      this.errors.set([error.message || 'Error al marcar como pagada']);
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  async onDeleteInvoice(): Promise<void> {
    const invoice = this.invoice();
    if (!invoice) return;

    if (
      !confirm(
        `¿Está seguro de que desea eliminar la factura ${invoice.number}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      await this.invoicesService.deleteInvoice(invoice.id);
      this.close.emit();
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      this.errors.set([error.message || 'Error al eliminar la factura']);
    }
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

  getStatusText(status: string): string {
    switch (status) {
      case 'paid':
        return 'Pagada';
      case 'partial':
        return 'Parcial';
      case 'pending':
        return 'Pendiente';
      case 'overdue':
        return 'Vencida';
      default:
        return status;
    }
  }

  getPaymentTypeText(type: string): string {
    return type === 'full' ? 'Pago Completo' : 'Pago Parcial';
  }
}
