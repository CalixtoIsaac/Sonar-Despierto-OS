/**
 * /api/inventory — Inventario (Fase 6, ADR-0006 y ADR-0013). Se monta con requireModule('INVENTARIO').
 *
 *   GET   /api/inventory/summary                          → { items, with_stock, low_stock, centers }
 *   GET   /api/inventory/options                          → { categories, centers, events } (activos / no cerrados)
 *
 *   GET   /api/inventory/categories                       ?page&page_size&search&is_active → paginado
 *   POST  /api/inventory/categories                       { name, description? } → 201 { category }
 *   GET   /api/inventory/categories/:id                   → { category }
 *   PATCH /api/inventory/categories/:id                   { name?, description?, is_active? } → { category }
 *
 *   GET   /api/inventory/centers                          ?page&page_size&search&is_active → paginado
 *   POST  /api/inventory/centers                          { name, address?, contact_name?, contact_phone?, notes? } → 201 { center }
 *   GET   /api/inventory/centers/:id                      → { center }
 *   PATCH /api/inventory/centers/:id                      (mismos campos + is_active) → { center }   (409 CENTER_HAS_STOCK)
 *
 *   GET   /api/inventory/items                            ?page&page_size&search&category_id&center_id&is_active
 *                                                         &stock(con|sin|bajo)&order_by → paginado con existencias
 *   GET   /api/inventory/items/export                     (mismos filtros) → CSV de existencias por centro (auditado)
 *   POST  /api/inventory/items                            { name, category_id, unit, min_stock?, description? } → 201 { item }
 *   GET   /api/inventory/items/:id                        → { item } (+ stock_by_center)
 *   PATCH /api/inventory/items/:id                        (mismos campos + is_active) → { item }
 *   GET   /api/inventory/items/:id/kardex                 ?center_id&date_from&date_to&order(asc|desc)&page&page_size → kardex
 *   GET   /api/inventory/items/:id/kardex/export          ?center_id&date_from&date_to → CSV (auditado)
 *
 *   GET   /api/inventory/movements                        ?page&page_size&item_id&center_id&direction&reason(repetible)
 *                                                         &event_id&date_from&date_to&search&mine → paginado
 *   POST  /api/inventory/movements                        { type, center_id, to_center_id?, reason?, movement_date?,
 *                                                           event_id?, counterpart?, notes?, lines: [{ item_id, quantity }] }
 *                                                         → 201 { movements }   (409 INSUFFICIENT_STOCK)
 *   GET   /api/inventory/movements/:id                    → { movement }
 *   POST  /api/inventory/movements/:id/reverse            { reason } → 201 { movements }
 */
const express = require('express');

const {
  INVENTORY_UNITS, MOVEMENT_DIRECTIONS, MOVEMENT_REASONS, MOVEMENT_TYPES, INVENTORY_MAX_QUANTITY, INVENTORY_MAX_LINES
} = require('../lib/catalogs');
const { AppError } = require('../lib/errors');
const H = require('../lib/http');
const { parsePageParams } = require('../lib/pagination');
const { collect, isIsoDate, parseId, validateFields } = require('../lib/validation');
const catalogs = require('../services/inventory-catalogs');
const items = require('../services/inventory-items');
const movements = require('../services/inventory-movements');

const router = express.Router();

const CATEGORY_SCHEMA = {
  name: { type: 'text', required: true, max: 80 },
  description: { type: 'text', max: 255 }
};
const CENTER_SCHEMA = {
  name: { type: 'text', required: true, max: 120 },
  address: { type: 'text', max: 255 },
  contact_name: { type: 'text', max: 150 },
  contact_phone: { type: 'phone' },
  notes: { type: 'text', max: 500 }
};
const ITEM_SCHEMA = {
  name: { type: 'text', required: true, max: 120 },
  category_id: { type: 'id', required: true },
  unit: { type: 'enum', required: true, values: INVENTORY_UNITS, message: 'Elige la unidad.' },
  min_stock: { type: 'int', min: 0, max: INVENTORY_MAX_QUANTITY, message: `Escribe un número entero entre 0 y ${INVENTORY_MAX_QUANTITY}.` },
  description: { type: 'text', max: 500 }
};
const ACTIVE = { is_active: { type: 'bool' } };

/** En PATCH los obligatorios no se pueden vaciar. */
function readPatch(body, schema, required) {
  const data = validateFields(body, { ...schema, ...ACTIVE }, { partial: true });
  const c = collect();
  for (const k of required) if (data[k] === null) c.add(k, 'Este campo es obligatorio.');
  c.throwIfAny();
  if (data.is_active === null) delete data.is_active;
  return data;
}

function listQuery(req) {
  const c = collect();
  const isActive = H.boolQuery(req.query.is_active, 'is_active', c);
  c.throwIfAny();
  return { search: H.searchQuery(req.query.search), isActive };
}

