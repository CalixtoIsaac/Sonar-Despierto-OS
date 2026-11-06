/**
 * Gate de la Fase 7 (hoja de ruta): las cifras del dashboard coinciden con consultas SQL de control.
 *
 * Se arma un escenario con datos de todas las fases (dos eventos, escuelas, niñas y niños con y sin
 * consentimiento, dados de baja, cartas en los cuatro estatus, voluntarios postulados / confirmados /
 * cancelados, actividades ligadas y canceladas, movimientos de inventario con traspaso y anulación) y cada
 * cifra de la API —y de la hoja de Excel— se compara con una consulta SQL escrita aparte, directa sobre las tablas.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { getDb } = require('../lib/db');
const { readXlsx, findRow } = require('./xlsx-reader');

after(h.stop);

const api = (method, url, token, body) => h.request(method, url, { token, body });
const ok = async (p, status = 200) => { const r = await p; assert.equal(r.status, status, r.text); return r.body; };
const n = (sql, ...params) => getDb().prepare(sql).get(...params).n;

let token;
let reportToken;
let ev;
let other;

/** Escenario de prueba (se arma una vez para todas las comparaciones). */
before(async () => {
  await h.start();
  const admin = await h.adminSession();
  token = admin.token;
  reportToken = (await h.operatorSession(['REPORTES'])).token;
  ev = await h.openEvent(token, { name: 'Navidad Gate', code_prefix: 'GATE', max_letters_per_sponsor: 2 });
  other = await h.openEvent(token, { name: 'Navidad Otra', code_prefix: 'OTRA' });

  const sA = (await ok(api('POST', '/api/schools', token, h.schoolPayload({ name: 'Primaria Hidalgo' })), 201)).school;
  const sB = (await ok(api('POST', '/api/schools', token, h.schoolPayload({ name: 'Primaria Morelos' })), 201)).school;
  await ok(api('POST', '/api/schools', token, h.schoolPayload({ name: 'Escuela sin cartas' })), 201);

  const kids = [];
  for (const [school, gender] of [[sA, 'NINA'], [sA, 'NINO'], [sA, 'NINA'], [sB, 'NINO'], [sB, 'NINA'], [null, 'NINO'], [sB, 'OTRO']]) {
    kids.push(await h.makeChild(token, { school_id: school ? school.id : null, gender }));
  }
  await h.makeChild(token, { guardian_consent: false, school_id: sA.id });            // sin consentimiento
  await h.makeChild(token, { guardian_consent: false });                               // sin consentimiento
  const gone = await h.makeChild(token, { school_id: sB.id });                         // se dará de baja
  await ok(api('PATCH', `/api/children/${gone.id}`, token, { is_active: false }));

  const vols = [];
  for (const [size, area] of [['M', 'LOGISTICA'], ['L', 'PADRINO'], ['M', 'PADRINO'], ['XL', 'GUIA_NINOS'], ['S', 'REGISTRO']]) {
    vols.push(await h.makeVolunteer(token, { shirt_size: size, area_of_interest: area }));
  }
  const inactive = await h.makeVolunteer(token);
  await ok(api('PATCH', `/api/volunteers/${inactive.id}`, token, { is_active: false }));
  await ok(api('POST', `/api/events/${ev.id}/volunteers`, token, { volunteer_ids: [vols[0].id, vols[1].id, vols[2].id, vols[3].id] }), 201);
  await ok(api('POST', `/api/events/${ev.id}/volunteers`, token, { volunteer_ids: [vols[4].id], status: 'POSTULADO' }), 201);
  await ok(api('PATCH', `/api/events/${ev.id}/volunteers/${vols[3].id}`, token, { status: 'CANCELADO' }));
  await ok(api('POST', `/api/events/${other.id}/volunteers`, token, { volunteer_ids: [vols[0].id] }), 201);

  // Cartas del evento: 6 (en los cuatro estatus) + 1 en el otro evento
  const letters = [];
  for (const k of kids.slice(0, 6)) letters.push(await h.makeLetter(token, { eventId: ev.id, childId: k.id }));
  await h.makeLetter(token, { eventId: other.id, childId: kids[0].id });
  const step = async (letter, path, body) => (await ok(api('POST', `/api/letters/${letter.id}/${path}`, token, { ...body, version: letter.version }))).letter;
  let l = await step(letters[0], 'assign', { volunteer_id: vols[1].id });
  l = await step(l, 'status', { to_status: 'RECIBIDO' });
  await step(l, 'status', { to_status: 'ENTREGADO' });
  l = await step(letters[1], 'assign', { volunteer_id: vols[1].id });
  await step(l, 'status', { to_status: 'RECIBIDO' });
  await step(letters[2], 'assign', { volunteer_id: vols[2].id });
  l = await step(letters[3], 'assign', { volunteer_id: vols[0].id });
  await step(l, 'release', {});                                                       // vuelve a PENDIENTE
  // letters[4] y letters[5] se quedan en PENDIENTE

  // Actividades: dos ligadas (una cancelada después), una sin evento
  const me = admin.user.id;
  await h.makeActivity(token, me, { event_id: ev.id, activity_type: 'ACOPIO', activity_date: '2099-12-01' });
  const cancel = await h.makeActivity(token, me, { event_id: ev.id, activity_type: 'JUNTA', start_time: '12:00', end_time: '13:00' });
  await ok(api('POST', `/api/activities/${cancel.id}/status`, token, { to_status: 'CANCELADA', reason: 'Se movió a otra fecha', version: cancel.version }));
  await h.makeActivity(token, me, { activity_type: 'CAPACITACION', start_time: '15:00', end_time: '16:00' });

  // Inventario: entrada ligada, salidas ligadas (una anulada), traspaso ligado (no cuenta), artículo bajo mínimo
  const cat = await h.makeCategory(token);
  const c1 = await h.makeCenter(token);
  const c2 = await h.makeCenter(token);
  const bags = await h.makeItem(token, cat.id, { name: 'Bolsa de regalo', unit: 'BOLSA', min_stock: 100 });
  const chairs = await h.makeItem(token, cat.id, { name: 'Silla plegable', min_stock: 5 });
  await h.move(token, 'ENTRADA', c1.id, bags.id, 60, { event_id: ev.id });
  await h.move(token, 'ENTRADA', c1.id, chairs.id, 20);
  const out = await h.move(token, 'SALIDA', c1.id, bags.id, 15, { event_id: ev.id });
  await h.move(token, 'SALIDA', c1.id, chairs.id, 4, { event_id: ev.id });
  await h.move(token, 'TRASPASO', c1.id, chairs.id, 6, { to_center_id: c2.id, event_id: ev.id });
  await ok(api('POST', `/api/inventory/movements/${out[0].id}/reverse`, token, { reason: 'Se capturó dos veces' }), 201);
  await h.move(token, 'SALIDA', c1.id, bags.id, 10, { event_id: ev.id });
});

