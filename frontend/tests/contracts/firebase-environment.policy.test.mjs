import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFirebaseEnvironment } from '../../src/app/core/integration/firebase-environment.policy.ts';

const emulator = () => ({ production: false, firebase: { projectId: 'demo-admondash' },
  localRealFirestoreTestOwnerUid: null, emulators: { authUrl: 'http://127.0.0.1:9099',
    firestoreHost: '127.0.0.1', firestorePort: 8080, functionsHost: 'localhost', functionsPort: 5001 } });
test('isolated demo and normal production configurations are admitted', () => {
  assert.doesNotThrow(() => assertFirebaseEnvironment(emulator()));
  assert.doesNotThrow(() => assertFirebaseEnvironment({ production: true, firebase: { projectId: 'real-project' }, emulators: null, localRealFirestoreTestOwnerUid: null }));
});
test('emulator configuration cannot target a real project or host', () => {
  for (const change of [
    c => { c.firebase.projectId = 'real-project'; },
    c => { c.emulators.firestoreHost = 'example.com'; },
    c => { c.emulators.authUrl = 'https://example.com:9099'; },
    c => { c.emulators.functionsPort = 0; },
    c => { c.localRealFirestoreTestOwnerUid = 'real-owner'; },
    c => { c.emulators.authUrl = 'http://127.0.0.1:9099/?token=x'; },
  ]) {
    const config = emulator(); change(config);
    assert.throws(() => assertFirebaseEnvironment(config));
  }
});
test('production refuses test exceptions and demo projects cannot bypass emulators', () => {
  assert.throws(() => assertFirebaseEnvironment({ ...emulator(), production: true }));
  assert.throws(() => assertFirebaseEnvironment({ ...emulator(), emulators: null }));
  assert.throws(() => assertFirebaseEnvironment({ production: true, firebase: { projectId: 'real-project' }, emulators: null, localRealFirestoreTestOwnerUid: 'test-owner' }));
});
