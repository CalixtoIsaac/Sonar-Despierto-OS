/**
 * Respaldos y restauración (ADR-0015).
 *
 * Un respaldo es UN archivo .zip en {DATA_DIR}/backups con:
 *   manifest.json  (primero y sin comprimir: se lee sin abrir todo el ZIP)
 *   sonar.db       (copia en caliente con la API de respaldo de SQLite: no hace falta cerrar el sistema)
 *   uploads/...    (fotos de las cartas, ADR-0011)
 * NO lleva secret.key, config.env ni logs.
 *
 * Restaurar: valida el ZIP y la base (integridad, versión de esquema, que haya un ADMIN activo),
 * hace un respaldo "antes de restaurar", reemplaza la base y las fotos de forma síncrona (ninguna
 * otra petición se intercala en Node), aplica las migraciones pendientes y cierra TODAS las sesiones.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const { getConfig } = require('../lib/config');
const { getDb, closeDb } = require('../lib/db');
const { AppError } = require('../lib/errors');
const { getLogger } = require('../lib/logger');
const { LATEST_VERSION } = require('../lib/migrations');
const { todayLocal } = require('../lib/text');
const { zip, unzip, ZipError, safeEntryName } = require('../lib/zip');
const { recordAudit } = require('./audit');
const { version: APP_VERSION } = require('../package.json');

const APP_ID = 'sonar-despierto';
const FORMAT = 1;
const ENTITY = 'backups';
const CONFIRM_WORD = 'RESTAURAR';

/** Tipos de respaldo: clave de la API → parte del nombre del archivo y cuántos se conservan. */
const KINDS = Object.freeze({
  AUTO: { file: 'auto', label: 'Automático' },
  MANUAL: { file: 'manual', label: 'Manual', keep: 30 },
  ANTES_DE_RESTAURAR: { file: 'antes-de-restaurar', label: 'Antes de restaurar', keep: 5 },
  ANTES_DE_ACTUALIZAR: { file: 'antes-de-actualizar', label: 'Antes de actualizar', keep: 5 },
  IMPORTADO: { file: 'importado', label: 'Subido desde un archivo', keep: 5 }
});
const KIND_BY_FILE = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.file, k]));
const NAME_RE = /^sonar-(auto|manual|antes-de-restaurar|antes-de-actualizar|importado)-(\d{8})-(\d{6})(?:-(\d{1,3}))?\.zip$/;

// Tablas que se cuentan en el manifiesto (si existen en esa versión del esquema)
const COUNT_TABLES = ['users', 'volunteers', 'schools', 'tutors', 'children', 'events', 'letters', 'activities', 'inventory_items', 'inventory_movements'];

const backupsDir = (config = getConfig()) => path.join(config.dataDir, 'backups');
const uploadsDir = (config = getConfig()) => path.join(config.dataDir, 'uploads');

let busy = null; // 'backup' | 'restore' | null
const autoState = { enabled: false, lastRunAt: null, lastError: null, nextCheckAt: null, timer: null };

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

/** "20261105-183012" en hora de Veracruz. */
function localStamp(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

/** Nombre nuevo; si ya hubo otro en el mismo segundo, el consecutivo siguiente al MAYOR (nunca reusa un hueco). */
function uniqueName(kind, now, dir) {
  const stamp = localStamp(now);
  const base = `sonar-${KINDS[kind].file}-${stamp}`;
  let max = 0;
  for (const n of fs.readdirSync(dir)) {
    const m = NAME_RE.exec(n.replace(/\.part$/, ''));
    if (m && m[1] === KINDS[kind].file && `${m[2]}-${m[3]}` === stamp) max = Math.max(max, Number(m[4] || 1));
  }
  return max === 0 ? `${base}.zip` : `${base}-${max + 1}.zip`;
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Archivos de una carpeta, recursivo: [{ rel: 'letters/x.jpg', abs }]. */
function walk(dir, base = dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out);
    else if (e.isFile()) out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), abs });
  }
  return out;
}

function removeQuietly(target) {
  try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* se ignora */ }
}

/** Borra una base temporal con sus archivos -wal, -shm y -journal. */
function removeDbFiles(file) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) removeQuietly(file + suffix);
}

