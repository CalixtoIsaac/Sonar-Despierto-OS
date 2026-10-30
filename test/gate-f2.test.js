/**
 * Gate de la Fase 2: un OPERADOR sin CARTAS recibe 403 en la API y no ve el módulo; un usuario
 * desactivado pierde la sesión de inmediato; flujo completo de registro → aprobación.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });
const login = (email, password) => h.request('POST', '/api/auth/login', { body: { email, password } });

test('(a–d) permisos al instante con el mismo token; desactivar corta la sesión', async () => {
  const { token: admin } = await h.adminSession();
  const { user, password } = h.makeUser({ modules: ['CALENDARIO'] });
  const token = await h.login(user.email, password);

  const a = await api('GET', '/api/_test/cartas', token);
  assert.equal(a.status, 403);
  assert.equal(a.body.code, 'MODULE_FORBIDDEN');
  assert.ok(!(await api('GET', '/api/auth/me', token)).body.user.modules.includes('CARTAS'));

  await api('PATCH', `/api/users/${user.id}`, admin, { modules: ['CALENDARIO', 'CARTAS'] });
  assert.equal((await api('GET', '/api/_test/cartas', token)).status, 200, '(b) mismo token');

  await api('PATCH', `/api/users/${user.id}`, admin, { modules: ['CALENDARIO'] });
  assert.equal((await api('GET', '/api/_test/cartas', token)).status, 403, '(c) de inmediato');

  await api('PATCH', `/api/users/${user.id}`, admin, { is_active: false });
  assert.equal((await api('GET', '/api/auth/me', token)).status, 401, '(d) sesión cortada');
  assert.equal((await login(user.email, password)).body.code, 'ACCOUNT_DISABLED');
});

test('(e) registro → pendiente → aprobado con CARTAS → entra con su contraseña', async () => {
  const { token: admin } = await h.adminSession();
  const body = h.registerPayload({ email: 'ana@correo.com' });
  assert.equal((await h.request('POST', '/api/auth/register', { body })).status, 201);
  assert.equal((await login(body.email, body.password)).body.code, 'ACCOUNT_PENDING');

  const list = await api('GET', '/api/users?account_status=PENDIENTE', admin);
  const id = list.body.items[0].id;
  assert.equal((await api('POST', `/api/users/${id}/approve`, admin, { role: 'OPERADOR', modules: ['CARTAS'] })).status, 200);

  const r = await login(body.email, body.password);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.must_change_password, false);
  assert.deepEqual(r.body.user.modules, ['CARTAS']);
  assert.equal((await api('GET', '/api/_test/cartas', r.body.token)).status, 200);
  assert.equal((await api('GET', '/api/_test/admin', r.body.token)).status, 403);
});

test('(f) rechazo → ACCOUNT_REJECTED → eliminar → registrarse de nuevo', async () => {
  const { token: admin } = await h.adminSession();
  const p = await h.pendingUser();
  await api('POST', `/api/users/${p.id}/reject`, admin, { reason: 'Solicitud de prueba' });
  assert.equal((await login(p.email, p.password)).body.code, 'ACCOUNT_REJECTED');
  assert.equal((await api('DELETE', `/api/users/${p.id}`, admin)).status, 204);
  assert.equal((await h.request('POST', '/api/auth/register', { body: h.registerPayload({ email: p.email }) })).status, 201);
});

test('(g) un OPERADOR, aunque tenga todos los módulos, recibe 403 FORBIDDEN en /api/users y la bitácora', async () => {
  const { user, password } = h.makeUser({ modules: ['VOLUNTARIOS', 'BENEFICIARIOS', 'EVENTOS', 'CARTAS', 'CALENDARIO', 'INVENTARIO', 'REPORTES'] });
  const token = await h.login(user.email, password);
  const calls = [
    ['GET', '/api/users'], ['GET', '/api/users/summary'], ['POST', '/api/users', {}], ['GET', `/api/users/${user.id}`],
    ['PATCH', `/api/users/${user.id}`, { first_name: 'X' }], ['POST', `/api/users/${user.id}/approve`, { modules: [] }],
    ['POST', `/api/users/${user.id}/reject`, { reason: 'abcdef' }], ['POST', `/api/users/${user.id}/reset-password`],
    ['DELETE', `/api/users/${user.id}`], ['GET', '/api/audit-logs']
  ];
  for (const [method, url, body] of calls) {
    const r = await api(method, url, token, body);
    assert.equal(r.status, 403, `${method} ${url}`);
    assert.equal(r.body.code, 'FORBIDDEN');
  }
});
