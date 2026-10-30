/**
 * Niñas y niños beneficiarios (módulo BENEFICIARIOS) — datos sensibles de menores.
 *
 * - Duplicado: mismo nombre completo (sin acentos ni mayúsculas) y misma fecha de nacimiento
 *   → 409 DUPLICATE_CHILD con existing_id (aunque la escuela sea distinta o falte).
 * - Consentimiento del padre, madre o tutor legal: guardian_consent; al marcarlo se guarda la fecha.
 *   Se puede registrar sin él, pero la Fase 4 lo exige para crear cartas.
 * - La bitácora nunca guarda nombres ni datos del menor: solo ids y nombres de campos.
 */
const { getDb, nowIso, toIso } = require('../lib/db');
const { GENDER_LABELS } = require('../lib/catalogs');
const { toCsv } = require('../lib/csv');
const { paginate } = require('../lib/pagination');
const { normalizeKey, ageOn } = require('../lib/text');
const R = require('./records');
const schools = require('./schools');
const tutors = require('./tutors');
const users = require('./users');

const TABLE = 'children';
const NOT_FOUND = 'No existe una niña o niño con ese identificador.';
const EXPORT_LIMIT = 10000;

const SELECT = `c.*, s.name AS school_name, s.zone AS school_zone,
  t.first_name AS tutor_first_name, t.last_name AS tutor_last_name, t.phone AS tutor_phone`;
const FROM = 'children c LEFT JOIN schools s ON s.id = c.school_id LEFT JOIN tutors t ON t.id = c.tutor_id';

function getChild(id, db = getDb()) {
  return db.prepare(`SELECT ${SELECT} FROM ${FROM} WHERE c.id = ?`).get(id) || null;
}

function getChildOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getChild(id, db) : null;
  if (!row) throw R.notFound(NOT_FOUND);
  return row;
}

const schoolRef = (row) => (row.school_id ? { id: row.school_id, name: row.school_name, zone: row.school_zone ?? null } : null);
const tutorRef = (row) => (row.tutor_id ? {
  id: row.tutor_id, full_name: `${row.tutor_first_name} ${row.tutor_last_name}`, phone: row.tutor_phone
} : null);

function toChildListItem(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: `${row.first_name} ${row.last_name}`,
    birth_date: row.birth_date,
    age: ageOn(row.birth_date),
    gender: row.gender,
    school: schoolRef(row),
    grade: row.grade ?? null,
    group_name: row.group_name ?? null,
    tutor: tutorRef(row),
    guardian_consent: Boolean(row.guardian_consent),
    is_active: Boolean(row.is_active)
  };
}

