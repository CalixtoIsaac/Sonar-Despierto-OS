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
  assert.equal(admin.length, 16); // + Movimientos y Centros y categorías (F6)
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

test('Catalogos del navegador = lib/catalogs.js; vistas de la F3 protegidas por su módulo', () => {
  const Catalogos = require('../public/js/catalogos');
  const cat = require('../lib/catalogs');
  assert.deepEqual(Catalogos.SHIRT_SIZES, [...cat.SHIRT_SIZES]);
  assert.deepEqual(Catalogos.VOLUNTEER_AREAS, [...cat.VOLUNTEER_AREAS]);
  assert.deepEqual(Catalogos.VOLUNTEER_AREA_LABEL, { ...cat.VOLUNTEER_AREA_LABELS });
  assert.deepEqual(Catalogos.GENDERS, [...cat.GENDERS]);
  assert.deepEqual(Catalogos.GENDER_LABEL, { ...cat.GENDER_LABELS });
  assert.equal(Catalogos.CHILD_MAX_AGE, cat.CHILD_MAX_AGE);
  assert.equal(Catalogos.estadoToActive(''), 'true');
  assert.equal(Catalogos.estadoToActive('inactivos'), 'false');
  assert.equal(Catalogos.estadoToActive('todos'), undefined);

  const volOnly = { role: 'OPERADOR', modules: ['VOLUNTARIOS'] };
  for (const key of ['ninos', 'nino', 'nino-form', 'escuelas', 'tutores']) {
    assert.equal(Access.viewByKey(key).module, 'BENEFICIARIOS', key);
    assert.equal(Access.canSee(volOnly, Access.viewByKey(key)), false, key);
  }
  for (const key of ['voluntarios', 'voluntario', 'voluntario-form']) assert.ok(Access.canSee(volOnly, Access.viewByKey(key)), key);
  assert.deepEqual(Access.visibleMenu(volOnly).map((v) => v.key), ['inicio', 'voluntarios', 'perfil']);
});

test('Audit: textos de la F3 (personas y exportaciones) y enlaces a las fichas', () => {
  const d = (action, detail, entity = 'children') => Audit.describeAuditDetail({ action, detail, entity });
  assert.equal(d('RECORD_UPDATED', { changed: ['guardian_consent', 'school_id'] }), 'Campos: consentimiento, escuela');
  assert.equal(d('DATA_EXPORTED', { format: 'csv', count: 12, filters: { school_id: 3 } }), '12 niñas y niños en CSV (con filtros)');
  assert.equal(d('DATA_EXPORTED', { format: 'csv', count: 5, filters: {} }, 'volunteers'), '5 voluntarios en CSV');
  assert.equal(Audit.entityHref('children', 7), '#nino/7');
  assert.equal(Audit.entityHref('volunteers', 3), '#voluntario/3');
  assert.equal(Audit.entityHref('schools', 2), '#escuelas?ver=2');
  assert.equal(Audit.entityHref('users', 1), '#usuario/1');
});

test('F4: catálogos de eventos y cartas = lib/catalogs.js; vistas protegidas por EVENTOS y CARTAS', () => {
  const Catalogos = require('../public/js/catalogos');
  const cat = require('../lib/catalogs');
  for (const [front, back] of [
    ['EVENT_TYPES', 'EVENT_TYPES'], ['EVENT_STATUSES', 'EVENT_STATUSES'], ['PARTICIPATION_STATUSES', 'PARTICIPATION_STATUSES'],
    ['LETTER_STATUSES', 'LETTER_STATUSES'], ['LETTER_EVENT_TYPES', 'LETTER_EVENT_TYPES']
  ]) assert.deepEqual(Catalogos[front], [...cat[back]], front);
  for (const [front, back] of [
    ['EVENT_TYPE_LABEL', 'EVENT_TYPE_LABELS'], ['EVENT_STATUS_LABEL', 'EVENT_STATUS_LABELS'],
    ['PARTICIPATION_STATUS_LABEL', 'PARTICIPATION_STATUS_LABELS'], ['LETTER_STATUS_LABEL', 'LETTER_STATUS_LABELS']
  ]) assert.deepEqual(Catalogos[front], { ...cat[back] }, front);
  assert.equal(Catalogos.DEFAULT_LETTERS_PER_SPONSOR, cat.DEFAULT_LETTERS_PER_SPONSOR);
  assert.equal(Catalogos.MAX_LETTERS_PER_SPONSOR, cat.MAX_LETTERS_PER_SPONSOR);
  assert.deepEqual({ ...Audit.LETTER_STATUS_LABEL }, { ...cat.LETTER_STATUS_LABELS });
  assert.deepEqual({ ...Audit.EVENT_STATUS_LABEL }, { ...cat.EVENT_STATUS_LABELS });

  for (const key of ['eventos', 'evento']) assert.equal(Access.viewByKey(key).module, 'EVENTOS', key);
  for (const key of ['cartas', 'carta', 'carta-form', 'buscar']) assert.equal(Access.viewByKey(key).module, 'CARTAS', key);
  for (const key of ['eventos', 'evento', 'cartas', 'carta', 'carta-form', 'buscar']) assert.ok(Access.viewByKey(key).ready, key);
  assert.deepEqual(Access.visibleMenu({ role: 'OPERADOR', modules: ['CARTAS'] }).map((v) => v.key), ['inicio', 'cartas', 'buscar', 'perfil']);
});

