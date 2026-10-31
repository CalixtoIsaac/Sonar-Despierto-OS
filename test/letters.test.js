const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { getDb } = require('../lib/db');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

async function setup() {
  const admin = await h.adminSession();
  const event = await h.openEvent(admin.token, { name: 'Navidad 2026', code_prefix: 'NAV26' });
  const school = (await api('POST', '/api/schools', admin.token, h.schoolPayload({ name: 'Primaria Hidalgo' }))).body.school;
  const child = await h.makeChild(admin.token, { first_name: 'Sofía', last_name: 'Cruz Pérez', school_id: school.id });
  const sponsor = await h.makeVolunteer(admin.token, { first_name: 'Luis', last_name: 'Hernández', area_of_interest: 'PADRINO' });
  return { admin, token: admin.token, event, school, child, sponsor };
}

const assign = (token, letter, volunteerId, version = letter.version) =>
  api('POST', `/api/letters/${letter.id}/assign`, token, { volunteer_id: volunteerId, version });
const status = (token, letter, to, extra = {}) =>
  api('POST', `/api/letters/${letter.id}/status`, token, { to_status: to, version: letter.version, ...extra });

test('alta: código consecutivo por evento, PENDIENTE, historial inicial y datos completos para ADMIN', async () => {
  const { token, event, child, school } = await setup();
  const r = await api('POST', '/api/letters', token, { event_id: event.id, child_id: child.id, main_wish: 'Bicicleta rodada 16',
    secondary_wish: 'Libro de dinosaurios', letter_text: 'Querido Santa…' });
  assert.equal(r.status, 201);
  const l = r.body.letter;
  assert.equal(l.code, 'NAV26-000001');
  assert.equal(l.status, 'PENDIENTE');
  assert.equal(l.version, 1);
  assert.equal(l.sponsor, null);
  assert.deepEqual(l.next_actions, ['assign']);
  assert.deepEqual(l.event, { id: event.id, name: 'Navidad 2026', code_prefix: 'NAV26', status: 'ABIERTO', event_date: '2026-12-20' });
  assert.equal(l.child.full_name, 'Sofía Cruz Pérez');
  assert.equal(l.child.restricted, false);
  assert.deepEqual(l.child.school, { id: school.id, name: 'Primaria Hidalgo', zone: 'Centro' });

  const second = await h.makeLetter(token, { eventId: event.id, childId: (await h.makeChild(token)).id });
  assert.equal(second.code, 'NAV26-000002');
  const hist = (await api('GET', `/api/letters/${l.id}/history`, token)).body.items;
  assert.equal(hist.length, 1);
  assert.equal(hist[0].from_status, null);
  assert.equal(hist[0].to_status, 'PENDIENTE');
  assert.ok(hist[0].changed_by);

  const kid = (await api('GET', `/api/children/${child.id}`, token)).body.child;
  assert.deepEqual(kid.letters.map((x) => [x.code, x.status, x.event.id]), [['NAV26-000001', 'PENDIENTE', event.id]]);
});

test('alta: reglas de evento, consentimiento, baja y una carta por evento', async () => {
  const { token, event, child } = await setup();
  const body = (o = {}) => ({ event_id: event.id, child_id: child.id, main_wish: 'Muñeca', ...o });

  const draft = await h.openEvent(token, { code_prefix: 'BOR1' }, 'BORRADOR');
  assert.equal((await api('POST', '/api/letters', token, body({ event_id: draft.id }))).body.code, 'EVENT_NOT_OPEN');
  const dn = await h.openEvent(token, { code_prefix: 'DN27', event_type: 'DIA_DEL_NINO' });
  assert.equal((await api('POST', '/api/letters', token, body({ event_id: dn.id }))).body.code, 'EVENT_NOT_FOR_LETTERS');

  const noConsent = await h.makeChild(token, { guardian_consent: false });
  const r = await api('POST', '/api/letters', token, body({ child_id: noConsent.id }));
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'CONSENT_REQUIRED');

  const gone = await h.makeChild(token);
  await api('PATCH', `/api/children/${gone.id}`, token, { is_active: false });
  assert.deepEqual((await api('POST', '/api/letters', token, body({ child_id: gone.id }))).body.details,
    [{ field: 'child_id', message: 'La niña o niño está dada(o) de baja.' }]);
  assert.equal((await api('POST', '/api/letters', token, body({ child_id: 99999 }))).status, 422);
  assert.equal((await api('POST', '/api/letters', token, body({ main_wish: '' }))).status, 422);

  const first = (await api('POST', '/api/letters', token, body())).body.letter;
  const dup = await api('POST', '/api/letters', token, body());
  assert.deepEqual(dup.body, { error: 'Esta niña o niño ya tiene carta en este evento (NAV26-000001).', code: 'LETTER_ALREADY_EXISTS', existing_id: first.id });
});

