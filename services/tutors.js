/**
 * Tutores responsables (módulo BENEFICIARIOS): la profesora, el director o el líder comunitario que
 * coordina a un grupo de niñas y niños. No tienen cuenta en el sistema (ADR-0004).
 * Duplicado: mismo nombre completo (sin acentos ni mayúsculas) y mismo teléfono → 409 DUPLICATE_TUTOR.
 */
const { getDb, toIso } = require('../lib/db');
const { validationError } = require('../lib/errors');
const { paginate } = require('../lib/pagination');
const { normalizeKey } = require('../lib/text');
const R = require('./records');
const schools = require('./schools');

const TABLE = 'tutors';
const NOT_FOUND = 'No existe un tutor con ese identificador.';

const SELECT = `t.*, s.name AS school_name, s.zone AS school_zone, s.is_active AS school_is_active,
  (SELECT COUNT(*) FROM children c WHERE c.tutor_id = t.id AND c.is_active = 1) AS children_count`;
const FROM = 'tutors t LEFT JOIN schools s ON s.id = t.school_id';

function getTutor(id, db = getDb()) {
  return db.prepare(`SELECT ${SELECT} FROM ${FROM} WHERE t.id = ?`).get(id) || null;
}

function getTutorOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getTutor(id, db) : null;
  if (!row) throw R.notFound(NOT_FOUND);
  return row;
}

function toTutorOut(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: `${row.first_name} ${row.last_name}`,
    phone: row.phone,
    email: row.email ?? null,
    position: row.position ?? null,
    school: row.school_id ? { id: row.school_id, name: row.school_name, zone: row.school_zone ?? null } : null,
    notes: row.notes ?? null,
    is_active: Boolean(row.is_active),
    children_count: Number(row.children_count || 0),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function toColumns(data, existing = {}) {
  const row = {};
  for (const k of ['first_name', 'last_name', 'phone', 'email', 'position', 'school_id', 'notes', 'is_active']) {
    if (data[k] !== undefined) row[k] = data[k];
  }
  const first = data.first_name ?? existing.first_name;
  const last = data.last_name ?? existing.last_name;
  row.name_key = normalizeKey(`${first} ${last}`);
  row.sort_key = normalizeKey(`${last} ${first}`);
  return row;
}

function checkDuplicate(nameKey, phone, excludeId, db) {
  const dup = db.prepare('SELECT id FROM tutors WHERE name_key = ? AND phone = ? AND id <> ?').get(nameKey, phone, excludeId ?? -1);
  if (dup) throw R.duplicateError('DUPLICATE_TUTOR', 'Ya existe un tutor con ese nombre y teléfono.', dup.id);
}

function createTutor(actor, data, ip, db = getDb()) {
  const row = toColumns(data);
  const id = db.transaction(() => {
    schools.assertAssignable(row.school_id, {}, db);
    checkDuplicate(row.name_key, row.phone, null, db);
    return R.insertRecord({ table: TABLE, entity: TABLE, row, actor, ip }, db);
  })();
  return getTutor(id, db);
}

function updateTutor(actor, id, data, ip, db = getDb()) {
  const existing = getTutorOr404(id, db);
  const row = toColumns(data, existing);
  db.transaction(() => {
    if (row.school_id !== undefined) schools.assertAssignable(row.school_id, { currentId: existing.school_id }, db);
    checkDuplicate(row.name_key, row.phone ?? existing.phone, existing.id, db);
    R.updateRecord({ table: TABLE, entity: TABLE, existing, patch: row, actor, ip }, db);
  })();
  return getTutor(existing.id, db);
}

const ORDER = {
  name: 't.sort_key ASC, t.id ASC',
  '-name': 't.sort_key DESC, t.id DESC',
  '-created_at': 't.created_at DESC, t.id DESC',
  created_at: 't.created_at ASC, t.id ASC'
};

function listTutors(pageParams, { search, schoolId, isActive, orderBy = 'name' } = {}, db = getDb()) {
  const where = [];
  const params = {};
  const s = R.searchClause(search, ['t.name_key', 't.phone', 'lower(t.email)']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  if (schoolId) { where.push('t.school_id = @school'); params.school = schoolId; }
  R.activeClause('t', isActive, where, params);
  return paginate(db, {
    select: SELECT, from: FROM, where: where.join(' AND '), params,
    orderBy: ORDER[orderBy] || ORDER.name, map: toTutorOut
  }, pageParams);
}

function assertAssignable(tutorId, { field = 'tutor_id', currentId = null } = {}, db = getDb()) {
  if (tutorId === null || tutorId === undefined) return;
  const row = db.prepare('SELECT id, is_active FROM tutors WHERE id = ?').get(tutorId);
  if (!row) throw validationError([{ field, message: 'El tutor no existe.' }]);
  if (!row.is_active && row.id !== currentId) throw validationError([{ field, message: 'El tutor está dado de baja.' }]);
}

module.exports = { NOT_FOUND, getTutor, getTutorOr404, toTutorOut, createTutor, updateTutor, listTutors, assertAssignable };
