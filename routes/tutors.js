/**
 * /api/tutors — tutores responsables (módulo BENEFICIARIOS; se monta con requireModule).
 *
 *   GET   /api/tutors        ?page&page_size&search&school_id&is_active&order_by
 *   POST  /api/tutors        { first_name, last_name, phone, email?, position?, school_id?, notes? } → 201 { tutor }
 *   GET   /api/tutors/:id    → { tutor }
 *   PATCH /api/tutors/:id    (mismos campos + is_active) → { tutor }
 */
const express = require('express');

const H = require('../lib/http');
const { parsePageParams } = require('../lib/pagination');
const { collect, validateFields } = require('../lib/validation');
const tutors = require('../services/tutors');

const router = express.Router();

const SCHEMA = {
  first_name: { type: 'text', required: true, max: 80 },
  last_name: { type: 'text', required: true, max: 120 },
  phone: { type: 'phone', required: true },
  email: { type: 'email' },
  position: { type: 'text', max: 80 },
  school_id: { type: 'id' },
  notes: { type: 'text', max: 500 }
};

const out = (row) => ({ tutor: tutors.toTutorOut(row) });

router.get('/', (req, res) => {
  const pageParams = parsePageParams(req.query);
  const c = collect();
  const schoolId = H.idQuery(req.query.school_id, 'school_id', c);
  const isActive = H.boolQuery(req.query.is_active, 'is_active', c);
  const orderBy = H.orderQuery(req.query.order_by, ['name', '-name', 'created_at', '-created_at'], 'name', c);
  c.throwIfAny();
  res.json(tutors.listTutors(pageParams, { search: H.searchQuery(req.query.search), schoolId, isActive, orderBy }));
});

router.post('/', (req, res) => {
  const data = validateFields(req.body, SCHEMA);
  res.status(201).json(out(tutors.createTutor(req.user, data, req.ip)));
});

router.get('/:id', (req, res) => {
  res.json(out(tutors.getTutorOr404(H.idParam(req, tutors.NOT_FOUND))));
});

router.patch('/:id', (req, res) => {
  const id = H.idParam(req, tutors.NOT_FOUND);
  const data = validateFields(req.body, { ...SCHEMA, is_active: { type: 'bool' } }, { partial: true });
  res.json(out(tutors.updateTutor(req.user, id, data, req.ip)));
});

module.exports = router;
