import assert from 'node:assert/strict';
import test from 'node:test';
import { colombiaBusinessDate, createWebInvoiceNumber, webSaleDocumentId } from '../../src/app/modules/sales/services/web-sale.policy.ts';
import { businessDate, businessDisplayDate, businessMonthStart, colombiaBusinessDateDaysAgo } from '../../src/app/core/integration/business-date.ts';

test('web invoice keeps a timestamp-first shape and is not its Firestore document ID', () => {
  const invoice = createWebInvoiceNumber(1720000000000, 'a1b2-c3d4-e5f6');
  assert.equal(invoice, '1720000000000-a1b2c3d4e5');
  assert.equal(webSaleDocumentId(invoice), 'web_1720000000000-a1b2c3d4e5');
});

test('web business date is calculated in Colombia rather than UTC', () => {
  assert.equal(colombiaBusinessDate(new Date('2026-09-27T03:30:00.000Z')), '2026-09-26');
});

test('Colombian date offsets do not use the browser UTC date', () => {
  const nearMidnightInColombia = new Date('2026-09-27T03:30:00.000Z');
  assert.equal(colombiaBusinessDateDaysAgo(0, nearMidnightInColombia), '2026-09-26');
  assert.equal(colombiaBusinessDateDaysAgo(1, nearMidnightInColombia), '2026-09-25');
});

test('a future business profile chooses its own civil day and month without changing the default', () => {
  const mexico = { country: 'MX', locale: 'es-MX', currency: 'MXN', timeZone: 'America/Mexico_City' };
  const instant = new Date('2026-01-01T05:30:00.000Z');
  assert.equal(businessDate(instant, mexico), '2025-12-31');
  assert.equal(businessMonthStart(instant, mexico), '2025-12-01');
  assert.equal(businessDisplayDate(instant, mexico), '31/12/2025');
  assert.equal(colombiaBusinessDate(instant), '2026-01-01');
});
