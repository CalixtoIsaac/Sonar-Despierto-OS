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
    'USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_DELETED', 'PROFILE_UPDATED',
    'RECORD_CREATED', 'RECORD_UPDATED', 'RECORD_DEACTIVATED', 'RECORD_ACTIVATED', 'DATA_EXPORTED'
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
    PROFILE_UPDATED: 'Perfil actualizado',
    RECORD_CREATED: 'Registro creado',
    RECORD_UPDATED: 'Registro modificado',
    RECORD_DEACTIVATED: 'Registro dado de baja',
    RECORD_ACTIVATED: 'Registro reactivado',
    DATA_EXPORTED: 'Exportación de datos'
  };

  const GROUPS = [
    { key: 'sesion', label: 'Sesión', icon: 'key' },
    { key: 'cuentas', label: 'Cuentas', icon: 'userCog' },
    { key: 'permisos', label: 'Permisos', icon: 'shield' },
    { key: 'personas', label: 'Personas', icon: 'users' },
    { key: 'exportaciones', label: 'Exportaciones', icon: 'download' }
  ];

  const AUDIT_ACTION_GROUP = {
    LOGIN: 'sesion', LOGIN_FAILED: 'sesion', LOGOUT: 'sesion', PASSWORD_CHANGED: 'sesion', PASSWORD_RESET: 'sesion',
    ACCOUNT_REQUESTED: 'cuentas', ACCOUNT_APPROVED: 'cuentas', ACCOUNT_REJECTED: 'cuentas', USER_CREATED: 'cuentas',
    USER_UPDATED: 'cuentas', USER_DELETED: 'cuentas', PROFILE_UPDATED: 'cuentas',
    ROLE_CHANGED: 'permisos', PERMISSIONS_CHANGED: 'permisos', USER_ACTIVATED: 'permisos', USER_DEACTIVATED: 'permisos',
    RECORD_CREATED: 'personas', RECORD_UPDATED: 'personas', RECORD_DEACTIVATED: 'personas', RECORD_ACTIVATED: 'personas',
    DATA_EXPORTED: 'exportaciones'
  };

  const ENTITY_LABEL = { users: 'Usuario', volunteers: 'Voluntario', schools: 'Escuela', tutors: 'Tutor', children: 'Niña o niño' };
  const ENTITY_PLURAL = { volunteers: 'voluntarios', schools: 'escuelas', tutors: 'tutores', children: 'niñas y niños' };
  // Vista del detalle de cada entidad (para enlazar "Sobre" en la bitácora)
  const ENTITY_VIEW = { users: 'usuario', volunteers: 'voluntario', children: 'nino', schools: 'escuelas', tutors: 'tutores' };
  // Escuelas y tutores no tienen página de detalle: se abre su listado con el registro resaltado
  const entityHref = (entity, id) => {
    if (!ENTITY_VIEW[entity] || !id) return null;
    if (entity === 'schools' || entity === 'tutors') return `#${ENTITY_VIEW[entity]}?ver=${id}`;
    return `#${ENTITY_VIEW[entity]}/${id}`;
  };

  const FIELD_LABEL = {
    first_name: 'nombre', last_name: 'apellidos', phone: 'teléfono', email: 'correo', birth_date: 'fecha de nacimiento',
    city: 'ciudad', occupation: 'ocupación', emergency_contact_name: 'contacto de emergencia',
    emergency_contact_phone: 'teléfono de emergencia', emergency_contact_relationship: 'parentesco de emergencia',
    shirt_size: 'talla', area_of_interest: 'área', medical_notes: 'notas médicas', notes: 'observaciones',
    name: 'nombre', cct: 'CCT', zone: 'zona', address: 'dirección', contact_name: 'contacto', contact_phone: 'teléfono de contacto',
    position: 'cargo', school_id: 'escuela', tutor_id: 'tutor', gender: 'género', grade: 'grado', group_name: 'grupo',
    guardian_name: 'madre, padre o tutor legal', guardian_relationship: 'parentesco', guardian_phone: 'teléfono del tutor legal',
    guardian_consent: 'consentimiento'
  };

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
      case 'RECORD_UPDATED':
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
      case 'DATA_EXPORTED': {
        const what = ENTITY_PLURAL[log.entity] || log.entity;
        const filters = Object.keys(d.filters || {}).length ? ' (con filtros)' : '';
        return `${d.count ?? 0} ${what} en CSV${filters}`;
      }
      default:
        return '';
    }
  }

  return {
    AUDIT_ACTIONS, AUDIT_ACTION_LABEL, AUDIT_ACTION_GROUP, GROUPS, ENTITY_LABEL, ENTITY_PLURAL, ENTITY_VIEW, FIELD_LABEL,
    auditActionLabel, describeAuditDetail, entityHref
  };
})();

if (typeof module !== 'undefined') module.exports = Audit;
