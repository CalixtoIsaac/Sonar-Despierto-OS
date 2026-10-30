/**
 * Configuración central por capas (ADR-0009).
 *
 * Precedencia: variables de entorno > {DATA_DIR}/config.env > .env (raíz del repo) > valores por defecto.
 * - En desarrollo se usa .env (copia de .env.example).
 * - El paquete portátil usa {DATA_DIR}/config.env, que se crea solo en el primer arranque.
 *
 * La clave JWT: si JWT_SECRET está vacía, se lee (o se crea una sola vez) {DATA_DIR}/secret.key.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const { ROOT_DIR, IS_PORTABLE, resolveDataDir, ensureDataDirs } = require('./paths');

const APP_ID = 'sonar-despierto'; // el arranque lo usa para reconocer su propia instancia
const APP_NAME = 'Soñar Despierto';
const PLACEHOLDER_PREFIX = 'CAMBIAR';

function readEnvFile(file) {
  try {
    return dotenv.parse(fs.readFileSync(file));
  } catch {
    return {};
  }
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(String(value).trim().toLowerCase());
}

function toInt(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function resolveSecret(raw, dataDir) {
  const value = String(raw || '').trim();
  if (value.length >= 32 && !value.startsWith(PLACEHOLDER_PREFIX)) return value;
  const keyFile = path.join(dataDir, 'secret.key');
  let key = '';
  try { key = fs.readFileSync(keyFile, 'utf8').trim(); } catch { /* aún no existe */ }
  if (key.length < 32) {
    key = crypto.randomBytes(48).toString('base64url');
    fs.writeFileSync(keyFile, key, { encoding: 'utf8', mode: 0o600 });
  }
  return key;
}

function loadConfig(processEnv = process.env) {
  const repoEnv = readEnvFile(path.join(ROOT_DIR, '.env'));
  const dataDir = resolveDataDir({ ...repoEnv, ...processEnv });
  ensureDataDirs(dataDir);
  const dataEnv = readEnvFile(path.join(dataDir, 'config.env'));
  const env = { ...repoEnv, ...dataEnv, ...processEnv };

  const appEnv = ['development', 'test', 'production'].includes(env.APP_ENV)
    ? env.APP_ENV
    : (IS_PORTABLE ? 'production' : 'development');
  const lanMode = toBool(env.LAN_MODE, false);

  return Object.freeze({
    APP_ID,
    APP_NAME,
    appEnv,
    isProduction: appEnv === 'production',
    isTest: appEnv === 'test',
    dataDir,
    dbPath: env.DB_PATH ? path.resolve(env.DB_PATH) : path.join(dataDir, 'sonar.db'),
    host: env.HOST || '127.0.0.1',
    port: toInt(env.PORT, 8765, { min: 1, max: 65535 }),
    lanMode,
    bindHost: lanMode ? '0.0.0.0' : (env.HOST || '127.0.0.1'),
    openBrowser: toBool(env.OPEN_BROWSER, true),
    jwtSecret: resolveSecret(env.JWT_SECRET, dataDir),
    sessionHours: toInt(env.SESSION_HOURS, 8, { min: 1, max: 24 }),
    firstAdminEmail: String(env.FIRST_ADMIN_EMAIL || 'admin@sonardespierto.org').trim().toLowerCase(),
    firstAdminPassword: String(env.FIRST_ADMIN_PASSWORD || ''),
    loginMaxAttempts: toInt(env.LOGIN_MAX_ATTEMPTS, 5, { min: 1 }),
    loginWindowMinutes: toInt(env.LOGIN_WINDOW_MINUTES, 15, { min: 1 }),
    maxUploadMb: toInt(env.MAX_UPLOAD_MB, 5, { min: 1 }),
    // Registro de cuentas del personal (ADR-0008)
    registrationEnabled: toBool(env.REGISTRATION_ENABLED, true),
    registerMaxAttempts: toInt(env.REGISTER_MAX_ATTEMPTS, 5, { min: 1 }),
    registerWindowMinutes: toInt(env.REGISTER_WINDOW_MINUTES, 60, { min: 1 })
  });
}

let cached = null;
/** Configuración del proceso (se calcula una sola vez). */
function getConfig() {
  if (!cached) cached = loadConfig();
  return cached;
}

module.exports = { APP_ID, APP_NAME, loadConfig, getConfig, toBool, toInt };
