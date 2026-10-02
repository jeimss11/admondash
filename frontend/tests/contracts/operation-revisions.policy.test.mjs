import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertClosedOperation,
  normalizeReopenReason,
} from '../../src/app/modules/distributors/services/operation-revisions.policy.ts';

test('a reopening reason is normalized and remains auditable', () => {
  assert.equal(
    normalizeReopenReason('  Llegó   una venta móvil después del cierre.  '),
    'Llegó una venta móvil después del cierre.'
  );
});

test('a reopening requires an explanatory note', () => {
  assert.throws(() => normalizeReopenReason('Ajuste'), /al menos 10 caracteres/);
});

test('only a closed operation can be reopened', () => {
  assert.doesNotThrow(() => assertClosedOperation('cerrada'));
  assert.throws(() => assertClosedOperation('activa'), /ya esté cerrada/);
});
