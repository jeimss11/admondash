import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSameOperationRecord } from '../../src/app/modules/distributors/services/operation-record.policy.ts';

test('operation retry preserves business evidence despite new display timestamps', () => {
  assert.equal(isSameOperationRecord({ id: 'load-1', cantidad: 1.25, fechaCarga: 'old' },
    { id: 'load-1', cantidad: 1.25, fechaCarga: 'new' }), true);
});
test('a reused movement cannot replace a quantity, amount, actor or product', () => {
  const record = { cantidad: 2, total: 10, registradoPor: 'actor', productoId: 'code' };
  for (const change of [{ cantidad: 3 }, { total: 11 }, { registradoPor: 'other' }, { productoId: 'other' }]) {
    assert.equal(isSameOperationRecord(record, { ...record, ...change }), false);
  }
});
