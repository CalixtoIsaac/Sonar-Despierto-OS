const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const patch = (token, body) => h.request('PATCH', '/api/auth/me', { token, body });

test('editar nombre y teléfono actualiza UserMe y audita los campos cambiados', async () => {
  const { user, password } = h.makeUser();
  const token = await h.login(user.email, password);
  const r = await patch(token, { first_name: 'Anita', phone: '229-555 1234' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.first_name, 'Anita');
  assert.equal(r.body.user.phone, '2295551234');
  const last = h.auditRows().pop();
  assert.equal(last.action, 'PROFILE_UPDATED');
  assert.deepEqual(last.detail, { changed: ['first_name', 'phone'] });
  assert.equal((await patch(token, { phone: null })).body.user.phone, null);
});

test('validaciones: teléfono inválido, cuerpo vacío, campos no permitidos', async () => {
  const { user, password } = h.makeUser();
  const token = await h.login(user.email, password);
  assert.deepEqual((await patch(token, { phone: '123' })).body.details, [{ field: 'phone', message: 'El teléfono debe tener 10 dígitos.' }]);
  assert.deepEqual((await patch(token, {})).body.details, [{ field: 'body', message: 'Envía al menos un campo para actualizar.' }]);
  const r = await patch(token, { email: 'x@y.com', role: 'ADMIN' });
  assert.equal(r.status, 422);
  assert.deepEqual(r.body.details, [
    { field: 'email', message: 'Campo no permitido.' }, { field: 'role', message: 'Campo no permitido.' }
  ]);
});

test('con contraseña temporal → 403 PASSWORD_CHANGE_REQUIRED', async () => {
  const { user, password } = h.makeUser({ mustChange: true });
  const token = await h.login(user.email, password);
  const r = await patch(token, { first_name: 'X' });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('color de los botones: se guarda por usuario, no se audita y valida el catálogo', async () => {
  const { user, password } = h.makeUser();
  const token = await h.login(user.email, password);
  const me = await h.request('GET', '/api/auth/me', { token });
  assert.equal(me.body.user.accent_color, 'CORAL');

  const auditBefore = h.auditRows().length;
  const r = await patch(token, { accent_color: 'azul' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.accent_color, 'AZUL');
  assert.equal(h.auditRows().length, auditBefore, 'una preferencia visual no va a la bitácora');
  assert.equal((await h.request('GET', '/api/auth/me', { token })).body.user.accent_color, 'AZUL');

  // Otro usuario conserva el suyo
  const other = h.makeUser();
  const otherToken = await h.login(other.user.email, other.password);
  assert.equal((await h.request('GET', '/api/auth/me', { token: otherToken })).body.user.accent_color, 'CORAL');

  const bad = await patch(token, { accent_color: 'FUCSIA' });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.body.details, [{ field: 'accent_color', message: 'Elige uno de los colores disponibles.' }]);

  // null o CORAL regresan al predeterminado
  assert.equal((await patch(token, { accent_color: null })).body.user.accent_color, 'CORAL');
  await patch(token, { accent_color: 'VERDE' });
  assert.equal((await patch(token, { accent_color: 'CORAL' })).body.user.accent_color, 'CORAL');
});
