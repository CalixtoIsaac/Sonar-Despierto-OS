const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
require('./helpers');

const { parsePageParams, paginate, likePattern } = require('../lib/pagination');

function sample(n) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
  const ins = db.prepare('INSERT INTO t (name) VALUES (?)');
  for (let i = 1; i <= n; i++) ins.run(`fila ${i}`);
  return db;
}

const page = (db, query) => paginate(db, { select: '*', from: 't', orderBy: 'id' }, parsePageParams(query));

test('45 filas en páginas de 20: 3 páginas, la 3.ª con 5; la 4.ª vacía', () => {
  const db = sample(45);
  const p1 = page(db, { page_size: '20' });
  assert.deepEqual({ ...p1, items: p1.items.length }, { items: 20, total: 45, page: 1, page_size: 20, pages: 3 });
  assert.equal(page(db, { page: '3', page_size: '20' }).items.length, 5);
  const p4 = page(db, { page: '4', page_size: '20' });
  assert.deepEqual(p4.items, []);
  assert.equal(p4.total, 45);
});

test('sin filas → pages = 0', () => {
  assert.deepEqual(page(sample(0), {}), { items: [], total: 0, page: 1, page_size: 20, pages: 0 });
});

test('parámetros inválidos → 422', () => {
  for (const q of [{ page_size: '101' }, { page: '0' }, { page: 'abc' }, { page_size: '0' }]) {
    assert.throws(() => parsePageParams(q), (err) => err.status === 422 && err.details.length === 1, JSON.stringify(q));
  }
});

test('likePattern escapa % y _ y encuentra el texto literal', () => {
  assert.equal(likePattern('50%_a'), '%50\\%\\_a%');
  const db = new Database(':memory:');
  db.exec("CREATE TABLE t (name TEXT); INSERT INTO t VALUES ('Descuento 50%_a'), ('Descuento 50xya'), ('50 a')");
  const rows = db.prepare("SELECT name FROM t WHERE lower(name) LIKE ? ESCAPE '\\'").all(likePattern('50%_A'));
  assert.deepEqual(rows.map((r) => r.name), ['Descuento 50%_a']);
});
