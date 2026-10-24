/**
 * Bitácora de accesos y cambios (tabla audit_logs).
 * No abre transacción propia: se llama dentro de la del servicio que registra la acción.
 */
const { getDb, nowIso } = require('../lib/db');

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

module.exports = { recordAudit, sanitize, SENSITIVE_KEYS };
