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

/** Borra todos los datos entre pruebas (todas las tablas) y reinicia los límites de intentos. */
function resetDb() {
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => { for (const t of tables) db.exec(`DELETE FROM "${t.name}"`); })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  auth.loginLimiter.resetAll();
  auth.registerLimiter.resetAll();
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

/** Filas de la bitácora con detail parseado. */
function auditRows() {
  return getDb().prepare('SELECT * FROM audit_logs ORDER BY id').all()
    .map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}

let regCounter = 0;
/** Cuerpo válido de POST /api/auth/register (correo único por llamada). */
function registerPayload(overrides = {}) {
  return {
    first_name: 'Ana',
    last_name: 'López Pérez',
    email: `solicitud${++regCounter}@correo.com`,
    phone: '229 123 4567',
    password: 'Segura123',
    requested_modules: ['CARTAS', 'CALENDARIO'],
    note: 'Coordino el acopio de la zona norte.',
    accepts_confidentiality: true,
    ...overrides
  };
}

/** Crea una solicitud vía la API. Devuelve { id, email, password }. */
async function pendingUser(overrides = {}) {
  const body = registerPayload(overrides);
  const r = await request('POST', '/api/auth/register', { body });
  if (r.status !== 201) throw new Error(`register ${r.status}: ${r.text}`);
  auth.registerLimiter.resetAll();
  const row = users.getUserByEmail(body.email);
  return { id: row.id, email: row.email, password: body.password };
}

/** Sesión de un ADMIN aprobado y con la contraseña ya cambiada: { user, token }. */
async function adminSession(overrides = {}) {
  const { user, password } = makeUser({ role: 'ADMIN', modules: [], ...overrides });
  return { user, token: await login(user.email, password) };
}

// ---------- Fase 3: cuerpos válidos de personas ----------
let personCounter = 0;
const uniquePhone = () => `229${String(1000000 + (++personCounter)).slice(-7)}`;

function schoolPayload(overrides = {}) {
  return { name: `Primaria Benito Juárez ${++personCounter}`, cct: null, zone: 'Centro', address: 'Av. Independencia 100',
    contact_name: 'Mtra. Rosa', contact_phone: '2290001122', ...overrides };
}
function tutorPayload(overrides = {}) {
  return { first_name: 'Carmen', last_name: `Ruiz ${++personCounter}`, phone: uniquePhone(), position: 'Profesora 3°A', ...overrides };
}
function volunteerPayload(overrides = {}) {
  return {
    first_name: 'Luis', last_name: `Hernández ${++personCounter}`, email: null, phone: uniquePhone(), birth_date: '1998-05-10',
    city: 'Veracruz', occupation: 'Estudiante', emergency_contact_name: 'María Cruz', emergency_contact_phone: '2297776655',
    emergency_contact_relationship: 'Madre', shirt_size: 'M', area_of_interest: 'LOGISTICA',
    medical_notes: 'Alergia a la penicilina', accepts_privacy: true, ...overrides
  };
}
function childPayload(overrides = {}) {
  return {
    first_name: 'Sofía', last_name: `Cruz ${++personCounter}`, birth_date: '2017-03-02', gender: 'NINA', grade: '3° primaria',
    group_name: 'B', guardian_name: 'Rosa Cruz', guardian_relationship: 'Madre', guardian_phone: '2290001122',
    guardian_consent: true, notes: 'Alergia al cacahuate', ...overrides
  };
}

/** Sesión de un OPERADOR con los módulos indicados: { user, token }. */
async function operatorSession(modules) {
  const { user, password } = makeUser({ modules });
  return { user, token: await login(user.email, password) };
}

module.exports = {
  baseUrl: () => baseUrl,
  dataDir, start, stop, resetDb, request, makeUser, login, auditActions, auditRows,
  registerPayload, pendingUser, adminSession, operatorSession,
  schoolPayload, tutorPayload, volunteerPayload, childPayload
};
