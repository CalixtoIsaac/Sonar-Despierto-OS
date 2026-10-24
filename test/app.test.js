const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);

test('GET /api/health identifica al sistema', async () => {
  const r = await h.request('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.app, 'sonar-despierto');
  assert.match(r.body.version, /^\d+\.\d+\.\d+$/);
  const db = await h.request('GET', '/api/health/db');
  assert.deepEqual(db.body, { status: 'ok', database: 'sqlite' });
});

test('cabeceras de seguridad en API y páginas', async () => {
  for (const url of ['/api/health', '/', '/app']) {
    const r = await h.request('GET', url);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('referrer-policy'), 'same-origin');
    assert.equal(r.headers.get('x-powered-by'), null);
  }
});

test('/ sirve el login y /app la aplicación', async () => {
  const login = await h.request('GET', '/');
  assert.equal(login.status, 200);
  assert.match(login.text, /Bienvenido de nuevo/);
  const app = await h.request('GET', '/app');
  assert.equal(app.status, 200);
  assert.match(app.text, /id="sidebarNav"/);
});

test('archivos estáticos: CSS, JS y tipografías locales (sin internet)', async () => {
  for (const url of ['/css/theme.css', '/js/ui-kit.js', '/js/access.js', '/vendor/fonts/fonts.css', '/vendor/fonts/figtree-latin-400-normal.woff2']) {
    assert.equal((await h.request('GET', url)).status, 200, url);
  }
  const page = await h.request('GET', '/');
  assert.equal(/fonts\.googleapis|https?:\/\/(?!www\.w3)/.test(page.text), false, 'el login no debe cargar recursos externos');
});

test('ruta de API inexistente → 404 JSON', async () => {
  const r = await h.request('GET', '/api/no-existe');
  assert.equal(r.status, 404);
  assert.deepEqual(r.body, { error: 'Ruta de la API no encontrada.', code: 'NOT_FOUND' });
});

test('no se pueden leer archivos fuera de public/', async () => {
  for (const url of ['/../package.json', '/%2e%2e/package.json', '/server.js', '/lib/config.js']) {
    const r = await h.request('GET', url);
    assert.notEqual(r.status, 200, url);
  }
});