function toChildOut(row, db = getDb()) {
  return {
    ...toChildListItem(row),
    guardian_name: row.guardian_name,
    guardian_relationship: row.guardian_relationship ?? null,
    guardian_phone: row.guardian_phone ?? null,
    guardian_consent_at: toIso(row.guardian_consent_at),
    notes: row.notes ?? null,
    letters: [], // TODO(F4): cartas de la niña o niño por evento
    created_by: row.created_by_id ? users.toUserRef(users.getUser(row.created_by_id, db)) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

const FIELDS = ['first_name', 'last_name', 'birth_date', 'gender', 'school_id', 'grade', 'group_name', 'tutor_id',
  'guardian_name', 'guardian_relationship', 'guardian_phone', 'guardian_consent', 'notes', 'is_active'];

function toColumns(data, existing = {}) {
  const row = {};
  for (const k of FIELDS) if (data[k] !== undefined) row[k] = data[k];
  const first = data.first_name ?? existing.first_name;
  const last = data.last_name ?? existing.last_name;
  row.name_key = normalizeKey(`${first} ${last}`);
  row.sort_key = normalizeKey(`${last} ${first}`);
  if (data.guardian_consent !== undefined && Boolean(data.guardian_consent) !== Boolean(existing.guardian_consent)) {
    row.guardian_consent_at = data.guardian_consent ? nowIso() : null;
  }
  return row;
}

function checkDuplicate(nameKey, birthDate, excludeId, db) {
  const dup = db.prepare('SELECT id FROM children WHERE name_key = ? AND birth_date = ? AND id <> ?').get(nameKey, birthDate, excludeId ?? -1);
  if (dup) {
    throw R.duplicateError('DUPLICATE_CHILD',
      'Ya existe una niña o niño registrado con ese nombre y fecha de nacimiento.', dup.id);
  }
}

function createChild(actor, data, ip, db = getDb()) {
  const row = toColumns({ gender: 'NO_ESPECIFICA', guardian_consent: false, ...data });
  const id = db.transaction(() => {
    schools.assertAssignable(row.school_id, {}, db);
    tutors.assertAssignable(row.tutor_id, {}, db);
    checkDuplicate(row.name_key, row.birth_date, null, db);
    return R.insertRecord({ table: TABLE, entity: TABLE, row, actor, ip }, db);
  })();
  return getChild(id, db);
}

function updateChild(actor, id, data, ip, db = getDb()) {
  const existing = getChildOr404(id, db);
  const row = toColumns(data, existing);
  db.transaction(() => {
    if (row.school_id !== undefined) schools.assertAssignable(row.school_id, { currentId: existing.school_id }, db);
    if (row.tutor_id !== undefined) tutors.assertAssignable(row.tutor_id, { currentId: existing.tutor_id }, db);
    checkDuplicate(row.name_key, row.birth_date ?? existing.birth_date, existing.id, db);
    R.updateRecord({ table: TABLE, entity: TABLE, existing, patch: row, actor, ip }, db);
  })();
  return getChild(existing.id, db);
}

function filterClause({ search, schoolId, tutorId, gender, consent, isActive } = {}) {
  const where = [];
  const params = {};
  const s = R.searchClause(search, ['c.name_key']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  if (schoolId === 'none') where.push('c.school_id IS NULL');
  else if (schoolId) { where.push('c.school_id = @school'); params.school = schoolId; }
  if (tutorId) { where.push('c.tutor_id = @tutor'); params.tutor = tutorId; }
  if (gender) { where.push('c.gender = @gender'); params.gender = gender; }
  if (consent !== undefined && consent !== null) { where.push('c.guardian_consent = @consent'); params.consent = consent ? 1 : 0; }
  R.activeClause('c', isActive, where, params);
  return { where: where.join(' AND '), params };
}

const ORDER = {
  name: 'c.sort_key ASC, c.id ASC',
  '-name': 'c.sort_key DESC, c.id DESC',
  '-created_at': 'c.created_at DESC, c.id DESC',
  created_at: 'c.created_at ASC, c.id ASC',
  birth_date: 'c.birth_date ASC, c.id ASC',
  '-birth_date': 'c.birth_date DESC, c.id DESC'
};

function listChildren(pageParams, filters = {}, db = getDb()) {
  const { where, params } = filterClause(filters);
  return paginate(db, {
    select: SELECT, from: FROM, where, params,
    orderBy: ORDER[filters.orderBy] || ORDER.name, map: toChildListItem
  }, pageParams);
}

const CSV_COLUMNS = [
  { header: 'Nombre(s)', value: (r) => r.first_name },
  { header: 'Apellidos', value: (r) => r.last_name },
  { header: 'Fecha de nacimiento', value: (r) => r.birth_date },
  { header: 'Edad', value: (r) => ageOn(r.birth_date) },
  { header: 'Género', value: (r) => GENDER_LABELS[r.gender] },
  { header: 'Escuela', value: (r) => r.school_name },
  { header: 'Grado', value: (r) => r.grade },
  { header: 'Grupo', value: (r) => r.group_name },
  { header: 'Tutor responsable', value: (r) => (r.tutor_id ? `${r.tutor_first_name} ${r.tutor_last_name}` : '') },
  { header: 'Teléfono del tutor', value: (r) => r.tutor_phone },
  { header: 'Madre, padre o tutor legal', value: (r) => r.guardian_name },
  { header: 'Parentesco', value: (r) => r.guardian_relationship },
  { header: 'Teléfono', value: (r) => r.guardian_phone },
  { header: 'Consentimiento', value: (r) => Boolean(r.guardian_consent) },
  { header: 'Activo', value: (r) => Boolean(r.is_active) }
];

/** CSV con los filtros del listado (sin observaciones). Registra DATA_EXPORTED en la bitácora. */
function exportChildren(actor, filters, ip, db = getDb()) {
  const { where, params } = filterClause(filters);
  const rows = db.prepare(`SELECT ${SELECT} FROM ${FROM}${where ? ` WHERE ${where}` : ''} ORDER BY ${ORDER.name} LIMIT ${EXPORT_LIMIT}`).all(params);
  R.recordExport({ entity: TABLE, count: rows.length, actor, ip, filters: {
    search: filters.search, school_id: filters.schoolId, tutor_id: filters.tutorId, gender: filters.gender,
    consent: filters.consent, is_active: filters.isActive
  } }, db);
  return { csv: toCsv(CSV_COLUMNS, rows), count: rows.length };
}

module.exports = {
  NOT_FOUND, getChild, getChildOr404, toChildOut, toChildListItem, createChild, updateChild, listChildren, exportChildren
};
