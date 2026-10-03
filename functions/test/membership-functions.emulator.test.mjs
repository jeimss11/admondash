import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

const projectId = 'demo-admondash';
const authHost = 'http://127.0.0.1:9099';
const firestoreHost = 'http://127.0.0.1:8080';
const functionsHost = 'http://127.0.0.1:5001';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = projectId;

const { getApps, initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');
if (getApps().length === 0) initializeApp({ projectId });
const auth = getAuth();
const firestore = getFirestore();

async function clearEmulators() {
  const authResponse = await fetch(`${authHost}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
  assert.equal(authResponse.ok, true, 'Falló la limpieza de Auth Emulator demo.');
  const firestoreResponse = await fetch(`${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  assert.equal(firestoreResponse.ok, true, 'Falló la limpieza de Firestore Emulator demo.');
}

async function idToken(email, password) {
  const response = await fetch(
    `${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload.idToken;
}

async function call(name, token, data) {
  const { response, payload } = await callResponse(name, token, data);
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload.result;
}

async function callResponse(name, token, data) {
  const response = await fetch(`${functionsHost}/${projectId}/us-central1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const payload = await response.json();
  return { response, payload };
}

async function expectCallableError(name, token, data, status) {
  const { response, payload } = await callResponse(name, token, data);
  assert.equal(response.ok, false, JSON.stringify(payload));
  assert.equal(payload.error?.status, status, JSON.stringify(payload));
}

async function seedMember(name, ownerUid = 'owner-function') {
  const uid = `member-${name}`;
  const email = `${name}@example.test`;
  const password = 'Synthetic-Member-123!';
  // Fixture provisioning occurs only through the demo Auth emulator Admin SDK.
  // There is deliberately no callable account-creation endpoint or production write.
  await auth.createUser({ uid, email, password });
  const reference = firestore.doc(`negocios/${ownerUid}/miembros/${uid}`);
  await reference.set({ uid, email, role: 'operador', estado: 'activo', permisos: { 'ventas.leer': true } });
  return { uid, reference, token: await idToken(email, password) };
}

before(async () => {
  await clearEmulators();
  await auth.createUser({
    uid: 'owner-function', email: 'owner@example.test', password: 'Owner-Password-123!', emailVerified: true,
  });
});

after(async () => {
  await clearEmulators();
});

test('resuelve una membresía sintética preexistente y la revoca sin cambiar Auth ni sesiones móviles', async () => {
  const ownerToken = await idToken('owner@example.test', 'Owner-Password-123!');
  const member = await seedMember('resolution');
  const sessionRef = firestore.doc('usuarios/owner-function/sesiones/synthetic-mobile-session');
  const mobileSession = { is_sesion_activa: true, suscription_token: 'synthetic-token' };
  await sessionRef.set(mobileSession);
  const accountBefore = await auth.getUser(member.uid);
  const resolved = await call('resolveMyMembership', member.token, {});
  assert.equal(resolved.ownerUid, 'owner-function');
  assert.equal(resolved.role, 'operador');
  assert.equal(resolved.permissions['ventas.leer'], true);
  assert.equal('password' in (await member.reference.get()).data(), false);
  assert.equal((await call('revokeMember', ownerToken, { memberUid: member.uid })).status, 'revoked');
  const revoked = (await member.reference.get()).data();
  assert.equal(revoked.estado, 'revocado');
  assert.equal(revoked.revokedByUid, 'owner-function');
  assert.ok(revoked.revokedAt);
  assert.equal(await call('resolveMyMembership', member.token, {}), null);
  const accountAfter = await auth.getUser(member.uid);
  assert.equal(accountAfter.email, accountBefore.email);
  assert.equal(accountAfter.disabled, accountBefore.disabled);
  assert.deepEqual((await sessionRef.get()).data(), mobileSession);
  const audit = await firestore.collection('negocios/owner-function/auditoria').where('memberUid', '==', member.uid).get();
  assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].data().tipo, 'membresia.revocada');
});

test('una cuenta sin membresía activa no resuelve un negocio', async () => {
  const ownerToken = await idToken('owner@example.test', 'Owner-Password-123!');
  assert.equal(await call('resolveMyMembership', ownerToken, {}), null);
});

test('ambas funciones requieren autenticación', async () => {
  await expectCallableError('resolveMyMembership', null, {}, 'UNAUTHENTICATED');
  await expectCallableError('revokeMember', null, { memberUid: 'member-resolution' }, 'UNAUTHENTICATED');
});

test('un colaborador no revoca la membresía del dueño de otro negocio', async () => {
  const member = await seedMember('no-cross-owner');
  const target = await seedMember('cross-owner-target');
  await expectCallableError('revokeMember', member.token, { memberUid: member.uid }, 'INVALID_ARGUMENT');
  await expectCallableError('revokeMember', member.token, { memberUid: target.uid }, 'NOT_FOUND');
  assert.equal((await member.reference.get()).data().estado, 'activo');
  assert.equal((await target.reference.get()).data().estado, 'activo');
});

test('rechaza revocación propia, inválida o inexistente', async () => {
  const ownerToken = await idToken('owner@example.test', 'Owner-Password-123!');
  for (const memberUid of ['owner-function', '', 12]) {
    await expectCallableError('revokeMember', ownerToken, { memberUid }, 'INVALID_ARGUMENT');
  }
  await expectCallableError('revokeMember', ownerToken, { memberUid: 'synthetic-missing' }, 'NOT_FOUND');
});

test('más de un negocio activo exige una selección explícita', async () => {
  const member = await seedMember('ambiguous');
  await firestore.doc(`negocios/second-synthetic-owner/miembros/${member.uid}`).set({
    uid: member.uid, estado: 'activo', role: 'consulta', permisos: {},
  });
  await expectCallableError('resolveMyMembership', member.token, {}, 'FAILED_PRECONDITION');
});
