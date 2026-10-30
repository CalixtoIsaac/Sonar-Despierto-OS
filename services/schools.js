/**
 * Escuelas o comunidades (módulo BENEFICIARIOS). Duplicado: misma CCT, o mismo nombre en la misma zona
 * (sin distinguir acentos ni mayúsculas) → 409 DUPLICATE_SCHOOL.
 */
const { getDb, toIso } = require('../lib/db');
const { validationError } = require('../lib/errors');
const { paginate } = require('../lib/pagination');
const { normalizeKey } = require('../lib/text');
const R = require('./records');

const TABLE = 'schools';
const NOT_FOUND = 'No existe una escuela con ese identificador.';

const SELECT = `s.*,
  (SELECT COUNT(*) FROM children c WHERE c.school_id = s.id AND c.is_active = 1) AS children_count,
  (SELECT COUNT(*) FROM tutors t WHERE t.school_id = s.id AND t.is_active = 1) AS tutors_count`;

function getSchool(id, db = getDb()) {
  return db.prepare(`SELECT ${SELECT} FROM schools s WHERE s.id = ?`).get(id) || null;
}

function getSchoolOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getSchool(id, db) : null;
  if (!row) throw R.notFound(NOT_FOUND);
  return row;
}

function toSchoolOut(row) {
  return {
    id: row.id,
    name: row.name,
    cct: row.cct ?? null,
    zone: row.zone ?? null,
    address: row.address ?? null,
    contact_name: row.contact_name ?? null,
    contact_phone: row.contact_phone ?? null,
    is_active: Boolean(row.is_active),
    children_count: Number(row.children_count || 0),
    tutors_count: Number(row.tutors_count || 0),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

const toSchoolRef = (row) => (row ? { id: row.id, name: row.name, zone: row.zone ?? null, is_active: Boolean(row.is_active) } : null);

/** Datos validados de la ruta → columnas (solo las presentes). */
function toColumns(data, existing = {}) {
  const row = {};
  for (const k of ['name', 'zone', 'address', 'contact_name', 'contact_phone', 'is_active']) {
    if (data[k] !== undefined) row[k] = data[k];
  }
  if (data.cct !== undefined) row.cct = data.cct ? data.cct.toUpperCase() : null;
  const name = data.name !== undefined ? data.name : existing.name;
  const zone = data.zone !== undefined ? data.zone : existing.zone;
  row.name_key = normalizeKey(name);
  row.zone_key = normalizeKey(zone);
  return row;
}

function checkDuplicate(row, excludeId, db) {
  if (row.cct) {
    const dup = db.prepare('SELECT id FROM schools WHERE cct = ? AND id <> ?').get(row.cct, excludeId ?? -1);
    if (dup) throw R.duplicateError('DUPLICATE_SCHOOL', 'Ya existe una escuela con esa CCT.', dup.id);
  }
  const dup = db.prepare('SELECT id FROM schools WHERE name_key = ? AND zone_key = ? AND id <> ?')
    .get(row.name_key, row.zone_key, excludeId ?? -1);
  if (dup) throw R.duplicateError('DUPLICATE_SCHOOL', 'Ya existe una escuela con ese nombre en esa zona.', dup.id);
}

function createSchool(actor, data, ip, db = getDb()) {
  const row = toColumns(data);
  const id = db.transaction(() => {
    checkDuplicate(row, null, db);
    return R.insertRecord({ table: TABLE, entity: TABLE, row, actor, ip }, db);
  })();
  return getSchool(id, db);
}

function updateSchool(actor, id, data, ip, db = getDb()) {
  const existing = getSchoolOr404(id, db);
  const row = toColumns(data, existing);
  db.transaction(() => {
    checkDuplicate({ ...row, cct: row.cct === undefined ? existing.cct : row.cct }, existing.id, db);
    R.updateRecord({ table: TABLE, entity: TABLE, existing, patch: row, actor, ip }, db);
  })();
  return getSchool(existing.id, db);
}

const ORDER = {
  name: 's.name_key ASC, s.id ASC',
  '-name': 's.name_key DESC, s.id DESC',
  '-created_at': 's.created_at DESC, s.id DESC',
  created_at: 's.created_at ASC, s.id ASC'
};

function listSchools(pageParams, { search, zone, isActive, orderBy = 'name' } = {}, db = getDb()) {
  const where = [];
  const params = {};
  const s = R.searchClause(search, ['s.name_key', 'lower(s.cct)', 's.zone_key']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  if (zone) { where.push('s.zone_key = @zone'); params.zone = normalizeKey(zone); }
  R.activeClause('s', isActive, where, params);
  return paginate(db, {
    select: SELECT, from: 'schools s', where: where.join(' AND '), params,
    orderBy: ORDER[orderBy] || ORDER.name, map: toSchoolOut
  }, pageParams);
}

/** Valida que una escuela exista (y esté activa si se está asignando por primera vez). */
function assertAssignable(schoolId, { field = 'school_id', currentId = null } = {}, db = getDb()) {
  if (schoolId === null || schoolId === undefined) return;
  const row = db.prepare('SELECT id, is_active FROM schools WHERE id = ?').get(schoolId);
  if (!row) throw validationError([{ field, message: 'La escuela no existe.' }]);
  if (!row.is_active && row.id !== currentId) throw validationError([{ field, message: 'La escuela está dada de baja.' }]);
}

module.exports = {
  NOT_FOUND, getSchool, getSchoolOr404, toSchoolOut, toSchoolRef, createSchool, updateSchool, listSchools, assertAssignable
};
