/**
 * Artículos del Inventario y sus existencias (Fase 6, ADR-0006 y ADR-0013).
 *
 * - Las existencias NUNCA se guardan ni se editan: se calculan de inventory_movements
 *   (SUM(entradas) − SUM(salidas)) por artículo y centro de acopio.
 * - Duplicado: mismo nombre (sin acentos) en la misma categoría → 409 DUPLICATE_ITEM.
 * - La unidad no se cambia si el artículo ya tiene movimientos → 400 ITEM_UNIT_LOCKED.
 * - Un artículo con existencias no se da de baja → 409 ITEM_HAS_STOCK.
 * - Kardex: movimientos en orden cronológico (fecha, id) con saldo acumulado.
 */
const { getDb, toIso } = require('../lib/db');
const { INVENTORY_UNIT_LABELS, MOVEMENT_DIRECTION_LABELS, MOVEMENT_REASON_LABELS } = require('../lib/catalogs');
const { AppError } = require('../lib/errors');
const { paginate } = require('../lib/pagination');
const { toCsv } = require('../lib/csv');
const { normalizeKey } = require('../lib/text');
const R = require('./records');
const catalogs = require('./inventory-catalogs');

const TABLE = 'inventory_items';
const NOT_FOUND = 'No existe un artículo con ese identificador.';
const EXPORT_LIMIT = 10000;

const SIGNED = "CASE m.direction WHEN 'ENTRADA' THEN m.quantity ELSE -m.quantity END";
const stockOf = (itemExpr, centerParam) => `(SELECT COALESCE(SUM(${SIGNED}), 0) FROM inventory_movements m
  WHERE m.item_id = ${itemExpr}${centerParam ? ` AND m.center_id = ${centerParam}` : ''})`;

/** Subconsulta x con las columnas del artículo, su categoría y sus existencias (total y en @center si se pide). */
function itemsFrom(withCenter) {
  return `(SELECT i.*, c.name AS c_name, c.is_active AS c_active,
      ${stockOf('i.id')} AS total_stock,
      ${withCenter ? stockOf('i.id', '@center') : 'NULL'} AS center_stock,
      (SELECT COUNT(*) FROM (SELECT m.center_id FROM inventory_movements m WHERE m.item_id = i.id
         GROUP BY m.center_id HAVING SUM(${SIGNED}) <> 0)) AS centers_count,
      (SELECT COUNT(*) FROM inventory_movements m WHERE m.item_id = i.id) AS movements_count,
      (SELECT MAX(m.movement_date) FROM inventory_movements m WHERE m.item_id = i.id) AS last_movement_date
    FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id) x`;
}

function getItem(id, db = getDb()) {
  return db.prepare(`SELECT x.* FROM ${itemsFrom(false)} WHERE x.id = ?`).get(id) || null;
}

function getItemOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getItem(id, db) : null;
  if (!row) throw R.notFound(NOT_FOUND);
  return row;
}

const isLow = (row) => row.min_stock > 0 && Number(row.total_stock) < row.min_stock;

function toItemListItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: { id: row.category_id, name: row.c_name, is_active: Boolean(row.c_active) },
    unit: row.unit,
    min_stock: row.min_stock,
    description: row.description ?? null,
    is_active: Boolean(row.is_active),
    total_stock: Number(row.total_stock || 0),
    center_stock: row.center_stock === null || row.center_stock === undefined ? null : Number(row.center_stock),
    low_stock: isLow(row),
    centers_count: Number(row.centers_count || 0),
    movements_count: Number(row.movements_count || 0),
    last_movement_date: row.last_movement_date ?? null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

/** Existencias por centro (solo los centros donde el artículo ha tenido movimientos). */
function stockByCenter(itemId, db = getDb()) {
  return db.prepare(`SELECT cc.id, cc.name, cc.is_active, SUM(${SIGNED}) AS stock, MAX(m.movement_date) AS last_movement_date
      FROM inventory_movements m JOIN collection_centers cc ON cc.id = m.center_id
      WHERE m.item_id = ? GROUP BY cc.id ORDER BY stock DESC, cc.name_key`).all(itemId)
    .map((r) => ({ center: { id: r.id, name: r.name, is_active: Boolean(r.is_active) }, stock: Number(r.stock),
      last_movement_date: r.last_movement_date }));
}

