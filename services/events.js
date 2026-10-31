/**
 * Eventos (macro-eventos: Navidad, Día del Niño…) y voluntarios asignados a cada evento — Fase 4, ADR-0011.
 *
 * - Duplicado: mismo nombre (sin acentos ni mayúsculas) o mismo prefijo → 409 DUPLICATE_EVENT con existing_id.
 * - Estatus BORRADOR → ABIERTO → EN_CURSO → CERRADO. Avanzar: quien tenga EVENTOS; regresar: solo ADMIN.
 * - Un evento CERRADO es de solo lectura (400 EVENT_CLOSED) hasta que un ADMIN lo reabra.
 * - Con cartas registradas, el prefijo y el tipo ya no cambian (400 EVENT_FIELD_LOCKED).
 */
const { getDb, nowIso, toIso } = require('../lib/db');
const {
  EVENT_STATUSES, EVENT_STATUS_LABELS, PARTICIPATION_STATUSES, SHIRT_SIZES, LETTER_STATUSES
} = require('../lib/catalogs');
const { AppError, validationError } = require('../lib/errors');
const { paginate } = require('../lib/pagination');
const { normalizeKey } = require('../lib/text');
const R = require('./records');
const { recordAudit } = require('./audit');
const users = require('./users');

const TABLE = 'events';
const NOT_FOUND = 'No existe un evento con ese identificador.';
const PARTICIPATION_NOT_FOUND = 'Ese voluntario no está asignado a este evento.';
const MAX_BULK = 100;
const OPTIONS_LIMIT = 20;

const isAdmin = (actor) => Boolean(actor && actor.role === 'ADMIN');

const SELECT = `e.*,
  (SELECT COUNT(*) FROM letters l WHERE l.event_id = e.id) AS letters_count,
  (SELECT COUNT(*) FROM event_volunteers ev WHERE ev.event_id = e.id AND ev.status IN ('POSTULADO', 'CONFIRMADO')) AS volunteers_count`;

function getEvent(id, db = getDb()) {
  return db.prepare(`SELECT ${SELECT} FROM events e WHERE e.id = ?`).get(id) || null;
}

function getEventOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getEvent(id, db) : null;
  if (!row) throw R.notFound(NOT_FOUND);
  return row;
}

const toEventRef = (row) => (row ? { id: row.id, name: row.name, code_prefix: row.code_prefix, status: row.status,
  event_date: row.event_date, event_type: row.event_type } : null);

function toEventListItem(row) {
  return {
    id: row.id,
    name: row.name,
    event_type: row.event_type,
    code_prefix: row.code_prefix,
    event_date: row.event_date,
    location: row.location ?? null,
    status: row.status,
    max_letters_per_sponsor: row.max_letters_per_sponsor,
    letters_count: Number(row.letters_count || 0),
    volunteers_count: Number(row.volunteers_count || 0),
    created_at: toIso(row.created_at)
  };
}

function eventStats(eventId, db = getDb()) {
  const letters = { total: 0, ...Object.fromEntries(LETTER_STATUSES.map((s) => [s, 0])) };
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM letters WHERE event_id = ? GROUP BY status').all(eventId)) {
    letters[r.status] = r.n;
    letters.total += r.n;
  }
  const volunteers = Object.fromEntries(PARTICIPATION_STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM event_volunteers WHERE event_id = ? GROUP BY status').all(eventId)) {
    volunteers[r.status] = r.n;
  }
  const shirtSizes = Object.fromEntries(SHIRT_SIZES.map((s) => [s, 0]));
  for (const r of db.prepare(`SELECT v.shirt_size AS k, COUNT(*) AS n FROM event_volunteers ev
      JOIN volunteers v ON v.id = ev.volunteer_id WHERE ev.event_id = ? AND ev.status = 'CONFIRMADO' GROUP BY v.shirt_size`).all(eventId)) {
    shirtSizes[r.k] = r.n;
  }
  const sponsors = db.prepare(`SELECT COUNT(DISTINCT sponsor_volunteer_id) AS n FROM letters
      WHERE event_id = ? AND sponsor_volunteer_id IS NOT NULL`).get(eventId).n;
  return { letters, volunteers, sponsors, shirt_sizes: shirtSizes };
}

