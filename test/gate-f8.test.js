/**
 * Gate de la Fase 8 (hoja de ruta): restaurar un respaldo funciona.
 * Respaldo → cambios → restaurar devuelve exactamente los datos y las fotos del respaldo, cierra las
 * sesiones, deja un respaldo "antes de restaurar" que deshace la restauración y rechaza archivos dañados
 * sin tocar los datos. Incluye la restauración desde la línea de comandos (sistema cerrado).
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('./helpers');
const { getDb } = require('../lib/db');
const { getConfig } = require('../lib/config');
const { zip, unzip } = require('../lib/zip');
const backups = require('../services/backups');

before(h.start);
after(h.stop);
beforeEach(() => {
  h.resetDb();
  fs.rmSync(backups.backupsDir(), { recursive: true, force: true });
  fs.rmSync(path.join(getConfig().dataDir, 'uploads'), { recursive: true, force: true });
});

const api = (method, url, token, body) => h.request(method, url, { token, body });
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0x56, 0xff, 0xd9]);

/** Fila a fila, las tablas que importan (sin la bitácora, que cambia con cada acción). */
function snapshot() {
  const db = getDb();
  const out = {};
  for (const t of ['users', 'volunteers', 'schools', 'children', 'events', 'letters', 'letter_status_history', 'activities',
    'inventory_items', 'inventory_movements']) {
    out[t] = db.prepare(`SELECT * FROM "${t}" ORDER BY id`).all().map((r) => (t === 'users' ? { ...r, token_version: null, last_login_at: null } : r));
  }
  return out;
}
const uploadFiles = () => {
  const base = path.join(getConfig().dataDir, 'uploads');
  const out = [];
  const walk = (d) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else out.push(path.relative(base, p).split(path.sep).join('/'));
  } };
  walk(base);
  return out.sort();
};

async function scenario() {
  const { user, token } = await h.adminSession();
  const event = await h.openEvent(token);
  const child = await h.makeChild(token);
  const letter = await h.makeLetter(token, { eventId: event.id, childId: child.id });
  const res = await fetch(`${h.baseUrl()}/api/letters/${letter.id}/photo`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body: JPEG
  });
  assert.equal(res.status, 200);
  await h.makeVolunteer(token);
  const { token: invToken, center, item } = await h.inventorySetup();
  await h.move(invToken, 'ENTRADA', center.id, item.id, 7);
  return { user, token, event, child, letter };
}

test('(a) respaldo → cambios → restaurar deja los datos y las fotos tal como estaban, y cierra las sesiones', async () => {
  const { user, token, event } = await scenario();
  const before = snapshot();
  const photosBefore = uploadFiles();
  assert.equal(photosBefore.length, 1);

  const created = await api('POST', '/api/backups', token);
  assert.equal(created.status, 201);
  const b = created.body.backup;
  assert.match(b.name, /^sonar-manual-\d{8}-\d{6}\.zip$/);
  assert.equal(b.kind, 'MANUAL');
  assert.equal(b.uploads, 1);
  assert.equal(b.counts.letters, 1);
  assert.equal(b.can_restore, true);

  // Cambios después del respaldo: otra niña, otra carta, se borra la foto
  const other = await h.makeChild(token, { first_name: 'Posterior' });
  await h.makeLetter(token, { eventId: event.id, childId: other.id });
  const letterId = before.letters[0].id;
  assert.equal((await api('DELETE', `/api/letters/${letterId}/photo`, token)).status, 200);
  assert.equal(uploadFiles().length, 0);
  const afterChanges = snapshot();
  assert.notDeepEqual(afterChanges.children, before.children);

  // Sin confirmación → 422 y no se toca nada
  const noConfirm = await api('POST', `/api/backups/${b.name}/restore`, token, {});
  assert.equal(noConfirm.status, 422);
  assert.equal(noConfirm.body.code, 'CONFIRMATION_REQUIRED');
  assert.deepEqual(snapshot().children, afterChanges.children);

  const r = await api('POST', `/api/backups/${b.name}/restore`, token, { confirm: 'restaurar' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.sessions_closed, true);
  assert.equal(r.body.restored.name, b.name);
  assert.match(r.body.pre_backup.name, /^sonar-antes-de-restaurar-/);

  assert.deepEqual(snapshot(), before, 'los datos son exactamente los del respaldo');
  assert.deepEqual(uploadFiles(), photosBefore, 'la foto volvió');
  const photo = await fetch(`${h.baseUrl()}/api/letters/${letterId}/photo`, {
    headers: { Authorization: `Bearer ${await h.login(user.email, 'Segura1234')}` }
  });
  assert.equal(photo.status, 200);
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), JPEG);

  // Todas las sesiones anteriores quedaron cerradas
  assert.equal((await api('GET', '/api/auth/me', token)).status, 401);

  // La bitácora de la base restaurada registra quién y qué se restauró
  const log = h.auditRows().filter((x) => x.action === 'BACKUP_RESTORED');
  assert.equal(log.length, 1);
  assert.equal(log[0].user_id, user.id);
  assert.equal(log[0].entity, 'backups');
  assert.equal(log[0].detail.file, b.name);
  assert.equal(log[0].detail.pre_backup, r.body.pre_backup.name);

  // Deshacer: restaurar el respaldo "antes de restaurar" trae de vuelta los cambios posteriores
  const t2 = await h.login(user.email, 'Segura1234');
  const undo = await api('POST', `/api/backups/${r.body.pre_backup.name}/restore`, t2, { confirm: 'RESTAURAR' });
  assert.equal(undo.status, 200, undo.text);
  assert.deepEqual(snapshot().children, afterChanges.children);
  assert.deepEqual(snapshot().letters.map((l) => l.code), afterChanges.letters.map((l) => l.code));
});

