/**
 * /api/auth — autenticación (capa HTTP: valida la petición y delega en services/auth.js).
 *
 *   POST /api/auth/login            { email, password }                 → 200 { token, expires_in, user }
 *   POST /api/auth/logout           (sesión)                            → 204
 *   GET  /api/auth/me               (sesión, aunque deba cambiar clave) → 200 { user }
 *   POST /api/auth/change-password  { current_password, new_password }  → 200 { token, expires_in, user }
 */
const express = require('express');

const { requireAuthAllowPending } = require('../lib/auth');
const { validationError, wrap } = require('../lib/errors');
const { PASSWORD_POLICY_MESSAGE, checkPasswordPolicy } = require('../lib/security');
const auth = require('../services/auth');
const users = require('../services/users');

const router = express.Router();

const str = (value) => (typeof value === 'string' ? value : '');

router.post('/login', wrap(async (req, res) => {
  const email = str(req.body?.email).trim();
  const password = str(req.body?.password);
  const details = [];
  // Sin validar el formato del correo: no se revela información
  if (email.length < 3 || email.length > 255) details.push({ field: 'email', message: 'Escribe tu correo electrónico.' });
  if (!password || password.length > 128) details.push({ field: 'password', message: 'Escribe tu contraseña.' });
  if (details.length) throw validationError(details);

  res.json(await auth.login({ email, password, ip: req.ip }));
}));

router.post('/logout', requireAuthAllowPending, (req, res) => {
  auth.logout(req.user, req.ip);
  res.status(204).end();
});

router.get('/me', requireAuthAllowPending, (req, res) => {
  res.json({ user: users.toUserMe(req.user) });
});

router.post('/change-password', requireAuthAllowPending, wrap(async (req, res) => {
  const currentPassword = str(req.body?.current_password);
  const newPassword = str(req.body?.new_password);
  const details = [];
  if (!currentPassword || currentPassword.length > 128) {
    details.push({ field: 'current_password', message: 'Escribe tu contraseña actual.' });
  }
  if (!checkPasswordPolicy(newPassword)) details.push({ field: 'new_password', message: PASSWORD_POLICY_MESSAGE });
  if (details.length) throw validationError(details);

  res.json(await auth.changePassword(req.user, { currentPassword, newPassword, ip: req.ip }));
}));

module.exports = router;