function toEventOut(row, db = getDb()) {
  return {
    ...toEventListItem(row),
    description: row.description ?? null,
    created_by: row.created_by_id ? users.toUserRef(users.getUser(row.created_by_id, db)) : null,
    updated_at: toIso(row.updated_at),
    stats: eventStats(row.id, db)
  };
}

const FIELDS = ['name', 'event_type', 'code_prefix', 'event_date', 'location', 'description', 'max_letters_per_sponsor'];

function toColumns(data, existing = {}) {
  const row = {};
  for (const k of FIELDS) if (data[k] !== undefined) row[k] = data[k];
  if (row.code_prefix) row.code_prefix = row.code_prefix.toUpperCase();
  row.name_key = normalizeKey(data.name ?? existing.name);
  return row;
}

function checkDuplicate({ nameKey, prefix }, excludeId, db) {
  const byName = db.prepare('SELECT id FROM events WHERE name_key = ? AND id <> ?').get(nameKey, excludeId ?? -1);
  if (byName) throw R.duplicateError('DUPLICATE_EVENT', 'Ya existe un evento con ese nombre.', byName.id);
  const byPrefix = db.prepare('SELECT id FROM events WHERE code_prefix = ? AND id <> ?').get(prefix, excludeId ?? -1);
  if (byPrefix) throw R.duplicateError('DUPLICATE_EVENT', 'Ya existe un evento con ese prefijo de código.', byPrefix.id);
}

/** Lanza 400 EVENT_CLOSED si el evento ya cerró (solo lectura). */
function assertNotClosed(event, message = 'El evento está cerrado: ya no se pueden hacer cambios.') {
  if (event.status === 'CERRADO') throw new AppError(400, 'EVENT_CLOSED', message);
}

function createEvent(actor, data, ip, db = getDb()) {
  const row = { ...toColumns(data), status: 'BORRADOR' };
  const id = db.transaction(() => {
    checkDuplicate({ nameKey: row.name_key, prefix: row.code_prefix }, null, db);
    return R.insertRecord({ table: TABLE, entity: TABLE, row, actor, ip }, db);
  })();
  return getEvent(id, db);
}

function updateEvent(actor, id, data, ip, db = getDb()) {
  const existing = getEventOr404(id, db);
  const row = toColumns(data, existing);
  db.transaction(() => {
    assertNotClosed(existing);
    const hasLetters = Number(existing.letters_count) > 0;
    for (const [field, label] of [['code_prefix', 'el prefijo'], ['event_type', 'el tipo']]) {
      if (hasLetters && row[field] !== undefined && row[field] !== existing[field]) {
        throw new AppError(400, 'EVENT_FIELD_LOCKED', `El evento ya tiene cartas registradas: no se puede cambiar ${label}.`);
      }
    }
    checkDuplicate({ nameKey: row.name_key, prefix: row.code_prefix ?? existing.code_prefix }, existing.id, db);
    R.updateRecord({ table: TABLE, entity: TABLE, existing, patch: row, actor, ip }, db);
  })();
  return getEvent(existing.id, db);
}

/** Cambia el estatus del evento (regla de §3.1.4 de los contratos). */
function changeEventStatus(actor, id, toStatus, ip, db = getDb()) {
  db.transaction(() => {
    const event = getEventOr404(id, db);
    const from = EVENT_STATUSES.indexOf(event.status);
    const to = EVENT_STATUSES.indexOf(toStatus);
    if (from === to) {
      throw new AppError(400, 'INVALID_STATUS_TRANSITION', `El evento ya está en estatus "${EVENT_STATUS_LABELS[toStatus]}".`);
    }
    if (to < from && !isAdmin(actor)) {
      throw new AppError(403, 'FORBIDDEN', 'Solo un administrador puede regresar un evento a un estatus anterior.');
    }
    if (toStatus === 'BORRADOR' && Number(event.letters_count) > 0) {
      throw new AppError(400, 'INVALID_STATUS_TRANSITION', 'El evento ya tiene cartas: no puede volver a borrador.');
    }
    db.prepare('UPDATE events SET status = ?, updated_at = ? WHERE id = ?').run(toStatus, nowIso(), event.id);
    recordAudit({ action: 'EVENT_STATUS_CHANGED', entity: TABLE, entityId: event.id, userId: R.actorId(actor),
      detail: { from: event.status, to: toStatus }, ip }, db);
  }).immediate();
  return getEvent(id, db);
}

