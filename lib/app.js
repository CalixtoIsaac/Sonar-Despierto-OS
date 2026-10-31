/**
 * Crea la aplicación Express: cabeceras de seguridad, API (/api/*) y páginas de public/.
 * server.js la pone a escuchar; las pruebas la usan directamente.
 */
const path = require('path');
const express = require('express');

const { getConfig } = require('./config');
const { requireAdmin, requireModule, requireAnyModule } = require('./auth');
const { createErrorHandler, notFoundApi } = require('./errors');
const { getLogger } = require('./logger');
const { PUBLIC_DIR } = require('./paths');

function securityHeaders(req, res, next) {
  res.set({
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
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
  app.use(securityHeaders);
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
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: config.isProduction ? '1h' : 0 }));

  app.use(createErrorHandler(getLogger()));
  return app;
}

module.exports = { createApp };
