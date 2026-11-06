/**
 * /api/backups — respaldos y restauración (solo ADMIN, ADR-0015). Contratos: docs/fases/Fase_8_Contratos.md
 *
 *   GET    /api/backups                        → { items, settings }
 *   POST   /api/backups                        → 201 { backup }            (respaldo manual)
 *   GET    /api/backups/:name/download         → el .zip (auditado)
 *   POST   /api/backups/:name/restore          { confirm: "RESTAURAR" } → { restored, pre_backup, sessions_closed }
 *   POST   /api/backups/restore-upload?confirm=RESTAURAR   (cuerpo = el .zip) → igual que restore
 */
const fs = require('fs');
const path = require('path');
const express = require('express');

const { getConfig } = require('../lib/config');
const { AppError, wrap } = require('../lib/errors');
const backups = require('../services/backups');

const router = express.Router();

function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
router.use(noStore);

function assertConfirm(value) {
  if (String(value || '').trim().toUpperCase() !== backups.CONFIRM_WORD) {
    throw new AppError(422, 'CONFIRMATION_REQUIRED', `Escribe ${backups.CONFIRM_WORD} para confirmar la restauración.`,
      { details: [{ field: 'confirm', message: `Escribe ${backups.CONFIRM_WORD}.` }] });
  }
}

router.get('/', (req, res) => {
  res.json(backups.listBackups());
});

router.post('/', wrap(async (req, res) => {
  const backup = await backups.createBackup({ kind: 'MANUAL', actor: req.user, ip: req.ip });
  res.status(201).json({ backup });
}));

router.get('/:name/download', (req, res) => {
  const file = backups.recordDownload(req.user, req.params.name, req.ip);
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${req.params.name}"`
  });
  res.sendFile(file, { cacheControl: false, lastModified: false });
});

router.post('/restore-upload', wrap(async (req, res) => {
  assertConfirm(req.query.confirm);
  const type = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(type)) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Sube el archivo .zip de un respaldo.');
  }
  const max = getConfig().maxRestoreMb * 1024 * 1024;
  const declared = Number(req.get('content-length'));
  if (declared > max) throw new AppError(413, 'FILE_TOO_LARGE', `El respaldo pesa más de ${getConfig().maxRestoreMb} MB.`);

  const target = backups.importedPath();
  const part = `${target}.part`;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(part);
    let size = 0;
    let failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      req.unpipe(out);
      out.destroy();
      fs.rm(part, { force: true }, () => reject(err));
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) fail(new AppError(413, 'FILE_TOO_LARGE', `El respaldo pesa más de ${getConfig().maxRestoreMb} MB.`));
    });
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => { if (!failed) resolve(); });
    req.pipe(out);
  });
  if (fs.statSync(part).size === 0) {
    fs.rmSync(part, { force: true });
    throw new AppError(422, 'BACKUP_INVALID', 'El archivo está vacío.');
  }
  try {
    backups.verifyBackupFile(part);
  } catch (err) {
    fs.rmSync(part, { force: true });
    throw err;
  }
  fs.renameSync(part, target);
  backups.prune('IMPORTADO', getConfig(), path.basename(target));
  res.json(await backups.restoreBackup(target, { actor: req.user, ip: req.ip }));
}));

router.post('/:name/restore', wrap(async (req, res) => {
  assertConfirm(req.body && req.body.confirm);
  const file = backups.backupPath(req.params.name);
  res.json(await backups.restoreBackup(file, { actor: req.user, ip: req.ip }));
}));

module.exports = router;
