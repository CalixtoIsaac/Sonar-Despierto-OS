/**
 * Calendario de actividades (juntas, capacitaciones, acopios, eventos…) — Fase 5, ADR-0012.
 *
 * - Fecha y horas en HORA LOCAL de Veracruz: activity_date 'YYYY-MM-DD', start_time / end_time 'HH:MM'
 *   (mismo día, fin > inicio). No se convierten a UTC: son horas "de pared" de un calendario.
 * - Responsable = una cuenta del personal (users) APROBADA y activa.
 * - TRASLAPE: si el responsable ya tiene otra actividad no cancelada que se cruza con el horario, alta,
 *   edición, reprogramación y reapertura responden 409 ACTIVITY_OVERLAP con { conflicts } — es un AVISO:
 *   reenviar con allow_overlap: true la guarda y deja ACTIVITY_OVERLAP_ACCEPTED en la bitácora.
 *   La revisión y el guardado corren en una transacción IMMEDIATE (dos altas simultáneas no se cuelan).
 * - Bloqueo optimista con version (opcional en PATCH y en /status): 409 ACTIVITY_VERSION_CONFLICT.
 * - Estatus PROGRAMADA → REALIZADA | CANCELADA (con motivo); REALIZADA | CANCELADA → PROGRAMADA (reabrir).
 *   Una actividad CANCELADA no se edita (400 ACTIVITY_CANCELLED). No hay borrado.
 */
const { getDb, nowIso, toIso } = require('../lib/db');
const {
  ACTIVITY_STATUSES, ACTIVITY_STATUS_LABELS, ACTIVITY_LIST_LIMIT, ACTIVITY_MAX_VOLUNTEERS
} = require('../lib/catalogs');
const { AppError, validationError } = require('../lib/errors');
const { normalizeKey } = require('../lib/text');
const R = require('./records');
const { recordAudit } = require('./audit');
const users = require('./users');

const TABLE = 'activities';
const NOT_FOUND = 'No existe una actividad con ese identificador.';
const OPTIONS_LIMIT = 20;

const TRANSITIONS = Object.freeze({
  PROGRAMADA: ['REALIZADA', 'CANCELADA'],
  REALIZADA: ['PROGRAMADA'],
  CANCELADA: ['PROGRAMADA']
});

const SELECT = `a.*,
  u.first_name AS r_first_name, u.last_name AS r_last_name,
  e.name AS e_name, e.status AS e_status, e.event_date AS e_date, e.event_type AS e_type,
  (SELECT COUNT(*) FROM activity_volunteers av WHERE av.activity_id = a.id) AS volunteers_count,
  CASE WHEN a.status <> 'CANCELADA' AND a.responsible_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM activities o WHERE o.id <> a.id AND o.responsible_user_id = a.responsible_user_id
      AND o.activity_date = a.activity_date AND o.status <> 'CANCELADA'
      AND o.start_time < a.end_time AND o.end_time > a.start_time) THEN 1 ELSE 0 END AS has_overlap`;
const FROM = `activities a
  LEFT JOIN users u ON u.id = a.responsible_user_id
  LEFT JOIN events e ON e.id = a.event_id`;

// ---------------------------------------------------------------------------------------------
// Lectura y conversión
// ---------------------------------------------------------------------------------------------

function getActivity(id, db = getDb()) {
  return db.prepare(`SELECT ${SELECT} FROM ${FROM} WHERE a.id = ?`).get(id) || null;
}

function getActivityOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getActivity(id, db) : null;
  if (!row) throw R.notFound(NOT_FOUND);
  return row;
}

const responsibleRef = (row) => (row.responsible_user_id
  ? { id: row.responsible_user_id, full_name: `${row.r_first_name} ${row.r_last_name}` } : null);
const eventRef = (row) => (row.event_id
  ? { id: row.event_id, name: row.e_name, status: row.e_status, event_date: row.e_date, event_type: row.e_type } : null);

const toActivityRef = (row) => ({
  id: row.id, title: row.title, activity_type: row.activity_type, activity_date: row.activity_date,
  start_time: row.start_time, end_time: row.end_time, status: row.status
});

function toActivityListItem(row) {
  return {
    id: row.id,
    title: row.title,
    activity_type: row.activity_type,
    activity_date: row.activity_date,
    start_time: row.start_time,
    end_time: row.end_time,
    location: row.location ?? null,
    status: row.status,
    responsible: responsibleRef(row),
    event: eventRef(row),
    volunteers_count: Number(row.volunteers_count || 0),
    has_overlap: Boolean(row.has_overlap),
    version: row.version
  };
}

