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