test('F4: CartasUI — chips, siguiente estatus del evento, vista previa del código y evento por defecto', () => {
  global.Catalogos = require('../public/js/catalogos');
  const CartasUI = require('../public/js/cartas-ui');
  assert.deepEqual(CartasUI.statusMeta('ASIGNADO'), { icon: 'heart', cls: 'letter-chip-asignado', label: 'Con padrino' });
  assert.match(CartasUI.statusChip('ENTREGADO'), /letter-chip-entregado.*Entregado/);
  assert.equal(CartasUI.nextEventStatus('BORRADOR').to, 'ABIERTO');
  assert.equal(CartasUI.nextEventStatus('ABIERTO').to, 'EN_CURSO');
  assert.equal(CartasUI.nextEventStatus('EN_CURSO').to, 'CERRADO');
  assert.equal(CartasUI.nextEventStatus('CERRADO'), null);
  assert.equal(CartasUI.previewCode('nav26'), 'NAV26-000001');
  const events = [
    { id: 1, event_type: 'DIA_DEL_NINO', status: 'ABIERTO' },
    { id: 2, event_type: 'NAVIDAD', status: 'CERRADO' },
    { id: 3, event_type: 'NAVIDAD', status: 'EN_CURSO' }
  ];
  assert.equal(CartasUI.defaultEvent(events).id, 3, 'Navidad abierta o en curso primero');
  assert.equal(CartasUI.defaultEvent(events.slice(0, 2)).id, 2, 'si no, la Navidad más reciente');
  assert.equal(CartasUI.defaultEvent([]), null);
  assert.equal(CartasUI.childLabel({ display_name: 'Sofía C.' }), 'Sofía C.');
  assert.deepEqual(Object.keys(CartasUI.ACTIONS), ['assign', 'release', 'receive', 'deliver', 'revert']);
});

test('F4: Audit — textos de eventos y cartas y enlaces a sus fichas', () => {
  const d = (action, detail, entity = 'letters') => Audit.describeAuditDetail({ action, detail, entity });
  assert.equal(d('LETTER_STATUS_CHANGED', { from: 'PENDIENTE', to: 'ASIGNADO', sponsor_volunteer_id: 3 }), 'Pendiente → Con padrino');
  assert.equal(d('EVENT_STATUS_CHANGED', { from: 'ABIERTO', to: 'CERRADO' }, 'events'), 'Abierto → Cerrado');
  assert.equal(d('EVENT_VOLUNTEERS_ADDED', { volunteer_ids: [1, 2], count: 2 }, 'events'), '2 voluntarios');
  assert.equal(d('EVENT_VOLUNTEER_UPDATED', { volunteer_id: 9, changed: ['status'], status: 'CANCELADO' }, 'events'), 'Voluntario #9 · estatus · Cancelado');
  assert.equal(d('RECORD_UPDATED', { changed: ['main_wish', 'gift_notes'] }), 'Campos: deseo principal, notas del regalo');
  assert.equal(d('DATA_EXPORTED', { format: 'csv', count: 3, filters: { event_id: 1 } }), '3 cartas en CSV (con filtros)');
  assert.equal(Audit.entityHref('letters', 5), '#carta/5');
  assert.equal(Audit.entityHref('events', 2), '#evento/2');
});