function activityVolunteers(activityId, db = getDb()) {
  return db.prepare(`SELECT v.id, v.first_name, v.last_name, v.phone, v.area_of_interest, v.is_active
      FROM activity_volunteers av JOIN volunteers v ON v.id = av.volunteer_id
      WHERE av.activity_id = ? ORDER BY v.sort_key, v.id`).all(activityId)
    .map((v) => ({ id: v.id, full_name: `${v.first_name} ${v.last_name}`, phone: v.phone,
      area_of_interest: v.area_of_interest, is_active: Boolean(v.is_active) }));
}

function toActivityOut(row, db = getDb()) {
  return {
    ...toActivityListItem(row),
    description: row.description ?? null,
    cancel_reason: row.cancel_reason ?? null,
    volunteers: activityVolunteers(row.id, db),
    overlaps: row.status === 'CANCELADA' ? [] : findOverlaps({
      responsibleId: row.responsible_user_id, date: row.activity_date, start: row.start_time, end: row.end_time, excludeId: row.id
    }, db).map(toActivityRef),
    created_by: row.created_by_id ? users.toUserRef(users.getUser(row.created_by_id, db)) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

// ---------------------------------------------------------------------------------------------
// Traslapes
// ---------------------------------------------------------------------------------------------

/** Actividades NO canceladas del mismo responsable que se cruzan con [start, end) ese día. */
function findOverlaps({ responsibleId, date, start, end, excludeId = null }, db = getDb()) {
  if (!responsibleId) return [];
  return db.prepare(`SELECT ${SELECT} FROM ${FROM}
      WHERE a.responsible_user_id = @resp AND a.activity_date = @date AND a.status <> 'CANCELADA'
        AND a.start_time < @end AND a.end_time > @start AND a.id <> @exclude
      ORDER BY a.start_time, a.id`)
    .all({ resp: responsibleId, date, start, end, exclude: excludeId ?? -1 });
}

/** Lanza 409 ACTIVITY_OVERLAP si hay traslape y no se aceptó; devuelve los ids con los que se traslapa. */
function checkOverlap(slot, allowOverlap, db) {
  const rows = findOverlaps(slot, db);
  if (!rows.length) return [];
  if (allowOverlap) return rows.map((r) => r.id);
  const who = users.getUser(slot.responsibleId, db);
  const name = who ? `${who.first_name} ${who.last_name}` : 'El responsable';
  const what = rows.length === 1 ? 'otra actividad' : `${rows.length} actividades`;
  throw new AppError(409, 'ACTIVITY_OVERLAP',
    `${name} ya tiene ${what} en ese horario. Revisa el horario o guarda de todos modos.`,
    { extra: { conflicts: rows.map(toActivityRef) } });
}

// ---------------------------------------------------------------------------------------------
// Validaciones de referencias
// ---------------------------------------------------------------------------------------------

function assertResponsible(userId, db) {
  const u = users.getUser(userId, db);
  if (!u) throw validationError([{ field: 'responsible_user_id', message: 'El responsable no existe.' }]);
  if (u.account_status !== 'APROBADA' || !u.is_active) {
    throw validationError([{ field: 'responsible_user_id', message: 'Esa cuenta está desactivada o pendiente: elige otro responsable.' }]);
  }
}

function assertEvent(eventId, db) {
  const e = db.prepare('SELECT id, status FROM events WHERE id = ?').get(eventId);
  if (!e) throw validationError([{ field: 'event_id', message: 'El evento no existe.' }]);
  if (e.status === 'CERRADO') {
    throw new AppError(400, 'EVENT_CLOSED', 'El evento está cerrado: ya no se le pueden vincular actividades.');
  }
}

function assertTimes(start, end) {
  if (start && end && end <= start) {
    throw validationError([{ field: 'end_time', message: 'La hora de fin debe ser posterior a la de inicio.' }]);
  }
}

function assertNotCancelled(row) {
  if (row.status === 'CANCELADA') {
    throw new AppError(400, 'ACTIVITY_CANCELLED', 'La actividad está cancelada: reprográmala para poder modificarla.');
  }
}

function versionConflict(row) {
  return new AppError(409, 'ACTIVITY_VERSION_CONFLICT',
    'Otra persona modificó esta actividad mientras la veías. Actualiza para ver los cambios.',
    { extra: { current_status: row.status, current_version: row.version } });
}

function assertVersion(row, version) {
  if (version === undefined || version === null || version === row.version) return;
  throw versionConflict(row);
}

function auditOverlap(actor, id, withIds, ip, db) {
  if (!withIds.length) return;
  recordAudit({ action: 'ACTIVITY_OVERLAP_ACCEPTED', entity: TABLE, entityId: id, userId: R.actorId(actor),
    detail: { with: withIds }, ip }, db);
}

// ---------------------------------------------------------------------------------------------
// Alta, edición y estatus
// ---------------------------------------------------------------------------------------------

const FIELDS = ['title', 'description', 'activity_type', 'activity_date', 'start_time', 'end_time', 'location',
  'responsible_user_id', 'event_id'];

/**
 * data: { title, description?, activity_type, activity_date, start_time, end_time, location?,
 *         responsible_user_id, event_id?, allow_overlap? }
 */
function createActivity(actor, data, ip, db = getDb()) {
  assertTimes(data.start_time, data.end_time);
  const id = db.transaction(() => {
    assertResponsible(data.responsible_user_id, db);
    if (data.event_id) assertEvent(data.event_id, db);
    const withIds = checkOverlap({ responsibleId: data.responsible_user_id, date: data.activity_date,
      start: data.start_time, end: data.end_time }, data.allow_overlap, db);
    const row = { status: 'PROGRAMADA', title_key: normalizeKey(data.title) };
    for (const k of FIELDS) row[k] = data[k] ?? null;
    const newId = R.insertRecord({ table: TABLE, entity: TABLE, row, actor, ip }, db);
    auditOverlap(actor, newId, withIds, ip, db);
    return newId;
  }).immediate();
  return getActivity(id, db);
}

/** PATCH: solo los campos presentes. data.version (opcional) y data.allow_overlap. */
function updateActivity(actor, id, data, ip, db = getDb()) {
  db.transaction(() => {
    const existing = getActivityOr404(id, db);
    assertVersion(existing, data.version);
    assertNotCancelled(existing);
    const patch = {};
    for (const k of FIELDS) if (data[k] !== undefined) patch[k] = data[k];
    const changed = Object.keys(patch).filter((k) => (patch[k] ?? null) !== (existing[k] ?? null));
    if (!changed.length) return;

    const next = { ...existing, ...patch };
    assertTimes(next.start_time, next.end_time);
    if (changed.includes('responsible_user_id')) {
      if (!next.responsible_user_id) throw validationError([{ field: 'responsible_user_id', message: 'Elige a la persona responsable.' }]);
      assertResponsible(next.responsible_user_id, db);
    }
    if (changed.includes('event_id') && next.event_id) assertEvent(next.event_id, db);

    let withIds = [];
    const slotChanged = ['activity_date', 'start_time', 'end_time', 'responsible_user_id'].some((k) => changed.includes(k));
    if (slotChanged) {
      withIds = checkOverlap({ responsibleId: next.responsible_user_id, date: next.activity_date,
        start: next.start_time, end: next.end_time, excludeId: existing.id }, data.allow_overlap, db);
    }

    const params = { id: existing.id, version: existing.version, now: nowIso() };
    for (const k of changed) params[k] = next[k] ?? null;
    if (changed.includes('title')) { params.title_key = normalizeKey(next.title); }
    const cols = [...changed, ...(changed.includes('title') ? ['title_key'] : [])];
    const info = db.prepare(`UPDATE activities SET ${cols.map((c) => `${c} = @${c}`).join(', ')},
        version = version + 1, updated_at = @now WHERE id = @id AND version = @version`).run(params);
    if (info.changes !== 1) throw versionConflict(getActivity(existing.id, db)); // defensa: no ocurre dentro de IMMEDIATE
    recordAudit({ action: 'RECORD_UPDATED', entity: TABLE, entityId: existing.id, userId: R.actorId(actor),
      detail: { changed }, ip }, db);
    auditOverlap(actor, existing.id, withIds, ip, db);
  }).immediate();
  return getActivity(id, db);
}

/** { to_status, reason?, version?, allow_overlap? } */
function changeActivityStatus(actor, id, { toStatus, reason, version, allowOverlap }, ip, db = getDb()) {
  db.transaction(() => {
    const a = getActivityOr404(id, db);
    assertVersion(a, version);
    if (!(TRANSITIONS[a.status] || []).includes(toStatus)) {
      throw new AppError(400, 'INVALID_STATUS_TRANSITION',
        `No se puede pasar de "${ACTIVITY_STATUS_LABELS[a.status]}" a "${ACTIVITY_STATUS_LABELS[toStatus]}".`);
    }
    if (toStatus === 'CANCELADA' && !reason) {
      throw validationError([{ field: 'reason', message: 'Escribe el motivo de la cancelación.' }]);
    }
    let withIds = [];
    if (toStatus === 'PROGRAMADA' && a.status === 'CANCELADA') {
      withIds = checkOverlap({ responsibleId: a.responsible_user_id, date: a.activity_date, start: a.start_time,
        end: a.end_time, excludeId: a.id }, allowOverlap, db);
    }
    db.prepare(`UPDATE activities SET status = ?, cancel_reason = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?`)
      .run(toStatus, toStatus === 'CANCELADA' ? reason : null, nowIso(), a.id, a.version);
    recordAudit({ action: 'ACTIVITY_STATUS_CHANGED', entity: TABLE, entityId: a.id, userId: R.actorId(actor),
      detail: { from: a.status, to: toStatus }, ip }, db);
    auditOverlap(actor, a.id, withIds, ip, db);
  }).immediate();
  return getActivity(id, db);
}

// ---------------------------------------------------------------------------------------------
// Consultas del calendario
// ---------------------------------------------------------------------------------------------

/**
 * Actividades de un rango de fechas (vistas mensual, semanal y agenda), sin paginar.
 *   { dateFrom, dateTo, types: [], responsibleId, eventId, volunteerId, statuses: [], search }
 * → { items, truncated }   (máximo ACTIVITY_LIST_LIMIT; orden fecha, hora de inicio, id)
 */
function listActivities({ dateFrom, dateTo, types = [], responsibleId, eventId, volunteerId, statuses = [], search } = {}, db = getDb()) {
  const where = [];
  const params = {};
  if (dateFrom) { where.push('a.activity_date >= @from'); params.from = dateFrom; }
  if (dateTo) { where.push('a.activity_date <= @to'); params.to = dateTo; }
  if (types.length) {
    where.push(`a.activity_type IN (${types.map((_, i) => `@t${i}`).join(', ')})`);
    types.forEach((t, i) => { params[`t${i}`] = t; });
  }
  if (statuses.length) {
    where.push(`a.status IN (${statuses.map((_, i) => `@st${i}`).join(', ')})`);
    statuses.forEach((s, i) => { params[`st${i}`] = s; });
  }
  if (responsibleId) { where.push('a.responsible_user_id = @resp'); params.resp = responsibleId; }
  if (eventId) { where.push('a.event_id = @event'); params.event = eventId; }
  if (volunteerId) {
    where.push('EXISTS (SELECT 1 FROM activity_volunteers av WHERE av.activity_id = a.id AND av.volunteer_id = @vol)');
    params.vol = volunteerId;
  }
  const s = R.searchClause(search, ['a.title_key', 'lower(a.location)']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  const rows = db.prepare(`SELECT ${SELECT} FROM ${FROM}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.activity_date, a.start_time, a.id LIMIT ${ACTIVITY_LIST_LIMIT + 1}`).all(params);
  const truncated = rows.length > ACTIVITY_LIST_LIMIT;
  return { items: rows.slice(0, ACTIVITY_LIST_LIMIT).map(toActivityListItem), truncated };
}

/** Vista previa del aviso de traslape mientras se llena el formulario. */
function overlapPreview({ responsibleId, date, start, end, excludeId }, db = getDb()) {
  return { items: findOverlaps({ responsibleId, date, start, end, excludeId }, db).map(toActivityRef) };
}

/** Personal que puede ser responsable: cuentas APROBADA y activas, por apellidos. */
function responsibleOptions(db = getDb()) {
  const rows = db.prepare(`SELECT id, first_name, last_name FROM users
      WHERE account_status = 'APROBADA' AND is_active = 1 ORDER BY last_name, first_name, id`).all();
  return { items: rows.map((u) => ({ id: u.id, full_name: `${u.first_name} ${u.last_name}` })) };
}

/** Eventos para vincular (los cerrados aparecen marcados para poder mostrar vínculos existentes). */
function eventOptions(db = getDb()) {
  const rows = db.prepare(`SELECT id, name, event_date, status, event_type FROM events
      ORDER BY CASE WHEN status = 'CERRADO' THEN 1 ELSE 0 END, event_date DESC, id DESC LIMIT 100`).all();
  return { items: rows.map((e) => ({ id: e.id, name: e.name, event_date: e.event_date, status: e.status, event_type: e.event_type })) };
}

// ---------------------------------------------------------------------------------------------
// Voluntarios de la actividad
// ---------------------------------------------------------------------------------------------

function volunteerOptions(activityId, search, db = getDb()) {
  getActivityOr404(activityId, db);
  const where = ['v.is_active = 1', 'NOT EXISTS (SELECT 1 FROM activity_volunteers av WHERE av.activity_id = @act AND av.volunteer_id = v.id)'];
  const params = { act: activityId };
  const s = R.searchClause(search, ['v.name_key', 'v.phone', 'lower(v.email)']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  const rows = db.prepare(`SELECT v.* FROM volunteers v WHERE ${where.join(' AND ')} ORDER BY v.sort_key LIMIT ${OPTIONS_LIMIT}`).all(params);
  return { items: rows.map((v) => ({ id: v.id, full_name: `${v.first_name} ${v.last_name}`, phone: v.phone,
    area_of_interest: v.area_of_interest, is_active: Boolean(v.is_active) })) };
}

function addActivityVolunteers(actor, activityId, volunteerIds, ip, db = getDb()) {
  const ids = [...new Set(volunteerIds)];
  return db.transaction(() => {
    const a = getActivityOr404(activityId, db);
    assertNotCancelled(a);
    const current = Number(a.volunteers_count);
    const added = [];
    const skipped = [];
    const exists = db.prepare('SELECT 1 FROM activity_volunteers WHERE activity_id = ? AND volunteer_id = ?');
    const insert = db.prepare('INSERT INTO activity_volunteers (activity_id, volunteer_id, created_by_id, created_at) VALUES (?, ?, ?, ?)');
    const now = nowIso();
    for (const vid of ids) {
      const v = db.prepare('SELECT id, is_active FROM volunteers WHERE id = ?').get(vid);
      if (!v) throw validationError([{ field: 'volunteer_ids', message: `El voluntario ${vid} no existe.` }]);
      if (!v.is_active) throw validationError([{ field: 'volunteer_ids', message: `El voluntario ${vid} está dado de baja.` }]);
      if (exists.get(a.id, vid)) { skipped.push(vid); continue; }
      added.push(vid);
    }
    if (current + added.length > ACTIVITY_MAX_VOLUNTEERS) {
      throw validationError([{ field: 'volunteer_ids', message: `Una actividad admite hasta ${ACTIVITY_MAX_VOLUNTEERS} voluntarios.` }]);
    }
    for (const vid of added) insert.run(a.id, vid, R.actorId(actor), now);
    if (added.length) {
      db.prepare('UPDATE activities SET updated_at = ? WHERE id = ?').run(now, a.id);
      recordAudit({ action: 'ACTIVITY_VOLUNTEERS_ADDED', entity: TABLE, entityId: a.id, userId: R.actorId(actor),
        detail: { volunteer_ids: added, count: added.length }, ip }, db);
    }
    return { added: added.length, skipped };
  }).immediate();
}

function removeActivityVolunteer(actor, activityId, volunteerId, ip, db = getDb()) {
  db.transaction(() => {
    const a = getActivityOr404(activityId, db);
    assertNotCancelled(a);
    const info = db.prepare('DELETE FROM activity_volunteers WHERE activity_id = ? AND volunteer_id = ?').run(a.id, volunteerId);
    if (!info.changes) throw R.notFound('Ese voluntario no está en esta actividad.');
    db.prepare('UPDATE activities SET updated_at = ? WHERE id = ?').run(nowIso(), a.id);
    recordAudit({ action: 'ACTIVITY_VOLUNTEER_REMOVED', entity: TABLE, entityId: a.id, userId: R.actorId(actor),
      detail: { volunteer_id: volunteerId }, ip }, db);
  })();
}

module.exports = {
  NOT_FOUND, TRANSITIONS, ACTIVITY_STATUSES,
  getActivity, getActivityOr404, toActivityRef, toActivityListItem, toActivityOut, findOverlaps,
  createActivity, updateActivity, changeActivityStatus, listActivities, overlapPreview, responsibleOptions,
  eventOptions, volunteerOptions, addActivityVolunteers, removeActivityVolunteer
};
