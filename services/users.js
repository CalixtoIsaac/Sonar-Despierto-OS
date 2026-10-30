/**
 * Usuarios del sistema (ADR-0004, ADR-0008): consulta, alta, auto-registro con aprobación,
 * gestión por el ADMIN, permisos efectivos, administrador inicial y contraseñas temporales.
 *
 * Los casos de uso de gestión reciben `actor` (fila del ADMIN que actúa, o null = sistema/CLI, que
 * omite la regla de "propia cuenta"). Orden de validación en todos:
 *   404 → INVALID_ACCOUNT_STATE → SELF_ACTION_FORBIDDEN → negocio → LAST_ADMIN → aplicar.
 */
const fs = require('fs');
const path = require('path');

const { getConfig } = require('../lib/config');
const { getDb, nowIso, toIso } = require('../lib/db');
const { AppError } = require('../lib/errors');
const { getLogger } = require('../lib/logger');
const { MODULE_KEYS, ACCOUNT_STATUS_LABELS, isRole, normalizeModules } = require('../lib/modules');
const { paginate, likePattern } = require('../lib/pagination');
const {
  PASSWORD_POLICY_MESSAGE, checkPasswordPolicy, hashPasswordSync, generateTemporaryPassword
} = require('../lib/security');
const { recordAudit } = require('./audit');

const CREDENTIALS_FILE_NAME = 'CREDENCIALES_INICIALES.txt';
const EMAIL_EXISTS_MESSAGE = 'Ya existe un usuario con ese correo.';

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

/** Módulos configurados: ADMIN → todos; OPERADOR → los suyos (orden del catálogo). */
function configuredModules(user, db = getDb()) {
  if (user.role === 'ADMIN') return [...MODULE_KEYS];
  return grantedModules(user.id, db);
}

/** Lo que la persona puede usar AHORA: nada si la cuenta no está aprobada y activa. */
function effectiveModules(user, db = getDb()) {
  if ((user.account_status && user.account_status !== 'APROBADA') || !user.is_active) return [];
  return configuredModules(user, db);
}

function hasModule(user, module, db = getDb()) {
  return effectiveModules(user, db).includes(module);
}

function parseModuleList(text) {
  if (!text) return [];
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? MODULE_KEYS.filter((m) => list.includes(m)) : [];
  } catch {
    return [];
  }
}

const fullName = (u) => `${u.first_name} ${u.last_name}`.trim();

// ---------- Conversores (nunca devuelven password_hash ni token_version) ----------

/** Forma pública de la cuenta actual (GET /api/auth/me). */
function toUserMe(user, db = getDb()) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    phone: user.phone ?? null,
    role: user.role,
    is_active: Boolean(user.is_active),
    must_change_password: Boolean(user.must_change_password),
    modules: effectiveModules(user, db),
    last_login_at: toIso(user.last_login_at)
  };
}

function toUserRef(row) {
  if (!row) return null;
  return { id: row.id, full_name: fullName(row), email: row.email };
}

function toUserOut(row, db = getDb()) {
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: fullName(row),
    phone: row.phone ?? null,
    role: row.role,
    account_status: row.account_status,
    is_active: Boolean(row.is_active),
    must_change_password: Boolean(row.must_change_password),
    modules: row.account_status === 'APROBADA' ? configuredModules(row, db) : [],
    requested_modules: parseModuleList(row.requested_modules),
    last_login_at: toIso(row.last_login_at),
    created_at: toIso(row.created_at)
  };
}

function toUserDetail(row, db = getDb()) {
  return {
    ...toUserOut(row, db),
    registration_note: row.registration_note ?? null,
    confidentiality_accepted_at: toIso(row.confidentiality_accepted_at),
    reviewed_by: row.reviewed_by_id ? toUserRef(getUser(row.reviewed_by_id, db)) : null,
    reviewed_at: toIso(row.reviewed_at),
    review_note: row.review_note ?? null,
    updated_at: toIso(row.updated_at)
  };
}

// ---------- Alta (CLI, admin inicial, POST /api/users) ----------