test('ciclo completo: asignar → recibir → entregar con fechas, siguiente acción y padrino en su ficha', async () => {
  const { token, event, child, sponsor } = await setup();
  let l = await h.makeLetter(token, { eventId: event.id, childId: child.id });

  l = (await assign(token, l, sponsor.id)).body.letter;
  assert.equal(l.status, 'ASIGNADO');
  assert.equal(l.version, 2);
  assert.equal(l.sponsor.full_name, 'Luis Hernández');
  assert.ok(l.assigned_at);
  assert.deepEqual(l.next_actions, ['release', 'receive']);

  l = (await status(token, l, 'RECIBIDO', { gift_notes: 'Bicicleta roja, bolsa 120', comment: 'Llegó al acopio' })).body.letter;
  assert.equal(l.status, 'RECIBIDO');
  assert.equal(l.gift_notes, 'Bicicleta roja, bolsa 120');
  assert.ok(l.received_at);
  assert.deepEqual(l.next_actions, ['deliver', 'revert']);

  l = (await status(token, l, 'ENTREGADO')).body.letter;
  assert.equal(l.status, 'ENTREGADO');
  assert.ok(l.delivered_at);
  assert.deepEqual(l.next_actions, []);
  assert.equal((await status(token, l, 'RECIBIDO')).body.code, 'INVALID_STATUS_TRANSITION', 'ENTREGADO es final');

  const vol = (await api('GET', `/api/volunteers/${sponsor.id}`, token)).body.volunteer;
  assert.deepEqual(vol.sponsored_letters.map((x) => [x.code, x.status]), [['NAV26-000001', 'ENTREGADO']]);
  const changes = h.auditRows().filter((x) => x.action === 'LETTER_STATUS_CHANGED').map((x) => x.detail);
  assert.deepEqual(changes, [
    { from: 'PENDIENTE', to: 'ASIGNADO', sponsor_volunteer_id: sponsor.id },
    { from: 'ASIGNADO', to: 'RECIBIDO', sponsor_volunteer_id: sponsor.id },
    { from: 'RECIBIDO', to: 'ENTREGADO', sponsor_volunteer_id: sponsor.id }
  ]);
});

test('liberar, corrección solo ADMIN con comentario y transiciones inválidas', async () => {
  const { token: admin, event, child, sponsor } = await setup();
  const { token: op } = await h.operatorSession(['CARTAS']);
  let l = await h.makeLetter(admin, { eventId: event.id, childId: child.id });
  assert.equal((await status(op, l, 'RECIBIDO')).body.code, 'INVALID_STATUS_TRANSITION', 'sin padrino no se recibe');
  assert.equal((await api('POST', `/api/letters/${l.id}/release`, op, { version: l.version })).body.code, 'INVALID_STATUS_TRANSITION');

  l = (await assign(op, l, sponsor.id)).body.letter;
  l = (await api('POST', `/api/letters/${l.id}/release`, op, { version: l.version, comment: 'No podrá comprarlo' })).body.letter;
  assert.equal(l.status, 'PENDIENTE');
  assert.equal(l.sponsor, null);
  l = (await assign(op, l, sponsor.id)).body.letter;
  l = (await status(op, l, 'RECIBIDO')).body.letter;

  const opRevert = await status(op, l, 'ASIGNADO', { comment: 'Error' });
  assert.equal(opRevert.status, 403);
  assert.equal((await status(admin, l, 'ASIGNADO')).body.details[0].field, 'comment');
  l = (await status(admin, l, 'ASIGNADO', { comment: 'Se registró en la bolsa equivocada' })).body.letter;
  assert.equal(l.status, 'ASIGNADO');
  assert.equal(l.received_at, null);
  assert.equal((await status(admin, l, 'PENDIENTE')).status, 422, 'PENDIENTE solo con release');
  assert.equal((await api('POST', `/api/letters/${l.id}/assign`, admin, { volunteer_id: sponsor.id })).status, 422, 'version obligatoria');
});

