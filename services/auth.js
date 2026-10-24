/**
 * Casos de uso de autenticación (ADR-0007, ADR-0009): login, logout y cambio de contraseña.
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
    if (!user.is_active) {
      recordAudit({ action: 'LOGIN_FAILED', entity: 'users', entityId: user.id, userId: user.id,
        detail: { reason: 'disabled' }, ip }, db);
      throw new AppError(403, 'ACCOUNT_DISABLED', 'Tu cuenta está desactivada. Contacta al administrador.');
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

module.exports = { login, logout, changePassword, sessionResponse, loginLimiter };