function createUser({
  email, password, firstName, lastName, role = 'OPERADOR', modules = [], mustChangePassword = true, phone = null
}, db = getDb()) {
  email = normalizeEmail(email);
  if (!checkPasswordPolicy(password)) throw new Error(PASSWORD_POLICY_MESSAGE);
  if (!isRole(role)) throw new Error(`Rol desconocido: ${role}`);
  const moduleList = role === 'ADMIN' ? [] : normalizeModules(modules); // el ADMIN los tiene todos

  const insert = db.transaction(() => {
    if (getUserByEmail(email, db)) throw new AppError(409, 'EMAIL_ALREADY_EXISTS', EMAIL_EXISTS_MESSAGE);
    const now = nowIso();
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone,
                         is_active, must_change_password, token_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?)
    `).run(email, hashPasswordSync(password), role, String(firstName).trim(), String(lastName).trim(),
      phone, mustChangePassword ? 1 : 0, now, now);
    const id = Number(info.lastInsertRowid);
    setModules(id, moduleList, now, db);
    return id;
  });
  return getUser(insert(), db);
}

function setModules(userId, modules, now, db) {
  db.prepare('DELETE FROM user_module_permissions WHERE user_id = ?').run(userId);
  const grant = db.prepare('INSERT INTO user_module_permissions (user_id, module, created_at) VALUES (?, ?, ?)');
  for (const m of modules) grant.run(userId, m, now);
}

/** Auto-registro del personal (ADR-0008): la cuenta queda PENDIENTE y sin permisos. */
function createPendingAccount({ email, password, firstName, lastName, phone, requestedModules = [], note = null, ip },
  db = getDb()) {
  email = normalizeEmail(email);
  const requested = normalizeModules(requestedModules);
  const hash = hashPasswordSync(password);
  const id = db.transaction(() => {
    if (getUserByEmail(email, db)) throw new AppError(409, 'EMAIL_ALREADY_EXISTS', EMAIL_EXISTS_MESSAGE);
    const now = nowIso();
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active,
                         must_change_password, token_version, account_status, requested_modules,
                         registration_note, confidentiality_accepted_at, created_at, updated_at)
      VALUES (?, ?, 'OPERADOR', ?, ?, ?, 0, 0, 0, 'PENDIENTE', ?, ?, ?, ?, ?)
    `).run(email, hash, firstName, lastName, phone, JSON.stringify(requested), note, now, now, now);
    const newId = Number(info.lastInsertRowid);
    recordAudit({ action: 'ACCOUNT_REQUESTED', entity: 'users', entityId: newId, userId: newId,
      detail: { email, requested_modules: requested }, ip }, db);
    return newId;
  })();
  return getUser(id, db);
}

// ---------- Consultas del ADMIN ----------

function getUserOr404(id, db = getDb()) {
  const user = Number.isInteger(id) && id > 0 ? getUser(id, db) : null;
  if (!user) throw new AppError(404, 'NOT_FOUND', 'No existe un usuario con ese identificador.');
  return user;
}

const USER_ORDER = Object.freeze({
  created_at: 'u.created_at ASC, u.id ASC',
  '-created_at': 'u.created_at DESC, u.id DESC',
  last_name: 'lower(u.last_name) ASC, lower(u.first_name) ASC, u.id ASC',
  '-last_name': 'lower(u.last_name) DESC, lower(u.first_name) DESC, u.id DESC',
  last_login_at: 'u.last_login_at ASC, u.id ASC',
  '-last_login_at': 'u.last_login_at DESC, u.id DESC'
});

function listUsers(pageParams, { search, role, accountStatus, isActive, module, orderBy = '-created_at' } = {},
  db = getDb()) {
  const where = [];
  const params = {};
  if (search) {
    params.q = likePattern(search);
    where.push(`(lower(u.first_name) LIKE @q ESCAPE '\\' OR lower(u.last_name) LIKE @q ESCAPE '\\'
      OR lower(u.email) LIKE @q ESCAPE '\\' OR lower(u.first_name || ' ' || u.last_name) LIKE @q ESCAPE '\\')`);
  }
  if (role) { where.push('u.role = @role'); params.role = role; }
  if (accountStatus) { where.push('u.account_status = @status'); params.status = accountStatus; }
  if (isActive !== undefined && isActive !== null) { where.push('u.is_active = @active'); params.active = isActive ? 1 : 0; }
  if (module) {
    where.push(`u.account_status = 'APROBADA' AND (u.role = 'ADMIN' OR EXISTS (
      SELECT 1 FROM user_module_permissions p WHERE p.user_id = u.id AND p.module = @module))`);
    params.module = module;
  }
  return paginate(db, {
    select: 'u.*', from: 'users u', where: where.join(' AND '), params,
    orderBy: USER_ORDER[orderBy] || USER_ORDER['-created_at'],
    map: (row) => toUserOut(row, db)
  }, pageParams);
}

function usersSummary(db = getDb()) {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN account_status = 'PENDIENTE' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN account_status = 'APROBADA' AND is_active = 1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN account_status = 'APROBADA' AND is_active = 0 THEN 1 ELSE 0 END) AS inactive,
      SUM(CASE WHEN account_status = 'RECHAZADA' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN account_status = 'APROBADA' AND is_active = 1 AND role = 'ADMIN' THEN 1 ELSE 0 END) AS admins
    FROM users
  `).get();
  const n = (v) => Number(v || 0);
  return { pending: n(row.pending), active: n(row.active), inactive: n(row.inactive), rejected: n(row.rejected), admins: n(row.admins) };
}

function countActiveAdmins({ excludingId = null } = {}, db = getDb()) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM users
    WHERE role = 'ADMIN' AND account_status = 'APROBADA' AND is_active = 1 AND id <> ?
  `).get(excludingId ?? -1).n;
}

