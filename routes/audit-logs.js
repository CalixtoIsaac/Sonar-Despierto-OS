/**
 * /api/audit-logs — consulta de la bitácora (solo ADMIN; se monta con requireAdmin).
 *
 *   GET /api/audit-logs ?page&page_size(50)&action(repetible)&entity&entity_id&actor_id&date_from&date_to
 *   date_from incluido, date_to excluido (ISO 8601; se convierten a UTC). Orden: created_at desc, id desc.
 */
const express = require('express');

const { isAuditAction } = require('../lib/audit-actions');
const { parsePageParams } = require('../lib/pagination');
const { collect, parseId } = require('../lib/validation');
const audit = require('../services/audit');

const router = express.Router();

router.get('/', (req, res) => {
  const pageParams = parsePageParams(req.query, { defaultPageSize: 50 });
  const q = req.query;
  const c = collect();
  const actions = [].concat(q.action ?? []).map((a) => String(a).trim().toUpperCase()).filter(Boolean);
  if (actions.some((a) => !isAuditAction(a))) c.add('action', 'Acción no válida.');
  const entity = typeof q.entity === 'string' && q.entity.trim() ? q.entity.trim().slice(0, 50) : undefined;
  let entityId;
  if (q.entity_id !== undefined && q.entity_id !== '') {
    entityId = parseId(q.entity_id);
    if (!entityId) c.add('entity_id', 'Identificador no válido.');
  }
  let actorId;
  if (q.actor_id !== undefined && q.actor_id !== '') {
    actorId = parseId(q.actor_id);
    if (!actorId) c.add('actor_id', 'Identificador no válido.');
  }
  c.throwIfAny();
  const dateFrom = typeof q.date_from === 'string' && q.date_from ? q.date_from : undefined;
  const dateTo = typeof q.date_to === 'string' && q.date_to ? q.date_to : undefined;
  res.json(audit.listAuditLogs(pageParams, { actions, entity, entityId, actorId, dateFrom, dateTo }));
});

module.exports = router;
