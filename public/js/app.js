/**
 * Estructura de la aplicación: sesión, menú lateral según permisos y navegación entre vistas.
 * La URL tiene la forma #vista[/id][?parámetros] (p. ej. #usuario/7, #usuarios?tab=solicitudes).
 *
 * Cada vista es un módulo IIFE con mount(contenedor, contexto). El contexto trae:
 *   { user, view, id, params, navigate(params, { push }), onUserChange, refreshUser, blocked }
 * navigate() cambia los parámetros de la URL SIN volver a montar la vista (la vista se repinta sola);
 * el botón Atrás sí vuelve a montarla con los parámetros anteriores.
 *
 * Para agregar una pantalla nueva:
 *   1. Crea public/js/mi-vista.js (copia perfil.js como modelo) y cárgala en app.html antes de app.js.
 *   2. Regístrala en VIEW_MODULES y en Access.VIEWS (access.js) con ready: true.
 */
(() => {
  const VIEW_MODULES = {
    inicio: () => Inicio,
    perfil: () => Perfil,
    'cambiar-contrasena': () => CambiarContrasena,
    'sin-acceso': () => SinAcceso,
    usuarios: () => Usuarios,
    usuario: () => UsuarioDetalle,
    bitacora: () => Bitacora,
    voluntarios: () => Voluntarios,
    voluntario: () => VoluntarioDetalle,
    'voluntario-form': () => VoluntarioForm,
    escuelas: () => Escuelas,
    tutores: () => Tutores,
    ninos: () => Ninos,
    nino: () => NinoDetalle,
    'nino-form': () => NinoForm
    // Las demás vistas del menú usan Proximamente hasta que llegue su fase
  };
  const DEFAULT_VIEW = 'inicio';
  const REFRESH_EVERY_MS = 120e3;
  const REFRESH_ON_FOCUS_AFTER_MS = 60e3;
  const FORBIDDEN_THROTTLE_MS = 5e3;
  const SUMMARY_EVERY_MS = 60e3;

  const $ = (id) => document.getElementById(id);

  if (!UI.getToken()) {
    location.replace('/');
    return;
  }

  UI.hydrateIcons(document);
  UI.hydrateLogos(document);

  let user = UI.getUser();
  let current = null; // { key, id, params }
  let pendingCount = 0;
  let lastRefresh = 0;
  let lastHash = null; // evita montar dos veces (popstate y hashchange llegan juntos)

  const isAdmin = () => user && user.role === 'ADMIN' && !user.must_change_password;
  const permissionsKey = (u) => (u ? `${u.role}|${(u.modules || []).join(',')}|${u.must_change_password}` : '');

  // ---------- Usuario y menú ----------
  function renderUser() {
    if (!user) return;
    const fullName = `${user.first_name} ${user.last_name}`.trim();
    $('userName').textContent = fullName;
    $('userRole').textContent = Access.ROLE_LABEL[user.role] || user.role;
    $('userAvatar').textContent = UI.initials(fullName || user.email);
  }

  function renderMenu(activeKey) {
    const items = Access.visibleMenu(user);
    $('shell').classList.toggle('no-nav', items.length === 0);
    $('topLogoutBtn').hidden = items.length !== 0;

    let html = '';
    let section = null;
    for (const item of items) {
      if (item.section !== section) {
        section = item.section;
        html += `<p class="nav-section">${UI.escape(section)}</p>`;
      }
      const active = item.key === activeKey;
      const pill = item.key === 'usuarios' && pendingCount > 0
        ? `<span class="nav-pill" aria-label="${pendingCount} solicitudes pendientes">${pendingCount}</span>` : '';
      html += `<a class="nav-link${active ? ' active' : ''}" href="#${item.key}" data-view="${item.key}"${active ? ' aria-current="page"' : ''}>`
        + `${UI.icon(item.icon)}<span class="nav-label">${UI.escape(item.label)}</span>${pill}</a>`;
    }
    $('sidebarNav').innerHTML = html;
  }

  function menuKeyFor(key) {
    const view = Access.viewByKey(key);
    return (view && view.parent) || key;
  }

  /** Recarga /auth/me; si cambió el rol o los módulos, repinta el menú y re-evalúa la vista actual. */
  async function refreshUser({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - lastRefresh < FORBIDDEN_THROTTLE_MS) return;
    lastRefresh = now;
    try {
      const data = await UI.api('/auth/me');
      const changed = permissionsKey(data.user) !== permissionsKey(user);
      user = data.user;
      UI.setUser(user);
      renderUser();
      if (changed || !current) route({ force: true });
      else renderMenu(menuKeyFor(current.key));
      refreshSummary();
    } catch (err) {
      if (err.status !== 401) UI.toast(err.message, 'error');
    }
  }

  async function refreshSummary() {
    if (!isAdmin()) { pendingCount = 0; return; }
    try {
      const s = await UI.api('/users/summary');
      if (s.pending !== pendingCount) {
        pendingCount = s.pending;
        renderMenu(current ? menuKeyFor(current.key) : DEFAULT_VIEW);
      }
    } catch { /* el contador no es crítico */ }
  }

  UI.onForbidden(() => { refreshUser(); });
  window.addEventListener('sd:users-changed', refreshSummary);
  setInterval(() => { if (document.visibilityState === 'visible') refreshUser({ force: true }); }, REFRESH_EVERY_MS);
  setInterval(() => { if (document.visibilityState === 'visible') refreshSummary(); }, SUMMARY_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefresh > REFRESH_ON_FOCUS_AFTER_MS) refreshUser({ force: true });
  });

  // ---------- Menú lateral (móvil) ----------
  const sidebar = $('sidebar');
  const backdrop = $('sidebarBackdrop');
  const menuBtn = $('menuBtn');

  function setSidebar(open) {
    sidebar.classList.toggle('open', open);
    backdrop.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  menuBtn.addEventListener('click', () => setSidebar(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setSidebar(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) setSidebar(false);
  });

  // ---------- Cerrar sesión ----------
  async function logout() {
    const ok = await UI.confirm({
      title: '¿Cerrar sesión?',
      message: 'Tendrás que volver a escribir tu contraseña para entrar.',
      confirmText: 'Cerrar sesión'
    });
    if (!ok) return;
    try { await UI.api('/auth/logout', { method: 'POST', redirectOn401: false }); } catch { /* se cierra igual */ }
    UI.clearSession();
    location.replace('/');
  }
  $('logoutBtn').addEventListener('click', logout);
  $('topLogoutBtn').addEventListener('click', logout);

  // ---------- Navegación ----------
  function resolveView() {
    const parsed = Access.parseHash(location.hash);
    if (user && user.must_change_password) return { key: 'cambiar-contrasena', id: null, params: {} };
    const view = Access.viewByKey(parsed.key);
    if (!view) return { key: DEFAULT_VIEW, id: null, params: {}, fix: true };
    if (!Access.canSee(user, view)) return { key: 'sin-acceso', id: null, params: {}, blocked: view };
    return parsed;
  }

  function route({ force = false } = {}) {
    if (!force && location.hash === lastHash) return;
    if (!user) { // aún no llega /auth/me
      $('view').innerHTML = '<div class="empty-state"><span class="spinner" aria-label="Cargando"></span></div>';
      return;
    }
    const target = resolveView();
    const { key, id, params, blocked } = target;
    if (!blocked && (target.fix || Access.parseHash(location.hash).key !== key)) {
      history.replaceState(null, '', Access.buildHash(key, id, params));
    }
    current = { key, id, params };
    lastHash = location.hash;
    const view = Access.viewByKey(key);

    renderMenu(menuKeyFor(key));
    $('pageTitle').textContent = view.label;
    document.title = `${view.label} · Soñar Despierto`;

    const container = $('view');
    container.innerHTML = '';
    const factory = (view.ready && VIEW_MODULES[key]) || (() => Proximamente);
    const navigate = (nextParams = {}, { push = true } = {}) => {
      current.params = nextParams;
      const url = Access.buildHash(key, id, nextParams);
      if (url === location.hash) return;
      if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
      lastHash = location.hash;
    };
    factory().mount(container, { user, view, id, params, blocked, navigate, onUserChange: applySession, refreshUser });
    setSidebar(false);
    container.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /** Lo usan las vistas que reciben una sesión nueva (p. ej. al cambiar la contraseña o el perfil). */
  function applySession({ token, user: nextUser }) {
    if (token) UI.setSession(token, nextUser);
    else UI.setUser(nextUser);
    user = nextUser;
    renderUser();
  }

  window.addEventListener('hashchange', () => route());
  window.addEventListener('popstate', () => route());

  renderUser();
  route({ force: true });
  refreshUser({ force: true });
})();
