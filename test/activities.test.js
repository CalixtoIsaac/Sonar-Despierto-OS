const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });
const RANGE = '?date_from=2026-11-01&date_to=2026-11-30';

test('alta: PROGRAMADA, horas normalizadas, responsable y evento como referencias, bitácora', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const { token: admin } = await h.adminSession();
  const event = await h.openEvent(admin, { name: 'Navidad 2026', code_prefix: 'NAV26' });
  const r = await api('POST', '/api/activities', token, h.activityPayload(user.id, { start_time: '9:05', end_time: '10:30', event_id: event.id }));
  assert.equal(r.status, 201, r.text);
  const a = r.body.activity;
  assert.equal(a.status, 'PROGRAMADA');
  assert.equal(a.start_time, '09:05');
  assert.equal(a.end_time, '10:30');
  assert.deepEqual(a.responsible, { id: user.id, full_name: 'Ana Prueba' });
  assert.equal(a.event.name, 'Navidad 2026');
  assert.equal(a.version, 1);
  assert.equal(a.has_overlap, false);
  assert.deepEqual(a.volunteers, []);
  assert.deepEqual(a.overlaps, []);
  assert.ok(a.created_by);
  const last = h.auditRows().slice(-1)[0];
  assert.equal(last.action, 'RECORD_CREATED');
  assert.equal(last.entity, 'activities');
});

test('validación: 422 con todos los campos; fin antes que inicio; campo no permitido', async () => {
  const { token } = await h.operatorSession(['CALENDARIO']);
  const r = await api('POST', '/api/activities', token, { title: '', activity_type: 'FIESTA', activity_date: '2026-02-30',
    start_time: '25:00', end_time: 'x', responsible_user_id: 'abc', extra: 1 });
  assert.equal(r.status, 422);
  assert.deepEqual(r.body.details.map((d) => d.field).sort(),
    ['activity_date', 'activity_type', 'end_time', 'extra', 'responsible_user_id', 'start_time', 'title']);
  const { user } = h.makeUser({ modules: [] });
  const backwards = await api('POST', '/api/activities', token, h.activityPayload(user.id, { start_time: '12:00', end_time: '11:00' }));
  assert.equal(backwards.status, 422);
  assert.deepEqual(backwards.body.details, [{ field: 'end_time', message: 'La hora de fin debe ser posterior a la de inicio.' }]);
  const same = await api('POST', '/api/activities', token, h.activityPayload(user.id, { start_time: '12:00', end_time: '12:00' }));
  assert.equal(same.status, 422);
});

test('responsable inexistente, desactivado o pendiente → 422; evento inexistente → 422; evento cerrado → 400 EVENT_CLOSED', async () => {
  const { token } = await h.operatorSession(['CALENDARIO']);
  const { token: admin } = await h.adminSession();
  const off = h.makeUser({ active: false }).user;
  const pending = await h.pendingUser();
  for (const id of [9999, off.id, pending.id]) {
    const r = await api('POST', '/api/activities', token, h.activityPayload(id));
    assert.equal(r.status, 422, String(id));
    assert.equal(r.body.details[0].field, 'responsible_user_id');
  }
  const ok = h.makeUser({ modules: [] }).user;
  const noEvent = await api('POST', '/api/activities', token, h.activityPayload(ok.id, { event_id: 9999 }));
  assert.deepEqual(noEvent.body.details, [{ field: 'event_id', message: 'El evento no existe.' }]);
  const closed = await h.openEvent(admin, {}, 'CERRADO');
  const r = await api('POST', '/api/activities', token, h.activityPayload(ok.id, { event_id: closed.id }));
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'EVENT_CLOSED');
});

