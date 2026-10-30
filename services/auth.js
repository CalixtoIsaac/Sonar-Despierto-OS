/**
 * Casos de uso de autenticación (ADR-0007, ADR-0008, ADR-0009): login, logout, cambio de contraseña,
 * auto-registro del personal y edición del perfil propio.
 */
const { getConfig } = require('../lib/config');
const { getDb, nowIso } = require('../lib/db');
const { AppError } = require('../lib/errors');
const { RateLimiter } = require('../lib/rate-limit');
const {
  hashPassword, verifyPassword, verifyDummyPassword, signSessionToken
} = require('../lib/security');
const { recordAudit } = require('./audit');
const users = require('./users');

const config = getConfig();
const loginLimiter = new RateLimiter({
  max: config.loginMaxAttempts,
  windowMs: config.loginWindowMinutes * 60 * 1000
});
// Cuenta TODA solicitud de registro válida que llega al servicio (no solo las fallidas)
const registerLimiter = new RateLimiter({
  max: config.registerMaxAttempts,
  windowMs: config.registerWindowMinutes * 60 * 1000
});

const REGISTER_MESSAGE =
  'Tu solicitud fue enviada. Un administrador debe aprobarla antes de que puedas iniciar sesión.';

// Rechazos del login con la contraseña correcta (no cuentan para el límite de intentos)
const ACCOUNT_BLOCKS = {
  PENDIENTE: { reason: 'pending', status: 403, code: 'ACCOUNT_PENDING',
    message: 'Tu solicitud de cuenta está pendiente de aprobación. Un administrador debe revisarla.' },
  RECHAZADA: { reason: 'rejected', status: 403, code: 'ACCOUNT_REJECTED',
    message: 'Tu solicitud de cuenta fue rechazada. Contacta al administrador.' },
  INACTIVA: { reason: 'disabled', status: 403, code: 'ACCOUNT_DISABLED',
    message: 'Tu cuenta está desactivada. Contacta al administrador.' }
};

function sessionResponse(user, db = getDb()) {
  return {
    token: signSessionToken(user),
    expires_in: config.sessionHours * 3600,
    user: users.toUserMe(user, db)
  };
}

async function login({ email, password, ip }, db = getDb()) {
  email = users.normalizeEmail(email);
  const key = `${ip}|${email}`;
  const seconds = loginLimiter.retryAfter(key);
  if (seconds !== null) {
    throw new AppError(429, 'TOO_MANY_REQUESTS',
      `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(seconds / 60)} minutos.`,
      { headers: { 'Retry-After': String(seconds) } });
  }

  const user = users.getUserByEmail(email, db);
  if (!user) {
    await verifyDummyPassword(password); // mismo tiempo de respuesta que con un correo real
  } else if (await verifyPassword(password, user.password_hash)) {
    const block = ACCOUNT_BLOCKS[user.account_status] || (!user.is_active ? ACCOUNT_BLOCKS.INACTIVA : null);
    if (block) {
      recordAudit({ action: 'LOGIN_FAILED', entity: 'users', entityId: user.id, userId: user.id,
        detail: { reason: block.reason }, ip }, db);
      throw new AppError(block.status, block.code, block.message);
    }
    loginLimiter.reset(key);
    db.transaction(() => {
      db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
      recordAudit({ action: 'LOGIN', entity: 'users', entityId: user.id, userId: user.id, ip }, db);
    })();
    return sessionResponse(users.getUser(user.id, db), db);
  }

  // Fallo: mismo mensaje si el correo no existe o si la contraseña es incorrecta
  loginLimiter.registerFailure(key);
  recordAudit({ action: 'LOGIN_FAILED', entity: 'users', entityId: user ? user.id : null,
    userId: user ? user.id : null, detail: { email }, ip }, db);
  throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
}

/** Invalida todos los tokens emitidos a la persona (en todas las computadoras). */
function logout(user, ip, db = getDb()) {
  db.transaction(() => {
    db.prepare('UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?')
      .run(nowIso(), user.id);
    recordAudit({ action: 'LOGOUT', entity: 'users', entityId: user.id, userId: user.id, ip }, db);
  })();
}

async function changePassword(user, { currentPassword, newPassword, ip }, db = getDb()) {
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'La contraseña actual no es correcta.');
  }
  if (newPassword === currentPassword) {
    throw new AppError(400, 'PASSWORD_REUSED', 'La nueva contraseña debe ser distinta de la actual.');
  }
  const hash = await hashPassword(newPassword);
  db.transaction(() => {
    db.prepare(`
      UPDATE users SET password_hash = ?, must_change_password = 0,
                       token_version = token_version + 1, updated_at = ?
      WHERE id = ?
    `).run(hash, nowIso(), user.id);
    recordAudit({ action: 'PASSWORD_CHANGED', entity: 'users', entityId: user.id, userId: user.id, ip }, db);
  })();
  users.removeCredentialsFileIfOwner(user.email);
  return sessionResponse(users.getUser(user.id, db), db);
}

/** POST /api/auth/register — data ya validada por la ruta. */
function register({ email, password, firstName, lastName, phone, requestedModules, note }, ip, db = getDb()) {
  if (!config.registrationEnabled) {
    throw new AppError(403, 'REGISTRATION_DISABLED', 'El registro de cuentas está desactivado. Contacta al administrador.');
  }
  const key = `${ip}|__register__`;
  const seconds = registerLimiter.retryAfter(key);
  if (seconds !== null) {
    throw new AppError(429, 'TOO_MANY_REQUESTS',
      `Demasiadas solicitudes de registro desde este equipo. Intenta de nuevo en ${Math.ceil(seconds / 60)} minutos.`,
      { headers: { 'Retry-After': String(seconds) } });
  }
  registerLimiter.registerFailure(key);
  const user = users.createPendingAccount({ email, password, firstName, lastName, phone, requestedModules, note, ip }, db);
  return { email: user.email, account_status: user.account_status, message: REGISTER_MESSAGE };
}

/** PATCH /api/auth/me — data: { first_name?, last_name?, phone? } ya validada. */
function updateProfile(user, data, ip, db = getDb()) {
  const changed = ['first_name', 'last_name', 'phone']
    .filter((f) => data[f] !== undefined && (data[f] ?? null) !== (user[f] ?? null));
  if (changed.length) {
    db.transaction(() => {
      db.prepare('UPDATE users SET first_name = ?, last_name = ?, phone = ?, updated_at = ? WHERE id = ?').run(
        data.first_name ?? user.first_name, data.last_name ?? user.last_name,
        data.phone === undefined ? user.phone : data.phone, nowIso(), user.id
      );
      recordAudit({ action: 'PROFILE_UPDATED', entity: 'users', entityId: user.id, userId: user.id,
        detail: { changed }, ip }, db);
    })();
  }
  return users.getUser(user.id, db);
}

module.exports = {
  login, logout, changePassword, register, updateProfile, sessionResponse, loginLimiter, registerLimiter, REGISTER_MESSAGE
};
