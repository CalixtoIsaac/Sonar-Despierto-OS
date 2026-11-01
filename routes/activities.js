/**
 * /api/activities — calendario de actividades (Fase 5, ADR-0012). Se monta con requireModule('CALENDARIO').
 *
 *   GET    /api/activities                     ?date_from&date_to&activity_type(repetible)&responsible_id(id|me)
 *                                              &event_id&volunteer_id&status(repetible)&search → { items, truncated }
 *   GET    /api/activities/overlaps            ?activity_date&start_time&end_time&responsible_id&exclude_id → { items }
 *   GET    /api/activities/responsible-options → { items: [{ id, full_name }] }
 *   GET    /api/activities/event-options       → { items: [{ id, name, event_date, status, event_type }] }
 *   POST   /api/activities                     ActivityCreate → 201 { activity }   (409 ACTIVITY_OVERLAP)
 *   GET    /api/activities/:id                 → { activity }
 *   PATCH  /api/activities/:id                 { …campos, version?, allow_overlap? } → { activity }
 *   POST   /api/activities/:id/status          { to_status, reason?, version?, allow_overlap? } → { activity }
 *   GET    /api/activities/:id/volunteer-options ?search → { items }
 *   POST   /api/activities/:id/volunteers      { volunteer_ids } → 201 { added, skipped }
 *   DELETE /api/activities/:id/volunteers/:volunteerId → 204
 */
const express = require('express');

const {
  ACTIVITY_TYPES, ACTIVITY_STATUSES, ACTIVITY_MAX_RANGE_DAYS, ACTIVITY_MAX_VOLUNTEERS
} = require('../lib/catalogs');
const { AppError, validationError } = require('../lib/errors');
const H = require('../lib/http');
const { collect, isIsoDate, parseId, validateFields } = require('../lib/validation');
const activities = require('../services/activities');

