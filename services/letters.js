/**
 * Cartas de Navidad (módulo CARTAS) — Fase 4, ADR-0011.
 *
 * Máquina de estados (contratos §3.4):
 *   PENDIENTE --assign--> ASIGNADO --receive--> RECIBIDO --deliver--> ENTREGADO
 *   ASIGNADO --release--> PENDIENTE            RECIBIDO --revert (solo ADMIN, con comentario)--> ASIGNADO
 *
 * Concurrencia: bloqueo optimista con letters.version dentro de transacciones IMMEDIATE. La segunda de dos
 * operaciones simultáneas sobre la misma carta recibe 409 (LETTER_ALREADY_ASSIGNED / LETTER_STATUS_CHANGED /
 * LETTER_VERSION_CONFLICT) con { current_status, current_version }.
 *
 * Toda transición inserta una fila en letter_status_history (solo inserción) y LETTER_STATUS_CHANGED en la
 * bitácora, en la misma transacción. La bitácora nunca guarda deseos, nombres ni el texto de la carta.
 *
 * Datos del menor (§3.7): completos con BENEFICIARIOS (o ADMIN); si no, restringidos ("Sofía C.", edad, grado…).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../lib/config');
const { getDb, nowIso, toIso } = require('../lib/db');
const {
  LETTER_STATUSES, LETTER_STATUS_LABELS, LETTER_EVENT_TYPES, GENDER_LABELS, EVENT_TYPE_LABELS
} = require('../lib/catalogs');
const { toCsv } = require('../lib/csv');
const { AppError, validationError } = require('../lib/errors');
const { EXTENSION, MIME, detectImageType, stripMetadata } = require('../lib/images');
const { paginate } = require('../lib/pagination');
const { ageOn, todayLocal } = require('../lib/text');
const R = require('./records');
const { recordAudit } = require('./audit');
const events = require('./events');
const users = require('./users');

const TABLE = 'letters';
const NOT_FOUND = 'No existe una carta con ese identificador.';
const CODE_NOT_FOUND = 'No encontramos una carta con ese código.';
const EXPORT_LIMIT = 10000;
const OPTIONS_LIMIT = 20;
const OPEN_EVENT_STATUSES = ['ABIERTO', 'EN_CURSO'];
const SPONSORED_STATUSES = ['ASIGNADO', 'RECIBIDO', 'ENTREGADO']; // cuentan para el límite por padrino

const SELECT = `l.*,
  e.name AS event_name, e.code_prefix AS event_prefix, e.status AS event_status, e.event_date AS event_date,
  e.event_type AS event_type, e.max_letters_per_sponsor AS event_max,
  c.first_name AS child_first_name, c.last_name AS child_last_name, c.birth_date AS child_birth_date, c.gender AS child_gender,
  c.grade AS child_grade, c.group_name AS child_group, c.guardian_consent AS child_consent, c.is_active AS child_active,
  c.school_id AS child_school_id, s.name AS school_name, s.zone AS school_zone,
  v.first_name AS sponsor_first_name, v.last_name AS sponsor_last_name, v.phone AS sponsor_phone, v.email AS sponsor_email`;
const FROM = `letters l JOIN events e ON e.id = l.event_id JOIN children c ON c.id = l.child_id
  LEFT JOIN schools s ON s.id = c.school_id LEFT JOIN volunteers v ON v.id = l.sponsor_volunteer_id`;

/** Qué puede ver y hacer la persona: datos completos del menor (BENEFICIARIOS) y si es ADMIN. */
function viewerOf(user, db = getDb()) {
  return { full: users.hasModule(user, 'BENEFICIARIOS', db), admin: events.isAdmin(user) };
}

function getLetter(id, db = getDb()) {
  return db.prepare(`SELECT ${SELECT} FROM ${FROM} WHERE l.id = ?`).get(id) || null;
}

function getLetterOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getLetter(id, db) : null;
  if (!row) throw R.notFound(NOT_FOUND);
  return row;
}

const initial = (text) => {
  const first = [...String(text || '').trim()][0];
  return first ? `${first.toUpperCase()}.` : '';
};

