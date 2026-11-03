/**
 * Gate de la Fase 6 (hoja de ruta): una salida mayor a la existencia se rechaza y el kardex cuadra con las
 * existencias calculadas.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { getDb } = require('../lib/db');
const { todayLocal } = require('../lib/text');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });
const stockOf = async (token, itemId) => (await api('GET', `/api/inventory/items/${itemId}`, token)).body.item;
const daysAgo = (n) => {
  const d = new Date(`${todayLocal()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

test('(a) salida mayor a la existencia → 409 INSUFFICIENT_STOCK y no se guarda nada (tampoco las demás líneas)', async () => {
  const { token, category, center, item } = await h.inventorySetup();
  const other = await h.makeItem(token, category.id, { name: 'Bolsa de regalo', unit: 'BOLSA' });
  await h.move(token, 'ENTRADA', center.id, item.id, 10);
  await h.move(token, 'ENTRADA', center.id, other.id, 5);

  const r = await api('POST', '/api/inventory/movements', token, {
    type: 'SALIDA', reason: 'USO_EVENTO', center_id: center.id,
    lines: [{ item_id: other.id, quantity: 2 }, { item_id: item.id, quantity: 11 }]
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'INSUFFICIENT_STOCK');
  assert.equal(r.body.error, `Solo hay 10 piezas de "${item.name}" en ${center.name}; quieres sacar 11.`);
  assert.deepEqual({ available: r.body.available, requested: r.body.requested, line: r.body.line, item_id: r.body.item_id },
    { available: 10, requested: 11, line: 1, item_id: item.id });
  assert.equal((await stockOf(token, item.id)).total_stock, 10);
  assert.equal((await stockOf(token, other.id)).total_stock, 5, 'la primera línea tampoco se guardó');
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n, 2);

  assert.equal((await api('POST', '/api/inventory/movements', token, h.movementPayload('SALIDA', center.id, item.id, 10))).status, 201,
    'sacar exactamente la existencia sí se puede');
  const zero = await api('POST', '/api/inventory/movements', token, h.movementPayload('SALIDA', center.id, item.id, 1));
  assert.equal(zero.body.code, 'INSUFFICIENT_STOCK');
  assert.equal(zero.body.error, `No hay existencias de "${item.name}" en ${center.name} para esa fecha.`);
});

test('(b) la existencia es por centro: no se puede sacar de un centro lo que está en otro; el traspaso la mueve', async () => {
  const { token, center, item } = await h.inventorySetup();
  const other = await h.makeCenter(token, { name: 'Bodega Norte' });
  await h.move(token, 'ENTRADA', center.id, item.id, 8);
  assert.equal((await api('POST', '/api/inventory/movements', token, h.movementPayload('SALIDA', other.id, item.id, 1))).body.code,
    'INSUFFICIENT_STOCK');
  const tooMuch = await api('POST', '/api/inventory/movements', token, h.movementPayload('TRASPASO', center.id, item.id, 9, { to_center_id: other.id }));
  assert.equal(tooMuch.body.code, 'INSUFFICIENT_STOCK', 'un traspaso también es una salida del origen');

  const t = await h.move(token, 'TRASPASO', center.id, item.id, 3, { to_center_id: other.id });
  assert.deepEqual(t.map((m) => [m.direction, m.center.id, m.reason]), [['SALIDA', center.id, 'TRASPASO'], ['ENTRADA', other.id, 'TRASPASO']]);
  assert.equal(t[0].transfer_id, t[1].transfer_id);
  const detail = await stockOf(token, item.id);
  assert.equal(detail.total_stock, 8, 'un traspaso no cambia la existencia total');
  assert.deepEqual(Object.fromEntries(detail.stock_by_center.map((s) => [s.center.id, s.stock])), { [center.id]: 5, [other.id]: 3 });
  assert.equal((await api('POST', '/api/inventory/movements', token, h.movementPayload('SALIDA', other.id, item.id, 3))).status, 201);
});

test('(c) con fecha atrasada: una salida que dejaría el kardex en negativo en alguna fecha → 409', async () => {
  const { token, center, item } = await h.inventorySetup();
  await h.move(token, 'ENTRADA', center.id, item.id, 10, { movement_date: daysAgo(10) });
  await h.move(token, 'SALIDA', center.id, item.id, 8, { movement_date: daysAgo(5) });
  await h.move(token, 'ENTRADA', center.id, item.id, 20, { movement_date: daysAgo(1) });
  // Hoy hay 22, pero hace 7 días solo se pueden sacar 2 (el saldo de hace 5 días quedaría negativo)
  const r = await api('POST', '/api/inventory/movements', token, h.movementPayload('SALIDA', center.id, item.id, 3, { movement_date: daysAgo(7) }));
  assert.equal(r.status, 409);
  assert.equal(r.body.available, 2);
  assert.equal(r.body.current_stock, 22);
  assert.match(r.body.error, /en fechas posteriores ya se usaron/);
  assert.equal((await api('POST', '/api/inventory/movements', token, h.movementPayload('SALIDA', center.id, item.id, 2, { movement_date: daysAgo(7) }))).status, 201);
  const k = (await api('GET', `/api/inventory/items/${item.id}/kardex`, token)).body;
  assert.ok(k.items.every((row) => row.balance >= 0), 'ningún saldo negativo en el kardex');
  assert.equal(k.closing_balance, 20);
});

test('(d) dos salidas simultáneas que juntas superan la existencia → una 201 y otra 409', async () => {
  const { token, center, item } = await h.inventorySetup();
  await h.move(token, 'ENTRADA', center.id, item.id, 10);
  const results = await Promise.all([1, 2].map(() => api('POST', '/api/inventory/movements', token, h.movementPayload('SALIDA', center.id, item.id, 6))));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await stockOf(token, item.id)).total_stock, 4);
});

test('(e) el kardex cuadra con las existencias: saldo final, saldo por centro, totales del periodo y consulta SQL de control', async () => {
  const { user, token, category, center } = await h.inventorySetup();
  const north = await h.makeCenter(token, { name: 'Bodega Norte' });
  const chairs = await h.makeItem(token, category.id, { name: 'Silla plegable' });
  const bags = await h.makeItem(token, category.id, { name: 'Bolsa navideña', unit: 'BOLSA' });
  const { token: admin } = await h.adminSession();

  // Secuencia con entradas, salidas, traspasos, fechas atrasadas y anulaciones
  await h.move(token, 'ENTRADA', center.id, chairs.id, 40, { movement_date: daysAgo(30), reason: 'COMPRA', counterpart: 'Mueblería Centro' });
  await h.move(token, 'ENTRADA', center.id, bags.id, 500, { movement_date: daysAgo(28) });
  await h.move(token, 'TRASPASO', center.id, chairs.id, 15, { to_center_id: north.id, movement_date: daysAgo(20) });
  await h.move(token, 'SALIDA', north.id, chairs.id, 5, { movement_date: daysAgo(15), reason: 'MERMA' });
  const out = await h.move(token, 'SALIDA', center.id, bags.id, 120, { movement_date: daysAgo(10) });
  await h.move(token, 'ENTRADA', north.id, bags.id, 80, { movement_date: daysAgo(9), reason: 'DEVOLUCION' });
  const transfer = await h.move(token, 'TRASPASO', center.id, bags.id, 100, { to_center_id: north.id, movement_date: daysAgo(5) });
  assert.equal((await api('POST', `/api/inventory/movements/${out[0].id}/reverse`, token, { reason: 'Se capturó dos veces' })).status, 201);
  assert.equal((await api('POST', `/api/inventory/movements/${transfer[1].id}/reverse`, admin, { reason: 'El traspaso no se hizo' })).status, 201);
  await h.move(token, 'SALIDA', north.id, bags.id, 30, { reason: 'ENTREGA' });
  await h.move(token, 'ENTRADA', center.id, chairs.id, 2, { reason: 'AJUSTE', notes: 'Conteo físico' });
  assert.ok(user.id);

  const control = getDb().prepare(`SELECT item_id, center_id,
      SUM(CASE direction WHEN 'ENTRADA' THEN quantity ELSE -quantity END) AS stock
    FROM inventory_movements GROUP BY item_id, center_id`).all();
  const expected = { [`${chairs.id}-${center.id}`]: 27, [`${chairs.id}-${north.id}`]: 10, [`${bags.id}-${center.id}`]: 500, [`${bags.id}-${north.id}`]: 50 };
  assert.deepEqual(Object.fromEntries(control.map((r) => [`${r.item_id}-${r.center_id}`, r.stock])), expected);

  for (const it of [chairs, bags]) {
    const detail = await stockOf(token, it.id);
    const all = (await api('GET', `/api/inventory/items/${it.id}/kardex?page_size=100`, token)).body;
    assert.equal(all.closing_balance, detail.total_stock, `${it.name}: saldo final del kardex = existencia total`);
    assert.equal(all.current_stock, detail.total_stock);
    assert.equal(all.items[all.items.length - 1].balance, detail.total_stock, 'el último saldo es la existencia');
    assert.equal(all.opening_balance + all.total_in - all.total_out, all.closing_balance);
    assert.equal(detail.stock_by_center.reduce((n, s) => n + s.stock, 0), detail.total_stock);
    // Cada renglón: saldo = saldo anterior ± cantidad
    let running = 0;
    for (const row of all.items) { running += row.in - row.out; assert.equal(row.balance, running); }

    for (const s of detail.stock_by_center) {
      const kc = (await api('GET', `/api/inventory/items/${it.id}/kardex?center_id=${s.center.id}&page_size=100`, token)).body;
      assert.equal(kc.closing_balance, s.stock, `${it.name} en ${s.center.name}`);
      assert.equal(kc.closing_balance, expected[`${it.id}-${s.center.id}`]);
      assert.ok(kc.items.every((row) => row.balance >= 0));
    }
    // Un periodo intermedio también cuadra (saldo inicial + entradas − salidas = saldo final)
    const mid = (await api('GET', `/api/inventory/items/${it.id}/kardex?date_from=${daysAgo(16)}&date_to=${daysAgo(6)}`, token)).body;
    assert.equal(mid.opening_balance + mid.total_in - mid.total_out, mid.closing_balance);
    const sumRange = mid.items.reduce((n, row) => n + row.in - row.out, 0);
    assert.equal(mid.opening_balance + sumRange, mid.closing_balance);
  }

  // El listado de existencias (total y por centro) dice lo mismo
  const list = (await api('GET', '/api/inventory/items?order_by=name', token)).body.items;
  assert.deepEqual(list.map((x) => [x.name, x.total_stock]), [[list[0].name, 0], ['Bolsa navideña', 550], ['Silla plegable', 37]]);
  const byCenter = (await api('GET', `/api/inventory/items?center_id=${north.id}&stock=con`, token)).body.items;
  assert.deepEqual(byCenter.map((x) => [x.id, x.center_stock]).sort(), [[chairs.id, 10], [bags.id, 50]].sort());
});

test('(f) la BD también lo impide: disparador contra existencias negativas y movimientos inmutables', async () => {
  const { token, center, item } = await h.inventorySetup();
  const [m] = await h.move(token, 'ENTRADA', center.id, item.id, 3);
  const db = getDb();
  const insert = (q) => db.prepare(`INSERT INTO inventory_movements (item_id, center_id, direction, reason, quantity, movement_date, created_at)
      VALUES (?, ?, 'SALIDA', 'OTRO', ?, '2026-01-01', '2026-01-01T00:00:00Z')`).run(item.id, center.id, q);
  assert.throws(() => insert(4), /INSUFFICIENT_STOCK/);
  assert.throws(() => db.prepare('UPDATE inventory_movements SET quantity = 30 WHERE id = ?').run(m.id), /no se modifican/);
  assert.throws(() => db.prepare("INSERT INTO inventory_movements (item_id, center_id, direction, reason, quantity, movement_date, created_at) VALUES (?, ?, 'ENTRADA', 'DONACION', 0, '2026-01-01', 'x')").run(item.id, center.id), /CHECK/);
});

test('(g) sin INVENTARIO: la API responde 403 aunque tenga los demás módulos', async () => {
  const { token } = await h.operatorSession(['VOLUNTARIOS', 'BENEFICIARIOS', 'EVENTOS', 'CARTAS', 'CALENDARIO', 'REPORTES']);
  for (const [m, url] of [['GET', '/api/inventory/items'], ['POST', '/api/inventory/movements'], ['GET', '/api/inventory/centers'],
    ['GET', '/api/inventory/items/1/kardex']]) {
    const r = await api(m, url, token, m === 'POST' ? {} : undefined);
    assert.equal(r.status, 403, url);
    assert.equal(r.body.code, 'MODULE_FORBIDDEN');
  }
  assert.equal((await h.request('GET', '/api/inventory/items')).status, 401);
});
