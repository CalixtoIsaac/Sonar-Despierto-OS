/**
 * Utilidades de prueba. node:test ejecuta cada archivo en su propio proceso, así que cada
 * archivo obtiene una carpeta de datos y una BD SQLite temporales y vacías.
 *
 * IMPORTANTE: este archivo debe requerirse ANTES que cualquier módulo de lib/ o services/.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-test-'));
process.env.SD_DATA_DIR = dataDir;
process.env.APP_ENV = 'test';
process.env.FIRST_ADMIN_EMAIL = 'admin@sonardespierto.org';
process.env.FIRST_ADMIN_PASSWORD = 'Temporal123';
process.env.LAN_MODE = 'false';
delete process.env.JWT_SECRET;
delete process.env.DB_PATH;

const { createApp } = require('../lib/app');
const { getDb, closeDb } = require('../lib/db');
const users = require('../services/users');
const auth = require('../services/auth');

let server = null;
let baseUrl = '';

async function start() {
  server = await new Promise((resolve) => {
    const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stop() {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

/** Borra todos los datos entre pruebas y reinicia el límite de intentos. */
function resetDb() {
  const db = getDb();
  db.exec('DELETE FROM audit_logs; DELETE FROM user_module_permissions; DELETE FROM users;');
  auth.loginLimiter.resetAll();
  try { fs.unlinkSync(users.credentialsPath()); } catch { /* no existe */ }
}

async function request(method, url, { body, token, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl + url, {
    method,
    headers: h,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* no es JSON */ }
  return { status: res.status, headers: res.headers, text, body: json };
}

let counter = 0;
/** Crea un usuario directamente en la BD. Devuelve { user, password }. */
function makeUser({ role = 'OPERADOR', modules = ['CARTAS'], mustChange = false, email, active = true } = {}) {
  const password = 'Segura1234';
  const user = users.createUser({
    email: email || `persona${++counter}@sonardespierto.org`,
    password,
    firstName: 'Ana',
    lastName: 'Prueba',
    role,
    modules,
    mustChangePassword: mustChange
  });
  if (!active) getDb().prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);
  return { user: users.getUser(user.id), password };
}

async function login(email, password) {
  const r = await request('POST', '/api/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${r.status}: ${r.text}`);
  return r.body.token;
}

function auditActions() {
  return getDb().prepare('SELECT action FROM audit_logs ORDER BY id').all().map((r) => r.action);
}

module.exports = { dataDir, start, stop, resetDb, request, makeUser, login, auditActions };