const router = express.Router();

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
/** "9:05" → "09:05"; null si no es una hora válida. */
function normalizeTime(value) {
  const m = TIME_RE.exec(String(value ?? '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}
const timeCheck = (v) => (normalizeTime(v) ? null : 'Escribe una hora válida (HH:MM).');

const SCHEMA = {
  title: { type: 'text', required: true, max: 120 },
  activity_type: { type: 'enum', required: true, values: ACTIVITY_TYPES, message: 'Elige el tipo de actividad.' },
  activity_date: { type: 'date', required: true },
  start_time: { type: 'text', required: true, max: 5, check: timeCheck },
  end_time: { type: 'text', required: true, max: 5, check: timeCheck },
  location: { type: 'text', max: 255 },
  description: { type: 'text', max: 2000 },
  responsible_user_id: { type: 'id', required: true },
  event_id: { type: 'id' },
  allow_overlap: { type: 'bool' },
  version: { type: 'int', min: 1 }
};

/** Valida el cuerpo y normaliza las horas. En PATCH, title/tipo/fecha/horas/responsable no se pueden vaciar. */
function readBody(body, { partial }) {
  const data = validateFields(body, SCHEMA, { partial });
  if (partial) {
    const c = collect();
    for (const k of ['title', 'activity_type', 'activity_date', 'start_time', 'end_time', 'responsible_user_id']) {
      if (data[k] === null) c.add(k, 'Este campo es obligatorio.');
    }
    c.throwIfAny();
    const onlyFlags = Object.keys(data).every((k) => ['allow_overlap', 'version'].includes(k));
    if (onlyFlags) throw validationError([{ field: 'body', message: 'Envía al menos un campo para actualizar.' }]);
  }
  for (const k of ['start_time', 'end_time']) if (data[k]) data[k] = normalizeTime(data[k]);
  if (data.start_time && data.end_time && data.end_time <= data.start_time) {
    throw validationError([{ field: 'end_time', message: 'La hora de fin debe ser posterior a la de inicio.' }]);
  }
  if (data.allow_overlap === null) delete data.allow_overlap;
  if (data.version === null) delete data.version;
  return data;
}

const listOf = (value) => [].concat(value ?? []).filter((v) => v !== '');
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400e3);

function listFilters(req) {
  const q = req.query;
  const c = collect();
  const f = { search: H.searchQuery(q.search) };
  for (const [field, key] of [['date_from', 'dateFrom'], ['date_to', 'dateTo']]) {
    if (q[field] === undefined || q[field] === '') continue;
    if (!isIsoDate(q[field])) c.add(field, 'Escribe una fecha válida (AAAA-MM-DD).');
    else f[key] = q[field];
  }
  f.types = listOf(q.activity_type).map((t) => String(t).toUpperCase());
  if (f.types.some((t) => !ACTIVITY_TYPES.includes(t))) c.add('activity_type', 'Valor no válido.');
  f.statuses = listOf(q.status).map((t) => String(t).toUpperCase());
  if (f.statuses.some((t) => !ACTIVITY_STATUSES.includes(t))) c.add('status', 'Valor no válido.');
  f.responsibleId = q.responsible_id === 'me' ? req.user.id : H.idQuery(q.responsible_id, 'responsible_id', c);
  f.eventId = H.idQuery(q.event_id, 'event_id', c);
  f.volunteerId = H.idQuery(q.volunteer_id, 'volunteer_id', c);
  if (!c.has('date_from') && !c.has('date_to')) {
    if (!f.eventId && (!f.dateFrom || !f.dateTo)) {
      if (!f.dateFrom) c.add('date_from', 'Indica el rango de fechas (date_from y date_to).');
      if (!f.dateTo) c.add('date_to', 'Indica el rango de fechas (date_from y date_to).');
    } else if (f.dateFrom && f.dateTo) {
      const days = daysBetween(f.dateFrom, f.dateTo);
      if (days < 0) c.add('date_to', 'La fecha final no puede ser anterior a la inicial.');
      else if (days + 1 > ACTIVITY_MAX_RANGE_DAYS) c.add('date_to', `El rango máximo es de ${ACTIVITY_MAX_RANGE_DAYS} días.`);
    }
  }
  c.throwIfAny();
  return f;
}

const out = (row) => ({ activity: activities.toActivityOut(row) });
const activityId = (req) => H.idParam(req, activities.NOT_FOUND);

router.get('/', (req, res) => {
  res.json(activities.listActivities(listFilters(req)));
});

router.get('/overlaps', (req, res) => {
  const q = req.query;
  const c = collect();
  if (!isIsoDate(q.activity_date)) c.add('activity_date', 'Escribe una fecha válida (AAAA-MM-DD).');
  const start = normalizeTime(q.start_time);
  const end = normalizeTime(q.end_time);
  if (!start) c.add('start_time', 'Escribe una hora válida (HH:MM).');
  if (!end) c.add('end_time', 'Escribe una hora válida (HH:MM).');
  const responsibleId = H.idQuery(q.responsible_id, 'responsible_id', c);
  if (!responsibleId && !c.has('responsible_id')) c.add('responsible_id', 'Este campo es obligatorio.');
  const excludeId = H.idQuery(q.exclude_id, 'exclude_id', c);
  c.throwIfAny();
  if (end <= start) return res.json({ items: [] });
  return res.json(activities.overlapPreview({ responsibleId, date: q.activity_date, start, end, excludeId }));
});

router.get('/responsible-options', (req, res) => res.json(activities.responsibleOptions()));
router.get('/event-options', (req, res) => res.json(activities.eventOptions()));

router.post('/', (req, res) => {
  const data = readBody(req.body, { partial: false });
  delete data.version;
  res.status(201).json(out(activities.createActivity(req.user, data, req.ip)));
});

router.get('/:id', (req, res) => {
  res.json(out(activities.getActivityOr404(activityId(req))));
});

router.patch('/:id', (req, res) => {
  const id = activityId(req);
  const data = readBody(req.body, { partial: true });
  res.json(out(activities.updateActivity(req.user, id, data, req.ip)));
});

router.post('/:id/status', (req, res) => {
  const id = activityId(req);
  const data = validateFields(req.body, {
    to_status: { type: 'enum', required: true, values: ACTIVITY_STATUSES, message: 'Elige un estatus válido.' },
    reason: { type: 'text', max: 500, check: (v) => ([...v].length < 5 ? 'Escribe al menos 5 caracteres.' : null) },
    version: { type: 'int', min: 1 },
    allow_overlap: { type: 'bool' }
  });
  res.json(out(activities.changeActivityStatus(req.user, id, {
    toStatus: data.to_status, reason: data.reason, version: data.version ?? undefined, allowOverlap: Boolean(data.allow_overlap)
  }, req.ip)));
});

router.get('/:id/volunteer-options', (req, res) => {
  res.json(activities.volunteerOptions(activityId(req), H.searchQuery(req.query.search)));
});

router.post('/:id/volunteers', (req, res) => {
  const id = activityId(req);
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const c = collect();
  for (const k of Object.keys(body)) if (k !== 'volunteer_ids') c.add(k, 'Campo no permitido.');
  const raw = body.volunteer_ids;
  let ids = [];
  if (!Array.isArray(raw) || raw.length === 0) c.add('volunteer_ids', 'Elige al menos un voluntario.');
  else if (raw.length > ACTIVITY_MAX_VOLUNTEERS) c.add('volunteer_ids', `Elige como máximo ${ACTIVITY_MAX_VOLUNTEERS} voluntarios.`);
  else {
    ids = raw.map(parseId);
    if (ids.some((x) => x === null)) c.add('volunteer_ids', 'Identificador no válido.');
  }
  c.throwIfAny();
  res.status(201).json(activities.addActivityVolunteers(req.user, id, ids, req.ip));
});

router.delete('/:id/volunteers/:volunteerId', (req, res) => {
  const id = activityId(req);
  const volunteerId = parseId(req.params.volunteerId);
  if (!volunteerId) throw new AppError(404, 'NOT_FOUND', 'Ese voluntario no está en esta actividad.');
  activities.removeActivityVolunteer(req.user, id, volunteerId, req.ip);
  res.status(204).end();
});

module.exports = router;
