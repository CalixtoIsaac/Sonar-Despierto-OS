/**
 * Voluntarios (módulo VOLUNTARIOS): personas que apoyan en los eventos. No tienen cuenta (ADR-0004).
 * Duplicado: mismo correo, o mismo nombre completo (sin acentos ni mayúsculas) y teléfono
 * → 409 DUPLICATE_VOLUNTEER con existing_id.
 */
const { getDb, nowIso, toIso } = require('../lib/db');
const { SHIRT_SIZES, VOLUNTEER_AREAS, VOLUNTEER_AREA_LABELS } = require('../lib/catalogs');
const { toCsv } = require('../lib/csv');
const { paginate } = require('../lib/pagination');
const { normalizeKey, ageOn } = require('../lib/text');
const R = require('./records');
const users = require('./users');

const TABLE = 'volunteers';
const NOT_FOUND = 'No existe un voluntario con ese identificador.';
const EXPORT_LIMIT = 10000;

function getVolunteer(id, db = getDb()) {
  return db.prepare('SELECT * FROM volunteers WHERE id = ?').get(id) || null;
}

function getVolunteerOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getVolunteer(id, db) : null;
  if (!row) throw R.notFound(NOT_FOUND);
  return row;
}

function toVolunteerListItem(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: `${row.first_name} ${row.last_name}`,
    email: row.email ?? null,
    phone: row.phone,
    city: row.city ?? null,
    shirt_size: row.shirt_size,
    area_of_interest: row.area_of_interest,
    is_active: Boolean(row.is_active),
    created_at: toIso(row.created_at)
  };
}

function toVolunteerOut(row, db = getDb()) {
  return {
    ...toVolunteerListItem(row),
    birth_date: row.birth_date ?? null,
    age: ageOn(row.birth_date),
    occupation: row.occupation ?? null,
    emergency_contact_name: row.emergency_contact_name,
    emergency_contact_phone: row.emergency_contact_phone,
    emergency_contact_relationship: row.emergency_contact_relationship ?? null,
    medical_notes: row.medical_notes ?? null,
    notes: row.notes ?? null,
    privacy_consent_at: toIso(row.privacy_consent_at),
    created_by: row.created_by_id ? users.toUserRef(users.getUser(row.created_by_id, db)) : null,
    updated_at: toIso(row.updated_at),
    events: [] // TODO(F4): participación en eventos y cartas apadrinadas
  };
}

const FIELDS = ['first_name', 'last_name', 'email', 'phone', 'birth_date', 'city', 'occupation', 'emergency_contact_name',
  'emergency_contact_phone', 'emergency_contact_relationship', 'shirt_size', 'area_of_interest', 'medical_notes', 'notes', 'is_active'];

function toColumns(data, existing = {}) {
  const row = {};
  for (const k of FIELDS) if (data[k] !== undefined) row[k] = data[k];
  const first = data.first_name ?? existing.first_name;
  const last = data.last_name ?? existing.last_name;
  row.name_key = normalizeKey(`${first} ${last}`);
  row.sort_key = normalizeKey(`${last} ${first}`);
  return row;
}

function checkDuplicate({ email, nameKey, phone }, excludeId, db) {
  if (email) {
    const dup = db.prepare('SELECT id FROM volunteers WHERE email = ? AND id <> ?').get(email, excludeId ?? -1);
    if (dup) throw R.duplicateError('DUPLICATE_VOLUNTEER', 'Ya existe un voluntario con ese correo.', dup.id);
  }
  const dup = db.prepare('SELECT id FROM volunteers WHERE name_key = ? AND phone = ? AND id <> ?').get(nameKey, phone, excludeId ?? -1);
  if (dup) throw R.duplicateError('DUPLICATE_VOLUNTEER', 'Ya existe un voluntario con ese nombre y teléfono.', dup.id);
}

function createVolunteer(actor, data, ip, db = getDb()) {
  const row = { ...toColumns(data), privacy_consent_at: nowIso() };
  const id = db.transaction(() => {
    checkDuplicate({ email: row.email, nameKey: row.name_key, phone: row.phone }, null, db);
    return R.insertRecord({ table: TABLE, entity: TABLE, row, actor, ip }, db);
  })();
  return getVolunteer(id, db);
}

