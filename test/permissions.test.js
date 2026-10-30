const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { getDb } = require('../lib/db');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const CARTAS = '/api/_test/cartas';
const ADMIN = '/api/_test/admin';

test('el ADMIN tiene todo', async () => {
  const { user, password } = h.makeUser({ role: 'ADMIN', modules: [] });
  const token = await h.login(user.email, password);
  assert.equal((await h.request('GET', CARTAS, { token })).status, 200);
  assert.equal((await h.request('GET', ADMIN, { token })).status, 200);
});

test('OPERADOR con el módulo entra; a lo de ADMIN recibe 403 FORBIDDEN', async () => {
  const { user, password } = h.makeUser({ modules: ['CARTAS'] });
  const token = await h.login(user.email, password);
  assert.equal((await h.request('GET', CARTAS, { token })).status, 200);
  const r = await h.request('GET', ADMIN, { token });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'No tienes permiso para realizar esta acción.', code: 'FORBIDDEN' });
});

test('OPERADOR sin el módulo → 403 MODULE_FORBIDDEN con el nombre del módulo', async () => {
  const { user, password } = h.makeUser({ modules: [] });
  const token = await h.login(user.email, password);
  const r = await h.request('GET', CARTAS, { token });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'MODULE_FORBIDDEN');
  assert.equal(r.body.error, 'No tienes acceso al módulo Cartas de Navidad.');
});

test('los permisos se leen en cada petición: quitar el módulo tiene efecto inmediato', async () => {
  const { user, password } = h.makeUser({ modules: ['CARTAS'] });
  const token = await h.login(user.email, password);
  assert.equal((await h.request('GET', CARTAS, { token })).status, 200);
  getDb().prepare('DELETE FROM user_module_permissions WHERE user_id = ?').run(user.id);
  assert.equal((await h.request('GET', CARTAS, { token })).status, 403);
});

test('ruta protegida sin token → 401', async () => {
  const r = await h.request('GET', CARTAS);
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'NOT_AUTHENTICATED');
});