test('cartas: total, por estatus, porcentajes, fotos y padrinos = SQL de control', async () => {
  const d = await ok(api('GET', `/api/reports/dashboard?event_id=${ev.id}`, reportToken));
  const L = d.letters;
  const byStatus = Object.fromEntries(getDb().prepare('SELECT status, COUNT(*) AS n FROM letters WHERE event_id = ? GROUP BY status')
    .all(ev.id).map((r) => [r.status, r.n]));
  assert.deepEqual(L.by_status, { PENDIENTE: byStatus.PENDIENTE || 0, ASIGNADO: byStatus.ASIGNADO || 0, RECIBIDO: byStatus.RECIBIDO || 0,
    ENTREGADO: byStatus.ENTREGADO || 0 });
  assert.deepEqual(L.by_status, { PENDIENTE: 3, ASIGNADO: 1, RECIBIDO: 1, ENTREGADO: 1 }, 'el escenario es el esperado');
  const total = n('SELECT COUNT(*) AS n FROM letters WHERE event_id = ?', ev.id);
  const sponsored = n("SELECT COUNT(*) AS n FROM letters WHERE event_id = ? AND sponsor_volunteer_id IS NOT NULL", ev.id);
  assert.equal(L.total, total);
  assert.equal(L.with_sponsor, sponsored);
  assert.equal(L.received_or_delivered, n("SELECT COUNT(*) AS n FROM letters WHERE event_id = ? AND status IN ('RECIBIDO','ENTREGADO')", ev.id));
  assert.equal(L.with_sponsor_pct, Math.round((sponsored / total) * 1000) / 10);
  assert.equal(L.delivered_pct, Math.round((L.by_status.ENTREGADO / total) * 1000) / 10);
  assert.equal(L.with_photo, n('SELECT COUNT(*) AS n FROM letters WHERE event_id = ? AND photo_path IS NOT NULL', ev.id));
  assert.equal(L.sponsors, n('SELECT COUNT(DISTINCT sponsor_volunteer_id) AS n FROM letters WHERE event_id = ?', ev.id));
  assert.equal(L.sponsors_at_limit, n(`SELECT COUNT(*) AS n FROM (SELECT sponsor_volunteer_id FROM letters WHERE event_id = ?
      AND sponsor_volunteer_id IS NOT NULL GROUP BY sponsor_volunteer_id HAVING COUNT(*) >= 2)`, ev.id));
  assert.equal(L.sponsors_at_limit, 1, 'un padrino tiene 2 de 2 cartas');
  // La suma por estatus cuadra con el total y con el listado de Cartas
  assert.equal(Object.values(L.by_status).reduce((a, b) => a + b, 0), L.total);
  const summary = await ok(api('GET', `/api/letters/summary?event_id=${ev.id}`, token));
  assert.equal(summary.total, L.total);
  assert.deepEqual(summary.by_status, L.by_status);
});

