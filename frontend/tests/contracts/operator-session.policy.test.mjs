import assert from 'node:assert/strict';
import test from 'node:test';
import { operatorStorageKey, assertOperatorSessionUnchanged } from '../../src/app/core/integration/operator-session.policy.ts';

test('a remembered operator cannot be reused by another Firebase account', () => {
  assert.notEqual(operatorStorageKey('owner-A'), operatorStorageKey('owner-B'));
  assert.throws(() => operatorStorageKey(''), /autenticada/);
});

test('late password validation is rejected after logout, account change, or selection release', () => {
  assert.doesNotThrow(() => assertOperatorSessionUnchanged('A', 'A', 1, 1));
  assert.throws(() => assertOperatorSessionUnchanged('A', null, 1, 2), /sesión cambió/);
  assert.throws(() => assertOperatorSessionUnchanged('A', 'B', 1, 2), /sesión cambió/);
  assert.throws(() => assertOperatorSessionUnchanged('A', 'A', 1, 2), /sesión cambió/);
});
