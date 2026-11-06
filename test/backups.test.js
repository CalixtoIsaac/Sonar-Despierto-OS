/**
 * Respaldos (F8, ADR-0015): permisos, nombres, descarga auditada, rotación, respaldo diario,
 * respaldo antes de actualizar y lector de ZIP.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('./helpers');
const { getConfig } = require('../lib/config');
const { zip, unzip, ZipError } = require('../lib/zip');
const backups = require('../services/backups');
const { MIGRATIONS, LATEST_VERSION } = require('../lib/migrations');

before(h.start);
after(h.stop);
beforeEach(() => {
  h.resetDb();
  fs.rmSync(backups.backupsDir(), { recursive: true, force: true });
});

const api = (method, url, token, body) => h.request(method, url, { token, body });

test('solo ADMIN: sin sesión 401, OPERADOR 403 (aunque tenga todos los módulos)', async () => {
  assert.equal((await api('GET', '/api/backups')).status, 401);
  const op = h.makeUser({ modules: ['VOLUNTARIOS', 'BENEFICIARIOS', 'EVENTOS', 'CARTAS', 'CALENDARIO', 'INVENTARIO', 'REPORTES'] });
  const token = await h.login(op.user.email, op.password);
  for (const [m, u] of [['GET', '/api/backups'], ['POST', '/api/backups'], ['POST', '/api/backups/restore-upload?confirm=RESTAURAR']]) {
    const r = await api(m, u, token);
    assert.equal(r.status, 403, `${m} ${u}`);
    assert.equal(r.body.code, 'FORBIDDEN');
  }
});

test('lista, descarga auditada y nombres inválidos → 404', async () => {
  const { token, user } = await h.adminSession();
  const empty = await api('GET', '/api/backups', token);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.items, []);
  assert.equal(empty.body.settings.schema_version, LATEST_VERSION);
  assert.equal(empty.headers.get('cache-control'), 'no-store');

  const b = (await api('POST', '/api/backups', token)).body.backup;
  const list = (await api('GET', '/api/backups', token)).body;
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].name, b.name);
  assert.equal(list.items[0].kind_label, 'Manual');
  assert.equal(list.items[0].created_by, user.email);
  assert.equal(list.settings.last_backup_at, b.created_at);

  const res = await fetch(`${h.baseUrl()}/api/backups/${b.name}/download`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), new RegExp(b.name));
  const entries = unzip(Buffer.from(await res.arrayBuffer()));
  assert.deepEqual(entries.map((e) => e.name).slice(0, 2), ['manifest.json', 'sonar.db']);
  assert.ok(!entries.some((e) => /secret\.key|config\.env|\.log$/.test(e.name)), 'sin clave, configuración ni logs');

  const rows = h.auditRows();
  const created = rows.find((r) => r.action === 'BACKUP_CREATED');
  assert.equal(created.user_id, user.id);
  assert.equal(created.detail.file, b.name);
  const downloaded = rows.find((r) => r.action === 'BACKUP_DOWNLOADED');
  assert.equal(downloaded.detail.file, b.name);

  for (const bad of ['..%2Fsonar.db', 'sonar.db', 'sonar-manual-20260101-000000.zip', 'x.zip']) {
    assert.equal((await api('GET', `/api/backups/${bad}/download`, token)).status, 404, bad);
    assert.equal((await api('POST', `/api/backups/${bad}/restore`, token, { confirm: 'RESTAURAR' })).status, 404, bad);
  }
});

test('rotación: se conservan los N más recientes de cada tipo', async () => {
  await h.adminSession();
  const config = { ...getConfig(), backupKeep: 3 };
  const made = [];
  for (let i = 0; i < 5; i++) made.push((await backups.createBackup({ kind: 'AUTO', config })).name);
  const manual = (await backups.createBackup({ kind: 'MANUAL', config })).name;
  const names = fs.readdirSync(backups.backupsDir()).filter((n) => n.endsWith('.zip')).sort();
  assert.equal(names.filter((n) => n.startsWith('sonar-auto-')).length, 3);
  assert.ok(names.includes(manual), 'los manuales no cuentan para el límite de automáticos');
  assert.ok(names.includes(made[4]) && names.includes(made[3]) && names.includes(made[2]));
  assert.ok(!names.includes(made[0]));
});

test('copia extra en otra carpeta (BACKUP_COPY_DIR); si falla, el respaldo igual se guarda', async () => {
  await h.adminSession();
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-copia-'));
  try {
    const ok = await backups.createBackup({ kind: 'MANUAL', config: { ...getConfig(), backupCopyDir: extra } });
    assert.equal(ok.copy.ok, true);
    assert.ok(fs.existsSync(path.join(extra, ok.name)));
    const blocker = path.join(extra, 'soy-un-archivo');
    fs.writeFileSync(blocker, 'x');
    const bad = await backups.createBackup({ kind: 'MANUAL', config: { ...getConfig(), backupCopyDir: path.join(blocker, 'sub') } });
    assert.equal(bad.copy.ok, false);
    assert.ok(fs.existsSync(path.join(backups.backupsDir(), bad.name)));
  } finally {
    fs.rmSync(extra, { recursive: true, force: true });
  }
});

test('respaldo automático: uno al día', async () => {
  await h.adminSession();
  assert.equal(backups.hasAutoBackupToday(), false);
  const first = await backups.runAutoBackupIfDue();
  assert.ok(first && first.kind === 'AUTO');
  assert.equal(backups.hasAutoBackupToday(), true);
  assert.equal(await backups.runAutoBackupIfDue(), null, 'el segundo intento del mismo día no hace otro');
  assert.equal(h.auditRows().find((r) => r.action === 'BACKUP_CREATED').user_id, null, 'lo hace el sistema');
});

test('antes de actualizar: una BD con migraciones pendientes se respalda tal como está', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-upgrade-'));
  const config = { ...getConfig(), dataDir, dbPath: path.join(dataDir, 'sonar.db'), backupCopyDir: '' };
  try {
    assert.equal(await backups.backupBeforeUpgrade(config), null, 'sin base de datos no hay nada que respaldar');
    const Database = require('better-sqlite3');
    const old = new Database(config.dbPath);
    for (const m of MIGRATIONS.filter((x) => x.version <= 2)) { old.exec(m.up); old.pragma(`user_version = ${m.version}`); }
    old.close();
    const b = await backups.backupBeforeUpgrade(config);
    assert.equal(b.kind, 'ANTES_DE_ACTUALIZAR');
    assert.equal(b.schema_version, 2);
    assert.equal(b.can_restore, true);
    assert.match(b.name, /^sonar-antes-de-actualizar-/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('ZIP: ida y vuelta, y rechazo de rutas peligrosas, cifrado y datos dañados', () => {
  const files = [{ name: 'a.txt', data: 'hola' }, { name: 'dir/b.bin', data: Buffer.from([1, 2, 3]), store: true }];
  assert.deepEqual(unzip(zip(files)).map((e) => [e.name, e.data.toString('hex')]), [['a.txt', Buffer.from('hola').toString('hex')], ['dir/b.bin', '010203']]);
  for (const name of ['../x', 'a/../../x', '/etc/passwd', 'C:/x', 'a\\b']) {
    assert.throws(() => unzip(zip([{ name, data: 'x' }])), ZipError, name);
  }
  const buf = zip([{ name: 'a.txt', data: 'hola mundo', store: true }]);
  const broken = Buffer.from(buf);
  broken[30 + 'a.txt'.length + 2] ^= 0xff; // un byte del contenido
  assert.throws(() => unzip(broken), /dañado/);
  assert.throws(() => unzip(Buffer.from('no')), ZipError);
  assert.throws(() => unzip(zip([{ name: 'big', data: Buffer.alloc(5000) }]), { maxBytes: 1000 }), /demasiado grande/);
});
