/**
 * Punto de entrada: prepara los datos, aplica las migraciones, crea el administrador inicial,
 * inicia el servidor y abre el navegador (ADR-0003, ADR-0009).
 *
 *   node server.js [--no-browser] [--port N] [--lan] [--data-dir RUTA]
 *
 * En Windows se arranca con doble clic en SonarDespierto.bat.
 */
const fs = require('fs');
const path = require('path');

// ---------- Opciones de la línea de comandos (ANTES de leer la configuración) ----------
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes('--help') || args.includes('-h')) {
  console.log('Uso: node server.js [--no-browser] [--port N] [--lan] [--data-dir RUTA] [--reset-admin [--email CORREO]]');
  process.exit(0);
}
if (args.includes('--no-browser')) process.env.OPEN_BROWSER = 'false';
if (args.includes('--lan')) process.env.LAN_MODE = 'true';
if (valueOf('--port')) process.env.PORT = valueOf('--port');
if (valueOf('--data-dir')) process.env.SD_DATA_DIR = path.resolve(valueOf('--data-dir'));
if (args.includes('--reset-admin')) {
  require('./scripts/reset-admin'); // asigna una contraseña temporal y termina
  return;
}

const { getConfig } = require('./lib/config');
const { IS_PORTABLE, ROOT_DIR } = require('./lib/paths');
const launcher = require('./lib/launcher');
const { version } = require('./package.json');

/** Primer arranque del paquete portátil: copia la plantilla de configuración. */
function writeDefaultConfig(dataDir) {
  const target = path.join(dataDir, 'config.env');
  const template = path.join(ROOT_DIR, 'config.env.template');
  if (IS_PORTABLE && !fs.existsSync(target) && fs.existsSync(template)) fs.copyFileSync(template, target);
}

async function main() {
  const config = getConfig();
  writeDefaultConfig(config.dataDir);

  // ¿Ya está abierto? Solo se abre el navegador.
  if (await launcher.isOurInstance(config.port)) {
    const url = `http://localhost:${config.port}`;
    console.log(`Soñar Despierto ya está abierto en ${url}`);
    if (config.openBrowser) launcher.openBrowser(url);
    return;
  }

  const port = await launcher.findFreePort(config.bindHost, config.port);
  if (port !== config.port) console.log(`El puerto ${config.port} está ocupado; se usará el ${port}.`);

  const { getDb, closeDb } = require('./lib/db');
  const { getLogger } = require('./lib/logger');
  const users = require('./services/users');
  const logger = getLogger();

  getDb(); // abre la BD y aplica las migraciones pendientes
  users.ensureFirstAdmin();
  logger.info('Base de datos lista (sqlite)');

  const { createApp } = require('./lib/app');
  const server = createApp().listen(port, config.bindHost, () => {
    const localUrl = `http://localhost:${port}`;
    const lanUrls = config.lanMode ? launcher.lanIpv4Addresses().map((ip) => `http://${ip}:${port}`) : [];
    console.log(launcher.bannerText({ localUrl, lanUrls, dataDir: config.dataDir, version }));

    const credentials = users.credentialsPath();
    if (fs.existsSync(credentials)) {
      console.log(launcher.credentialsBox(fs.readFileSync(credentials, 'utf8')));
      console.log(`  (Copia guardada en ${credentials})\n`);
    }
    logger.info(`Servidor listo en ${localUrl}${config.lanMode ? ' (modo LAN)' : ''}`);
    if (config.openBrowser) launcher.openBrowser(localUrl);
  });

  // Cierre ordenado: libera el archivo de la base de datos.
  function shutdown() {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`\n✖ No se pudo iniciar Soñar Despierto: ${err.message}\n`);
  process.exit(1);
});
