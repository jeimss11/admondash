import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDistributorInvoiceCsv } from '../../src/app/modules/distributors/services/distributor-export.policy.ts';

test('distributor CSV exports only the visible invoices and retains observed payment unknown', () => {
  const invoices = [{ number: '123-7', date: '2026-10-02', amount: 100 }];
  const csv = buildDistributorInvoiceCsv(invoices, 'seller-unlimited', [
    { factura: '123-7', total: '100.50' },
    { factura: 'hidden', total: '300', pagado: true },
  ]);
  assert.match(csv, /"123-7".*"100.50";"Sin confirmar"/);
  assert.match(csv, /seller-unlimited/);
  assert.doesNotMatch(csv, /hidden/);
  assert.equal(csv.split('\r\n').length, 2);
});

test('distributor CSV neutralizes formula prefixes and escapes quotes', () => {
  const csv = buildDistributorInvoiceCsv([{ number: '=1+1', date: 'a"b', amount: NaN }], ' @formula', []);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"' @formula"/);
  assert.match(csv, /"a""b"/);
  assert.match(csv, /"No disponible"/);
});

test('distributor CSV distinguishes explicitly paid and unpaid mobile invoices', () => {
  const csv = buildDistributorInvoiceCsv([{ number: '1' }, { number: '2' }], 'seller1', [
    { factura: '1', total: '0', pagado: true }, { factura: '2', total: '10', pagado: false },
  ]);
  assert.match(csv, /"0";"Pagada"/);
  assert.match(csv, /"10";"No pagada"/);
});

test('distributor CSV never replaces a missing or malformed mobile total with an inferred zero', () => {
  const csv = buildDistributorInvoiceCsv([{ number: 'missing', amount: 0 }, { number: 'bad', amount: 0 }], 'seller1', [
    { factura: 'missing' }, { factura: 'bad', total: 'abc' },
  ]);
  assert.equal(csv.match(/"No disponible"/g).length, 2);
});
