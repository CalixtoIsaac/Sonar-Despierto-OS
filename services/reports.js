/**
 * Dashboard y reportes (Fase 7, ADR-0014). Solo LECTURA y solo CONTEOS: ninguna respuesta lleva nombres,
 * teléfonos ni datos de niñas, niños o voluntarios; por eso basta el módulo REPORTES para verlas.
 *
 *   reportOptions()            → eventos para el selector + el evento sugerido
 *   dashboard(eventId)         → indicadores de un evento (cartas, niñas y niños, voluntarios, escuelas,
 *                                avance semanal, actividades, inventario) + totales generales
 *   eventsComparison()         → una fila por evento (comparativo)
 *
 * Todas las cifras salen de las tablas de las Fases 3–6 en el momento de la consulta (no hay tablas de
 * resumen ni caché), así siempre coinciden con las consultas SQL de control del Gate (test/gate-f7.test.js).
 */
const { getDb, nowIso } = require('../lib/db');
const {
  LETTER_STATUSES, LETTER_EVENT_TYPES, PARTICIPATION_STATUSES, VOLUNTEER_AREAS, SHIRT_SIZES, GENDERS,
  ACTIVITY_TYPES, ACTIVITY_STATUSES, EVENT_STATUSES
} = require('../lib/catalogs');
const { todayLocal } = require('../lib/text');
const R = require('./records');
const events = require('./events');

const OPEN_STATUSES = ['ABIERTO', 'EN_CURSO'];
const SPONSORED = ['ASIGNADO', 'RECIBIDO', 'ENTREGADO'];
const TIMELINE_MAX_WEEKS = 26;
const UPCOMING_LIMIT = 5;
const INVENTORY_ITEMS_LIMIT = 50;

const zeros = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
/** Porcentaje con un decimal; null si no hay base. */
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : null);

