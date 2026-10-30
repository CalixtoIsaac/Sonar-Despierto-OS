/**
 * Piezas comunes de los registros de personas (Fase 3): alta y edición con bitácora, búsqueda por
 * palabras sobre columnas normalizadas y registro de exportaciones.
 *
 * Bitácora (sin datos personales: solo nombres de campos, ids y conteos):
 *   RECORD_CREATED      detail: null
 *   RECORD_UPDATED      detail: { changed: ['phone', 'school_id'] }
 *   RECORD_DEACTIVATED / RECORD_ACTIVATED   detail: null
 *   DATA_EXPORTED       detail: { format: 'csv', count, filters: { school_id: 3, search: true } }
 *
 * Los nombres de tabla vienen del código (nunca del usuario).
 */
const { getDb, nowIso } = require('../lib/db');
const { AppError } = require('../lib/errors');
const { likePattern } = require('../lib/pagination');
const { searchTokens } = require('../lib/text');
const { recordAudit } = require('./audit');

// Columnas calculadas: no se reportan como "cambiadas" en la bitácora
const DERIVED_COLUMNS = new Set(['name_key', 'sort_key', 'zone_key', 'guardian_consent_at', 'is_active']);

const actorId = (actor) => (actor ? actor.id : null);
const norm = (v) => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v));

function insertRecord({ table, entity, row, actor, ip }, db = getDb()) {
  const now = nowIso();
  const full = {};
  for (const [k, v] of Object.entries({ ...row, created_by_id: actorId(actor), created_at: now, updated_at: now })) {
    full[k] = norm(v);
  }
  const cols = Object.keys(full);
  const info = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(full);
  const id = Number(info.lastInsertRowid);
  recordAudit({ action: 'RECORD_CREATED', entity, entityId: id, userId: actorId(actor), ip }, db);
  return id;
}

/** Aplica solo lo que cambió. Devuelve la lista de columnas cambiadas. */
function updateRecord({ table, entity, existing, patch, actor, ip }, db = getDb()) {
  const changed = Object.keys(patch).filter((c) => norm(patch[c]) !== norm(existing[c]));
  if (!changed.length) return [];
  const params = { __now: nowIso(), __id: existing.id };
  for (const c of changed) params[c] = norm(patch[c]);
  db.prepare(`UPDATE ${table} SET ${changed.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @__now WHERE id = @__id`).run(params);

  const visible = changed.filter((c) => !DERIVED_COLUMNS.has(c));
  const audit = (action, detail = null) => recordAudit({ action, entity, entityId: existing.id, userId: actorId(actor), detail, ip }, db);
  if (visible.length) audit('RECORD_UPDATED', { changed: visible });
  if (changed.includes('is_active')) audit(patch.is_active ? 'RECORD_ACTIVATED' : 'RECORD_DEACTIVATED');
  return changed;
}

/**
 * Cada palabra de la búsqueda debe aparecer en alguna de las columnas (normalizadas).
 * Devuelve { sql, params } para agregar al WHERE.
 */
function searchClause(text, columns, prefix = 's') {
  const tokens = searchTokens(text);
  if (!tokens.length) return null;
  const params = {};
  const parts = tokens.map((t, i) => {
    params[`${prefix}${i}`] = likePattern(t);
    return `(${columns.map((c) => `${c} LIKE @${prefix}${i} ESCAPE '\\'`).join(' OR ')})`;
  });
  return { sql: parts.join(' AND '), params };
}

/** Registra una exportación (la llama el servicio antes de devolver el archivo). */
function recordExport({ entity, count, filters, actor, ip }, db = getDb()) {
  const safe = {};
  for (const [k, v] of Object.entries(filters || {})) {
    if (v === undefined || v === null || v === '') continue;
    safe[k] = k === 'search' ? true : v; // el texto buscado puede ser un nombre: no se guarda
  }
  recordAudit({ action: 'DATA_EXPORTED', entity, entityId: null, userId: actorId(actor),
    detail: { format: 'csv', count, filters: safe }, ip }, db);
}

function duplicateError(code, message, existingId) {
  return new AppError(409, code, message, { extra: { existing_id: existingId } });
}

function notFound(message) {
  return new AppError(404, 'NOT_FOUND', message);
}

/** Filtro común is_active (true/false/undefined). */
function activeClause(alias, isActive, where, params) {
  if (isActive === undefined || isActive === null) return;
  where.push(`${alias}.is_active = @active`);
  params.active = isActive ? 1 : 0;
}

module.exports = {
  insertRecord, updateRecord, searchClause, recordExport, duplicateError, notFound, activeClause, actorId
};
