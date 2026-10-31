/**
 * /api/events — eventos y sus voluntarios (Fase 4). Se monta con requireAnyModule(['EVENTOS', 'CARTAS']):
 * leer la lista y el detalle basta con CARTAS (selector de evento); todo lo demás exige EVENTOS.
 *
 *   GET   /api/events                         ?page&page_size&search&status&event_type&order_by
 *   POST  /api/events                         EventCreate → 201 { event }      (409 DUPLICATE_EVENT)
 *   GET   /api/events/:id                     → { event }  (con stats)
 *   PATCH /api/events/:id                     → { event }  (400 EVENT_FIELD_LOCKED, EVENT_CLOSED)
 *   POST  /api/events/:id/status              { to_status } → { event }
 *   GET   /api/events/:id/volunteers          ?page&page_size&search&status&area → Page<EventVolunteerOut>
 *   GET   /api/events/:id/volunteer-options   ?search → { items }
 *   POST  /api/events/:id/volunteers          { volunteer_ids, area?, status?, notes? } → 201 { added, skipped }
 *   PATCH /api/events/:id/volunteers/:volunteerId  { area?, status?, notes? } → { participation }
 */
const express = require('express');

const { assertModule } = require('../lib/auth');
const {
  EVENT_TYPES, EVENT_STATUSES, PARTICIPATION_STATUSES, VOLUNTEER_AREAS, DEFAULT_LETTERS_PER_SPONSOR, MAX_LETTERS_PER_SPONSOR
} = require('../lib/catalogs');
const { validationError } = require('../lib/errors');
const H = require('../lib/http');
const { parsePageParams } = require('../lib/pagination');
const { collect, parseId, validateFields } = require('../lib/validation');
const events = require('../services/events');

const router = express.Router();

const needEventos = (req, res, next) => {
  try { assertModule(req.user, 'EVENTOS'); next(); } catch (err) { next(err); }
};

const SCHEMA = {
  name: { type: 'text', required: true, max: 120 },
  event_type: { type: 'enum', required: true, values: EVENT_TYPES, message: 'Elige el tipo de evento.' },
  code_prefix: { type: 'text', required: true, max: 10,
    check: (v) => (/^[A-Za-z0-9]{3,10}$/.test(v) ? null : 'Usa de 3 a 10 letras o números, sin espacios (p. ej. NAV26).') },
  event_date: { type: 'date', required: true },
  location: { type: 'text', max: 255 },
  description: { type: 'text', max: 1000 },
  max_letters_per_sponsor: { type: 'int', min: 1, max: MAX_LETTERS_PER_SPONSOR,
    message: `El límite por padrino debe estar entre 1 y ${MAX_LETTERS_PER_SPONSOR}.` }
};

const PARTICIPATION_SCHEMA = {
  area: { type: 'enum', values: VOLUNTEER_AREAS, message: 'Elige un área.' },
  status: { type: 'enum', values: PARTICIPATION_STATUSES, message: 'Elige un estatus.' },
  notes: { type: 'text', max: 255 }
};

function filters(query) {
  const c = collect();
  const f = {
    search: H.searchQuery(query.search),
    status: H.enumQuery(query.status, 'status', EVENT_STATUSES, c),
    eventType: H.enumQuery(query.event_type, 'event_type', EVENT_TYPES, c),
    orderBy: H.orderQuery(query.order_by, ['-event_date', 'event_date', 'name', '-created_at'], '-event_date', c)
  };
  c.throwIfAny();
  return f;
}

const out = (row) => ({ event: events.toEventOut(row) });
const eventId = (req) => H.idParam(req, events.NOT_FOUND);

router.get('/', (req, res) => {
  res.json(events.listEvents(parsePageParams(req.query), filters(req.query)));
});

router.post('/', needEventos, (req, res) => {
  const data = validateFields(req.body, SCHEMA);
  if (data.max_letters_per_sponsor === null) data.max_letters_per_sponsor = DEFAULT_LETTERS_PER_SPONSOR;
  res.status(201).json(out(events.createEvent(req.user, data, req.ip)));
});

router.get('/:id', (req, res) => {
  res.json(out(events.getEventOr404(eventId(req))));
});

router.patch('/:id', needEventos, (req, res) => {
  const id = eventId(req);
  const data = validateFields(req.body, SCHEMA, { partial: true });
  if (data.max_letters_per_sponsor === null) data.max_letters_per_sponsor = DEFAULT_LETTERS_PER_SPONSOR;
  res.json(out(events.updateEvent(req.user, id, data, req.ip)));
});

router.post('/:id/status', needEventos, (req, res) => {
  const id = eventId(req);
  const { to_status: toStatus } = validateFields(req.body, {
    to_status: { type: 'enum', required: true, values: EVENT_STATUSES, message: 'Elige un estatus válido.' }
  });
  res.json(out(events.changeEventStatus(req.user, id, toStatus, req.ip)));
});

router.get('/:id/volunteers', needEventos, (req, res) => {
  const id = eventId(req);
  const pageParams = parsePageParams(req.query);
  const c = collect();
  const f = {
    search: H.searchQuery(req.query.search),
    status: H.enumQuery(req.query.status, 'status', PARTICIPATION_STATUSES, c),
    area: H.enumQuery(req.query.area, 'area', VOLUNTEER_AREAS, c)
  };
  c.throwIfAny();
  res.json(events.listEventVolunteers(id, pageParams, f));
});

router.get('/:id/volunteer-options', needEventos, (req, res) => {
  res.json(events.volunteerOptions(eventId(req), H.searchQuery(req.query.search)));
});

router.post('/:id/volunteers', needEventos, (req, res) => {
  const id = eventId(req);
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { volunteer_ids: rawIds, ...rest } = body;
  const c = collect();
  let ids = [];
  if (!Array.isArray(rawIds) || rawIds.length === 0) c.add('volunteer_ids', 'Elige al menos un voluntario.');
  else {
    ids = rawIds.map(parseId);
    if (ids.some((x) => x === null)) c.add('volunteer_ids', 'Identificador no válido.');
  }
  const data = validateFields(rest, PARTICIPATION_SCHEMA, { c });
  const result = events.addEventVolunteers(req.user, id, {
    volunteerIds: ids, area: data.area, status: data.status, notes: data.notes
  }, req.ip);
  res.status(201).json(result);
});

router.patch('/:id/volunteers/:volunteerId', needEventos, (req, res) => {
  const id = eventId(req);
  const volunteerId = parseId(req.params.volunteerId);
  if (!volunteerId) throw validationError([{ field: 'volunteerId', message: 'Identificador no válido.' }]);
  const data = validateFields(req.body, PARTICIPATION_SCHEMA, { partial: true });
  if (data.area === null) throw validationError([{ field: 'area', message: 'Elige un área.' }]);
  if (data.status === null) throw validationError([{ field: 'status', message: 'Elige un estatus.' }]);
  res.json({ participation: events.toEventVolunteerOut(events.updateEventVolunteer(req.user, id, volunteerId, data, req.ip)) });
});

module.exports = router;