test('límite de cartas por padrino en el evento → 400 SPONSOR_LIMIT_REACHED; voluntario dado de baja → 422', async () => {
  const { token, sponsor } = await setup();
  const ev = await h.openEvent(token, { code_prefix: 'LIM1', max_letters_per_sponsor: 2 });
  const ls = [];
  for (let i = 0; i < 3; i++) ls.push(await h.makeLetter(token, { eventId: ev.id, childId: (await h.makeChild(token)).id }));
  assert.equal((await assign(token, ls[0], sponsor.id)).status, 200);
  assert.equal((await assign(token, ls[1], sponsor.id)).status, 200);
  const r = await assign(token, ls[2], sponsor.id);
  assert.deepEqual(r.body, { error: 'Este padrino ya tiene 2 de 2 cartas permitidas en el evento.', code: 'SPONSOR_LIMIT_REACHED' });
  const opts = (await api('GET', `/api/letters/sponsor-options?event_id=${ev.id}`, token)).body.items;
  assert.deepEqual(opts.map((o) => [o.volunteer.id, o.letters_in_event, o.limit]), [[sponsor.id, 2, 2]]);

  const other = await h.makeVolunteer(token);
  await api('PATCH', `/api/volunteers/${other.id}`, token, { is_active: false });
  assert.equal((await assign(token, ls[2], other.id)).body.details[0].message, 'El voluntario está dado de baja.');
});

test('versión vieja: 409 LETTER_VERSION_CONFLICT (misma etapa) o LETTER_STATUS_CHANGED (otra etapa)', async () => {
  const { token, event, child, sponsor } = await setup();
  const l1 = await h.makeLetter(token, { eventId: event.id, childId: child.id });
  const edited = (await api('PATCH', `/api/letters/${l1.id}`, token, { gift_notes: 'Talla 8', version: 1 })).body.letter;
  assert.equal(edited.version, 2);
  const stale = await assign(token, l1, sponsor.id, 1);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'LETTER_VERSION_CONFLICT');
  assert.equal(stale.body.current_version, 2);
  assert.equal((await api('PATCH', `/api/letters/${l1.id}`, token, { gift_notes: 'x', version: 1 })).body.code, 'LETTER_VERSION_CONFLICT');

  const a = (await assign(token, edited, sponsor.id)).body.letter;
  const r = await status(token, { ...a, version: a.version }, 'RECIBIDO');
  assert.equal(r.status, 200);
  const late = await status(token, a, 'RECIBIDO');
  assert.equal(late.status, 409);
  assert.equal(late.body.code, 'LETTER_STATUS_CHANGED');
  assert.equal(late.body.current_status, 'RECIBIDO');
});

test('edición: deseos bloqueados con padrino para OPERADOR (LETTER_LOCKED); ADMIN sí; notas del regalo siempre', async () => {
  const { token: admin, event, child, sponsor } = await setup();
  const { token: op } = await h.operatorSession(['CARTAS']);
  let l = await h.makeLetter(admin, { eventId: event.id, childId: child.id });
  l = (await api('PATCH', `/api/letters/${l.id}`, op, { main_wish: 'Patineta', secondary_wish: null })).body.letter;
  assert.equal(l.main_wish, 'Patineta');
  l = (await assign(op, l, sponsor.id)).body.letter;
  const locked = await api('PATCH', `/api/letters/${l.id}`, op, { main_wish: 'Consola' });
  assert.equal(locked.body.code, 'LETTER_LOCKED');
  assert.equal((await api('PATCH', `/api/letters/${l.id}`, op, { gift_notes: 'Ya comprado' })).body.letter.gift_notes, 'Ya comprado');
  assert.equal((await api('PATCH', `/api/letters/${l.id}`, admin, { main_wish: 'Patineta azul' })).body.letter.main_wish, 'Patineta azul');
  assert.equal((await api('PATCH', `/api/letters/${l.id}`, admin, { main_wish: '' })).status, 422);
  assert.equal((await api('PATCH', `/api/letters/${l.id}`, admin, { version: 9 })).status, 422);
  assert.equal((await api('PATCH', `/api/letters/${l.id}`, admin, { code: 'X' })).status, 422);
  const audit = JSON.stringify(h.auditRows().filter((x) => x.entity === 'letters'));
  assert.doesNotMatch(audit, /Patineta|Sofía|Cruz|Comprado/i, 'la bitácora no guarda deseos ni nombres');
});

