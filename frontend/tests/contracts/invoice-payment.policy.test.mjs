import assert from 'node:assert/strict';
import test from 'node:test';
import { administrativeInvoiceId, applyInvoiceCollection } from '../../src/app/modules/distributors/services/invoice-payment.policy.ts';

test('successive collections accumulate today and only complete the outstanding balance', () => {
  const first = applyInvoiceCollection({ monto: 100, montoPagado: 20, montoDelDia: 0 }, 30);
  assert.equal(first.montoPagado, 50);
  assert.equal(first.montoDelDia, 30);
  const second = applyInvoiceCollection({ monto: 100, ...first }, 'remaining');
  assert.equal(second.montoPagado, 100);
  assert.equal(second.montoDelDia, 80);
  assert.equal(second.estado, 'pagada');
  assert.throws(() => applyInvoiceCollection({ monto: 100, ...second }, 'remaining'));
});

test('a concurrent retry uses the current balance and rejects an overpayment', () => {
  const first = applyInvoiceCollection({ monto: 100 }, 70);
  assert.throws(() => applyInvoiceCollection({ monto: 100, ...first }, 70), /saldo actualizado/);
});

test('ordinary decimal currency does not reject the final fraction through floating-point noise', () => {
  const payment = applyInvoiceCollection({ monto: 0.3, montoPagado: 0.1, montoDelDia: 0.1 }, 0.2);
  assert.equal(payment.montoPagado, 0.3);
  assert.equal(payment.estado, 'pagada');
});

test('malformed balances and non-finite or negative collections cannot become receipts', () => {
  for (const amount of [NaN, Infinity, -1, 0]) assert.throws(() => applyInvoiceCollection({ monto: 100 }, amount));
  assert.throws(() => applyInvoiceCollection({ monto: 100, montoPagado: 101 }, 1));
  assert.throws(() => applyInvoiceCollection({ monto: 100, montoPagado: 20, montoDelDia: 30 }, 1));
});

test('invoice IDs keep the full mobile prefix, are deterministic and cannot create extra path segments', () => {
  assert.equal(administrativeInvoiceId('123-7'), administrativeInvoiceId('123-7'));
  assert.notEqual(administrativeInvoiceId('123-7'), administrativeInvoiceId('456-7'));
  assert.equal(administrativeInvoiceId('a/b-7').includes('/'), false);
});
