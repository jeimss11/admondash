import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, timeout } from 'rxjs';
import { FacturaProveedor, PagoDto } from '../../models/supplier.models';
import { SupplierInvoicesService } from '../../services/supplier-invoices.service';
import { getOutstandingSupplierBalance, validateSupplierPayment } from '../../services/supplier-finance.policy';

@Component({
  selector: 'app-invoice-detail-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-detail-modal.component.html',
  styleUrls: ['./invoice-detail-modal.component.scss'],
})
export class InvoiceDetailModalComponent {
  private invoicesService = inject(SupplierInvoicesService);
  private viewRevision = 0;
  constructor() {
    effect(() => {
      this.invoice()?.id;
      this.show();
      this.viewRevision++;
      this.resetPaymentForm();
    });
  }

  // Inputs
  invoice = input<FacturaProveedor | null>(null);
  show = input(false);

  // Outputs
  close = output<void>();
  invoiceUpdated = output<FacturaProveedor>();

  // Signals internos
  showPaymentForm = signal(false);
  paymentAmount = signal(0);
  paymentNotes = signal('');
  paymentOperationId = signal<string | null>(null);
  isProcessingPayment = signal(false);
  errors = signal<string[]>([]);

  // Computed signals
  today = new Date();

  remainingAmount = computed(() => {
    const invoice = this.invoice();
    if (!invoice) return 0;

    return getOutstandingSupplierBalance(invoice);
  });

  isFullyPaid = computed(() => this.remainingAmount() <= 0);
  canConfirmPayment = computed(() => {
    const invoice = this.invoice();
    if (!invoice || this.isProcessingPayment()) return false;
    try { validateSupplierPayment(invoice, this.paymentAmount()); return true; }
    catch { return false; }
  });

  onClose(): void {
    if (this.isProcessingPayment()) return;
    this.showPaymentForm.set(false);
    this.paymentAmount.set(0);
    this.paymentNotes.set('');
    this.paymentOperationId.set(null);
    this.errors.set([]);
    this.close.emit();
  }

  onAddPayment(): void {
    if (this.isProcessingPayment() || this.isFullyPaid()) return;
    this.showPaymentForm.set(true);
    this.paymentAmount.set(this.remainingAmount());
    this.paymentOperationId.set(this.newOperationId());
  }

  onCancelPayment(): void {
    if (this.isProcessingPayment()) return;
    this.resetPaymentForm();
  }

  private resetPaymentForm(): void {
    this.showPaymentForm.set(false);
    this.paymentAmount.set(0);
    this.paymentNotes.set('');
    this.paymentOperationId.set(null);
    this.errors.set([]);
  }

  async onConfirmPayment(): Promise<void> {
    if (this.isProcessingPayment()) return;
    const invoice = this.invoice();
    if (!invoice) return;

    const amount = this.paymentAmount();
    const notes = this.paymentNotes();

    if (!Number.isFinite(amount) || amount <= 0) {
      this.errors.set(['El monto del pago debe ser mayor a cero']);
      return;
    }

    try {
      validateSupplierPayment(invoice, amount);
    } catch (error: any) {
      this.errors.set([error.message || 'El monto del pago no es válido.']);
      return;
    }

    this.isProcessingPayment.set(true);
    this.errors.set([]);
    const revision = this.viewRevision;

    try {
      const pagoDto: PagoDto = {
        facturaId: invoice.id,
        monto: amount,
        tipo: amount >= this.remainingAmount() ? 'completo' : 'parcial',
        observaciones: notes || undefined,
        operationId: this.paymentOperationId() ?? this.newOperationId(),
      };

      await this.invoicesService.addPayment(invoice.id, pagoDto);
      if (revision !== this.viewRevision || this.invoice()?.id !== invoice.id) return;

      // Recargar la factura actualizada
      const updatedInvoice = await firstValueFrom(this.invoicesService.getFacturaById(invoice.id).pipe(timeout(15000)));
      if (!updatedInvoice) throw new Error('El pago se guardó. Actualiza la lista para consultar la factura.');

      if (revision !== this.viewRevision || this.invoice()?.id !== invoice.id) return;
      this.invoiceUpdated.emit(updatedInvoice);
      this.resetPaymentForm();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      if (revision === this.viewRevision) this.errors.set([error.message || 'Error al procesar el pago']);
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  async onMarkAsPaid(): Promise<void> {
    if (this.isProcessingPayment()) return;
    const invoice = this.invoice();
    if (!invoice || this.isFullyPaid()) return;

    if (!confirm(`¿Marcar la factura ${invoice.numeroFactura} como pagada completamente?`)) {
      return;
    }

    this.isProcessingPayment.set(true);
    this.errors.set([]);
    const revision = this.viewRevision;

    try {
      const pagoDto: PagoDto = {
        facturaId: invoice.id,
        monto: this.remainingAmount(),
        tipo: 'completo',
        observaciones: 'Marcada como pagada manualmente',
        operationId: this.paymentOperationId() ?? this.newOperationId(),
      };
      this.paymentOperationId.set(pagoDto.operationId!);

      await this.invoicesService.addPayment(invoice.id, pagoDto);
      if (revision !== this.viewRevision || this.invoice()?.id !== invoice.id) return;

      // Recargar la factura actualizada
      const updatedInvoice = await firstValueFrom(this.invoicesService.getFacturaById(invoice.id).pipe(timeout(15000)));
      if (!updatedInvoice) throw new Error('El pago se guardó. Actualiza la lista para consultar la factura.');

      if (revision === this.viewRevision && this.invoice()?.id === invoice.id) this.invoiceUpdated.emit(updatedInvoice);
    } catch (error: any) {
      console.error('Error marking invoice as paid:', error);
      if (revision === this.viewRevision) this.errors.set([error.message || 'Error al marcar como pagada']);
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  async onDeleteInvoice(): Promise<void> {
    if (this.isProcessingPayment()) return;
    const invoice = this.invoice();
    if (!invoice) return;

    if (
      !confirm(
        `¿Desea anular la factura ${invoice.numeroFactura}? Se conservará el historial y esta acción no se podrá deshacer.`
      )
    ) {
      return;
    }

    const reason = prompt('Motivo de anulación (mínimo 10 caracteres):');
    if (reason === null) return;
    const revision = this.viewRevision;
    this.isProcessingPayment.set(true);

    try {
      await this.invoicesService.deleteInvoice(invoice.id, reason);
      if (revision === this.viewRevision && this.invoice()?.id === invoice.id) this.close.emit();
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      if (revision === this.viewRevision) this.errors.set([error.message || 'Error al anular la factura']);
    } finally {
      this.isProcessingPayment.set(false);
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

  getPaymentTypeText(type: string): string {
    return type === 'completo' ? 'Pago Completo' : 'Pago Parcial';
  }

  private newOperationId(): string {
    return crypto.randomUUID();
  }
}
