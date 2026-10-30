const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { getDb } = require('../lib/db');
const { MODULE_KEYS } = require('../lib/modules');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const LOGIN = '/api/auth/login';

test('login correcto devuelve token, vigencia y usuario sin el hash', async () => {
  const { user, password } = h.makeUser({ role: 'ADMIN' });
  const r = await h.request('POST', LOGIN, { body: { email: user.email, password } });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  assert.equal(r.body.expires_in, 8 * 3600);
  assert.equal(r.body.user.email, user.email);
  assert.deepEqual(r.body.user.modules, [...MODULE_KEYS]);
  assert.equal(r.text.includes('password_hash'), false);
});

test('el correo se normaliza (espacios y mayúsculas)', async () => {
  const { password } = h.makeUser({ email: 'ana@sonardespierto.org' });
  const r = await h.request('POST', LOGIN, { body: { email: '  ANA@SonarDespierto.org ', password } });
  assert.equal(r.status, 200);
});

test('contraseña incorrecta y correo inexistente dan el mismo error', async () => {
  const { user } = h.makeUser();
  const wrong = await h.request('POST', LOGIN, { body: { email: user.email, password: 'Incorrecta1' } });
  const unknown = await h.request('POST', LOGIN, { body: { email: 'nadie@sonardespierto.org', password: 'Incorrecta1' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
  assert.deepEqual(wrong.body, { error: 'Correo o contraseña incorrectos.', code: 'INVALID_CREDENTIALS' });
});

test('cuenta desactivada con la contraseña correcta → 403 ACCOUNT_DISABLED', async () => {
  const { user, password } = h.makeUser({ active: false });
  const r = await h.request('POST', LOGIN, { body: { email: user.email, password } });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'ACCOUNT_DISABLED');
  assert.equal(r.body.error, 'Tu cuenta está desactivada. Contacta al administrador.');
});

test('el login actualiza last_login_at', async () => {
  const { user, password } = h.makeUser();
  assert.equal(user.last_login_at, null);
  await h.request('POST', LOGIN, { body: { email: user.email, password } });
  const row = getDb().prepare('SELECT last_login_at FROM users WHERE id = ?').get(user.id);
  assert.match(row.last_login_at, /^\d{4}-\d\d-\d\dT.*Z$/);
});

test('el login queda en la bitácora sin la contraseña', async () => {
  const { user, password } = h.makeUser();
  await h.request('POST', LOGIN, { body: { email: user.email, password: 'Incorrecta1' } });
  await h.request('POST', LOGIN, { body: { email: user.email, password } });
  const logs = getDb().prepare('SELECT * FROM audit_logs ORDER BY id').all();
  assert.deepEqual(logs.map((l) => l.action), ['LOGIN_FAILED', 'LOGIN']);
  for (const log of logs) {
    assert.equal(log.user_id, user.id);
    assert.ok(log.ip_address);
    assert.equal(String(log.detail).includes('Incorrecta1'), false);
    assert.equal(String(log.detail).includes(password), false);
  }
});

test('cuerpo vacío o JSON inválido', async () => {
  const empty = await h.request('POST', LOGIN, { body: {} });
  assert.equal(empty.status, 422);
  assert.equal(empty.body.code, 'VALIDATION_ERROR');
  assert.deepEqual(empty.body.details.map((d) => d.field), ['email', 'password']);

  const bad = await h.request('POST', LOGIN, { body: '{no es json' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'INVALID_JSON');
});

test('tras 5 fallos el 6.º intento recibe 429 con Retry-After; el bloqueo es por correo', async () => {
  const { user, password } = h.makeUser();
  for (let i = 0; i < 5; i++) {
    const r = await h.request('POST', LOGIN, { body: { email: user.email, password: 'Incorrecta1' } });
    assert.equal(r.status, 401);
  }
  const blocked = await h.request('POST', LOGIN, { body: { email: user.email, password } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'TOO_MANY_REQUESTS');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);

  const other = h.makeUser();
  const ok = await h.request('POST', LOGIN, { body: { email: other.user.email, password: other.password } });
  assert.equal(ok.status, 200);
});

test('un login correcto reinicia el contador de fallos', async () => {
  const { user, password } = h.makeUser();
  for (let i = 0; i < 4; i++) await h.request('POST', LOGIN, { body: { email: user.email, password: 'Incorrecta1' } });
  assert.equal((await h.request('POST', LOGIN, { body: { email: user.email, password } })).status, 200);
  for (let i = 0; i < 4; i++) await h.request('POST', LOGIN, { body: { email: user.email, password: 'Incorrecta1' } });
  assert.equal((await h.request('POST', LOGIN, { body: { email: user.email, password } })).status, 200);
});
