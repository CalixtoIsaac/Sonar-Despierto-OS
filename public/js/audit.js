/**
 * Acciones de la bitácora del lado del navegador: etiquetas, grupos y texto legible del detalle.
 * Espejo de lib/audit-actions.js: mantener sincronizado (lo verifica una prueba).
 */
const Audit = (() => {
  const AccessRef = typeof Access !== 'undefined' ? Access : require('./access');

  const AUDIT_ACTIONS = [
    'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET',
    'ACCOUNT_REQUESTED', 'ACCOUNT_APPROVED', 'ACCOUNT_REJECTED',
    'USER_CREATED', 'USER_UPDATED', 'ROLE_CHANGED', 'PERMISSIONS_CHANGED',
    'USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_DELETED', 'PROFILE_UPDATED'
  ];

  const AUDIT_ACTION_LABEL = {
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
    PROFILE_UPDATED: 'Perfil actualizado'
  };

  const GROUPS = [
    { key: 'sesion', label: 'Sesión', icon: 'key' },
    { key: 'cuentas', label: 'Cuentas', icon: 'userCog' },
    { key: 'permisos', label: 'Permisos', icon: 'shield' }
  ];

  const AUDIT_ACTION_GROUP = {
    LOGIN: 'sesion', LOGIN_FAILED: 'sesion', LOGOUT: 'sesion', PASSWORD_CHANGED: 'sesion', PASSWORD_RESET: 'sesion',
    ACCOUNT_REQUESTED: 'cuentas', ACCOUNT_APPROVED: 'cuentas', ACCOUNT_REJECTED: 'cuentas', USER_CREATED: 'cuentas',
    USER_UPDATED: 'cuentas', USER_DELETED: 'cuentas', PROFILE_UPDATED: 'cuentas',
    ROLE_CHANGED: 'permisos', PERMISSIONS_CHANGED: 'permisos', USER_ACTIVATED: 'permisos', USER_DEACTIVATED: 'permisos'
  };

  const ENTITY_LABEL = { users: 'Usuario' };
  // Vista del detalle de cada entidad (para enlazar "Sobre" en la bitácora)
  const ENTITY_VIEW = { users: 'usuario' };
  const entityHref = (entity, id) => (ENTITY_VIEW[entity] && id ? `#${ENTITY_VIEW[entity]}/${id}` : null);

  const FIELD_LABEL = { first_name: 'nombre', last_name: 'apellidos', phone: 'teléfono' };

  const auditActionLabel = (action) => AUDIT_ACTION_LABEL[action] || action;
  const moduleNames = (list) => (list || []).map((m) => AccessRef.MODULE_INFO[m]?.label || m).join(', ');
  const roleName = (r) => AccessRef.ROLE_LABEL[r] || r;

  function roleAndModules(d) {
    if (d.role === 'ADMIN') return 'Como Administrador';
    const mods = (d.modules || []).length ? moduleNames(d.modules) : 'ninguno';
    return `Como ${roleName(d.role || 'OPERADOR')} · Módulos: ${mods}`;
  }

  /** Texto breve del detalle de un registro ('' si no hay nada que decir). */
  function describeAuditDetail(log) {
    const d = log && log.detail;
    if (!d || typeof d !== 'object') return '';
    switch (log.action) {
      case 'LOGIN_FAILED':
        if (d.reason === 'pending') return 'Cuenta pendiente de aprobación';
        if (d.reason === 'rejected') return 'Solicitud rechazada';
        if (d.reason === 'disabled') return 'Cuenta desactivada';
        return d.email ? `Correo: ${d.email}` : '';
      case 'ACCOUNT_REQUESTED':
        return (d.requested_modules || []).length ? `Solicitó: ${moduleNames(d.requested_modules)}` : 'Sin módulos solicitados';
      case 'ACCOUNT_APPROVED':
      case 'USER_CREATED':
        return roleAndModules(d);
      case 'ACCOUNT_REJECTED':
        return d.reason ? `Motivo: ${d.reason}` : '';
      case 'USER_UPDATED':
      case 'PROFILE_UPDATED':
        return (d.changed || []).length ? `Campos: ${d.changed.map((f) => FIELD_LABEL[f] || f).join(', ')}` : '';
      case 'ROLE_CHANGED':
        return `${roleName(d.from)} → ${roleName(d.to)}`;
      case 'PERMISSIONS_CHANGED': {
        const parts = [];
        if ((d.added || []).length) parts.push(`Agregó: ${moduleNames(d.added)}`);
        if ((d.removed || []).length) parts.push(`Quitó: ${moduleNames(d.removed)}`);
        return parts.join(' · ');
      }
      case 'PASSWORD_RESET':
        if (d.via === 'admin') return 'Por un administrador';
        if (d.via === 'cli') return 'Desde la computadora anfitriona';
        return '';
      case 'USER_DELETED': {
        const status = AccessRef.ACCOUNT_STATUS_LABEL[d.account_status];
        return d.email ? `${d.email}${status ? ` (${status.toLowerCase()})` : ''}` : '';
      }
      default:
        return '';
    }
  }

  return {
    AUDIT_ACTIONS, AUDIT_ACTION_LABEL, AUDIT_ACTION_GROUP, GROUPS, ENTITY_LABEL, ENTITY_VIEW, FIELD_LABEL,
    auditActionLabel, describeAuditDetail, entityHref
  };
})();

if (typeof module !== 'undefined') module.exports = Audit;