/**
 * Abre una COPIA temporal de una base y la deja como archivo único (journal_mode = DELETE): así el
 * respaldo no depende de archivos -wal y abrirla no crea archivos extra.
 */
function openStandalone(file) {
  const db = new Database(file, { fileMustExist: true });
  db.pragma('journal_mode = DELETE');
  return db;
}

/** Datos de una base SQLite abierta: versión de esquema, conteos y si hay un ADMIN activo. */
function inspectDb(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  const counts = {};
  for (const t of COUNT_TABLES) counts[t] = tables.has(t) ? db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n : null;
  let activeAdmins = 0;
  if (tables.has('users')) {
    const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    const approved = cols.includes('account_status') ? " AND account_status = 'APROBADA'" : '';
    activeAdmins = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND is_active = 1${approved}`).get().n;
  }
  return { schemaVersion: db.pragma('user_version', { simple: true }), counts, activeAdmins, hasUsers: tables.has('users') };
}

// ---------------------------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------------------------

/**
 * Crea un respaldo. kind: AUTO | MANUAL | ANTES_DE_RESTAURAR | ANTES_DE_ACTUALIZAR.
 * db puede ser otra conexión (p. ej. de solo lectura antes de migrar); audit: false no escribe en la bitácora.
 */
async function createBackup({ kind = 'MANUAL', actor = null, ip = null, via = 'app', audit = true,
  db = null, config = getConfig() } = {}) {
  if (!KINDS[kind] || kind === 'IMPORTADO') throw new Error(`Tipo de respaldo no válido: ${kind}`);
  if (busy && kind !== 'ANTES_DE_RESTAURAR') {
    throw new AppError(409, 'BACKUP_IN_PROGRESS', 'Ya se está haciendo un respaldo o una restauración. Espera un momento.');
  }
  const owner = !busy;
  if (owner) busy = 'backup';
  const dir = backupsDir(config);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${crypto.randomUUID()}.db`);
  const conn = db || getDb();
  try {
    await conn.backup(tmp);
    const check = openStandalone(tmp);
    let info;
    try {
      const integrity = check.pragma('integrity_check', { simple: true });
      if (integrity !== 'ok') throw new AppError(500, 'BACKUP_FAILED', 'La copia de la base de datos salió dañada; no se guardó el respaldo.');
      info = inspectDb(check);
    } finally {
      check.close();
    }
    const dbBuf = fs.readFileSync(tmp);
    const uploads = walk(uploadsDir(config)).filter((f) => safeEntryName(f.rel));
    const now = new Date();
    const manifest = {
      app: APP_ID,
      format: FORMAT,
      kind,
      created_at: now.toISOString(),
      app_version: APP_VERSION,
      schema_version: info.schemaVersion,
      db_bytes: dbBuf.length,
      db_sha256: sha256(dbBuf),
      uploads: uploads.length,
      counts: info.counts,
      created_by: actor ? actor.email : null,
      via,
      computer: os.hostname()
    };
    const buf = zip([
      { name: 'manifest.json', data: JSON.stringify(manifest, null, 2), store: true },
      { name: 'sonar.db', data: dbBuf },
      ...uploads.map((f) => ({ name: `uploads/${f.rel}`, data: fs.readFileSync(f.abs), store: true }))
    ], now);
    const name = uniqueName(kind, now, dir);
    const final = path.join(dir, name);
    fs.writeFileSync(`${final}.part`, buf);
    fs.renameSync(`${final}.part`, final);

    let copy = null;
    if (config.backupCopyDir) copy = copyToExtra(final, name, config);
    if (audit) {
      recordAudit({
        action: 'BACKUP_CREATED', entity: ENTITY, userId: actor ? actor.id : null, ip,
        detail: { file: name, kind, bytes: buf.length, uploads: uploads.length, schema_version: info.schemaVersion, via,
          copy: copy ? (copy.ok ? 'ok' : 'error') : null }
      }, conn);
    }
    prune(kind, config, name);
    getLogger().info(`Respaldo ${KINDS[kind].label.toLowerCase()} creado: ${name} (${Math.round(buf.length / 1024)} KB)`);
    return { ...describeFile(final, manifest), copy };
  } catch (err) {
    getLogger().error('No se pudo crear el respaldo', err);
    if (err instanceof AppError) throw err;
    throw new AppError(500, 'BACKUP_FAILED', `No se pudo crear el respaldo: ${err.message}`);
  } finally {
    removeDbFiles(tmp);
    if (owner) busy = null;
  }
}

