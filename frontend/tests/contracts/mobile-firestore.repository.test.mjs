import assert from 'node:assert/strict';
import test from 'node:test';
import { readMobileCollection, readMobileSale } from '../../src/app/core/integration/mobile-contract.ts';

const validSale = {
  __admonDashDocumentId: '1720000000000-7',
  factura: '1720000000000-7',
  cliente: 'Cliente de prueba',
  fecha: '22-09-2026',
  fecha2: '2026-09-22',
  eliminado: false,
  pagado: true,
  productos: [{ nombre: 'Producto de prueba', cantidad: '1', precio: '60.00' }],
};

test('one malformed document does not hide compatible mobile sales', () => {
  const result = readMobileCollection(
    [validSale, { ...validSale, __admonDashDocumentId: 'malformed', fecha2: '2026-02-30' }],
    readMobileSale
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].value.invoiceNumber, validSale.factura);
  assert.deepEqual(result.rejected, [
    { documentId: 'malformed', field: 'fecha2', reason: 'invalid-contract' },
  ]);
});

test('a Firestore snapshot without an injected document ID is rejected safely', () => {
  const result = readMobileCollection([{ ...validSale, __admonDashDocumentId: undefined }], readMobileSale);
  assert.deepEqual(result.records, []);
  assert.deepEqual(result.rejected, [
    { documentId: '', field: '__admonDashDocumentId', reason: 'missing-document-id' },
  ]);
});

test('an ID mismatch remains a visible contract issue while preserving the record', () => {
  const result = readMobileCollection([{ ...validSale, __admonDashDocumentId: 'legacy-auto-id' }], readMobileSale);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].value.documentId, 'legacy-auto-id');
  assert.ok(result.records[0].issues.some((issue) => issue.field === 'factura'));
  assert.deepEqual(result.rejected, []);
});
