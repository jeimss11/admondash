import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import ts from 'typescript';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';

const source = (await readFile(new URL('../../src/app/modules/suppliers/services/supplier-payment.transaction.ts', import.meta.url), 'utf8'))
  .replaceAll("'firebase/firestore'", JSON.stringify(import.meta.resolve('firebase/firestore')))
  .replaceAll("'./supplier-finance.policy'", JSON.stringify(new URL('../../src/app/modules/suppliers/services/supplier-finance.policy.ts', import.meta.url).href));
const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const {recordSupplierPayment} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const projectId = 'demo-admondash';
let app, auth, firestore, ownerUid;
before(async () => {
  app = initializeApp({projectId, apiKey:'demo-key', authDomain:`${projectId}.firebaseapp.com`}, `supplier-payment-tests-${Date.now()}`);
  auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
  firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  ownerUid = (await signInAnonymously(auth)).user.uid;
});
after(async () => { if (auth) await signOut(auth); if (app) await deleteApp(app); });
const invoiceRef = id => doc(firestore, `usuarios/${ownerUid}/facturas-proveedor/${id}`);
const supplierRef = id => doc(firestore, `usuarios/${ownerUid}/proveedores/${id}`);
const pay = (id, key, amount, extra = {}) => recordSupplierPayment(firestore, ownerUid, ownerUid, id,
  {facturaId:id, operationId:key, monto:amount, tipo:'parcial', observaciones:'Sintético', ...extra});
async function invoice(id, amount = 100, status = 'pendiente') {
  await setDoc(supplierRef(id), {proveedor:'Sintético', estado:'activo', deuda_total:amount, pendiente:amount, pagado:0});
  await setDoc(invoiceRef(id), {proveedorId:id, monto:amount, montoPagado:0, estado:status, pagos:[]});
}
test('concurrent overpayments admit only one receipt and keep supplier totals consistent', async () => {
  await invoice('race');
  const results = await Promise.allSettled([pay('race','a',70),pay('race','b',70)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await getDoc(invoiceRef('race'))).data().montoPagado,70);
  assert.equal((await getDoc(supplierRef('race'))).data().pendiente,30);
  assert.equal((await getDocs(collection(invoiceRef('race'),'pagos'))).size,1);
});
test('retry is idempotent and rejects changed receipt details; dates are server timestamps', async () => {
  await invoice('retry');
  await Promise.all([pay('retry','same',40),pay('retry','same',40)]);
  assert.equal((await getDoc(invoiceRef('retry'))).data().montoPagado,40);
  const receipt = (await getDoc(doc(invoiceRef('retry'),'pagos/same'))).data();
  assert.equal(typeof receipt.fecha.toMillis(), 'number');
  assert.equal(receipt.fecha.toMillis(), receipt.fechaRegistro.toMillis());
  const summary = (await getDoc(invoiceRef('retry'))).data().pagosPorId.same;
  assert.equal(summary.fecha.toMillis(), receipt.fecha.toMillis());
  await assert.rejects(pay('retry','same',40,{observaciones:'Diferente'}), /otros datos/);
  assert.equal((await getDoc(supplierRef('retry'))).data().pagado,40);
});
test('decimal final payment closes the invoice without an artificial remainder', async () => {
  await invoice('fraction',0.3);
  await pay('fraction','one',0.2); await pay('fraction','two',0.1);
  const saved = (await getDoc(invoiceRef('fraction'))).data();
  assert.equal(saved.montoPagado,0.3); assert.equal(saved.estado,'pagada');
  await assert.rejects(pay('fraction','third',0.01),/saldo pendiente/);
});
test('annulled invoice, mismatched reference, absent supplier and changed session write nothing', async () => {
  await invoice('annulled',100,'anulada');
  await assert.rejects(pay('annulled','invalid',10),/anulada/);
  await assert.rejects(pay('annulled','mismatch',10,{facturaId:'other'}),/corresponde/);
  await setDoc(invoiceRef('orphan'), {proveedorId:'absent',monto:100,montoPagado:0,estado:'pendiente'});
  await assert.rejects(pay('orphan','invalid',10),/proveedor ya no existe/);
  await invoice('session');
  await assert.rejects(recordSupplierPayment(firestore,ownerUid,ownerUid,'session',
    {facturaId:'session',operationId:'invalid',monto:10,tipo:'parcial'},() => {throw new Error('Sesión cambió');}),/Sesión/);
  assert.equal((await getDocs(collection(invoiceRef('session'),'pagos'))).size,0);
  assert.equal((await getDoc(invoiceRef('session'))).data().montoPagado,0);
});
test('supplier numeric-string totals are preserved rather than reset by increment', async () => {
  await invoice('string-totals');
  await setDoc(supplierRef('string-totals'),{pagado:'25',pendiente:'100'},{merge:true});
  await pay('string-totals','valid',20);
  const supplier = (await getDoc(supplierRef('string-totals'))).data();
  assert.equal(supplier.pagado,45); assert.equal(supplier.pendiente,80);
});
test('missing or invalid supplier totals require reconciliation and never write a receipt', async () => {
  for (const [id, totals] of [['missing-totals',{pagado:0}],['invalid-totals',{pagado:0,pendiente:'desconocido'}]]) {
    await invoice(id); await setDoc(supplierRef(id),totals);
    await assert.rejects(pay(id,'invalid',10),/conciliación/);
    assert.equal((await getDoc(invoiceRef(id))).data().montoPagado,0);
    assert.equal((await getDocs(collection(invoiceRef(id),'pagos'))).size,0);
  }
});
