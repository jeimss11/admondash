import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import ts from 'typescript';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { inventoryMovementId, createInventoryReversal } from '../../src/app/modules/inventory/services/inventory-ledger.policy.ts';

const serviceBase = new URL('../../src/app/modules/inventory/services/', import.meta.url);
const source = (await readFile(new URL('inventory-write.transaction.ts', serviceBase), 'utf8'))
  .replaceAll("'firebase/firestore'", JSON.stringify(import.meta.resolve('firebase/firestore')))
  .replaceAll("'./inventory-configuration.policy'", JSON.stringify(new URL('inventory-configuration.policy.ts', serviceBase).href))
  .replaceAll("'./inventory-ledger.policy'", JSON.stringify(new URL('inventory-ledger.policy.ts', serviceBase).href));
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { saveInventoryConfiguration, recordInventoryMovement } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const projectId = 'demo-admondash';
let app, auth, firestore, ownerUid;
const guard = () => {};
const configurationRef = () => doc(firestore, `negocios/${ownerUid}/configuracion/inventario`);
const movementRef = movement => doc(firestore, `negocios/${ownerUid}/inventario_movimientos/${inventoryMovementId(movement)}`);
const movement = sourceId => ({ operationId: 'synthetic-operation', sourceId, kind: 'load', productCode: 'P-test', productName: 'Synthetic', quantity: 1.25, distributorId: 'seller-test', actorUid: ownerUid, mode: 'central' });
before(async () => {
  app = initializeApp({ projectId, apiKey: 'demo-key', authDomain: `${projectId}.firebaseapp.com` }, `inventory-tests-${Date.now()}`);
  auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  ownerUid = (await signInAnonymously(auth)).user.uid;
});
after(async () => { if (auth) await signOut(auth); if (app) await deleteApp(app); });

test('mode switch racing first movement yields one coherent mode, then locks transitions', async () => {
  const entry = movement('first-entry');
  await setDoc(configurationRef(), { mode: 'central', country: 'MX', locale: 'es-MX', currency: 'MXN', timeZone: 'America/Mexico_City', lowStockThreshold: 5 });
  const result = await Promise.allSettled([
    saveInventoryConfiguration(firestore, ownerUid, ownerUid, { mode: 'by-seller' }, 'Initial synthetic mode choice', guard),
    recordInventoryMovement(firestore, ownerUid, entry, guard),
  ]);
  assert.equal(result[1].status, 'fulfilled');
  const configuration = (await getDoc(configurationRef())).data();
  const persisted = (await getDoc(movementRef(entry))).data();
  assert.equal(persisted.mode, configuration.mode);
  assert.equal(configuration.inventoryStarted, true);
  assert.equal(persisted.destinationLocation, configuration.mode === 'central' ? 'shared-distributors' : 'distributor:seller-test');
  await assert.rejects(saveInventoryConfiguration(firestore, ownerUid, ownerUid, { mode: configuration.mode === 'central' ? 'by-seller' : 'central' }, 'Synthetic blocked transition', guard), /conciliación/);
});
test('same event retries keep one immutable receipt and conflicting reuse fails', async () => {
  const entry = movement('repeat-entry');
  await Promise.all([1, 2].map(() => recordInventoryMovement(firestore, ownerUid, entry, guard)));
  const before = (await getDoc(movementRef(entry))).data();
  await recordInventoryMovement(firestore, ownerUid, entry, guard);
  assert.deepEqual((await getDoc(movementRef(entry))).data(), before);
  await assert.rejects(recordInventoryMovement(firestore, ownerUid, { ...entry, quantity: 8 }, guard), /otro movimiento/);
});
test('threshold edit preserves the current country, currency and timezone', async () => {
  await saveInventoryConfiguration(firestore, ownerUid, ownerUid, { lowStockThreshold: 8 }, 'Synthetic threshold adjustment', guard);
  const configuration = (await getDoc(configurationRef())).data();
  assert.equal(configuration.currency, 'MXN'); assert.equal(configuration.country, 'MX');
  assert.equal(configuration.timeZone, 'America/Mexico_City'); assert.equal(configuration.lowStockThreshold, 8);
});
test('concurrent reversal retries create one compensation and keep original untouched', async () => {
  const entry = movement('reversal-entry');
  await recordInventoryMovement(firestore, ownerUid, entry, guard);
  const original = (await getDoc(movementRef(entry))).data();
  const reversed = createInventoryReversal(original, { sourceId: `reversal_${inventoryMovementId(entry)}`, actorUid: ownerUid, reason: 'Synthetic correction of wrong entry' });
  await Promise.all([1, 2].map(() => recordInventoryMovement(firestore, ownerUid, reversed, guard)));
  assert.deepEqual((await getDoc(movementRef(entry))).data(), original);
  const matches = (await getDocs(collection(firestore, `negocios/${ownerUid}/inventario_movimientos`))).docs.filter(snapshot => snapshot.data().correctionOf === inventoryMovementId(entry));
  assert.equal(matches.length, 1);
});
test('session switch after asynchronous reads leaves no inventory event', async () => {
  const entry = movement('session-change'); let checks = 0;
  await assert.rejects(recordInventoryMovement(firestore, ownerUid, entry, () => { if (++checks > 2) throw new Error('Session changed'); }), /Session changed/);
  assert.equal((await getDoc(movementRef(entry))).exists(), false);
});
