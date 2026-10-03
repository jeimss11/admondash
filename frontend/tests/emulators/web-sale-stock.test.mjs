import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import ts from 'typescript';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';

// Load the exact production transaction; transform TS and resolve its two imports only.
const sourceUrl = new URL('../../src/app/modules/sales/services/web-sale-stock.transaction.ts', import.meta.url);
const source = (await readFile(sourceUrl, 'utf8'))
  .replaceAll("'firebase/firestore'", JSON.stringify(import.meta.resolve('firebase/firestore')))
  .replaceAll("'./web-sale-stock.policy'", JSON.stringify(new URL('../../src/app/modules/sales/services/web-sale-stock.policy.ts', import.meta.url).href));
const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const { createWebSaleWithStock, cancelWebSaleWithStock } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const projectId = 'demo-admondash';
let app, auth, firestore, ownerUid;
before(async () => {
  app = initializeApp({projectId, apiKey: 'demo-key', authDomain: `${projectId}.firebaseapp.com`}, `web-stock-tests-${Date.now()}`);
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true});
  firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  ownerUid = (await signInAnonymously(auth)).user.uid;
});
after(async () => { if (auth) await signOut(auth); if (app) await deleteApp(app); });
const productRef = code => doc(firestore, `usuarios/${ownerUid}/productos/${code}`);
const saleRef = id => doc(firestore, `usuarios/${ownerUid}/ventas_appweb/${id}`);
function sale(id, code, quantity = '1') {
  return {factura: id, cliente: 'Sintético', ownerUid, createdByUid: ownerUid, role: 'admon',
    total: '10', subtotal: '10', descuento: '0', discountType: 'amount', discountAmount: '0', eliminado: false,
    productos: [{codigo: code, nombre: 'Sintético', cantidad: quantity, precio: '10', subtotal: '10', total: '10'}]};
}
async function product(code, quantity) { await setDoc(productRef(code), {codigo: code, nombre: 'Sintético', eliminado: false, ...(quantity === undefined ? {} : {cantidad: quantity})}); }
test('two different sales compete for the last unit; only one is committed', async () => {
  await product('last-unit', '1');
  const results = await Promise.allSettled(['last-a', 'last-b'].map(id => createWebSaleWithStock(firestore, ownerUid, id, sale(id, 'last-unit'))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await getDoc(productRef('last-unit'))).data().cantidad, '0');
  assert.equal((await Promise.all(['last-a', 'last-b'].map(id => getDoc(saleRef(id))))).filter(s => s.exists()).length, 1);
});
test('same invoice concurrent retries discount stock only once; conflicts are refused', async () => {
  await product('retry', '3');
  const payload = sale('retry-invoice', 'retry');
  const results = await Promise.all([1, 2].map(() => createWebSaleWithStock(firestore, ownerUid, 'retry-invoice', payload)));
  assert.deepEqual(results.sort(), ['already-exists', 'created']);
  assert.equal((await getDoc(productRef('retry'))).data().cantidad, '2');
  await assert.rejects(createWebSaleWithStock(firestore, ownerUid, 'retry-invoice', {...payload, cliente: 'Otro'}), /otros datos/);
  assert.equal((await getDoc(productRef('retry'))).data().cantidad, '2');
});
test('unknown and insufficient stock leave invoice and all products unchanged', async () => {
  await product('unknown'); await product('enough', '2');
  const payload = sale('invalid', 'enough');
  payload.productos.push({...payload.productos[0], codigo: 'unknown'});
  await assert.rejects(createWebSaleWithStock(firestore, ownerUid, 'invalid', payload), /informada/);
  assert.equal((await getDoc(saleRef('invalid'))).exists(), false);
  assert.equal((await getDoc(productRef('enough'))).data().cantidad, '2');
  await assert.rejects(createWebSaleWithStock(firestore, ownerUid, 'excess', sale('excess', 'enough', '3')), /insuficiente/);
  assert.equal((await getDoc(saleRef('excess'))).exists(), false);
});
test('duplicate fractional lines deduct and concurrent annulment restores exactly once', async () => {
  await product('fraction', '0.3');
  const payload = sale('fraction-invoice', 'fraction', '0.1');
  payload.productos.push({...payload.productos[0], cantidad: '0.2'});
  await createWebSaleWithStock(firestore, ownerUid, 'fraction-invoice', payload);
  assert.equal((await getDoc(productRef('fraction'))).data().cantidad, '0');
  await Promise.all([1, 2].map(() => cancelWebSaleWithStock(firestore, ownerUid, 'fraction-invoice', ownerUid, 'admon')));
  assert.equal((await getDoc(productRef('fraction'))).data().cantidad, '0.3');
  const persisted = (await getDoc(saleRef('fraction-invoice'))).data();
  assert.equal(persisted.eliminado, true); assert.equal(persisted.stockReversal.entries.length, 1);
  assert.equal(persisted.stockImpact.entries[0].before, '0.3');
  await assert.rejects(createWebSaleWithStock(firestore, ownerUid, 'fraction-invoice', payload), /anulada/);
});
test('historical invoice cancellation never invents inventory restoration', async () => {
  await product('legacy', '5');
  await setDoc(saleRef('legacy-invoice'), sale('legacy-invoice', 'legacy'));
  await cancelWebSaleWithStock(firestore, ownerUid, 'legacy-invoice', ownerUid, 'admon');
  assert.equal((await getDoc(productRef('legacy'))).data().cantidad, '5');
  assert.equal((await getDoc(saleRef('legacy-invoice'))).data().annulment.stockRestored, false);
});
test('session changing after reads prevents stock and sale commit', async () => {
  await product('session', '5');
  let calls = 0;
  await assert.rejects(createWebSaleWithStock(firestore, ownerUid, 'session-invoice', sale('session-invoice', 'session'), () => {
    if (++calls > 1) throw new Error('Sesión cambió');
  }), /Sesión cambió/);
  assert.equal((await getDoc(productRef('session'))).data().cantidad, '5');
  assert.equal((await getDoc(saleRef('session-invoice'))).exists(), false);
});
test('mobile sales remain completely untouched', async () => {
  const mobile = doc(firestore, `usuarios/${ownerUid}/ventas/mobile-evidence`);
  const original = {factura: 'mobile-evidence', productos: [], pagado: true};
  await setDoc(mobile, original); await product('mobile-safe', '2');
  await createWebSaleWithStock(firestore, ownerUid, 'mobile-safe-invoice', sale('mobile-safe-invoice', 'mobile-safe'));
  assert.deepEqual((await getDoc(mobile)).data(), original);
  assert.equal((await getDocs(collection(firestore, `usuarios/${ownerUid}/ventas`))).size, 1);
});
test('corrupted impact refuses annulment without changing sale or stock', async () => {
  await product('corrupt', '5');
  await createWebSaleWithStock(firestore, ownerUid, 'corrupt-invoice', sale('corrupt-invoice', 'corrupt'));
  const snapshot = (await getDoc(saleRef('corrupt-invoice'))).data();
  snapshot.stockImpact.entries[0].cantidad = '4';
  await setDoc(saleRef('corrupt-invoice'), snapshot);
  await assert.rejects(cancelWebSaleWithStock(firestore, ownerUid, 'corrupt-invoice', ownerUid, 'admon'), /evidencia/);
  assert.equal((await getDoc(productRef('corrupt'))).data().cantidad, '4');
  assert.equal((await getDoc(saleRef('corrupt-invoice'))).data().eliminado, false);
});
