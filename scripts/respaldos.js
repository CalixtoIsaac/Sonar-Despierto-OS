/**
 * Respaldos desde la línea de comandos (ADR-0015). Sirve aunque el sistema no abra.
 *
 *   node server.js --respaldar                       (o npm run respaldar)       → respaldo manual
 *   node server.js --listar-respaldos
 *   node server.js --restaurar RUTA\respaldo.zip [--si]  (o npm run restaurar -- RUTA)
 *
 * Restaurar exige que el sistema esté CERRADO (se revisa) y pide escribir RESTAURAR, salvo con --si.
 */
const path = require('path');
const readline = require('readline');

const { getConfig } = require('../lib/config');
const launcher = require('../lib/launcher');

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (iso) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' });

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function runningPort(config) {
  for (let port = config.port; port < config.port + launcher.PORT_SEARCH_RANGE; port++) {
    if (await launcher.isOurInstance(port)) return port;
  }
  return null;
}

async function main() {
  const config = getConfig();
  const backups = require('../services/backups');
  const { closeDb } = require('../lib/db');

  try {
    if (args.includes('--listar-respaldos')) {
      const { items, settings } = backups.listBackups();
      console.log(`Respaldos en ${settings.dir}:`);
      if (!items.length) console.log('  (todavía no hay respaldos)');
      for (const b of items) {
        console.log(`  ${b.name.padEnd(48)} ${b.kind_label.padEnd(24)} ${when(b.created_at).padEnd(22)} ${kb(b.size_bytes)}`);
      }
      return;
    }

    if (args.includes('--respaldar')) {
      const b = await backups.createBackup({ kind: 'MANUAL', via: 'cli' });
      console.log(`Respaldo listo: ${path.join(backups.backupsDir(), b.name)} (${kb(b.size_bytes)})`);
      if (b.copy) console.log(b.copy.ok ? `Copia extra en: ${b.copy.dir}` : `No se pudo hacer la copia extra en ${b.copy.dir}: ${b.copy.error}`);
      return;
    }

    const file = valueOf('--restaurar');
    if (!file) throw new Error('Indica el archivo: --restaurar RUTA\\respaldo.zip');
    const abs = path.resolve(file);
    const port = await runningPort(config);
    if (port) throw new Error(`Soñar Despierto está abierto (puerto ${port}). Ciérralo antes de restaurar desde aquí, o restaura desde el menú Respaldos.`);
    const { manifest, info, uploads } = backups.verifyBackupFile(abs);
    console.log(`Respaldo del ${when(manifest.created_at)} (versión ${manifest.app_version || '¿?'}, esquema ${info.schemaVersion}).`);
    console.log(`Contiene: ${info.counts.children ?? 0} niñas y niños, ${info.counts.letters ?? 0} cartas, ${info.counts.volunteers ?? 0} voluntarios, ${uploads} fotos.`);
    console.log(`Se REEMPLAZARÁN los datos actuales de ${config.dataDir}`);
    console.log('(antes se guarda un respaldo "antes de restaurar" para poder deshacerlo).');
    if (!args.includes('--si')) {
      const answer = await ask('Escribe RESTAURAR para continuar: ');
      if (answer.trim().toUpperCase() !== backups.CONFIRM_WORD) {
        console.log('Cancelado: no se cambió nada.');
        return;
      }
    }
    const r = await backups.restoreBackup(abs, { via: 'cli' });
    console.log(`Restauración terminada. Respaldo previo: ${r.pre_backup.name}`);
    console.log('Abre el sistema y entra con las contraseñas que había en la fecha del respaldo.');
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
