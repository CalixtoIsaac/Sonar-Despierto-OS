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
    'RECORD_CREATED', 'RECORD_UPDATED', 'RECORD_DEACTIVATED', 'RECORD_ACTIVATED', 'DATA_EXPORTED',
    'EVENT_STATUS_CHANGED', 'EVENT_VOLUNTEERS_ADDED', 'EVENT_VOLUNTEER_UPDATED',
    'LETTER_STATUS_CHANGED', 'LETTER_PHOTO_UPDATED', 'LETTER_PHOTO_REMOVED',
    'ACTIVITY_STATUS_CHANGED', 'ACTIVITY_VOLUNTEERS_ADDED', 'ACTIVITY_VOLUNTEER_REMOVED', 'ACTIVITY_OVERLAP_ACCEPTED',
    'INVENTORY_MOVEMENT_CREATED', 'INVENTORY_MOVEMENT_REVERSED'
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
    DATA_EXPORTED: 'Exportación de datos',
    EVENT_STATUS_CHANGED: 'Cambio de estatus del evento',
    EVENT_VOLUNTEERS_ADDED: 'Voluntarios agregados al evento',
    EVENT_VOLUNTEER_UPDATED: 'Participación en evento modificada',
    LETTER_STATUS_CHANGED: 'Cambio de estatus de carta',
    LETTER_PHOTO_UPDATED: 'Foto de carta actualizada',
    LETTER_PHOTO_REMOVED: 'Foto de carta eliminada',
    ACTIVITY_STATUS_CHANGED: 'Cambio de estatus de actividad',
    ACTIVITY_VOLUNTEERS_ADDED: 'Voluntarios agregados a la actividad',
    ACTIVITY_VOLUNTEER_REMOVED: 'Voluntario quitado de la actividad',
    ACTIVITY_OVERLAP_ACCEPTED: 'Actividad guardada con traslape de horario',
    INVENTORY_MOVEMENT_CREATED: 'Movimiento de inventario registrado',
    INVENTORY_MOVEMENT_REVERSED: 'Movimiento de inventario anulado'
  };

  const GROUPS = [
    { key: 'sesion', label: 'Sesión', icon: 'key' },
    { key: 'cuentas', label: 'Cuentas', icon: 'userCog' },
    { key: 'permisos', label: 'Permisos', icon: 'shield' },
    { key: 'personas', label: 'Registros', icon: 'users' },
    { key: 'eventos', label: 'Eventos y cartas', icon: 'mail' },
    { key: 'calendario', label: 'Calendario', icon: 'calendarRange' },
    { key: 'inventario', label: 'Inventario', icon: 'boxes' },
    { key: 'exportaciones', label: 'Exportaciones', icon: 'download' }
  ];

  const AUDIT_ACTION_GROUP = {
    LOGIN: 'sesion', LOGIN_FAILED: 'sesion', LOGOUT: 'sesion', PASSWORD_CHANGED: 'sesion', PASSWORD_RESET: 'sesion',
    ACCOUNT_REQUESTED: 'cuentas', ACCOUNT_APPROVED: 'cuentas', ACCOUNT_REJECTED: 'cuentas', USER_CREATED: 'cuentas',
    USER_UPDATED: 'cuentas', USER_DELETED: 'cuentas', PROFILE_UPDATED: 'cuentas',
    ROLE_CHANGED: 'permisos', PERMISSIONS_CHANGED: 'permisos', USER_ACTIVATED: 'permisos', USER_DEACTIVATED: 'permisos',
    RECORD_CREATED: 'personas', RECORD_UPDATED: 'personas', RECORD_DEACTIVATED: 'personas', RECORD_ACTIVATED: 'personas',
    DATA_EXPORTED: 'exportaciones',
    EVENT_STATUS_CHANGED: 'eventos', EVENT_VOLUNTEERS_ADDED: 'eventos', EVENT_VOLUNTEER_UPDATED: 'eventos',
    LETTER_STATUS_CHANGED: 'eventos', LETTER_PHOTO_UPDATED: 'eventos', LETTER_PHOTO_REMOVED: 'eventos',
    ACTIVITY_STATUS_CHANGED: 'calendario', ACTIVITY_VOLUNTEERS_ADDED: 'calendario', ACTIVITY_VOLUNTEER_REMOVED: 'calendario',
    ACTIVITY_OVERLAP_ACCEPTED: 'calendario',
    INVENTORY_MOVEMENT_CREATED: 'inventario', INVENTORY_MOVEMENT_REVERSED: 'inventario'
  };

  const ENTITY_LABEL = { users: 'Usuario', volunteers: 'Voluntario', schools: 'Escuela', tutors: 'Tutor', children: 'Niña o niño',
    events: 'Evento', letters: 'Carta', activities: 'Actividad',
    inventory_items: 'Artículo de inventario', inventory_categories: 'Categoría de inventario', collection_centers: 'Centro de acopio',
    inventory_movements: 'Movimientos de inventario' };
  const ENTITY_PLURAL = { volunteers: 'voluntarios', schools: 'escuelas', tutors: 'tutores', children: 'niñas y niños',
    events: 'eventos', letters: 'cartas', activities: 'actividades',
    inventory_items: 'existencias de inventario', inventory_movements: 'movimientos de inventario' };
  // Vista del detalle de cada entidad (para enlazar "Sobre" en la bitácora)
  const ENTITY_VIEW = { users: 'usuario', volunteers: 'voluntario', children: 'nino', schools: 'escuelas', tutors: 'tutores',
    events: 'evento', letters: 'carta', activities: 'actividad', inventory_items: 'articulo',
    inventory_categories: 'inventario-catalogos', collection_centers: 'inventario-catalogos' };
  const CATALOG_TAB = { inventory_categories: 'categorias', collection_centers: 'centros' };
  // Escuelas, tutores y catálogos de inventario no tienen página de detalle: se abre su listado con el registro resaltado
  const entityHref = (entity, id) => {
    if (!ENTITY_VIEW[entity] || !id) return null;
    if (entity === 'schools' || entity === 'tutors') return `#${ENTITY_VIEW[entity]}?ver=${id}`;
    if (CATALOG_TAB[entity]) return `#${ENTITY_VIEW[entity]}?tab=${CATALOG_TAB[entity]}&ver=${id}`;
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
    guardian_consent: 'consentimiento',
    event_type: 'tipo', code_prefix: 'prefijo', event_date: 'fecha', location: 'lugar', description: 'descripción',
    max_letters_per_sponsor: 'límite por padrino', main_wish: 'deseo principal', secondary_wish: 'deseo secundario',
    letter_text: 'transcripción', gift_notes: 'notas del regalo', area: 'área', status: 'estatus',
    title: 'título', activity_type: 'tipo', activity_date: 'fecha', start_time: 'hora de inicio', end_time: 'hora de fin',
    responsible_user_id: 'responsable', event_id: 'evento',
    category_id: 'categoría', unit: 'unidad', min_stock: 'existencia mínima'
  };
  const MOVEMENT_REASON_LABEL = {
    DONACION: 'Donación', COMPRA: 'Compra', DEVOLUCION: 'Devolución', USO_EVENTO: 'Uso en evento',
    ENTREGA: 'Entrega a beneficiarios', MERMA: 'Merma o daño', AJUSTE: 'Ajuste por conteo', OTRO: 'Otro',
    TRASPASO: 'Traspaso entre centros', ANULACION: 'Anulación'
  };

  // Estatus de eventos y cartas (espejo de lib/catalogs.js; los usa el texto de la bitácora)
  const EVENT_STATUS_LABEL = { BORRADOR: 'Borrador', ABIERTO: 'Abierto', EN_CURSO: 'En curso', CERRADO: 'Cerrado' };
  const LETTER_STATUS_LABEL = { PENDIENTE: 'Pendiente', ASIGNADO: 'Con padrino', RECIBIDO: 'Regalo recibido', ENTREGADO: 'Entregado' };
  const ACTIVITY_STATUS_LABEL = { PROGRAMADA: 'Programada', REALIZADA: 'Realizada', CANCELADA: 'Cancelada' };
  const PARTICIPATION_STATUS_LABEL = { POSTULADO: 'Postulado', CONFIRMADO: 'Confirmado', RECHAZADO: 'Rechazado', CANCELADO: 'Cancelado' };

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
      case 'EVENT_STATUS_CHANGED':
        return `${EVENT_STATUS_LABEL[d.from] || d.from} → ${EVENT_STATUS_LABEL[d.to] || d.to}`;
      case 'LETTER_STATUS_CHANGED':
        return `${LETTER_STATUS_LABEL[d.from] || d.from} → ${LETTER_STATUS_LABEL[d.to] || d.to}`;
      case 'EVENT_VOLUNTEERS_ADDED':
        return `${d.count ?? (d.volunteer_ids || []).length} ${(d.count ?? 0) === 1 ? 'voluntario' : 'voluntarios'}`;
      case 'EVENT_VOLUNTEER_UPDATED': {
        const what = (d.changed || []).map((f) => FIELD_LABEL[f] || f).join(', ');
        return `Voluntario #${d.volunteer_id}${what ? ` · ${what}` : ''}${d.status ? ` · ${PARTICIPATION_STATUS_LABEL[d.status] || d.status}` : ''}`;
      }
      case 'ACTIVITY_STATUS_CHANGED':
        return `${ACTIVITY_STATUS_LABEL[d.from] || d.from} → ${ACTIVITY_STATUS_LABEL[d.to] || d.to}`;
      case 'ACTIVITY_VOLUNTEERS_ADDED':
        return `${d.count ?? (d.volunteer_ids || []).length} ${(d.count ?? 0) === 1 ? 'voluntario' : 'voluntarios'}`;
      case 'ACTIVITY_VOLUNTEER_REMOVED':
        return d.volunteer_id ? `Voluntario #${d.volunteer_id}` : '';
      case 'ACTIVITY_OVERLAP_ACCEPTED': {
        const ids = d.with || [];
        return ids.length ? `Se cruza con ${ids.length === 1 ? 'la actividad' : 'las actividades'} ${ids.map((i) => `#${i}`).join(', ')}` : '';
      }
      case 'INVENTORY_MOVEMENT_CREATED': {
        const what = d.type === 'TRASPASO' ? `Traspaso del centro #${d.center_id} al #${d.to_center_id}`
          : `${d.type === 'SALIDA' ? 'Salida' : 'Entrada'} · ${MOVEMENT_REASON_LABEL[d.reason] || d.reason || ''} · centro #${d.center_id}`;
        return `${what} · ${d.quantity ?? ''} ${d.quantity === 1 ? 'unidad' : 'unidades'}`;
      }
      case 'INVENTORY_MOVEMENT_REVERSED': {
        const ids = d.reversed_ids || [];
        return ids.length ? `Anuló ${ids.length === 1 ? 'el movimiento' : 'los movimientos'} ${ids.map((i) => `#${i}`).join(', ')}` : '';
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
    EVENT_STATUS_LABEL, LETTER_STATUS_LABEL, PARTICIPATION_STATUS_LABEL, ACTIVITY_STATUS_LABEL, MOVEMENT_REASON_LABEL,
    auditActionLabel, describeAuditDetail, entityHref
  };
})();

if (typeof module !== 'undefined') module.exports = Audit;
