/**
 * Crea la aplicación Express: cabeceras de seguridad, API (/api/*) y páginas de public/.
 * server.js la pone a escuchar; las pruebas la usan directamente.
 */
const net = require('net');
const os = require('os');
const path = require('path');
const express = require('express');

const { getConfig } = require('./config');
const { requireAdmin, requireModule, requireAnyModule } = require('./auth');
const { createErrorHandler, notFoundApi } = require('./errors');
const { getLogger } = require('./logger');
const { PUBLIC_DIR } = require('./paths');

// Política de contenido (revisión de seguridad F8): solo scripts propios, sin incrustar en otros sitios.
// style-src admite 'unsafe-inline' porque las vistas usan atributos style=; los scripts NO.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  next();
}

/**
 * Cabecera Host permitida (evita "DNS rebinding": que una página de internet use un dominio propio que
 * apunte a 127.0.0.1 para hablar con el sistema). Se aceptan localhost, direcciones IP, nombres de
 * equipo sin punto (PC-OFICINA), el nombre de esta computadora y ALLOWED_HOSTS.
 */
function hostAllowed(hostHeader, config, hostname = os.hostname()) {
  if (!hostHeader) return false;
  let host = String(hostHeader).trim().toLowerCase();
  if (host.startsWith('[')) host = host.slice(1, host.indexOf(']')); // [::1]:8765
  else host = host.replace(/:\d+$/, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || net.isIP(host)) return true;
  if (!host.includes('.')) return true;
  const me = String(hostname || '').toLowerCase();
  if (me && (host === me || host === `${me}.local` || host === `${me}.lan`)) return true;
  return (config.allowedHosts || []).includes(host);
}

function hostGuard(config) {
  return (req, res, next) => {
    if (hostAllowed(req.headers.host, config)) return next();
    res.status(421).type('text/plain; charset=utf-8')
      .send('Dirección no permitida. Abre el sistema con http://localhost o con la IP de la computadora (ver ALLOWED_HOSTS en el manual).');
  };
}

/** Las respuestas de la API (con datos personales) nunca se guardan en la caché del navegador. */
function apiNoStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

function sendPage(file) {
  return (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, file));
  };
}

function createApp(config = getConfig()) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false); // req.ip = IP real de la PC que se conecta (sin proxy en el MVP local)
  app.use(hostGuard(config));
  app.use(securityHeaders);
  app.use('/api', apiNoStore);
  app.use(express.json({ limit: '1mb' }));

  // ---------- API ----------
  app.use('/api/health', require('../routes/health'));
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/users', requireAdmin, require('../routes/users'));
  app.use('/api/audit-logs', requireAdmin, require('../routes/audit-logs'));
  // Fase 3 — personas (ADR-0004): los datos de niñas y niños solo con BENEFICIARIOS
  app.use('/api/volunteers', requireModule('VOLUNTARIOS'), require('../routes/volunteers'));
  app.use('/api/schools', requireModule('BENEFICIARIOS'), require('../routes/schools'));
  app.use('/api/tutors', requireModule('BENEFICIARIOS'), require('../routes/tutors'));
  app.use('/api/children', requireModule('BENEFICIARIOS'), require('../routes/children'));
  // Fase 4 — eventos y cartas (ADR-0011): leer eventos basta con CARTAS (selector); escribir exige EVENTOS
  app.use('/api/events', requireAnyModule(['EVENTOS', 'CARTAS']), require('../routes/events'));
  app.use('/api/letters', requireModule('CARTAS'), require('../routes/letters'));
  // Fase 5 — calendario de actividades (ADR-0012)
  app.use('/api/activities', requireModule('CALENDARIO'), require('../routes/activities'));
  // Fase 6 — inventario (ADR-0006, ADR-0013): existencias calculadas de un libro de movimientos
  app.use('/api/inventory', requireModule('INVENTARIO'), require('../routes/inventory'));
  // Fase 7 — dashboard y reportes (ADR-0014): solo conteos, sin datos personales
  app.use('/api/reports', requireModule('REPORTES'), require('../routes/reports'));
  // Fase 8 — respaldos y restauración (ADR-0015): solo ADMIN
  app.use('/api/backups', requireAdmin, require('../routes/backups'));
  // Registra aquí los módulos nuevos, cada uno con su guarda (requireModule('X') o requireAdmin)

  if (config.isTest) {
    // Rutas solo para pruebas de permisos (no existen fuera de APP_ENV=test)
    app.get('/api/_test/cartas', requireModule('CARTAS'), (req, res) => res.json({ ok: true }));
    app.get('/api/_test/admin', requireAdmin, (req, res) => res.json({ ok: true }));
  }

  app.use('/api', notFoundApi);

  // ---------- Páginas ----------
  app.get('/', sendPage('login.html'));
  app.get('/registro', sendPage('registro.html'));
  app.get('/app', sendPage('app.html'));
  // no-cache = el navegador revalida cada archivo (304 si no cambió): al actualizar el programa nunca
  // se quedan pantallas, estilos o íconos viejos en la caché (en localhost el costo es mínimo).
  app.use(express.static(PUBLIC_DIR, { index: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

  app.use(createErrorHandler(getLogger()));
  return app;
}

module.exports = { createApp, hostAllowed, CSP };
