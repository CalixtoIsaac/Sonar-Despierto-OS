/**
 * /api/users — gestión de usuarios y solicitudes de cuenta (solo ADMIN; se monta con requireAdmin).
 *
 *   GET    /api/users                      ?page&page_size&search&role&account_status&is_active&module&order_by
 *   GET    /api/users/summary              → { pending, active, inactive, rejected, admins }
 *   POST   /api/users                      { email, first_name, last_name, phone?, role, modules } → 201
 *   GET    /api/users/:id                  → { user: UserDetail }
 *   PATCH  /api/users/:id                  { first_name?, last_name?, phone?, role?, modules?, is_active? }
 *   POST   /api/users/:id/approve          { role?, modules, note? }
 *   POST   /api/users/:id/reject           { reason }
 *   POST   /api/users/:id/reset-password   → { temporary_password, message }
 *   DELETE /api/users/:id                  → 204 (solo solicitudes pendientes o rechazadas)
 */
const express = require('express');

const { AppError } = require('../lib/errors');
const { USER_ROLES, ACCOUNT_STATUSES, MODULE_KEYS, isModule } = require('../lib/modules');
const { parsePageParams } = require('../lib/pagination');
const { MSG, collect, isEmail, textField, validateField } = require('../lib/validation');
const users = require('../services/users');

const router = express.Router();

const ORDER_VALUES = ['created_at', '-created_at', 'last_name', '-last_name', 'last_login_at', '-last_login_at'];
const TEMP_MESSAGE = 'Comparte esta contraseña temporal con la persona. Deberá cambiarla al iniciar sesión.';

/** :id numérico o 404 con el mensaje del contrato. */
function idParam(req) {
  const raw = req.params.id;
  if (!/^\d{1,15}$/.test(raw)) throw new AppError(404, 'NOT_FOUND', 'No existe un usuario con ese identificador.');
  return Number(raw);
}

/** Arreglo de claves de módulo; acumula 'Módulo no válido.' */
function modulesField(body, name, c, { required = false } = {}) {
  const raw = body[name];
  if (raw === undefined) {
    if (required) c.add(name, MSG.required);
    return undefined;
  }
  if (!Array.isArray(raw) || raw.length > MODULE_KEYS.length * 2
    || raw.some((m) => typeof m !== 'string' || !isModule(m.trim().toUpperCase()))) {
    c.add(name, 'Módulo no válido.');
    return undefined;
  }
  return raw.map((m) => m.trim().toUpperCase());
}

function boolQuery(value, field, c) {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  c.add(field, 'Usa true o false.');
  return undefined;
}

const detail = (row) => ({ user: users.toUserDetail(row) });

router.get('/', (req, res) => {
  const pageParams = parsePageParams(req.query);
  const q = req.query;
  const c = collect();
  const role = q.role ? String(q.role).toUpperCase() : undefined;
  if (role && !USER_ROLES.includes(role)) c.add('role', 'Rol no válido.');
  const accountStatus = q.account_status ? String(q.account_status).toUpperCase() : undefined;
  if (accountStatus && !ACCOUNT_STATUSES.includes(accountStatus)) c.add('account_status', 'Estado no válido.');
  const isActive = boolQuery(q.is_active, 'is_active', c);
  const module = q.module ? String(q.module).toUpperCase() : undefined;
  if (module && !isModule(module)) c.add('module', 'Módulo no válido.');
  const orderBy = q.order_by ? String(q.order_by) : '-created_at';
  if (!ORDER_VALUES.includes(orderBy)) c.add('order_by', `Orden no válido. Usa: ${ORDER_VALUES.join(', ')}.`);
  const search = typeof q.search === 'string' ? q.search.trim().slice(0, 100) : '';
  c.throwIfAny();

  res.json(users.listUsers(pageParams, { search, role, accountStatus, isActive, module, orderBy }));
});

router.get('/summary', (req, res) => {
  res.json(users.usersSummary());
});

router.post('/', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const c = collect();
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) c.add('email', MSG.required);
  else if (!isEmail(email)) c.add('email', MSG.email);
  const firstName = textField(body, 'first_name', { required: true, max: 80 }, c);
  const lastName = textField(body, 'last_name', { required: true, max: 120 }, c);
  const phone = validateField(body, 'phone', { type: 'phone' }, c);
  const role = body.role === undefined ? 'OPERADOR' : String(body.role).toUpperCase();
  if (!USER_ROLES.includes(role)) c.add('role', 'Rol no válido.');
  const modules = modulesField(body, 'modules', c) || [];
  c.throwIfAny();

  const { user, temporaryPassword } = users.adminCreateUser(req.user,
    { email, firstName, lastName, phone, role, modules }, req.ip);
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ ...detail(user), temporary_password: temporaryPassword });
});

router.get('/:id', (req, res) => {
  res.json(detail(users.getUserOr404(idParam(req))));
});

const UPDATE_SCHEMA = {
  first_name: { type: 'text', required: true, max: 80 },
  last_name: { type: 'text', required: true, max: 120 },
  phone: { type: 'phone' },
  role: { type: 'enum', values: USER_ROLES, message: 'Rol no válido.' },
  is_active: { type: 'bool' }
};

router.patch('/:id', (req, res) => {
  const id = idParam(req);
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const c = collect();
  if (Object.keys(body).length === 0) c.add('body', MSG.emptyBody);
  const data = {};
  for (const key of Object.keys(body)) {
    if (key === 'modules') {
      const modules = modulesField(body, 'modules', c);
      if (modules !== undefined) data.modules = modules;
    } else if (UPDATE_SCHEMA[key]) {
      data[key] = validateField(body, key, UPDATE_SCHEMA[key], c);
    } else {
      c.add(key, MSG.notAllowed);
    }
  }
  c.throwIfAny();
  res.json(detail(users.updateUser(req.user, id, data, req.ip)));
});

router.post('/:id/approve', (req, res) => {
  const id = idParam(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const c = collect();
  const role = body.role === undefined ? 'OPERADOR' : String(body.role).toUpperCase();
  if (!USER_ROLES.includes(role)) c.add('role', 'Rol no válido.');
  const modules = modulesField(body, 'modules', c, { required: true });
  const note = textField(body, 'note', { max: 500 }, c);
  c.throwIfAny();
  res.json(detail(users.approveAccount(req.user, id, { role, modules, note }, req.ip)));
});

router.post('/:id/reject', (req, res) => {
  const id = idParam(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const c = collect();
  const reason = textField(body, 'reason', { required: true, max: 500 }, c);
  if (reason !== null && [...reason].length < 5) c.add('reason', 'Escribe al menos 5 caracteres.');
  c.throwIfAny();
  res.json(detail(users.rejectAccount(req.user, id, { reason }, req.ip)));
});

router.post('/:id/reset-password', (req, res) => {
  const temporaryPassword = users.adminResetPassword(req.user, idParam(req), req.ip);
  res.set('Cache-Control', 'no-store');
  res.json({ temporary_password: temporaryPassword, message: TEMP_MESSAGE });
});

router.delete('/:id', (req, res) => {
  users.deleteAccountRequest(req.user, idParam(req), req.ip);
  res.status(204).end();
});

module.exports = router;
