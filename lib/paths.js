/**
 * Rutas del programa y del directorio de datos (ADR-0003, ADR-0009).
 *
 * Directorio de datos, en este orden:
 *   1. variable SD_DATA_DIR (o --data-dir en la línea de comandos);
 *   2. paquete portátil (existe el archivo PORTABLE junto a server.js): %LOCALAPPDATA%\SonarDespierto;
 *   3. código fuente: <repo>/.data
 *
 * La base de datos NUNCA debe quedar en una carpeta sincronizada (OneDrive, Dropbox):
 * SQLite puede corromperse. Por eso el paquete usa %LOCALAPPDATA%.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_FOLDER_NAME = 'SonarDespierto';
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const IS_PORTABLE = fs.existsSync(path.join(ROOT_DIR, 'PORTABLE'));

function resolveDataDir(env = process.env, { portable = IS_PORTABLE, platform = process.platform } = {}) {
  if (env.SD_DATA_DIR) return path.resolve(env.SD_DATA_DIR);
  if (portable) {
    const base = env.LOCALAPPDATA
      || (platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local') : path.join(os.homedir(), '.local', 'share'));
    return path.join(base, APP_FOLDER_NAME);
  }
  return path.join(ROOT_DIR, '.data');
}

function ensureDataDirs(dataDir) {
  for (const sub of ['', 'logs', 'uploads', 'backups']) {
    fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
  }
}

module.exports = { APP_FOLDER_NAME, ROOT_DIR, PUBLIC_DIR, IS_PORTABLE, resolveDataDir, ensureDataDirs };
