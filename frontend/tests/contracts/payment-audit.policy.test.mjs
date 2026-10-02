import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePaymentCancellationReason } from '../../src/app/modules/distributors/services/payment-audit.policy.ts';

test('payment cancellation keeps a normalized explanatory note', () => {
  assert.equal(normalizePaymentCancellationReason('  Cobro duplicado por error de caja.  '), 'Cobro duplicado por error de caja.');
});

test('payment cancellation requires an explanatory note', () => {
  assert.throws(() => normalizePaymentCancellationReason('corta'), /al menos 10/);
});
