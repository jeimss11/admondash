import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePaymentsInPeriod,
  getOutstandingSupplierBalance,
  normalizeInvoiceCancellationReason,
  validateInvoiceOpening,
} from '../../src/app/modules/suppliers/services/supplier-finance.policy.ts';

test('a supplier invoice cannot start paid without payment evidence', () => {
  assert.throws(() => validateInvoiceOpening(100, 'parcial', 20), /iniciar pendiente/);
  assert.doesNotThrow(() => validateInvoiceOpening(100, 'pendiente', 0));
});

test('supplier balance excludes annulled invoices and respects partial payments', () => {
  assert.equal(getOutstandingSupplierBalance({ monto: 100, montoPagado: 35, estado: 'parcial' }), 65);
  assert.equal(getOutstandingSupplierBalance({ monto: 100, montoPagado: 0, estado: 'anulada' }), 0);
});

test('supplier invoice cancellation keeps a meaningful audit note', () => {
  assert.equal(normalizeInvoiceCancellationReason('  Factura   duplicada  '), 'Factura duplicada');
  assert.throws(() => normalizeInvoiceCancellationReason('corta'), /10 a 500/);
});

test('monthly supplier payments count payment evidence rather than whole invoices', () => {
  const total = calculatePaymentsInPeriod(
    [
      { monto: 30, fecha: new Date('2026-10-05T12:00:00Z') },
      { monto: 70, fecha: new Date('2026-09-30T12:00:00Z') },
    ],
    new Date('2026-10-01T00:00:00Z'),
    new Date('2026-11-01T00:00:00Z')
  );
  assert.equal(total, 30);
});
