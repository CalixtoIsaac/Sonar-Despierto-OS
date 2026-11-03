/**
 * Movimientos de inventario (Fase 6, ADR-0006 y ADR-0013): el LIBRO de entradas y salidas.
 *
 * - Captura: POST /inventory/movements con type ENTRADA | SALIDA | TRASPASO y 1–50 líneas { item_id, quantity }.
 *   Todas las líneas se guardan o ninguna (transacción IMMEDIATE: dos salidas simultáneas no se cuelan).
 * - REGLA DEL GATE: una salida (o la salida de un traspaso) mayor a la existencia → 409 INSUFFICIENT_STOCK.
 *   La existencia se revisa A LA FECHA del movimiento y en todas las fechas posteriores, para que el kardex
 *   nunca muestre un saldo negativo aunque se capture con fecha atrasada. La BD tiene además un disparador
 *   que rechaza cualquier salida que deje la existencia total del centro en negativo.
 * - Fecha (movement_date) en hora local de Veracruz, nunca futura.
 * - No se editan ni se borran: un error se corrige con una ANULACIÓN (contra-movimiento de hoy). Un traspaso
 *   se anula completo (sus dos movimientos). Solo lo anula quien lo registró o un ADMIN.
 */
const { getDb, nowIso } = require('../lib/db');
const {
  ENTRY_REASONS, EXIT_REASONS, INVENTORY_UNIT_LABELS
} = require('../lib/catalogs');
const { AppError, validationError } = require('../lib/errors');
const { paginate } = require('../lib/pagination');
const { normalizeKey, todayLocal } = require('../lib/text');
const R = require('./records');
const { recordAudit } = require('./audit');
const catalogs = require('./inventory-catalogs');
const items = require('./inventory-items');

const NOT_FOUND = 'No existe un movimiento con ese folio.';
const { SIGNED, KARDEX_JOINS } = items;

const MOVEMENT_SELECT = `k.*, cc.name AS cc_name, cc.is_active AS cc_active, e.name AS e_name,
  u.first_name AS u_first_name, u.last_name AS u_last_name, rv.id AS reversed_by_id,
  tpc.id AS peer_center_id, tpc.name AS peer_center_name,
  i.name AS i_name, i.unit AS i_unit, i.is_active AS i_active`;
const MOVEMENT_FROM = `inventory_movements k${KARDEX_JOINS}
  JOIN inventory_items i ON i.id = k.item_id`;

function toMovementOut(row) {
  const out = items.toKardexRow({ ...row, balance: 0 });
  delete out.balance;
  delete out.in;
  delete out.out;
  return { ...out, item: { id: row.item_id, name: row.i_name, unit: row.i_unit, is_active: Boolean(row.i_active) } };
}

function getMovement(id, db = getDb()) {
  return db.prepare(`SELECT ${MOVEMENT_SELECT} FROM ${MOVEMENT_FROM} WHERE k.id = ?`).get(id) || null;
}

function getMovementOr404(id, db = getDb()) {
  const row = Number.isInteger(id) && id > 0 ? getMovement(id, db) : null;
  if (!row) throw R.notFound(NOT_FOUND);
  return row;
}

// ---------------------------------------------------------------------------------------------
// Existencia disponible para una salida
// ---------------------------------------------------------------------------------------------

/**
 * Cuánto se puede sacar de un artículo en un centro con fecha `date`, sin dejar el saldo negativo ni en esa
 * fecha ni en ninguna posterior: min(saldo al cierre de `date`, saldo mínimo de los movimientos posteriores).
 */
function availableFor(itemId, centerId, date, db) {
  const row = db.prepare(`WITH k AS (
      SELECT m.movement_date, m.id,
        SUM(${SIGNED}) OVER (ORDER BY m.movement_date, m.id ROWS UNBOUNDED PRECEDING) AS balance
      FROM inventory_movements m WHERE m.item_id = @item AND m.center_id = @center)
    SELECT
      COALESCE((SELECT balance FROM k WHERE movement_date <= @date ORDER BY movement_date DESC, id DESC LIMIT 1), 0) AS at_date,
      (SELECT MIN(balance) FROM k WHERE movement_date > @date) AS min_after,
      COALESCE((SELECT balance FROM k ORDER BY movement_date DESC, id DESC LIMIT 1), 0) AS current`)
    .get({ item: itemId, center: centerId, date });
  const atDate = Number(row.at_date);
  const available = row.min_after === null ? atDate : Math.min(atDate, Number(row.min_after));
  return { available: Math.max(available, 0), current: Number(row.current) };
}

