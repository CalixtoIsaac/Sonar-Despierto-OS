const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

test('alta de evento: BORRADOR, prefijo en mayúsculas, límite por defecto y bitácora', async () => {
  const { token } = await h.operatorSession(['EVENTOS']);
  const r = await api('POST', '/api/events', token, h.eventPayload({ name: 'Navidad 2026', code_prefix: 'nav26', max_letters_per_sponsor: null }));
  assert.equal(r.status, 201);
  const e = r.body.event;
  assert.equal(e.status, 'BORRADOR');
  assert.equal(e.code_prefix, 'NAV26');
  assert.equal(e.max_letters_per_sponsor, 3);
  assert.deepEqual(e.stats.letters, { total: 0, PENDIENTE: 0, ASIGNADO: 0, RECIBIDO: 0, ENTREGADO: 0 });
  assert.equal(e.letters_count, 0);
  assert.ok(e.created_by);
  assert.deepEqual(h.auditActions().slice(-1), ['RECORD_CREATED']);
});

test('validación: prefijo, tipo, fecha y límite por padrino → 422 con todos los campos', async () => {
  const { token } = await h.operatorSession(['EVENTOS']);
  const r = await api('POST', '/api/events', token, { name: '', event_type: 'BODA', code_prefix: 'NA V', event_date: '2026-02-30',
    max_letters_per_sponsor: 50, extra: 1 });
  assert.equal(r.status, 422);
  const fields = r.body.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['code_prefix', 'event_date', 'event_type', 'extra', 'max_letters_per_sponsor', 'name']);
});

test('duplicado por nombre (sin acentos ni mayúsculas) o por prefijo → 409 DUPLICATE_EVENT con existing_id', async () => {
  const { token } = await h.operatorSession(['EVENTOS']);
  const a = (await api('POST', '/api/events', token, h.eventPayload({ name: 'Día del Niño 2027', code_prefix: 'DN27', event_type: 'DIA_DEL_NINO' }))).body.event;
  const byName = await api('POST', '/api/events', token, h.eventPayload({ name: 'dia del nino 2027', code_prefix: 'OTRO1' }));
  assert.deepEqual(byName.body, { error: 'Ya existe un evento con ese nombre.', code: 'DUPLICATE_EVENT', existing_id: a.id });
  const byPrefix = await api('POST', '/api/events', token, h.eventPayload({ code_prefix: 'dn27' }));
  assert.equal(byPrefix.status, 409);
  assert.equal(byPrefix.body.existing_id, a.id);
});

test('estatus: avanzar con EVENTOS; regresar solo ADMIN; mismo estatus → 400; cerrado = solo lectura', async () => {
  const { token: admin } = await h.adminSession();
  const { token } = await h.operatorSession(['EVENTOS']);
  const e = await h.openEvent(token, {}, 'BORRADOR');
  const st = (t, to) => api('POST', `/api/events/${e.id}/status`, t, { to_status: to });

  assert.equal((await st(token, 'EN_CURSO')).body.event.status, 'EN_CURSO', 'puede saltar pasos hacia adelante');
  assert.equal((await st(token, 'EN_CURSO')).body.code, 'INVALID_STATUS_TRANSITION');
  const back = await st(token, 'ABIERTO');
  assert.equal(back.status, 403);
  assert.equal(back.body.code, 'FORBIDDEN');
  assert.equal((await st(token, 'CERRADO')).body.event.status, 'CERRADO');

  const closed = await api('PATCH', `/api/events/${e.id}`, token, { location: 'Otro lugar' });
  assert.equal(closed.status, 400);
  assert.equal(closed.body.code, 'EVENT_CLOSED');
  assert.equal((await st(admin, 'EN_CURSO')).body.event.status, 'EN_CURSO', 'ADMIN reabre');

  const logs = h.auditRows().filter((x) => x.action === 'EVENT_STATUS_CHANGED').map((x) => x.detail);
  assert.deepEqual(logs, [{ from: 'BORRADOR', to: 'EN_CURSO' }, { from: 'EN_CURSO', to: 'CERRADO' }, { from: 'CERRADO', to: 'EN_CURSO' }]);
});