test('CARTAS sin BENEFICIARIOS: la niña o niño se ve restringido en carta, listado, elegibles y CSV', async () => {
  const { token: admin, event, child } = await setup();
  await h.makeLetter(admin, { eventId: event.id, childId: child.id });
  const { token: op } = await h.operatorSession(['CARTAS']);

  const list = (await api('GET', `/api/letters?event_id=${event.id}`, op)).body.items;
  const c = list[0].child;
  assert.equal(c.display_name, 'Sofía C.');
  assert.equal(c.restricted, true);
  for (const k of ['last_name', 'full_name', 'birth_date', 'guardian_consent']) assert.equal(c[k], undefined, k);
  assert.ok(c.age >= 0);
  assert.equal(c.school.name, 'Primaria Hidalgo');

  const detail = (await api('GET', `/api/letters/${list[0].id}`, op)).text;
  assert.doesNotMatch(detail, /Cruz Pérez|Rosa Cruz|2017-03-02|cacahuate/);
  const csv = (await api('GET', `/api/letters/export?event_id=${event.id}`, op)).text;
  assert.match(csv, /Sofía C\./);
  assert.doesNotMatch(csv, /Cruz Pérez/);

  const { token: both } = await h.operatorSession(['CARTAS', 'BENEFICIARIOS']);
  assert.equal((await api('GET', `/api/letters/${list[0].id}`, both)).body.letter.child.full_name, 'Sofía Cruz Pérez');
  const { token: eventsOnly } = await h.operatorSession(['EVENTOS']);
  assert.equal((await api('GET', `/api/letters?event_id=${event.id}`, eventsOnly)).status, 403, 'Cartas exige CARTAS');
});

test('niñas y niños elegibles: indica por qué no (consentimiento o ya tiene carta); exige evento', async () => {
  const { token, event, child } = await setup();
  await h.makeLetter(token, { eventId: event.id, childId: child.id });
  const noConsent = await h.makeChild(token, { first_name: 'Ana', last_name: 'Sin Permiso', guardian_consent: false });
  const ok = await h.makeChild(token, { first_name: 'Beto', last_name: 'Listo' });
  const items = (await api('GET', `/api/letters/eligible-children?event_id=${event.id}`, token)).body.items;
  const byId = Object.fromEntries(items.map((x) => [x.child.id, x]));
  assert.deepEqual([byId[ok.id].eligible, byId[ok.id].reason], [true, null]);
  assert.deepEqual([byId[noConsent.id].eligible, byId[noConsent.id].reason], [false, 'CONSENT_REQUIRED']);
  assert.deepEqual([byId[child.id].reason, byId[child.id].letter.code], ['HAS_LETTER', 'NAV26-000001']);
  assert.equal(items[0].child.id, ok.id, 'los elegibles primero');
  assert.deepEqual((await api('GET', `/api/letters/eligible-children?event_id=${event.id}&search=beto`, token)).body.items.map((x) => x.child.id), [ok.id]);
  assert.equal((await api('GET', '/api/letters/eligible-children', token)).status, 422);
});

test('búsqueda por código: acepta minúsculas, espacios, sin ceros y sin guion', async () => {
  const { token, event, child } = await setup();
  const l = await h.makeLetter(token, { eventId: event.id, childId: child.id });
  for (const code of ['NAV26-000001', 'nav26-1', 'NAV26 000001', 'nav26000001', ' Nav26-01 ']) {
    const r = await api('GET', `/api/letters/by-code/${encodeURIComponent(code)}`, token);
    assert.equal(r.status, 200, code);
    assert.equal(r.body.letter.id, l.id, code);
  }
  const miss = await api('GET', '/api/letters/by-code/NAV26-999', token);
  assert.deepEqual(miss.body, { error: 'No encontramos una carta con ese código.', code: 'NOT_FOUND' });
  assert.equal((await api('GET', '/api/letters/by-code/%3Cscript%3E', token)).status, 404);
});

