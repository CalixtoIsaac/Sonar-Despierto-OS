/**
 * Catálogos editables del Inventario (Fase 6, ADR-0006 y ADR-0013): categorías y centros de acopio.
 *
 * - Nombres únicos sin distinguir acentos ni mayúsculas → 409 DUPLICATE_CATEGORY / DUPLICATE_CENTER.
 * - No se borran: se dan de baja (is_active = 0). Una categoría dada de baja ya no se ofrece para
 *   artículos nuevos; un centro dado de baja ya no recibe movimientos.
 * - Un centro con existencias no se puede dar de baja → 409 CENTER_HAS_STOCK (primero se traspasa o se da salida).
 */
const { getDb, toIso } = require('../lib/db');
const { AppError, validationError } = require('../lib/errors');
const { paginate } = require('../lib/pagination');
const { normalizeKey } = require('../lib/text');
const R = require('./records');

const CATEGORIES = 'inventory_categories';
const CENTERS = 'collection_centers';
const CATEGORY_NOT_FOUND = 'No existe una categoría con ese identificador.';
const CENTER_NOT_FOUND = 'No existe un centro de acopio con ese identificador.';

const SIGNED = "CASE m.direction WHEN 'ENTRADA' THEN m.quantity ELSE -m.quantity END";

// ---------------------------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------------------------

const CATEGORY_SELECT = `c.*,
  (SELECT COUNT(*) FROM inventory_items i WHERE i.category_id = c.id AND i.is_active = 1) AS items_count`;

function getCategory(id, db = getDb()) {
  return db.prepare(`SELECT ${CATEGORY_SELECT} FROM inventory_categories c WHERE c.id = ?`).get(id) || null;
}

function getCategoryOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getCategory(id, db) : null;
  if (!row) throw R.notFound(CATEGORY_NOT_FOUND);
  return row;
}