test('(b) archivos dañados o ajenos → 422 sin tocar los datos', async () => {
  const { token } = await scenario();
  const good = (await api('POST', '/api/backups', token)).body.backup;
  const file = path.join(backups.backupsDir(), good.name);
  const entries = unzip(fs.readFileSync(file));
  const manifest = JSON.parse(entries[0].data.toString());
  const before = snapshot();

  const upload = async (buf) => {
    const res = await fetch(`${h.baseUrl()}/api/backups/restore-upload?confirm=RESTAURAR`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' }, body: buf
    });
    return { status: res.status, body: await res.json() };
  };
  const rebuild = (changes) => zip(entries.map((e) => (e.name in changes ? { name: e.name, data: changes[e.name] } : e))
    .filter((e) => e.data !== null).concat(changes.__extra || []));

  const cases = [
    ['no es un ZIP', Buffer.from('hola, no soy un respaldo'), 'BACKUP_INVALID'],
    ['ZIP de otra aplicación', zip([{ name: 'hola.txt', data: 'x' }]), 'BACKUP_INVALID'],
    ['base alterada', rebuild({ 'sonar.db': Buffer.concat([entries[1].data, Buffer.from('x')]) }), 'BACKUP_INVALID'],
    ['ruta fuera de la carpeta', rebuild({ __extra: [{ name: 'uploads/../../secret.key', data: 'x' }] }), 'BACKUP_INVALID'],
    ['archivo inesperado', rebuild({ __extra: [{ name: 'config.env', data: 'LAN_MODE=true' }] }), 'BACKUP_INVALID'],
    ['versión más nueva', rebuild({ 'manifest.json': JSON.stringify({ ...manifest, schema_version: 999 }) }), 'BACKUP_TOO_NEW'],
    ['ZIP recortado', fs.readFileSync(file).subarray(0, 200), 'BACKUP_INVALID']
  ];
  for (const [what, buf, code] of cases) {
    const r = await upload(buf);
    assert.equal(r.status, 422, what);
    assert.equal(r.body.code, code, what);
  }

  // Una base sin administradores activos dejaría a todos fuera
  const tmp = path.join(os.tmpdir(), `sd-sin-admin-${process.pid}.db`);
  fs.writeFileSync(tmp, entries[1].data);
  const Database = require('better-sqlite3');
  const raw = new Database(tmp);
  raw.prepare("UPDATE users SET is_active = 0 WHERE role = 'ADMIN'").run();
  raw.close();
  const noAdminDb = fs.readFileSync(tmp);
  fs.rmSync(tmp);
  const noAdmin = await upload(zip([{ name: 'manifest.json', data: JSON.stringify({ ...manifest, db_sha256: null }), store: true },
    { name: 'sonar.db', data: noAdminDb }]));
  assert.equal(noAdmin.status, 422);
  assert.equal(noAdmin.body.code, 'BACKUP_NO_ADMIN');

  assert.deepEqual(snapshot(), before, 'nada cambió');
  assert.equal((await api('GET', '/api/auth/me', token)).status, 200, 'la sesión sigue abierta');
  const names = fs.readdirSync(backups.backupsDir());
  assert.deepEqual(names, [good.name], 'no quedan archivos temporales ni importados rechazados');
});