/** Niña o niño visto desde Cartas (completo o restringido). Acepta filas de letters (child_*) o de children. */
function childForLetter(src, full) {
  const c = {
    id: src.child_id ?? src.id,
    first_name: src.child_first_name ?? src.first_name,
    last_name: src.child_last_name ?? src.last_name,
    birth_date: src.child_birth_date ?? src.birth_date,
    gender: src.child_gender ?? src.gender,
    grade: src.child_grade ?? src.grade,
    group_name: src.child_group ?? src.group_name,
    school_id: src.child_school_id ?? src.school_id,
    consent: src.child_consent ?? src.guardian_consent,
    active: src.child_active ?? src.is_active
  };
  const base = {
    id: c.id,
    first_name: c.first_name,
    display_name: full ? `${c.first_name} ${c.last_name}` : `${c.first_name} ${initial(c.last_name)}`.trim(),
    age: ageOn(c.birth_date),
    gender: c.gender,
    grade: c.grade ?? null,
    group_name: c.group_name ?? null,
    school: c.school_id ? { id: c.school_id, name: src.school_name } : null,
    restricted: !full
  };
  if (!full) return base;
  return {
    ...base,
    last_name: c.last_name,
    full_name: `${c.first_name} ${c.last_name}`,
    school: c.school_id ? { id: c.school_id, name: src.school_name, zone: src.school_zone ?? null } : null,
    guardian_consent: Boolean(c.consent),
    is_active: Boolean(c.active)
  };
}

const sponsorRef = (row) => (row.sponsor_volunteer_id ? {
  id: row.sponsor_volunteer_id,
  full_name: `${row.sponsor_first_name} ${row.sponsor_last_name}`,
  phone: row.sponsor_phone,
  email: row.sponsor_email ?? null
} : null);

const eventRef = (row) => ({ id: row.event_id, name: row.event_name, code_prefix: row.event_prefix, status: row.event_status,
  event_date: row.event_date });

