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
const { SHIRT_SIZES, VOLUNTEER_AREAS, GENDERS } = require('./catalogs');

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
  },
  {
    version: 2,
    name: 'registro y aprobación de cuentas',
    up: `
      ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'APROBADA'
        CHECK (account_status IN ('PENDIENTE', 'APROBADA', 'RECHAZADA'));
      ALTER TABLE users ADD COLUMN requested_modules TEXT;            -- JSON: ["CARTAS", ...]
      ALTER TABLE users ADD COLUMN registration_note TEXT;            -- ≤ 500
      ALTER TABLE users ADD COLUMN confidentiality_accepted_at TEXT;  -- ISO UTC
      ALTER TABLE users ADD COLUMN reviewed_by_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
      ALTER TABLE users ADD COLUMN reviewed_at TEXT;
      ALTER TABLE users ADD COLUMN review_note TEXT;                  -- nota de aprobación o motivo del rechazo
      CREATE INDEX IF NOT EXISTS idx_users_account_status ON users (account_status);
    `
  },
  {
    version: 3,
    name: 'personas: escuelas, tutores, voluntarios y niños (ADR-0004)',
    // name_key / sort_key: texto normalizado (sin acentos, minúsculas) que calcula lib/text.js
    up: `
      CREATE TABLE IF NOT EXISTS schools (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        name           TEXT    NOT NULL,
        name_key       TEXT    NOT NULL,
        cct            TEXT    UNIQUE,                    -- Clave de Centro de Trabajo (SEP), en mayúsculas
        zone           TEXT,
        zone_key       TEXT    NOT NULL DEFAULT '',
        address        TEXT,
        contact_name   TEXT,
        contact_phone  TEXT,
        is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_by_id  INTEGER REFERENCES users (id) ON DELETE SET NULL,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL,
        UNIQUE (name_key, zone_key)
      );

      CREATE TABLE IF NOT EXISTS tutors (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name     TEXT    NOT NULL,
        last_name      TEXT    NOT NULL,
        name_key       TEXT    NOT NULL,
        sort_key       TEXT    NOT NULL,
        phone          TEXT    NOT NULL,
        email          TEXT,
        position       TEXT,                              -- "Profesora 3°A", "Director", "Líder comunitario"
        school_id      INTEGER REFERENCES schools (id) ON DELETE RESTRICT,
        notes          TEXT,
        is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_by_id  INTEGER REFERENCES users (id) ON DELETE SET NULL,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tutors_name_key_phone ON tutors (name_key, phone);
      CREATE INDEX IF NOT EXISTS idx_tutors_school_id ON tutors (school_id);

      CREATE TABLE IF NOT EXISTS volunteers (
        id                              INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name                      TEXT    NOT NULL,
        last_name                       TEXT    NOT NULL,
        name_key                        TEXT    NOT NULL,
        sort_key                        TEXT    NOT NULL,
        email                           TEXT    UNIQUE,
        phone                           TEXT    NOT NULL,
        birth_date                      TEXT,             -- YYYY-MM-DD
        city                            TEXT,
        occupation                      TEXT,
        emergency_contact_name          TEXT    NOT NULL,
        emergency_contact_phone         TEXT    NOT NULL,
        emergency_contact_relationship  TEXT,
        shirt_size                      TEXT    NOT NULL CHECK (shirt_size IN (${inList(SHIRT_SIZES)})),
        area_of_interest                TEXT    NOT NULL CHECK (area_of_interest IN (${inList(VOLUNTEER_AREAS)})),
        medical_notes                   TEXT,
        notes                           TEXT,
        privacy_consent_at              TEXT    NOT NULL,
        is_active                       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_by_id                   INTEGER REFERENCES users (id) ON DELETE SET NULL,
        created_at                      TEXT    NOT NULL,
        updated_at                      TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_volunteers_name_key_phone ON volunteers (name_key, phone);
      CREATE INDEX IF NOT EXISTS idx_volunteers_sort_key ON volunteers (sort_key);

      CREATE TABLE IF NOT EXISTS children (
        id                     INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name             TEXT    NOT NULL,
        last_name              TEXT    NOT NULL,
        name_key               TEXT    NOT NULL,
        sort_key               TEXT    NOT NULL,
        birth_date             TEXT    NOT NULL,          -- YYYY-MM-DD
        gender                 TEXT    NOT NULL DEFAULT 'NO_ESPECIFICA' CHECK (gender IN (${inList(GENDERS)})),
        school_id              INTEGER REFERENCES schools (id) ON DELETE RESTRICT,
        grade                  TEXT,
        group_name             TEXT,
        tutor_id               INTEGER REFERENCES tutors (id) ON DELETE RESTRICT,
        guardian_name          TEXT    NOT NULL,          -- madre, padre o tutor legal
        guardian_relationship  TEXT,
        guardian_phone         TEXT,
        guardian_consent       INTEGER NOT NULL DEFAULT 0 CHECK (guardian_consent IN (0, 1)),
        guardian_consent_at    TEXT,
        notes                  TEXT,
        is_active              INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_by_id          INTEGER REFERENCES users (id) ON DELETE SET NULL,
        created_at             TEXT    NOT NULL,
        updated_at             TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_children_identity ON children (name_key, birth_date);
      CREATE INDEX IF NOT EXISTS idx_children_sort_key ON children (sort_key);
      CREATE INDEX IF NOT EXISTS idx_children_school_id ON children (school_id);
      CREATE INDEX IF NOT EXISTS idx_children_tutor_id ON children (tutor_id);
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