test('(c) restaurar subiendo el .zip (p. ej. desde una USB) y desde un respaldo con un esquema anterior', async () => {
  const { token, user } = await scenario();
  const b = (await api('POST', '/api/backups', token)).body.backup;
  const buf = fs.readFileSync(path.join(backups.backupsDir(), b.name));
  const before = snapshot();
  await h.makeChild(token, { first_name: 'Después' });

  const res = await fetch(`${h.baseUrl()}/api/backups/restore-upload?confirm=RESTAURAR`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' }, body: buf
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.restored.kind, 'IMPORTADO');
  assert.deepEqual(snapshot(), before);

  // Respaldo de un esquema viejo (versión 3): al restaurarlo se aplican las migraciones que faltan
  const Database = require('better-sqlite3');
  const { MIGRATIONS, LATEST_VERSION } = require('../lib/migrations');
  const tmp = path.join(os.tmpdir(), `sd-viejo-${process.pid}.db`);
  fs.rmSync(tmp, { force: true });
  const old = new Database(tmp);
  for (const m of MIGRATIONS.filter((x) => x.version <= 3)) {
    old.transaction(() => { if (typeof m.up === 'function') m.up(old); else old.exec(m.up); old.pragma(`user_version = ${m.version}`); })();
  }
  const now = new Date().toISOString();
  old.prepare(`INSERT INTO users (email, password_hash, role, first_name, last_name, is_active, must_change_password, created_at, updated_at)
    VALUES (?, ?, 'ADMIN', 'Vieja', 'Admin', 1, 0, ?, ?)`).run('vieja@sonardespierto.org', require('bcryptjs').hashSync('Vieja2026', 4), now, now);
  old.close();
  const oldZip = zip([{ name: 'manifest.json', store: true, data: JSON.stringify({ app: 'sonar-despierto', format: 1, kind: 'MANUAL',
    created_at: now, app_version: '0.1.0', schema_version: 3 }) }, { name: 'sonar.db', data: fs.readFileSync(tmp) }]);
  fs.rmSync(tmp);
  const t2 = await h.login(user.email, 'Segura1234');
  const r2 = await fetch(`${h.baseUrl()}/api/backups/restore-upload?confirm=RESTAURAR`, {
    method: 'POST', headers: { Authorization: `Bearer ${t2}`, 'Content-Type': 'application/zip' }, body: oldZip
  });
  const b2 = await r2.json();
  assert.equal(r2.status, 200, JSON.stringify(b2));
  assert.equal(b2.schema_from, 3);
  assert.equal(b2.schema_to, LATEST_VERSION);
  assert.equal(getDb().pragma('user_version', { simple: true }), LATEST_VERSION);
  assert.equal((await h.request('POST', '/api/auth/login', { body: { email: 'vieja@sonardespierto.org', password: 'Vieja2026' } })).status, 200);
  assert.equal(h.auditRows().filter((x) => x.action === 'BACKUP_RESTORED')[0].user_id, null, 'el usuario que restauró no existe en esa base');
});

test('(d) desde la línea de comandos: --respaldar y --restaurar con el sistema cerrado', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cli-'));
  const env = { ...process.env, SD_DATA_DIR: dataDir, APP_ENV: 'test', FIRST_ADMIN_PASSWORD: 'Temporal123', PORT: '18999' };
  const run = (...args) => spawnSync(process.execPath, ['server.js', ...args], { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8' });
  try {
    // Un sistema ya usado: con su administrador inicial
    const init = spawnSync(process.execPath, ['-e', "require('./services/users').ensureFirstAdmin(); require('./lib/db').closeDb()"],
      { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const first = run('--respaldar');
    assert.equal(first.status, 0, first.stderr + first.stdout);
    const [name] = fs.readdirSync(path.join(dataDir, 'backups')).filter((n) => n.endsWith('.zip'));
    assert.match(name, /^sonar-manual-/);
    assert.match(first.stdout, /Respaldo listo/);

    const list = run('--listar-respaldos');
    assert.equal(list.status, 0);
    assert.ok(list.stdout.includes(name));

    const bad = run('--restaurar', path.join(dataDir, 'no-existe.zip'), '--si');
    assert.notEqual(bad.status, 0);

    const ok = run('--restaurar', path.join(dataDir, 'backups', name), '--si');
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    assert.match(ok.stdout, /Restauración terminada/);
    assert.ok(fs.readdirSync(path.join(dataDir, 'backups')).some((n) => n.startsWith('sonar-antes-de-restaurar-')));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
