/**
 * Gate de la Fase 3: duplicado → 409; exportación registrada en la bitácora; datos de niños solo con
 * el módulo BENEFICIARIOS (y voluntarios solo con VOLUNTARIOS).
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

test('(a) duplicado → 409 en las cuatro entidades', async () => {
  const { token } = await h.adminSession();
  const cases = [
    ['/api/schools', h.schoolPayload({ name: 'Primaria Hidalgo', zone: 'Centro' })],
    ['/api/tutors', h.tutorPayload()],
    ['/api/volunteers', h.volunteerPayload()],
    ['/api/children', h.childPayload()]
  ];
  for (const [url, body] of cases) {
    assert.equal((await api('POST', url, token, body)).status, 201, url);
    const dup = await api('POST', url, token, body);
    assert.equal(dup.status, 409, url);
    assert.ok(Number.isInteger(dup.body.existing_id), url);
  }
});

test('(b) cada exportación queda en la bitácora con quién, cuántos y qué filtros', async () => {
  const { token, user } = await h.adminSession();
  await api('POST', '/api/children', token, h.childPayload());
  await api('POST', '/api/volunteers', token, h.volunteerPayload());
  assert.equal((await api('GET', '/api/children/export?consent=true', token)).status, 200);
  assert.equal((await api('GET', '/api/volunteers/export', token)).status, 200);
  const logs = await api('GET', '/api/audit-logs?action=DATA_EXPORTED', token);
  assert.equal(logs.body.total, 2);
  const [vol, kids] = logs.body.items;
  assert.equal(kids.entity, 'children');
  assert.equal(kids.actor.id, user.id);
  assert.deepEqual(kids.detail, { format: 'csv', count: 1, filters: { consent: true } });
  assert.equal(vol.entity, 'volunteers');
});

test('(c) sin BENEFICIARIOS → 403 en niños, escuelas, tutores y su exportación; con él → 200', async () => {
  const { token: volOnly } = await h.operatorSession(['VOLUNTARIOS', 'CARTAS', 'CALENDARIO', 'EVENTOS', 'INVENTARIO', 'REPORTES']);
  for (const url of ['/api/children', '/api/children/export', '/api/children/1', '/api/schools', '/api/tutors']) {
    const r = await api('GET', url, volOnly);
    assert.equal(r.status, 403, url);
    assert.deepEqual(r.body, { error: 'No tienes acceso al módulo Beneficiarios.', code: 'MODULE_FORBIDDEN' }, url);
  }
  assert.equal((await api('POST', '/api/children', volOnly, h.childPayload())).status, 403);
  assert.equal((await api('GET', '/api/volunteers', volOnly)).status, 200);

  const { token: ben } = await h.operatorSession(['BENEFICIARIOS']);
  assert.equal((await api('GET', '/api/children', ben)).status, 200);
  assert.equal((await api('GET', '/api/volunteers', ben)).body.code, 'MODULE_FORBIDDEN', 'voluntarios requiere VOLUNTARIOS');
  assert.equal((await api('GET', '/api/children', null)).status, 401);
});

test('(d) quitar BENEFICIARIOS tiene efecto inmediato con el mismo token', async () => {
  const { token: admin } = await h.adminSession();
  const { user, token } = await h.operatorSession(['BENEFICIARIOS']);
  assert.equal((await api('GET', '/api/children', token)).status, 200);
  await api('PATCH', `/api/users/${user.id}`, admin, { modules: [] });
  assert.equal((await api('GET', '/api/children', token)).status, 403);
});
