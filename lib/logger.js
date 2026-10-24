/**
 * Registro de eventos del servidor en {DATA_DIR}/logs/sonar.log (y en la consola).
 * Nunca escribas aquí contraseñas, tokens ni datos de niñas y niños.
 */
const fs = require('fs');
const path = require('path');

const { getConfig } = require('./config');

const MAX_BYTES = 2 * 1024 * 1024; // al pasar de 2 MB se rota a sonar.log.1

function createLogger(config = getConfig()) {
  const file = path.join(config.dataDir, 'logs', 'sonar.log');
  const quiet = config.isTest;

  function rotate() {
    try {
      if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
    } catch { /* aún no existe */ }
  }

  function write(level, message, err) {
    const extra = err ? ` | ${err.stack || err}` : '';
    const line = `${new Date().toISOString()} ${level.padEnd(5)} ${message}${extra}\n`;
    try {
      rotate();
      fs.appendFileSync(file, line, 'utf8');
    } catch { /* sin acceso al log: se sigue sin registrar */ }
    if (!quiet) (level === 'ERROR' ? console.error : console.log)(line.trimEnd());
  }

  return {
    info: (msg) => write('INFO', msg),
    warn: (msg) => write('WARN', msg),
    error: (msg, err) => write('ERROR', msg, err)
  };
}

let cached = null;
const getLogger = () => (cached ||= createLogger());

module.exports = { createLogger, getLogger };
