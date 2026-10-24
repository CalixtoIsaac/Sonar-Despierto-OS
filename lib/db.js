/**
 * Conexión a SQLite con better-sqlite3 (ADR-0009, mismo enfoque que SEMA).
 *
 * Se abre UNA conexión al arrancar y se reutiliza en todas las peticiones: better-sqlite3 es
 * síncrono y, con WAL, suficiente para 2–3 personas a la vez en la oficina.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { getConfig } = require('./config');
const { migrate } = require('./migrations');

let instance = null;

function open(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { timeout: 5000 });
  db.pragma('journal_mode = WAL'); // lecturas simultáneas con una escritura
  db.pragma('foreign_keys = ON'); // en SQLite vienen DESACTIVADAS por defecto
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Conexión compartida (se crea la primera vez). */
function getDb() {
  if (!instance) instance = open(getConfig().dbPath);
  return instance;
}

/** Cierra la conexión (libera el archivo en Windows). */
function closeDb() {
  if (instance) {
    instance.close();
    instance = null;
  }
}

/** Fecha-hora actual en UTC, ISO 8601 (así se guarda en la BD). */
const nowIso = () => new Date().toISOString();

/**
 * Normaliza una fecha leída de la BD a ISO 8601 UTC con "Z".
 * Acepta también el formato de la versión Python ("2026-10-17 18:00:00.123456", sin zona = UTC).
 */
function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(text)) return new Date(text).toISOString();
  const date = new Date(text.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = { open, getDb, closeDb, nowIso, toIso };
