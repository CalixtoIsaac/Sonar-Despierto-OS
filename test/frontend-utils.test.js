/**
 * Funciones puras del navegador (public/js/*.js), probadas con node:test.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const UI = require('../public/js/ui-kit');
const Phone = require('../public/js/phone');
const Fechas = require('../public/js/fechas');
const Access = require('../public/js/access');
global.Access = Access;
const Audit = require('../public/js/audit');
const Components = require('../public/js/components');
const UsuariosDialogos = require('../public/js/usuarios-dialogos');
const { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } = require('../lib/audit-actions');
const { ACCOUNT_STATUSES, MODULE_KEYS } = require('../lib/modules');

test('UI.buildQuery', () => {
  assert.equal(UI.buildQuery({ a: undefined, b: null, c: '' }), '');
  assert.equal(UI.buildQuery({}), '');
  assert.equal(UI.buildQuery({ action: ['A', 'B'] }), '?action=A&action=B');
  assert.equal(UI.buildQuery({ page: 2, is_active: true }), '?page=2&is_active=true');
  assert.equal(UI.buildQuery({ q: 'José Pérez' }), '?q=Jos%C3%A9+P%C3%A9rez');
});

test('Phone', () => {
  assert.equal(Phone.normalize('229-123 4567'), '2291234567');
  assert.ok(Phone.isValid('229-123 4567'));
  assert.ok(!Phone.isValid('229123456'));
  assert.equal(Phone.format('2291234567'), '229 123 4567');
});

test('paginationText', () => {
  const t = (page, total, pageSize = 20) => Components.paginationText({ page, total, pageSize, itemLabel: 'usuarios' });
  assert.equal(t(1, 134), 'Mostrando 1–20 de 134 usuarios');
  assert.equal(t(2, 134), 'Mostrando 21–40 de 134 usuarios');
  assert.equal(t(7, 134), 'Mostrando 121–134 de 134 usuarios');
  assert.equal(Components.paginationText({ page: 1, total: 0, pageSize: 20 }), 'Sin registros');
});

test('Access: estados de cuenta, módulos sensibles, menú y hash', () => {
  assert.deepEqual(Object.keys(Access.ACCOUNT_STATUS_LABEL), [...ACCOUNT_STATUSES]);
  assert.ok(Access.SENSITIVE_MODULES.every((m) => MODULE_KEYS.includes(m)));
  const operador = { role: 'OPERADOR', modules: [...MODULE_KEYS] };
  const keys = Access.visibleMenu(operador).map((v) => v.key);
  for (const k of ['usuarios', 'usuario', 'bitacora']) assert.ok(!keys.includes(k), k);
  const admin = Access.visibleMenu({ role: 'ADMIN', modules: [] }).map((v) => v.key);
  assert.ok(!admin.includes('usuario'), 'las vistas ocultas no aparecen en el menú');
  assert.equal(admin.indexOf('bitacora'), admin.indexOf('usuarios') + 1, 'Bitácora va después de Usuarios');
  assert.equal(admin.length, 14);
  assert.deepEqual(Access.parseHash('#usuario/7?x=1'), { key: 'usuario', id: '7', params: { x: '1' } });
  assert.deepEqual(Access.parseHash('#'), { key: 'inicio', id: null, params: {} });
  assert.equal(Access.buildHash('usuarios', null, { tab: 'solicitudes', q: '', page: 2 }), '#usuarios?tab=solicitudes&page=2');
});

test('Fechas en hora de Veracruz', () => {
  assert.equal(Fechas.formatDateTime('2026-10-18T17:40:00Z'), '18 oct 2026, 11:40');
  assert.match(Fechas.formatRelative(new Date(Date.now() - 2 * 3600e3).toISOString()), /^hace 2 horas$/);
  assert.deepEqual(Fechas.localDayRangeToUtc('2026-10-17', '2026-10-17'),
    { date_from: '2026-10-17T06:00:00.000Z', date_to: '2026-10-18T06:00:00.000Z' });
  assert.deepEqual(Fechas.localDayRangeToUtc('2026-10-01', '2026-10-31'),
    { date_from: '2026-10-01T06:00:00.000Z', date_to: '2026-11-01T06:00:00.000Z' });
  assert.equal(Fechas.todayLocal(new Date('2026-10-18T05:59:00Z')), '2026-10-17');
  assert.equal(Fechas.ageOn('2017-03-02', '2026-03-01'), 8);
  assert.equal(Fechas.ageOn('2017-03-02', '2026-03-02'), 9);
});

test('changedFields: solo lo que cambió; módulos como conjunto', () => {
  const before = { first_name: 'Ana', phone: null, role: 'OPERADOR', modules: ['CARTAS', 'EVENTOS'] };
  assert.deepEqual(UsuariosDialogos.changedFields(before, { first_name: 'Ana', phone: null, role: 'OPERADOR', modules: ['EVENTOS', 'CARTAS'] }), {});
  assert.deepEqual(UsuariosDialogos.changedFields(before, { first_name: 'Anita', phone: '2291234567', modules: ['CARTAS'] }),
    { first_name: 'Anita', phone: '2291234567', modules: ['CARTAS'] });
});

test('Audit: espejo del catálogo, etiquetas, grupos y textos del detalle', () => {
  assert.deepEqual(Audit.AUDIT_ACTIONS, [...AUDIT_ACTIONS]);
  for (const a of AUDIT_ACTIONS) {
    assert.equal(Audit.AUDIT_ACTION_LABEL[a], AUDIT_ACTION_LABELS[a], a);
    assert.ok(Audit.AUDIT_ACTION_GROUP[a], `grupo de ${a}`);
  }
  assert.equal(Audit.auditActionLabel('ACCION_FUTURA'), 'ACCION_FUTURA');
  const d = (action, detail) => Audit.describeAuditDetail({ action, detail });
  assert.equal(d('LOGIN_FAILED', { reason: 'pending' }), 'Cuenta pendiente de aprobación');
  assert.equal(d('LOGIN_FAILED', { reason: 'rejected' }), 'Solicitud rechazada');
  assert.equal(d('LOGIN_FAILED', { reason: 'disabled' }), 'Cuenta desactivada');
  assert.equal(d('LOGIN_FAILED', { email: 'x@y.com' }), 'Correo: x@y.com');
  assert.equal(d('ACCOUNT_REQUESTED', { requested_modules: ['CARTAS', 'CALENDARIO'] }), 'Solicitó: Cartas de Navidad, Calendario');
  assert.equal(d('ACCOUNT_REQUESTED', { requested_modules: [] }), 'Sin módulos solicitados');
  assert.equal(d('ACCOUNT_APPROVED', { role: 'OPERADOR', modules: ['CARTAS'] }), 'Como Operador · Módulos: Cartas de Navidad');
  assert.equal(d('USER_CREATED', { role: 'ADMIN', modules: [] }), 'Como Administrador');
  assert.equal(d('ACCOUNT_REJECTED', { reason: 'No es del equipo' }), 'Motivo: No es del equipo');
  assert.equal(d('USER_UPDATED', { changed: ['first_name', 'phone'] }), 'Campos: nombre, teléfono');
  assert.equal(d('ROLE_CHANGED', { from: 'OPERADOR', to: 'ADMIN' }), 'Operador → Administrador');
  assert.equal(d('PERMISSIONS_CHANGED', { added: ['CARTAS'], removed: ['INVENTARIO'] }), 'Agregó: Cartas de Navidad · Quitó: Inventario');
  assert.equal(d('PERMISSIONS_CHANGED', { added: [], removed: ['INVENTARIO'] }), 'Quitó: Inventario');
  assert.equal(d('PASSWORD_RESET', { via: 'admin' }), 'Por un administrador');
  assert.equal(d('PASSWORD_RESET', { via: 'cli' }), 'Desde la computadora anfitriona');
  assert.equal(d('USER_DELETED', { email: 'a@b.com', account_status: 'RECHAZADA' }), 'a@b.com (rechazada)');
  assert.equal(d('LOGIN', null), '');
});