test('niñas y niños, escuelas y voluntarios = SQL de control', async () => {
  const d = await ok(api('GET', `/api/reports/dashboard?event_id=${ev.id}`, reportToken));
  assert.equal(d.children.active, n('SELECT COUNT(*) AS n FROM children WHERE is_active = 1'));
  assert.equal(d.children.without_consent, n('SELECT COUNT(*) AS n FROM children WHERE is_active = 1 AND guardian_consent = 0'));
  assert.equal(d.children.with_letter, n('SELECT COUNT(DISTINCT child_id) AS n FROM letters WHERE event_id = ?', ev.id));
  const eligible = n(`SELECT COUNT(*) AS n FROM children c WHERE c.is_active = 1 AND c.guardian_consent = 1
      AND c.id NOT IN (SELECT child_id FROM letters WHERE event_id = ?)`, ev.id);
  assert.equal(d.children.eligible_without_letter, eligible);
  assert.deepEqual([d.children.active, d.children.without_consent, d.children.eligible_without_letter], [9, 2, 1]);
  for (const g of ['NINA', 'NINO', 'OTRO', 'NO_ESPECIFICA']) {
    assert.equal(d.children.letters_by_gender[g], n(`SELECT COUNT(*) AS n FROM letters l JOIN children c ON c.id = l.child_id
        WHERE l.event_id = ? AND c.gender = ?`, ev.id, g), g);
  }

  assert.equal(d.schools.participating, n(`SELECT COUNT(DISTINCT c.school_id) AS n FROM letters l JOIN children c ON c.id = l.child_id
      WHERE l.event_id = ? AND c.school_id IS NOT NULL`, ev.id));
  for (const row of d.by_school) {
    const where = row.id === null ? 'c.school_id IS NULL' : 'c.school_id = @s';
    for (const st of ['PENDIENTE', 'ASIGNADO', 'RECIBIDO', 'ENTREGADO']) {
      assert.equal(row.by_status[st], getDb().prepare(`SELECT COUNT(*) AS n FROM letters l JOIN children c ON c.id = l.child_id
          WHERE l.event_id = @e AND ${where} AND l.status = @st`).get({ e: ev.id, s: row.id, st }).n, `${row.name} ${st}`);
    }
  }
  assert.equal(d.by_school.reduce((a, x) => a + x.total, 0), d.letters.total, 'las escuelas suman el total');
  assert.deepEqual(d.by_school.map((x) => x.name), ['Primaria Hidalgo', 'Primaria Morelos', 'Sin escuela']);

  const V = d.volunteers;
  assert.equal(V.active, n('SELECT COUNT(*) AS n FROM volunteers WHERE is_active = 1'));
  for (const st of ['POSTULADO', 'CONFIRMADO', 'RECHAZADO', 'CANCELADO']) {
    assert.equal(V.by_status[st], n('SELECT COUNT(*) AS n FROM event_volunteers WHERE event_id = ? AND status = ?', ev.id, st), st);
  }
  assert.deepEqual([V.confirmed, V.by_status.POSTULADO, V.by_status.CANCELADO], [3, 1, 1]);
  for (const [area, count] of Object.entries(V.confirmed_by_area)) {
    assert.equal(count, n("SELECT COUNT(*) AS n FROM event_volunteers WHERE event_id = ? AND status = 'CONFIRMADO' AND area = ?", ev.id, area), area);
  }
  for (const [size, count] of Object.entries(V.shirt_sizes)) {
    assert.equal(count, n(`SELECT COUNT(*) AS n FROM event_volunteers ev JOIN volunteers v ON v.id = ev.volunteer_id
        WHERE ev.event_id = ? AND ev.status = 'CONFIRMADO' AND v.shirt_size = ?`, ev.id, size), size);
  }
  // Coincide también con el detalle del evento (Fase 4)
  const evDetail = await ok(api('GET', `/api/events/${ev.id}`, token));
  assert.deepEqual(evDetail.event.stats.shirt_sizes, V.shirt_sizes);
});

