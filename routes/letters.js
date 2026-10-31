/**
 * /api/letters — cartas de Navidad (módulo CARTAS; se monta con requireModule).
 *
 *   GET    /api/letters                     ?page&page_size&event_id&status&school_id(id|none)&sponsor_id&gender&has_photo&search&order_by
 *   GET    /api/letters/summary             (mismos filtros, sin status) → { total, by_status, by_school }
 *   GET    /api/letters/export              (mismos filtros) → text/csv (registra DATA_EXPORTED)
 *   GET    /api/letters/eligible-children   ?event_id&search → { items: [{ child, eligible, reason, letter }] }
 *   GET    /api/letters/sponsor-options     ?event_id&search → { items: [{ volunteer, letters_in_event, limit }] }
 *   GET    /api/letters/by-code/:code       → { letter }
 *   POST   /api/letters                     LetterCreate → 201 { letter }
 *   GET    /api/letters/:id                 → { letter }
 *   PATCH  /api/letters/:id                 { main_wish?, secondary_wish?, letter_text?, gift_notes?, version? } → { letter }
 *   GET    /api/letters/:id/history         → { items }
 *   POST   /api/letters/:id/assign          { volunteer_id, version, comment? } → { letter }
 *   POST   /api/letters/:id/release         { version, comment? } → { letter }
 *   POST   /api/letters/:id/status          { to_status, version, comment?, gift_notes? } → { letter }
 *   POST   /api/letters/:id/photo           (cuerpo = imagen JPG/PNG/WEBP) → { letter }
 *   GET    /api/letters/:id/photo           → la imagen (sin caché)
 *   DELETE /api/letters/:id/photo           → { letter }
 */
const fs = require('fs');
const express = require('express');

const { GENDERS, LETTER_STATUSES } = require('../lib/catalogs');
const { getConfig } = require('../lib/config');
const { AppError, validationError } = require('../lib/errors');
const H = require('../lib/http');
const { parsePageParams } = require('../lib/pagination');
const { collect, validateFields } = require('../lib/validation');
const letters = require('../services/letters');

const router = express.Router();

const VERSION = { type: 'int', required: true, min: 1, max: 1e9, message: 'Falta la versión de la carta: actualiza la página.' };
const COMMENT = { type: 'text', max: 255 };

const CREATE_SCHEMA = {
  event_id: { type: 'id', required: true },
  child_id: { type: 'id', required: true },
  main_wish: { type: 'text', required: true, max: 255 },
  secondary_wish: { type: 'text', max: 255 },
  letter_text: { type: 'text', max: 4000 },
  gift_notes: { type: 'text', max: 500 }
};

const EDIT_SCHEMA = {
  main_wish: { type: 'text', required: true, max: 255 },
  secondary_wish: { type: 'text', max: 255 },
  letter_text: { type: 'text', max: 4000 },
  gift_notes: { type: 'text', max: 500 },
  version: { type: 'int', min: 1, max: 1e9 }
};

function filters(query) {
  const c = collect();
  const f = {
    eventId: H.idQuery(query.event_id, 'event_id', c),
    status: H.enumQuery(query.status, 'status', LETTER_STATUSES, c),
    schoolId: H.idQuery(query.school_id, 'school_id', c, { allowNone: true }),
    sponsorId: H.idQuery(query.sponsor_id, 'sponsor_id', c),
    gender: H.enumQuery(query.gender, 'gender', GENDERS, c),
    hasPhoto: H.boolQuery(query.has_photo, 'has_photo', c),
    search: H.searchQuery(query.search),
    orderBy: H.orderQuery(query.order_by, ['code', '-code', 'child', '-created_at', '-updated_at'], 'code', c)
  };
  c.throwIfAny();
  return f;
}

function requiredEventId(query) {
  const c = collect();
  const id = H.idQuery(query.event_id, 'event_id', c);
  if (!id && !c.has('event_id')) c.add('event_id', 'Elige un evento.');
  c.throwIfAny();
  return id;
}

const viewer = (req) => letters.viewerOf(req.user);
const out = (req, row) => ({ letter: letters.toLetterOut(row, viewer(req)) });
const letterId = (req) => H.idParam(req, letters.NOT_FOUND);