/** Copia extra (otra unidad, USB, carpeta en la nube): un error aquí no invalida el respaldo. */
function copyToExtra(file, name, config) {
  try {
    fs.mkdirSync(config.backupCopyDir, { recursive: true });
    fs.copyFileSync(file, path.join(config.backupCopyDir, name));
    pruneDir(config.backupCopyDir, KIND_BY_FILE[NAME_RE.exec(name)[1]], keepFor(KIND_BY_FILE[NAME_RE.exec(name)[1]], config), name);
    return { ok: true, dir: config.backupCopyDir };
  } catch (err) {
    getLogger().warn(`No se pudo copiar el respaldo a ${config.backupCopyDir}: ${err.message}`);
    return { ok: false, dir: config.backupCopyDir, error: err.message };
  }
}

const keepFor = (kind, config) => (kind === 'AUTO' ? config.backupKeep : KINDS[kind].keep);

function pruneDir(dir, kind, keep, protect) {
  const files = fs.readdirSync(dir)
    .map((name) => ({ name, m: NAME_RE.exec(name) }))
    .filter((f) => f.m && KIND_BY_FILE[f.m[1]] === kind)
    .map((f) => ({ ...f, key: `${f.m[2]}${f.m[3]}${String(f.m[4] || 1).padStart(3, '0')}` }))
    .sort((a, b) => (a.key < b.key ? 1 : -1)); // el nombre lleva fecha, hora y consecutivo: más reciente primero
  for (const f of files.slice(keep)) {
    if (f.name !== protect) removeQuietly(path.join(dir, f.name));
  }
}

