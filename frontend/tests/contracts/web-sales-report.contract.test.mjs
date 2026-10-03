import assert from 'node:assert/strict';
import test from 'node:test';
import { readWebSaleReportRecord } from '../../src/app/core/integration/web-sales-report.contract.ts';

test('web report totals line records without treating a mobile line price as unit price', () => {
  const record = readWebSaleReportRecord('web-doc-1', {
    factura: 'WEB-1', fecha2: '2026-09-26', eliminado: false,
    productos: [{ total: '10.25' }, { total: '2.75' }],
  });
  assert.equal(record.total, '13');
  assert.equal(record.invoiceNumber, 'WEB-1');
});

test('malformed web totals remain unknown rather than becoming zero', () => {
  assert.equal(readWebSaleReportRecord('web-doc-2', { fecha2: '2026-09-26', productos: [{ total: 'COP 20' }] }).total, null);
});

test('report preserves net header totals and refuses ambiguous legacy discounts', () => {
  assert.equal(readWebSaleReportRecord('net', { total: '90', productos: [{ total: '100' }] }).total, '90');
  assert.equal(readWebSaleReportRecord('legacy', { descuento: '10', productos: [{ total: '100' }] }).total, null);
  assert.equal(readWebSaleReportRecord('explicit', { discountType: 'amount', descuento: '10', productos: [{ total: '100' }] }).total, '90');
  assert.equal(readWebSaleReportRecord('invalid', { total: 'bad', productos: [{ total: '100' }] }).total, null);
  assert.equal(readWebSaleReportRecord('null', null).total, null);
  assert.equal(readWebSaleReportRecord('null-line', { productos: [null] }).total, null);
});
