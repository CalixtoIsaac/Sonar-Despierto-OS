/**
 * Roles y catálogo de módulos (ADR-0004). public/js/access.js replica estos valores.
 * El orden de MODULE_KEYS define el orden del menú.
 */
const USER_ROLES = Object.freeze(['ADMIN', 'OPERADOR']);

const MODULE_KEYS = Object.freeze([
  'VOLUNTARIOS',
  'BENEFICIARIOS', // niños, escuelas y tutores (datos de menores)
  'EVENTOS',
  'CARTAS',
  'CALENDARIO',
  'INVENTARIO',
  'REPORTES'
]);

const MODULE_LABELS = Object.freeze({
  VOLUNTARIOS: 'Voluntarios',
  BENEFICIARIOS: 'Beneficiarios',
  EVENTOS: 'Eventos',
  CARTAS: 'Cartas de Navidad',
  CALENDARIO: 'Calendario',
  INVENTARIO: 'Inventario',
  REPORTES: 'Reportes'
});

// Estados de la cuenta (ADR-0008). Invariante: account_status ≠ 'APROBADA' ⇒ is_active = 0.
const ACCOUNT_STATUSES = Object.freeze(['PENDIENTE', 'APROBADA', 'RECHAZADA']);
const ACCOUNT_STATUS_LABELS = Object.freeze({
  PENDIENTE: 'pendiente de aprobación',
  APROBADA: 'aprobada',
  RECHAZADA: 'rechazada'
});

const isRole = (value) => USER_ROLES.includes(value);
const isModule = (value) => MODULE_KEYS.includes(value);

/** Ordena y quita duplicados según el catálogo. Lanza si hay una clave desconocida. */
function normalizeModules(list) {
  const set = new Set();
  for (const raw of list || []) {
    const key = String(raw).trim().toUpperCase();
    if (!isModule(key)) throw new Error(`Módulo desconocido: ${raw}. Válidos: ${MODULE_KEYS.join(', ')}`);
    set.add(key);
  }
  return MODULE_KEYS.filter((m) => set.has(m));
}

module.exports = {
  USER_ROLES, MODULE_KEYS, MODULE_LABELS, ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS,
  isRole, isModule, normalizeModules
};
