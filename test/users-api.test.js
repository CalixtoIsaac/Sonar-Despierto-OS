const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { getDb } = require('../lib/db');
const { checkPasswordPolicy } = require('../lib/security');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

test('listado paginado con filtros de búsqueda, rol, estado, actividad, módulo y orden', async () => {
  const { token } = await h.adminSession();
  const mk = (email, first, last, extra = {}) => {
    const { user } = h.makeUser({ email, ...extra });
    getDb().prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?').run(first, last, user.id);
    return user;
  };
  mk('luis@x.org', 'Luis', 'Ramos', { modules: ['VOLUNTARIOS'] });
  mk('maria@x.org', 'María', 'Gómez 50%', { modules: ['CARTAS'] });
  mk('pedro@x.org', 'Pedro', 'Ruiz', { modules: ['CARTAS'], active: false });
  await h.pendingUser({ email: 'pend@x.org' });

  const all = await api('GET', '/api/users?page_size=2', token);
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 5);
  assert.equal(all.body.pages, 3);
  assert.equal(all.body.items.length, 2);

  const q = async (qs) => (await api('GET', `/api/users?${qs}`, token)).body.items.map((u) => u.email).sort();
  assert.deepEqual(await q('search=LUIS'), ['luis@x.org']);
  assert.deepEqual(await q('search=ramos'), ['luis@x.org']);
  assert.deepEqual(await q('search=luis%20ramos'), ['luis@x.org']);
  assert.deepEqual(await q('search=maria%40'), ['maria@x.org']);
  assert.deepEqual(await q('search=50%25'), ['maria@x.org']);
  assert.deepEqual(await q('role=ADMIN').then((l) => l.length), 1);
  assert.deepEqual(await q('account_status=PENDIENTE'), ['pend@x.org']);
  assert.deepEqual(await q('account_status=APROBADA&is_active=false'), ['pedro@x.org']);
  const cartas = await q('module=CARTAS');
  assert.equal(cartas.length, 3, 'incluye al ADMIN'); // admin + maria + pedro
  assert.ok(cartas.includes('maria@x.org') && !cartas.includes('pend@x.org'));
  const byLast = (await api('GET', '/api/users?order_by=last_name&account_status=APROBADA', token)).body.items.map((u) => u.last_name);
  assert.deepEqual(byLast, [...byLast].sort((a, b) => a.localeCompare(b, 'es')));
  assert.equal((await api('GET', '/api/users?order_by=email', token)).status, 422);
});

test('summary cuenta los 5 grupos', async () => {
  const { token } = await h.adminSession();
  h.makeUser();
  h.makeUser({ active: false });
  await h.pendingUser();
  const p = await h.pendingUser();
  getDb().prepare("UPDATE users SET account_status = 'RECHAZADA' WHERE id = ?").run(p.id);
  const r = await api('GET', '/api/users/summary', token);
  assert.deepEqual(r.body, { pending: 1, active: 2, inactive: 1, rejected: 1, admins: 1 });
});

test('POST /api/users → 201 con contraseña temporal, no-store y cambio obligatorio; duplicado → 409', async () => {
  const { token } = await h.adminSession();
  const body = { email: 'Luis@Correo.com', first_name: 'Luis', last_name: 'Ramos', phone: null, role: 'OPERADOR', modules: ['VOLUNTARIOS'] };
  const r = await api('POST', '/api/users', token, body);
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(checkPasswordPolicy(r.body.temporary_password));
  assert.equal(r.body.user.email, 'luis@correo.com');
  assert.deepEqual(r.body.user.modules, ['VOLUNTARIOS']);
  assert.equal(r.body.user.must_change_password, true);
  const login = await h.request('POST', '/api/auth/login', { body: { email: 'luis@correo.com', password: r.body.temporary_password } });
  assert.equal(login.body.user.must_change_password, true);
  assert.equal((await api('POST', '/api/users', token, body)).status, 409);
  const invalid = await api('POST', '/api/users', token, { email: 'x', first_name: '', last_name: 'R', modules: ['NO'] });
  assert.equal(invalid.status, 422);
  assert.deepEqual(invalid.body.details.map((d) => d.field).sort(), ['email', 'first_name', 'modules']);
});

test('GET /api/users/999 y /abc → 404 con el mensaje exacto', async () => {
  const { token } = await h.adminSession();
  for (const id of ['999', 'abc']) {
    const r = await api('GET', `/api/users/${id}`, token);
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: 'No existe un usuario con ese identificador.', code: 'NOT_FOUND' });
  }
});