const dateQuery = (q, field, c) => {
  if (q[field] === undefined || q[field] === '') return undefined;
  if (!isIsoDate(q[field])) { c.add(field, 'Escribe una fecha válida (AAAA-MM-DD).'); return undefined; }
  return q[field];
};

function dateRange(q, c) {
  const dateFrom = dateQuery(q, 'date_from', c);
  const dateTo = dateQuery(q, 'date_to', c);
  if (dateFrom && dateTo && dateTo < dateFrom) c.add('date_to', 'La fecha final no puede ser anterior a la inicial.');
  return { dateFrom, dateTo };
}

// ---------- Resumen y opciones ----------
router.get('/summary', (req, res) => res.json(items.inventorySummary()));
router.get('/options', (req, res) => res.json(movements.inventoryOptions()));

// ---------- Categorías ----------
const categoryOut = (row) => ({ category: catalogs.toCategoryOut(row) });
router.get('/categories', (req, res) => {
  res.json(catalogs.listCategories(parsePageParams(req.query, { defaultPageSize: 50 }), listQuery(req)));
});
router.post('/categories', (req, res) => {
  res.status(201).json(categoryOut(catalogs.createCategory(req.user, validateFields(req.body, CATEGORY_SCHEMA), req.ip)));
});
router.get('/categories/:id', (req, res) => {
  res.json(categoryOut(catalogs.getCategoryOr404(H.idParam(req, catalogs.CATEGORY_NOT_FOUND))));
});
router.patch('/categories/:id', (req, res) => {
  const id = H.idParam(req, catalogs.CATEGORY_NOT_FOUND);
  res.json(categoryOut(catalogs.updateCategory(req.user, id, readPatch(req.body, CATEGORY_SCHEMA, ['name']), req.ip)));
});

// ---------- Centros de acopio ----------
const centerOut = (row) => ({ center: catalogs.toCenterOut(row) });
router.get('/centers', (req, res) => {
  res.json(catalogs.listCenters(parsePageParams(req.query, { defaultPageSize: 50 }), listQuery(req)));
});
router.post('/centers', (req, res) => {
  res.status(201).json(centerOut(catalogs.createCenter(req.user, validateFields(req.body, CENTER_SCHEMA), req.ip)));
});
router.get('/centers/:id', (req, res) => {
  res.json(centerOut(catalogs.getCenterOr404(H.idParam(req, catalogs.CENTER_NOT_FOUND))));
});
router.patch('/centers/:id', (req, res) => {
  const id = H.idParam(req, catalogs.CENTER_NOT_FOUND);
  res.json(centerOut(catalogs.updateCenter(req.user, id, readPatch(req.body, CENTER_SCHEMA, ['name']), req.ip)));
});

// ---------- Artículos y existencias ----------
const STOCK_FILTERS = ['CON', 'SIN', 'BAJO'];
const ITEM_ORDERS = ['name', '-name', 'stock', '-stock', 'category', '-updated_at'];

function itemFilters(req) {
  const q = req.query;
  const c = collect();
  const f = {
    search: H.searchQuery(q.search),
    categoryId: H.idQuery(q.category_id, 'category_id', c),
    centerId: H.idQuery(q.center_id, 'center_id', c),
    isActive: H.boolQuery(q.is_active, 'is_active', c),
    stock: H.enumQuery(q.stock, 'stock', STOCK_FILTERS, c),
    orderBy: H.orderQuery(q.order_by, ITEM_ORDERS, 'name', c)
  };
  c.throwIfAny();
  return f;
}

const itemOut = (row) => ({ item: items.toItemOut(row) });
const itemId = (req) => H.idParam(req, items.NOT_FOUND);

router.get('/items', (req, res) => {
  res.json(items.listItems(parsePageParams(req.query), itemFilters(req)));
});
router.get('/items/export', (req, res) => {
  const { csv } = items.exportStock(req.user, itemFilters(req), req.ip);
  H.sendCsv(res, csv, 'existencias-inventario');
});
router.post('/items', (req, res) => {
  res.status(201).json(itemOut(items.createItem(req.user, validateFields(req.body, ITEM_SCHEMA), req.ip)));
});
router.get('/items/:id', (req, res) => {
  res.json(itemOut(items.getItemOr404(itemId(req))));
});
router.patch('/items/:id', (req, res) => {
  const id = itemId(req);
  res.json(itemOut(items.updateItem(req.user, id, readPatch(req.body, ITEM_SCHEMA, ['name', 'category_id', 'unit']), req.ip)));
});

function kardexFilters(req) {
  const c = collect();
  const f = { centerId: H.idQuery(req.query.center_id, 'center_id', c) ?? null, ...dateRange(req.query, c) };
  const order = req.query.order;
  if (order !== undefined && order !== '' && !['asc', 'desc'].includes(order)) c.add('order', 'Usa asc o desc.');
  f.order = order === 'desc' ? 'desc' : 'asc';
  c.throwIfAny();
  return f;
}