router.get('/', (req, res) => {
  const pageParams = parsePageParams(req.query);
  res.json(letters.listLetters(viewer(req), pageParams, filters(req.query)));
});

router.get('/summary', (req, res) => {
  res.json(letters.lettersSummary(filters(req.query)));
});

router.get('/export', (req, res) => {
  const { csv } = letters.exportLetters(req.user, viewer(req), filters(req.query), req.ip);
  H.sendCsv(res, csv, 'cartas');
});

router.get('/eligible-children', (req, res) => {
  res.json(letters.eligibleChildren(viewer(req), requiredEventId(req.query), H.searchQuery(req.query.search)));
});

router.get('/sponsor-options', (req, res) => {
  res.json(letters.sponsorOptions(requiredEventId(req.query), H.searchQuery(req.query.search)));
});

router.get('/by-code/:code', (req, res) => {
  res.json(out(req, letters.getByCode(String(req.params.code).slice(0, 40))));
});

router.post('/', (req, res) => {
  const data = validateFields(req.body, CREATE_SCHEMA);
  res.status(201).json(out(req, letters.createLetter(req.user, data, req.ip)));
});

router.get('/:id', (req, res) => {
  res.json(out(req, letters.getLetterOr404(letterId(req))));
});

router.patch('/:id', (req, res) => {
  const id = letterId(req);
  const data = validateFields(req.body, EDIT_SCHEMA, { partial: true });
  if (Object.keys(data).length === 1 && data.version !== undefined) {
    throw validationError([{ field: 'body', message: 'Envía al menos un campo para actualizar.' }]);
  }
  res.json(out(req, letters.updateLetter(req.user, id, data, req.ip)));
});

router.get('/:id/history', (req, res) => {
  res.json(letters.letterHistory(letterId(req)));
});

router.post('/:id/assign', (req, res) => {
  const id = letterId(req);
  const data = validateFields(req.body, { volunteer_id: { type: 'id', required: true }, version: VERSION, comment: COMMENT });
  res.json(out(req, letters.assignSponsor(req.user, id,
    { volunteerId: data.volunteer_id, version: data.version, comment: data.comment }, req.ip)));
});

router.post('/:id/release', (req, res) => {
  const id = letterId(req);
  const data = validateFields(req.body, { version: VERSION, comment: COMMENT });
  res.json(out(req, letters.releaseSponsor(req.user, id, { version: data.version, comment: data.comment }, req.ip)));
});

router.post('/:id/status', (req, res) => {
  const id = letterId(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const data = validateFields(body, {
    to_status: { type: 'enum', required: true, values: ['RECIBIDO', 'ENTREGADO', 'ASIGNADO'],
      message: 'Elige "RECIBIDO", "ENTREGADO" o "ASIGNADO" (corrección).' },
    version: VERSION, comment: COMMENT, gift_notes: { type: 'text', max: 500 }
  });
  res.json(out(req, letters.changeStatus(req.user, id, {
    toStatus: data.to_status, version: data.version, comment: data.comment,
    giftNotes: Object.prototype.hasOwnProperty.call(body, 'gift_notes') ? data.gift_notes : undefined
  }, req.ip)));
});

// ---------- Foto ----------
const config = getConfig();
const rawImage = express.raw({ type: ['image/*', 'application/octet-stream'], limit: config.maxUploadMb * 1024 * 1024 });
function receiveImage(req, res, next) {
  rawImage(req, res, (err) => {
    if (err && err.type === 'entity.too.large') {
      return next(new AppError(413, 'FILE_TOO_LARGE', `La foto pesa más de ${config.maxUploadMb} MB.`));
    }
    next(err);
  });
}

router.post('/:id/photo', receiveImage, (req, res) => {
  const id = letterId(req);
  res.json(out(req, letters.savePhoto(req.user, id, Buffer.isBuffer(req.body) ? req.body : null, req.ip)));
});

router.get('/:id/photo', (req, res) => {
  const file = letters.photoFile(letterId(req));
  res.set({ 'Content-Type': file.mime, 'Cache-Control': 'no-store', 'Content-Disposition': 'inline' });
  res.send(fs.readFileSync(file.path));
});

router.delete('/:id/photo', (req, res) => {
  res.json(out(req, letters.removePhoto(req.user, letterId(req), req.ip)));
});

module.exports = router;
