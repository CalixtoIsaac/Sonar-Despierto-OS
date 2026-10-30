/**
 * Contraseñas (bcrypt), política de contraseñas y tokens de sesión JWT (ADR-0007, ADR-0009).
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { getConfig } = require('./config');
const { AppError } = require('./errors');

const BCRYPT_ROUNDS = 10; // mismo costo que SEMA
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72; // límite de bcrypt, en bytes UTF-8
const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número.';

const TOKEN_EXPIRED_MESSAGE = 'Tu sesión expiró. Inicia sesión de nuevo.';
const TOKEN_INVALID_MESSAGE = 'La sesión no es válida. Inicia sesión de nuevo.';

// Hash de relleno: iguala el tiempo de respuesta cuando el correo no existe
const DUMMY_HASH = bcrypt.hashSync('contrasena-ficticia-para-igualar-tiempos', BCRYPT_ROUNDS);

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function hashPasswordSync(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_LENGTH) return false;
  try {
    return await bcrypt.compare(password, hash || DUMMY_HASH);
  } catch {
    return false; // hash con formato inválido
  }
}

/** Gasta el mismo tiempo que una verificación real (no revela si el correo existe). */
async function verifyDummyPassword(password) {
  await verifyPassword(password, DUMMY_HASH);
}

function checkPasswordPolicy(password) {
  if (typeof password !== 'string') return false;
  const length = [...password].length;
  return (
    length >= PASSWORD_MIN_LENGTH &&
    length <= PASSWORD_MAX_LENGTH &&
    Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_LENGTH &&
    /\p{L}/u.test(password) &&
    /\p{Nd}/u.test(password)
  );
}

// Sin caracteres ambiguos al dictarlos o copiarlos a mano (0/O, 1/l/I)
const TEMP_LETTERS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMP_DIGITS = '23456789';

function generateTemporaryPassword(length = 12) {
  const pick = (chars) => chars[crypto.randomInt(chars.length)];
  const all = TEMP_LETTERS + TEMP_DIGITS;
  const chars = [pick(TEMP_LETTERS), pick(TEMP_DIGITS)];
  while (chars.length < Math.max(length, 8)) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Token de sesión. "ver" es users.token_version: al cerrar sesión, cambiar la contraseña o
 * desactivar la cuenta se incrementa y todos los tokens anteriores dejan de valer.
 */
function signSessionToken(user, config = getConfig()) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, ver: user.token_version },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: `${config.sessionHours}h` }
  );
}

function verifySessionToken(token, config = getConfig()) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new AppError(401, 'TOKEN_EXPIRED', TOKEN_EXPIRED_MESSAGE);
    throw new AppError(401, 'TOKEN_INVALID', TOKEN_INVALID_MESSAGE);
  }
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(payload.ver)) {
    throw new AppError(401, 'TOKEN_INVALID', TOKEN_INVALID_MESSAGE);
  }
  return { userId: id, version: payload.ver, expiresAt: payload.exp };
}

module.exports = {
  BCRYPT_ROUNDS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  TOKEN_EXPIRED_MESSAGE,
  TOKEN_INVALID_MESSAGE,
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyDummyPassword,
  checkPasswordPolicy,
  generateTemporaryPassword,
  signSessionToken,
  verifySessionToken
};