test('listado por rango: orden, filtros por tipo (repetible), responsable (id y me), evento, estatus, búsqueda y voluntario', async () => {
  const { user: me, token } = await h.operatorSession(['CALENDARIO']);
  const { token: admin } = await h.adminSession();
  const other = h.makeUser({ modules: [] }).user;
  const ev = await h.openEvent(admin);
  const vol = await h.makeVolunteer(admin);
  const a1 = await h.makeActivity(token, me.id, { title: 'Capacitación de guías', activity_type: 'CAPACITACION', activity_date: '2026-11-12', start_time: '16:00', end_time: '18:00' });
  const a2 = await h.makeActivity(token, other.id, { title: 'Acopio en Plaza Américas', activity_type: 'ACOPIO', activity_date: '2026-11-05', location: 'Plaza Américas', event_id: ev.id });
  const a3 = await h.makeActivity(token, me.id, { title: 'Junta mensual', activity_date: '2026-11-05', start_time: '08:00', end_time: '09:00' });
  await h.makeActivity(token, me.id, { activity_date: '2026-12-01' }); // fuera del rango
  await api('POST', `/api/activities/${a1.id}/volunteers`, token, { volunteer_ids: [vol.id] });

  const ids = async (qs) => {
    const r = await api('GET', `/api/activities${RANGE}${qs}`, token);
    assert.equal(r.status, 200, r.text);
    return r.body.items.map((x) => x.id);
  };
  assert.deepEqual(await ids(''), [a3.id, a2.id, a1.id], 'por fecha y hora');
  assert.deepEqual(await ids('&activity_type=ACOPIO&activity_type=CAPACITACION'), [a2.id, a1.id]);
  assert.deepEqual(await ids('&responsible_id=me'), [a3.id, a1.id]);
  assert.deepEqual(await ids(`&responsible_id=${other.id}`), [a2.id]);
  assert.deepEqual(await ids(`&event_id=${ev.id}`), [a2.id]);
  assert.deepEqual(await ids('&search=plaza americas'), [a2.id], 'busca en título sin acentos y lugar');
  assert.deepEqual(await ids(`&volunteer_id=${vol.id}`), [a1.id]);
  assert.deepEqual(await ids('&status=CANCELADA'), []);
  const all = await api('GET', `/api/activities?event_id=${ev.id}`, token);
  assert.equal(all.status, 200, 'con event_id el rango es opcional');
  const item = (await api('GET', `/api/activities${RANGE}`, token)).body.items.find((x) => x.id === a2.id);
  assert.deepEqual(item.event, { id: ev.id, name: ev.name, status: 'ABIERTO', event_date: ev.event_date, event_type: 'NAVIDAD' });
  assert.equal((await api('GET', `/api/activities${RANGE}`, token)).body.truncated, false);
});

test('listado: rango obligatorio, inválido, invertido o mayor a 92 días → 422', async () => {
  const { token } = await h.operatorSession(['CALENDARIO']);
  for (const qs of ['', '?date_from=2026-11-01', '?date_from=2026-11-31&date_to=2026-12-01', '?date_from=2026-11-10&date_to=2026-11-01',
    '?date_from=2026-01-01&date_to=2026-06-01', `${RANGE}&activity_type=FIESTA`, `${RANGE}&status=X`, `${RANGE}&responsible_id=abc`]) {
    const r = await api('GET', `/api/activities${qs}`, token);
    assert.equal(r.status, 422, qs);
  }
  assert.equal((await api('GET', '/api/activities?date_from=2026-11-01&date_to=2027-01-31', token)).status, 200, '92 días exactos');
});

test('edición: solo cambia lo enviado, sube la versión, audita los campos; vaciar obligatorios → 422; PATCH vacío → 422', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const a = await h.makeActivity(token, user.id);
  const r = await api('PATCH', `/api/activities/${a.id}`, token, { location: 'Bodega norte', title: 'Junta de acopio', version: 1 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.activity.version, 2);
  assert.equal(r.body.activity.location, 'Bodega norte');
  const log = h.auditRows().filter((x) => x.action === 'RECORD_UPDATED').pop();
  assert.deepEqual(log.detail, { changed: ['title', 'location'] });
  assert.equal((await api('PATCH', `/api/activities/${a.id}`, token, { title: '' })).status, 422);
  assert.equal((await api('PATCH', `/api/activities/${a.id}`, token, { responsible_user_id: null })).status, 422);
  assert.equal((await api('PATCH', `/api/activities/${a.id}`, token, {})).status, 422);
  assert.equal((await api('PATCH', `/api/activities/${a.id}`, token, { version: 2 })).status, 422, 'solo banderas');
  const same = await api('PATCH', `/api/activities/${a.id}`, token, { location: 'Bodega norte' });
  assert.equal(same.body.activity.version, 2, 'sin cambios no sube la versión');
  const end = await api('PATCH', `/api/activities/${a.id}`, token, { end_time: '09:00' });
  assert.equal(end.status, 422, 'el fin queda antes del inicio guardado');
  assert.equal((await api('PATCH', `/api/activities/${a.id}`, token, { event_id: null })).status, 200, 'desvincular evento');
});

