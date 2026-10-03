import type { EstadoFactura, Pago } from '../models/supplier.models';

export interface SupplierInvoiceBalanceInput {
  monto: number;
  montoPagado?: number;
  estado: EstadoFactura;
}

export function validateSupplierInvoiceBalance(invoice: SupplierInvoiceBalanceInput): void {
  const amount = Number(invoice.monto);
  const paid = Number(invoice.montoPagado ?? 0);
  if (invoice.monto === null || invoice.monto === undefined ||
      !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paid) || paid < 0 || paid > amount ||
      !['pendiente', 'parcial', 'pagada', 'vencida', 'anulada'].includes(invoice.estado)) {
    throw new Error('La factura tiene importes o estado incompatibles y requiere revisión.');
  }
}

/** Never turn an absent historical aggregate into zero, or overwrite a numeric string with increment. */
export function readSupplierFinancialTotals(data: Record<string, unknown>): {debt: number; paid: number; pending: number} {
  const read = (field: string): number => {
    const value = data[field];
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value)) || Number(value) < 0) {
      throw new Error('Los saldos del proveedor no están informados o son inválidos. Requieren conciliación.');
    }
    return Number(value);
  };
  return {debt:read('deuda_total'),paid:read('pagado'),pending:read('pendiente')};
}

/** The invoice aggregate is the current balance source; annulled invoices never create debt. */
export function getOutstandingSupplierBalance(invoice: SupplierInvoiceBalanceInput): number {
  if (invoice.estado === 'anulada') return 0;
  validateSupplierInvoiceBalance(invoice);
  const amount = Number(invoice.monto);
  const paid = Number(invoice.montoPagado ?? 0);
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

/** Validate from the transaction snapshot, including invoices annulled in another browser. */
export function validateSupplierPayment(invoice: SupplierInvoiceBalanceInput, payment: number): number {
  if (invoice.estado === 'anulada') throw new Error('No se puede pagar una factura anulada.');
  const amount = Number(invoice.monto);
  const paid = Number(invoice.montoPagado ?? 0);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paid) || paid < 0 || paid > amount) {
    throw new Error('La factura tiene importes incompatibles y requiere revisión.');
  }
  if (!Number.isFinite(payment) || payment <= 0) throw new Error('El pago debe ser mayor que cero.');
  const balance = amount - paid;
  if (balance <= 0) throw new Error('La factura ya no tiene saldo pendiente.');
  const tolerance = Math.max(1e-9, amount * Number.EPSILON * 16);
  if (payment - balance > tolerance) throw new Error('El pago supera el saldo pendiente de la factura.');
  return Math.abs(balance - payment) <= tolerance ? amount : paid + payment;
}
