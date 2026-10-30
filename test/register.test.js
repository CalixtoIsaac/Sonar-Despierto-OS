const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { getDb } = require('../lib/db');
const users = require('../services/users');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const REGISTER = '/api/auth/register';
const MESSAGE = 'Tu solicitud fue enviada. Un administrador debe aprobarla antes de que puedas iniciar sesión.';

test('registro válido → 201 sin token; la cuenta queda PENDIENTE, inactiva y sin permisos', async () => {
  const body = h.registerPayload({ email: 'Ana.Lopez@Correo.com', phone: '229-123 4567',
    requested_modules: ['calendario', 'CARTAS', 'CARTAS'] });
  const r = await h.request('POST', REGISTER, { body });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { email: 'ana.lopez@correo.com', account_status: 'PENDIENTE', message: MESSAGE });
  assert.ok(!('token' in r.body) && !('id' in r.body));

  const row = users.getUserByEmail('ana.lopez@correo.com');
  assert.equal(row.account_status, 'PENDIENTE');
  assert.equal(row.is_active, 0);
  assert.equal(row.must_change_password, 0);
  assert.equal(row.role, 'OPERADOR');
  assert.equal(row.phone, '2291234567');
  assert.deepEqual(JSON.parse(row.requested_modules), ['CARTAS', 'CALENDARIO']);
  assert.ok(row.confidentiality_accepted_at);
  assert.equal(getDb().prepare('SELECT COUNT(*) n FROM user_module_permissions WHERE user_id = ?').get(row.id).n, 0);
});

test('cada error de validación con su mensaje exacto, todos en un solo 422', async () => {
  const cases = [
    [{ phone: '229123456' }, 'phone', 'El teléfono debe tener 10 dígitos.'],
    [{ password: 'debil' }, 'password', 'La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número.'],
    [{ requested_modules: ['NO_EXISTE'] }, 'requested_modules', 'Módulo no válido.'],
    [{ accepts_confidentiality: false }, 'accepts_confidentiality', 'Debes aceptar el compromiso de confidencialidad.'],
    [{ email: 'no-es-correo' }, 'email', 'Escribe un correo electrónico válido.'],
    [{ first_name: '   ' }, 'first_name', 'Este campo es obligatorio.'],
    [{ last_name: 'x'.repeat(121) }, 'last_name', 'Máximo 120 caracteres.'],
    [{ note: 'x'.repeat(501) }, 'note', 'Máximo 500 caracteres.']
  ];
  for (const [override, field, message] of cases) {
    const r = await h.request('POST', REGISTER, { body: h.registerPayload(override) });
    assert.equal(r.status, 422, field);
    assert.deepEqual(r.body.details, [{ field, message }], field);
  }
  const all = Object.assign({}, ...cases.map((c) => c[0]));
  const r = await h.request('POST', REGISTER, { body: h.registerPayload(all) });
  assert.equal(r.status, 422);
  assert.equal(r.body.details.length, cases.length);
  assert.equal(getDb().prepare('SELECT COUNT(*) n FROM users').get().n, 0);
});

test('correo existente (aprobado o pendiente) → 409 EMAIL_ALREADY_EXISTS', async () => {
  const { user } = h.makeUser();
  const r1 = await h.request('POST', REGISTER, { body: h.registerPayload({ email: user.email.toUpperCase() }) });
  assert.equal(r1.status, 409);
  assert.equal(r1.body.error, 'Ya existe un usuario con ese correo.');
  const pending = await h.pendingUser();
  const r2 = await h.request('POST', REGISTER, { body: h.registerPayload({ email: pending.email }) });
  assert.equal(r2.status, 409);
});

test('el registro audita ACCOUNT_REQUESTED sin la contraseña', async () => {
  const body = h.registerPayload();
  await h.request('POST', REGISTER, { body });
  const [row] = h.auditRows();
  assert.equal(row.action, 'ACCOUNT_REQUESTED');
  assert.equal(row.user_id, row.entity_id);
  assert.deepEqual(row.detail, { email: body.email, requested_modules: ['CARTAS', 'CALENDARIO'] });
  assert.doesNotMatch(JSON.stringify(row), /Segura123/);
});

test('5 solicitudes desde el mismo equipo; la 6.ª → 429 con Retry-After', async () => {
  for (let i = 0; i < 5; i++) {
    assert.equal((await h.request('POST', REGISTER, { body: h.registerPayload() })).status, 201);
  }
  const r = await h.request('POST', REGISTER, { body: h.registerPayload() });
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'TOO_MANY_REQUESTS');
  assert.match(r.body.error, /^Demasiadas solicitudes de registro desde este equipo\. Intenta de nuevo en \d+ minutos\.$/);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
});

test('registration-info responde { enabled: true } por defecto', async () => {
  const r = await h.request('GET', '/api/auth/registration-info');
  assert.deepEqual(r.body, { enabled: true });
});
