import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_INVENTORY_CONFIGURATION,
  normalizeInventoryConfiguration,
  requiresSellerAllocation,
  applyInventoryConfigurationChange,
} from '../../src/app/modules/inventory/services/inventory-configuration.policy.ts';

test('inventory defaults are Colombian central inventory without guessing mobile stock', () => {
  assert.deepEqual(normalizeInventoryConfiguration({ lowStockThreshold: 5 }), DEFAULT_INVENTORY_CONFIGURATION);
  assert.deepEqual(normalizeInventoryConfiguration({}), DEFAULT_INVENTORY_CONFIGURATION);
});

test('a future business profile is explicit and validates locale, currency and timezone', () => {
  const result = normalizeInventoryConfiguration({
    lowStockThreshold: 8,
    country: 'mx',
    locale: 'es-MX',
    currency: 'mxn',
    timeZone: 'America/Mexico_City',
  });
  assert.deepEqual(result, {
    mode: 'central', lowStockThreshold: 8, country: 'MX', locale: 'es-MX', currency: 'MXN', timeZone: 'America/Mexico_City',
  });
  assert.throws(() => normalizeInventoryConfiguration({ lowStockThreshold: 8, timeZone: 'not/a-time-zone' }), /zona horaria/);
});

test('seller allocation is only enabled by an explicit inventory mode', () => {
  assert.equal(requiresSellerAllocation('central'), false);
  assert.equal(requiresSellerAllocation('by-seller'), true);
});

test('invalid stock thresholds cannot silently become zero', () => {
  assert.throws(() => normalizeInventoryConfiguration({ lowStockThreshold: -1 }), /umbral/);
});

test('mode transitions preserve history and regional configuration', () => {
  const mexico = normalizeInventoryConfiguration({ country: 'MX', locale: 'es-MX', currency: 'MXN', timeZone: 'America/Mexico_City' });
  assert.equal(applyInventoryConfigurationChange(mexico, { lowStockThreshold: 8 }, true).currency, 'MXN');
  assert.throws(() => applyInventoryConfigurationChange(mexico, { mode: 'by-seller' }, true), /conciliación/);
  assert.equal(applyInventoryConfigurationChange(mexico, { mode: 'by-seller' }, false).mode, 'by-seller');
  assert.throws(() => normalizeInventoryConfiguration({ mode: 'mixed-unapproved' }), /modo/);
});
