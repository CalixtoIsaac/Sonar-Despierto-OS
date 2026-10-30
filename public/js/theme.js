/**
 * Tema claro / oscuro.
 * Se carga en el <head> ANTES de las hojas de estilo para evitar el destello
 * del tema incorrecto al abrir la página.
 *
 * - Usa la preferencia guardada; si no hay, la del sistema operativo.
 * - Cualquier botón con [data-theme-toggle] alterna el tema.
 * - Emite el evento "themechange" en window.
 */
(function () {
  var KEY = 'sd.theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  var SUN = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/></svg>';

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* sin persistencia */ }
  }
  function systemTheme() {
    return media && media.matches ? 'dark' : 'light';
  }
  function current() {
    return root.getAttribute('data-theme') || 'light';
  }

  function updateButtons() {
    var dark = current() === 'dark';
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.innerHTML = dark ? SUN : MOON;
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
      btn.title = dark ? 'Tema claro' : 'Tema oscuro';
    }
  }

  function apply(theme, animate) {
    if (animate) {
      root.classList.add('theme-switching');
      setTimeout(function () { root.classList.remove('theme-switching'); }, 260);
    }
    root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    updateButtons();
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: current() } }));
  }

  // Aplicación inmediata (antes de pintar la página)
  root.setAttribute('data-theme', stored() === 'dark' || stored() === 'light' ? stored() : systemTheme());

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = current() === 'dark' ? 'light' : 'dark';
    save(next);
    apply(next, true);
  });

  document.addEventListener('DOMContentLoaded', updateButtons);

  // Otra pestaña cambió el tema
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && (e.newValue === 'dark' || e.newValue === 'light')) apply(e.newValue, true);
  });

  // Cambió el tema del sistema y el usuario no ha elegido uno
  if (media && media.addEventListener) {
    media.addEventListener('change', function () {
      if (!stored()) apply(systemTheme(), true);
    });
  }
})();