test('approve desde pendiente y desde rechazada; como ADMIN no guarda filas de módulos', async () => {
  const { token, user: admin } = await h.adminSession();
  const p = await h.pendingUser();
  const r = await api('POST', `/api/users/${p.id}/approve`, token, { modules: ['CARTAS'], note: 'Por ahora solo cartas.' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.account_status, 'APROBADA');
  assert.equal(r.body.user.is_active, true);
  assert.deepEqual(r.body.user.modules, ['CARTAS']);
  assert.deepEqual(r.body.user.requested_modules, ['CARTAS', 'CALENDARIO']);
  assert.equal(r.body.user.reviewed_by.id, admin.id);
  assert.equal(r.body.user.review_note, 'Por ahora solo cartas.');

  const again = await api('POST', `/api/users/${p.id}/approve`, token, { modules: [] });
  assert.equal(again.status, 400);
  assert.deepEqual(again.body, { error: 'Esta acción no está disponible para una cuenta aprobada.', code: 'INVALID_ACCOUNT_STATE' });

  const q = await h.pendingUser();
  assert.equal((await api('POST', `/api/users/${q.id}/reject`, token, { reason: 'No forma parte del equipo.' })).status, 200);
  const r2 = await api('POST', `/api/users/${q.id}/approve`, token, { role: 'ADMIN', modules: ['CARTAS'] });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.user.modules.length, 7);
  assert.equal(getDb().prepare('SELECT COUNT(*) n FROM user_module_permissions WHERE user_id = ?').get(q.id).n, 0);
  assert.equal((await api('POST', `/api/users/${q.id}/approve`, token, {})).status, 422, 'modules es obligatorio');
});

test('reject: motivo obligatorio (5–500) y solo para pendientes', async () => {
  const { token } = await h.adminSession();
  const p = await h.pendingUser();
  assert.equal((await api('POST', `/api/users/${p.id}/reject`, token, {})).status, 422);
  assert.equal((await api('POST', `/api/users/${p.id}/reject`, token, { reason: 'abc' })).status, 422);
  const { user } = h.makeUser();
  assert.equal((await api('POST', `/api/users/${user.id}/reject`, token, { reason: 'Motivo válido' })).status, 400);
});

test('reset-password: la contraseña anterior y los tokens anteriores dejan de servir', async () => {
  const { token } = await h.adminSession();
  const { user, password } = h.makeUser();
  const old = await h.login(user.email, password);
  const r = await api('POST', `/api/users/${user.id}/reset-password`, token);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await api('GET', '/api/auth/me', old)).status, 401);
  assert.equal((await h.request('POST', '/api/auth/login', { body: { email: user.email, password } })).status, 401);
  const fresh = await h.request('POST', '/api/auth/login', { body: { email: user.email, password: r.body.temporary_password } });
  assert.equal(fresh.body.user.must_change_password, true);
});

test('DELETE: pendiente → 204 y el correo se puede volver a registrar; aprobada → 400', async () => {
  const { token } = await h.adminSession();
  const p = await h.pendingUser();
  assert.equal((await api('DELETE', `/api/users/${p.id}`, token)).status, 204);
  assert.equal((await h.request('POST', '/api/auth/register', { body: h.registerPayload({ email: p.email }) })).status, 201);
  const { user } = h.makeUser();
  assert.equal((await api('DELETE', `/api/users/${user.id}`, token)).status, 400);
});

test('ninguna respuesta ni la bitácora contienen hashes o contraseñas', async () => {
  const { token } = await h.adminSession();
  const p = await h.pendingUser();
  const responses = [
    await api('GET', '/api/users', token),
    await api('GET', `/api/users/${p.id}`, token),
    await api('POST', `/api/users/${p.id}/approve`, token, { modules: [] }),
    await api('POST', '/api/users', token, { email: 'n@x.org', first_name: 'N', last_name: 'X', modules: [] })
  ];
  const reset = await api('POST', `/api/users/${p.id}/reset-password`, token);
  for (const r of responses) {
    assert.doesNotMatch(r.text, /password_hash|\$2[aby]\$|token_version|Segura123/);
  }
  const auditText = JSON.stringify(h.auditRows());
  assert.doesNotMatch(auditText, /Segura123|password|\$2[aby]\$/);
  assert.ok(!auditText.includes(reset.body.temporary_password));
  assert.ok(!auditText.includes(responses[3].body.temporary_password));
});