function toCategoryOut(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    is_active: Boolean(row.is_active),
    items_count: Number(row.items_count || 0),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

const toCategoryRef = (row) => ({ id: row.id, name: row.name, is_active: Boolean(row.is_active) });

function checkCategoryDuplicate(nameKey, excludeId, db) {
  const dup = db.prepare('SELECT id FROM inventory_categories WHERE name_key = ? AND id <> ?').get(nameKey, excludeId ?? -1);
  if (dup) throw R.duplicateError('DUPLICATE_CATEGORY', 'Ya existe una categoría con ese nombre.', dup.id);
}

function createCategory(actor, data, ip, db = getDb()) {
  const row = { name: data.name, name_key: normalizeKey(data.name), description: data.description ?? null };
  const id = db.transaction(() => {
    checkCategoryDuplicate(row.name_key, null, db);
    return R.insertRecord({ table: CATEGORIES, entity: CATEGORIES, row, actor, ip }, db);
  })();
  return getCategory(id, db);
}

function updateCategory(actor, id, data, ip, db = getDb()) {
  const existing = getCategoryOr404(id, db);
  const patch = {};
  for (const k of ['name', 'description', 'is_active']) if (data[k] !== undefined) patch[k] = data[k];
  if (patch.name !== undefined) patch.name_key = normalizeKey(patch.name);
  db.transaction(() => {
    if (patch.name_key) checkCategoryDuplicate(patch.name_key, existing.id, db);
    R.updateRecord({ table: CATEGORIES, entity: CATEGORIES, existing, patch, actor, ip }, db);
  })();
  return getCategory(existing.id, db);
}

const CATEGORY_ORDER = { name: 'c.name_key ASC, c.id ASC', '-name': 'c.name_key DESC, c.id DESC' };

function listCategories(pageParams, { search, isActive, orderBy = 'name' } = {}, db = getDb()) {
  const where = [];
  const params = {};
  const s = R.searchClause(search, ['c.name_key']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  R.activeClause('c', isActive, where, params);
  return paginate(db, {
    select: CATEGORY_SELECT, from: 'inventory_categories c', where: where.join(' AND '), params,
    orderBy: CATEGORY_ORDER[orderBy] || CATEGORY_ORDER.name, map: toCategoryOut
  }, pageParams);
}

/** La categoría debe existir y estar activa (salvo que sea la que ya tenía el artículo). */
function assertCategoryAssignable(categoryId, { currentId = null, field = 'category_id' } = {}, db = getDb()) {
  const row = db.prepare('SELECT id, is_active FROM inventory_categories WHERE id = ?').get(categoryId);
  if (!row) throw validationError([{ field, message: 'La categoría no existe.' }]);
  if (!row.is_active && row.id !== currentId) throw validationError([{ field, message: 'La categoría está dada de baja.' }]);
}

// ---------------------------------------------------------------------------------------------
// Centros de acopio
// ---------------------------------------------------------------------------------------------

/** items_count = artículos con existencia ≠ 0 en el centro; units = suma de sus existencias. */
const CENTER_SELECT = `cc.*,
  (SELECT COUNT(*) FROM (SELECT m.item_id FROM inventory_movements m WHERE m.center_id = cc.id
     GROUP BY m.item_id HAVING SUM(${SIGNED}) <> 0)) AS items_count,
  (SELECT COALESCE(SUM(${SIGNED}), 0) FROM inventory_movements m WHERE m.center_id = cc.id) AS units,
  (SELECT MAX(m.movement_date) FROM inventory_movements m WHERE m.center_id = cc.id) AS last_movement_date`;

function getCenter(id, db = getDb()) {
  return db.prepare(`SELECT ${CENTER_SELECT} FROM collection_centers cc WHERE cc.id = ?`).get(id) || null;
}

function getCenterOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getCenter(id, db) : null;
  if (!row) throw R.notFound(CENTER_NOT_FOUND);
  return row;
}

function toCenterOut(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? null,
    contact_name: row.contact_name ?? null,
    contact_phone: row.contact_phone ?? null,
    notes: row.notes ?? null,
    is_active: Boolean(row.is_active),
    items_count: Number(row.items_count || 0),
    units: Number(row.units || 0),
    last_movement_date: row.last_movement_date ?? null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

const toCenterRef = (row) => ({ id: row.id, name: row.name, is_active: Boolean(row.is_active) });

function checkCenterDuplicate(nameKey, excludeId, db) {
  const dup = db.prepare('SELECT id FROM collection_centers WHERE name_key = ? AND id <> ?').get(nameKey, excludeId ?? -1);
  if (dup) throw R.duplicateError('DUPLICATE_CENTER', 'Ya existe un centro de acopio con ese nombre.', dup.id);
}

const CENTER_FIELDS = ['name', 'address', 'contact_name', 'contact_phone', 'notes'];

function createCenter(actor, data, ip, db = getDb()) {
  const row = { name_key: normalizeKey(data.name) };
  for (const k of CENTER_FIELDS) row[k] = data[k] ?? null;
  const id = db.transaction(() => {
    checkCenterDuplicate(row.name_key, null, db);
    return R.insertRecord({ table: CENTERS, entity: CENTERS, row, actor, ip }, db);
  })();
  return getCenter(id, db);
}

function updateCenter(actor, id, data, ip, db = getDb()) {
  const patch = {};
  for (const k of [...CENTER_FIELDS, 'is_active']) if (data[k] !== undefined) patch[k] = data[k];
  if (patch.name !== undefined) patch.name_key = normalizeKey(patch.name);
  let centerId;
  db.transaction(() => {
    const existing = getCenterOr404(id, db);
    centerId = existing.id;
    if (patch.name_key) checkCenterDuplicate(patch.name_key, existing.id, db);
    if (patch.is_active === false && existing.is_active && Number(existing.items_count) > 0) {
      throw new AppError(409, 'CENTER_HAS_STOCK',
        `${existing.name} todavía tiene existencias de ${existing.items_count} ${Number(existing.items_count) === 1 ? 'artículo' : 'artículos'}. Traspásalas a otro centro o regístralas como salida antes de darlo de baja.`,
        { extra: { items_count: Number(existing.items_count) } });
    }
    R.updateRecord({ table: CENTERS, entity: CENTERS, existing, patch, actor, ip }, db);
  }).immediate();
  return getCenter(centerId, db);
}

const CENTER_ORDER = { name: 'cc.name_key ASC, cc.id ASC', '-name': 'cc.name_key DESC, cc.id DESC' };

function listCenters(pageParams, { search, isActive, orderBy = 'name' } = {}, db = getDb()) {
  const where = [];
  const params = {};
  const s = R.searchClause(search, ['cc.name_key', 'lower(cc.address)']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  R.activeClause('cc', isActive, where, params);
  return paginate(db, {
    select: CENTER_SELECT, from: 'collection_centers cc', where: where.join(' AND '), params,
    orderBy: CENTER_ORDER[orderBy] || CENTER_ORDER.name, map: toCenterOut
  }, pageParams);
}

/** Centro que recibe un movimiento nuevo: debe existir y estar activo. Devuelve la fila. */
function assertCenterUsable(centerId, field, db = getDb()) {
  const row = db.prepare('SELECT id, name, is_active FROM collection_centers WHERE id = ?').get(centerId);
  if (!row) throw validationError([{ field, message: 'El centro de acopio no existe.' }]);
  if (!row.is_active) throw validationError([{ field, message: 'El centro de acopio está dado de baja.' }]);
  return row;
}

module.exports = {
  CATEGORY_NOT_FOUND, CENTER_NOT_FOUND,
  getCategory, getCategoryOr404, toCategoryOut, toCategoryRef, createCategory, updateCategory, listCategories,
  assertCategoryAssignable,
  getCenter, getCenterOr404, toCenterOut, toCenterRef, createCenter, updateCenter, listCenters, assertCenterUsable
};
