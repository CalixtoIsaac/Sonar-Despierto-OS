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
