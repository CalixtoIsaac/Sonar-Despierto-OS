/**
 * Usuarios del sistema: consulta, alta, permisos efectivos, administrador inicial y
 * contraseñas temporales (ADR-0004).
 */
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../lib/config');
const { getDb, nowIso, toIso } = require('../lib/db');
const { AppError } = require('../lib/errors');
const { getLogger } = require('../lib/logger');
const { MODULE_KEYS, isRole, normalizeModules } = require('../lib/modules');
const {
  PASSWORD_POLICY_MESSAGE, checkPasswordPolicy, hashPasswordSync, generateTemporaryPassword
} = require('../lib/security');
const { recordAudit } = require('./audit');

const CREDENTIALS_FILE_NAME = 'CREDENCIALES_INICIALES.txt';

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

function getUser(id, db = getDb()) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function getUserByEmail(email, db = getDb()) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) || null;
}

function grantedModules(userId, db = getDb()) {
  const rows = db.prepare('SELECT module FROM user_module_permissions WHERE user_id = ?').all(userId);
  const set = new Set(rows.map((r) => r.module));
  return MODULE_KEYS.filter((m) => set.has(m));
}

/** ADMIN tiene todos; OPERADOR solo los suyos. Siempre en el orden del catálogo. */
function effectiveModules(user, db = getDb()) {
  if (user.role === 'ADMIN') return [...MODULE_KEYS];
  return grantedModules(user.id, db);
}

function hasModule(user, module, db = getDb()) {
  return user.role === 'ADMIN' || effectiveModules(user, db).includes(module);
}

/** Forma pública de la cuenta actual (GET /api/auth/me). Nunca incluye el hash. */
function toUserMe(user, db = getDb()) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    is_active: Boolean(user.is_active),
    must_change_password: Boolean(user.must_change_password),
    modules: effectiveModules(user, db),
    last_login_at: toIso(user.last_login_at)
  };
}

function createUser({
  email, password, firstName, lastName, role = 'OPERADOR', modules = [], mustChangePassword = true, phone = null
}, db = getDb()) {
  email = normalizeEmail(email);
  if (!checkPasswordPolicy(password)) throw new Error(PASSWORD_POLICY_MESSAGE);
  if (!isRole(role)) throw new Error(`Rol desconocido: ${role}`);
  const moduleList = role === 'ADMIN' ? [] : normalizeModules(modules); // el ADMIN los tiene todos

  const insert = db.transaction(() => {
    if (getUserByEmail(email, db)) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese correo.');
    }
    const now = nowIso();
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone,
                         is_active, must_change_password, token_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?)
    `).run(email, hashPasswordSync(password), role, String(firstName).trim(), String(lastName).trim(),
      phone, mustChangePassword ? 1 : 0, now, now);
    const id = Number(info.lastInsertRowid);
    const grant = db.prepare('INSERT INTO user_module_permissions (user_id, module, created_at) VALUES (?, ?, ?)');
    for (const m of moduleList) grant.run(id, m, now);
    return id;
  });
  return getUser(insert(), db);
}

// ---------- Archivo de credenciales iniciales ----------
function credentialsPath(config = getConfig()) {
  return path.join(config.dataDir, CREDENTIALS_FILE_NAME);
}

function writeCredentialsFile(email, password, reason, config = getConfig()) {
  const file = credentialsPath(config);
  fs.writeFileSync(file, [
    'SOÑAR DESPIERTO — CREDENCIALES DE ACCESO',
    '========================================',
    '',
    `Motivo: ${reason}`,
    '',
    `Dirección del sistema: http://localhost:${config.port}`,
    `Correo: ${email}`,
    `Contraseña temporal: ${password}`,
    '',
    'Al entrar, el sistema te pedirá cambiar esta contraseña.',
    'Este archivo se borra automáticamente cuando cambies la contraseña.',
    ''
  ].join('\r\n'), 'utf8');
  return file;
}

function removeCredentialsFileIfOwner(email, config = getConfig()) {
  const file = credentialsPath(config);
  try {
    if (fs.readFileSync(file, 'utf8').includes(normalizeEmail(email))) fs.unlinkSync(file);
  } catch { /* no existe */ }
}

/** Crea el ADMIN inicial si no hay usuarios. Devuelve su correo, o null si ya había usuarios. */
function ensureFirstAdmin(config = getConfig(), db = getDb()) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return null;

  let password = config.firstAdminPassword;
  if (password && !checkPasswordPolicy(password)) {
    getLogger().warn('FIRST_ADMIN_PASSWORD no cumple la política; se generará una contraseña temporal');
    password = '';
  }
  const generated = !password;
  if (generated) password = generateTemporaryPassword();

  createUser({
    email: config.firstAdminEmail,
    password,
    firstName: 'Administrador',
    lastName: 'General',
    role: 'ADMIN',
    mustChangePassword: true
  }, db);
  if (generated) writeCredentialsFile(config.firstAdminEmail, password, 'Primer arranque del sistema', config);
  getLogger().info(`Se creó el administrador inicial (${config.firstAdminEmail})`);
  return config.firstAdminEmail;
}

/** Asigna una contraseña temporal (soporte). Sin correo: el primer ADMIN (activo, si hay alguno). */
function resetPasswordToTemporary(email = null, config = getConfig(), db = getDb()) {
  const user = email
    ? getUserByEmail(email, db)
    : db.prepare("SELECT * FROM users WHERE role = 'ADMIN' ORDER BY is_active DESC, id LIMIT 1").get();
  if (!user) throw new AppError(404, 'NOT_FOUND', 'No existe un usuario con ese correo.');

  const password = generateTemporaryPassword();
  db.transaction(() => {
    db.prepare(`
      UPDATE users SET password_hash = ?, must_change_password = 1, is_active = 1,
                       token_version = token_version + 1, updated_at = ?
      WHERE id = ?
    `).run(hashPasswordSync(password), nowIso(), user.id);
    recordAudit({ action: 'PASSWORD_RESET', entity: 'users', entityId: user.id, userId: null, detail: { via: 'cli' } }, db);
  })();
  writeCredentialsFile(user.email, password, 'Restablecimiento de contraseña', config);
  return { user: getUser(user.id, db), password };
}

module.exports = {
  CREDENTIALS_FILE_NAME,
  normalizeEmail,
  getUser,
  getUserByEmail,
  effectiveModules,
  hasModule,
  toUserMe,
  createUser,
  credentialsPath,
  writeCredentialsFile,
  removeCredentialsFileIfOwner,
  ensureFirstAdmin,
  resetPasswordToTemporary
};
