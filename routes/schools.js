/**
 * /api/schools — escuelas o comunidades (módulo BENEFICIARIOS; se monta con requireModule).
 *
 *   GET   /api/schools        ?page&page_size&search&zone&is_active&order_by(name|-name|created_at|-created_at)
 *   POST  /api/schools        { name, cct?, zone?, address?, contact_name?, contact_phone? }  → 201 { school }
 *   GET   /api/schools/:id    → { school }
 *   PATCH /api/schools/:id    (mismos campos + is_active)                                      → { school }
 */
const express = require('express');

const H = require('../lib/http');
const { parsePageParams } = require('../lib/pagination');
const { collect, validateFields } = require('../lib/validation');
const schools = require('../services/schools');

const router = express.Router();

const CCT_RE = /^\d{2}[A-Z]{3}\d{4}[A-Z]$/;
const SCHEMA = {
  name: { type: 'text', required: true, max: 150 },
  cct: { type: 'text', max: 15, check: (v) => (CCT_RE.test(v.toUpperCase()) ? null : 'La CCT tiene 10 caracteres, por ejemplo 30EPR0001A.') },
  zone: { type: 'text', max: 100 },
  address: { type: 'text', max: 255 },
  contact_name: { type: 'text', max: 150 },
  contact_phone: { type: 'phone' }
};

const out = (row) => ({ school: schools.toSchoolOut(row) });

router.get('/', (req, res) => {
  const pageParams = parsePageParams(req.query);
  const c = collect();
  const isActive = H.boolQuery(req.query.is_active, 'is_active', c);
  const orderBy = H.orderQuery(req.query.order_by, ['name', '-name', 'created_at', '-created_at'], 'name', c);
  c.throwIfAny();
  const zone = typeof req.query.zone === 'string' ? req.query.zone.trim().slice(0, 100) : '';
  res.json(schools.listSchools(pageParams, { search: H.searchQuery(req.query.search), zone, isActive, orderBy }));
});

router.post('/', (req, res) => {
  const data = validateFields(req.body, SCHEMA);
  res.status(201).json(out(schools.createSchool(req.user, data, req.ip)));
});

router.get('/:id', (req, res) => {
  res.json(out(schools.getSchoolOr404(H.idParam(req, schools.NOT_FOUND))));
});

router.patch('/:id', (req, res) => {
  const id = H.idParam(req, schools.NOT_FOUND);
  const data = validateFields(req.body, { ...SCHEMA, is_active: { type: 'bool' } }, { partial: true });
  res.json(out(schools.updateSchool(req.user, id, data, req.ip)));
});

module.exports = router;