function updateVolunteer(actor, id, data, ip, db = getDb()) {
  const existing = getVolunteerOr404(id, db);
  const row = toColumns(data, existing);
  db.transaction(() => {
    checkDuplicate({
      email: row.email === undefined ? existing.email : row.email,
      nameKey: row.name_key,
      phone: row.phone ?? existing.phone
    }, existing.id, db);
    R.updateRecord({ table: TABLE, entity: TABLE, existing, patch: row, actor, ip }, db);
  })();
  return getVolunteer(existing.id, db);
}

function filterClause({ search, area, shirtSize, isActive } = {}) {
  const where = [];
  const params = {};
  const s = R.searchClause(search, ['v.name_key', 'lower(v.email)', 'v.phone']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  if (area) { where.push('v.area_of_interest = @area'); params.area = area; }
  if (shirtSize) { where.push('v.shirt_size = @size'); params.size = shirtSize; }
  R.activeClause('v', isActive, where, params);
  return { where: where.join(' AND '), params };
}

const ORDER = {
  name: 'v.sort_key ASC, v.id ASC',
  '-name': 'v.sort_key DESC, v.id DESC',
  '-created_at': 'v.created_at DESC, v.id DESC',
  created_at: 'v.created_at ASC, v.id ASC'
};

function listVolunteers(pageParams, filters = {}, db = getDb()) {
  const { where, params } = filterClause(filters);
  return paginate(db, {
    select: 'v.*', from: 'volunteers v', where, params,
    orderBy: ORDER[filters.orderBy] || ORDER.name, map: toVolunteerListItem
  }, pageParams);
}

/** Conteos para el filtro actual: tallas (para pedir playeras) y áreas. */
function volunteersSummary(filters = {}, db = getDb()) {
  const { where, params } = filterClause(filters);
  const w = where ? ` WHERE ${where}` : '';
  const sizes = Object.fromEntries(SHIRT_SIZES.map((s) => [s, 0]));
  for (const r of db.prepare(`SELECT v.shirt_size AS k, COUNT(*) AS n FROM volunteers v${w} GROUP BY v.shirt_size`).all(params)) sizes[r.k] = r.n;
  const areas = Object.fromEntries(VOLUNTEER_AREAS.map((a) => [a, 0]));
  for (const r of db.prepare(`SELECT v.area_of_interest AS k, COUNT(*) AS n FROM volunteers v${w} GROUP BY v.area_of_interest`).all(params)) areas[r.k] = r.n;
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  return { total, shirt_sizes: sizes, areas };
}

const CSV_COLUMNS = [
  { header: 'Nombre(s)', value: (r) => r.first_name },
  { header: 'Apellidos', value: (r) => r.last_name },
  { header: 'Correo', value: (r) => r.email },
  { header: 'Teléfono', value: (r) => r.phone },
  { header: 'Ciudad', value: (r) => r.city },
  { header: 'Ocupación', value: (r) => r.occupation },
  { header: 'Área de interés', value: (r) => VOLUNTEER_AREA_LABELS[r.area_of_interest] },
  { header: 'Talla de playera', value: (r) => r.shirt_size },
  { header: 'Contacto de emergencia', value: (r) => r.emergency_contact_name },
  { header: 'Teléfono de emergencia', value: (r) => r.emergency_contact_phone },
  { header: 'Parentesco', value: (r) => r.emergency_contact_relationship },
  { header: 'Activo', value: (r) => Boolean(r.is_active) },
  { header: 'Registrado', value: (r) => String(r.created_at).slice(0, 10) }
];

/** CSV con los filtros del listado (sin notas médicas). Registra DATA_EXPORTED en la bitácora. */
function exportVolunteers(actor, filters, ip, db = getDb()) {
  const { where, params } = filterClause(filters);
  const rows = db.prepare(`SELECT v.* FROM volunteers v${where ? ` WHERE ${where}` : ''} ORDER BY ${ORDER.name} LIMIT ${EXPORT_LIMIT}`).all(params);
  R.recordExport({ entity: TABLE, count: rows.length, actor, ip,
    filters: { search: filters.search, area: filters.area, shirt_size: filters.shirtSize, is_active: filters.isActive } }, db);
  return { csv: toCsv(CSV_COLUMNS, rows), count: rows.length };
}

module.exports = {
  NOT_FOUND, getVolunteer, getVolunteerOr404, toVolunteerOut, toVolunteerListItem, createVolunteer, updateVolunteer,
  listVolunteers, volunteersSummary, exportVolunteers
};
