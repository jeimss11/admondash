import type { EstadoFactura, Pago } from '../models/supplier.models';

export interface SupplierInvoiceBalanceInput {
  monto: number;
  montoPagado?: number;
  estado: EstadoFactura;
}

/** The invoice aggregate is the current balance source; annulled invoices never create debt. */
export function getOutstandingSupplierBalance(invoice: SupplierInvoiceBalanceInput): number {
  if (invoice.estado === 'anulada') return 0;
  const amount = Number(invoice.monto);
  const paid = Number(invoice.montoPagado ?? 0);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paid) || paid < 0) return 0;
  return Math.max(0, amount - paid);
}

/** A newly registered payable cannot claim a collection without its payment evidence. */
export function validateInvoiceOpening(
  amount: number,
  status: EstadoFactura,
  paidAmount: number
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El monto de la factura debe ser un valor finito mayor que cero.');
  }
  if (status !== 'pendiente' || paidAmount !== 0) {
    throw new Error('Una factura nueva debe iniciar pendiente y sin pagos; registra el abono después.');
  }
}

/** Counts payment evidence, not the amount of invoices which happened to become paid. */
export function calculatePaymentsInPeriod(
  payments: readonly Pick<Pago, 'monto' | 'fecha'>[] | undefined,
  startInclusive: Date,
  endExclusive: Date
): number {
  if (!payments) return 0;
  return payments.reduce((total, payment) => {
    const amount = Number(payment.monto);
    const date = payment.fecha instanceof Date ? payment.fecha : null;
    if (!Number.isFinite(amount) || amount <= 0 || !date || Number.isNaN(date.getTime())) return total;
    return date >= startInclusive && date < endExclusive ? total + amount : total;
  }, 0);
}

export function normalizeInvoiceCancellationReason(reason: string): string {
  const normalized = reason.trim().replace(/\s+/g, ' ');
  if (normalized.length < 10 || normalized.length > 500) {
    throw new Error('La anulación requiere una nota de 10 a 500 caracteres.');
  }
  return normalized;
}
