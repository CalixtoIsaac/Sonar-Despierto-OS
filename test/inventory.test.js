const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { todayLocal } = require('../lib/text');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });
const tomorrow = () => {
  const d = new Date(`${todayLocal()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

// ---------- Catálogos ----------
test('categorías: alta, duplicado sin acentos → 409, edición, baja y bitácora', async () => {
  const { token } = await h.operatorSession(['INVENTARIO']);
  const r = await api('POST', '/api/inventory/categories', token, { name: 'Papelería', description: 'Hojas, plumones' });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual({ ...r.body.category, created_at: 0, updated_at: 0 },
    { id: r.body.category.id, name: 'Papelería', description: 'Hojas, plumones', is_active: true, items_count: 0, created_at: 0, updated_at: 0 });
  const dup = await api('POST', '/api/inventory/categories', token, { name: '  PAPELERIA ' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'DUPLICATE_CATEGORY');
  assert.equal(dup.body.existing_id, r.body.category.id);
  const id = r.body.category.id;
  assert.equal((await api('PATCH', `/api/inventory/categories/${id}`, token, { name: '' })).status, 422);
  const off = await api('PATCH', `/api/inventory/categories/${id}`, token, { is_active: false });
  assert.equal(off.body.category.is_active, false);
  const list = await api('GET', '/api/inventory/categories?is_active=true', token);
  assert.equal(list.body.total, 0);
  assert.deepEqual(h.auditActions(), ['LOGIN', 'RECORD_CREATED', 'RECORD_DEACTIVATED']);
  const created = h.auditRows().find((x) => x.action === 'RECORD_CREATED');
  assert.equal(created.entity, 'inventory_categories');
});

test('la migración deja categorías sugeridas (catálogo editable)', () => {
  const { MIGRATIONS } = require('../lib/migrations');
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  require('../lib/migrations').migrate(db);
  const names = db.prepare('SELECT name FROM inventory_categories ORDER BY id').all().map((r) => r.name);
  assert.deepEqual(names, [...require('../lib/catalogs').INVENTORY_DEFAULT_CATEGORIES]);
  assert.equal(MIGRATIONS[MIGRATIONS.length - 1].version, 6);
  db.close();
});

test('centros: alta con teléfono normalizado, duplicado → 409, baja con existencias → 409 CENTER_HAS_STOCK', async () => {
  const { token, center, item } = await h.inventorySetup();
  assert.equal(center.contact_phone, '2290001122');
  const dup = await api('POST', '/api/inventory/centers', token, { name: center.name.toUpperCase() });
  assert.equal(dup.body.code, 'DUPLICATE_CENTER');
  const bad = await api('POST', '/api/inventory/centers', token, { name: 'X', contact_phone: '123' });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.body.details, [{ field: 'contact_phone', message: 'El teléfono debe tener 10 dígitos.' }]);

  await h.move(token, 'ENTRADA', center.id, item.id, 4);
  const c = (await api('GET', `/api/inventory/centers/${center.id}`, token)).body.center;
  assert.equal(c.items_count, 1);
  assert.equal(c.units, 4);
  const off = await api('PATCH', `/api/inventory/centers/${center.id}`, token, { is_active: false });
  assert.equal(off.status, 409);
  assert.equal(off.body.code, 'CENTER_HAS_STOCK');
  await h.move(token, 'SALIDA', center.id, item.id, 4);
  assert.equal((await api('PATCH', `/api/inventory/centers/${center.id}`, token, { is_active: false })).status, 200);
  const r = await api('POST', '/api/inventory/movements', token, h.movementPayload('ENTRADA', center.id, item.id, 1));
  assert.equal(r.status, 422);
  assert.deepEqual(r.body.details, [{ field: 'center_id', message: 'El centro de acopio está dado de baja.' }]);
});

// ---------- Artículos ----------
test('artículos: validación, duplicado por categoría, categoría dada de baja, unidad bloqueada y baja con existencias', async () => {
  const { token, category, center, item } = await h.inventorySetup();
  const v = await api('POST', '/api/inventory/items', token, { name: '', category_id: 'x', unit: 'TONELADA', min_stock: -1, extra: 1 });
  assert.equal(v.status, 422);
  assert.deepEqual(v.body.details.map((d) => d.field).sort(), ['category_id', 'extra', 'min_stock', 'name', 'unit']);

  const dup = await api('POST', '/api/inventory/items', token, { name: item.name.toLowerCase(), category_id: category.id, unit: 'CAJA' });
  assert.equal(dup.body.code, 'DUPLICATE_ITEM');
  const other = await h.makeCategory(token);
  assert.equal((await api('POST', '/api/inventory/items', token, { name: item.name, category_id: other.id, unit: 'PIEZA' })).status, 201,
    'el mismo nombre en otra categoría sí se permite');
  await api('PATCH', `/api/inventory/categories/${other.id}`, token, { is_active: false });
  const inactive = await api('POST', '/api/inventory/items', token, { name: 'Mesa', category_id: other.id, unit: 'PIEZA' });
  assert.deepEqual(inactive.body.details, [{ field: 'category_id', message: 'La categoría está dada de baja.' }]);
  assert.equal((await api('POST', '/api/inventory/items', token, { name: 'Mesa', category_id: 999, unit: 'PIEZA' })).body.details[0].message,
    'La categoría no existe.');

  assert.equal((await api('PATCH', `/api/inventory/items/${item.id}`, token, { unit: 'CAJA' })).status, 200, 'sin movimientos sí cambia');
  await h.move(token, 'ENTRADA', center.id, item.id, 2);
  const locked = await api('PATCH', `/api/inventory/items/${item.id}`, token, { unit: 'PIEZA' });
  assert.equal(locked.body.code, 'ITEM_UNIT_LOCKED');
  const has = await api('PATCH', `/api/inventory/items/${item.id}`, token, { is_active: false });
  assert.equal(has.status, 409);
  assert.equal(has.body.code, 'ITEM_HAS_STOCK');
  await h.move(token, 'SALIDA', center.id, item.id, 2);
  const off = await api('PATCH', `/api/inventory/items/${item.id}`, token, { is_active: false });
  assert.equal(off.body.item.is_active, false);
  const r = await api('POST', '/api/inventory/movements', token, h.movementPayload('ENTRADA', center.id, item.id, 1));
  assert.deepEqual(r.body.details, [{ field: 'lines[0].item_id', message: `"${item.name}" está dado de baja.` }]);
});

test('listado de existencias: filtros por centro, categoría, con/sin existencia, existencia baja y orden', async () => {
  const { token, category, center, item } = await h.inventorySetup();
  const north = await h.makeCenter(token, { name: 'Bodega Norte' });
  const cat2 = await h.makeCategory(token, { name: 'Mobiliario' });
  const chairs = await h.makeItem(token, cat2.id, { name: 'Silla', min_stock: 20 });
  const bags = await h.makeItem(token, category.id, { name: 'Bolsa', unit: 'BOLSA', min_stock: 5 });
  await h.move(token, 'ENTRADA', center.id, chairs.id, 12);
  await h.move(token, 'ENTRADA', north.id, bags.id, 30);
  const q = async (s) => (await api('GET', `/api/inventory/items${s}`, token)).body.items.map((x) => x.name);
  assert.deepEqual(await q('?stock=con&order_by=name'), ['Bolsa', 'Silla']);
  assert.deepEqual(await q('?stock=sin'), [item.name]);
  assert.deepEqual(await q('?stock=bajo'), ['Silla']);
  assert.deepEqual(await q(`?category_id=${cat2.id}`), ['Silla']);
  assert.deepEqual(await q(`?center_id=${north.id}&stock=con`), ['Bolsa']);
  assert.deepEqual(await q('?order_by=-stock'), ['Bolsa', 'Silla', item.name]);
  assert.deepEqual(await q('?search=sill'), ['Silla']);
  const silla = (await api('GET', `/api/inventory/items?search=silla&center_id=${north.id}`, token)).body.items[0];
  assert.equal(silla.center_stock, 0);
  assert.equal(silla.total_stock, 12);
  assert.equal(silla.low_stock, true);
  assert.equal((await api('GET', '/api/inventory/items?stock=mucho', token)).status, 422);
  const summary = (await api('GET', '/api/inventory/summary', token)).body;
  assert.deepEqual(summary, { items: 3, with_stock: 2, low_stock: 1, centers: 2 });
});

// ---------- Movimientos ----------
test('captura: validación del cuerpo y de las líneas, motivos por tipo, fecha futura, evento cerrado', async () => {
  const { token, center, item } = await h.inventorySetup();
  const { token: admin } = await h.adminSession();
  const bad = await api('POST', '/api/inventory/movements', token, { type: 'REGALO', center_id: 'x', lines: [{ item_id: 0, quantity: 1.5, foo: 1 }] });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.body.details.map((d) => d.field).sort(),
    ['center_id', 'lines[0].foo', 'lines[0].item_id', 'lines[0].quantity', 'type'].sort());
  assert.equal((await api('POST', '/api/inventory/movements', token, { type: 'ENTRADA', center_id: center.id, reason: 'DONACION', lines: [] })).body.details[0].field, 'lines');
  const noReason = await api('POST', '/api/inventory/movements', token, h.movementPayload('ENTRADA', center.id, item.id, 1, { reason: undefined }));
  assert.deepEqual(noReason.body.details, [{ field: 'reason', message: 'Elige el motivo de la entrada.' }]);
  const wrong = await api('POST', '/api/inventory/movements', token, h.movementPayload('SALIDA', center.id, item.id, 1, { reason: 'DONACION' }));
  assert.deepEqual(wrong.body.details, [{ field: 'reason', message: 'Elige el motivo de la salida.' }]);
  const future = await api('POST', '/api/inventory/movements', token, h.movementPayload('ENTRADA', center.id, item.id, 1, { movement_date: tomorrow() }));
  assert.deepEqual(future.body.details, [{ field: 'movement_date', message: 'La fecha no puede ser futura.' }]);
  const same = await api('POST', '/api/inventory/movements', token, h.movementPayload('TRASPASO', center.id, item.id, 1, { to_center_id: center.id }));
  assert.equal(same.body.details[0].field, 'to_center_id');
  const reasonTransfer = await api('POST', '/api/inventory/movements', token, h.movementPayload('TRASPASO', center.id, item.id, 1, { to_center_id: 99, reason: 'OTRO' }));
  assert.equal(reasonTransfer.body.details[0].field, 'reason');
  const twice = await api('POST', '/api/inventory/movements', token, { type: 'ENTRADA', reason: 'DONACION', center_id: center.id,
    lines: [{ item_id: item.id, quantity: 1 }, { item_id: item.id, quantity: 2 }] });
  assert.deepEqual(twice.body.details, [{ field: 'lines[1].item_id', message: 'Ese artículo ya está en la lista.' }]);

  const event = await h.openEvent(admin, {}, 'CERRADO');
  const closed = await api('POST', '/api/inventory/movements', token, h.movementPayload('ENTRADA', center.id, item.id, 1, { event_id: event.id }));
  assert.equal(closed.status, 400);
  assert.equal(closed.body.code, 'EVENT_CLOSED');
});

test('captura de varias líneas con evento, donante y notas; salida queda ligada al evento; bitácora por artículo', async () => {
  const { token, category, center, item } = await h.inventorySetup();
  const { token: admin } = await h.adminSession();
  const event = await h.openEvent(admin, { name: 'Navidad 2026' });
  const juguete = await h.makeItem(token, category.id, { name: 'Pelota' });
  const r = await api('POST', '/api/inventory/movements', token, {
    type: 'ENTRADA', reason: 'DONACION', center_id: center.id, counterpart: 'Colegio Americano', notes: 'Colecta de noviembre',
    lines: [{ item_id: item.id, quantity: 20 }, { item_id: juguete.id, quantity: '15' }]
  });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.movements.length, 2);
  const m = r.body.movements[1];
  assert.deepEqual({ item: m.item.name, q: m.quantity, d: m.direction, reason: m.reason, date: m.movement_date, who: m.counterpart },
    { item: 'Pelota', q: 15, d: 'ENTRADA', reason: 'DONACION', date: todayLocal(), who: 'Colegio Americano' });
  assert.equal(m.created_by.full_name, 'Ana Prueba');
  const out = await h.move(token, 'SALIDA', center.id, juguete.id, 10, { event_id: event.id });
  assert.equal(out[0].event.name, 'Navidad 2026');
  const byEvent = (await api('GET', `/api/inventory/movements?event_id=${event.id}`, token)).body;
  assert.deepEqual(byEvent.items.map((x) => x.id), [out[0].id]);
  const logs = h.auditRows().filter((x) => x.action === 'INVENTORY_MOVEMENT_CREATED');
  assert.equal(logs.length, 3);
  assert.deepEqual(logs[0].detail, { movement_ids: [r.body.movements[0].id], type: 'ENTRADA', reason: 'DONACION', quantity: 20, center_id: center.id });
  assert.equal(logs[0].entity, 'inventory_items');
  assert.ok(!JSON.stringify(logs).includes('Colegio Americano'), 'la bitácora no guarda el donante ni las notas');
});

test('listado de movimientos: filtros por tipo, motivo, centro, fechas, búsqueda y "mis movimientos"', async () => {
  const { user, token, center, item } = await h.inventorySetup();
  const { token: admin } = await h.adminSession();
  await h.move(token, 'ENTRADA', center.id, item.id, 10, { counterpart: 'Fundación Luz' });
  await h.move(admin, 'SALIDA', center.id, item.id, 3, { reason: 'MERMA' });
  const q = async (s) => (await api('GET', `/api/inventory/movements${s}`, token)).body;
  assert.equal((await q('')).total, 2);
  assert.deepEqual((await q('?direction=SALIDA')).items.map((x) => x.reason), ['MERMA']);
  assert.deepEqual((await q('?reason=DONACION&reason=MERMA')).items.length, 2);
  assert.deepEqual((await q('?search=fundacion')).items.map((x) => x.direction), ['ENTRADA']);
  assert.deepEqual((await q('?mine=true')).items.map((x) => x.created_by.id), [user.id]);
  assert.equal((await q(`?date_from=${tomorrow()}`)).total, 0);
  assert.equal((await api('GET', '/api/inventory/movements?reason=REGALO', token)).status, 422);
  assert.equal((await api('GET', '/api/inventory/movements?date_from=2026-11-10&date_to=2026-11-01', token)).status, 422);
  assert.equal((await api('GET', '/api/inventory/movements/9999', token)).status, 404);
});

// ---------- Anulaciones ----------
test('anular: contra-movimiento de hoy, una sola vez, no se anula una anulación, solo quien lo registró o un ADMIN', async () => {
  const { token, center, item } = await h.inventorySetup();
  const otherOp = await h.operatorSession(['INVENTARIO']);
  const { token: admin } = await h.adminSession();
  const [entry] = await h.move(token, 'ENTRADA', center.id, item.id, 10);

  assert.equal((await api('POST', `/api/inventory/movements/${entry.id}/reverse`, token, { reason: 'x' })).status, 422);
  const forbidden = await api('POST', `/api/inventory/movements/${entry.id}/reverse`, otherOp.token, { reason: 'No es mío' });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.code, 'FORBIDDEN');

  await h.move(token, 'SALIDA', center.id, item.id, 7);
  const blocked = await api('POST', `/api/inventory/movements/${entry.id}/reverse`, token, { reason: 'Se capturó mal' });
  assert.equal(blocked.status, 409, 'anular la entrada dejaría la existencia en negativo');
  assert.equal(blocked.body.code, 'INSUFFICIENT_STOCK');

  const [entry2] = await h.move(token, 'ENTRADA', center.id, item.id, 5);
  const rev = await api('POST', `/api/inventory/movements/${entry2.id}/reverse`, admin, { reason: 'Era otra bodega' });
  assert.equal(rev.status, 201, rev.text);
  const contra = rev.body.movements[0];
  assert.deepEqual({ d: contra.direction, r: contra.reason, q: contra.quantity, rev: contra.reverses_id, date: contra.movement_date, notes: contra.notes },
    { d: 'SALIDA', r: 'ANULACION', q: 5, rev: entry2.id, date: todayLocal(), notes: 'Era otra bodega' });
  assert.equal((await api('GET', `/api/inventory/movements/${entry2.id}`, token)).body.movement.reversed_by_id, contra.id);
  const again = await api('POST', `/api/inventory/movements/${entry2.id}/reverse`, admin, { reason: 'Otra vez' });
  assert.equal(again.body.code, 'MOVEMENT_ALREADY_REVERSED');
  const revRev = await api('POST', `/api/inventory/movements/${contra.id}/reverse`, admin, { reason: 'Deshacer la anulación' });
  assert.equal(revRev.body.code, 'CANNOT_REVERSE_REVERSAL');
  assert.equal((await api('GET', `/api/inventory/items/${item.id}`, token)).body.item.total_stock, 3);
  const log = h.auditRows().find((x) => x.action === 'INVENTORY_MOVEMENT_REVERSED');
  assert.deepEqual(log.detail, { reversed_ids: [entry2.id], reversal_ids: [contra.id] });
});

test('anular un traspaso anula sus dos movimientos (desde cualquiera de ellos)', async () => {
  const { token, center, item } = await h.inventorySetup();
  const north = await h.makeCenter(token);
  await h.move(token, 'ENTRADA', center.id, item.id, 10);
  const t = await h.move(token, 'TRASPASO', center.id, item.id, 4, { to_center_id: north.id });
  assert.equal(t[0].peer_center.id, north.id);
  assert.equal(t[1].peer_center.id, center.id);
  const rev = await api('POST', `/api/inventory/movements/${t[0].id}/reverse`, token, { reason: 'Se quedó en la oficina' });
  assert.equal(rev.status, 201);
  assert.deepEqual(rev.body.movements.map((m) => [m.center.id, m.direction, m.reverses_id]).sort(),
    [[center.id, 'ENTRADA', t[0].id], [north.id, 'SALIDA', t[1].id]].sort());
  const item2 = (await api('GET', `/api/inventory/items/${item.id}`, token)).body.item;
  assert.deepEqual(item2.stock_by_center.map((s) => [s.center.id, s.stock]).sort(), [[center.id, 10], [north.id, 0]].sort());
  assert.equal((await api('POST', `/api/inventory/movements/${t[1].id}/reverse`, token, { reason: 'Otra vez' })).body.code, 'MOVEMENT_ALREADY_REVERSED');
});

// ---------- Kardex y exportaciones ----------
test('kardex: orden, periodo, centro, orden descendente y paginación; 404 y 422', async () => {
  const { token, center, item } = await h.inventorySetup();
  await h.move(token, 'ENTRADA', center.id, item.id, 5, { movement_date: '2026-01-10' });
  await h.move(token, 'ENTRADA', center.id, item.id, 7, { movement_date: '2026-01-05' });
  await h.move(token, 'SALIDA', center.id, item.id, 3, { movement_date: '2026-02-01' });
  const k = (await api('GET', `/api/inventory/items/${item.id}/kardex`, token)).body;
  assert.deepEqual(k.items.map((r) => [r.movement_date, r.in, r.out, r.balance]),
    [['2026-01-05', 7, 0, 7], ['2026-01-10', 5, 0, 12], ['2026-02-01', 0, 3, 9]]);
  assert.deepEqual([k.opening_balance, k.total_in, k.total_out, k.closing_balance], [0, 12, 3, 9]);
  const feb = (await api('GET', `/api/inventory/items/${item.id}/kardex?date_from=2026-01-08&date_to=2026-01-31`, token)).body;
  assert.deepEqual([feb.opening_balance, feb.total_in, feb.total_out, feb.closing_balance, feb.items.length], [7, 5, 0, 12, 1]);
  const desc = (await api('GET', `/api/inventory/items/${item.id}/kardex?order=desc&page_size=2`, token)).body;
  assert.deepEqual(desc.items.map((r) => r.balance), [9, 12]);
  assert.equal(desc.pages, 2);
  assert.equal((await api('GET', '/api/inventory/items/999/kardex', token)).status, 404);
  assert.equal((await api('GET', `/api/inventory/items/${item.id}/kardex?center_id=999`, token)).status, 404);
  assert.equal((await api('GET', `/api/inventory/items/${item.id}/kardex?date_from=enero`, token)).status, 422);
});

test('exportaciones CSV de existencias y kardex: columnas y bitácora sin texto buscado', async () => {
  const { token, center, item } = await h.inventorySetup();
  const north = await h.makeCenter(token, { name: 'Bodega Norte' });
  await h.move(token, 'ENTRADA', center.id, item.id, 9, { counterpart: '=HYPERLINK("x")' });
  await h.move(token, 'TRASPASO', center.id, item.id, 4, { to_center_id: north.id });
  const csv = await api('GET', '/api/inventory/items/export?search=art', token);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /existencias-inventario-\d{4}-\d{2}-\d{2}\.csv/);
  const lines = csv.text.replace(/^\uFEFF/, '').trim().split('\r\n'); // fetch().text() ya quita el BOM
  assert.equal(lines[0], 'Artículo,Categoría,Unidad,Centro de acopio,Existencia en el centro,Existencia total,Existencia mínima,Existencia baja,Último movimiento');
  assert.equal(lines.length, 3, 'una fila por centro con existencia');
  const kx = await api('GET', `/api/inventory/items/${item.id}/kardex/export`, token);
  assert.equal(kx.status, 200);
  assert.ok(kx.text.includes("'=HYPERLINK"), 'protege contra fórmulas');
  const exports = h.auditRows().filter((x) => x.action === 'DATA_EXPORTED');
  assert.deepEqual(exports.map((x) => x.entity), ['inventory_items', 'inventory_movements']);
  assert.deepEqual(exports[0].detail, { format: 'csv', count: 2, filters: { search: true } });
});

test('opciones del formulario: solo categorías y centros activos, eventos no cerrados', async () => {
  const { token, center } = await h.inventorySetup();
  const { token: admin } = await h.adminSession();
  const off = await h.makeCenter(token, { name: 'Cerrado' });
  await api('PATCH', `/api/inventory/centers/${off.id}`, token, { is_active: false });
  const open = await h.openEvent(admin);
  await h.openEvent(admin, {}, 'CERRADO');
  const o = (await api('GET', '/api/inventory/options', token)).body;
  assert.deepEqual(o.centers.map((c) => c.id), [center.id]);
  assert.deepEqual(o.events.map((e) => e.id), [open.id]);
  assert.equal(o.categories.length, 1);
});