function toItemOut(row, db = getDb()) {
  const out = toItemListItem(row);
  delete out.center_stock;
  return { ...out, stock_by_center: stockByCenter(row.id, db) };
}

const toItemRef = (row) => ({ id: row.id, name: row.name, unit: row.unit, is_active: Boolean(row.is_active) });

/** Existencia de un artículo en un centro (o en total si centerId es null). */
function currentStock(itemId, centerId = null, db = getDb()) {
  const sql = `SELECT ${stockOf('@item', centerId ? '@center' : null)} AS n`;
  return Number(db.prepare(sql).get(centerId ? { item: itemId, center: centerId } : { item: itemId }).n);
}

// ---------------------------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------------------------

function checkDuplicate(categoryId, nameKey, excludeId, db) {
  const dup = db.prepare('SELECT id FROM inventory_items WHERE category_id = ? AND name_key = ? AND id <> ?')
    .get(categoryId, nameKey, excludeId ?? -1);
  if (dup) throw R.duplicateError('DUPLICATE_ITEM', 'Ya existe un artículo con ese nombre en esa categoría.', dup.id);
}

const FIELDS = ['name', 'category_id', 'unit', 'min_stock', 'description'];

function createItem(actor, data, ip, db = getDb()) {
  const row = { name_key: normalizeKey(data.name) };
  for (const k of FIELDS) row[k] = data[k] ?? null;
  if (row.min_stock === null) row.min_stock = 0;
  const id = db.transaction(() => {
    catalogs.assertCategoryAssignable(row.category_id, {}, db);
    checkDuplicate(row.category_id, row.name_key, null, db);
    return R.insertRecord({ table: TABLE, entity: TABLE, row, actor, ip }, db);
  })();
  return getItem(id, db);
}

function updateItem(actor, id, data, ip, db = getDb()) {
  let itemId;
  db.transaction(() => {
    const existing = getItemOr404(id, db);
    itemId = existing.id;
    const patch = {};
    for (const k of [...FIELDS, 'is_active']) if (data[k] !== undefined) patch[k] = data[k];
    if (patch.min_stock === null) patch.min_stock = 0;
    if (patch.name !== undefined) patch.name_key = normalizeKey(patch.name);
    if (patch.category_id !== undefined && patch.category_id !== existing.category_id) {
      catalogs.assertCategoryAssignable(patch.category_id, { currentId: existing.category_id }, db);
    }
    if (patch.name_key !== undefined || patch.category_id !== undefined) {
      checkDuplicate(patch.category_id ?? existing.category_id, patch.name_key ?? existing.name_key, existing.id, db);
    }
    if (patch.unit !== undefined && patch.unit !== existing.unit && Number(existing.movements_count) > 0) {
      throw new AppError(400, 'ITEM_UNIT_LOCKED',
        'El artículo ya tiene movimientos: su unidad no se puede cambiar. Si se cuenta distinto, registra un artículo nuevo.');
    }
    if (patch.is_active === false && existing.is_active && Number(existing.total_stock) !== 0) {
      throw new AppError(409, 'ITEM_HAS_STOCK',
        `Todavía hay ${existing.total_stock} en existencia. Regístralas como salida antes de dar de baja el artículo.`,
        { extra: { total_stock: Number(existing.total_stock) } });
    }
    R.updateRecord({ table: TABLE, entity: TABLE, existing, patch, actor, ip }, db);
  }).immediate();
  return getItem(itemId, db);
}

// ---------------------------------------------------------------------------------------------
// Listado de existencias
// ---------------------------------------------------------------------------------------------

const ORDER = {
  name: 'x.name_key ASC, x.id ASC',
  '-name': 'x.name_key DESC, x.id DESC',
  stock: 'stock ASC, x.name_key ASC, x.id ASC',
  '-stock': 'stock DESC, x.name_key ASC, x.id ASC',
  category: 'x.c_name ASC, x.name_key ASC, x.id ASC',
  '-updated_at': 'x.updated_at DESC, x.id DESC'
};

