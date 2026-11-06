/**
 * /api/reports — Dashboard y reportes (Fase 7, ADR-0014). Se monta con requireModule('REPORTES').
 * Solo lectura y solo conteos (sin datos personales).
 *
 *   GET /api/reports/options                     → { events: [EventOption], default_event_id }
 *   GET /api/reports/dashboard?event_id          → Dashboard (sin event_id: el evento sugerido; sin eventos: event null)
 *   GET /api/reports/events                      → { items: [EventComparison] } (comparativo de eventos)
 *   GET /api/reports/dashboard/export?event_id   → .xlsx del evento (auditado: DATA_EXPORTED, entity events)
 */
const express = require('express');

const { todayLocal } = require('../lib/text');
const { MIME } = require('../lib/xlsx');
const { collect } = require('../lib/validation');
const H = require('../lib/http');
const reports = require('../services/reports');
const reportsExport = require('../services/reports-export');

const router = express.Router();

/** event_id de la consulta; si no viene, el evento sugerido (null si no hay eventos). */
function eventIdFrom(req) {
  const c = collect();
  const id = H.idQuery(req.query.event_id, 'event_id', c);
  c.throwIfAny();
  return id || reports.reportOptions().default_event_id;
}

router.get('/options', (req, res) => res.json(reports.reportOptions()));

router.get('/dashboard', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(reports.dashboard(eventIdFrom(req)));
});

router.get('/events', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(reports.eventsComparison());
});

router.get('/dashboard/export', (req, res) => {
  const eventId = eventIdFrom(req);
  if (!eventId) throw reports.notFound('Aún no hay eventos para exportar.');
  const { buffer, filename } = reportsExport.exportDashboard(req.user, eventId, req.ip);
  res.set({
    'Content-Type': MIME,
    'Content-Disposition': `attachment; filename="${filename || `reporte-${todayLocal()}.xlsx`}"`,
    'Cache-Control': 'no-store'
  });
  res.send(buffer);
});

module.exports = router;
