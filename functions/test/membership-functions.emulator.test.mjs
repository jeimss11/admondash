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
  await fetch(`${authHost}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
  await fetch(`${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
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
  const response = await fetch(`${functionsHost}/${projectId}/us-central1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload.result;
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

test('el dueño crea, asigna permisos y revoca una cuenta sin guardar la contraseña', async () => {
  const ownerToken = await idToken('owner@example.test', 'Owner-Password-123!');
  const created = await call('provisionMember', ownerToken, {
    email: 'member@example.test', password: 'Member-Password-123!', role: 'operador',
  });
  assert.equal(created.email, 'member@example.test');
  assert.equal(created.role, 'operador');
  assert.equal(typeof created.uid, 'string');

  const account = await auth.getUser(created.uid);
  assert.equal(account.emailVerified, false);

  const memberToken = await idToken('member@example.test', 'Member-Password-123!');
  const membershipRef = firestore.doc(`negocios/owner-function/miembros/${created.uid}`);
  const activeMembership = await membershipRef.get();
  assert.equal(activeMembership.data().estado, 'activo');
  assert.equal(activeMembership.data().email, 'member@example.test');
  assert.equal(activeMembership.data().permisos['ventas.leer'], true);
  assert.equal('password' in activeMembership.data(), false);

  const resolved = await call('resolveMyMembership', memberToken, {});
  assert.equal(resolved.ownerUid, 'owner-function');
  assert.equal(resolved.role, 'operador');
  assert.equal(resolved.permissions['ventas.leer'], true);

  await call('revokeMember', ownerToken, { memberUid: created.uid });
  assert.equal((await membershipRef.get()).data().estado, 'revocado');
  assert.equal(await call('resolveMyMembership', memberToken, {}), null);
});