test('versión: un cambio con una versión vieja → 409 ACTIVITY_VERSION_CONFLICT con la versión actual', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const a = await h.makeActivity(token, user.id);
  await api('PATCH', `/api/activities/${a.id}`, token, { location: 'Otro', version: 1 });
  const r = await api('PATCH', `/api/activities/${a.id}`, token, { location: 'Tarde', version: 1 });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ACTIVITY_VERSION_CONFLICT');
  assert.equal(r.body.current_version, 2);
  const s = await api('POST', `/api/activities/${a.id}/status`, token, { to_status: 'REALIZADA', version: 1 });
  assert.equal(s.body.code, 'ACTIVITY_VERSION_CONFLICT');
});

test('estatus: realizada, cancelar exige motivo, cancelada no se edita, reabrir, transiciones inválidas', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const a = await h.makeActivity(token, user.id);
  const st = (body) => api('POST', `/api/activities/${a.id}/status`, token, body);
  assert.equal((await st({ to_status: 'PROGRAMADA' })).body.code, 'INVALID_STATUS_TRANSITION');
  const noReason = await st({ to_status: 'CANCELADA' });
  assert.equal(noReason.status, 422);
  assert.equal(noReason.body.details[0].field, 'reason');
  assert.equal((await st({ to_status: 'CANCELADA', reason: 'no' })).status, 422, 'motivo muy corto');
  const c = await st({ to_status: 'CANCELADA', reason: 'Se pospone por lluvia' });
  assert.equal(c.body.activity.status, 'CANCELADA');
  assert.equal(c.body.activity.cancel_reason, 'Se pospone por lluvia');
  const edit = await api('PATCH', `/api/activities/${a.id}`, token, { location: 'X' });
  assert.equal(edit.status, 400);
  assert.equal(edit.body.code, 'ACTIVITY_CANCELLED');
  assert.equal((await st({ to_status: 'REALIZADA' })).body.code, 'INVALID_STATUS_TRANSITION');
  const re = await st({ to_status: 'PROGRAMADA' });
  assert.equal(re.body.activity.status, 'PROGRAMADA');
  assert.equal(re.body.activity.cancel_reason, null);
  assert.equal((await st({ to_status: 'REALIZADA' })).body.activity.status, 'REALIZADA');
  assert.equal((await st({ to_status: 'PROGRAMADA' })).body.activity.status, 'PROGRAMADA');
  const logs = h.auditRows().filter((x) => x.action === 'ACTIVITY_STATUS_CHANGED').map((x) => x.detail);
  assert.deepEqual(logs, [{ from: 'PROGRAMADA', to: 'CANCELADA' }, { from: 'CANCELADA', to: 'PROGRAMADA' },
    { from: 'PROGRAMADA', to: 'REALIZADA' }, { from: 'REALIZADA', to: 'PROGRAMADA' }]);
  assert.ok(!JSON.stringify(h.auditRows()).includes('lluvia'), 'el motivo no va a la bitácora');
});

