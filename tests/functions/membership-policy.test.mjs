import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmail, permissionsFor, resolveRole } from '../../functions/lib/membership-policy.js';

test('normaliza correo y no acepta formatos ambiguos', () => {
  assert.equal(normalizeEmail(' Colaborador@Ejemplo.co '), 'colaborador@ejemplo.co');
  assert.throws(() => normalizeEmail('sin-arroba'));
});

test('solo admite roles explícitos y devuelve permisos independientes', () => {
  assert.equal(resolveRole('operador'), 'operador');
  assert.throws(() => resolveRole('dueño'));
  const permissions = permissionsFor('consulta');
  permissions['reportes.leer'] = false;
  assert.equal(permissionsFor('consulta')['reportes.leer'], true);
});
