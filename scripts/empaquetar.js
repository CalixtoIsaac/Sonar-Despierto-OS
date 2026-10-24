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
    console.log('  PRUEBA DE HUMO OK');
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
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