function unitText(unit, n) {
  const label = (INVENTORY_UNIT_LABELS[unit] || '').toLowerCase();
  if (n === 1) return label;
  return label.endsWith('r') ? `${label}es` : `${label}s`; // par → pares
}

function insufficient({ item, center, requested, available, current, line }) {
  const later = available < current
    ? ' (en fechas posteriores ya se usaron)'
    : '';
  const message = available === 0
    ? `No hay existencias de "${item.name}" en ${center.name} para esa fecha${later}.`
    : `Solo hay ${available} ${unitText(item.unit, available)} de "${item.name}" en ${center.name}${later}; quieres sacar ${requested}.`;
  return new AppError(409, 'INSUFFICIENT_STOCK', message, {
    extra: { item_id: item.id, center_id: center.id, requested, available, current_stock: current, line: line ?? null }
  });
}

function assertCanExit({ item, center, quantity, date, line }, db) {
  const { available, current } = availableFor(item.id, center.id, date, db);
  if (quantity > available) throw insufficient({ item, center, requested: quantity, available, current, line });
}

// ---------------------------------------------------------------------------------------------
// Captura
// ---------------------------------------------------------------------------------------------

function assertEvent(eventId, db) {
  const e = db.prepare('SELECT id, status FROM events WHERE id = ?').get(eventId);
  if (!e) throw validationError([{ field: 'event_id', message: 'El evento no existe.' }]);
  if (e.status === 'CERRADO') {
    throw new AppError(400, 'EVENT_CLOSED', 'El evento está cerrado: ya no se le pueden vincular movimientos.');
  }
}

function loadLineItems(lines, db) {
  const c = [];
  const out = lines.map((line, i) => {
    const row = db.prepare('SELECT id, name, unit, is_active FROM inventory_items WHERE id = ?').get(line.item_id);
    if (!row) c.push({ field: `lines[${i}].item_id`, message: 'El artículo no existe.' });
    else if (!row.is_active) c.push({ field: `lines[${i}].item_id`, message: `"${row.name}" está dado de baja.` });
    return row;
  });
  if (c.length) throw validationError(c);
  return out;
}

const insertSql = `INSERT INTO inventory_movements
  (item_id, center_id, direction, reason, quantity, movement_date, event_id, counterpart, notes, search_key, transfer_id,
   reverses_id, created_by_id, created_at)
  VALUES (@item_id, @center_id, @direction, @reason, @quantity, @movement_date, @event_id, @counterpart, @notes, @search_key,
   @transfer_id, @reverses_id, @created_by_id, @created_at)`;

function insertMovement(row, db) {
  const searchKey = normalizeKey([row.counterpart, row.notes].filter(Boolean).join(' ')) || null;
  try {
    return Number(db.prepare(insertSql).run({ ...row, search_key: searchKey }).lastInsertRowid);
  } catch (err) {
    // Defensa en la BD (no debería llegar aquí: el servicio revisa antes)
    if (/INSUFFICIENT_STOCK/.test(String(err.message))) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', 'La salida es mayor a la existencia del centro.');
    }
    throw err;
  }
}

/**
 * data: { type: ENTRADA|SALIDA|TRASPASO, center_id, to_center_id?, reason?, movement_date?, event_id?,
 *         counterpart?, notes?, lines: [{ item_id, quantity }] }
 * → { movements: MovementOut[] }
 */
