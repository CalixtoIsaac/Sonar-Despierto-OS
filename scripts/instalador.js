/**
 * Genera el instalador de Windows (Fase 8, ADR-0015):
 *
 *   npm run instalador                  → pruebas + paquete portátil + prueba de humo + instalador
 *   npm run instalador -- --sin-paquete → usa el dist\SonarDespierto que ya existe
 *
 * Requiere Windows de 64 bits e Inno Setup 6 (gratuito):  winget install JRSoftware.InnoSetup
 * Resultado: dist\instalador\SonarDespierto-Instalador-<versión>.exe
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'SonarDespierto');
const ISS = path.join(ROOT, 'installer', 'SonarDespierto.iss');
const { version } = require('../package.json');
const args = process.argv.slice(2);

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function findIscc(env = process.env) {
  const candidates = [
    env.ISCC,
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Inno Setup 6', 'ISCC.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Inno Setup 6', 'ISCC.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe')
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function main() {
  if (process.platform !== 'win32') fail('El instalador se genera en Windows (el paquete lleva el node.exe de esa computadora).');
  const iscc = findIscc();
  if (!iscc) fail('No se encontró Inno Setup 6. Instálalo con:  winget install JRSoftware.InnoSetup  (o desde jrsoftware.org) y vuelve a intentarlo.');

  if (!args.includes('--sin-paquete') || !fs.existsSync(path.join(DIST, 'node.exe'))) {
    console.log('\n▶ Generando el paquete portátil (npm run empaquetar)');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'empaquetar.js'), ...args.filter((a) => a === '--sin-pruebas')], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) fail('No se pudo generar el paquete portátil.');
  }
  if (!fs.existsSync(path.join(DIST, 'node.exe')) || !fs.existsSync(path.join(DIST, 'PORTABLE'))) fail(`El paquete ${DIST} está incompleto.`);

  console.log(`\n▶ Compilando el instalador con ${iscc}`);
  const r = spawnSync(iscc, [`/DAppVersion=${version}`, `/DSourceDir=${DIST}`, ISS], { cwd: path.dirname(ISS), stdio: 'inherit' });
  if (r.status !== 0) fail('Inno Setup no pudo compilar el instalador.');
  const exe = path.join(ROOT, 'dist', 'instalador', `SonarDespierto-Instalador-${version}.exe`);
  if (!fs.existsSync(exe)) fail(`No se encontró ${exe}`);
  console.log(`\n✔ Instalador listo: ${exe} (${(fs.statSync(exe).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log('  Pruébalo en una PC (o cuenta de Windows) SIN Node.js: docs/fases/Fase_8_Contratos.md §7.');
}

if (require.main === module) main();
module.exports = { findIscc };