test('actividades, inventario y totales generales = SQL de control', async () => {
  const d = await ok(api('GET', `/api/reports/dashboard?event_id=${ev.id}`, reportToken));
  for (const st of ['PROGRAMADA', 'REALIZADA', 'CANCELADA']) {
    assert.equal(d.activities.by_status[st], n('SELECT COUNT(*) AS n FROM activities WHERE event_id = ? AND status = ?', ev.id, st));
  }
  for (const [t, count] of Object.entries(d.activities.by_type)) {
    assert.equal(count, n("SELECT COUNT(*) AS n FROM activities WHERE event_id = ? AND activity_type = ? AND status <> 'CANCELADA'", ev.id, t), t);
  }
  assert.equal(d.activities.total, 2);
  assert.equal(d.activities.upcoming.length, 1);

  // Inventario del evento: salidas − anulaciones de salidas, sin traspasos (control con otra forma de escribirlo)
  const usedSql = (itemName) => n(`SELECT
      COALESCE((SELECT SUM(m.quantity) FROM inventory_movements m JOIN inventory_items i ON i.id = m.item_id
        WHERE i.name = @it AND m.event_id = @e AND m.direction = 'SALIDA' AND m.reason NOT IN ('TRASPASO', 'ANULACION')), 0)
      - COALESCE((SELECT SUM(r.quantity) FROM inventory_movements r JOIN inventory_movements o ON o.id = r.reverses_id
        JOIN inventory_items i ON i.id = r.item_id WHERE i.name = @it AND r.event_id = @e AND o.direction = 'SALIDA'
        AND o.reason <> 'TRASPASO'), 0) AS n`, { it: itemName, e: ev.id });
  const inv = Object.fromEntries(d.inventory.items.map((x) => [x.name, x]));
  assert.equal(inv['Bolsa de regalo'].out, usedSql('Bolsa de regalo'));
  assert.equal(inv['Silla plegable'].out, usedSql('Silla plegable'));
  assert.deepEqual([inv['Bolsa de regalo'].in, inv['Bolsa de regalo'].out, inv['Silla plegable'].in, inv['Silla plegable'].out], [60, 10, 0, 4],
    'la salida anulada no cuenta y el traspaso tampoco');
  assert.equal(d.inventory.units_out, 14);
  const low = n(`SELECT COUNT(*) AS n FROM inventory_items i WHERE i.is_active = 1 AND i.min_stock > 0 AND i.min_stock >
      (SELECT COALESCE(SUM(CASE direction WHEN 'ENTRADA' THEN quantity ELSE -quantity END), 0) FROM inventory_movements WHERE item_id = i.id)`);
  assert.equal(d.inventory.low_stock_items, low);
  assert.equal(d.inventory.low_stock_items, (await ok(api('GET', '/api/inventory/summary', token))).low_stock, 'igual que el Inventario');

  const G = d.global;
  assert.equal(G.volunteers_active, n('SELECT COUNT(*) AS n FROM volunteers WHERE is_active = 1'));
  assert.equal(G.schools_active, n('SELECT COUNT(*) AS n FROM schools WHERE is_active = 1'));
  assert.equal(G.tutors_active, n('SELECT COUNT(*) AS n FROM tutors WHERE is_active = 1'));
  assert.equal(G.events_by_status.ABIERTO, n("SELECT COUNT(*) AS n FROM events WHERE status = 'ABIERTO'"));
});

