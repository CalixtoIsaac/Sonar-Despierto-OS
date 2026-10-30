/**
 * /api/auth — autenticación (capa HTTP: valida la petición y delega en services/auth.js).
 *
 *   POST /api/auth/login            { email, password }                 → 200 { token, expires_in, user }
 *   POST /api/auth/logout           (sesión)                            → 204
 *   GET  /api/auth/me               (sesión, aunque deba cambiar clave) → 200 { user }
 *   POST /api/auth/change-password  { current_password, new_password }  → 200 { token, expires_in, user }
 *   GET  /api/auth/registration-info  (público)                         → 200 { enabled }
 *   POST /api/auth/register         (público) RegisterRequest            → 201 RegisterResponse
 *   PATCH /api/auth/me              { first_name?, last_name?, phone? }  → 200 { user }
 */
const express = require('express');

const { requireAuth, requireAuthAllowPending } = require('../lib/auth');
const { getConfig } = require('../lib/config');
const { validationError, wrap } = require('../lib/errors');
const { isModule } = require('../lib/modules');
const { MSG, collect, isEmail, normalizePhone, textField, validateFields } = require('../lib/validation');
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

router.get('/registration-info', (req, res) => {
  res.json({ enabled: getConfig().registrationEnabled });
});

router.post('/register', wrap(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const c = collect();
  const firstName = textField(body, 'first_name', { required: true, max: 80 }, c);
  const lastName = textField(body, 'last_name', { required: true, max: 120 }, c);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) c.add('email', MSG.required);
  else if (!isEmail(email)) c.add('email', MSG.email);
  let phone = null;
  try { phone = normalizePhone(typeof body.phone === 'string' ? body.phone : null); } catch { /* inválido */ }
  if (phone === null) c.add('phone', MSG.phone);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!checkPasswordPolicy(password)) c.add('password', PASSWORD_POLICY_MESSAGE);
  let requested = body.requested_modules ?? [];
  if (!Array.isArray(requested) || requested.length > 7
    || requested.some((m) => typeof m !== 'string' || !isModule(m.trim().toUpperCase()))) {
    c.add('requested_modules', 'Módulo no válido.');
    requested = [];
  }
  const note = textField(body, 'note', { max: 500 }, c);
  if (body.accepts_confidentiality !== true) {
    c.add('accepts_confidentiality', 'Debes aceptar el compromiso de confidencialidad.');
  }
  c.throwIfAny();

  const out = auth.register({
    email, password, firstName, lastName, phone, note,
    requestedModules: requested.map((m) => m.trim().toUpperCase())
  }, req.ip);
  res.status(201).json(out);
}));

const PROFILE_SCHEMA = {
  first_name: { type: 'text', required: true, max: 80 },
  last_name: { type: 'text', required: true, max: 120 },
  phone: { type: 'phone' }
};

router.patch('/me', requireAuth, (req, res) => {
  const data = validateFields(req.body, PROFILE_SCHEMA, { partial: true });
  const user = auth.updateProfile(req.user, data, req.ip);
  res.json({ user: users.toUserMe(user) });
});

module.exports = router;