router.get('/items/:id/kardex', (req, res) => {
  const id = itemId(req);
  const f = kardexFilters(req);
  res.json(items.kardex(id, f, parsePageParams(req.query, { defaultPageSize: 50 })));
});
router.get('/items/:id/kardex/export', (req, res) => {
  const id = itemId(req);
  const { csv } = items.exportKardex(req.user, id, kardexFilters(req), req.ip);
  H.sendCsv(res, csv, `kardex-articulo-${id}`);
});

// ---------- Movimientos ----------
const MOVEMENT_SCHEMA = {
  type: { type: 'enum', required: true, values: MOVEMENT_TYPES, message: 'Elige entrada, salida o traspaso.' },
  center_id: { type: 'id', required: true },
  to_center_id: { type: 'id' },
  reason: { type: 'enum', values: MOVEMENT_REASONS, message: 'Elige un motivo válido.' },
  movement_date: { type: 'date' },
  event_id: { type: 'id' },
  counterpart: { type: 'text', max: 150 },
  notes: { type: 'text', max: 500 }
  // lines: se valida aparte (readLines)
};

function readLines(raw, c) {
  if (!Array.isArray(raw) || raw.length === 0) { c.add('lines', 'Agrega al menos un artículo.'); return []; }
  if (raw.length > INVENTORY_MAX_LINES) { c.add('lines', `Registra como máximo ${INVENTORY_MAX_LINES} artículos por captura.`); return []; }
  return raw.map((line, i) => {
    const l = line && typeof line === 'object' && !Array.isArray(line) ? line : {};
    for (const k of Object.keys(l)) if (!['item_id', 'quantity'].includes(k)) c.add(`lines[${i}].${k}`, 'Campo no permitido.');
    const id = parseId(l.item_id);
    if (!id) c.add(`lines[${i}].item_id`, 'Elige el artículo.');
    const q = l.quantity;
    const n = typeof q === 'number' ? q : (typeof q === 'string' && /^\d{1,9}$/.test(q.trim()) ? Number(q.trim()) : NaN);
    if (!Number.isInteger(n) || n < 1 || n > INVENTORY_MAX_QUANTITY) {
      c.add(`lines[${i}].quantity`, `Escribe una cantidad entera entre 1 y ${INVENTORY_MAX_QUANTITY}.`);
    }
    return { item_id: id, quantity: n };
  });
}

function readMovement(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const c = collect();
  const { lines: rawLines, ...rest } = input;
  let data = {};
  try { data = validateFields(rest, MOVEMENT_SCHEMA, { c }); } catch (err) { if (!(err instanceof AppError)) throw err; }
  data.lines = readLines(rawLines, c);
  if (data.type === 'TRASPASO' && data.reason) c.add('reason', 'Un traspaso no lleva motivo.');
  c.throwIfAny();
  return data;
}

function movementFilters(req) {
  const q = req.query;
  const c = collect();
  const reasons = [].concat(q.reason ?? []).filter((v) => v !== '').map((v) => String(v).toUpperCase());
  if (reasons.some((r) => !MOVEMENT_REASONS.includes(r))) c.add('reason', 'Valor no válido.');
  const f = {
    itemId: H.idQuery(q.item_id, 'item_id', c),
    centerId: H.idQuery(q.center_id, 'center_id', c),
    direction: H.enumQuery(q.direction, 'direction', MOVEMENT_DIRECTIONS, c),
    reasons,
    eventId: H.idQuery(q.event_id, 'event_id', c),
    search: H.searchQuery(q.search),
    createdById: H.boolQuery(q.mine, 'mine', c) ? req.user.id : undefined,
    ...dateRange(q, c)
  };
  c.throwIfAny();
  return f;
}

const movementId = (req) => H.idParam(req, movements.NOT_FOUND);

router.get('/movements', (req, res) => {
  res.json(movements.listMovements(parsePageParams(req.query), movementFilters(req)));
});
router.post('/movements', (req, res) => {
  res.status(201).json(movements.createMovements(req.user, readMovement(req.body), req.ip));
});
router.get('/movements/:id', (req, res) => {
  res.json({ movement: movements.toMovementOut(movements.getMovementOr404(movementId(req))) });
});
router.post('/movements/:id/reverse', (req, res) => {
  const id = movementId(req);
  const data = validateFields(req.body, {
    reason: { type: 'text', required: true, max: 500, check: (v) => ([...v].length < 5 ? 'Escribe al menos 5 caracteres.' : null) }
  });
  res.status(201).json(movements.reverseMovement(req.user, id, data, req.ip));
});

module.exports = router;
