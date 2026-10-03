import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { persistInvoiceCollection, administrativeInvoiceId } from '../../src/app/modules/distributors/services/invoice-payment.policy.ts';
import { persistActiveOperationRecord } from '../../src/app/modules/distributors/services/operation-record.policy.ts';

const projectId = 'demo-admondash';
let app, auth, firestore, ownerUid;
before(async () => {
  app = initializeApp({ projectId, apiKey: 'demo-key', authDomain: `${projectId}.firebaseapp.com` }, `distributor-tests-${Date.now()}`);
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  ownerUid = (await signInAnonymously(auth)).user.uid;
});
after(async () => { if (auth) await signOut(auth); if (app) await deleteApp(app); });

async function fixture(name, state = 'activa') {
  const operationId = `synthetic-${name}`;
  const operationRef = doc(firestore, `usuarios/${ownerUid}/gestionDiaria/${operationId}`);
  await setDoc(operationRef, { estado: state, operationRevision: 0 });
  const factura = { id: administrativeInvoiceId(name), operacionId: operationId, numeroFactura: name,
    monto: 100, montoPagado: 0, montoDelDia: 0, estado: 'pendiente' };
  const invoiceRef = doc(collection(operationRef, 'facturas_pendientes'), factura.id);
  await setDoc(invoiceRef, factura);
  return { operationId, operationRef, invoiceRef, factura };
}

test('two concurrent partial collections keep both amounts and audit receipts', async () => {
  const f = await fixture('partial');
  await Promise.all([30, 40].map((amount) => persistInvoiceCollection(firestore, ownerUid, f.operationId, f.factura, amount, ownerUid)));
  const invoice = (await getDoc(f.invoiceRef)).data();
  assert.equal(invoice.montoPagado, 70);
  assert.equal(invoice.montoDelDia, 70);
  assert.equal((await getDocs(collection(f.invoiceRef, 'auditoria_cobros'))).size, 2);
  assert.equal((await getDoc(f.operationRef)).data().operationRevision, 2);
});

test('two simultaneous full payments collect only once', async () => {
  const f = await fixture('full');
  const results = await Promise.allSettled([1, 2].map(() => persistInvoiceCollection(firestore, ownerUid, f.operationId, f.factura, 'remaining', ownerUid)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await getDoc(f.invoiceRef)).data().montoPagado, 100);
  assert.equal((await getDocs(collection(f.invoiceRef, 'auditoria_cobros'))).size, 1);
});

test('concurrent overpayments cannot exceed the outstanding balance', async () => {
  const f = await fixture('overpayment');
  const results = await Promise.allSettled([1, 2].map(() => persistInvoiceCollection(firestore, ownerUid, f.operationId, f.factura, 70, ownerUid)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await getDoc(f.invoiceRef)).data().montoPagado, 70);
});

test('closed operations reject collections and preserve evidence', async () => {
  const f = await fixture('closed', 'cerrada');
  await assert.rejects(persistInvoiceCollection(firestore, ownerUid, f.operationId, f.factura, 10, ownerUid), /activa/);
  assert.equal((await getDoc(f.invoiceRef)).data().montoPagado, 0);
  assert.equal((await getDocs(collection(f.invoiceRef, 'auditoria_cobros'))).size, 0);
});

test('a collection creates administrative evidence while preserving the mobile sale', async () => {
  const f = await fixture('mobile');
  const mobileRef = doc(firestore, `usuarios/${ownerUid}/ventas/synthetic-mobile-9`);
  const sale = { factura: 'synthetic-mobile-9', total: '100', pagado: false, eliminado: false };
  await setDoc(mobileRef, sale);
  const mobileInvoice = { ...f.factura, id: 'venta-synthetic-mobile-9', ventaMovilId: 'synthetic-mobile-9', numeroFactura: sale.factura };
  await persistInvoiceCollection(firestore, ownerUid, f.operationId, mobileInvoice, 20, ownerUid);
  assert.deepEqual((await getDoc(mobileRef)).data(), sale);
  const administrativeRef = doc(collection(f.operationRef, 'facturas_pendientes'), administrativeInvoiceId(sale.factura));
  assert.equal((await getDoc(administrativeRef)).data().montoPagado, 20);
});

