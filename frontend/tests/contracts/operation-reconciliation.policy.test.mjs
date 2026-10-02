import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeIgnoreReason,
  salesForOperation,
  unrecordedMobileSales,
} from '../../src/app/modules/distributors/services/operation-reconciliation.policy.ts';

const sales = [
  { invoiceNumber: '1001', businessDate: '2026-09-26', sellerRole: 'seller1', total: '20000' },
  { invoiceNumber: '1002', businessDate: '2026-09-26', sellerRole: 'seller1', total: '30000' },
  { invoiceNumber: '1003', businessDate: '2026-09-26', sellerRole: 'seller2', total: '40000' },
];

test('only sales from the operation civil date and linked mobile seller are observed', () => {
  assert.deepEqual(
    salesForOperation(sales, { fecha: '2026-09-26', distribuidorId: 'seller1' }).map((sale) => sale.invoiceNumber),
    ['1001', '1002']
  );
});

test('sales arriving after a snapshot remain pending for reconciliation', () => {
  const observed = salesForOperation(sales, { fecha: '2026-09-26', distribuidorId: 'seller1' });
  assert.deepEqual(unrecordedMobileSales(observed, new Set(['1001'])).map((sale) => sale.invoiceNumber), ['1002']);
});

test('ignoring a pending sale requires an audit note', () => {
  assert.equal(normalizeIgnoreReason('Factura duplicada del registro anterior'), 'Factura duplicada del registro anterior');
  assert.throws(() => normalizeIgnoreReason('Duplicada'), /al menos 10 caracteres/);
});