test('el avance semanal termina en el estatus actual y el comparativo coincide por evento', async () => {
  const d = await ok(api('GET', `/api/reports/dashboard?event_id=${ev.id}`, reportToken));
  const last = d.timeline[d.timeline.length - 1];
  assert.deepEqual(last.by_status, d.letters.by_status);
  assert.equal(last.total, d.letters.total);
  const cmp = await ok(api('GET', '/api/reports/events', reportToken));
  for (const row of cmp.items) {
    assert.equal(row.letters_total, n('SELECT COUNT(*) AS n FROM letters WHERE event_id = ?', row.id), row.name);
    assert.equal(row.volunteers_confirmed, n("SELECT COUNT(*) AS n FROM event_volunteers WHERE event_id = ? AND status = 'CONFIRMADO'", row.id));
    assert.equal(row.activities, n("SELECT COUNT(*) AS n FROM activities WHERE event_id = ? AND status <> 'CANCELADA'", row.id));
  }
});

test('el Excel tiene las mismas cifras que el dashboard y que el SQL de control', async () => {
  const d = await ok(api('GET', `/api/reports/dashboard?event_id=${ev.id}`, reportToken));
  const res = await fetch(`${h.baseUrl()}/api/reports/dashboard/export?event_id=${ev.id}`, { headers: { Authorization: `Bearer ${reportToken}` } });
  assert.equal(res.status, 200);
  const { sheets } = readXlsx(Buffer.from(await res.arrayBuffer()));

  const R = sheets.Resumen;
  assert.equal(findRow(R, 'Cartas registradas')[1], n('SELECT COUNT(*) AS n FROM letters WHERE event_id = ?', ev.id));
  assert.deepEqual(findRow(R, 'Cartas con padrino (asignadas, recibidas o entregadas)').slice(1), [d.letters.with_sponsor, d.letters.with_sponsor_pct / 100]);
  assert.equal(findRow(R, 'Regalos entregados')[1], n("SELECT COUNT(*) AS n FROM letters WHERE event_id = ? AND status = 'ENTREGADO'", ev.id));
  assert.equal(findRow(R, 'Con consentimiento y sin carta en este evento')[1], d.children.eligible_without_letter);
  assert.equal(findRow(R, 'Voluntarios confirmados en el evento')[1], d.volunteers.confirmed);
  assert.equal(findRow(R, 'Unidades de inventario usadas en el evento')[1], d.inventory.units_out);

  const S = sheets['Cartas por estatus'];
  assert.deepEqual(['Pendiente', 'Con padrino', 'Regalo recibido', 'Entregado'].map((label) => findRow(S, label)[1]),
    ['PENDIENTE', 'ASIGNADO', 'RECIBIDO', 'ENTREGADO'].map((s) => d.letters.by_status[s]));
  assert.equal(findRow(S, 'Total')[1], d.letters.total);

  const E = sheets['Por escuela'];
  for (const x of d.by_school) assert.equal(findRow(E, x.name)[1], x.total, x.name);

  const W = sheets['Avance semanal'];
  const lastWeek = W.filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(r[0])).pop();
  assert.deepEqual(lastWeek.slice(2), [d.letters.by_status.PENDIENTE, d.letters.by_status.ASIGNADO, d.letters.by_status.RECIBIDO,
    d.letters.by_status.ENTREGADO, d.letters.total]);

  assert.equal(findRow(sheets.Voluntarios, 'Padrino o madrina')[1], d.volunteers.confirmed_by_area.PADRINO);
  assert.equal(findRow(sheets.Inventario, 'Bolsa de regalo')[4], 10);
  assert.equal(findRow(sheets.Eventos, 'Navidad Otra')[4], n('SELECT COUNT(*) AS n FROM letters WHERE event_id = ?', other.id));
});
