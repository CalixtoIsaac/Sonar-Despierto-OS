const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const path = require('path');
require('./helpers');

const { toBool, toInt } = require('../lib/config');
const { resolveDataDir } = require('../lib/paths');
const { normalizeModules, MODULE_KEYS } = require('../lib/modules');
const { RateLimiter } = require('../lib/rate-limit');
const security = require('../lib/security');
const { sanitize } = require('../services/audit');
const launcher = require('../lib/launcher');
const Access = require('../public/js/access');

test('política de contraseñas (igual en servidor y navegador)', () => {
  const cases = {
    Segura123: true, abcdefg1: true, 'ñandú2026': true,
    corta1: false, sololetras: false, '12345678': false, ['a1'.repeat(37)]: false
  };
  for (const [pw, ok] of Object.entries(cases)) {
    assert.equal(security.checkPasswordPolicy(pw), ok, pw);
    assert.equal(Access.meetsPasswordPolicy(pw), ok, `navegador: ${pw}`);
  }
  assert.equal(security.PASSWORD_POLICY_MESSAGE, Access.PASSWORD_POLICY_MESSAGE);
});

test('contraseñas temporales: 12 caracteres, cumplen la política y sin caracteres ambiguos', () => {
  for (let i = 0; i < 200; i++) {
    const pw = security.generateTemporaryPassword();
    assert.equal(pw.length, 12);
    assert.ok(security.checkPasswordPolicy(pw));
    assert.doesNotMatch(pw, /[0O1lI]/);
  }
});

test('fortaleza de contraseña en el navegador', () => {
  assert.equal(Access.passwordStrength('corta'), 1);
  assert.equal(Access.passwordStrength('Segura123'), 2);
  assert.equal(Access.passwordStrength('MuySegura2026!'), 3);
});

test('limitador de intentos con ventana deslizante', () => {
  let now = 0;
  const rl = new RateLimiter({ max: 3, windowMs: 60_000, clock: () => now });
  for (let i = 0; i < 3; i++) { assert.equal(rl.retryAfter('k'), null); rl.registerFailure('k'); now += 1000; }
  assert.equal(rl.retryAfter('k'), 57); // el primer fallo (t=0) sale de la ventana a los 60 s; ahora t=3 s
  assert.equal(rl.retryAfter('otra'), null);
  now = 60_001;
  assert.equal(rl.retryAfter('k'), null);
  rl.registerFailure('k');
  rl.reset('k');
  assert.equal(rl.retryAfter('k'), null);
});

test('módulos: se ordenan según el catálogo, sin duplicados, y se rechazan los desconocidos', () => {
  assert.deepEqual(normalizeModules(['reportes', 'CARTAS', 'cartas']), ['CARTAS', 'REPORTES']);
  assert.throws(() => normalizeModules(['NO_EXISTE']), /Módulo desconocido/);
  assert.deepEqual(Access.MODULE_KEYS, [...MODULE_KEYS], 'access.js debe espejar lib/modules.js');
});

test('la bitácora nunca guarda contraseñas ni tokens, aunque vengan anidados', () => {
  const clean = sanitize({ email: 'a@b.c', password: 'x', nested: { token: 't', ok: 1, list: [{ temporary_password: 'p', k: 2 }] } });
  assert.deepEqual(clean, { email: 'a@b.c', nested: { ok: 1, list: [{ k: 2 }] } });
});

test('configuración: booleanos y números con valores por defecto', () => {
  assert.equal(toBool('true', false), true);
  assert.equal(toBool('Sí', false), true);
  assert.equal(toBool('0', true), false);
  assert.equal(toBool(undefined, true), true);
  assert.equal(toInt('9000', 1), 9000);
  assert.equal(toInt('abc', 8765), 8765);
  assert.equal(toInt('70000', 8765, { max: 65535 }), 8765);
});

test('directorio de datos: SD_DATA_DIR > paquete portátil (%LOCALAPPDATA%) > .data del repo', () => {
  assert.equal(resolveDataDir({ SD_DATA_DIR: '/tmp/x' }), path.resolve('/tmp/x'));
  assert.equal(resolveDataDir({ LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }, { portable: true }),
    path.join('C:\\Users\\a\\AppData\\Local', 'SonarDespierto'));
  assert.equal(resolveDataDir({}, { portable: false }), path.join(path.resolve(__dirname, '..'), '.data'));
});

test('menú según rol y permisos', () => {
  const admin = { role: 'ADMIN', modules: [...MODULE_KEYS], must_change_password: false };
  const operador = { role: 'OPERADOR', modules: ['CARTAS'], must_change_password: false };
  assert.equal(Access.visibleMenu(admin).length, 14); // F2: + Bitácora
  assert.deepEqual(Access.visibleMenu(operador).map((v) => v.key), ['inicio', 'cartas', 'buscar', 'perfil']);
  assert.deepEqual(Access.visibleMenu({ ...admin, must_change_password: true }), []);
  assert.equal(Access.canSee(operador, Access.viewByKey('usuarios')), false);
  assert.equal(Access.canSee(operador, Access.viewByKey('ninos')), false);
});

test('arranque: IPs de la red local, banner y búsqueda de puerto libre', async () => {
  const ips = launcher.lanIpv4Addresses({
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    eth0: [{ family: 'IPv4', address: '192.168.1.20', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
    wifi: [{ family: 'IPv4', address: '169.254.3.3', internal: false }, { family: 'IPv4', address: '192.168.1.20', internal: false }]
  });
  assert.deepEqual(ips, ['192.168.1.20']);

  const text = launcher.bannerText({ localUrl: 'http://localhost:8765', lanUrls: ['http://192.168.1.20:8765'], dataDir: 'C:\\datos', version: '0.2.0' });
  assert.match(text, /Desde otras PCs de la red: +http:\/\/192\.168\.1\.20:8765/);
  assert.match(text, /NO cierres esta ventana/);

  const busy = net.createServer();
  await new Promise((r) => busy.listen(0, '127.0.0.1', r));
  const taken = busy.address().port;
  const free = await launcher.findFreePort('127.0.0.1', taken);
  assert.notEqual(free, taken);
  assert.ok(free > taken && free < taken + launcher.PORT_SEARCH_RANGE);
  busy.close();
  assert.equal(await launcher.isOurInstance(taken), false);
});
