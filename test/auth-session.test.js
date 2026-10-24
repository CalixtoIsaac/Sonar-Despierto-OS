const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const h = require('./helpers');

const { getConfig } = require('../lib/config');
const { getDb } = require('../lib/db');
const users = require('../services/users');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

test('sin token → 401 NOT_AUTHENTICATED', async () => {
  const r = await h.request('GET', '/api/auth/me');
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'NOT_AUTHENTICATED');
});

test('token alterado → 401 TOKEN_INVALID; token vencido → 401 TOKEN_EXPIRED', async () => {
  const { user, password } = h.makeUser();
  const token = await h.login(user.email, password);
  const tampered = await h.request('GET', '/api/auth/me', { token: token.slice(0, -2) + 'xx' });
  assert.equal(tampered.status, 401);
  assert.equal(tampered.body.code, 'TOKEN_INVALID');

  const expired = jwt.sign({ sub: String(user.id), role: user.role, ver: 0, exp: Math.floor(Date.now() / 1000) - 10 },
    getConfig().jwtSecret, { algorithm: 'HS256' });
  const r = await h.request('GET', '/api/auth/me', { token: expired });
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'TOKEN_EXPIRED');
});

test('un token firmado con otra clave no sirve', async () => {
  const { user } = h.makeUser();
  const forged = jwt.sign({ sub: String(user.id), role: 'ADMIN', ver: 0 }, 'otra-clave-cualquiera-de-32-caracteres!!', { expiresIn: '1h' });
  const r = await h.request('GET', '/api/auth/me', { token: forged });
  assert.equal(r.status, 401);
});

test('GET /me devuelve los módulos efectivos', async () => {
  const { user, password } = h.makeUser({ modules: ['REPORTES', 'CARTAS', 'CARTAS'] });
  const token = await h.login(user.email, password);
  const r = await h.request('GET', '/api/auth/me', { token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user.modules, ['CARTAS', 'REPORTES']);
  assert.equal(r.body.user.role, 'OPERADOR');
});

test('logout invalida el token en todas las computadoras', async () => {
  const { user, password } = h.makeUser();
  const a = await h.login(user.email, password);
  const b = await h.login(user.email, password);
  assert.equal((await h.request('POST', '/api/auth/logout', { token: a })).status, 204);
  for (const token of [a, b]) {
    const r = await h.request('GET', '/api/auth/me', { token });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'TOKEN_INVALID');
  }
  assert.deepEqual(h.auditActions().slice(-1), ['LOGOUT']);
});

test('desactivar la cuenta corta la sesión de inmediato', async () => {
  const { user, password } = h.makeUser();
  const token = await h.login(user.email, password);
  getDb().prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);
  assert.equal((await h.request('GET', '/api/auth/me', { token })).status, 401);
});

test('con contraseña temporal: /me responde, pero lo protegido da 403 PASSWORD_CHANGE_REQUIRED', async () => {
  const { user, password } = h.makeUser({ mustChange: true });
  const token = await h.login(user.email, password);
  const me = await h.request('GET', '/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.must_change_password, true);
  const r = await h.request('GET', '/api/_test/cartas', { token });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('cambio de contraseña: validaciones y errores', async () => {
  const { user, password } = h.makeUser({ mustChange: true });
  const token = await h.login(user.email, password);
  const url = '/api/auth/change-password';

  const weak = await h.request('POST', url, { token, body: { current_password: password, new_password: 'corta' } });
  assert.equal(weak.status, 422);
  assert.equal(weak.body.details[0].field, 'new_password');
  assert.equal(weak.body.details[0].message, 'La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número.');

  const wrong = await h.request('POST', url, { token, body: { current_password: 'Otra12345', new_password: 'Nueva12345' } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.code, 'INVALID_CURRENT_PASSWORD');

  const reused = await h.request('POST', url, { token, body: { current_password: password, new_password: password } });
  assert.equal(reused.status, 400);
  assert.equal(reused.body.code, 'PASSWORD_REUSED');
});

test('cambio de contraseña correcto: token nuevo, el anterior deja de servir y se libera el acceso', async () => {
  const { user, password } = h.makeUser({ mustChange: true });
  const old = await h.login(user.email, password);
  const r = await h.request('POST', '/api/auth/change-password', {
    token: old, body: { current_password: password, new_password: 'NuevaClave2026' }
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.must_change_password, false);
  assert.equal((await h.request('GET', '/api/auth/me', { token: old })).status, 401);
  assert.equal((await h.request('GET', '/api/_test/cartas', { token: r.body.token })).status, 200);
  assert.equal((await h.request('POST', '/api/auth/login', { body: { email: user.email, password } })).status, 401);
  assert.equal((await h.request('POST', '/api/auth/login', { body: { email: user.email, password: 'NuevaClave2026' } })).status, 200);
  assert.ok(h.auditActions().includes('PASSWORD_CHANGED'));
});

test('al cambiar la contraseña del admin inicial se borra CREDENCIALES_INICIALES.txt', async () => {
  const email = users.ensureFirstAdmin({ ...getConfig(), firstAdminPassword: '' });
  const file = users.credentialsPath();
  const temp = fs.readFileSync(file, 'utf8').match(/Contraseña temporal: (\S+)/)[1];
  const token = await h.login(email, temp);
  const r = await h.request('POST', '/api/auth/change-password', {
    token, body: { current_password: temp, new_password: 'NuevaClave2026' }
  });
  assert.equal(r.status, 200);
  assert.equal(fs.existsSync(file), false);
});
