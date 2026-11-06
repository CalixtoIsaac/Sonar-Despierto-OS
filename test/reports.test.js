/**
 * Fase 7 — /api/reports: permisos, evento sugerido, avisos, enlace "sin carta", avance semanal,
 * comparativo de eventos y exportación a Excel auditada.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { getDb } = require('../lib/db');
const reports = require('../services/reports');
const { readXlsx, findRow } = require('./xlsx-reader');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

async function download(url, token) {
  const res = await fetch(h.baseUrl() + url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
}

async function assign(token, letter, volunteerId) {
  const r = await api('POST', `/api/letters/${letter.id}/assign`, token, { volunteer_id: volunteerId, version: letter.version });
  assert.equal(r.status, 200, r.text);
  return r.body.letter;
}

test('permisos: sin sesión 401; sin REPORTES 403; con solo REPORTES ve los conteos pero no los listados de personas', async () => {
  const { token: admin } = await h.adminSession();
  const ev = await h.openEvent(admin);
  const child = await h.makeChild(admin, { first_name: 'Ximena', last_name: 'Zúñiga Secreta' });
  const vol = await h.makeVolunteer(admin, { first_name: 'Rodrigo', last_name: 'Padrino Oculto', phone: '2299998877' });
  await assign(admin, await h.makeLetter(admin, { eventId: ev.id, childId: child.id }), vol.id);

  for (const url of ['/api/reports/options', '/api/reports/dashboard', '/api/reports/events', '/api/reports/dashboard/export']) {
    assert.equal((await api('GET', url)).status, 401, url);
  }
  const other = await h.operatorSession(['CARTAS', 'BENEFICIARIOS', 'EVENTOS']);
  for (const url of ['/api/reports/options', '/api/reports/dashboard', '/api/reports/events', '/api/reports/dashboard/export']) {
    const r = await api('GET', url, other.token);
    assert.equal(r.status, 403, url);
    assert.equal(r.body.code, 'MODULE_FORBIDDEN');
  }

  const rep = await h.operatorSession(['REPORTES']);
  const d = await api('GET', '/api/reports/dashboard', rep.token);
  assert.equal(d.status, 200);
  assert.equal(d.headers.get('cache-control'), 'no-store');
  assert.equal(d.body.letters.total, 1);
  assert.equal(d.body.letters.with_sponsor, 1);
  for (const secret of ['Ximena', 'Zúñiga', 'Rodrigo', 'Oculto', '2299998877', 'Bicicleta']) {
    assert.ok(!d.text.includes(secret), `el dashboard no debe incluir "${secret}"`);
  }
  assert.equal((await api('GET', '/api/children', rep.token)).status, 403, 'REPORTES no abre los datos de niñas y niños');
  assert.equal((await api('GET', '/api/letters', rep.token)).status, 403);
});

test('sin eventos: opciones vacías, dashboard solo con totales generales y exportar → 404', async () => {
  const { token } = await h.adminSession();
  await h.makeChild(token);
  assert.deepEqual((await api('GET', '/api/reports/options', token)).body, { events: [], default_event_id: null });
  const d = await api('GET', '/api/reports/dashboard', token);
  assert.equal(d.status, 200);
  assert.equal(d.body.event, null);
  assert.equal(d.body.global.children_active, 1);
  assert.deepEqual(d.body.alerts, []);
  const x = await api('GET', '/api/reports/dashboard/export', token);
  assert.equal(x.status, 404);
});

test('validación: event_id no numérico → 422; inexistente → 404', async () => {
  const { token } = await h.adminSession();
  const bad = await api('GET', '/api/reports/dashboard?event_id=abc', token);
  assert.equal(bad.status, 422);
  assert.equal(bad.body.details[0].field, 'event_id');
  assert.equal((await api('GET', '/api/reports/dashboard?event_id=999', token)).status, 404);
  assert.equal((await api('GET', '/api/reports/dashboard/export?event_id=999', token)).status, 404);
});

test('evento sugerido: el abierto o en curso más próximo; si no, el abierto más reciente; si no, el de fecha más reciente', () => {
  const e = (id, status, date) => ({ id, status, event_date: date });
  const today = '2026-11-05';
  assert.equal(reports.defaultEventId([e(1, 'CERRADO', '2027-01-01'), e(2, 'ABIERTO', '2026-12-20'), e(3, 'EN_CURSO', '2026-11-30'),
    e(4, 'ABIERTO', '2026-10-01')], today), 3);
  assert.equal(reports.defaultEventId([e(1, 'ABIERTO', '2026-09-01'), e(2, 'EN_CURSO', '2026-10-01'), e(3, 'CERRADO', '2026-12-01')], today), 2);
  assert.equal(reports.defaultEventId([e(5, 'CERRADO', '2026-12-01'), e(6, 'BORRADOR', '2026-06-01')], today), 5);
  assert.equal(reports.defaultEventId([], today), null);
  assert.equal(reports.weekStart('2026-11-05'), '2026-11-02', 'jueves → lunes');
  assert.equal(reports.weekStart('2026-11-08'), '2026-11-02', 'domingo → lunes anterior');
  assert.equal(reports.weekStart('2026-11-09'), '2026-11-09');
  assert.equal(reports.pct(1, 3), 33.3);
  assert.equal(reports.pct(0, 0), null);
});

test('GET /dashboard sin event_id usa el evento sugerido y options lo informa', async () => {
  const { token } = await h.adminSession();
  const closed = await h.openEvent(token, { event_date: '2025-12-20' }, 'CERRADO');
  const open = await h.openEvent(token, { event_date: '2099-12-20' });
  const opts = await api('GET', '/api/reports/options', token);
  assert.deepEqual(opts.body.events.map((x) => x.id), [open.id, closed.id], 'más reciente primero');
  assert.equal(opts.body.default_event_id, open.id);
  assert.equal(opts.body.events[0].accepts_letters, true);
  assert.equal((await api('GET', '/api/reports/dashboard', token)).body.event.id, open.id);
  assert.equal((await api('GET', `/api/reports/dashboard?event_id=${closed.id}`, token)).body.event.id, closed.id);
});

test('avisos con enlaces a listados filtrados; el filtro "sin carta" de /children coincide con la cifra', async () => {
  const { token } = await h.adminSession();
  const ev = await h.openEvent(token);
  const withLetter = await h.makeChild(token);
  await h.makeChild(token);
  await h.makeChild(token);
  await h.makeChild(token, { guardian_consent: false });
  await h.makeLetter(token, { eventId: ev.id, childId: withLetter.id });

  const d = (await api('GET', `/api/reports/dashboard?event_id=${ev.id}`, token)).body;
  const byCode = Object.fromEntries(d.alerts.map((a) => [a.code, a]));
  assert.equal(byCode.CHILDREN_WITHOUT_LETTER.count, 2);
  assert.equal(byCode.CHILDREN_WITHOUT_LETTER.text, '2 niñas y niños con consentimiento aún no tienen carta en este evento.');
  assert.deepEqual(byCode.CHILDREN_WITHOUT_LETTER.link, { view: 'ninos', params: { sin_carta: String(ev.id), consentimiento: 'true' } });
  assert.equal(byCode.CHILDREN_WITHOUT_CONSENT.count, 1);
  assert.equal(byCode.LETTERS_WITHOUT_SPONSOR.count, 1);
  assert.equal(byCode.GIFTS_NOT_RECEIVED, undefined, 'sin cifra no hay aviso');

  const list = await api('GET', `/api/children?without_letter_event_id=${ev.id}&consent=true&is_active=true`, token);
  assert.equal(list.body.total, d.children.eligible_without_letter);
  assert.ok(!list.body.items.some((c) => c.id === withLetter.id));
  assert.equal((await api('GET', '/api/children?without_letter_event_id=x', token)).status, 422);
});

test('un evento que no es de Navidad no muestra avisos de cartas', async () => {
  const { token } = await h.adminSession();
  const ev = await h.openEvent(token, { event_type: 'DIA_DEL_NINO', name: 'Día del Niño 2027', code_prefix: 'DN27' });
  await h.makeChild(token);
  const d = (await api('GET', `/api/reports/dashboard?event_id=${ev.id}`, token)).body;
  assert.equal(d.event.accepts_letters, false);
  assert.deepEqual(d.alerts, []);
});

test('avance semanal: reconstruye el estatus al cierre de cada semana y el último punto es igual al actual', async () => {
  const { token } = await h.adminSession();
  const ev = await h.openEvent(token);
  const vol = await h.makeVolunteer(token);
  const l1 = await h.makeLetter(token, { eventId: ev.id, childId: (await h.makeChild(token)).id });
  const l2 = await h.makeLetter(token, { eventId: ev.id, childId: (await h.makeChild(token)).id });
  const a1 = await assign(token, l1, vol.id);
  await api('POST', `/api/letters/${l1.id}/status`, token, { to_status: 'RECIBIDO', version: a1.version });

  // Las fechas del historial se mueven a semanas pasadas (el disparador de solo inserción se quita solo en la prueba)
  const db = getDb();
  const rows = db.prepare('SELECT id, letter_id, to_status FROM letter_status_history ORDER BY id').all();
  const dates = { [`${l1.id}PENDIENTE`]: '2026-10-05T16:00:00.000Z', [`${l2.id}PENDIENTE`]: '2026-10-06T16:00:00.000Z',
    [`${l1.id}ASIGNADO`]: '2026-10-14T16:00:00.000Z', [`${l1.id}RECIBIDO`]: '2026-10-26T05:30:00.000Z' }; // domingo 25, 23:30 en Veracruz
  db.exec('DROP TRIGGER trg_letter_status_history_no_update');
  for (const r of rows) db.prepare('UPDATE letter_status_history SET created_at = ? WHERE id = ?').run(dates[`${r.letter_id}${r.to_status}`], r.id);
  db.exec(`CREATE TRIGGER trg_letter_status_history_no_update BEFORE UPDATE ON letter_status_history
    BEGIN SELECT RAISE(ABORT, 'letter_status_history es de solo inserción'); END;`);

  const points = reports.timeline(ev.id, db, '2026-11-05');
  assert.deepEqual(points.map((p) => p.week_start), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
  const s = (p) => [p.by_status.PENDIENTE, p.by_status.ASIGNADO, p.by_status.RECIBIDO, p.by_status.ENTREGADO];
  assert.deepEqual(points.map(s), [[2, 0, 0, 0], [1, 1, 0, 0], [1, 0, 1, 0], [1, 0, 1, 0], [1, 0, 1, 0]],
    'el lunes 26 a las 05:30 UTC todavía es domingo en Veracruz: cuenta en la semana del 19');
  const d = (await api('GET', `/api/reports/dashboard?event_id=${ev.id}`, token)).body;
  assert.deepEqual(d.timeline[d.timeline.length - 1].by_status, d.letters.by_status);
});

test('comparativo de eventos: una fila por evento con sus cartas, voluntarios confirmados y actividades', async () => {
  const { user, token } = await h.adminSession();
  const a = await h.openEvent(token);
  const b = await h.openEvent(token, { event_date: '2027-12-20' });
  await h.makeLetter(token, { eventId: a.id, childId: (await h.makeChild(token)).id });
  const vol = await h.makeVolunteer(token);
  await api('POST', `/api/events/${b.id}/volunteers`, token, { volunteer_ids: [vol.id] });
  await h.makeActivity(token, user.id, { event_id: b.id });
  const r = await api('GET', '/api/reports/events', token);
  assert.deepEqual(r.body.items.map((e) => [e.id, e.letters_total, e.volunteers_confirmed, e.activities]), [[b.id, 0, 1, 1], [a.id, 1, 0, 0]]);
  assert.equal(r.body.items[1].with_sponsor_pct, 0);
  assert.equal(r.body.items[0].with_sponsor_pct, null);
});

test('exportar a Excel: .xlsx con sus hojas, nombre por evento y registro en la bitácora (sin datos personales)', async () => {
  const { token } = await h.adminSession();
  const ev = await h.openEvent(token);
  await h.makeLetter(token, { eventId: ev.id, childId: (await h.makeChild(token, { first_name: 'Valeria' })).id });
  const x = await download(`/api/reports/dashboard/export?event_id=${ev.id}`, token);
  assert.equal(x.status, 200);
  assert.equal(x.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(x.headers.get('content-disposition'), new RegExp(`attachment; filename="reporte-${ev.code_prefix.toLowerCase()}-\\d{4}-\\d{2}-\\d{2}\\.xlsx"`));
  assert.equal(x.headers.get('cache-control'), 'no-store');
  const book = readXlsx(x.buffer);
  assert.deepEqual(book.names, ['Resumen', 'Cartas por estatus', 'Por escuela', 'Avance semanal', 'Voluntarios', 'Actividades',
    'Inventario', 'Eventos']);
  assert.equal(findRow(book.sheets.Resumen, 'Cartas registradas')[1], 1);
  assert.ok(!JSON.stringify(book.sheets).includes('Valeria'));

  const log = h.auditRows().filter((r) => r.action === 'DATA_EXPORTED');
  assert.equal(log.length, 1);
  assert.equal(log[0].entity, 'events');
  assert.equal(log[0].entity_id, ev.id);
  assert.deepEqual(log[0].detail, { format: 'xlsx', report: 'dashboard', sheets: 8, count: 1 });

  const dn = await h.openEvent(token, { event_type: 'DIA_DEL_NINO', name: 'Día del Niño 2028', code_prefix: 'DN28' });
  const y = readXlsx((await download(`/api/reports/dashboard/export?event_id=${dn.id}`, token)).buffer);
  assert.deepEqual(y.names, ['Resumen', 'Voluntarios', 'Actividades', 'Inventario', 'Eventos'], 'sin hojas de cartas');
});