function toLetterListItem(row, viewer) {
  return {
    id: row.id,
    code: row.code,
    event: eventRef(row),
    child: childForLetter(row, viewer.full),
    main_wish: row.main_wish,
    status: row.status,
    sponsor: sponsorRef(row),
    has_photo: Boolean(row.photo_path),
    version: row.version,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

/** Acciones disponibles ahora para la persona (la API las valida igual). */
function nextActions(row, viewer) {
  if (row.event_status === 'CERRADO') return [];
  switch (row.status) {
    case 'PENDIENTE': return ['assign'];
    case 'ASIGNADO': return ['release', 'receive'];
    case 'RECIBIDO': return viewer.admin ? ['deliver', 'revert'] : ['deliver'];
    default: return [];
  }
}

function toLetterOut(row, viewer, db = getDb()) {
  return {
    ...toLetterListItem(row, viewer),
    secondary_wish: row.secondary_wish ?? null,
    letter_text: row.letter_text ?? null,
    gift_notes: row.gift_notes ?? null,
    assigned_at: toIso(row.assigned_at),
    received_at: toIso(row.received_at),
    delivered_at: toIso(row.delivered_at),
    photo_uploaded_at: toIso(row.photo_uploaded_at),
    created_by: row.created_by_id ? users.toUserRef(users.getUser(row.created_by_id, db)) : null,
    next_actions: nextActions(row, viewer)
  };
}

// ---------------------------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(6, '0');

function assertEventAcceptsLetters(event) {
  if (!LETTER_EVENT_TYPES.includes(event.event_type)) {
    throw new AppError(400, 'EVENT_NOT_FOR_LETTERS',
      `Solo los eventos de tipo Navidad reciben cartas (este es "${EVENT_TYPE_LABELS[event.event_type]}").`);
  }
  if (!OPEN_EVENT_STATUSES.includes(event.status)) {
    throw new AppError(400, 'EVENT_NOT_OPEN', 'El evento no está abierto: ábrelo para registrar cartas.');
  }
}

function createLetter(actor, data, ip, db = getDb()) {
  const id = db.transaction(() => {
    const event = events.getEvent(data.event_id, db);
    if (!event) throw validationError([{ field: 'event_id', message: 'El evento no existe.' }]);
    const child = db.prepare('SELECT id, is_active, guardian_consent FROM children WHERE id = ?').get(data.child_id);
    if (!child) throw validationError([{ field: 'child_id', message: 'La niña o niño no existe.' }]);
    if (!child.is_active) throw validationError([{ field: 'child_id', message: 'La niña o niño está dada(o) de baja.' }]);
    assertEventAcceptsLetters(event);
    if (!child.guardian_consent) {
      throw new AppError(400, 'CONSENT_REQUIRED',
        'Falta la autorización firmada de la madre, padre o tutor legal: regístrala en su ficha antes de crear la carta.');
    }
    const dup = db.prepare('SELECT id, code FROM letters WHERE child_id = ? AND event_id = ?').get(child.id, event.id);
    if (dup) {
      throw new AppError(409, 'LETTER_ALREADY_EXISTS', `Esta niña o niño ya tiene carta en este evento (${dup.code}).`,
        { extra: { existing_id: dup.id } });
    }
    const number = event.next_letter_number;
    db.prepare('UPDATE events SET next_letter_number = ? WHERE id = ?').run(number + 1, event.id);
    const now = nowIso();
    const row = {
      code: `${event.code_prefix}-${pad(number)}`, number, event_id: event.id, child_id: child.id,
      main_wish: data.main_wish, secondary_wish: data.secondary_wish ?? null, letter_text: data.letter_text ?? null,
      gift_notes: data.gift_notes ?? null, status: 'PENDIENTE'
    };
    const letterId = R.insertRecord({ table: TABLE, entity: TABLE, row, actor, ip }, db);
    insertHistory({ letterId, from: null, to: 'PENDIENTE', actor, sponsorId: null, comment: null, now }, db);
    return letterId;
  }).immediate();
  return getLetter(id, db);
}

const WISH_FIELDS = ['main_wish', 'secondary_wish', 'letter_text'];

function versionConflict(letter) {
  return new AppError(409, 'LETTER_VERSION_CONFLICT',
    'Otra persona modificó esta carta mientras la veías. Actualiza la página e inténtalo de nuevo.',
    { extra: { current_status: letter.status, current_version: letter.version } });
}

function updateLetter(actor, id, data, ip, db = getDb()) {
  db.transaction(() => {
    const letter = getLetterOr404(id, db);
    events.assertNotClosed({ status: letter.event_status });
    if (data.version !== undefined && data.version !== null && data.version !== letter.version) throw versionConflict(letter);
    const patch = {};
    for (const k of [...WISH_FIELDS, 'gift_notes']) if (data[k] !== undefined) patch[k] = data[k];
    const wishChanged = WISH_FIELDS.some((k) => patch[k] !== undefined && (patch[k] ?? null) !== (letter[k] ?? null));
    if (wishChanged && letter.status !== 'PENDIENTE' && !events.isAdmin(actor)) {
      throw new AppError(400, 'LETTER_LOCKED',
        'La carta ya tiene padrino: solo un administrador puede cambiar los deseos o la transcripción.');
    }
    const changed = R.updateRecord({ table: TABLE, entity: TABLE, existing: letter, patch, actor, ip }, db);
    if (changed.length) db.prepare('UPDATE letters SET version = version + 1 WHERE id = ?').run(letter.id);
  }).immediate();
  return getLetter(id, db);
}

// ---------------------------------------------------------------------------------------------
// Transiciones de estatus
// ---------------------------------------------------------------------------------------------

function insertHistory({ letterId, from, to, actor, sponsorId, comment, now }, db) {
  db.prepare(`INSERT INTO letter_status_history (letter_id, from_status, to_status, changed_by_id, sponsor_volunteer_id, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(letterId, from, to, R.actorId(actor), sponsorId ?? null, comment ?? null, now);
}

const invalidTransition = (letter, toStatus) => new AppError(400, 'INVALID_STATUS_TRANSITION',
  `No se puede pasar una carta de "${LETTER_STATUS_LABELS[letter.status]}" a "${LETTER_STATUS_LABELS[toStatus]}".`);

/**
 * Aplica una transición con bloqueo optimista.
 *   from: estatus de origen permitido · to: destino · set: columnas extra · sponsorId: padrino después del cambio
 *   staleCode: código 409 cuando el estatus ya no es el esperado
 */
function transition(actor, id, { from, to, version, set = {}, sponsorId, comment, staleCode, staleMessage, before }, ip, db) {
  db.transaction(() => {
    const letter = getLetterOr404(id, db);
    events.assertNotClosed({ status: letter.event_status }, 'El evento está cerrado: ya no se pueden cambiar sus cartas.');
    if (letter.version !== version) {
      if (letter.status !== from) {
        throw new AppError(409, staleCode, staleMessage(letter),
          { extra: { current_status: letter.status, current_version: letter.version } });
      }
      throw versionConflict(letter);
    }
    if (letter.status !== from) throw invalidTransition(letter, to);
    if (before) before(letter);

    const now = nowIso();
    const cols = { ...set, status: to, sponsor_volunteer_id: sponsorId ?? null };
    const params = { ...cols, __id: letter.id, __version: version, __from: from, __now: now };
    for (const [k, v] of Object.entries(params)) if (v === '__now__') params[k] = now;
    const info = db.prepare(`UPDATE letters SET ${Object.keys(cols).map((k) => `${k} = @${k}`).join(', ')},
        version = version + 1, updated_at = @__now
      WHERE id = @__id AND version = @__version AND status = @__from`).run(params);
    if (info.changes !== 1) throw versionConflict(getLetter(letter.id, db)); // otra conexión ganó (defensa extra)

    insertHistory({ letterId: letter.id, from, to, actor, sponsorId: sponsorId ?? letter.sponsor_volunteer_id, comment, now }, db);
    recordAudit({ action: 'LETTER_STATUS_CHANGED', entity: TABLE, entityId: letter.id, userId: R.actorId(actor),
      detail: { from, to, sponsor_volunteer_id: sponsorId ?? letter.sponsor_volunteer_id ?? null }, ip }, db);
  }).immediate();
  return getLetter(id, db);
}

const alreadyAssigned = (letter) => (letter.status === 'PENDIENTE'
  ? 'La carta cambió mientras la veías. Actualiza la página e inténtalo de nuevo.'
  : `Otra persona ya le asignó padrino a esta carta (${LETTER_STATUS_LABELS[letter.status]}).`);
const statusChanged = (letter) => `Otra persona cambió el estatus de esta carta a "${LETTER_STATUS_LABELS[letter.status]}". Actualiza la página.`;

function assignSponsor(actor, id, { volunteerId, version, comment }, ip, db = getDb()) {
  return transition(actor, id, {
    from: 'PENDIENTE', to: 'ASIGNADO', version, sponsorId: volunteerId, comment,
    set: { assigned_at: '__now__' },
    staleCode: 'LETTER_ALREADY_ASSIGNED', staleMessage: alreadyAssigned,
    before: (letter) => {
      const v = db.prepare('SELECT id, is_active FROM volunteers WHERE id = ?').get(volunteerId);
      if (!v) throw validationError([{ field: 'volunteer_id', message: 'El voluntario no existe.' }]);
      if (!v.is_active) throw validationError([{ field: 'volunteer_id', message: 'El voluntario está dado de baja.' }]);
      const used = db.prepare(`SELECT COUNT(*) AS n FROM letters WHERE event_id = ? AND sponsor_volunteer_id = ?
          AND status IN (${SPONSORED_STATUSES.map((s) => `'${s}'`).join(', ')})`).get(letter.event_id, volunteerId).n;
      if (used >= letter.event_max) {
        throw new AppError(400, 'SPONSOR_LIMIT_REACHED',
          `Este padrino ya tiene ${used} de ${letter.event_max} cartas permitidas en el evento.`);
      }
    }
  }, ip, db);
}

function releaseSponsor(actor, id, { version, comment }, ip, db = getDb()) {
  return transition(actor, id, {
    from: 'ASIGNADO', to: 'PENDIENTE', version, sponsorId: null, comment,
    set: { assigned_at: null }, staleCode: 'LETTER_STATUS_CHANGED', staleMessage: statusChanged
  }, ip, db);
}

/** RECIBIDO, ENTREGADO o ASIGNADO (corrección desde RECIBIDO, solo ADMIN y con comentario). */
function changeStatus(actor, id, { toStatus, version, comment, giftNotes }, ip, db = getDb()) {
  const common = { version, comment, staleCode: 'LETTER_STATUS_CHANGED', staleMessage: statusChanged };
  const withNotes = (set) => (giftNotes !== undefined ? { ...set, gift_notes: giftNotes } : set);
  if (toStatus === 'RECIBIDO') {
    const current = getLetterOr404(id, db);
    return transition(actor, id, { ...common, from: 'ASIGNADO', to: 'RECIBIDO', sponsorId: current.sponsor_volunteer_id,
      set: withNotes({ received_at: '__now__' }) }, ip, db);
  }
  if (toStatus === 'ENTREGADO') {
    const current = getLetterOr404(id, db);
    return transition(actor, id, { ...common, from: 'RECIBIDO', to: 'ENTREGADO', sponsorId: current.sponsor_volunteer_id,
      set: withNotes({ delivered_at: '__now__' }) }, ip, db);
  }
  if (toStatus === 'ASIGNADO') {
    if (!events.isAdmin(actor)) {
      throw new AppError(403, 'FORBIDDEN', 'Solo un administrador puede regresar una carta a "Con padrino".');
    }
    if (!comment) throw validationError([{ field: 'comment', message: 'Explica el motivo de la corrección.' }]);
    const current = getLetterOr404(id, db);
    return transition(actor, id, { ...common, from: 'RECIBIDO', to: 'ASIGNADO', sponsorId: current.sponsor_volunteer_id,
      set: withNotes({ received_at: null }) }, ip, db);
  }
  const current = getLetterOr404(id, db);
  throw invalidTransition(current, toStatus);
}

function letterHistory(id, db = getDb()) {
  getLetterOr404(id, db);
  const rows = db.prepare(`SELECT h.*, u.first_name AS u_first, u.last_name AS u_last, u.email AS u_email,
      v.first_name AS v_first, v.last_name AS v_last
      FROM letter_status_history h LEFT JOIN users u ON u.id = h.changed_by_id LEFT JOIN volunteers v ON v.id = h.sponsor_volunteer_id
      WHERE h.letter_id = ? ORDER BY h.id ASC`).all(id);
  return {
    items: rows.map((r) => ({
      id: r.id,
      from_status: r.from_status,
      to_status: r.to_status,
      changed_by: r.changed_by_id && r.u_email ? { id: r.changed_by_id, full_name: `${r.u_first} ${r.u_last}`.trim(), email: r.u_email } : null,
      sponsor: r.sponsor_volunteer_id && r.v_first ? { id: r.sponsor_volunteer_id, full_name: `${r.v_first} ${r.v_last}` } : null,
      comment: r.comment ?? null,
      created_at: toIso(r.created_at)
    }))
  };
}

// ---------------------------------------------------------------------------------------------
// Listados, resumen, exportación y búsquedas auxiliares
// ---------------------------------------------------------------------------------------------

function filterClause({ eventId, status, schoolId, sponsorId, gender, hasPhoto, search } = {}) {
  const where = [];
  const params = {};
  if (eventId) { where.push('l.event_id = @event'); params.event = eventId; }
  if (status) { where.push('l.status = @status'); params.status = status; }
  if (schoolId === 'none') where.push('c.school_id IS NULL');
  else if (schoolId) { where.push('c.school_id = @school'); params.school = schoolId; }
  if (sponsorId) { where.push('l.sponsor_volunteer_id = @sponsor'); params.sponsor = sponsorId; }
  if (gender) { where.push('c.gender = @gender'); params.gender = gender; }
  if (hasPhoto === true) where.push('l.photo_path IS NOT NULL');
  if (hasPhoto === false) where.push('l.photo_path IS NULL');
  const s = R.searchClause(search, ['lower(l.code)', 'c.name_key']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  return { where: where.join(' AND '), params };
}

const ORDER = {
  code: 'l.event_id DESC, l.number ASC',
  '-code': 'l.event_id DESC, l.number DESC',
  child: 'c.sort_key ASC, l.id ASC',
  '-created_at': 'l.created_at DESC, l.id DESC',
  '-updated_at': 'l.updated_at DESC, l.id DESC'
};

function listLetters(viewer, pageParams, filters = {}, db = getDb()) {
  const { where, params } = filterClause(filters);
  return paginate(db, {
    select: SELECT, from: FROM, where, params,
    orderBy: ORDER[filters.orderBy] || ORDER.code, map: (row) => toLetterListItem(row, viewer)
  }, pageParams);
}

/** Conteos por estatus (para las pestañas) y por escuela, con los filtros actuales salvo el estatus. */
function lettersSummary(filters = {}, db = getDb()) {
  const { where, params } = filterClause({ ...filters, status: undefined });
  const w = where ? ` WHERE ${where}` : '';
  const byStatus = Object.fromEntries(LETTER_STATUSES.map((s) => [s, 0]));
  let total = 0;
  for (const r of db.prepare(`SELECT l.status AS k, COUNT(*) AS n FROM ${FROM}${w} GROUP BY l.status`).all(params)) {
    byStatus[r.k] = r.n;
    total += r.n;
  }
  const bySchool = db.prepare(`SELECT c.school_id AS id, s.name AS name, COUNT(*) AS total FROM ${FROM}${w}
      GROUP BY c.school_id ORDER BY s.name IS NULL, s.name`).all(params)
    .map((r) => ({ id: r.id ?? null, name: r.name ?? 'Sin escuela', total: r.total }));
  return { total, by_status: byStatus, by_school: bySchool };
}

/** Fecha de calendario en hora de Veracruz (como la ve el personal). */
const dateOnly = (v) => (v ? todayLocal(new Date(toIso(v))) : '');

function csvColumns(full) {
  return [
    { header: 'Código', value: (r) => r.code },
    { header: 'Evento', value: (r) => r.event_name },
    { header: full ? 'Niña o niño' : 'Niña o niño (nombre)', value: (r) => childForLetter(r, full).display_name },
    { header: 'Edad', value: (r) => ageOn(r.child_birth_date) },
    { header: 'Género', value: (r) => GENDER_LABELS[r.child_gender] },
    { header: 'Escuela', value: (r) => r.school_name },
    { header: 'Grado', value: (r) => r.child_grade },
    { header: 'Grupo', value: (r) => r.child_group },
    { header: 'Deseo principal', value: (r) => r.main_wish },
    { header: 'Deseo secundario', value: (r) => r.secondary_wish },
    { header: 'Estatus', value: (r) => LETTER_STATUS_LABELS[r.status] },
    { header: 'Padrino', value: (r) => (r.sponsor_volunteer_id ? `${r.sponsor_first_name} ${r.sponsor_last_name}` : '') },
    { header: 'Teléfono del padrino', value: (r) => r.sponsor_phone },
    { header: 'Asignada', value: (r) => dateOnly(r.assigned_at) },
    { header: 'Regalo recibido', value: (r) => dateOnly(r.received_at) },
    { header: 'Entregada', value: (r) => dateOnly(r.delivered_at) },
    { header: 'Notas del regalo', value: (r) => r.gift_notes }
  ];
}

function exportLetters(actor, viewer, filters, ip, db = getDb()) {
  const { where, params } = filterClause(filters);
  const rows = db.prepare(`SELECT ${SELECT} FROM ${FROM}${where ? ` WHERE ${where}` : ''} ORDER BY ${ORDER.code} LIMIT ${EXPORT_LIMIT}`).all(params);
  R.recordExport({ entity: TABLE, count: rows.length, actor, ip, filters: {
    event_id: filters.eventId, status: filters.status, school_id: filters.schoolId, sponsor_id: filters.sponsorId,
    gender: filters.gender, has_photo: filters.hasPhoto, search: filters.search
  } }, db);
  return { csv: toCsv(csvColumns(viewer.full), rows), count: rows.length };
}

/** Niñas y niños activos para registrar carta: indica si son elegibles y por qué no (máx. 20). */
function eligibleChildren(viewer, eventId, search, db = getDb()) {
  events.getEventOr404(eventId, db);
  const where = ['c.is_active = 1'];
  const params = { event: eventId };
  const s = R.searchClause(search, ['c.name_key']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  const rows = db.prepare(`SELECT c.*, s.name AS school_name, s.zone AS school_zone, l.id AS letter_id, l.code AS letter_code
      FROM children c LEFT JOIN schools s ON s.id = c.school_id
      LEFT JOIN letters l ON l.child_id = c.id AND l.event_id = @event
      WHERE ${where.join(' AND ')} ORDER BY (l.id IS NOT NULL), (c.guardian_consent = 0), c.sort_key LIMIT ${OPTIONS_LIMIT}`).all(params);
  return {
    items: rows.map((r) => {
      let reason = null;
      if (r.letter_id) reason = 'HAS_LETTER';
      else if (!r.guardian_consent) reason = 'CONSENT_REQUIRED';
      return {
        child: childForLetter(r, viewer.full),
        eligible: !reason,
        reason,
        letter: r.letter_id ? { id: r.letter_id, code: r.letter_code } : null
      };
    })
  };
}

/** Voluntarios activos para asignar como padrinos, con cuántas cartas llevan en el evento. */
function sponsorOptions(eventId, search, db = getDb()) {
  const event = events.getEventOr404(eventId, db);
  const where = ['v.is_active = 1'];
  const params = { event: event.id };
  const s = R.searchClause(search, ['v.name_key', 'v.phone', 'lower(v.email)']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  const rows = db.prepare(`SELECT v.*, (SELECT COUNT(*) FROM letters l WHERE l.event_id = @event AND l.sponsor_volunteer_id = v.id
        AND l.status IN (${SPONSORED_STATUSES.map((x) => `'${x}'`).join(', ')})) AS used
      FROM volunteers v WHERE ${where.join(' AND ')}
      ORDER BY (v.area_of_interest <> 'PADRINO'), v.sort_key LIMIT ${OPTIONS_LIMIT}`).all(params);
  return {
    items: rows.map((r) => ({
      volunteer: { id: r.id, full_name: `${r.first_name} ${r.last_name}`, phone: r.phone, email: r.email ?? null,
        area_of_interest: r.area_of_interest },
      letters_in_event: r.used,
      limit: event.max_letters_per_sponsor
    }))
  };
}

/**
 * Normaliza lo que se escribió o escaneó: "nav26-123", "NAV26 000123", "NAV26000123" → "NAV26-000123".
 * Sin guion, busca el prefijo de evento más largo con el que empieza. Devuelve null si no parece un código.
 */
function normalizeCode(raw, db = getDb()) {
  const text = String(raw || '').trim().toUpperCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  let m = /^([A-Z0-9]{2,10})-(\d{1,9})$/.exec(text);
  if (m) return `${m[1]}-${pad(Number(m[2]))}`;
  if (!/^[A-Z0-9]{4,20}$/.test(text)) return null;
  const prefixes = db.prepare('SELECT code_prefix FROM events WHERE ? LIKE code_prefix || \'%\' ORDER BY length(code_prefix) DESC').all(text);
  for (const { code_prefix: p } of prefixes) {
    m = /^\d{1,9}$/.exec(text.slice(p.length));
    if (m) return `${p}-${pad(Number(m[0]))}`;
  }
  return null;
}

function getByCode(raw, db = getDb()) {
  const code = normalizeCode(raw, db);
  const row = code ? db.prepare(`SELECT ${SELECT} FROM ${FROM} WHERE l.code = ?`).get(code) : null;
  if (!row) throw R.notFound(CODE_NOT_FOUND);
  return row;
}

// ---------------------------------------------------------------------------------------------
// Fotos (contratos §3.8)
// ---------------------------------------------------------------------------------------------

const uploadsDir = (config = getConfig()) => path.join(config.dataDir, 'uploads');

function photoAbsolutePath(rel, config = getConfig()) {
  const base = uploadsDir(config);
  const abs = path.resolve(base, rel);
  if (!abs.startsWith(base + path.sep)) throw new Error('Ruta de foto fuera de la carpeta de archivos');
  return abs;
}

function removeFileQuietly(rel, config) {
  if (!rel) return;
  try { fs.unlinkSync(photoAbsolutePath(rel, config)); } catch { /* ya no existe */ }
}

function savePhoto(actor, id, buffer, ip, { config = getConfig(), db = getDb() } = {}) {
  const maxBytes = config.maxUploadMb * 1024 * 1024;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envía una foto en formato JPG, PNG o WEBP.');
  }
  if (buffer.length > maxBytes) {
    throw new AppError(413, 'FILE_TOO_LARGE', `La foto pesa más de ${config.maxUploadMb} MB.`);
  }
  const type = detectImageType(buffer);
  if (!type) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'El archivo no es una foto JPG, PNG o WEBP.');

  const letter = getLetterOr404(id, db);
  events.assertNotClosed({ status: letter.event_status }, 'El evento está cerrado: ya no se pueden cambiar sus cartas.');
  const rel = `letters/${crypto.randomUUID()}.${EXTENSION[type]}`;
  const abs = photoAbsolutePath(rel, config);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, stripMetadata(buffer, type), { mode: 0o600 });
  try {
    db.transaction(() => {
      const now = nowIso();
      db.prepare('UPDATE letters SET photo_path = ?, photo_uploaded_at = ?, updated_at = ? WHERE id = ?').run(rel, now, now, letter.id);
      recordAudit({ action: 'LETTER_PHOTO_UPDATED', entity: TABLE, entityId: letter.id, userId: R.actorId(actor), ip }, db);
    })();
  } catch (err) {
    removeFileQuietly(rel, config);
    throw err;
  }
  removeFileQuietly(letter.photo_path, config);
  return getLetter(letter.id, db);
}

function removePhoto(actor, id, ip, { config = getConfig(), db = getDb() } = {}) {
  const letter = getLetterOr404(id, db);
  events.assertNotClosed({ status: letter.event_status }, 'El evento está cerrado: ya no se pueden cambiar sus cartas.');
  if (!letter.photo_path) return letter;
  db.transaction(() => {
    db.prepare('UPDATE letters SET photo_path = NULL, photo_uploaded_at = NULL, updated_at = ? WHERE id = ?').run(nowIso(), letter.id);
    recordAudit({ action: 'LETTER_PHOTO_REMOVED', entity: TABLE, entityId: letter.id, userId: R.actorId(actor), ip }, db);
  })();
  removeFileQuietly(letter.photo_path, config);
  return getLetter(letter.id, db);
}

/** { path, mime } de la foto, o 404. */
function photoFile(id, { config = getConfig(), db = getDb() } = {}) {
  const letter = getLetterOr404(id, db);
  const notFound = () => new AppError(404, 'NOT_FOUND', 'Esta carta no tiene foto.');
  if (!letter.photo_path) throw notFound();
  const abs = photoAbsolutePath(letter.photo_path, config);
  if (!fs.existsSync(abs)) throw notFound();
  const ext = path.extname(abs).slice(1);
  const type = Object.keys(EXTENSION).find((k) => EXTENSION[k] === ext);
  return { path: abs, mime: MIME[type] || 'application/octet-stream' };
}

// ---------------------------------------------------------------------------------------------
// Para las fichas de la F3 y las reglas de baja
// ---------------------------------------------------------------------------------------------

/** Cartas de una niña o niño (ficha P14), del evento más reciente al más antiguo. */
function lettersOfChild(childId, db = getDb()) {
  return db.prepare(`SELECT l.id, l.code, l.status, l.main_wish, e.id AS event_id, e.name AS event_name, e.code_prefix AS event_prefix,
        e.status AS event_status, e.event_date
      FROM letters l JOIN events e ON e.id = l.event_id WHERE l.child_id = ? ORDER BY e.event_date DESC, l.id DESC`).all(childId)
    .map((r) => ({ id: r.id, code: r.code, status: r.status, main_wish: r.main_wish, event: eventRef(r) }));
}

/** Cartas que apadrina un voluntario (ficha P09). */
function lettersOfSponsor(volunteerId, db = getDb()) {
  return db.prepare(`SELECT l.id, l.code, l.status, e.id AS event_id, e.name AS event_name, e.code_prefix AS event_prefix,
        e.status AS event_status, e.event_date
      FROM letters l JOIN events e ON e.id = l.event_id WHERE l.sponsor_volunteer_id = ? ORDER BY e.event_date DESC, l.number ASC`).all(volunteerId)
    .map((r) => ({ id: r.id, code: r.code, status: r.status, event: eventRef(r) }));
}

/** Cartas sin entregar de una niña o niño en eventos no cerrados (bloquean su baja). */
function pendingLettersOfChild(childId, db = getDb()) {
  return db.prepare(`SELECT COUNT(*) AS n FROM letters l JOIN events e ON e.id = l.event_id
      WHERE l.child_id = ? AND l.status <> 'ENTREGADO' AND e.status <> 'CERRADO'`).get(childId).n;
}

/** Cartas ASIGNADO o RECIBIDO de un padrino en eventos no cerrados (bloquean su baja). */
function activeLettersOfSponsor(volunteerId, db = getDb()) {
  return db.prepare(`SELECT COUNT(*) AS n FROM letters l JOIN events e ON e.id = l.event_id
      WHERE l.sponsor_volunteer_id = ? AND l.status IN ('ASIGNADO', 'RECIBIDO') AND e.status <> 'CERRADO'`).get(volunteerId).n;
}

module.exports = {
  NOT_FOUND, CODE_NOT_FOUND, viewerOf, getLetter, getLetterOr404, childForLetter, toLetterListItem, toLetterOut, nextActions,
  createLetter, updateLetter, assignSponsor, releaseSponsor, changeStatus, letterHistory,
  listLetters, lettersSummary, exportLetters, eligibleChildren, sponsorOptions, normalizeCode, getByCode,
  savePhoto, removePhoto, photoFile, uploadsDir,
  lettersOfChild, lettersOfSponsor, pendingLettersOfChild, activeLettersOfSponsor
};