function createMovements(actor, data, ip, db = getDb()) {
  const type = data.type;
  const date = data.movement_date || todayLocal();
  if (date > todayLocal()) throw validationError([{ field: 'movement_date', message: 'La fecha no puede ser futura.' }]);
  if (type === 'ENTRADA' && !ENTRY_REASONS.includes(data.reason)) {
    throw validationError([{ field: 'reason', message: 'Elige el motivo de la entrada.' }]);
  }
  if (type === 'SALIDA' && !EXIT_REASONS.includes(data.reason)) {
    throw validationError([{ field: 'reason', message: 'Elige el motivo de la salida.' }]);
  }
  if (type === 'TRASPASO') {
    if (!data.to_center_id) throw validationError([{ field: 'to_center_id', message: 'Elige el centro de destino.' }]);
    if (data.to_center_id === data.center_id) {
      throw validationError([{ field: 'to_center_id', message: 'El centro de destino debe ser distinto al de origen.' }]);
    }
  }
  const seen = new Set();
  const dupes = [];
  data.lines.forEach((l, i) => {
    if (seen.has(l.item_id)) dupes.push({ field: `lines[${i}].item_id`, message: 'Ese artículo ya está en la lista.' });
    seen.add(l.item_id);
  });
  if (dupes.length) throw validationError(dupes);

  const ids = db.transaction(() => {
    const center = catalogs.assertCenterUsable(data.center_id, 'center_id', db);
    const toCenter = type === 'TRASPASO' ? catalogs.assertCenterUsable(data.to_center_id, 'to_center_id', db) : null;
    if (data.event_id) assertEvent(data.event_id, db);
    const lineItems = loadLineItems(data.lines, db);
    const created = [];
    const now = nowIso();
    const base = {
      movement_date: date, event_id: data.event_id ?? null, counterpart: data.counterpart ?? null, notes: data.notes ?? null,
      reverses_id: null, created_by_id: R.actorId(actor), created_at: now
    };
    let nextTransfer = type === 'TRASPASO'
      ? db.prepare('SELECT COALESCE(MAX(transfer_id), 0) + 1 AS n FROM inventory_movements').get().n : null;
    data.lines.forEach((line, i) => {
      const item = lineItems[i];
      const movementIds = [];
      if (type === 'ENTRADA') {
        movementIds.push(insertMovement({ ...base, item_id: item.id, center_id: center.id, direction: 'ENTRADA',
          reason: data.reason, quantity: line.quantity, transfer_id: null }, db));
      } else {
        assertCanExit({ item, center, quantity: line.quantity, date, line: i }, db);
        if (type === 'SALIDA') {
          movementIds.push(insertMovement({ ...base, item_id: item.id, center_id: center.id, direction: 'SALIDA',
            reason: data.reason, quantity: line.quantity, transfer_id: null }, db));
        } else {
          const transferId = nextTransfer++;
          movementIds.push(insertMovement({ ...base, item_id: item.id, center_id: center.id, direction: 'SALIDA',
            reason: 'TRASPASO', quantity: line.quantity, transfer_id: transferId }, db));
          movementIds.push(insertMovement({ ...base, item_id: item.id, center_id: toCenter.id, direction: 'ENTRADA',
            reason: 'TRASPASO', quantity: line.quantity, transfer_id: transferId }, db));
        }
      }
      created.push(...movementIds);
      db.prepare('UPDATE inventory_items SET updated_at = ? WHERE id = ?').run(now, item.id);
      recordAudit({ action: 'INVENTORY_MOVEMENT_CREATED', entity: 'inventory_items', entityId: item.id, userId: R.actorId(actor),
        detail: { movement_ids: movementIds, type, reason: type === 'TRASPASO' ? 'TRASPASO' : data.reason, quantity: line.quantity,
          center_id: center.id, ...(toCenter ? { to_center_id: toCenter.id } : {}), ...(data.event_id ? { event_id: data.event_id } : {}) },
        ip }, db);
    });
    return created;
  }).immediate();
  return { movements: ids.map((id) => toMovementOut(getMovement(id, db))) };
}

// ---------------------------------------------------------------------------------------------
// Anulación
// ---------------------------------------------------------------------------------------------

