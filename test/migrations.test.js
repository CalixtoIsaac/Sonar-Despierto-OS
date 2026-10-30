const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Database = require('better-sqlite3');
const h = require('./helpers');

const { getDb } = require('../lib/db');
const { MIGRATIONS, LATEST_VERSION, migrate } = require('../lib/migrations');

after(h.stop);

test('BD nueva → versión más reciente (≥ 2); migrar dos veces no hace nada', () => {
  const db = getDb();
  assert.ok(LATEST_VERSION >= 2);
  assert.equal(db.pragma('user_version', { simple: true }), LATEST_VERSION);
  assert.deepEqual(migrate(db), []);
});

test('una BD en versión 1 con un usuario migra y la cuenta queda APROBADA', () => {
  const db = new Database(path.join(h.dataDir, 'v1.db'));
  db.pragma('foreign_keys = ON');
  db.exec(MIGRATIONS[0].up);
  db.pragma('user_version = 1');
  db.prepare(`INSERT INTO users (email, password_hash, role, first_name, last_name, created_at, updated_at)
              VALUES ('a@b.com', 'x', 'ADMIN', 'A', 'B', 'x', 'x')`).run();
  const applied = migrate(db);
  assert.equal(applied[0], 2);
  assert.equal(db.pragma('user_version', { simple: true }), LATEST_VERSION);
  const row = db.prepare('SELECT * FROM users').get();
  assert.equal(row.account_status, 'APROBADA');
  assert.equal(row.requested_modules, null);
  db.close();
});

test("account_status = 'X' → CHECK; borrar al revisor deja reviewed_by_id en NULL", () => {
  h.resetDb();
  const db = getDb();
  const { user: admin } = h.makeUser({ role: 'ADMIN' });
  const { user } = h.makeUser();
  assert.throws(() => db.prepare("UPDATE users SET account_status = 'X' WHERE id = ?").run(user.id), /CHECK/);
  db.prepare('UPDATE users SET reviewed_by_id = ? WHERE id = ?').run(admin.id, user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(admin.id);
  assert.equal(db.prepare('SELECT reviewed_by_id FROM users WHERE id = ?').get(user.id).reviewed_by_id, null);
});
