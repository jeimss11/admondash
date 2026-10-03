import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryReversal, inventoryMovementId, normalizeInventoryMovement, sameInventoryMovement, summarizeInventoryLocations, summarizeInventoryMovements } from '../../src/app/modules/inventory/services/inventory-ledger.policy.ts';

const base = { operationId: 'seller1_2026-09-26', sourceId: 'P01_1727', kind: 'load', productCode: 'P01', productName: 'Agua', quantity: 2.5, distributorId: 'seller1', actorUid: 'owner', mode: 'by-seller' };

test('inventory retries compare immutable content, not timestamp metadata', () => {
  assert.equal(sameInventoryMovement({ ...base, createdAt: 123 }, base), true);
  assert.equal(sameInventoryMovement(base, { ...base, quantity: 99 }), false);
  assert.equal(sameInventoryMovement(base, { ...base, actorUid: 'other' }), false);
  assert.equal(sameInventoryMovement(base, { ...base, destinationLocation: 'distributor:seller2' }), false);
  assert.throws(() => normalizeInventoryMovement({ ...base, mode: 'unknown' }), /modo/);
});

test('administrative movement IDs are deterministic for retry-safe operation records', () => {
  assert.equal(inventoryMovementId(base), inventoryMovementId(base));
});

test('inventory movement preserves fractional quantities and rejects nonpositive values', () => {
  assert.equal(normalizeInventoryMovement(base).quantity, 2.5);
  assert.equal(normalizeInventoryMovement({ ...base, note: '  Conteo físico inicial  ' }).note, 'Conteo físico inicial');
  assert.throws(() => normalizeInventoryMovement({ ...base, quantity: 0 }), /mayor que cero/);
  assert.throws(() => normalizeInventoryMovement({ ...base, note: 12 }), /debe ser texto/);
});

test('administrative outstanding quantity is explicit and does not claim mobile absolute stock', () => {
  const [balance] = summarizeInventoryMovements([
    { ...base, kind: 'load', quantity: 10 },
    { ...base, kind: 'return', quantity: 2 },
    { ...base, kind: 'loss', quantity: 1.5 },
  ]);
  assert.deepEqual({ loaded: balance.loaded, returned: balance.returned, lost: balance.lost, adjustedIn: balance.adjustedIn, adjustedOut: balance.adjustedOut, outstanding: balance.outstanding }, {
    loaded: 10, returned: 2, lost: 1.5, adjustedIn: 0, adjustedOut: 0, outstanding: 6.5,
  });
});

test('a correction creates inverse audit evidence instead of deleting the original movement', () => {
  const reversedLoad = createInventoryReversal(base, {
    sourceId: 'correction-load-1', actorUid: 'owner', reason: 'Cantidad cargada por error de digitación.',
  });
  assert.equal(reversedLoad.kind, 'return');
  assert.equal(reversedLoad.sourceLocation, 'distributor:seller1');
  assert.equal(reversedLoad.destinationLocation, 'factory');
  assert.equal(reversedLoad.correctionOf, inventoryMovementId(base));
  assert.throws(() => createInventoryReversal(reversedLoad, {
    sourceId: 'reverse-the-reversal', actorUid: 'owner', reason: 'No debe crear cadenas de ajustes.',
  }), /conciliación específica/);

  const reversedLoss = createInventoryReversal({ ...base, kind: 'loss' }, {
    sourceId: 'correction-loss-1', actorUid: 'owner', reason: 'La pérdida fue registrada dos veces por error.',
  });
  assert.equal(reversedLoss.kind, 'adjustment-in');
  assert.equal(reversedLoss.sourceLocation, undefined);
  assert.equal(reversedLoss.destinationLocation, 'distributor:seller1');
  assert.throws(() => createInventoryReversal(base, {
    sourceId: 'bad-note', actorUid: 'owner', reason: 'corta',
  }), /al menos 10/);
});

test('location summary keeps factory, shared pool and individual distributors separate', () => {
  const [balance] = summarizeInventoryLocations([
    { ...base, kind: 'factory-receipt', sourceId: 'receipt-1', quantity: 20, distributorId: undefined },
    { ...base, kind: 'load', sourceId: 'load-seller1', quantity: 5 },
    { ...base, kind: 'load', sourceId: 'load-shared', quantity: 4, mode: 'central' },
    { ...base, kind: 'return', sourceId: 'return-seller1', quantity: 1 },
    { ...base, kind: 'loss', sourceId: 'loss-shared', quantity: 0.5, mode: 'central' },
  ]);

  assert.equal(balance.factory, 12);
  assert.equal(balance.sharedDistributorPool, 3.5);
  assert.deepEqual(balance.distributors, [{ distributorId: 'seller1', quantity: 4 }]);
  assert.equal(balance.lost, 0.5);
});