test('listado y resumen: pestañas por estatus, por escuela, filtros y búsqueda por código o nombre', async () => {
  const { token, event, child, sponsor, school } = await setup();
  const l1 = await h.makeLetter(token, { eventId: event.id, childId: child.id });
  const l2 = await h.makeLetter(token, { eventId: event.id, childId: (await h.makeChild(token, { first_name: 'Mateo', last_name: 'Ruiz', gender: 'NINO' })).id });
  await assign(token, l2, sponsor.id);
  const other = await h.openEvent(token, { code_prefix: 'NAV27' });
  await h.makeLetter(token, { eventId: other.id, childId: child.id });

  const sum = (await api('GET', `/api/letters/summary?event_id=${event.id}`, token)).body;
  assert.deepEqual(sum.by_status, { PENDIENTE: 1, ASIGNADO: 1, RECIBIDO: 0, ENTREGADO: 0 });
  assert.equal(sum.total, 2);
  assert.deepEqual(sum.by_school, [{ id: school.id, name: 'Primaria Hidalgo', total: 1 }, { id: null, name: 'Sin escuela', total: 1 }]);

  const q = (s) => api('GET', `/api/letters?event_id=${event.id}&${s}`, token).then((r) => r.body.items.map((x) => x.code));
  assert.deepEqual(await q('status=ASIGNADO'), [l2.code]);
  assert.deepEqual(await q(`sponsor_id=${sponsor.id}`), [l2.code]);
  assert.deepEqual(await q('school_id=none'), [l2.code]);
  assert.deepEqual(await q(`school_id=${school.id}`), [l1.code]);
  assert.deepEqual(await q('gender=NINO'), [l2.code]);
  assert.deepEqual(await q('search=mateo'), [l2.code]);
  assert.deepEqual(await q('search=000001'), [l1.code]);
  assert.deepEqual(await q('has_photo=false&order_by=-code'), [l2.code, l1.code]);
  assert.equal((await api('GET', '/api/letters?status=X', token)).status, 422);
  assert.equal((await api('GET', '/api/letters', token)).body.total, 3, 'sin evento: todas');
});

test('exportación CSV de cartas registrada en la bitácora', async () => {
  const { token, event, child } = await setup();
  await h.makeLetter(token, { eventId: event.id, childId: child.id, main_wish: '=HYPERLINK("x")' });
  const r = await api('GET', `/api/letters/export?event_id=${event.id}&status=PENDIENTE`, token);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /cartas-\d{4}-\d{2}-\d{2}\.csv/);
  assert.match(r.text, /NAV26-000001/);
  assert.match(r.text, /'=HYPERLINK/);
  const log = h.auditRows().find((x) => x.action === 'DATA_EXPORTED');
  assert.deepEqual([log.entity, log.detail], ['letters', { format: 'csv', count: 1, filters: { event_id: event.id, status: 'PENDIENTE' } }]);
});

test('bajas bloqueadas con cartas en curso: niña o niño (409 CHILD_HAS_ACTIVE_LETTERS) y padrino (409 VOLUNTEER_HAS_ACTIVE_LETTERS)', async () => {
  const { token, event, child, sponsor } = await setup();
  const l = await h.makeLetter(token, { eventId: event.id, childId: child.id });
  assert.equal((await api('PATCH', `/api/children/${child.id}`, token, { is_active: false })).body.code, 'CHILD_HAS_ACTIVE_LETTERS');
  await assign(token, l, sponsor.id);
  assert.equal((await api('PATCH', `/api/volunteers/${sponsor.id}`, token, { is_active: false })).body.code, 'VOLUNTEER_HAS_ACTIVE_LETTERS');
  await api('POST', `/api/events/${event.id}/status`, token, { to_status: 'CERRADO' });
  assert.equal((await api('PATCH', `/api/children/${child.id}`, token, { is_active: false })).status, 200, 'evento cerrado ya no bloquea');
  assert.equal((await api('PATCH', `/api/volunteers/${sponsor.id}`, token, { is_active: false })).status, 200);
});

test('evento cerrado: cartas de solo lectura (EVENT_CLOSED) y sin acciones', async () => {
  const { token, event, child, sponsor } = await setup();
  const l = await h.makeLetter(token, { eventId: event.id, childId: child.id });
  await api('POST', `/api/events/${event.id}/status`, token, { to_status: 'CERRADO' });
  assert.equal((await assign(token, l, sponsor.id)).body.code, 'EVENT_CLOSED');
  assert.equal((await api('PATCH', `/api/letters/${l.id}`, token, { gift_notes: 'x' })).body.code, 'EVENT_CLOSED');
  assert.deepEqual((await api('GET', `/api/letters/${l.id}`, token)).body.letter.next_actions, []);
});

test('el historial es de solo inserción (la BD rechaza UPDATE)', async () => {
  const { token, event, child } = await setup();
  await h.makeLetter(token, { eventId: event.id, childId: child.id });
  assert.throws(() => getDb().prepare("UPDATE letter_status_history SET to_status = 'ENTREGADO'").run(), /solo inserción/);
  assert.throws(() => getDb().prepare("UPDATE letters SET status = 'ASIGNADO'").run(), /CHECK/, 'ASIGNADO exige padrino');
});