// ---------- Reglas comunes ----------

function requireState(user, allowed) {
  if (!allowed.includes(user.account_status)) {
    throw new AppError(400, 'INVALID_ACCOUNT_STATE',
      `Esta acción no está disponible para una cuenta ${ACCOUNT_STATUS_LABELS[user.account_status]}.`);
  }
}

function forbidSelf(actor, user) {
  if (actor && actor.id === user.id) {
    throw new AppError(400, 'SELF_ACTION_FORBIDDEN', 'No puedes realizar esta acción sobre tu propia cuenta.');
  }
}

function lastAdminError() {
  return new AppError(400, 'LAST_ADMIN', 'Debe existir al menos un administrador activo.');
}

const actorId = (actor) => (actor ? actor.id : null);

// ---------- Casos de uso del ADMIN ----------

function adminCreateUser(actor, { email, firstName, lastName, phone = null, role = 'OPERADOR', modules = [] }, ip,
  db = getDb()) {
  const temporaryPassword = generateTemporaryPassword();
  const user = db.transaction(() => {
    const created = createUser({ email, password: temporaryPassword, firstName, lastName, role, modules,
      mustChangePassword: true, phone }, db);
    recordAudit({ action: 'USER_CREATED', entity: 'users', entityId: created.id, userId: actorId(actor),
      detail: { email: created.email, role: created.role, modules: configuredModules(created, db) }, ip }, db);
    return created;
  })();
  return { user: getUser(user.id, db), temporaryPassword };
}

