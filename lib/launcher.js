/**
 * Utilidades de arranque (ADR-0003): instancia única, puerto libre, IPs de la red local,
 * banner de la consola y apertura del navegador.
 */
const { execFile } = require('child_process');
const net = require('net');
const os = require('os');

const { APP_ID } = require('./config');

const PORT_SEARCH_RANGE = 20;
const BANNER_WIDTH = 64;

/** Respuesta de GET /api/health en este equipo, o null si no responde. */
async function healthInfo(port, timeoutMs = 1500) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function isOurInstance(port) {
  const info = await healthInfo(port);
  return Boolean(info && info.app === APP_ID);
}

function portIsFree(host, port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen({ host, port, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

async function findFreePort(host, start, span = PORT_SEARCH_RANGE) {
  for (let port = start; port < start + span && port <= 65535; port++) {
    if (await portIsFree(host, port)) return port;
  }
  throw new Error(`No hay puertos libres entre ${start} y ${start + span - 1}.`);
}

/** IPv4 de este equipo en la red local (sin 127.* ni 169.254.*). */
function lanIpv4Addresses(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const list of Object.values(interfaces)) {
    for (const addr of list || []) {
      const v4 = addr.family === 'IPv4' || addr.family === 4;
      if (!v4 || addr.internal || addr.address.startsWith('169.254.')) continue;
      if (!out.includes(addr.address)) out.push(addr.address);
    }
  }
  return out;
}

const line = (label, value) => `  ${label.padEnd(30)}${value}`;

function bannerText({ localUrl, lanUrls, dataDir, version }) {
  const lines = [
    '='.repeat(BANNER_WIDTH),
    `  Soñar Despierto — Sistema de Gestión  v${version}`,
    '-'.repeat(BANNER_WIDTH),
    line('Abierto en esta computadora:', localUrl)
  ];
  if (lanUrls.length) {
    lines.push(line('Desde otras PCs de la red:', lanUrls[0]));
    for (const url of lanUrls.slice(1)) lines.push(line('', url));
  } else {
    lines.push('  Acceso desde otras PCs: desactivado (LAN_MODE=false)');
  }
  lines.push(
    line('Datos y respaldos en:', dataDir),
    '-'.repeat(BANNER_WIDTH),
    '  NO cierres esta ventana mientras uses el sistema.',
    '  Para apagarlo: cierra esta ventana o presiona Ctrl+C.',
    '='.repeat(BANNER_WIDTH)
  );
  return lines.join('\n');
}

function credentialsBox(text) {
  const rows = text.split(/\r?\n/).filter((l) => l.trim() && !/^=+$/.test(l.trim()));
  return ['', '#'.repeat(BANNER_WIDTH), ...rows.map((r) => `  ${r}`), '#'.repeat(BANNER_WIDTH), ''].join('\n');
}

/** Abre la URL en el navegador predeterminado (sin pasar la URL por una consola). */
function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32'
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const child = execFile(cmd, args, { windowsHide: true }, () => { /* sin navegador: se ignora */ });
    child.unref();
  } catch { /* sin navegador disponible */ }
}

module.exports = {
  PORT_SEARCH_RANGE, healthInfo, isOurInstance, portIsFree, findFreePort,
  lanIpv4Addresses, bannerText, credentialsBox, openBrowser
};
