const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const h = require('./helpers');

const { getConfig } = require('../lib/config');
const { open, getDb, toIso } = require('../lib/db');
const { LATEST_VERSION, migrate } = require('../lib/migrations');
const users = require('../services/users');

after(h.stop);

test('la BD queda en la versión más reciente con claves foráneas y WAL activas', () => {
  const db = getDb();
  assert.equal(db.pragma('user_version', { simple: true }), LATEST_VERSION);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  assert.deepEqual(migrate(db), [], 'volver a migrar no hace nada');
});

test('las restricciones CHECK y UNIQUE protegen los datos', () => {
  h.resetDb();
  const { user } = h.makeUser();
  const db = getDb();
  assert.throws(() => db.prepare("UPDATE users SET role = 'JEFE' WHERE id = ?").run(user.id), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO user_module_permissions (user_id, module, created_at) VALUES (?, 'NO_EXISTE', 'x')").run(user.id), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO user_module_permissions (user_id, module, created_at) VALUES (?, 'CARTAS', 'x')").run(user.id), /UNIQUE/);
  assert.throws(() => users.createUser({ email: user.email.toUpperCase(), password: 'Segura1234', firstName: 'A', lastName: 'B' }),
    (err) => err.code === 'EMAIL_ALREADY_EXISTS' && err.status === 409);
});

test('borrar un usuario borra sus permisos y deja la bitácora sin actor', () => {
  h.resetDb();
  const { user, password } = h.makeUser();
  const db = getDb();
  db.prepare("INSERT INTO audit_logs (user_id, action, entity, created_at) VALUES (?, 'LOGIN', 'users', 'x')").run(user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_module_permissions').get().n, 0);
  assert.equal(db.prepare('SELECT user_id FROM audit_logs').get().user_id, null);
  assert.ok(password);
});

test('una BD de la versión Python (Alembic 0001) se adopta sin perder las cuentas', () => {
  const file = path.join(h.dataDir, 'legacy.db');
  const legacy = new Database(file);
  legacy.exec(`
    CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
    INSERT INTO alembic_version VALUES ('0001');
    CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL, first_name VARCHAR(80) NOT NULL, last_name VARCHAR(120) NOT NULL, phone VARCHAR(20),
      is_active BOOLEAN NOT NULL, must_change_password BOOLEAN NOT NULL, token_version INTEGER NOT NULL,
      last_login_at DATETIME, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);
    CREATE TABLE user_module_permissions (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module VARCHAR(30) NOT NULL, created_at DATETIME NOT NULL, UNIQUE (user_id, module));
    CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action VARCHAR(30) NOT NULL,
      entity VARCHAR(50) NOT NULL, entity_id BIGINT, detail JSON, ip_address VARCHAR(45), created_at DATETIME NOT NULL);
  `);
  // Hash bcrypt generado por Python ($2b$) para "Segura1234"
  const hash = require('bcryptjs').hashSync('Segura1234', 4).replace(/^\$2a\$/, '$2b$');
  legacy.prepare(`INSERT INTO users VALUES (1, 'admin@sonardespierto.org', ?, 'ADMIN', 'Administrador', 'General', NULL,
    1, 0, 0, '2026-10-17 18:00:00.123456', '2026-10-17 17:00:00.000000', '2026-10-17 17:00:00.000000')`).run(hash);
  legacy.close();

  const db = open(file);
  assert.equal(db.pragma('user_version', { simple: true }), LATEST_VERSION);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'alembic_version'").get().n, 0);
  const row = db.prepare('SELECT * FROM users WHERE id = 1').get();
  assert.equal(row.email, 'admin@sonardespierto.org');
  assert.equal(toIso(row.last_login_at), '2026-10-17T18:00:00.123Z');
  assert.ok(require('bcryptjs').compareSync('Segura1234', row.password_hash), 'bcryptjs verifica hashes $2b$ de Python');
  db.close();
});

test('toIso acepta ISO con Z y el formato de la versión Python', () => {
  assert.equal(toIso('2026-10-17T18:00:00.000Z'), '2026-10-17T18:00:00.000Z');
  assert.equal(toIso('2026-10-17 18:00:00'), '2026-10-17T18:00:00.000Z');
  assert.equal(toIso(null), null);
});

test('administrador inicial: se crea una sola vez y, sin contraseña configurada, deja credenciales temporales', () => {
  h.resetDb();
  const config = { ...getConfig(), firstAdminPassword: '' };
  const email = users.ensureFirstAdmin(config);
  assert.equal(email, 'admin@sonardespierto.org');
  assert.equal(users.ensureFirstAdmin(config), null, 'la segunda vez no hace nada');
  const admin = users.getUserByEmail(email);
  assert.equal(admin.role, 'ADMIN');
  assert.equal(admin.must_change_password, 1);
  const text = fs.readFileSync(users.credentialsPath(), 'utf8');
  const temp = text.match(/Contraseña temporal: (\S+)/)[1];
  assert.equal(temp.length, 12);
  assert.ok(require('bcryptjs').compareSync(temp, admin.password_hash));
});

test('reset-admin asigna una contraseña temporal, reactiva la cuenta y cierra sesiones', () => {
  h.resetDb();
  const { user } = h.makeUser({ role: 'ADMIN', active: false });
  const { password } = users.resetPasswordToTemporary();
  const after = users.getUser(user.id);
  assert.equal(after.is_active, 1);
  assert.equal(after.must_change_password, 1);
  assert.equal(after.token_version, user.token_version + 1);
  assert.ok(require('bcryptjs').compareSync(password, after.password_hash));
  const log = getDb().prepare("SELECT * FROM audit_logs WHERE action = 'PASSWORD_RESET'").get();
  assert.deepEqual(JSON.parse(log.detail), { via: 'cli' });
  assert.equal(log.detail.includes(password), false);
});
