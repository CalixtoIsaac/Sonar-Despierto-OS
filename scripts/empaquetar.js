/**
 * Genera el paquete portátil dist\SonarDespierto (ADR-0009): una carpeta que se copia completa a
 * la PC de la oficina y funciona SIN instalar Node.js (incluye su propio node.exe).
 *
 *   npm run empaquetar                 → pruebas + paquete + prueba de humo
 *   npm run empaquetar -- --sin-pruebas
 *
 * Importante: el paquete usa el node.exe y el better-sqlite3 de ESTA computadora, así que debe
 * generarse en Windows de 64 bits (como las PCs de destino).
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'SonarDespierto');
const args = process.argv.slice(2);

const COPY = [
  'server.js', 'package.json', 'config.env.template', 'SonarDespierto.bat', 'LEEME_USUARIO.txt',
  'lib', 'services', 'routes', 'public', 'node_modules',
  'scripts/reset-admin.js', 'scripts/create-user.js'
];

function step(msg) {
  console.log(`\n▶ ${msg}`);
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

async function smokeTest() {
  step('Prueba de humo del paquete');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-humo-'));
  const port = 18765 + Math.floor(Math.random() * 1000);
  const node = path.join(OUT, path.basename(process.execPath));
  const child = spawn(node, ['server.js', '--no-browser', '--port', String(port)], {
    cwd: OUT,
    env: { ...process.env, SD_DATA_DIR: dataDir, FIRST_ADMIN_PASSWORD: 'Temporal123', APP_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const base = `http://127.0.0.1:${port}`;
  const json = async (url, opts = {}) => {
    const res = await fetch(base + url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });
    return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
  };
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { ready = (await json('/api/health')).body.app === 'sonar-despierto'; } catch { /* aún no responde */ }
    }
    if (!ready) throw new Error(`el servidor no respondió.\n${output}`);
    if (!(await json('/')).body.includes('Bienvenido de nuevo')) throw new Error('la página de login no se sirvió');
    const login = await json('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@sonardespierto.org', password: 'Temporal123' }) });
    if (login.status !== 200 || !login.body.user.must_change_password) throw new Error(`login inicial: ${JSON.stringify(login.body)}`);
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const changed = await json('/api/auth/change-password', {
      method: 'POST', headers: auth, body: JSON.stringify({ current_password: 'Temporal123', new_password: 'HumoSeguro2026' })
    });
    if (changed.status !== 200 || changed.body.user.must_change_password) throw new Error('cambio de contraseña');
    const me = await json('/api/auth/me', { headers: { Authorization: `Bearer ${changed.body.token}` } });
    if (me.status !== 200 || me.body.user.modules.length !== 7) throw new Error('/api/auth/me');
    if ((await json('/api/_test/cartas')).status !== 404) throw new Error('las rutas de prueba no deben existir en producción');
    await smokeRegistration(json, { Authorization: `Bearer ${changed.body.token}` });
    await smokePeople(json, { Authorization: `Bearer ${changed.body.token}` });
    console.log('  PRUEBA DE HUMO OK');
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