function filterClause({ search, categoryId, centerId, isActive, stock } = {}) {
  const where = [];
  const params = {};
  const s = R.searchClause(search, ['x.name_key', 'lower(x.description)']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  if (categoryId) { where.push('x.category_id = @category'); params.category = categoryId; }
  if (centerId) params.center = centerId;
  R.activeClause('x', isActive, where, params);
  const stockCol = centerId ? 'x.center_stock' : 'x.total_stock';
  if (stock === 'CON') where.push(`${stockCol} > 0`);
  if (stock === 'SIN') where.push(`${stockCol} = 0`);
  if (stock === 'BAJO') where.push('x.min_stock > 0 AND x.total_stock < x.min_stock');
  return { where: where.join(' AND '), params, stockCol };
}

/**
 * filtros: { search, categoryId, centerId, isActive, stock: CON | SIN | BAJO, orderBy }
 * Con centerId, cada artículo trae center_stock (existencia en ese centro) y los filtros de stock usan ese valor.
 */
function listItems(pageParams, filters = {}, db = getDb()) {
  const { where, params, stockCol } = filterClause(filters);
  return paginate(db, {
    select: `x.*, ${stockCol} AS stock`,
    from: itemsFrom(Boolean(filters.centerId)), where, params,
    orderBy: ORDER[filters.orderBy] || ORDER.name, map: toItemListItem
  }, pageParams);
}

/** Resumen para el encabezado del Inventario. */
function inventorySummary(db = getDb()) {
  const row = db.prepare(`SELECT COUNT(*) AS items,
      SUM(CASE WHEN x.total_stock > 0 THEN 1 ELSE 0 END) AS with_stock,
      SUM(CASE WHEN x.min_stock > 0 AND x.total_stock < x.min_stock THEN 1 ELSE 0 END) AS low_stock
    FROM ${itemsFrom(false)} WHERE x.is_active = 1`).get();
  const centers = db.prepare('SELECT COUNT(*) AS n FROM collection_centers WHERE is_active = 1').get().n;
  return { items: row.items || 0, with_stock: row.with_stock || 0, low_stock: row.low_stock || 0, centers };
}

const STOCK_CSV = [
  { header: 'Artículo', value: (r) => r.name },
  { header: 'Categoría', value: (r) => r.c_name },
  { header: 'Unidad', value: (r) => INVENTORY_UNIT_LABELS[r.unit] },
  { header: 'Centro de acopio', value: (r) => r.center_name },
  { header: 'Existencia en el centro', value: (r) => Number(r.center_stock) },
  { header: 'Existencia total', value: (r) => Number(r.total_stock) },
  { header: 'Existencia mínima', value: (r) => r.min_stock || '' },
  { header: 'Existencia baja', value: (r) => isLow(r) },
  { header: 'Último movimiento', value: (r) => r.last_movement_date || '' }
];

/** CSV de existencias: una fila por artículo y centro con existencia ≠ 0 (con los filtros del listado). Se audita. */
function exportStock(actor, filters, ip, db = getDb()) {
  const { where, params } = filterClause({ ...filters, centerId: null, stock: filters.stock === 'BAJO' ? 'BAJO' : null });
  const centerWhere = filters.centerId ? 'AND cc.id = @center' : '';
  const rows = db.prepare(`SELECT x.*, cc.name AS center_name, s.stock AS center_stock
      FROM ${itemsFrom(false)}
      JOIN (SELECT m.item_id, m.center_id, SUM(${SIGNED}) AS stock FROM inventory_movements m
            GROUP BY m.item_id, m.center_id HAVING SUM(${SIGNED}) <> 0) s ON s.item_id = x.id
      JOIN collection_centers cc ON cc.id = s.center_id ${centerWhere}
      ${where ? `WHERE ${where}` : ''}
      ORDER BY x.c_name, x.name_key, cc.name_key LIMIT ${EXPORT_LIMIT}`)
    .all({ ...params, ...(filters.centerId ? { center: filters.centerId } : {}) });
  R.recordExport({ entity: TABLE, count: rows.length, actor, ip, filters: {
    search: filters.search, category_id: filters.categoryId, center_id: filters.centerId, is_active: filters.isActive,
    stock: filters.stock } }, db);
  return { csv: toCsv(STOCK_CSV, rows), count: rows.length };
}

// ---------------------------------------------------------------------------------------------
// Kardex
// ---------------------------------------------------------------------------------------------

/** Subconsulta con el saldo acumulado (por centro si se pide; si no, del artículo en todos los centros). */
function kardexFrom(withCenter) {
  return `(SELECT m.*, ${SIGNED} AS signed,
      SUM(${SIGNED}) OVER (ORDER BY m.movement_date, m.id ROWS UNBOUNDED PRECEDING) AS balance
    FROM inventory_movements m WHERE m.item_id = @item${withCenter ? ' AND m.center_id = @center' : ''}) k`;
}

const KARDEX_JOINS = `
  JOIN collection_centers cc ON cc.id = k.center_id
  LEFT JOIN events e ON e.id = k.event_id
  LEFT JOIN users u ON u.id = k.created_by_id
  LEFT JOIN inventory_movements rv ON rv.reverses_id = k.id
  LEFT JOIN inventory_movements tp ON tp.transfer_id = k.transfer_id AND tp.id <> k.id
  LEFT JOIN collection_centers tpc ON tpc.id = tp.center_id`;
const KARDEX_SELECT = `k.*, cc.name AS cc_name, cc.is_active AS cc_active, e.name AS e_name,
  u.first_name AS u_first_name, u.last_name AS u_last_name, rv.id AS reversed_by_id,
  tpc.id AS peer_center_id, tpc.name AS peer_center_name`;

function toKardexRow(row) {
  return {
    id: row.id,
    movement_date: row.movement_date,
    direction: row.direction,
    reason: row.reason,
    quantity: row.quantity,
    in: row.direction === 'ENTRADA' ? row.quantity : 0,
    out: row.direction === 'SALIDA' ? row.quantity : 0,
    balance: Number(row.balance),
    center: { id: row.center_id, name: row.cc_name, is_active: Boolean(row.cc_active) },
    peer_center: row.peer_center_id ? { id: row.peer_center_id, name: row.peer_center_name } : null,
    event: row.event_id ? { id: row.event_id, name: row.e_name } : null,
    counterpart: row.counterpart ?? null,
    notes: row.notes ?? null,
    transfer_id: row.transfer_id ?? null,
    reverses_id: row.reverses_id ?? null,
    reversed_by_id: row.reversed_by_id ?? null,
    created_by: row.created_by_id && row.u_first_name ? { id: row.created_by_id, full_name: `${row.u_first_name} ${row.u_last_name}` } : null,
    created_at: toIso(row.created_at)
  };
}

function kardexWhere({ dateFrom, dateTo }) {
  const where = [];
  const params = {};
  if (dateFrom) { where.push('k.movement_date >= @from'); params.from = dateFrom; }
  if (dateTo) { where.push('k.movement_date <= @to'); params.to = dateTo; }
  return { where: where.join(' AND '), params };
}

/** Saldo inicial (antes de dateFrom), entradas y salidas del periodo y saldo final (al cierre de dateTo). */
function kardexTotals(itemId, centerId, { dateFrom, dateTo }, db) {
  const base = { item: itemId, ...(centerId ? { center: centerId } : {}) };
  const centerSql = centerId ? ' AND m.center_id = @center' : '';
  const row = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN @from IS NOT NULL AND m.movement_date < @from THEN ${SIGNED} ELSE 0 END), 0) AS opening,
      COALESCE(SUM(CASE WHEN (@from IS NULL OR m.movement_date >= @from) AND (@to IS NULL OR m.movement_date <= @to)
        AND m.direction = 'ENTRADA' THEN m.quantity ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN (@from IS NULL OR m.movement_date >= @from) AND (@to IS NULL OR m.movement_date <= @to)
        AND m.direction = 'SALIDA' THEN m.quantity ELSE 0 END), 0) AS total_out,
      COALESCE(SUM(CASE WHEN @to IS NULL OR m.movement_date <= @to THEN ${SIGNED} ELSE 0 END), 0) AS closing,
      COALESCE(SUM(${SIGNED}), 0) AS current
    FROM inventory_movements m WHERE m.item_id = @item${centerSql}`)
    .get({ ...base, from: dateFrom ?? null, to: dateTo ?? null });
  return {
    opening_balance: Number(row.opening), total_in: Number(row.total_in), total_out: Number(row.total_out),
    closing_balance: Number(row.closing), current_stock: Number(row.current)
  };
}

/**
 * Kardex de un artículo: { item, center, opening_balance, total_in, total_out, closing_balance, current_stock,
 *   items: KardexRow[], total, page, page_size, pages }.  order: 'asc' (cronológico) | 'desc' (lo más reciente primero).
 */
function kardex(itemId, { centerId = null, dateFrom, dateTo, order = 'asc' } = {}, pageParams, db = getDb()) {
  const item = getItemOr404(itemId, db);
  const center = centerId ? catalogs.getCenterOr404(centerId, db) : null;
  const { where, params } = kardexWhere({ dateFrom, dateTo });
  const page = paginate(db, {
    select: KARDEX_SELECT, from: `${kardexFrom(Boolean(centerId))}${KARDEX_JOINS}`, where,
    params: { ...params, item: item.id, ...(centerId ? { center: centerId } : {}) },
    orderBy: order === 'desc' ? 'k.movement_date DESC, k.id DESC' : 'k.movement_date ASC, k.id ASC', map: toKardexRow
  }, pageParams);
  return {
    item: toItemRef(item),
    center: center ? catalogs.toCenterRef(center) : null,
    ...kardexTotals(item.id, centerId, { dateFrom, dateTo }, db),
    ...page
  };
}

const KARDEX_CSV = [
  { header: 'Fecha', value: (r) => r.movement_date },
  { header: 'Folio', value: (r) => r.id },
  { header: 'Movimiento', value: (r) => MOVEMENT_DIRECTION_LABELS[r.direction] },
  { header: 'Motivo', value: (r) => MOVEMENT_REASON_LABELS[r.reason] },
  { header: 'Centro de acopio', value: (r) => r.cc_name },
  { header: 'Traspaso con', value: (r) => r.peer_center_name || '' },
  { header: 'Entrada', value: (r) => (r.direction === 'ENTRADA' ? r.quantity : '') },
  { header: 'Salida', value: (r) => (r.direction === 'SALIDA' ? r.quantity : '') },
  { header: 'Saldo', value: (r) => Number(r.balance) },
  { header: 'Evento', value: (r) => r.e_name || '' },
  { header: 'Donante o destino', value: (r) => r.counterpart || '' },
  { header: 'Notas', value: (r) => r.notes || '' },
  { header: 'Anula al folio', value: (r) => r.reverses_id || '' },
  { header: 'Anulado por el folio', value: (r) => r.reversed_by_id || '' },
  { header: 'Registró', value: (r) => (r.u_first_name ? `${r.u_first_name} ${r.u_last_name}` : '') }
];

function exportKardex(actor, itemId, { centerId = null, dateFrom, dateTo } = {}, ip, db = getDb()) {
  const item = getItemOr404(itemId, db);
  if (centerId) catalogs.getCenterOr404(centerId, db);
  const { where, params } = kardexWhere({ dateFrom, dateTo });
  const rows = db.prepare(`SELECT ${KARDEX_SELECT} FROM ${kardexFrom(Boolean(centerId))}${KARDEX_JOINS}
      ${where ? `WHERE ${where}` : ''} ORDER BY k.movement_date, k.id LIMIT ${EXPORT_LIMIT}`)
    .all({ ...params, item: item.id, ...(centerId ? { center: centerId } : {}) });
  R.recordExport({ entity: 'inventory_movements', count: rows.length, actor, ip,
    filters: { item_id: item.id, center_id: centerId, date_from: dateFrom, date_to: dateTo } }, db);
  return { csv: toCsv(KARDEX_CSV, rows), count: rows.length, item };
}

module.exports = {
  NOT_FOUND, getItem, getItemOr404, toItemListItem, toItemOut, toItemRef, currentStock, stockByCenter,
  createItem, updateItem, listItems, inventorySummary, exportStock, kardex, exportKardex,
  KARDEX_JOINS, KARDEX_SELECT, toKardexRow, SIGNED
};
