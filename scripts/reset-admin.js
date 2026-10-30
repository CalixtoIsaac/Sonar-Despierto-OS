/**
 * Recupera el acceso: asigna una contraseña temporal al primer ADMIN activo (o al correo indicado).
 * La contraseña queda en {DATA_DIR}/CREDENCIALES_INICIALES.txt y se pide cambiarla al entrar.
 *
 *   npm run reset-admin
 *   npm run reset-admin -- --email ana@sonardespierto.org
 *
 * Cierra antes el sistema si está abierto.
 */
const args = process.argv.slice(2);
const i = args.indexOf('--email');
const email = i >= 0 ? args[i + 1] : null;

const { closeDb } = require('../lib/db');
const { AppError } = require('../lib/errors');
const users = require('../services/users');

try {
  const { user } = users.resetPasswordToTemporary(email);
  console.log(`Contraseña temporal asignada a ${user.email}.`);
  console.log(`Está en: ${users.credentialsPath()}`);
  console.log('Al entrar, el sistema pedirá cambiarla. Las sesiones abiertas se cerraron.');
} catch (err) {
  console.error(`Error: ${err instanceof AppError ? err.message : err.message}`);
  process.exitCode = 1;
} finally {
  closeDb();
}