/** data: { first_name?, last_name?, phone?, role?, modules?, is_active? } ya validado. */
function updateUser(actor, id, data, ip, db = getDb()) {
  const user = getUserOr404(id, db);
  requireState(user, ['APROBADA']);
  const roleChanges = data.role !== undefined && data.role !== user.role;
  if (actor && actor.id === user.id && (roleChanges || data.is_active === false)) forbidSelf(actor, user);

  const newRole = data.role ?? user.role;
  const newActive = data.is_active === undefined ? Boolean(user.is_active) : data.is_active;
  const wasActiveAdmin = user.role === 'ADMIN' && user.is_active === 1;
  if (wasActiveAdmin && (newRole !== 'ADMIN' || !newActive) && countActiveAdmins({ excludingId: user.id }, db) === 0) {
    throw lastAdminError();
  }

  db.transaction(() => {
    const now = nowIso();
    const changed = ['first_name', 'last_name', 'phone']
      .filter((f) => data[f] !== undefined && (data[f] ?? null) !== (user[f] ?? null));
    const activeChanges = newActive !== Boolean(user.is_active);
    const before = configuredModules(user, db);

    if (changed.length || roleChanges || activeChanges) {
      db.prepare(`
        UPDATE users SET first_name = ?, last_name = ?, phone = ?, role = ?, is_active = ?,
                         token_version = token_version + ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.first_name ?? user.first_name, data.last_name ?? user.last_name,
        data.phone === undefined ? user.phone : data.phone, newRole, newActive ? 1 : 0,
        roleChanges || (activeChanges && !newActive) ? 1 : 0, now, user.id
      );
    }

    let permissionsDiff = null;
    if (newRole === 'ADMIN') {
      if (roleChanges) setModules(user.id, [], now, db);
    } else if (roleChanges) {
      setModules(user.id, normalizeModules(data.modules || []), now, db);
    } else if (data.modules !== undefined) {
      const next = normalizeModules(data.modules);
      const added = next.filter((m) => !before.includes(m));
      const removed = before.filter((m) => !next.includes(m));
      if (added.length || removed.length) {
        setModules(user.id, next, now, db);
        db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(now, user.id);
        permissionsDiff = { added, removed };
      }
    }

    const audit = (action, detail = null) => recordAudit({ action, entity: 'users', entityId: user.id,
      userId: actorId(actor), detail, ip }, db);
    if (changed.length) audit('USER_UPDATED', { changed });
    if (roleChanges) audit('ROLE_CHANGED', { from: user.role, to: newRole });
    if (permissionsDiff) audit('PERMISSIONS_CHANGED', permissionsDiff);
    if (activeChanges) audit(newActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED');
  })();
  return getUser(user.id, db);
}

function approveAccount(actor, id, { role = 'OPERADOR', modules = [], note = null }, ip, db = getDb()) {
  const user = getUserOr404(id, db);
  requireState(user, ['PENDIENTE', 'RECHAZADA']);
  forbidSelf(actor, user);
  const moduleList = role === 'ADMIN' ? [] : normalizeModules(modules);
  db.transaction(() => {
    const now = nowIso();
    db.prepare(`
      UPDATE users SET account_status = 'APROBADA', is_active = 1, must_change_password = 0, role = ?,
                       reviewed_by_id = ?, reviewed_at = ?, review_note = ?, updated_at = ?
      WHERE id = ?
    `).run(role, actorId(actor), now, note, now, user.id);
    setModules(user.id, moduleList, now, db);
    recordAudit({ action: 'ACCOUNT_APPROVED', entity: 'users', entityId: user.id, userId: actorId(actor),
      detail: { role, modules: role === 'ADMIN' ? [...MODULE_KEYS] : moduleList,
        requested_modules: parseModuleList(user.requested_modules) }, ip }, db);
  })();
  return getUser(user.id, db);
}

function rejectAccount(actor, id, { reason }, ip, db = getDb()) {
  const user = getUserOr404(id, db);
  requireState(user, ['PENDIENTE']);
  forbidSelf(actor, user);
  db.transaction(() => {
    const now = nowIso();
    db.prepare(`
      UPDATE users SET account_status = 'RECHAZADA', is_active = 0, review_note = ?, reviewed_by_id = ?,
                       reviewed_at = ?, token_version = token_version + 1, updated_at = ?
      WHERE id = ?
    `).run(reason, actorId(actor), now, now, user.id);
    recordAudit({ action: 'ACCOUNT_REJECTED', entity: 'users', entityId: user.id, userId: actorId(actor),
      detail: { reason }, ip }, db);
  })();
  return getUser(user.id, db);
}

/** Asigna una contraseña temporal (compartido por el ADMIN y la CLI). Debe ir dentro de una transacción. */
function applyTemporaryPassword(user, { actor, via, ip, reactivate }, db) {
  const password = generateTemporaryPassword();
  db.prepare(`
    UPDATE users SET password_hash = ?, must_change_password = 1,
                     is_active = CASE WHEN ? = 1 AND account_status = 'APROBADA' THEN 1 ELSE is_active END,
                     token_version = token_version + 1, updated_at = ?
    WHERE id = ?
  `).run(hashPasswordSync(password), reactivate ? 1 : 0, nowIso(), user.id);
  recordAudit({ action: 'PASSWORD_RESET', entity: 'users', entityId: user.id, userId: actorId(actor),
    detail: { via }, ip }, db);
  return password;
}

function adminResetPassword(actor, id, ip, db = getDb()) {
  const user = getUserOr404(id, db);
  requireState(user, ['APROBADA']);
  forbidSelf(actor, user);
  return db.transaction(() => applyTemporaryPassword(user, { actor, via: 'admin', ip, reactivate: false }, db))();
}

function deleteAccountRequest(actor, id, ip, db = getDb()) {
  const user = getUserOr404(id, db);
  requireState(user, ['PENDIENTE', 'RECHAZADA']);
  forbidSelf(actor, user);
  db.transaction(() => {
    recordAudit({ action: 'USER_DELETED', entity: 'users', entityId: user.id, userId: actorId(actor),
      detail: { email: user.email, account_status: user.account_status }, ip }, db);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  })();
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

/** Asigna una contraseña temporal (soporte, --reset-admin). Sin correo: el primer ADMIN aprobado. */
function resetPasswordToTemporary(email = null, config = getConfig(), db = getDb()) {
  const user = email
    ? getUserByEmail(email, db)
    : db.prepare(`SELECT * FROM users WHERE role = 'ADMIN' AND account_status = 'APROBADA'
                  ORDER BY is_active DESC, id LIMIT 1`).get();
  if (!user) throw new AppError(404, 'NOT_FOUND', 'No existe un usuario con ese correo.');

  const password = db.transaction(() => applyTemporaryPassword(user, { actor: null, via: 'cli', ip: null, reactivate: true }, db))();
  writeCredentialsFile(user.email, password, 'Restablecimiento de contraseña', config);
  return { user: getUser(user.id, db), password };
}

module.exports = {
  CREDENTIALS_FILE_NAME,
  normalizeEmail,
  getUser,
  getUserByEmail,
  getUserOr404,
  configuredModules,
  effectiveModules,
  hasModule,
  toUserMe,
  toUserRef,
  toUserOut,
  toUserDetail,
  createUser,
  createPendingAccount,
  listUsers,
  usersSummary,
  countActiveAdmins,
  adminCreateUser,
  updateUser,
  approveAccount,
  rejectAccount,
  adminResetPassword,
  deleteAccountRequest,
  credentialsPath,
  writeCredentialsFile,
  removeCredentialsFileIfOwner,
  ensureFirstAdmin,
  resetPasswordToTemporary
};
