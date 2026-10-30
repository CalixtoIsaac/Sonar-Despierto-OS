/**
 * /api/volunteers — voluntarios (módulo VOLUNTARIOS; se monta con requireModule).
 *
 *   GET   /api/volunteers           ?page&page_size&search&area&shirt_size&is_active&order_by
 *   GET   /api/volunteers/summary   (mismos filtros) → { total, shirt_sizes, areas }
 *   GET   /api/volunteers/export    (mismos filtros) → text/csv (registra DATA_EXPORTED)
 *   POST  /api/volunteers           VolunteerCreate (accepts_privacy: true) → 201 { volunteer }
 *   GET   /api/volunteers/:id       → { volunteer }
 *   PATCH /api/volunteers/:id       (mismos campos + is_active) → { volunteer }
 */
const express = require('express');

const { SHIRT_SIZES, VOLUNTEER_AREAS, VOLUNTEER_MIN_AGE } = require('../lib/catalogs');
const H = require('../lib/http');
const { parsePageParams } = require('../lib/pagination');
const { ageOn } = require('../lib/text');
const { collect, validateFields } = require('../lib/validation');
const volunteers = require('../services/volunteers');

const router = express.Router();

const birthCheck = (v) => {
  const age = ageOn(v);
  if (age === null || age > 100) return 'Escribe una fecha de nacimiento válida.';
  return age < VOLUNTEER_MIN_AGE ? `La persona voluntaria debe tener al menos ${VOLUNTEER_MIN_AGE} años.` : null;
};

const SCHEMA = {
  first_name: { type: 'text', required: true, max: 80 },
  last_name: { type: 'text', required: true, max: 120 },
  email: { type: 'email' },
  phone: { type: 'phone', required: true },
  birth_date: { type: 'date', check: birthCheck },
  city: { type: 'text', max: 100 },
  occupation: { type: 'text', max: 100 },
  emergency_contact_name: { type: 'text', required: true, max: 150 },
  emergency_contact_phone: { type: 'phone', required: true },
  emergency_contact_relationship: { type: 'text', max: 50 },
  shirt_size: { type: 'enum', required: true, values: SHIRT_SIZES, message: 'Elige una talla.' },
  area_of_interest: { type: 'enum', required: true, values: VOLUNTEER_AREAS, message: 'Elige un área.' },
  medical_notes: { type: 'text', max: 500 },
  notes: { type: 'text', max: 500 }
};

function filters(query) {
  const c = collect();
  const f = {
    search: H.searchQuery(query.search),
    area: H.enumQuery(query.area, 'area', VOLUNTEER_AREAS, c),
    shirtSize: H.enumQuery(query.shirt_size, 'shirt_size', SHIRT_SIZES, c),
    isActive: H.boolQuery(query.is_active, 'is_active', c),
    orderBy: H.orderQuery(query.order_by, ['name', '-name', 'created_at', '-created_at'], 'name', c)
  };
  c.throwIfAny();
  return f;
}

const out = (row) => ({ volunteer: volunteers.toVolunteerOut(row) });

router.get('/', (req, res) => {
  const pageParams = parsePageParams(req.query);
  res.json(volunteers.listVolunteers(pageParams, filters(req.query)));
});

router.get('/summary', (req, res) => {
  res.json(volunteers.volunteersSummary(filters(req.query)));
});

router.get('/export', (req, res) => {
  const { csv } = volunteers.exportVolunteers(req.user, filters(req.query), req.ip);
  H.sendCsv(res, csv, 'voluntarios');
});

router.post('/', (req, res) => {
  const c = collect();
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { accepts_privacy: privacy, ...rest } = body;
  if (privacy !== true) c.add('accepts_privacy', 'Confirma que la persona aceptó el aviso de privacidad.');
  const data = validateFields(rest, SCHEMA, { c });
  res.status(201).json(out(volunteers.createVolunteer(req.user, data, req.ip)));
});

router.get('/:id', (req, res) => {
  res.json(out(volunteers.getVolunteerOr404(H.idParam(req, volunteers.NOT_FOUND))));
});

router.patch('/:id', (req, res) => {
  const id = H.idParam(req, volunteers.NOT_FOUND);
  const data = validateFields(req.body, { ...SCHEMA, is_active: { type: 'bool' } }, { partial: true });
  res.json(out(volunteers.updateVolunteer(req.user, id, data, req.ip)));
});

module.exports = router;
