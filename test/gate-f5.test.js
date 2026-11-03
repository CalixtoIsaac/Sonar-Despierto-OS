/**
 * Gate de la Fase 5 (hoja de ruta): crear, editar, mover y filtrar actividades; aviso de traslape de
 * horario del mismo responsable.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });
const RANGE = '?date_from=2026-11-01&date_to=2026-11-30';

test('(a) crear, editar, mover de día y filtrar', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const a = await h.makeActivity(token, user.id, { title: 'Capacitación de guías', activity_type: 'CAPACITACION' });
  const edited = await api('PATCH', `/api/activities/${a.id}`, token, { description: 'Traer gafete', version: a.version });
  assert.equal(edited.status, 200);
  const moved = await api('PATCH', `/api/activities/${a.id}`, token,
    { activity_date: '2026-11-14', start_time: '17:00', end_time: '19:00', version: edited.body.activity.version });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.activity.activity_date, '2026-11-14');
  const byType = await api('GET', `/api/activities${RANGE}&activity_type=CAPACITACION&responsible_id=${user.id}`, token);
  assert.deepEqual(byType.body.items.map((x) => [x.id, x.activity_date, x.start_time]), [[a.id, '2026-11-14', '17:00']]);
  assert.deepEqual((await api('GET', `/api/activities${RANGE}&activity_type=JUNTA`, token)).body.items, []);
});

test('(b) traslape del mismo responsable → 409 ACTIVITY_OVERLAP con conflictos; allow_overlap lo guarda y queda en bitácora', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const first = await h.makeActivity(token, user.id, { title: 'Junta de logística', start_time: '10:00', end_time: '11:00' });
  const clash = h.activityPayload(user.id, { title: 'Acopio', activity_type: 'ACOPIO', start_time: '10:30', end_time: '12:00' });
  const r = await api('POST', '/api/activities', token, clash);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ACTIVITY_OVERLAP');
  assert.equal(r.body.error, 'Ana Prueba ya tiene otra actividad en ese horario. Revisa el horario o guarda de todos modos.');
  assert.deepEqual(r.body.conflicts, [{ id: first.id, title: 'Junta de logística', activity_type: 'JUNTA', activity_date: '2026-11-10',
    start_time: '10:00', end_time: '11:00', status: 'PROGRAMADA' }]);

  const forced = await api('POST', '/api/activities', token, { ...clash, allow_overlap: true });
  assert.equal(forced.status, 201);
  assert.equal(forced.body.activity.has_overlap, true);
  assert.deepEqual(forced.body.activity.overlaps.map((x) => x.id), [first.id]);
  const log = h.auditRows().find((x) => x.action === 'ACTIVITY_OVERLAP_ACCEPTED');
  assert.deepEqual(log.detail, { with: [first.id] });
  const list = (await api('GET', `/api/activities${RANGE}`, token)).body.items;
  assert.deepEqual(list.map((x) => x.has_overlap), [true, true], 'el calendario marca ambas');
});

test('(c) no es traslape: horarios contiguos, otro responsable, otro día o actividad cancelada', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const other = h.makeUser({ modules: [] }).user;
  const a = await h.makeActivity(token, user.id, { start_time: '10:00', end_time: '11:00' });
  for (const o of [{ start_time: '11:00', end_time: '12:00' }, { start_time: '09:00', end_time: '10:00' },
    { activity_date: '2026-11-11' }]) {
    assert.equal((await api('POST', '/api/activities', token, h.activityPayload(user.id, o))).status, 201, JSON.stringify(o));
  }
  assert.equal((await api('POST', '/api/activities', token, h.activityPayload(other.id))).status, 201, 'otro responsable');
  await api('POST', `/api/activities/${a.id}/status`, token, { to_status: 'CANCELADA', reason: 'Se cambia de fecha' });
  assert.equal((await api('POST', '/api/activities', token, h.activityPayload(user.id))).status, 201, 'la cancelada no cuenta');
});

test('(d) mover o cambiar de responsable hacia un horario ocupado → 409; reabrir una cancelada que choca → 409', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const other = h.makeUser({ modules: [] }).user;
  const busy = await h.makeActivity(token, user.id, { activity_date: '2026-11-20', start_time: '09:00', end_time: '13:00' });
  const b = await h.makeActivity(token, user.id, { activity_date: '2026-11-21', start_time: '10:00', end_time: '11:00' });
  const move = await api('PATCH', `/api/activities/${b.id}`, token, { activity_date: '2026-11-20', version: b.version });
  assert.equal(move.status, 409);
  assert.equal(move.body.code, 'ACTIVITY_OVERLAP');
  assert.deepEqual(move.body.conflicts.map((x) => x.id), [busy.id]);
  assert.equal((await api('GET', `/api/activities/${b.id}`, token)).body.activity.activity_date, '2026-11-21', 'no se movió');

  const c = await h.makeActivity(token, other.id, { activity_date: '2026-11-20', start_time: '12:00', end_time: '14:00' });
  assert.equal((await api('PATCH', `/api/activities/${c.id}`, token, { responsible_user_id: user.id })).body.code, 'ACTIVITY_OVERLAP');
  assert.equal((await api('PATCH', `/api/activities/${c.id}`, token, { location: 'Otra sala' })).status, 200, 'editar otros campos no revisa el horario');

  await api('POST', `/api/activities/${b.id}/status`, token, { to_status: 'CANCELADA', reason: 'Se reprograma' });
  await api('PATCH', `/api/activities/${busy.id}`, token, { activity_date: '2026-11-21' });
  const reopen = await api('POST', `/api/activities/${b.id}/status`, token, { to_status: 'PROGRAMADA' });
  assert.equal(reopen.body.code, 'ACTIVITY_OVERLAP');
  assert.equal((await api('POST', `/api/activities/${b.id}/status`, token, { to_status: 'PROGRAMADA', allow_overlap: true })).status, 200);
});

test('(e) dos altas simultáneas en el mismo horario y responsable → una 201 y otra 409', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const [r1, r2] = await Promise.all([1, 2].map(() => api('POST', '/api/activities', token, h.activityPayload(user.id))));
  assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
});

test('(f) vista previa del traslape para el formulario', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const a = await h.makeActivity(token, user.id);
  const q = (extra) => api('GET', `/api/activities/overlaps?activity_date=2026-11-10&start_time=10:30&end_time=11:30&responsible_id=${user.id}${extra}`, token);
  assert.deepEqual((await q('')).body.items.map((x) => x.id), [a.id]);
  assert.deepEqual((await q(`&exclude_id=${a.id}`)).body.items, [], 'al editar no choca consigo misma');
  assert.equal((await api('GET', '/api/activities/overlaps?activity_date=x', token)).status, 422);
});

test('(g) sin CALENDARIO: la API responde 403 aunque tenga los demás módulos', async () => {
  const { token } = await h.operatorSession(['VOLUNTARIOS', 'BENEFICIARIOS', 'EVENTOS', 'CARTAS', 'INVENTARIO', 'REPORTES']);
  for (const [m, url] of [['GET', `/api/activities${RANGE}`], ['POST', '/api/activities'], ['GET', '/api/activities/responsible-options']]) {
    const r = await api(m, url, token, m === 'POST' ? {} : undefined);
    assert.equal(r.status, 403, url);
    assert.equal(r.body.code, 'MODULE_FORBIDDEN');
  }
});