test('replaying the same receipt collects once and can acknowledge after closing', async () => {
  const f = await fixture('retry-receipt');
  await Promise.all([1, 2].map(() => persistInvoiceCollection(firestore, ownerUid, f.operationId, f.factura, 20, ownerUid, 'request-1')));
  assert.equal((await getDoc(f.invoiceRef)).data().montoPagado, 20);
  assert.equal((await getDocs(collection(f.invoiceRef, 'auditoria_cobros'))).size, 1);
  await setDoc(f.operationRef, { estado: 'cerrada' }, { merge: true });
  await persistInvoiceCollection(firestore, ownerUid, f.operationId, f.factura, 20, ownerUid, 'request-1');
  assert.equal((await getDoc(f.invoiceRef)).data().montoPagado, 20);
  await assert.rejects(persistInvoiceCollection(firestore, ownerUid, f.operationId, f.factura, 30, ownerUid, 'request-1'), /otros datos/);
});

test('missing mobile payment state cannot become an administrative collection', async () => {
  const f = await fixture('unknown-payment');
  const mobileRef = doc(firestore, `usuarios/${ownerUid}/ventas/synthetic-unknown-9`);
  await setDoc(mobileRef, { factura: 'synthetic-unknown-9', total: '100', eliminado: false });
  const mobileInvoice = { ...f.factura, id: 'venta-synthetic-unknown-9', ventaMovilId: 'synthetic-unknown-9', numeroFactura: 'synthetic-unknown-9' };
  await assert.rejects(persistInvoiceCollection(firestore, ownerUid, f.operationId, mobileInvoice, 20, ownerUid), /venta móvil cambió/);
  const administrativeRef = doc(collection(f.operationRef, 'facturas_pendientes'), administrativeInvoiceId(mobileInvoice.numeroFactura));
  assert.equal((await getDoc(administrativeRef)).exists(), false);
});

test('concurrent movement retries preserve a single record and operation revision', async () => {
  const f = await fixture('movement-retry');
  const reference = doc(collection(f.operationRef, 'productos_cargados'), 'request-1');
  const evidence = { id: 'request-1', productoId: 'code', cantidad: 1.25, total: 12.5, fechaCarga: 'original' };
  await Promise.all([1, 2].map(() => persistActiveOperationRecord(firestore, reference, evidence)));
  assert.equal((await getDoc(f.operationRef)).data().operationRevision, 1);
  await persistActiveOperationRecord(firestore, reference, { ...evidence, fechaCarga: 'retry-date' });
  assert.equal((await getDoc(reference)).data().fechaCarga, 'original');
  await assert.rejects(persistActiveOperationRecord(firestore, reference, { ...evidence, cantidad: 2 }), /otros datos/);
  await setDoc(f.operationRef, { estado: 'cerrada' }, { merge: true });
  await persistActiveOperationRecord(firestore, reference, evidence);
  await assert.rejects(persistActiveOperationRecord(firestore,
    doc(collection(f.operationRef, 'productos_cargados'), 'new-request'), evidence), /activa/);
});

test('session changing after movement reads leaves operation and evidence untouched', async () => {
  const f = await fixture('movement-session');
  const reference = doc(collection(f.operationRef, 'productos_cargados'), 'new-request');
  let checks = 0;
  await assert.rejects(persistActiveOperationRecord(firestore, reference, { cantidad: 1 }, () => {
    if (++checks === 3) throw new Error('La sesión cambió');
  }), /sesión cambió/);
  assert.equal((await getDoc(reference)).exists(), false);
  assert.equal((await getDoc(f.operationRef)).data().operationRevision ?? 0, 0);
});
