import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stockQuantityChange, aggregateStockLines, canonicalStockQuantity } from '../../src/app/modules/sales/services/web-sale-stock.policy.ts';

test('fractional stock uses exact decimal arithmetic', () => {
  assert.equal(stockQuantityChange('0.3', '0.1', 'subtract'), '0.2');
  assert.equal(stockQuantityChange('0.2', '0.1', 'add'), '0.3');
  assert.equal(stockQuantityChange('1.001', '0.001', 'subtract'), '1');
  assert.equal(stockQuantityChange('1.000', '1', 'subtract'), '0');
});
test('unknown, malformed, negative and insufficient stock never become zero', () => {
  for (const value of [undefined, null, '', ' ', '-1', 'NaN', Infinity]) assert.throws(() => canonicalStockQuantity(value));
  assert.throws(() => stockQuantityChange('0.1', '0.2', 'subtract'), /insuficiente/);
  assert.throws(() => stockQuantityChange('1', '0', 'subtract'));
  assert.throws(() => stockQuantityChange('999999999999999999', '1', 'add'), /precisión/);
});
test('duplicate product codes are aggregated without name matching', () => {
  assert.deepEqual(aggregateStockLines([{codigo: 'A', cantidad: '0.1'}, {codigo: 'A', cantidad: '0.2'}, {codigo: 'B', cantidad: '1'}]),
    [{codigo: 'A', cantidad: '0.3'}, {codigo: 'B', cantidad: '1'}]);
});
test('unsafe codes and excessive product count are rejected before Firestore', () => {
  for (const codigo of [undefined, '', 'x/y', ' A', '.', '..', '__reserved__']) assert.throws(() => aggregateStockLines([{codigo, cantidad: '1'}]));
  assert.throws(() => aggregateStockLines(Array.from({length: 201}, (_, i) => ({codigo: String(i), cantidad: '1'}))));
});