test('F5: catálogos del calendario = lib/catalogs.js; vistas protegidas por CALENDARIO', () => {
  const Catalogos = require('../public/js/catalogos');
  const cat = require('../lib/catalogs');
  assert.deepEqual(Catalogos.ACTIVITY_TYPES, [...cat.ACTIVITY_TYPES]);
  assert.deepEqual(Catalogos.ACTIVITY_STATUSES, [...cat.ACTIVITY_STATUSES]);
  assert.deepEqual(Catalogos.ACTIVITY_TYPE_LABEL, { ...cat.ACTIVITY_TYPE_LABELS });
  assert.deepEqual(Catalogos.ACTIVITY_STATUS_LABEL, { ...cat.ACTIVITY_STATUS_LABELS });
  assert.equal(Catalogos.ACTIVITY_MAX_RANGE_DAYS, cat.ACTIVITY_MAX_RANGE_DAYS);
  assert.deepEqual({ ...Audit.ACTIVITY_STATUS_LABEL }, { ...cat.ACTIVITY_STATUS_LABELS });
  for (const key of ['calendario', 'actividad']) {
    assert.equal(Access.viewByKey(key).module, 'CALENDARIO', key);
    assert.ok(Access.viewByKey(key).ready, key);
  }
  assert.deepEqual(Access.visibleMenu({ role: 'OPERADOR', modules: ['CALENDARIO'] }).map((v) => v.key), ['inicio', 'calendario', 'perfil']);
});

