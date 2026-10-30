/**
 * Roles, módulos, menú y política de contraseñas del lado del navegador.
 * Espejo de lib/modules.js y lib/security.js: mantener sincronizado.
 * El servidor valida SIEMPRE los permisos; esto solo decide qué se muestra.
 */
const Access = (() => {
  const ROLE_LABEL = { ADMIN: 'Administrador', OPERADOR: 'Operador' };

  // Estados de cuenta (espejo de lib/modules.js, ADR-0008)
  const ACCOUNT_STATUSES = ['PENDIENTE', 'APROBADA', 'RECHAZADA'];
  const ACCOUNT_STATUS_LABEL = { PENDIENTE: 'Pendiente de aprobación', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada' };

  // Módulos con datos de niñas y niños (se marcan al asignar permisos)
  const SENSITIVE_MODULES = ['BENEFICIARIOS'];

  // El orden define el orden del menú
  const MODULE_KEYS = ['VOLUNTARIOS', 'BENEFICIARIOS', 'EVENTOS', 'CARTAS', 'CALENDARIO', 'INVENTARIO', 'REPORTES'];

  const MODULE_INFO = {
    VOLUNTARIOS: { label: 'Voluntarios', phase: 3, description: 'Registro de voluntarios, contacto de emergencia, talla y área de apoyo.' },
    BENEFICIARIOS: { label: 'Beneficiarios', phase: 3, description: 'Niños, escuelas y tutores responsables, con consentimiento del tutor.' },
    EVENTOS: { label: 'Eventos', phase: 4, description: 'Macro-eventos de Navidad y Día del Niño y su logística.' },
    CARTAS: { label: 'Cartas de Navidad', phase: 4, description: 'Cartas, padrinos, estatus del regalo e historial completo.' },
    CALENDARIO: { label: 'Calendario', phase: 5, description: 'Juntas, capacitaciones, acopios y eventos en vista mensual y semanal.' },
    INVENTARIO: { label: 'Inventario', phase: 6, description: 'Insumos, mobiliario y materiales por centro de acopio.' },
    REPORTES: { label: 'Reportes', phase: 7, description: 'Indicadores por evento y exportaciones.' }
  };

  /**
   * Vistas de la aplicación (#vista[/id][?parámetros] en la URL). section agrupa el menú.
   * module → requiere ese permiso; adminOnly → solo ADMIN; hidden → no aparece en el menú;
   * ready → ya está construida (las demás muestran "Próximamente").
   */
  const VIEWS = [
    { key: 'inicio', label: 'Inicio', icon: 'home', section: 'General', ready: true },
    { key: 'calendario', label: 'Calendario', icon: 'calendarRange', module: 'CALENDARIO', section: 'Operación' },
    { key: 'eventos', label: 'Eventos', icon: 'calendarDays', module: 'EVENTOS', section: 'Operación' },
    { key: 'cartas', label: 'Cartas', icon: 'mail', module: 'CARTAS', section: 'Operación' },
    { key: 'buscar', label: 'Búsqueda por código', icon: 'scanSearch', module: 'CARTAS', section: 'Operación',
      description: 'Localiza una carta escaneando o escribiendo su código (NAV26-000123).' },
    { key: 'ninos', label: 'Niños', icon: 'baby', module: 'BENEFICIARIOS', section: 'Personas', ready: true,
      description: 'Niñas y niños beneficiarios, su escuela, tutor y consentimiento.' },
    { key: 'nino', label: 'Ficha de niña o niño', icon: 'baby', module: 'BENEFICIARIOS', hidden: true, ready: true, parent: 'ninos' },
    { key: 'nino-form', label: 'Registro de niña o niño', icon: 'baby', module: 'BENEFICIARIOS', hidden: true, ready: true, parent: 'ninos' },
    { key: 'escuelas', label: 'Escuelas', icon: 'school', module: 'BENEFICIARIOS', section: 'Personas', ready: true,
      description: 'Escuelas y comunidades de donde vienen las niñas y niños.' },
    { key: 'tutores', label: 'Tutores', icon: 'contact', module: 'BENEFICIARIOS', section: 'Personas', ready: true,
      description: 'Profesoras, directores y líderes comunitarios responsables.' },
    { key: 'voluntarios', label: 'Voluntarios', icon: 'users', module: 'VOLUNTARIOS', section: 'Personas', ready: true },
    { key: 'voluntario', label: 'Detalle de voluntario', icon: 'users', module: 'VOLUNTARIOS', hidden: true, ready: true, parent: 'voluntarios' },
    { key: 'voluntario-form', label: 'Registro de voluntario', icon: 'users', module: 'VOLUNTARIOS', hidden: true, ready: true, parent: 'voluntarios' },
    { key: 'inventario', label: 'Inventario', icon: 'boxes', module: 'INVENTARIO', section: 'Recursos' },
    { key: 'reportes', label: 'Reportes', icon: 'chart', module: 'REPORTES', section: 'Recursos' },
    { key: 'usuarios', label: 'Usuarios', icon: 'userCog', adminOnly: true, section: 'Administración', ready: true,
      description: 'Solicitudes de cuenta, alta de usuarios y asignación de módulos.' },
    { key: 'usuario', label: 'Detalle de usuario', icon: 'userCog', adminOnly: true, hidden: true, ready: true, parent: 'usuarios' },
    { key: 'bitacora', label: 'Bitácora', icon: 'scroll', adminOnly: true, section: 'Administración', ready: true,
      description: 'Registro de inicios de sesión y cambios en cuentas, permisos y datos de personas.' },
    { key: 'perfil', label: 'Mi perfil', icon: 'userCircle', section: 'Mi cuenta', ready: true },
    { key: 'cambiar-contrasena', label: 'Cambiar contraseña', icon: 'key', hidden: true, ready: true },
    { key: 'sin-acceso', label: 'Sin acceso', icon: 'lock', hidden: true, ready: true }
  ];

  const viewByKey = (key) => VIEWS.find((v) => v.key === key) || null;

  function canSee(user, view) {
    if (!user || !view) return false;
    const isAdmin = user.role === 'ADMIN';
    if (view.adminOnly) return isAdmin;
    if (view.module) return isAdmin || (user.modules || []).includes(view.module);
    return true;
  }

  /** Menú visible: vacío si debe cambiar la contraseña; si no, solo lo que puede ver. */
  function visibleMenu(user) {
    if (!user || user.must_change_password) return [];
    return VIEWS.filter((v) => !v.hidden && canSee(user, v));
  }

  /**
   * '#usuario/7?tab=x' → { key: 'usuario', id: '7', params: { tab: 'x' } }. Vacío → inicio.
   */
  function parseHash(hash) {
    const text = String(hash || '').replace(/^#/, '');
    const q = text.indexOf('?');
    const path = q >= 0 ? text.slice(0, q) : text;
    const query = q >= 0 ? text.slice(q + 1) : '';
    const [key, id] = path.split('/');
    const params = {};
    for (const [k, v] of new URLSearchParams(query)) params[k] = v;
    return { key: key || 'inicio', id: id || null, params };
  }

  /** Hash a partir de vista, id y parámetros (omite los vacíos). */
  function buildHash(key, id, params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    }
    const query = qs.toString();
    return `#${key}${id ? `/${id}` : ''}${query ? `?${query}` : ''}`;
  }

  // ---------- Contraseñas (espejo de lib/security.js) ----------
  const PASSWORD_POLICY_MESSAGE = 'La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número.';
  const encoder = new TextEncoder();

  function meetsPasswordPolicy(pw) {
    const length = [...pw].length;
    return length >= 8 && length <= 72 && encoder.encode(pw).length <= 72 && /\p{L}/u.test(pw) && /\p{Nd}/u.test(pw);
  }

  /** 1 = débil, 2 = aceptable, 3 = fuerte. */
  function passwordStrength(pw) {
    if (!meetsPasswordPolicy(pw)) return 1;
    const strong = [...pw].length >= 12 && /\p{Lu}/u.test(pw) && /\p{Ll}/u.test(pw) && /\p{Nd}/u.test(pw) && /[^\p{L}\p{Nd}]/u.test(pw);
    return strong ? 3 : 2;
  }

  return {
    ROLE_LABEL, ACCOUNT_STATUSES, ACCOUNT_STATUS_LABEL, SENSITIVE_MODULES,
    MODULE_KEYS, MODULE_INFO, VIEWS, viewByKey, canSee, visibleMenu, parseHash, buildHash,
    PASSWORD_POLICY_MESSAGE, meetsPasswordPolicy, passwordStrength
  };
})();

if (typeof module !== 'undefined') module.exports = Access; // para las pruebas con node:test
