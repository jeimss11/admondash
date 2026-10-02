import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateKnownExpectedCash } from '../../src/app/modules/distributors/services/cash-reconciliation.policy.ts';

test('known expected cash does not turn inventory valuations into cash sales', () => {
  assert.equal(calculateKnownExpectedCash({
    openingAmount: 50_000,
    confirmedCollections: 18_500,
    operatingExpenses: 7_000,
  }), 61_500);
});

test('cash reconciliation rejects invalid monetary components', () => {
  assert.throws(() => calculateKnownExpectedCash({
    openingAmount: 10, confirmedCollections: -1, operatingExpenses: 0,
  }), /montos finitos no negativos/);
});
