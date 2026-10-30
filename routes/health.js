/**
 * /api/health — públicas. El arranque usa /api/health para saber si el sistema ya está abierto.
 */
const express = require('express');

const { APP_ID } = require('../lib/config');
const { getDb } = require('../lib/db');
const { AppError } = require('../lib/errors');
const { version } = require('../package.json');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ status: 'ok', app: APP_ID, version });
});

router.get('/db', (req, res) => {
  try {
    getDb().prepare('SELECT 1').get();
  } catch {
    throw new AppError(503, 'DB_UNAVAILABLE', 'No se pudo conectar a la base de datos.');
  }
  res.json({ status: 'ok', database: 'sqlite' });
});

module.exports = router;