test('F5: CalendarioUI — rangos, títulos, navegación y parámetros', () => {
  global.Catalogos = require('../public/js/catalogos');
  const CU = require('../public/js/calendario-ui');
  const mes = CU.rangeFor('mes', '2026-11-18');
  assert.equal(mes.from, '2026-10-26', 'empieza en lunes');
  assert.equal(mes.to, '2026-12-06');
  assert.equal(mes.days.length, 42);
  assert.deepEqual(CU.rangeFor('semana', '2026-11-18'), { from: '2026-11-16', to: '2026-11-22',
    days: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'] });
  assert.equal(CU.rangeFor('semana', '2026-11-22').from, '2026-11-16', 'el domingo cierra la semana');
  const agenda = CU.rangeFor('agenda', '2026-02-10');
  assert.deepEqual([agenda.from, agenda.to, agenda.days.length], ['2026-02-01', '2026-02-28', 28]);
  assert.equal(CU.shift('mes', '2026-01-31', 1), '2026-02-01');
  assert.equal(CU.shift('mes', '2026-01-15', -1), '2025-12-01');
  assert.equal(CU.shift('semana', '2026-12-28', 1), '2027-01-04');
  assert.equal(CU.titleFor('mes', '2026-11-03'), 'noviembre 2026');
  assert.equal(CU.titleFor('semana', '2026-11-18'), '16 – 22 nov 2026');
  assert.equal(CU.titleFor('semana', '2026-12-01'), '30 nov – 6 dic 2026');
  assert.equal(CU.titleFor('semana', '2026-12-30'), '28 dic 2026 – 3 ene 2027');
  assert.equal(CU.longDay('2026-11-10'), 'Martes 10 de noviembre');
  assert.equal(CU.isValidDate('2026-02-30'), false);
  const p = CU.readParams({ vista: 'semana', fecha: '2026-02-30', tipo: 'FIESTA', resp: 'me', evento: '3', canceladas: '1' }, '2026-11-01');
  assert.deepEqual(p, { vista: 'semana', fecha: '2026-11-01', tipo: '', resp: 'me', evento: '3', q: '', canceladas: '1' });
  assert.equal(CU.readParams({}, '2026-11-01').vista, 'mes');
});

test('F5: CalendarioUI — carriles de la vista semanal y horas visibles', () => {
  const CU = require('../public/js/calendario-ui');
  const a = { start_time: '10:00', end_time: '11:00' };
  const b = { start_time: '10:30', end_time: '12:00' };
  const c = { start_time: '11:00', end_time: '11:30' };
  const d = { start_time: '13:00', end_time: '14:00' };
  assert.deepEqual(CU.layoutDay([a, b, c, d]).map((x) => [x.lane, x.lanes]), [[0, 2], [1, 2], [0, 2], [0, 1]]);
  assert.deepEqual(CU.layoutDay([]), []);
  assert.deepEqual(CU.hourBounds([]), { start: 7, end: 21 });
  assert.deepEqual(CU.hourBounds([{ start_time: '06:30', end_time: '22:15' }]), { start: 6, end: 23 });
  assert.equal(CU.fromMinutes(CU.toMinutes('09:45') + 75), '11:00');
  assert.equal(CU.conflictText([{ title: 'Junta', start_time: '10:00', end_time: '11:00' }]), 'Junta (10:00–11:00)');
  assert.deepEqual(Object.keys(CU.TYPE_META), require('../lib/catalogs').ACTIVITY_TYPES.slice());
});

test('F5: Audit — textos del calendario y enlace a la actividad', () => {
  const d = (action, detail) => Audit.describeAuditDetail({ action, detail, entity: 'activities' });
  assert.equal(d('ACTIVITY_STATUS_CHANGED', { from: 'PROGRAMADA', to: 'CANCELADA' }), 'Programada → Cancelada');
  assert.equal(d('ACTIVITY_VOLUNTEERS_ADDED', { volunteer_ids: [1, 2, 3], count: 3 }), '3 voluntarios');
  assert.equal(d('ACTIVITY_VOLUNTEER_REMOVED', { volunteer_id: 4 }), 'Voluntario #4');
  assert.equal(d('ACTIVITY_OVERLAP_ACCEPTED', { with: [7] }), 'Se cruza con la actividad #7');
  assert.equal(d('RECORD_UPDATED', { changed: ['activity_date', 'start_time', 'responsible_user_id'] }), 'Campos: fecha, hora de inicio, responsable');
  assert.equal(Audit.entityHref('activities', 9), '#actividad/9');
  assert.equal(Audit.AUDIT_ACTION_GROUP.ACTIVITY_OVERLAP_ACCEPTED, 'calendario');
});

test('F6: catálogos de inventario = lib/catalogs.js; vistas protegidas por INVENTARIO; textos de la bitácora', () => {
  const Catalogos = require('../public/js/catalogos');
  const cat = require('../lib/catalogs');
  assert.deepEqual(Catalogos.INVENTORY_UNITS, [...cat.INVENTORY_UNITS]);
  assert.deepEqual(Catalogos.INVENTORY_UNIT_LABEL, { ...cat.INVENTORY_UNIT_LABELS });
  assert.deepEqual(Object.keys(Catalogos.INVENTORY_UNIT_PLURAL), [...cat.INVENTORY_UNITS]);
  assert.deepEqual(Catalogos.ENTRY_REASONS, [...cat.ENTRY_REASONS]);
  assert.deepEqual(Catalogos.EXIT_REASONS, [...cat.EXIT_REASONS]);
  assert.deepEqual(Catalogos.MOVEMENT_REASON_LABEL, { ...cat.MOVEMENT_REASON_LABELS });
  assert.deepEqual(Audit.MOVEMENT_REASON_LABEL, { ...cat.MOVEMENT_REASON_LABELS });
  assert.equal(Catalogos.INVENTORY_MAX_QUANTITY, cat.INVENTORY_MAX_QUANTITY);
  assert.equal(Catalogos.INVENTORY_MAX_LINES, cat.INVENTORY_MAX_LINES);

  const invOnly = { role: 'OPERADOR', modules: ['INVENTARIO'] };
  for (const key of ['inventario', 'articulo', 'movimientos', 'inventario-catalogos']) {
    const view = Access.viewByKey(key);
    assert.equal(view.module, 'INVENTARIO', key);
    assert.ok(view.ready, key);
    assert.ok(Access.canSee(invOnly, view), key);
    assert.equal(Access.canSee({ role: 'OPERADOR', modules: ['CARTAS'] }, view), false, key);
  }
  assert.deepEqual(Access.visibleMenu(invOnly).map((v) => v.key), ['inicio', 'inventario', 'movimientos', 'inventario-catalogos', 'perfil']);

  const d = (action, detail, entity = 'inventory_items') => Audit.describeAuditDetail({ action, detail, entity });
  assert.equal(d('INVENTORY_MOVEMENT_CREATED', { type: 'SALIDA', reason: 'MERMA', quantity: 3, center_id: 2 }),
    'Salida · Merma o daño · centro #2 · 3 unidades');
  assert.equal(d('INVENTORY_MOVEMENT_CREATED', { type: 'TRASPASO', reason: 'TRASPASO', quantity: 1, center_id: 1, to_center_id: 4 }),
    'Traspaso del centro #1 al #4 · 1 unidad');
  assert.equal(d('INVENTORY_MOVEMENT_REVERSED', { reversed_ids: [5, 6] }), 'Anuló los movimientos #5, #6');
  assert.equal(d('DATA_EXPORTED', { count: 4, filters: {} }), '4 existencias de inventario en CSV');
  assert.equal(Audit.entityHref('inventory_items', 9), '#articulo/9');
  assert.equal(Audit.entityHref('collection_centers', 2), '#inventario-catalogos?tab=centros&ver=2');
  assert.equal(Audit.entityHref('inventory_categories', 3), '#inventario-catalogos?tab=categorias&ver=3');
});

// ---------- Fase 7: dashboard ----------
test('ReportesUI: porcentajes, fechas cortas y gráficas con texto (el color no es la única señal)', () => {
  const G = require('../public/js/reportes-ui');
  assert.equal(G.pctText(71.4), '71.4 %');
  assert.equal(G.pctText(100.0), '100 %');
  assert.equal(G.pctText(null), '—');
  assert.equal(G.shortDate('2026-11-02'), '2 nov');
  assert.equal(G.weekLabel({ week_start: '2026-10-26', week_end: '2026-11-01' }), '26 oct – 1 nov');
  assert.equal(G.num(12345), '12,345');

  const bar = G.statusBar({ PENDIENTE: 1, ASIGNADO: 2, RECIBIDO: 0, ENTREGADO: 1 }, 4);
  assert.match(bar, /role="img" aria-label="Cartas por estatus\. Pendiente: 1, Con padrino: 2, Regalo recibido: 0, Entregado: 1\."/);
  assert.match(bar, /width:50\.000%/);
  assert.doesNotMatch(bar, /rep-seg rep-recibido/, 'un estatus en 0 no dibuja segmento');
  assert.match(bar, /Regalo recibido <strong>0<\/strong>/, 'pero sí aparece en la leyenda');
  assert.match(G.statusBar({ PENDIENTE: 0, ASIGNADO: 0, RECIBIDO: 0, ENTREGADO: 0 }, 0), /Aún no hay cartas/);

  const cols = G.weeklyColumns([{ week_start: '2026-10-26', week_end: '2026-11-01', total: 2, by_status: { PENDIENTE: 1, ASIGNADO: 1, RECIBIDO: 0, ENTREGADO: 0 } },
    { week_start: '2026-11-02', week_end: '2026-11-08', total: 4, by_status: { PENDIENTE: 1, ASIGNADO: 1, RECIBIDO: 1, ENTREGADO: 1 } }]);
  assert.match(cols, /height:50\.000%/, 'la primera semana mide la mitad de la más alta');
  assert.match(cols, /Semana del 2 nov – 8 nov: Pendiente 1, Con padrino 1, Regalo recibido 1, Entregado 1\./);
  assert.match(G.barList([['Logística', 2], ['Fotografía', 0]]), /Logística/);
  assert.doesNotMatch(G.barList([['Logística', 2], ['Fotografía', 0]]), /Fotografía/);
  assert.match(G.stackedRows([{ name: '<b>Escuela</b>', total: 1, by_status: { PENDIENTE: 1, ASIGNADO: 0, RECIBIDO: 0, ENTREGADO: 0 } }]), /&#60;b&#62;Escuela/);
  assert.match(G.ring(72.2, 'Con padrino', 26, 'asignado'), /--deg:259\.9deg/);
});

test('Audit y Access: exportación a Excel del dashboard y vista Reportes lista', () => {
  assert.equal(Audit.describeAuditDetail({ action: 'DATA_EXPORTED', entity: 'events', detail: { format: 'xlsx', report: 'dashboard', sheets: 8, count: 36 } }),
    'Reporte del evento en Excel · 8 hojas · 36 cartas');
  const view = Access.viewByKey('reportes');
  assert.equal(view.ready, true);
  const rep = { role: 'OPERADOR', modules: ['REPORTES'], must_change_password: false };
  assert.ok(Access.canSee(rep, view));
  assert.ok(!Access.canSee(rep, Access.viewByKey('ninos')), 'Reportes no abre Niños: el aviso se muestra sin enlace');
});
