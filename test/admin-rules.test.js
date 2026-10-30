const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { getDb } = require('../lib/db');
const users = require('../services/users');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

function assertInvariant() {
  const bad = getDb().prepare("SELECT id FROM users WHERE account_status <> 'APROBADA' AND is_active <> 0").all();
  assert.deepEqual(bad, [], 'account_status ≠ APROBADA ⇒ is_active = 0');
}

test('el ADMIN no puede quitarse el rol, desactivarse, restablecerse ni eliminarse; sí editar su nombre', async () => {
  const { token, user } = await h.adminSession();
  const self = `/api/users/${user.id}`;
  for (const [method, url, body] of [
    ['PATCH', self, { role: 'OPERADOR' }],
    ['PATCH', self, { is_active: false }],
    ['POST', `${self}/reset-password`]
  ]) {
    const r = await api(method, url, token, body);
    assert.equal(r.status, 400, `${method} ${url}`);
    assert.deepEqual(r.body, { error: 'No puedes realizar esta acción sobre tu propia cuenta.', code: 'SELF_ACTION_FORBIDDEN' });
  }
  // DELETE sobre una cuenta aprobada: primero aplica el estado
  assert.equal((await api('DELETE', self, token)).body.code, 'INVALID_ACCOUNT_STATE');
  const r = await api('PATCH', self, token, { first_name: 'Admin', role: 'ADMIN', is_active: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.first_name, 'Admin');
  assertInvariant();
});

test('con actor = null, desactivar o degradar al único ADMIN → LAST_ADMIN; con dos, sí se puede', () => {
  const { user: a } = h.makeUser({ role: 'ADMIN' });
  assert.throws(() => users.updateUser(null, a.id, { is_active: false }), (e) => e.code === 'LAST_ADMIN');
  assert.throws(() => users.updateUser(null, a.id, { role: 'OPERADOR' }), (e) => e.code === 'LAST_ADMIN' && e.message === 'Debe existir al menos un administrador activo.');
  const { user: b } = h.makeUser({ role: 'ADMIN' });
  const updated = users.updateUser(a, b.id, { role: 'OPERADOR', modules: ['CARTAS'] }, '127.0.0.1');
  assert.equal(updated.role, 'OPERADOR');
  assert.deepEqual(users.configuredModules(updated), ['CARTAS']);
  assertInvariant();
});

test('cambiar el rol incrementa token_version; agregar módulos no', async () => {
  const { token } = await h.adminSession();
  const { user } = h.makeUser({ modules: ['CARTAS'] });
  await api('PATCH', `/api/users/${user.id}`, token, { modules: ['CARTAS', 'EVENTOS'] });
  assert.equal(users.getUser(user.id).token_version, 0);
  const r = await api('PATCH', `/api/users/${user.id}`, token, { role: 'ADMIN' });
  assert.equal(r.body.user.modules.length, 7);
  assert.equal(users.getUser(user.id).token_version, 1);
  const actions = h.auditRows().map((x) => [x.action, x.detail]);
  assert.deepEqual(actions.slice(-2), [
    ['PERMISSIONS_CHANGED', { added: ['EVENTOS'], removed: [] }],
    ['ROLE_CHANGED', { from: 'OPERADOR', to: 'ADMIN' }]
  ]);
});

test('PATCH {} → 422; campo desconocido → 422 "Campo no permitido."; sin cambios → 200 sin bitácora', async () => {
  const { token } = await h.adminSession();
  const { user } = h.makeUser();
  const empty = await api('PATCH', `/api/users/${user.id}`, token, {});
  assert.deepEqual(empty.body.details, [{ field: 'body', message: 'Envía al menos un campo para actualizar.' }]);
  const unknown = await api('PATCH', `/api/users/${user.id}`, token, { email: 'otro@x.org' });
  assert.deepEqual(unknown.body.details, [{ field: 'email', message: 'Campo no permitido.' }]);
  const before = h.auditRows().length;
  assert.equal((await api('PATCH', `/api/users/${user.id}`, token, { first_name: user.first_name })).status, 200);
  assert.equal(h.auditRows().length, before);
});

test('la invariante se cumple tras cada operación de gestión', async () => {
  const { token } = await h.adminSession();
  const a = await h.pendingUser();
  const b = await h.pendingUser();
  assertInvariant();
  await api('POST', `/api/users/${a.id}/approve`, token, { modules: ['CARTAS'] });
  assertInvariant();
  await api('POST', `/api/users/${b.id}/reject`, token, { reason: 'No es del equipo' });
  assertInvariant();
  await api('PATCH', `/api/users/${a.id}`, token, { is_active: false });
  assertInvariant();
  await api('POST', `/api/users/${a.id}/reset-password`, token);
  assertInvariant();
  users.resetPasswordToTemporary(users.getUser(b.id).email);
  assertInvariant();
});
