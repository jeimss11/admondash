import { readFileSync } from 'node:fs';
import { after, afterEach, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

const projectId = 'demo-admondash';
const rules = readFileSync('firebase/emulator/firestore.rules', 'utf8');
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules },
  });
});

afterEach(async () => {
  await environment.clearFirestore();
});

after(async () => {
  await environment.cleanup();
});

async function seedBusiness() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await firestore.doc('negocios/owner-a').set({ nombre: 'Negocio sintético' });
    await firestore.doc('negocios/owner-a/miembros/member-catalog').set({
      estado: 'activo',
      permisos: { 'catalogo.leer': true },
    });
    await firestore.doc('negocios/owner-a/miembros/member-inactive').set({
      estado: 'revocado',
      permisos: { 'catalogo.leer': true, 'reportes.leer': true },
    });
    await firestore.doc('usuarios/owner-a/productos/producto-1').set({
      codigo: 'producto-1', nombre: 'Producto de ensayo', valor: '1000', eliminado: false,
    });
    await firestore.doc('usuarios/owner-a/ventas/factura-1').set({ factura: 'factura-1' });
    await firestore.doc('usuarios/owner-a/sesiones/session-mobile').set({ token: 'synthetic-only' });
  });
}

test('una persona sin sesión no puede leer datos del negocio', async () => {
  await seedBusiness();
  const anonymous = environment.unauthenticatedContext().firestore();
  await assertFails(anonymous.doc('usuarios/owner-a/productos/producto-1').get());
});

test('el dueño conserva el acceso legado a su árbol móvil', async () => {
  await seedBusiness();
  const owner = environment.authenticatedContext('owner-a').firestore();
  await assertSucceeds(owner.doc('usuarios/owner-a/productos/producto-1').get());
  await assertSucceeds(owner.doc('usuarios/owner-a/sesiones/session-mobile').get());
});

test('un colaborador activo solo puede consultar el módulo permitido', async () => {
  await seedBusiness();
  const member = environment.authenticatedContext('member-catalog').firestore();
  await assertSucceeds(member.doc('usuarios/owner-a/productos/producto-1').get());
  await assertFails(member.doc('usuarios/owner-a/ventas/factura-1').get());
  await assertFails(member.doc('usuarios/owner-a/sesiones/session-mobile').get());
  await assertFails(member.doc('usuarios/owner-a/productos/producto-1').update({ nombre: 'Cambio no autorizado' }));
});

test('un colaborador no puede autoasignarse permisos ni acceder a otro negocio', async () => {
  await seedBusiness();
  const member = environment.authenticatedContext('member-catalog').firestore();
  await assertSucceeds(member.doc('negocios/owner-a/miembros/member-catalog').get());
  await assertFails(member.doc('negocios/owner-a/miembros/member-catalog').update({
    permisos: { 'reportes.leer': true },
  }));
  await assertFails(member.doc('usuarios/owner-b/productos/producto-1').get());
});

test('una membresía revocada pierde el acceso inmediatamente', async () => {
  await seedBusiness();
  const revoked = environment.authenticatedContext('member-inactive').firestore();
  await assertFails(revoked.doc('usuarios/owner-a/productos/producto-1').get());
});

test('el libro administrativo es inmutable y solo el dueño puede registrar movimientos', async () => {
  await seedBusiness();
  const movementPath = 'negocios/owner-a/inventario_movimientos/load_op-1_line-1';
  const owner = environment.authenticatedContext('owner-a').firestore();
  const member = environment.authenticatedContext('member-catalog').firestore();
  const movement = {
    id: 'load_op-1_line-1', operationId: 'op-1', sourceId: 'line-1', kind: 'load',
    productCode: 'producto-1', productName: 'Producto de ensayo', quantity: 1.5,
    distributorId: 'seller1', actorUid: 'owner-a', mode: 'by-seller', ownerUid: 'owner-a',
  };
  await assertSucceeds(owner.doc(movementPath).set(movement));
  await assertFails(owner.doc(movementPath).update({ quantity: 2 }));
  await assertFails(owner.doc(movementPath).delete());
  await assertFails(member.doc('negocios/owner-a/inventario_movimientos/load_op-1_other').set(movement));
});