const ORDER = {
  '-event_date': 'e.event_date DESC, e.id DESC',
  event_date: 'e.event_date ASC, e.id ASC',
  name: 'e.name_key ASC, e.id ASC',
  '-created_at': 'e.created_at DESC, e.id DESC'
};

function listEvents(pageParams, { search, status, eventType, orderBy } = {}, db = getDb()) {
  const where = [];
  const params = {};
  const s = R.searchClause(search, ['e.name_key', 'lower(e.code_prefix)', 'lower(e.location)']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  if (status) { where.push('e.status = @status'); params.status = status; }
  if (eventType) { where.push('e.event_type = @type'); params.type = eventType; }
  return paginate(db, {
    select: SELECT, from: 'events e', where: where.join(' AND '), params,
    orderBy: ORDER[orderBy] || ORDER['-event_date'], map: toEventListItem
  }, pageParams);
}

// ---------------------------------------------------------------------------------------------
// Voluntarios del evento (event_volunteers)
// ---------------------------------------------------------------------------------------------

const EV_SELECT = `ev.*, v.first_name, v.last_name, v.phone, v.email, v.shirt_size, v.area_of_interest, v.is_active AS v_active`;
const EV_FROM = 'event_volunteers ev JOIN volunteers v ON v.id = ev.volunteer_id';

const volunteerRef = (row) => ({
  id: row.volunteer_id ?? row.id,
  full_name: `${row.first_name} ${row.last_name}`,
  phone: row.phone,
  email: row.email ?? null,
  shirt_size: row.shirt_size,
  area_of_interest: row.area_of_interest,
  is_active: Boolean(row.v_active ?? row.is_active)
});

function toEventVolunteerOut(row) {
  return {
    id: row.id,
    event_id: row.event_id,
    volunteer: volunteerRef(row),
    area: row.area,
    status: row.status,
    notes: row.notes ?? null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function getParticipation(eventId, volunteerId, db = getDb()) {
  return db.prepare(`SELECT ${EV_SELECT} FROM ${EV_FROM} WHERE ev.event_id = ? AND ev.volunteer_id = ?`).get(eventId, volunteerId) || null;
}

function listEventVolunteers(eventId, pageParams, { search, status, area } = {}, db = getDb()) {
  getEventOr404(eventId, db);
  const where = ['ev.event_id = @event'];
  const params = { event: eventId };
  const s = R.searchClause(search, ['v.name_key', 'v.phone', 'lower(v.email)']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  if (status) { where.push('ev.status = @status'); params.status = status; }
  if (area) { where.push('ev.area = @area'); params.area = area; }
  return paginate(db, {
    select: EV_SELECT, from: EV_FROM, where: where.join(' AND '), params,
    orderBy: 'v.sort_key ASC, ev.id ASC', map: toEventVolunteerOut
  }, pageParams);
}

/** Voluntarios activos que todavía no están en el evento (para el buscador de "Agregar"). */
function volunteerOptions(eventId, search, db = getDb()) {
  getEventOr404(eventId, db);
  const where = ['v.is_active = 1', 'NOT EXISTS (SELECT 1 FROM event_volunteers ev WHERE ev.event_id = @event AND ev.volunteer_id = v.id)'];
  const params = { event: eventId };
  const s = R.searchClause(search, ['v.name_key', 'v.phone', 'lower(v.email)']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  const rows = db.prepare(`SELECT v.* FROM volunteers v WHERE ${where.join(' AND ')} ORDER BY v.sort_key LIMIT ${OPTIONS_LIMIT}`).all(params);
  return { items: rows.map(volunteerRef) };
}

function addEventVolunteers(actor, eventId, { volunteerIds, area, status, notes }, ip, db = getDb()) {
  const ids = [...new Set(volunteerIds)];
  if (!ids.length || ids.length > MAX_BULK) {
    throw validationError([{ field: 'volunteer_ids', message: `Elige de 1 a ${MAX_BULK} voluntarios.` }]);
  }
  return db.transaction(() => {
    const event = getEventOr404(eventId, db);
    assertNotClosed(event);
    const added = [];
    const skipped = [];
    const now = nowIso();
    const insert = db.prepare(`INSERT INTO event_volunteers (event_id, volunteer_id, area, status, notes, created_by_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const vid of ids) {
      const v = db.prepare('SELECT id, is_active, area_of_interest FROM volunteers WHERE id = ?').get(vid);
      if (!v) throw validationError([{ field: 'volunteer_ids', message: `El voluntario ${vid} no existe.` }]);
      if (!v.is_active) throw validationError([{ field: 'volunteer_ids', message: `El voluntario ${vid} está dado de baja.` }]);
      if (getParticipation(event.id, vid, db)) { skipped.push(vid); continue; }
      insert.run(event.id, vid, area || v.area_of_interest, status || 'CONFIRMADO', notes ?? null, R.actorId(actor), now, now);
      added.push(vid);
    }
    if (added.length) {
      recordAudit({ action: 'EVENT_VOLUNTEERS_ADDED', entity: TABLE, entityId: event.id, userId: R.actorId(actor),
        detail: { volunteer_ids: added, count: added.length }, ip }, db);
    }
    return { added: added.length, skipped };
  }).immediate();
}

function updateEventVolunteer(actor, eventId, volunteerId, data, ip, db = getDb()) {
  db.transaction(() => {
    const event = getEventOr404(eventId, db);
    const existing = getParticipation(event.id, volunteerId, db);
    if (!existing) throw R.notFound(PARTICIPATION_NOT_FOUND);
    assertNotClosed(event);
    const changed = ['area', 'status', 'notes'].filter((k) => data[k] !== undefined && (data[k] ?? null) !== (existing[k] ?? null));
    if (!changed.length) return;
    const params = { id: existing.id, now: nowIso() };
    for (const k of changed) params[k] = data[k] ?? null;
    db.prepare(`UPDATE event_volunteers SET ${changed.map((k) => `${k} = @${k}`).join(', ')}, updated_at = @now WHERE id = @id`).run(params);
    recordAudit({ action: 'EVENT_VOLUNTEER_UPDATED', entity: TABLE, entityId: event.id, userId: R.actorId(actor),
      detail: { volunteer_id: volunteerId, changed, status: data.status ?? existing.status }, ip }, db);
  })();
  return getParticipation(eventId, volunteerId, db);
}

/** Participaciones de un voluntario (para su ficha), del evento más reciente al más antiguo. */
function participationsOf(volunteerId, db = getDb()) {
  return db.prepare(`SELECT ev.area, ev.status, e.id, e.name, e.code_prefix, e.status AS event_status, e.event_date, e.event_type
      FROM event_volunteers ev JOIN events e ON e.id = ev.event_id WHERE ev.volunteer_id = ? ORDER BY e.event_date DESC, e.id DESC`)
    .all(volunteerId)
    .map((r) => ({
      event: { id: r.id, name: r.name, code_prefix: r.code_prefix, status: r.event_status, event_date: r.event_date, event_type: r.event_type },
      area: r.area, status: r.status
    }));
}

module.exports = {
  NOT_FOUND, PARTICIPATION_NOT_FOUND, isAdmin, getEvent, getEventOr404, toEventRef, toEventListItem, toEventOut, eventStats,
  assertNotClosed, createEvent, updateEvent, changeEventStatus, listEvents,
  toEventVolunteerOut, getParticipation, listEventVolunteers, volunteerOptions, addEventVolunteers, updateEventVolunteer,
  participationsOf
};