test('con cartas: prefijo y tipo bloqueados; no puede volver a BORRADOR', async () => {
  const { token: admin } = await h.adminSession();
  const e = await h.openEvent(admin);
  const child = await h.makeChild(admin);
  await h.makeLetter(admin, { eventId: e.id, childId: child.id });
  for (const body of [{ code_prefix: 'NUEVO' }, { event_type: 'OTRO' }]) {
    const r = await api('PATCH', `/api/events/${e.id}`, admin, body);
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'EVENT_FIELD_LOCKED');
  }
  assert.equal((await api('PATCH', `/api/events/${e.id}`, admin, { location: 'Macroplaza' })).body.event.location, 'Macroplaza');
  assert.equal((await api('POST', `/api/events/${e.id}/status`, admin, { to_status: 'BORRADOR' })).body.code, 'INVALID_STATUS_TRANSITION');
  assert.deepEqual(h.auditRows().filter((x) => x.action === 'RECORD_UPDATED' && x.entity === 'events').map((x) => x.detail), [{ changed: ['location'] }]);
});

test('listado: filtros por estatus, tipo y búsqueda; orden por fecha descendente', async () => {
  const { token } = await h.operatorSession(['EVENTOS']);
  await h.openEvent(token, { name: 'Navidad 2025', code_prefix: 'NAV25', event_date: '2025-12-20' }, 'CERRADO');
  await h.openEvent(token, { name: 'Navidad 2026', code_prefix: 'NAV26', event_date: '2026-12-20' });
  await h.openEvent(token, { name: 'Día del Niño 2027', code_prefix: 'DN27', event_type: 'DIA_DEL_NINO', event_date: '2027-04-30' }, 'BORRADOR');
  const all = (await api('GET', '/api/events', token)).body;
  assert.deepEqual(all.items.map((e) => e.code_prefix), ['DN27', 'NAV26', 'NAV25']);
  assert.deepEqual((await api('GET', '/api/events?status=ABIERTO', token)).body.items.map((e) => e.code_prefix), ['NAV26']);
  assert.deepEqual((await api('GET', '/api/events?event_type=DIA_DEL_NINO', token)).body.items.map((e) => e.code_prefix), ['DN27']);
  assert.deepEqual((await api('GET', '/api/events?search=navidad 2025', token)).body.items.map((e) => e.code_prefix), ['NAV25']);
  assert.equal((await api('GET', '/api/events?status=X', token)).status, 422);
});

test('permisos: CARTAS lee eventos pero no los modifica; sin EVENTOS ni CARTAS → 403', async () => {
  const { token: ev } = await h.operatorSession(['EVENTOS']);
  const e = await h.openEvent(ev);
  const { token: cartas } = await h.operatorSession(['CARTAS']);
  assert.equal((await api('GET', '/api/events', cartas)).status, 200);
  assert.equal((await api('GET', `/api/events/${e.id}`, cartas)).status, 200);
  for (const [method, url, body] of [
    ['POST', '/api/events', h.eventPayload()], ['PATCH', `/api/events/${e.id}`, { location: 'x' }],
    ['POST', `/api/events/${e.id}/status`, { to_status: 'CERRADO' }], ['GET', `/api/events/${e.id}/volunteers`],
    ['POST', `/api/events/${e.id}/volunteers`, { volunteer_ids: [1] }]
  ]) {
    const r = await api(method, url, cartas, body);
    assert.equal(r.status, 403, `${method} ${url}`);
    assert.equal(r.body.error, 'No tienes acceso al módulo Eventos.');
  }
  const { token: none } = await h.operatorSession(['VOLUNTARIOS']);
  const r = await api('GET', '/api/events', none);
  assert.deepEqual(r.body, { error: 'No tienes acceso al módulo Eventos o Cartas de Navidad.', code: 'MODULE_FORBIDDEN' });
  assert.equal((await api('GET', '/api/events', null)).status, 401);
});

