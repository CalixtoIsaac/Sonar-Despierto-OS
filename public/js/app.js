/**
 * Estructura de la aplicación: sesión, menú lateral según permisos y navegación entre vistas
 * (#vista en la URL). Mismo patrón que la plantilla de SEMA.
 *
 * Cada vista es un módulo IIFE con mount(contenedor, contexto).
 * Para agregar una pantalla nueva:
 *   1. Crea public/js/mi-vista.js (copia perfil.js como modelo).
 *   2. Cárgala en app.html antes de app.js.
 *   3. Regístrala en VIEW_MODULES y, si va en el menú, en Access.VIEWS (access.js).
 */
(() => {
  const VIEW_MODULES = {
    inicio: () => Inicio,
    perfil: () => Perfil,
    'cambiar-contrasena': () => CambiarContrasena,
    'sin-acceso': () => SinAcceso
    // Las demás vistas del menú usan Proximamente hasta que llegue su fase
  };
  const DEFAULT_VIEW = 'inicio';

  const $ = (id) => document.getElementById(id);

  if (!UI.getToken()) {
    location.replace('/');
    return;
  }

  UI.hydrateIcons(document);
  UI.hydrateLogos(document);

  let user = UI.getUser();

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
      html += `<a class="nav-link${active ? ' active' : ''}" href="#${item.key}" data-view="${item.key}"${active ? ' aria-current="page"' : ''}>`
        + `${UI.icon(item.icon)}${UI.escape(item.label)}</a>`;
    }
    $('sidebarNav').innerHTML = html;
  }

  async function refreshUser() {
    try {
      const data = await UI.api('/auth/me');
      user = data.user;
      UI.setUser(user);
      renderUser();
      navigate();
    } catch (err) {
      if (err.status !== 401) UI.toast(err.message, 'error');
    }
  }

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
    const requested = location.hash.slice(1) || DEFAULT_VIEW;
    if (user && user.must_change_password) return { key: 'cambiar-contrasena' };
    const view = Access.viewByKey(requested);
    if (!view) return { key: DEFAULT_VIEW };
    if (!Access.canSee(user, view)) return { key: 'sin-acceso', blocked: view };
    return { key: requested };
  }

  function navigate() {
    if (!user) { // aún no llega /auth/me
      $('view').innerHTML = '<div class="empty-state"><span class="spinner" aria-label="Cargando"></span></div>';
      return;
    }
    const { key, blocked } = resolveView();
    if (location.hash.slice(1) !== key && !blocked) history.replaceState(null, '', `#${key}`);
    const view = Access.viewByKey(key);

    renderMenu(key);
    $('pageTitle').textContent = view.label;
    document.title = `${view.label} · Soñar Despierto`;

    const container = $('view');
    container.innerHTML = '';
    const factory = VIEW_MODULES[key] || (() => Proximamente);
    factory().mount(container, { user, view, blocked, onUserChange: applySession });
    setSidebar(false);
    container.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /** Lo usan las vistas que reciben una sesión nueva (p. ej. al cambiar la contraseña). */
  function applySession({ token, user: nextUser }) {
    if (token) UI.setSession(token, nextUser);
    else UI.setUser(nextUser);
    user = nextUser;
    renderUser();
  }

  window.addEventListener('hashchange', navigate);

  renderUser();
  navigate();
  refreshUser();
})();
