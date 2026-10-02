import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MobileContractError,
  readMobileClient,
  readMobileExpense,
  readMobileProduct,
  readMobileSale,
} from '../../src/app/core/integration/mobile-contract.ts';

// Synthetic records matching the mobile writers; no production identifiers or data.
const timestamp = Object.freeze({ seconds: 1790035200, nanoseconds: 0 });
const sale = {
  factura: '1720000000000-7', cliente: 'Cliente de prueba',
  fecha: '22-09-2026', fecha2: '2026-09-22', role: 'seller1',
  eliminado: false, pagado: false, subtotal: '60.00', descuento: '5.00', total: '55.00',
  productos: [{ nombre: 'Producto de prueba', cantidad: '2.0', precio: '60.0' }],
  ultima_modificacion: timestamp,
};
const product = {
  codigo: 'P-TEST', nombre: 'Producto de prueba', valor: '30.00',
  cantidad: '3.5', eliminado: false, ultima_modificacion: timestamp,
};
const client = {
  local: 'LOCAL-TEST', cliente: 'Cliente de prueba', direccion: 'Dirección de prueba',
  telefono: '000000', eliminado: false, ultima_modificacion: timestamp,
};
const expense = {
  expense_id: 'EXP-TEST-1', description: 'Gasto de prueba', amount: 12500.5,
  category: 'Transport', date: '2026-09-22 18:30:00', date2: '20260922',
  notes: '', role: 'admon', eliminado: false, ultima_modificacion: timestamp,
};

test('mobile price is the entire line amount, not quantity times price', () => {
  const { value, issues } = readMobileSale(sale.factura, sale);
  assert.deepEqual(value.lines, [{ name: 'Producto de prueba', quantity: '2.0', lineAmount: '60.0' }]);
  assert.equal(value.subtotal, '60.00');
  assert.equal(value.discountAmount, '5.00');
  assert.equal(value.total, '55.00');
  assert.equal(value.sourceCollection, 'ventas');
  assert.deepEqual(issues, []);
});

test('fractional quantities and decimal precision survive reading', () => {
  const input = { ...sale, productos: [{ nombre: 'Prueba', cantidad: '0.125', precio: '9007199254740993.01' }] };
  const { value } = readMobileSale(sale.factura, input);
  assert.equal(value.lines[0].quantity, '0.125');
  assert.equal(value.lines[0].lineAmount, '9007199254740993.01');
});

test('decimal scientific notation from Java is preserved without rounding', () => {
  const { value } = readMobileProduct(product.codigo, { ...product, valor: '1.25E8' });
  assert.equal(value.unitPrice, '1.25E8');
});

test('auto document ID does not replace the invoice number', () => {
  const { value, issues } = readMobileSale('old-web-auto-id', sale);
  assert.equal(value.documentId, 'old-web-auto-id');
  assert.equal(value.invoiceNumber, sale.factura);
  assert.ok(issues.some(i => i.field === 'factura' && i.code === 'identity-mismatch'));
});

test('missing payment state stays unknown instead of creating a debt or receipt', () => {
  const { pagado, ...input } = sale;
  const { value, issues } = readMobileSale(sale.factura, input);
  assert.equal(value.paymentStatus, 'unknown');
  assert.ok(issues.some(i => i.field === 'pagado'));
});

test('false and true payment states are preserved', () => {
  assert.equal(readMobileSale(sale.factura, sale).value.paymentStatus, 'unpaid');
  assert.equal(readMobileSale(sale.factura, { ...sale, pagado: true }).value.paymentStatus, 'paid');
});

test('missing totals are explicit and never synthesized as zero', () => {
  const { total, subtotal, descuento, ...input } = sale;
  const result = readMobileSale(sale.factura, input);
  assert.equal(result.value.total, null);
  assert.equal(result.value.subtotal, null);
  assert.equal(result.value.discountAmount, null);
  assert.equal(result.issues.filter(i => ['total', 'subtotal', 'descuento'].includes(i.field)).length, 3);
});

test('missing stock is unknown when mobile sync_inventory omitted it', () => {
  const { cantidad, ...input } = product;
  const { value, issues } = readMobileProduct(product.codigo, input);
  assert.equal(value.stock, null);
  assert.ok(issues.some(i => i.field === 'cantidad'));
  assert.equal(readMobileProduct(product.codigo, { ...product, cantidad: '0' }).value.stock, '0');
});