test('voluntarios del evento: alta múltiple, omitidos, área por defecto, cambio de estatus, tallas y ficha del voluntario', async () => {
  const { token: admin } = await h.adminSession();
  const e = await h.openEvent(admin);
  const a = await h.makeVolunteer(admin, { shirt_size: 'M', area_of_interest: 'LOGISTICA' });
  const b = await h.makeVolunteer(admin, { shirt_size: 'L', area_of_interest: 'GUIA_NINOS' });
  const c = await h.makeVolunteer(admin, { shirt_size: 'M' });

  const opts = (await api('GET', `/api/events/${e.id}/volunteer-options`, admin)).body.items;
  assert.equal(opts.length, 3);

  const add = await api('POST', `/api/events/${e.id}/volunteers`, admin, { volunteer_ids: [a.id, b.id] });
  assert.equal(add.status, 201);
  assert.deepEqual(add.body, { added: 2, skipped: [] });
  const again = await api('POST', `/api/events/${e.id}/volunteers`, admin, { volunteer_ids: [a.id, c.id], area: 'REGISTRO', status: 'POSTULADO' });
  assert.deepEqual(again.body, { added: 1, skipped: [a.id] });
  assert.deepEqual((await api('GET', `/api/events/${e.id}/volunteer-options`, admin)).body.items, []);

  const list = (await api('GET', `/api/events/${e.id}/volunteers`, admin)).body;
  assert.equal(list.total, 3);
  const byId = Object.fromEntries(list.items.map((x) => [x.volunteer.id, x]));
  assert.equal(byId[a.id].area, 'LOGISTICA');
  assert.equal(byId[b.id].area, 'GUIA_NINOS');
  assert.equal(byId[c.id].status, 'POSTULADO');
  assert.equal(byId[c.id].area, 'REGISTRO');

  const upd = await api('PATCH', `/api/events/${e.id}/volunteers/${c.id}`, admin, { status: 'CONFIRMADO', area: 'FOTOGRAFIA' });
  assert.equal(upd.body.participation.status, 'CONFIRMADO');
  assert.equal((await api('PATCH', `/api/events/${e.id}/volunteers/${c.id}`, admin, { status: 'X' })).status, 422);
  assert.equal((await api('PATCH', `/api/events/${e.id}/volunteers/99999`, admin, { status: 'CANCELADO' })).status, 404);
  assert.equal((await api('PATCH', `/api/events/${e.id}/volunteers/${b.id}`, admin, { status: 'CANCELADO' })).status, 200);

  const stats = (await api('GET', `/api/events/${e.id}`, admin)).body.event.stats;
  assert.deepEqual(stats.volunteers, { POSTULADO: 0, CONFIRMADO: 2, RECHAZADO: 0, CANCELADO: 1 });
  assert.deepEqual(stats.shirt_sizes, { XS: 0, S: 0, M: 2, L: 0, XL: 0, XXL: 0 });
  assert.equal((await api('GET', `/api/events/${e.id}/volunteers?status=CANCELADO`, admin)).body.total, 1);

  const vol = (await api('GET', `/api/volunteers/${c.id}`, admin)).body.volunteer;
  assert.equal(vol.events.length, 1);
  assert.equal(vol.events[0].event.id, e.id);
  assert.equal(vol.events[0].area, 'FOTOGRAFIA');
  assert.deepEqual(vol.sponsored_letters, []);

  const added = h.auditRows().filter((x) => x.action === 'EVENT_VOLUNTEERS_ADDED').map((x) => x.detail);
  assert.deepEqual(added, [{ volunteer_ids: [a.id, b.id], count: 2 }, { volunteer_ids: [c.id], count: 1 }]);
  assert.equal(h.auditActions().filter((x) => x === 'EVENT_VOLUNTEER_UPDATED').length, 2);
});

test('voluntarios del evento: inexistente o dado de baja → 422; lista vacía → 422; evento cerrado → 400', async () => {
  const { token: admin } = await h.adminSession();
  const e = await h.openEvent(admin);
  const v = await h.makeVolunteer(admin);
  await api('PATCH', `/api/volunteers/${v.id}`, admin, { is_active: false });
  assert.equal((await api('POST', `/api/events/${e.id}/volunteers`, admin, { volunteer_ids: [v.id] })).body.details[0].message,
    `El voluntario ${v.id} está dado de baja.`);
  assert.equal((await api('POST', `/api/events/${e.id}/volunteers`, admin, { volunteer_ids: [424242] })).status, 422);
  assert.equal((await api('POST', `/api/events/${e.id}/volunteers`, admin, { volunteer_ids: [] })).status, 422);
  const w = await h.makeVolunteer(admin);
  await api('POST', `/api/events/${e.id}/status`, admin, { to_status: 'CERRADO' });
  const r = await api('POST', `/api/events/${e.id}/volunteers`, admin, { volunteer_ids: [w.id] });
  assert.equal(r.body.code, 'EVENT_CLOSED');
});