function countBy(db, sql, params, keys) {
  const out = zeros(keys);
  for (const r of db.prepare(sql).all(params)) if (r.k in out) out[r.k] = r.n;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Selector de evento
// ---------------------------------------------------------------------------------------------

const toEventOption = (e) => ({
  id: e.id, name: e.name, event_type: e.event_type, code_prefix: e.code_prefix, status: e.status, event_date: e.event_date,
  accepts_letters: LETTER_EVENT_TYPES.includes(e.event_type)
});

/**
 * Evento sugerido: el abierto o en curso más próximo (hoy o después); si todos ya pasaron, el abierto más reciente;
 * si no hay abiertos, el de fecha más reciente.
 */
function defaultEventId(list, today = todayLocal()) {
  const open = list.filter((e) => OPEN_STATUSES.includes(e.status)).sort((a, b) => a.event_date.localeCompare(b.event_date) || a.id - b.id);
  const upcoming = open.find((e) => e.event_date >= today);
  if (upcoming) return upcoming.id;
  if (open.length) return open[open.length - 1].id;
  return list.length ? list[0].id : null;
}

function reportOptions(db = getDb()) {
  const list = db.prepare(`SELECT id, name, event_type, code_prefix, status, event_date FROM events
      ORDER BY event_date DESC, id DESC`).all();
  return { events: list.map(toEventOption), default_event_id: defaultEventId(list) };
}

// ---------------------------------------------------------------------------------------------
// Bloques del dashboard
// ---------------------------------------------------------------------------------------------

function lettersBlock(eventId, event, db) {
  const byStatus = countBy(db, 'SELECT status AS k, COUNT(*) AS n FROM letters WHERE event_id = ? GROUP BY status', [eventId], LETTER_STATUSES);
  const total = LETTER_STATUSES.reduce((n, s) => n + byStatus[s], 0);
  const withSponsor = SPONSORED.reduce((n, s) => n + byStatus[s], 0);
  const received = byStatus.RECIBIDO + byStatus.ENTREGADO;
  const extra = db.prepare(`SELECT
      SUM(CASE WHEN photo_path IS NOT NULL THEN 1 ELSE 0 END) AS with_photo,
      COUNT(DISTINCT sponsor_volunteer_id) AS sponsors
    FROM letters WHERE event_id = ?`).get(eventId);
  const atLimit = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT sponsor_volunteer_id FROM letters
      WHERE event_id = @e AND status IN ('ASIGNADO', 'RECIBIDO', 'ENTREGADO') GROUP BY sponsor_volunteer_id
      HAVING COUNT(*) >= @max)`).get({ e: eventId, max: event.max_letters_per_sponsor }).n;
  const sponsors = extra.sponsors || 0;
  return {
    total,
    by_status: byStatus,
    with_sponsor: withSponsor,
    received_or_delivered: received,
    with_sponsor_pct: pct(withSponsor, total),
    received_pct: pct(received, total),
    delivered_pct: pct(byStatus.ENTREGADO, total),
    with_photo: extra.with_photo || 0,
    sponsors,
    letters_per_sponsor: sponsors ? Math.round((withSponsor / sponsors) * 10) / 10 : null,
    sponsors_at_limit: atLimit,
    max_letters_per_sponsor: event.max_letters_per_sponsor
  };
}

/** Niñas y niños: activos, consentimiento y quiénes aún no tienen carta en este evento. */
function childrenBlock(eventId, db) {
  const row = db.prepare(`SELECT
      COUNT(*) AS active,
      SUM(CASE WHEN c.guardian_consent = 1 THEN 1 ELSE 0 END) AS with_consent,
      SUM(CASE WHEN c.guardian_consent = 0 THEN 1 ELSE 0 END) AS without_consent,
      SUM(CASE WHEN c.guardian_consent = 1 AND NOT EXISTS (SELECT 1 FROM letters l WHERE l.child_id = c.id AND l.event_id = @e)
          THEN 1 ELSE 0 END) AS eligible_without_letter
    FROM children c WHERE c.is_active = 1`).get({ e: eventId });
  const withLetter = db.prepare('SELECT COUNT(DISTINCT child_id) AS n FROM letters WHERE event_id = ?').get(eventId).n;
  const byGender = countBy(db, `SELECT c.gender AS k, COUNT(*) AS n FROM letters l JOIN children c ON c.id = l.child_id
      WHERE l.event_id = ? GROUP BY c.gender`, [eventId], GENDERS);
  return {
    active: row.active || 0,
    with_consent: row.with_consent || 0,
    without_consent: row.without_consent || 0,
    with_letter: withLetter,
    eligible_without_letter: row.eligible_without_letter || 0,
    letters_by_gender: byGender
  };
}

function volunteersBlock(eventId, db) {
  const active = db.prepare('SELECT COUNT(*) AS n FROM volunteers WHERE is_active = 1').get().n;
  const byStatus = countBy(db, 'SELECT status AS k, COUNT(*) AS n FROM event_volunteers WHERE event_id = ? GROUP BY status',
    [eventId], PARTICIPATION_STATUSES);
  const byArea = countBy(db, `SELECT area AS k, COUNT(*) AS n FROM event_volunteers WHERE event_id = ? AND status = 'CONFIRMADO'
      GROUP BY area`, [eventId], VOLUNTEER_AREAS);
  const sizes = countBy(db, `SELECT v.shirt_size AS k, COUNT(*) AS n FROM event_volunteers ev JOIN volunteers v ON v.id = ev.volunteer_id
      WHERE ev.event_id = ? AND ev.status = 'CONFIRMADO' GROUP BY v.shirt_size`, [eventId], SHIRT_SIZES);
  return {
    active,
    by_status: byStatus,
    in_event: byStatus.POSTULADO + byStatus.CONFIRMADO,
    confirmed: byStatus.CONFIRMADO,
    confirmed_by_area: byArea,
    shirt_sizes: sizes
  };
}

/** Cartas por escuela (la escuela de la niña o niño). "Sin escuela" va al final con id null. */
function bySchool(eventId, db) {
  const rows = db.prepare(`SELECT s.id AS id, s.name AS name, l.status AS status, COUNT(*) AS n
      FROM letters l JOIN children c ON c.id = l.child_id LEFT JOIN schools s ON s.id = c.school_id
      WHERE l.event_id = ? GROUP BY s.id, l.status`).all(eventId);
  const map = new Map();
  for (const r of rows) {
    const key = r.id ?? 'none';
    if (!map.has(key)) map.set(key, { id: r.id ?? null, name: r.name ?? 'Sin escuela', total: 0, by_status: zeros(LETTER_STATUSES) });
    const x = map.get(key);
    x.by_status[r.status] += r.n;
    x.total += r.n;
  }
  return [...map.values()]
    .map((x) => ({ ...x, delivered_pct: pct(x.by_status.ENTREGADO, x.total),
      with_sponsor_pct: pct(SPONSORED.reduce((n, s) => n + x.by_status[s], 0), x.total) }))
    .sort((a, b) => (a.id === null) - (b.id === null) || b.total - a.total || a.name.localeCompare(b.name, 'es'));
}

// ---------- Avance semanal (se reconstruye del historial de estatus, que es de solo inserción) ----------
const localDate = (iso) => todayLocal(new Date(iso));
function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Lunes de la semana de una fecha AAAA-MM-DD. */
function weekStart(date) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(date, -((dow + 6) % 7));
}

/**
 * Estatus de las cartas al cierre de cada semana (lunes a domingo, hora de Veracruz), desde la semana de la
 * primera carta hasta la semana actual (máximo las últimas 26). El último punto es igual a letters.by_status.
 */
function timeline(eventId, db, today = todayLocal()) {
  const rows = db.prepare(`SELECT h.letter_id, h.to_status, h.created_at FROM letter_status_history h
      JOIN letters l ON l.id = h.letter_id WHERE l.event_id = ? ORDER BY h.created_at, h.id`).all(eventId);
  if (!rows.length) return [];
  const firstWeek = weekStart(localDate(rows[0].created_at));
  const lastDate = [today, localDate(rows[rows.length - 1].created_at)].sort().pop();
  const lastWeek = weekStart(lastDate);
  const status = new Map();
  const points = [];
  let i = 0;
  for (let week = firstWeek; week <= lastWeek; week = addDays(week, 7)) {
    const end = addDays(week, 6);
    while (i < rows.length && localDate(rows[i].created_at) <= end) {
      status.set(rows[i].letter_id, rows[i].to_status);
      i += 1;
    }
    const counts = zeros(LETTER_STATUSES);
    for (const s of status.values()) counts[s] += 1;
    points.push({ week_start: week, week_end: end, total: status.size, by_status: counts });
  }
  return points.slice(-TIMELINE_MAX_WEEKS);
}

/** Actividades del calendario ligadas al evento (Fase 5). */
function activitiesBlock(eventId, db, today = todayLocal()) {
  const byStatus = countBy(db, 'SELECT status AS k, COUNT(*) AS n FROM activities WHERE event_id = ? GROUP BY status', [eventId], ACTIVITY_STATUSES);
  const byType = countBy(db, `SELECT activity_type AS k, COUNT(*) AS n FROM activities WHERE event_id = ? AND status <> 'CANCELADA'
      GROUP BY activity_type`, [eventId], ACTIVITY_TYPES);
  const upcoming = db.prepare(`SELECT id, title, activity_type, activity_date, start_time, end_time FROM activities
      WHERE event_id = @e AND status = 'PROGRAMADA' AND activity_date >= @today
      ORDER BY activity_date, start_time, id LIMIT ${UPCOMING_LIMIT}`).all({ e: eventId, today });
  return {
    total: ACTIVITY_STATUSES.reduce((n, s) => n + byStatus[s], 0),
    by_status: byStatus,
    by_type: byType,
    upcoming
  };
}

/**
 * Inventario ligado al evento (Fase 6): entradas y salidas netas por artículo. Los traspasos no cuentan (solo
 * mueven entre centros) y una anulación resta del movimiento que anuló (copia su event_id).
 */
function inventoryBlock(eventId, db) {
  const rows = db.prepare(`SELECT i.id, i.name, i.unit, ic.name AS category,
      SUM(CASE WHEN m.reason <> 'ANULACION' AND m.direction = 'ENTRADA' THEN m.quantity
               WHEN m.reason = 'ANULACION' AND m.direction = 'SALIDA' THEN -m.quantity ELSE 0 END) AS qty_in,
      SUM(CASE WHEN m.reason <> 'ANULACION' AND m.direction = 'SALIDA' THEN m.quantity
               WHEN m.reason = 'ANULACION' AND m.direction = 'ENTRADA' THEN -m.quantity ELSE 0 END) AS qty_out,
      COUNT(*) AS movements
    FROM inventory_movements m
    LEFT JOIN inventory_movements o ON o.id = m.reverses_id
    JOIN inventory_items i ON i.id = m.item_id
    JOIN inventory_categories ic ON ic.id = i.category_id
    WHERE m.event_id = ? AND m.reason <> 'TRASPASO' AND COALESCE(o.reason, '') <> 'TRASPASO'
    GROUP BY i.id`).all(eventId);
  const items = rows
    .map((r) => ({ id: r.id, name: r.name, unit: r.unit, category: r.category, in: r.qty_in || 0, out: r.qty_out || 0, movements: r.movements }))
    .filter((r) => r.in !== 0 || r.out !== 0)
    .sort((a, b) => b.out - a.out || b.in - a.in || a.name.localeCompare(b.name, 'es'));
  const low = db.prepare(`SELECT COUNT(*) AS n FROM inventory_items i WHERE i.is_active = 1 AND i.min_stock > 0 AND
      (SELECT COALESCE(SUM(CASE m.direction WHEN 'ENTRADA' THEN m.quantity ELSE -m.quantity END), 0)
         FROM inventory_movements m WHERE m.item_id = i.id) < i.min_stock`).get().n;
  return {
    items_count: items.length,
    units_in: items.reduce((n, x) => n + x.in, 0),
    units_out: items.reduce((n, x) => n + x.out, 0),
    items: items.slice(0, INVENTORY_ITEMS_LIMIT),
    low_stock_items: low
  };
}

/** Totales de toda la organización (no dependen del evento). */
function globalBlock(db) {
  const one = (sql) => db.prepare(sql).get().n;
  return {
    events_by_status: countBy(db, 'SELECT status AS k, COUNT(*) AS n FROM events GROUP BY status', [], EVENT_STATUSES),
    children_active: one('SELECT COUNT(*) AS n FROM children WHERE is_active = 1'),
    children_without_consent: one('SELECT COUNT(*) AS n FROM children WHERE is_active = 1 AND guardian_consent = 0'),
    volunteers_active: one('SELECT COUNT(*) AS n FROM volunteers WHERE is_active = 1'),
    schools_active: one('SELECT COUNT(*) AS n FROM schools WHERE is_active = 1'),
    tutors_active: one('SELECT COUNT(*) AS n FROM tutors WHERE is_active = 1')
  };
}

/** Avisos para el coordinador; `filter` dice a qué listado lleva (la pantalla lo enlaza solo si hay permiso). */
function alertsFor(d) {
  const alerts = [];
  const add = (code, count, text, link) => { if (count > 0) alerts.push({ code, count, text, link }); };
  if (d.event.accepts_letters) {
    add('CHILDREN_WITHOUT_CONSENT', d.children.without_consent,
      `${d.children.without_consent} ${d.children.without_consent === 1 ? 'niña o niño activo no tiene' : 'niñas y niños activos no tienen'} el consentimiento del tutor (no pueden recibir carta).`,
      { view: 'ninos', params: { consentimiento: 'false' } });
    add('CHILDREN_WITHOUT_LETTER', d.children.eligible_without_letter,
      `${d.children.eligible_without_letter} ${d.children.eligible_without_letter === 1 ? 'niña o niño con consentimiento aún no tiene' : 'niñas y niños con consentimiento aún no tienen'} carta en este evento.`,
      { view: 'ninos', params: { sin_carta: String(d.event.id), consentimiento: 'true' } });
    add('LETTERS_WITHOUT_SPONSOR', d.letters.by_status.PENDIENTE,
      `${d.letters.by_status.PENDIENTE} ${d.letters.by_status.PENDIENTE === 1 ? 'carta sigue' : 'cartas siguen'} sin padrino.`,
      { view: 'cartas', params: { evento: String(d.event.id), estatus: 'PENDIENTE' } });
    add('GIFTS_NOT_RECEIVED', d.letters.by_status.ASIGNADO,
      `${d.letters.by_status.ASIGNADO} ${d.letters.by_status.ASIGNADO === 1 ? 'regalo aún no llega' : 'regalos aún no llegan'} al acopio.`,
      { view: 'cartas', params: { evento: String(d.event.id), estatus: 'ASIGNADO' } });
  }
  add('LOW_STOCK', d.inventory.low_stock_items,
    `${d.inventory.low_stock_items} ${d.inventory.low_stock_items === 1 ? 'artículo está' : 'artículos están'} por debajo de su existencia mínima.`,
    { view: 'inventario', params: { existencia: 'bajo' } });
  return alerts;
}

function dashboard(eventId, db = getDb()) {
  const generatedAt = nowIso();
  const today = todayLocal();
  const global = globalBlock(db);
  if (!eventId) {
    return { generated_at: generatedAt, today, event: null, global, alerts: [] };
  }
  const row = events.getEventOr404(eventId, db);
  const event = { ...toEventOption(row), location: row.location ?? null, max_letters_per_sponsor: row.max_letters_per_sponsor };
  const d = {
    generated_at: generatedAt,
    today,
    event,
    letters: lettersBlock(eventId, row, db),
    children: childrenBlock(eventId, db),
    volunteers: volunteersBlock(eventId, db),
    schools: {
      active: global.schools_active,
      participating: db.prepare(`SELECT COUNT(DISTINCT c.school_id) AS n FROM letters l JOIN children c ON c.id = l.child_id
          WHERE l.event_id = ? AND c.school_id IS NOT NULL`).get(eventId).n
    },
    by_school: bySchool(eventId, db),
    timeline: timeline(eventId, db, today),
    activities: activitiesBlock(eventId, db, today),
    inventory: inventoryBlock(eventId, db),
    global
  };
  d.alerts = alertsFor(d);
  return d;
}

/** Comparativo: una fila por evento (más reciente primero). */
function eventsComparison(db = getDb()) {
  const list = db.prepare(`SELECT e.id, e.name, e.event_type, e.code_prefix, e.status, e.event_date FROM events e
      ORDER BY e.event_date DESC, e.id DESC`).all();
  const letters = new Map();
  for (const r of db.prepare('SELECT event_id, status, COUNT(*) AS n FROM letters GROUP BY event_id, status').all()) {
    if (!letters.has(r.event_id)) letters.set(r.event_id, zeros(LETTER_STATUSES));
    letters.get(r.event_id)[r.status] = r.n;
  }
  const vols = new Map(db.prepare(`SELECT event_id, COUNT(*) AS n FROM event_volunteers WHERE status = 'CONFIRMADO' GROUP BY event_id`)
    .all().map((r) => [r.event_id, r.n]));
  const acts = new Map(db.prepare(`SELECT event_id, COUNT(*) AS n FROM activities WHERE event_id IS NOT NULL AND status <> 'CANCELADA'
      GROUP BY event_id`).all().map((r) => [r.event_id, r.n]));
  return {
    items: list.map((e) => {
      const byStatus = letters.get(e.id) || zeros(LETTER_STATUSES);
      const total = LETTER_STATUSES.reduce((n, s) => n + byStatus[s], 0);
      return {
        ...toEventOption(e),
        letters_total: total,
        letters_by_status: byStatus,
        with_sponsor_pct: pct(SPONSORED.reduce((n, s) => n + byStatus[s], 0), total),
        delivered_pct: pct(byStatus.ENTREGADO, total),
        volunteers_confirmed: vols.get(e.id) || 0,
        activities: acts.get(e.id) || 0
      };
    })
  };
}

module.exports = {
  reportOptions, defaultEventId, dashboard, eventsComparison, timeline, weekStart, pct, notFound: R.notFound
};