/** Anula un movimiento (y su par si es un traspaso) con contra-movimientos fechados hoy. */
function reverseMovement(actor, id, { reason }, ip, db = getDb()) {
  const ids = db.transaction(() => {
    const m = getMovementOr404(id, db);
    if (m.reason === 'ANULACION') {
      throw new AppError(400, 'CANNOT_REVERSE_REVERSAL', 'Una anulación no se puede anular: registra un movimiento nuevo.');
    }
    if (m.reversed_by_id) {
      throw new AppError(409, 'MOVEMENT_ALREADY_REVERSED', `Este movimiento ya se anuló con el folio ${m.reversed_by_id}.`,
        { extra: { reversed_by_id: m.reversed_by_id } });
    }
    if (actor.role !== 'ADMIN' && m.created_by_id !== actor.id) {
      throw new AppError(403, 'FORBIDDEN', 'Solo quien registró el movimiento o un administrador puede anularlo.');
    }
    const group = m.transfer_id
      ? db.prepare('SELECT id FROM inventory_movements WHERE transfer_id = ? ORDER BY direction ASC, id').all(m.transfer_id)
        .map((r) => getMovement(r.id, db)) // la ENTRADA del destino primero: su anulación es una salida que se revisa
      : [m];
    const today = todayLocal();
    const now = nowIso();
    const created = [];
    for (const g of group) {
      if (!g.i_active) throw new AppError(400, 'ITEM_INACTIVE', `"${g.i_name}" está dado de baja: reactívalo para anular el movimiento.`);
      if (!g.cc_active) throw new AppError(400, 'CENTER_INACTIVE', `${g.cc_name} está dado de baja: reactívalo para anular el movimiento.`);
      const direction = g.direction === 'ENTRADA' ? 'SALIDA' : 'ENTRADA';
      if (direction === 'SALIDA') {
        assertCanExit({ item: { id: g.item_id, name: g.i_name, unit: g.i_unit }, center: { id: g.center_id, name: g.cc_name },
          quantity: g.quantity, date: today }, db);
      }
      created.push(insertMovement({
        item_id: g.item_id, center_id: g.center_id, direction, reason: 'ANULACION', quantity: g.quantity, movement_date: today,
        event_id: g.event_id ?? null, counterpart: null, notes: reason, transfer_id: null, reverses_id: g.id,
        created_by_id: R.actorId(actor), created_at: now
      }, db));
    }
    db.prepare('UPDATE inventory_items SET updated_at = ? WHERE id = ?').run(now, m.item_id);
    recordAudit({ action: 'INVENTORY_MOVEMENT_REVERSED', entity: 'inventory_items', entityId: m.item_id, userId: R.actorId(actor),
      detail: { reversed_ids: group.map((g) => g.id), reversal_ids: created }, ip }, db);
    return created;
  }).immediate();
  return { movements: ids.map((x) => toMovementOut(getMovement(x, db))) };
}

// ---------------------------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------------------------

/**
 * filtros: { itemId, centerId, direction, reasons: [], eventId, dateFrom, dateTo, search (artículo), createdById }
 * Orden: lo más reciente primero (fecha, folio).
 */
function listMovements(pageParams, f = {}, db = getDb()) {
  const where = [];
  const params = {};
  if (f.itemId) { where.push('k.item_id = @item'); params.item = f.itemId; }
  if (f.centerId) { where.push('k.center_id = @center'); params.center = f.centerId; }
  if (f.direction) { where.push('k.direction = @direction'); params.direction = f.direction; }
  if (f.reasons && f.reasons.length) {
    where.push(`k.reason IN (${f.reasons.map((_, i) => `@r${i}`).join(', ')})`);
    f.reasons.forEach((r, i) => { params[`r${i}`] = r; });
  }
  if (f.eventId) { where.push('k.event_id = @event'); params.event = f.eventId; }
  if (f.dateFrom) { where.push('k.movement_date >= @from'); params.from = f.dateFrom; }
  if (f.dateTo) { where.push('k.movement_date <= @to'); params.to = f.dateTo; }
  if (f.createdById) { where.push('k.created_by_id = @by'); params.by = f.createdById; }
  const s = R.searchClause(f.search, ['i.name_key', 'k.search_key']);
  if (s) { where.push(s.sql); Object.assign(params, s.params); }
  return paginate(db, {
    select: MOVEMENT_SELECT, from: MOVEMENT_FROM, where: where.join(' AND '), params,
    orderBy: 'k.movement_date DESC, k.id DESC', map: toMovementOut
  }, pageParams);
}

/** Selectores del formulario de movimiento: categorías y centros activos, eventos no cerrados. */
function inventoryOptions(db = getDb()) {
  const categories = db.prepare('SELECT id, name, is_active FROM inventory_categories WHERE is_active = 1 ORDER BY name_key').all();
  const centers = db.prepare('SELECT id, name, is_active FROM collection_centers WHERE is_active = 1 ORDER BY name_key').all();
  const events = db.prepare(`SELECT id, name, event_date, status FROM events WHERE status <> 'CERRADO'
      ORDER BY event_date DESC, id DESC LIMIT 50`).all();
  return {
    categories: categories.map(catalogs.toCategoryRef),
    centers: centers.map(catalogs.toCenterRef),
    events: events.map((e) => ({ id: e.id, name: e.name, event_date: e.event_date, status: e.status }))
  };
}

module.exports = {
  NOT_FOUND, getMovement, getMovementOr404, toMovementOut, availableFor, createMovements, reverseMovement, listMovements,
  inventoryOptions
};
