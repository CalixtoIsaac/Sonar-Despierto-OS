/**
 * Roles, módulos, menú y política de contraseñas del lado del navegador.
 * Espejo de lib/modules.js y lib/security.js: mantener sincronizado.
 * El servidor valida SIEMPRE los permisos; esto solo decide qué se muestra.
 */
const Access = (() => {
  const ROLE_LABEL = { ADMIN: 'Administrador', OPERADOR: 'Operador' };

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
   * Vistas de la aplicación (#vista en la URL). section agrupa el menú.
   * module → requiere ese permiso; adminOnly → solo ADMIN; hidden → no aparece en el menú.
   */
  const VIEWS = [
    { key: 'inicio', label: 'Inicio', icon: 'home', section: 'General' },
    { key: 'calendario', label: 'Calendario', icon: 'calendarRange', module: 'CALENDARIO', section: 'Operación' },
    { key: 'eventos', label: 'Eventos', icon: 'calendarDays', module: 'EVENTOS', section: 'Operación' },
    { key: 'cartas', label: 'Cartas', icon: 'mail', module: 'CARTAS', section: 'Operación' },
    { key: 'buscar', label: 'Búsqueda por código', icon: 'scanSearch', module: 'CARTAS', section: 'Operación',
      description: 'Localiza una carta escaneando o escribiendo su código (NAV26-000123).' },
    { key: 'ninos', label: 'Niños', icon: 'baby', module: 'BENEFICIARIOS', section: 'Personas' },
    { key: 'escuelas', label: 'Escuelas', icon: 'school', module: 'BENEFICIARIOS', section: 'Personas' },
    { key: 'tutores', label: 'Tutores', icon: 'contact', module: 'BENEFICIARIOS', section: 'Personas' },
    { key: 'voluntarios', label: 'Voluntarios', icon: 'users', module: 'VOLUNTARIOS', section: 'Personas' },
    { key: 'inventario', label: 'Inventario', icon: 'boxes', module: 'INVENTARIO', section: 'Recursos' },
    { key: 'reportes', label: 'Reportes', icon: 'chart', module: 'REPORTES', section: 'Recursos' },
    { key: 'usuarios', label: 'Usuarios', icon: 'userCog', adminOnly: true, section: 'Administración', phase: 2,
      description: 'Solicitudes de cuenta, alta de usuarios y asignación de módulos.' },
    { key: 'perfil', label: 'Mi perfil', icon: 'userCircle', section: 'Mi cuenta' },
    { key: 'cambiar-contrasena', label: 'Cambiar contraseña', icon: 'key', hidden: true },
    { key: 'sin-acceso', label: 'Sin acceso', icon: 'lock', hidden: true }
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
    ROLE_LABEL, MODULE_KEYS, MODULE_INFO, VIEWS, viewByKey, canSee, visibleMenu,
    PASSWORD_POLICY_MESSAGE, meetsPasswordPolicy, passwordStrength
  };
})();

if (typeof module !== 'undefined') module.exports = Access; // para las pruebas con node:test
