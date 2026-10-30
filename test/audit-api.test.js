const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { getDb } = require('../lib/db');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const get = (token, qs = '') => h.request('GET', `/api/audit-logs${qs}`, { token });

function insert(rows) {
  const st = getDb().prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const r of rows) st.run(r.user_id ?? null, r.action, r.entity ?? 'users', r.entity_id ?? null, r.detail ?? null, r.created_at);
}

test('orden created_at desc con desempate por id; page_size por defecto 50', async () => {
  const { token, user } = await h.adminSession();
  getDb().exec('DELETE FROM audit_logs');
  const rows = [];
  for (let i = 0; i < 60; i++) rows.push({ user_id: user.id, action: 'LOGIN', created_at: '2026-10-01T10:00:00.000Z' });
  insert(rows);
  const r = await get(token);
  assert.equal(r.body.page_size, 50);
  assert.equal(r.body.total, 60);
  assert.equal(r.body.pages, 2);
  assert.equal(r.body.items.length, 50);
  const ids = r.body.items.map((x) => x.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  assert.equal(r.body.items[0].actor.email, user.email);
  assert.equal(r.body.items[0].actor.full_name, 'Ana Prueba');
});

test('filtros por acción (una y varias), entidad, actor y rango de fechas', async () => {
  const { token, user } = await h.adminSession();
  getDb().exec('DELETE FROM audit_logs');
  insert([
    { action: 'LOGIN', user_id: user.id, entity_id: user.id, created_at: '2026-10-17T05:59:59.000Z' },
    { action: 'LOGOUT', user_id: user.id, entity_id: user.id, created_at: '2026-10-17T06:00:00.000Z' },
    { action: 'LOGIN_FAILED', entity_id: 99, detail: '{"email":"nadie@x.org"}', created_at: '2026-10-17T12:00:00.000Z' },
    { action: 'LOGIN', user_id: user.id, entity_id: user.id, created_at: '2026-10-18T06:00:00.000Z' }
  ]);
  const actions = async (qs) => (await get(token, qs)).body.items.map((x) => x.action);
  assert.deepEqual(await actions('?action=LOGOUT'), ['LOGOUT']);
  assert.deepEqual(await actions('?action=LOGOUT&action=LOGIN_FAILED'), ['LOGIN_FAILED', 'LOGOUT']);
  assert.deepEqual(await actions('?entity=users&entity_id=99'), ['LOGIN_FAILED']);
  assert.deepEqual((await actions(`?actor_id=${user.id}`)).length, 3);
  // Un día en hora de Veracruz: [06:00Z, 06:00Z del día siguiente)
  assert.deepEqual(await actions('?date_from=2026-10-17T00:00:00-06:00&date_to=2026-10-18T00:00:00-06:00'), ['LOGIN_FAILED', 'LOGOUT']);
  const failed = (await get(token, '?action=LOGIN_FAILED')).body.items[0];
  assert.equal(failed.actor, null);
  assert.deepEqual(failed.detail, { email: 'nadie@x.org' });
});

test('validaciones: rango invertido, fecha inválida, acción inexistente', async () => {
  const { token } = await h.adminSession();
  const r = await get(token, '?date_from=2026-10-18&date_to=2026-10-17');
  assert.equal(r.status, 422);
  assert.deepEqual(r.body.details, [{ field: 'date_to', message: 'La fecha final debe ser posterior a la inicial.' }]);
  assert.deepEqual((await get(token, '?date_from=ayer')).body.details, [{ field: 'date_from', message: 'Fecha no válida.' }]);
  assert.equal((await get(token, '?action=NO_EXISTE')).status, 422);
  assert.equal((await get(token, '?actor_id=abc')).status, 422);
});

test('tras login, logout, cambio y restablecimiento ningún detail tiene secretos', async () => {
  const { token: admin } = await h.adminSession();
  const { user, password } = h.makeUser({ mustChange: true });
  const t = await h.login(user.email, password);
  await h.request('POST', '/api/auth/change-password', { token: t, body: { current_password: password, new_password: 'NuevaClave99' } });
  await h.request('POST', `/api/users/${user.id}/reset-password`, { token: admin });
  const p = await h.pendingUser();
  await h.request('POST', `/api/users/${p.id}/approve`, { token: admin, body: { modules: [] } });
  await h.request('POST', '/api/auth/logout', { token: admin });
  const all = h.auditRows();
  for (const row of all) {
    assert.doesNotMatch(JSON.stringify(row.detail || {}), /password|token|Segura|NuevaClave/i);
  }
});

test('OPERADOR → 403 FORBIDDEN; sin token → 401', async () => {
  const { user, password } = h.makeUser();
  const token = await h.login(user.email, password);
  assert.equal((await get(token)).body.code, 'FORBIDDEN');
  assert.equal((await get(null)).status, 401);
});