test('legacy numeric product amounts are flagged for compatibility review', () => {
  const { value, issues } = readMobileProduct(product.codigo, { ...product, valor: 30 });
  assert.equal(value.unitPrice, '30');
  assert.ok(issues.some(i => i.field === 'valor' && i.code === 'numeric-storage-type'));
});

test('expense amount remains numeric and compact day becomes a civil date', () => {
  const { value, issues } = readMobileExpense(expense.expense_id, expense);
  assert.equal(value.amount, 12500.5);
  assert.equal(value.businessDate, '2026-09-22');
  assert.equal(value.category, 'Transport');
  assert.deepEqual(issues, []);
});

test('unknown historical expense categories are not erased', () => {
  assert.equal(readMobileExpense(expense.expense_id, { ...expense, category: 'Categoría histórica' }).value.category, 'Categoría histórica');
});

test('missing expense_id uses the document ID and emits an issue', () => {
  const { expense_id, ...input } = expense;
  const { value, issues } = readMobileExpense('EXP-TEST-1', input);
  assert.equal(value.expenseId, 'EXP-TEST-1');
  assert.ok(issues.some(i => i.field === 'expense_id'));
});

test('client local and phone remain stable strings', () => {
  const { value, issues } = readMobileClient(client.local, client);
  assert.equal(value.local, client.local);
  assert.equal(value.phone, '000000');
  assert.deepEqual(issues, []);
});

test('tombstones stay visible to the repository for synchronization', () => {
  assert.equal(readMobileProduct(product.codigo, { ...product, eliminado: true }).value.deleted, true);
  assert.equal(readMobileClient(client.local, { ...client, eliminado: true }).value.deleted, true);
  assert.equal(readMobileSale(sale.factura, { ...sale, eliminado: true }).value.deleted, true);
});

test('civil dates are not shifted by machine timezone or display date', () => {
  const { value } = readMobileSale(sale.factura, { ...sale, fecha2: '2026-01-01', fecha: '12-31-2025 23:59:00' });
  assert.equal(value.businessDate, '2026-01-01');
  assert.equal(value.displayDate, '12-31-2025 23:59:00');
});

test('valid leap years work; impossible dates and wrong formats fail explicitly', () => {
  assert.equal(readMobileSale(sale.factura, { ...sale, fecha2: '2024-02-29' }).value.businessDate, '2024-02-29');
  for (const fecha2 of ['2026-02-29', '2026-04-31', '1900-02-29', '2026-00-01', '2026-01-00', '0000-01-01', '20260922']) {
    assert.throws(() => readMobileSale(sale.factura, { ...sale, fecha2 }), MobileContractError);
  }
  assert.throws(() => readMobileExpense(expense.expense_id, { ...expense, date2: '2026-09-22' }), MobileContractError);
});

test('ambiguous formatted money and malformed numbers do not become zero', () => {
  for (const valor of ['', 'COP 30', '1,000', '30abc', NaN, Infinity, null, true, {}]) {
    assert.throws(() => readMobileProduct(product.codigo, { ...product, valor }), MobileContractError);
  }
  assert.throws(() => readMobileExpense(expense.expense_id, { ...expense, amount: '12500.50' }), MobileContractError);
});

test('input records are never mutated and existing timestamps are preserved', () => {
  const input = Object.freeze({ ...sale, productos: Object.freeze(sale.productos.map(p => Object.freeze({ ...p }))) });
  const before = JSON.stringify(input);
  const { value } = readMobileSale(sale.factura, input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(value.lastModified, timestamp);
});

test('missing role, timestamp and deletion state remain explicit unknowns', () => {
  const { role, ultima_modificacion, eliminado, ...input } = sale;
  const { value, issues } = readMobileSale(sale.factura, input);
  assert.equal(value.sellerRole, null);
  assert.equal(value.lastModified, null);
  assert.equal(value.deleted, null);
  for (const field of ['role', 'ultima_modificacion', 'eliminado']) {
    assert.ok(issues.some(i => i.field === field));
  }
});

test('malformed records fail without including raw customer values in errors', () => {
  assert.throws(() => readMobileSale(sale.factura, { ...sale, pagado: 'PRIVATE_CUSTOMER_VALUE' }), error => {
    assert.ok(error instanceof MobileContractError);
    assert.equal(error.field, 'pagado');
    assert.ok(!error.message.includes('PRIVATE_CUSTOMER_VALUE'));
    return true;
  });
  for (const input of [null, [], true, { ...sale, productos: [] }, { ...sale, productos: [null] }]) {
    assert.throws(() => readMobileSale(sale.factura, input), MobileContractError);
  }
});
