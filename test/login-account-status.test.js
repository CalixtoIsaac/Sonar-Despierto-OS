const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { getDb } = require('../lib/db');
const { signSessionToken } = require('../lib/security');
const users = require('../services/users');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const login = (email, password) => h.request('POST', '/api/auth/login', { body: { email, password } });

test('pendiente + contraseña correcta → 403 ACCOUNT_PENDING; con contraseña incorrecta → 401', async () => {
  const p = await h.pendingUser();
  const r = await login(p.email, p.password);
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, {
    error: 'Tu solicitud de cuenta está pendiente de aprobación. Un administrador debe revisarla.', code: 'ACCOUNT_PENDING'
  });
  const bad = await login(p.email, 'Incorrecta99');
  assert.equal(bad.status, 401);
  assert.equal(bad.body.code, 'INVALID_CREDENTIALS');
});

test('rechazada → 403 ACCOUNT_REJECTED; desactivada → 403 ACCOUNT_DISABLED', async () => {
  const p = await h.pendingUser();
  getDb().prepare("UPDATE users SET account_status = 'RECHAZADA' WHERE id = ?").run(p.id);
  const r = await login(p.email, p.password);
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'Tu solicitud de cuenta fue rechazada. Contacta al administrador.', code: 'ACCOUNT_REJECTED' });

  const { user, password } = h.makeUser({ active: false });
  assert.equal((await login(user.email, password)).body.code, 'ACCOUNT_DISABLED');
});

test('los 403 auditan LOGIN_FAILED con reason y no bloquean por intentos', async () => {
  const p = await h.pendingUser();
  for (let i = 0; i < 6; i++) assert.equal((await login(p.email, p.password)).status, 403);
  const failed = h.auditRows().filter((r) => r.action === 'LOGIN_FAILED');
  assert.equal(failed.length, 6);
  assert.ok(failed.every((r) => r.detail.reason === 'pending'));
});

test('effectiveModules de una cuenta pendiente es []; un token fabricado para ella → 401', async () => {
  const p = await h.pendingUser();
  const row = users.getUser(p.id);
  getDb().prepare("INSERT INTO user_module_permissions (user_id, module, created_at) VALUES (?, 'CARTAS', 'x')").run(p.id);
  assert.deepEqual(users.effectiveModules(row), []);
  const token = signSessionToken(row);
  assert.equal((await h.request('GET', '/api/auth/me', { token })).status, 401);
});

test('/api/auth/me incluye phone', async () => {
  const { user, password } = h.makeUser();
  getDb().prepare("UPDATE users SET phone = '2291234567' WHERE id = ?").run(user.id);
  const token = await h.login(user.email, password);
  const r = await h.request('GET', '/api/auth/me', { token });
  assert.equal(r.body.user.phone, '2291234567');
});
