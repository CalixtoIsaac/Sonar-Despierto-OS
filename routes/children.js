/**
 * /api/children — niñas y niños beneficiarios (módulo BENEFICIARIOS; se monta con requireModule).
 * Datos sensibles de menores: solo con el permiso BENEFICIARIOS (o ADMIN).
 *
 *   GET   /api/children          ?page&page_size&search&school_id(id|none)&tutor_id&gender&consent&is_active&order_by
 *   GET   /api/children/export   (mismos filtros) → text/csv (registra DATA_EXPORTED)
 *   POST  /api/children          ChildCreate → 201 { child }   (409 DUPLICATE_CHILD con existing_id)
 *   GET   /api/children/:id      → { child }
 *   PATCH /api/children/:id      (mismos campos + is_active) → { child }
 */
const express = require('express');

const { GENDERS, CHILD_MAX_AGE } = require('../lib/catalogs');
const H = require('../lib/http');
const { parsePageParams } = require('../lib/pagination');
const { ageOn } = require('../lib/text');
const { collect, validateFields } = require('../lib/validation');
const children = require('../services/children');

const router = express.Router();

const AGE_MESSAGE = `La fecha de nacimiento debe corresponder a una niña o niño de 0 a ${CHILD_MAX_AGE} años.`;
const birthCheck = (v) => {
  const age = ageOn(v);
  return age === null || age < 0 || age > CHILD_MAX_AGE ? AGE_MESSAGE : null;
};

const SCHEMA = {
  first_name: { type: 'text', required: true, max: 80 },
  last_name: { type: 'text', required: true, max: 120 },
  birth_date: { type: 'date', required: true, check: birthCheck },
  gender: { type: 'enum', values: GENDERS, message: 'Elige una opción.' },
  school_id: { type: 'id' },
  grade: { type: 'text', max: 20 },
  group_name: { type: 'text', max: 10 },
  tutor_id: { type: 'id' },
  guardian_name: { type: 'text', required: true, max: 150 },
  guardian_relationship: { type: 'text', max: 50 },
  guardian_phone: { type: 'phone' },
  guardian_consent: { type: 'bool' },
  notes: { type: 'text', max: 500 }
};

function filters(query) {
  const c = collect();
  const f = {
    search: H.searchQuery(query.search),
    schoolId: H.idQuery(query.school_id, 'school_id', c, { allowNone: true }),
    tutorId: H.idQuery(query.tutor_id, 'tutor_id', c),
    gender: H.enumQuery(query.gender, 'gender', GENDERS, c),
    consent: H.boolQuery(query.consent, 'consent', c),
    isActive: H.boolQuery(query.is_active, 'is_active', c),
    orderBy: H.orderQuery(query.order_by, ['name', '-name', 'created_at', '-created_at', 'birth_date', '-birth_date'], 'name', c)
  };
  c.throwIfAny();
  return f;
}

const out = (row) => ({ child: children.toChildOut(row) });

router.get('/', (req, res) => {
  const pageParams = parsePageParams(req.query);
  res.json(children.listChildren(pageParams, filters(req.query)));
});

router.get('/export', (req, res) => {
  const { csv } = children.exportChildren(req.user, filters(req.query), req.ip);
  H.sendCsv(res, csv, 'ninos');
});

router.post('/', (req, res) => {
  const data = validateFields(req.body, SCHEMA);
  if (data.gender === null) delete data.gender;
  if (data.guardian_consent === null) delete data.guardian_consent;
  res.status(201).json(out(children.createChild(req.user, data, req.ip)));
});

router.get('/:id', (req, res) => {
  res.json(out(children.getChildOr404(H.idParam(req, children.NOT_FOUND))));
});

router.patch('/:id', (req, res) => {
  const id = H.idParam(req, children.NOT_FOUND);
  const data = validateFields(req.body, { ...SCHEMA, is_active: { type: 'bool' } }, { partial: true });
  if (data.gender === null) data.gender = 'NO_ESPECIFICA';
  if (data.guardian_consent === null) delete data.guardian_consent;
  res.json(out(children.updateChild(req.user, id, data, req.ip)));
});

module.exports = router;
