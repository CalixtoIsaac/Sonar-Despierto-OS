/**
 * Bitácora de accesos y cambios (tabla audit_logs).
 * recordAudit no abre transacción propia: se llama dentro de la del servicio que registra la acción.
 */
const { getDb, nowIso, toIso } = require('../lib/db');
const { isAuditAction } = require('../lib/audit-actions');
const { validationError } = require('../lib/errors');
const { paginate } = require('../lib/pagination');

// Nunca se guardan en la bitácora (también en objetos anidados)
const SENSITIVE_KEYS = new Set([
  'password', 'new_password', 'current_password', 'temporary_password', 'password_hash',
  'token', 'access_token', 'refresh_token'
]);

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!SENSITIVE_KEYS.has(k.toLowerCase())) out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

function recordAudit({ action, entity, entityId = null, userId = null, detail = null, ip = null }, db = getDb()) {
  if (!isAuditAction(action)) throw new Error(`Acción de bitácora desconocida: ${action}`);
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    action,
    entity,
    entityId,
    detail === null ? null : JSON.stringify(sanitize(detail)),
    ip,
    nowIso()
  );
}

function parseDetail(text) {
  if (text === null || text === undefined || text === '') return null;
  try { return JSON.parse(text); } catch { return null; }
}

function toAuditLogOut(row) {
  return {
    id: row.id,
    created_at: toIso(row.created_at),
    action: row.action,
    entity: row.entity,
    entity_id: row.entity_id,
    actor: row.user_id && row.actor_email ? {
      id: row.user_id,
      full_name: `${row.actor_first_name} ${row.actor_last_name}`.trim(),
      email: row.actor_email
    } : null,
    detail: parseDetail(row.detail),
    ip_address: row.ip_address
  };
}

function toUtcIso(value, field) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw validationError([{ field, message: 'Fecha no válida.' }]);
  return date.toISOString();
}

/** Bitácora con filtros; orden created_at desc, id desc. */
function listAuditLogs(pageParams, { actions = [], entity, entityId, actorId, dateFrom, dateTo } = {}, db = getDb()) {
  const where = [];
  const params = {};
  if (actions.length) {
    const names = actions.map((a, i) => { params[`a${i}`] = a; return `@a${i}`; });
    where.push(`a.action IN (${names.join(', ')})`);
  }
  if (entity) { where.push('a.entity = @entity'); params.entity = entity; }
  if (entityId) { where.push('a.entity_id = @entityId'); params.entityId = entityId; }
  if (actorId) { where.push('a.user_id = @actorId'); params.actorId = actorId; }
  const from = dateFrom ? toUtcIso(dateFrom, 'date_from') : null;
  const to = dateTo ? toUtcIso(dateTo, 'date_to') : null;
  if (from && to && to <= from) {
    throw validationError([{ field: 'date_to', message: 'La fecha final debe ser posterior a la inicial.' }]);
  }
  if (from) { where.push('a.created_at >= @dateFrom'); params.dateFrom = from; }
  if (to) { where.push('a.created_at < @dateTo'); params.dateTo = to; }

  return paginate(db, {
    select: 'a.*, u.first_name AS actor_first_name, u.last_name AS actor_last_name, u.email AS actor_email',
    from: 'audit_logs a LEFT JOIN users u ON u.id = a.user_id',
    where: where.join(' AND '),
    params,
    orderBy: 'a.created_at DESC, a.id DESC',
    map: toAuditLogOut
  }, pageParams);
}

module.exports = { recordAudit, sanitize, SENSITIVE_KEYS, listAuditLogs, toAuditLogOut };
