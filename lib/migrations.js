/**
 * Migraciones del esquema (ADR-0009). Sustituyen a Alembic.
 *
 * - Cada migración tiene un número consecutivo; la versión aplicada se guarda en PRAGMA user_version.
 * - Se aplican solas al arrancar (lib/db.js), cada una en su propia transacción.
 * - NUNCA se edita una migración ya publicada: se agrega la siguiente.
 * - SQL lo más estándar posible (ver docs/Arquitectura_y_Convenciones.md §6) para facilitar el paso a
 *   MySQL/PostgreSQL en la fase de nube: enums como TEXT + CHECK, fechas como texto ISO 8601 en UTC,
 *   booleanos como INTEGER 0/1, JSON como TEXT.
 */
const { USER_ROLES, MODULE_KEYS } = require('./modules');

const inList = (values) => values.map((v) => `'${v}'`).join(', ');

const MIGRATIONS = [
  {
    version: 1,
    name: 'usuarios, permisos por módulo y bitácora',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        email                 TEXT    NOT NULL UNIQUE,
        password_hash         TEXT    NOT NULL,
        role                  TEXT    NOT NULL DEFAULT 'OPERADOR' CHECK (role IN (${inList(USER_ROLES)})),
        first_name            TEXT    NOT NULL,
        last_name             TEXT    NOT NULL,
        phone                 TEXT,
        is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        must_change_password  INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
        token_version         INTEGER NOT NULL DEFAULT 0,
        last_login_at         TEXT,
        created_at            TEXT    NOT NULL,
        updated_at            TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_role_is_active ON users (role, is_active);

      CREATE TABLE IF NOT EXISTS user_module_permissions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        module      TEXT    NOT NULL CHECK (module IN (${inList(MODULE_KEYS)})),
        created_at  TEXT    NOT NULL,
        UNIQUE (user_id, module)
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
        action      TEXT    NOT NULL,
        entity      TEXT    NOT NULL,
        entity_id   INTEGER,
        detail      TEXT,
        ip_address  TEXT,
        created_at  TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_entity_id ON audit_logs (entity, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_created_at ON audit_logs (user_id, created_at);
    `
  }
];

const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

/**
 * Base creada por la versión Python (Alembic, revisión 0001): las tablas tienen las mismas columnas,
 * así que se adopta como versión 1 sin perder las cuentas.
 */
function adoptLegacyAlembic(db) {
  if (db.pragma('user_version', { simple: true }) !== 0) return false;
  if (!tableExists(db, 'alembic_version') || !tableExists(db, 'users')) return false;
  db.transaction(() => {
    db.exec('DROP TABLE alembic_version');
    db.pragma('user_version = 1');
  })();
  return true;
}

/** Aplica las migraciones pendientes. Devuelve la lista de versiones aplicadas. */
function migrate(db) {
  const applied = [];
  adoptLegacyAlembic(db);
  const current = db.pragma('user_version', { simple: true });
  if (current > LATEST_VERSION) {
    throw new Error(
      `La base de datos es de una versión más nueva del sistema (esquema ${current}; este programa conoce hasta ${LATEST_VERSION}).`
    );
  }
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      if (typeof m.up === 'function') m.up(db);
      else db.exec(m.up);
      db.pragma(`user_version = ${m.version}`);
    })();
    applied.push(m.version);
  }
  return applied;
}

module.exports = { MIGRATIONS, LATEST_VERSION, migrate, adoptLegacyAlembic };
