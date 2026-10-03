import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePaymentsInPeriod,
  getOutstandingSupplierBalance,
  normalizeInvoiceCancellationReason,
  validateInvoiceOpening,
  validateSupplierPayment,
  validateSupplierInvoiceBalance,
  readSupplierFinancialTotals,
} from '../../src/app/modules/suppliers/services/supplier-finance.policy.ts';

test('a supplier invoice cannot start paid without payment evidence', () => {
  assert.throws(() => validateInvoiceOpening(100, 'parcial', 20), /iniciar pendiente/);
  assert.doesNotThrow(() => validateInvoiceOpening(100, 'pendiente', 0));
});

test('transaction payment validation rejects annulled and overpaid invoices', () => {
  assert.throws(() => validateSupplierPayment({ monto:100,montoPagado:0,estado:'anulada' }, 10), /anulada/);
  assert.throws(() => validateSupplierPayment({ monto:100,montoPagado:80,estado:'parcial' }, 21), /supera/);
  assert.equal(validateSupplierPayment({ monto:100,montoPagado:80,estado:'parcial' }, 20), 100);
  assert.throws(() => validateSupplierPayment({ monto:100,montoPagado:0,estado:'pendiente' }, NaN));
  assert.equal(validateSupplierPayment({ monto:0.3,montoPagado:0.2,estado:'parcial' }, 0.1), 0.3);
});

test('supplier balance excludes annulled invoices and respects partial payments', () => {
  assert.equal(getOutstandingSupplierBalance({ monto: 100, montoPagado: 35, estado: 'parcial' }), 65);
  assert.equal(getOutstandingSupplierBalance({ monto: 100, montoPagado: 0, estado: 'anulada' }), 0);
});

test('invalid financial history is never presented as zero debt', () => {
  for (const invoice of [
    {monto:NaN,montoPagado:0,estado:'pendiente'},
    {monto:100,montoPagado:101,estado:'parcial'},
    {monto:null,montoPagado:0,estado:'pendiente'},
    {monto:100,montoPagado:0,estado:'desconocido'},
  ]) {
    assert.throws(() => validateSupplierInvoiceBalance(invoice), /incompatibles/);
    assert.throws(() => getOutstandingSupplierBalance(invoice), /incompatibles/);
  }
});
test('supplier transaction aggregates accept verified numeric strings and never assume missing zero', () => {
  assert.deepEqual(readSupplierFinancialTotals({deuda_total:'100',pagado:'20',pendiente:'80'}),{debt:100,paid:20,pending:80});
  for (const data of [{deuda_total:100,pagado:0},{deuda_total:100,pagado:0,pendiente:''},
    {deuda_total:100,pagado:0,pendiente:-1},{deuda_total:100,pagado:0,pendiente:NaN}]) {
    assert.throws(() => readSupplierFinancialTotals(data),/conciliación/);
  }
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
