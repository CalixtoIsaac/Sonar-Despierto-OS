/**
 * Crea un usuario desde la consola (desarrollo y soporte, hasta que exista la pantalla de la Fase 2).
 *
 *   npm run create-user -- --email ana@sonardespierto.org --first-name Ana --last-name Prueba
 *                          --role OPERADOR --modules CARTAS,CALENDARIO [--password Clave1234] [--no-must-change]
 */
const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const USAGE = 'Uso: npm run create-user -- --email CORREO --first-name NOMBRE --last-name APELLIDOS '
  + '[--role ADMIN|OPERADOR] [--modules CARTAS,CALENDARIO] [--password CLAVE] [--no-must-change]';

const email = opt('--email');
const firstName = opt('--first-name');
const lastName = opt('--last-name');
if (!email || !firstName || !lastName) {
  console.error(USAGE);
  process.exit(1);
}

const { closeDb, getDb } = require('../lib/db');
const { AppError } = require('../lib/errors');
const { generateTemporaryPassword } = require('../lib/security');
const users = require('../services/users');

const password = opt('--password') || generateTemporaryPassword();
const modules = (opt('--modules') || '').split(',').map((m) => m.trim()).filter(Boolean);

try {
  const user = users.createUser({
    email,
    password,
    firstName,
    lastName,
    role: (opt('--role') || 'OPERADOR').toUpperCase(),
    modules,
    mustChangePassword: !args.includes('--no-must-change')
  });
  console.log(`Usuario creado: ${user.email} (${user.role})`);
  console.log(`Módulos: ${users.effectiveModules(user, getDb()).join(', ') || '(ninguno)'}`);
  if (!opt('--password')) console.log(`Contraseña temporal (se muestra una sola vez): ${password}`);
} catch (err) {
  console.error(`Error: ${err instanceof AppError ? err.message : err.message}`);
  process.exitCode = 1;
} finally {
  closeDb();
}