/** Fase 2: registro del personal, aprobación, bitácora y desactivación. */
async function smokeRegistration(json, admin) {
  const expect = (cond, msg) => { if (!cond) throw new Error(`registro: ${msg}`); };
  const info = await json('/api/auth/registration-info');
  expect(info.body.enabled === true, 'registration-info');
  const reg = await json('/api/auth/register', { method: 'POST', body: JSON.stringify({
    first_name: 'Prueba', last_name: 'De Humo', email: 'smoke@prueba.local', phone: '2291234567',
    password: 'HumoSeguro2026', requested_modules: ['CARTAS', 'CALENDARIO'], accepts_confidentiality: true
  }) });
  expect(reg.status === 201 && !reg.body.token, `register ${reg.status}`);
  const body = JSON.stringify({ email: 'smoke@prueba.local', password: 'HumoSeguro2026' });
  const pending = await json('/api/auth/login', { method: 'POST', body });
  expect(pending.status === 403 && pending.body.code === 'ACCOUNT_PENDING', 'login pendiente');
  const summary = await json('/api/users/summary', { headers: admin });
  expect(summary.body.pending === 1, 'summary.pending');
  const list = await json('/api/users?account_status=PENDIENTE', { headers: admin });
  const id = list.body.items[0].id;
  const approve = await json(`/api/users/${id}/approve`, { method: 'POST', headers: admin,
    body: JSON.stringify({ role: 'OPERADOR', modules: ['CARTAS'] }) });
  expect(approve.status === 200, 'approve');
  const ok = await json('/api/auth/login', { method: 'POST', body });
  expect(ok.status === 200 && ok.body.user.modules.join() === 'CARTAS' && ok.body.user.must_change_password === false, 'login aprobado');
  const audit = await json('/api/audit-logs?action=ACCOUNT_APPROVED', { headers: admin });
  expect(audit.body.total === 1, 'bitácora');
  await json(`/api/users/${id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ is_active: false }) });
  const me = await json('/api/auth/me', { headers: { Authorization: `Bearer ${ok.body.token}` } });
  expect(me.status === 401, 'sesión cortada al desactivar');
  for (const page of ['/registro', '/app']) {
    const r = await json(page);
    expect(r.status === 200 && String(r.body).includes('<!DOCTYPE html>'), `página ${page}`);
  }
}

/** Fase 3: personas — duplicado → 409, exportación en bitácora, niños solo con BENEFICIARIOS. */
async function smokePeople(json, admin) {
  const expect = (cond, msg) => { if (!cond) throw new Error(`personas: ${msg}`); };
  const post = (url, body, headers = admin) => json(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const school = await post('/api/schools', { name: 'Escuela de Humo', zone: 'Centro' });
  expect(school.status === 201, `escuela ${school.status}`);
  const child = { first_name: 'Niña', last_name: 'De Humo', birth_date: '2017-03-02', school_id: school.body.school.id,
    guardian_name: 'Mamá De Humo', guardian_consent: true };
  expect((await post('/api/children', child)).status === 201, 'alta de niña o niño');
  const dup = await post('/api/children', { ...child, first_name: 'NIÑA', last_name: 'de humo' });
  expect(dup.status === 409 && dup.body.code === 'DUPLICATE_CHILD' && dup.body.existing_id, 'duplicado → 409');
  const csv = await json('/api/children/export', { headers: admin });
  expect(csv.status === 200 && String(csv.body).includes('Mamá De Humo'), 'exportación CSV');
  const audit = await json('/api/audit-logs?action=DATA_EXPORTED', { headers: admin });
  expect(audit.body.total === 1 && audit.body.items[0].entity === 'children', 'exportación en bitácora');
  const op = await post('/api/users', { email: 'humo-vol@prueba.local', first_name: 'Vol', last_name: 'Humo', modules: ['VOLUNTARIOS'] });
  const temp = op.body.temporary_password;
  const opLogin = await post('/api/auth/login', { email: 'humo-vol@prueba.local', password: temp }, {});
  const changed = await post('/api/auth/change-password', { current_password: temp, new_password: 'HumoVol2026x' },
    { Authorization: `Bearer ${opLogin.body.token}` });
  const opAuth = { Authorization: `Bearer ${changed.body.token}` };
  expect((await json('/api/children', { headers: opAuth })).status === 403, 'niños sin BENEFICIARIOS → 403');
  expect((await json('/api/volunteers', { headers: opAuth })).status === 200, 'voluntarios con VOLUNTARIOS → 200');
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'better-sqlite3'))) fail('Primero ejecuta: npm install');

  if (!args.includes('--sin-pruebas')) {
    step('Pruebas automáticas (npm test)');
    const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) fail('Las pruebas fallaron: no se genera el paquete.');
  }

  step(`Copiando archivos a ${path.relative(ROOT, OUT)}`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const item of COPY) {
    const from = path.join(ROOT, item);
    if (!fs.existsSync(from)) fail(`Falta ${item}`);
    fs.cpSync(from, path.join(OUT, item), { recursive: true });
  }
  fs.copyFileSync(process.execPath, path.join(OUT, path.basename(process.execPath)));
  fs.writeFileSync(path.join(OUT, 'PORTABLE'), 'Paquete portátil: los datos van en %LOCALAPPDATA%\\SonarDespierto\r\n');

  await smokeTest();

  console.log(`\n✔ Paquete listo: ${OUT}`);
  console.log('  Cópialo completo a la PC de la oficina y crea el acceso directo con:');
  console.log('  powershell -ExecutionPolicy Bypass -File scripts\\crear-acceso-directo.ps1');
}

main().catch((err) => fail(err.message));
