/**
 * Revisión de seguridad de la Fase 8: cabeceras, política de contenido (CSP), cabecera Host y
 * reglas estáticas del frontend que la CSP exige (sin scripts ni manejadores en línea).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const h = require('./helpers');
const { hostAllowed } = require('../lib/app');

before(h.start);
after(h.stop);

const PUBLIC = path.join(__dirname, '..', 'public');

function rawGet(urlPath, host) {
  const { port } = new URL(h.baseUrl());
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, headers: { Host: host } }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('cabeceras de seguridad en páginas y API; la API no se guarda en caché', async () => {
  for (const url of ['/', '/app', '/registro', '/api/health', '/js/app.js']) {
    const r = await h.request('GET', url);
    assert.equal(r.status, 200, url);
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'(;|$)/, url);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('permissions-policy').includes('microphone=()'));
    assert.equal(r.headers.get('x-powered-by'), null);
  }
  assert.equal((await h.request('GET', '/api/health')).headers.get('cache-control'), 'no-store');
  assert.equal((await h.request('GET', '/api/no-existe')).headers.get('cache-control'), 'no-store');
  // Al actualizar el programa no deben quedar JS, CSS ni íconos viejos en la caché del navegador
  for (const url of ['/js/ui-kit.js', '/css/base.css', '/img/favicon.ico', '/img/favicon.svg', '/app']) {
    assert.equal((await h.request('GET', url)).headers.get('cache-control'), 'no-cache', url);
  }
});

test('cabecera Host: se rechazan dominios ajenos (DNS rebinding) y se aceptan los de la oficina', async () => {
  const bad = await rawGet('/api/health', 'sonar.atacante.example');
  assert.equal(bad.status, 421);
  for (const host of ['localhost:8765', '127.0.0.1:8765', '[::1]:8765', '192.168.1.20:8765', 'PC-OFICINA:8765', 'pc-oficina']) {
    assert.equal((await rawGet('/api/health', host)).status, 200, host);
  }
  assert.equal(hostAllowed('', {}), false);
  assert.equal(hostAllowed('sonar.midominio.mx', { allowedHosts: ['sonar.midominio.mx'] }), true);
  assert.equal(hostAllowed('recepcion.local', {}, 'RECEPCION'), true);
  assert.equal(hostAllowed('otra.local', {}, 'RECEPCION'), false);
});

test('frontend compatible con la CSP: sin <script> en línea ni manejadores on…= en HTML o plantillas', () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); } else if (/\.(html|js)$/.test(e.name)) files.push(p);
  } };
  walk(PUBLIC);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.html')) {
      for (const m of text.matchAll(/<script\b([^>]*)>/gi)) assert.match(m[1], /\bsrc=/, `${path.basename(file)}: <script> sin src`);
    }
    assert.doesNotMatch(text, /<[a-z][^>]*\son(click|change|input|submit|load|error|keydown|keyup|focus|blur|mouseover)\s*=/i, `${path.basename(file)}: manejador en línea`);
    assert.doesNotMatch(text, /href\s*=\s*["']javascript:/i, `${path.basename(file)}: enlace javascript:`);
    assert.doesNotMatch(text, /\beval\(|new Function\(/, `${path.basename(file)}: eval`);
  }
});

test('archivos privados fuera del alcance del navegador', async () => {
  for (const url of ['/../.data/sonar.db', '/%2e%2e/package.json', '/.env', '/backups/', '/uploads/', '/server.js', '/lib/config.js']) {
    const r = await h.request('GET', url);
    assert.notEqual(r.status, 200, url);
  }
});
