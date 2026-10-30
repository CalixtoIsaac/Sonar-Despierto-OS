/**
 * Catálogo de acciones de la bitácora (audit_logs.action). Fuente única: services/audit.js rechaza
 * cualquier acción fuera de esta lista. Espejo en el navegador: public/js/audit.js.
 *
 * audit_logs.user_id es QUIÉN hizo la acción (el actor); el objeto afectado va en entity + entity_id.
 * Las fases siguientes AGREGAN valores (nunca se renombran: la bitácora guarda el texto).
 */
const AUDIT_ACTIONS = Object.freeze([
  'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET',
  'ACCOUNT_REQUESTED', 'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED',
  'USER_CREATED', 'USER_UPDATED', 'ROLE_CHANGED', 'PERMISSIONS_CHANGED',
  'USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_DELETED', 'PROFILE_UPDATED',
  // Fase 3 — personas (entity: volunteers | schools | tutors | children)
  'RECORD_CREATED', 'RECORD_UPDATED', 'RECORD_DEACTIVATED', 'RECORD_ACTIVATED', 'DATA_EXPORTED'
]);

const AUDIT_ACTION_LABELS = Object.freeze({
  LOGIN: 'Inicio de sesión',
  LOGIN_FAILED: 'Intento de acceso fallido',
  LOGOUT: 'Cierre de sesión',
  PASSWORD_CHANGED: 'Cambio de contraseña',
  PASSWORD_RESET: 'Contraseña restablecida',
  ACCOUNT_REQUESTED: 'Solicitud de cuenta',
  ACCOUNT_APPROVED: 'Cuenta aprobada',
  ACCOUNT_REJECTED: 'Cuenta rechazada',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Datos de usuario modificados',
  ROLE_CHANGED: 'Cambio de rol',
  PERMISSIONS_CHANGED: 'Cambio de módulos',
  USER_ACTIVATED: 'Usuario activado',
  USER_DEACTIVATED: 'Usuario desactivado',
  USER_DELETED: 'Solicitud eliminada',
  PROFILE_UPDATED: 'Perfil actualizado',
  RECORD_CREATED: 'Registro creado',
  RECORD_UPDATED: 'Registro modificado',
  RECORD_DEACTIVATED: 'Registro dado de baja',
  RECORD_ACTIVATED: 'Registro reactivado',
  DATA_EXPORTED: 'Exportación de datos'
});

const isAuditAction = (value) => AUDIT_ACTIONS.includes(value);

module.exports = { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, isAuditAction };