/** Conserva los N más recientes de cada tipo. */
function prune(kind, config = getConfig(), protect = null) {
  try { pruneDir(backupsDir(config), kind, keepFor(kind, config), protect); } catch (err) {
    getLogger().warn(`No se pudieron depurar los respaldos: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Leer y listar
// ---------------------------------------------------------------------------------------------

/** Lee manifest.json (primera entrada, sin comprimir) sin cargar todo el ZIP. */
function readManifest(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(30);
    if (fs.readSync(fd, head, 0, 30, 0) < 30 || head.readUInt32LE(0) !== 0x04034b50) return null;
    const method = head.readUInt16LE(8);
    const size = head.readUInt32LE(18);
    const nameLen = head.readUInt16LE(26);
    const extraLen = head.readUInt16LE(28);
    if (method !== 0 || size > 1024 * 1024) return null;
    const rest = Buffer.alloc(nameLen + extraLen + size);
    fs.readSync(fd, rest, 0, rest.length, 30);
    if (rest.toString('utf8', 0, nameLen) !== 'manifest.json') return null;
    const manifest = JSON.parse(rest.toString('utf8', nameLen + extraLen));
    return manifest && manifest.app === APP_ID ? manifest : null;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

function describeFile(file, manifest = readManifest(file)) {
  const name = path.basename(file);
  const m = NAME_RE.exec(name);
  const stat = fs.statSync(file);
  const kind = m ? KIND_BY_FILE[m[1]] : 'IMPORTADO';
  const schema = manifest ? manifest.schema_version : null;
  return {
    name,
    kind,
    kind_label: KINDS[kind].label,
    created_at: manifest ? manifest.created_at : stat.mtime.toISOString(),
    size_bytes: stat.size,
    valid: Boolean(manifest),
    app_version: manifest ? manifest.app_version : null,
    schema_version: schema,
    uploads: manifest ? manifest.uploads : null,
    counts: manifest ? manifest.counts : null,
    created_by: manifest ? manifest.created_by : null,
    can_restore: Boolean(manifest) && Number.isInteger(schema) && schema <= LATEST_VERSION
  };
}

function listBackups(config = getConfig()) {
  const dir = backupsDir(config);
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => NAME_RE.test(n)); } catch { /* aún no existe */ }
  const items = names.map((n) => describeFile(path.join(dir, n)))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const lastAuto = items.find((i) => i.kind === 'AUTO');
  const last = items[0];
  return {
    items,
    settings: {
      auto_enabled: autoState.enabled,
      keep: config.backupKeep,
      dir,
      copy_dir: config.backupCopyDir || null,
      last_backup_at: last ? last.created_at : null,
      last_auto_at: lastAuto ? lastAuto.created_at : null,
      last_error: autoState.lastError,
      next_check_at: autoState.nextCheckAt,
      schema_version: LATEST_VERSION,
      app_version: APP_VERSION,
      max_restore_mb: config.maxRestoreMb
    }
  };
}

/** Ruta absoluta de un respaldo de la lista, o 404 (el nombre se valida: nada de "..\"). */
function backupPath(name, config = getConfig()) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new AppError(404, 'NOT_FOUND', 'No existe ese respaldo.');
  const file = path.join(backupsDir(config), name);
  if (!fs.existsSync(file)) throw new AppError(404, 'NOT_FOUND', 'No existe ese respaldo.');
  return file;
}

function recordDownload(actor, name, ip, db = getDb()) {
  const file = backupPath(name);
  recordAudit({ action: 'BACKUP_DOWNLOADED', entity: ENTITY, userId: actor.id, ip,
    detail: { file: name, bytes: fs.statSync(file).size } }, db);
  return file;
}

// ---------------------------------------------------------------------------------------------
// Validar y restaurar
// ---------------------------------------------------------------------------------------------

const invalid = (message, code = 'BACKUP_INVALID') => new AppError(422, code, message);

/** Abre el ZIP y lo valida por completo. Devuelve { manifest, dbBuf, uploads: [{ rel, data }] }. */
function parseBackup(buf, config = getConfig()) {
  let entries;
  try {
    entries = unzip(buf, { maxBytes: config.maxRestoreMb * 1024 * 1024 * 2 });
  } catch (err) {
    throw invalid(err instanceof ZipError ? `El archivo no es un respaldo válido: ${err.message}` : 'El archivo no es un respaldo válido.');
  }
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  let manifest = null;
  try { manifest = JSON.parse(byName.get('manifest.json').toString('utf8')); } catch { /* sin manifiesto */ }
  if (!manifest || manifest.app !== APP_ID) throw invalid('El archivo no es un respaldo de Soñar Despierto.');
  if (manifest.format !== FORMAT) throw invalid('El respaldo tiene un formato que esta versión no conoce.', 'BACKUP_TOO_NEW');
  const dbBuf = byName.get('sonar.db');
  if (!dbBuf) throw invalid('El respaldo no contiene la base de datos.');
  if (manifest.db_sha256 && manifest.db_sha256 !== sha256(dbBuf)) throw invalid('La base de datos del respaldo está dañada.');
  if (Number.isInteger(manifest.schema_version) && manifest.schema_version > LATEST_VERSION) {
    throw invalid(`El respaldo es de una versión más nueva del sistema (${manifest.app_version}). Actualiza el programa antes de restaurarlo.`, 'BACKUP_TOO_NEW');
  }
  const uploads = [];
  for (const e of entries) {
    if (e.name === 'manifest.json' || e.name === 'sonar.db') continue;
    if (!e.name.startsWith('uploads/')) throw invalid(`El respaldo contiene un archivo inesperado: ${e.name}`);
    uploads.push({ rel: e.name.slice('uploads/'.length), data: e.data });
  }
  return { manifest, dbBuf, uploads };
}

/** Escribe la base del respaldo en un archivo temporal y la revisa. */
function checkDbFile(tmp) {
  let db;
  try {
    db = openStandalone(tmp);
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw invalid('La base de datos del respaldo está dañada.');
    const info = inspectDb(db);
    if (info.schemaVersion > LATEST_VERSION) throw invalid('El respaldo es de una versión más nueva del sistema. Actualiza el programa antes de restaurarlo.', 'BACKUP_TOO_NEW');
    if (!info.hasUsers || info.activeAdmins === 0) {
      throw invalid('El respaldo no tiene ningún administrador activo: no podrías entrar al sistema después de restaurarlo.', 'BACKUP_NO_ADMIN');
    }
    return info;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw invalid('El archivo del respaldo no contiene una base de datos SQLite válida.');
  } finally {
    if (db) db.close();
  }
}

/** Revisa un respaldo sin restaurarlo (lo usa la CLI y la pantalla antes de confirmar). */
function verifyBackupFile(file, config = getConfig()) {
  const { manifest, dbBuf, uploads } = parseBackup(fs.readFileSync(file), config);
  const tmp = path.join(backupsDir(config), `.verificar-${crypto.randomUUID()}.db`);
  try {
    fs.writeFileSync(tmp, dbBuf);
    const info = checkDbFile(tmp);
    return { manifest, info, uploads: uploads.length };
  } finally {
    removeDbFiles(tmp);
  }
}

/**
 * Restaura el respaldo `file` (ruta absoluta). actor: usuario que restaura (null desde la CLI).
 * Devuelve { restored, pre_backup, sessions_closed }.
 */
async function restoreBackup(file, { actor = null, ip = null, via = 'app', config = getConfig() } = {}) {
  if (busy) throw new AppError(409, 'BACKUP_IN_PROGRESS', 'Ya se está haciendo un respaldo o una restauración. Espera un momento.');
  busy = 'restore';
  const dir = backupsDir(config);
  const stamp = crypto.randomUUID().slice(0, 8);
  const tmpDb = path.join(dir, `.restaurar-${stamp}.db`);
  const tmpUploads = path.join(config.dataDir, `.uploads-restaurar-${stamp}`);
  const dbPath = config.dbPath;
  const oldDb = `${dbPath}.antes-de-restaurar-${stamp}`;
  const oldUploads = path.join(config.dataDir, `.uploads-anterior-${stamp}`);
  const name = path.basename(file);
  try {
    // 1. Validar todo ANTES de tocar nada
    const { manifest, dbBuf, uploads } = parseBackup(fs.readFileSync(file), config);
    fs.writeFileSync(tmpDb, dbBuf);
    const info = checkDbFile(tmpDb);
    fs.mkdirSync(tmpUploads, { recursive: true });
    for (const u of uploads) {
      const target = path.join(tmpUploads, ...u.rel.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, u.data, { mode: 0o600 });
    }

    // 2. Respaldo de lo que hay ahora (por si hay que deshacer)
    const pre = await createBackup({ kind: 'ANTES_DE_RESTAURAR', actor, ip, via, config });

    // 3. Reemplazo síncrono: ninguna petición se atiende entre estos pasos
    closeDb();
    const moved = [];
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        if (fs.existsSync(dbPath + suffix)) { fs.renameSync(dbPath + suffix, oldDb + suffix); moved.push(suffix); }
      }
      fs.copyFileSync(tmpDb, dbPath);
      const up = uploadsDir(config);
      if (fs.existsSync(up)) fs.renameSync(up, oldUploads);
      fs.renameSync(tmpUploads, up);

      const db = getDb(); // aplica las migraciones pendientes del respaldo
      const after = db.pragma('user_version', { simple: true });
      const restoredActor = actor
        ? db.prepare('SELECT id FROM users WHERE id = ? AND email = ?').get(actor.id, actor.email) : null;
      db.transaction(() => {
        db.prepare('UPDATE users SET token_version = token_version + 1').run(); // cierra todas las sesiones
        recordAudit({
          action: 'BACKUP_RESTORED', entity: ENTITY, userId: restoredActor ? restoredActor.id : null, ip,
          detail: { file: name, backup_created_at: manifest.created_at, backup_app_version: manifest.app_version,
            schema_from: info.schemaVersion, schema_to: after, uploads: uploads.length, pre_backup: pre.name,
            by: actor ? actor.email : null, via }
        }, db);
      })();
    } catch (err) {
      // Deshacer: volver a dejar la base y las fotos como estaban
      closeDb();
      for (const suffix of ['', '-wal', '-shm']) removeQuietly(dbPath + suffix);
      for (const suffix of moved) { try { fs.renameSync(oldDb + suffix, dbPath + suffix); } catch { /* se intenta lo demás */ } }
      if (fs.existsSync(oldUploads)) { removeQuietly(uploadsDir(config)); try { fs.renameSync(oldUploads, uploadsDir(config)); } catch { /* */ } }
      getDb();
      throw err;
    }
    for (const suffix of ['', '-wal', '-shm']) removeQuietly(oldDb + suffix);
    removeQuietly(oldUploads);
    getLogger().info(`Respaldo restaurado: ${name} (esquema ${info.schemaVersion} → ${LATEST_VERSION}); sesiones cerradas`);
    return {
      restored: describeFile(file),
      pre_backup: pre,
      schema_from: info.schemaVersion,
      schema_to: LATEST_VERSION,
      sessions_closed: true
    };
  } catch (err) {
    if (!(err instanceof AppError)) getLogger().error('No se pudo restaurar el respaldo', err);
    if (err instanceof AppError) throw err;
    throw new AppError(500, 'RESTORE_FAILED', `No se pudo restaurar el respaldo; los datos quedaron como estaban. (${err.message})`);
  } finally {
    removeDbFiles(tmpDb);
    removeQuietly(tmpUploads);
    busy = null;
  }
}

/** Guarda un archivo subido como respaldo IMPORTADO (para restaurarlo después). */
function importedPath(config = getConfig()) {
  const dir = backupsDir(config);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, uniqueName('IMPORTADO', new Date(), dir));
}

// ---------------------------------------------------------------------------------------------
// Respaldo automático diario y antes de actualizar
// ---------------------------------------------------------------------------------------------

const CHECK_EVERY_MS = 30 * 60e3;
const FIRST_CHECK_MS = 60e3;

/** ¿Ya hay un respaldo automático de hoy (fecha de Veracruz)? */
function hasAutoBackupToday(config = getConfig(), now = new Date()) {
  const today = todayLocal(now).replace(/-/g, '');
  try {
    return fs.readdirSync(backupsDir(config)).some((n) => {
      const m = NAME_RE.exec(n);
      return m && m[1] === 'auto' && m[2] === today;
    });
  } catch {
    return false;
  }
}

async function runAutoBackupIfDue(config = getConfig()) {
  autoState.nextCheckAt = new Date(Date.now() + CHECK_EVERY_MS).toISOString();
  if (busy || hasAutoBackupToday(config)) return null;
  try {
    const b = await createBackup({ kind: 'AUTO', via: 'auto', config });
    autoState.lastRunAt = b.created_at;
    autoState.lastError = b.copy && !b.copy.ok ? `No se pudo copiar a ${b.copy.dir}: ${b.copy.error}` : null;
    return b;
  } catch (err) {
    autoState.lastError = err.message;
    return null;
  }
}

/** Arranca el respaldo diario (server.js). Revisa al minuto de abrir y luego cada 30 minutos. */
function startAutoBackups(config = getConfig()) {
  if (!config.backupAuto || autoState.timer) return;
  autoState.enabled = true;
  autoState.nextCheckAt = new Date(Date.now() + FIRST_CHECK_MS).toISOString();
  const first = setTimeout(() => runAutoBackupIfDue(config), FIRST_CHECK_MS);
  first.unref();
  autoState.timer = setInterval(() => runAutoBackupIfDue(config), CHECK_EVERY_MS);
  autoState.timer.unref();
}

function stopAutoBackups() {
  if (autoState.timer) clearInterval(autoState.timer);
  autoState.timer = null;
  autoState.enabled = false;
}

/**
 * Antes de abrir la base con un programa más nuevo (actualización): si tiene migraciones pendientes,
 * guarda un respaldo con la base tal como está. Devuelve el respaldo o null.
 */
async function backupBeforeUpgrade(config = getConfig()) {
  if (!fs.existsSync(config.dbPath)) return null;
  let raw;
  try {
    raw = new Database(config.dbPath, { readonly: true, fileMustExist: true });
    const current = raw.pragma('user_version', { simple: true });
    if (current === 0 || current >= LATEST_VERSION) return null;
    return await createBackup({ kind: 'ANTES_DE_ACTUALIZAR', via: 'actualizacion', audit: false, db: raw, config });
  } finally {
    if (raw) raw.close();
  }
}

module.exports = {
  KINDS, CONFIRM_WORD, NAME_RE, backupsDir, localStamp,
  createBackup, listBackups, backupPath, recordDownload, readManifest, describeFile,
  parseBackup, verifyBackupFile, restoreBackup, importedPath, prune,
  hasAutoBackupToday, runAutoBackupIfDue, startAutoBackups, stopAutoBackups, backupBeforeUpgrade,
  isBusy: () => busy
};