test('voluntarios: agregar varios (omite repetidos), quitar, dado de baja → 422, cancelada → 400', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const { token: admin } = await h.adminSession();
  const v1 = await h.makeVolunteer(admin);
  const v2 = await h.makeVolunteer(admin);
  const v3 = await h.makeVolunteer(admin);
  await api('PATCH', `/api/volunteers/${v3.id}`, admin, { is_active: false });
  const a = await h.makeActivity(token, user.id);
  const add = await api('POST', `/api/activities/${a.id}/volunteers`, token, { volunteer_ids: [v1.id, v2.id] });
  assert.equal(add.status, 201);
  assert.deepEqual(add.body, { added: 2, skipped: [] });
  assert.deepEqual((await api('POST', `/api/activities/${a.id}/volunteers`, token, { volunteer_ids: [v1.id] })).body, { added: 0, skipped: [v1.id] });
  assert.equal((await api('POST', `/api/activities/${a.id}/volunteers`, token, { volunteer_ids: [v3.id] })).status, 422);
  assert.equal((await api('POST', `/api/activities/${a.id}/volunteers`, token, { volunteer_ids: [] })).status, 422);
  const opts = (await api('GET', `/api/activities/${a.id}/volunteer-options`, token)).body.items.map((x) => x.id);
  assert.ok(!opts.includes(v1.id) && !opts.includes(v3.id));
  const detail = (await api('GET', `/api/activities/${a.id}`, token)).body.activity;
  assert.equal(detail.volunteers.length, 2);
  assert.equal(detail.volunteers_count, 2);
  assert.equal((await api('DELETE', `/api/activities/${a.id}/volunteers/${v2.id}`, token)).status, 204);
  assert.equal((await api('DELETE', `/api/activities/${a.id}/volunteers/${v2.id}`, token)).status, 404);
  await api('POST', `/api/activities/${a.id}/status`, token, { to_status: 'CANCELADA', reason: 'Se pospone' });
  assert.equal((await api('POST', `/api/activities/${a.id}/volunteers`, token, { volunteer_ids: [v2.id] })).body.code, 'ACTIVITY_CANCELLED');
  const acts = h.auditRows().filter((x) => x.action.startsWith('ACTIVITY_VOLUNTEER')).map((x) => [x.action, x.detail]);
  assert.deepEqual(acts, [['ACTIVITY_VOLUNTEERS_ADDED', { volunteer_ids: [v1.id, v2.id], count: 2 }], ['ACTIVITY_VOLUNTEER_REMOVED', { volunteer_id: v2.id }]]);
});

test('opciones: responsables (solo aprobados y activos) y eventos (cerrados al final)', async () => {
  const { user, token } = await h.operatorSession(['CALENDARIO']);
  const { token: admin } = await h.adminSession();
  const off = h.makeUser({ active: false }).user;
  const pending = await h.pendingUser();
  const ids = (await api('GET', '/api/activities/responsible-options', token)).body.items.map((x) => x.id);
  assert.ok(ids.includes(user.id));
  assert.ok(!ids.includes(off.id) && !ids.includes(pending.id));
  const closed = await h.openEvent(admin, { event_date: '2027-01-01' }, 'CERRADO');
  const open = await h.openEvent(admin, { event_date: '2026-12-01' });
  const evs = (await api('GET', '/api/activities/event-options', token)).body.items.map((x) => x.id);
  assert.deepEqual(evs, [open.id, closed.id]);
});

test('permisos: sin CALENDARIO → 403 MODULE_FORBIDDEN; sin sesión → 401; 404 de id', async () => {
  const { token } = await h.operatorSession(['CARTAS', 'EVENTOS']);
  const r = await api('GET', `/api/activities${RANGE}`, token);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'MODULE_FORBIDDEN');
  assert.equal((await api('GET', `/api/activities${RANGE}`)).status, 401);
  const { token: cal } = await h.operatorSession(['CALENDARIO']);
  assert.equal((await api('GET', '/api/activities/999', cal)).status, 404);
  assert.equal((await api('GET', '/api/activities/abc', cal)).body.error, 'No existe una actividad con ese identificador.');
});

test('migración 5: la BD rechaza fin ≤ inicio, tipo inválido y cancelada sin motivo', async () => {
  const { getDb } = require('../lib/db');
  const db = getDb();
  const insert = (o) => db.prepare(`INSERT INTO activities (title, title_key, activity_type, activity_date, start_time, end_time, status, cancel_reason, created_at, updated_at)
    VALUES (@title, @title, @type, '2026-11-10', @start, @end, @status, @reason, 'x', 'x')`).run({ title: 't', type: 'JUNTA', start: '10:00', end: '11:00', status: 'PROGRAMADA', reason: null, ...o });
  assert.throws(() => insert({ end: '09:00' }), /CHECK/);
  assert.throws(() => insert({ type: 'FIESTA' }), /CHECK/);
  assert.throws(() => insert({ status: 'CANCELADA' }), /CHECK/);
  assert.throws(() => insert({ reason: 'sobra' }), /CHECK/);
  assert.doesNotThrow(() => insert({ status: 'CANCELADA', reason: 'Lluvia' }));
});
