/**
 * UI kit: utilidades compartidas por todas las pantallas (basado en la plantilla de SEMA).
 *
 *  Seguridad     UI.escape(texto)
 *  Sesión        UI.getToken() · UI.getUser() · UI.setSession() · UI.setUser() · UI.clearSession()
 *  API           UI.api('/ruta', { method, body })  → agrega el token y lanza Error si falla
 *                UI.buildQuery({ a: 1, b: ['x', 'y'] }) → "?a=1&b=x&b=y" · UI.onForbidden(fn)
 *                UI.download('/ruta', nombre) → descarga un archivo de la API con la sesión
 *  Componentes   UI.toast() · UI.confirm() · UI.formModal() · UI.dialog() · UI.setBusy()
 *  Iconos        UI.icon('nombre') · UI.hydrateIcons(raiz)
 *  Formato       UI.formatDate() · UI.initials()
 *  Marca         UI.logo({ size })
 *
 * Diferencias con SEMA: la sesión vive en sessionStorage (se borra al cerrar el navegador, porque
 * las PCs de la oficina son compartidas) y los errores de la API traen un "code" estable.
 */
const UI = (() => {
  const TOKEN_KEY = 'sd.token';
  const USER_KEY = 'sd.user';
  const MESSAGE_KEY = 'sd.authMessage';
  const SESSION_CODES = ['NOT_AUTHENTICATED', 'TOKEN_EXPIRED', 'TOKEN_INVALID'];
  const FORBIDDEN_CODES = ['MODULE_FORBIDDEN', 'FORBIDDEN'];
  let uid = 0;
  let forbiddenHandler = null;

  // ---------- Seguridad ----------
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escapa un valor antes de insertarlo en HTML. Úsalo SIEMPRE con datos del usuario. */
  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
  }

  // ---------- Almacenamiento seguro (no falla si está bloqueado) ----------
  const store = {
    get(area, key) { try { return window[area].getItem(key); } catch { return null; } },
    set(area, key, value) { try { window[area].setItem(key, value); } catch { /* sin persistencia */ } },
    remove(area, key) { try { window[area].removeItem(key); } catch { /* nada */ } }
  };

  // ---------- Sesión ----------
  function getToken() { return store.get('sessionStorage', TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(store.get('sessionStorage', USER_KEY)) || null; } catch { return null; }
  }
  function setUser(user) { store.set('sessionStorage', USER_KEY, JSON.stringify(user)); }
  function setSession(token, user) {
    store.set('sessionStorage', TOKEN_KEY, token);
    setUser(user);
  }
  /** Cierra la sesión. El mensaje opcional se muestra en la pantalla de login. */
  function clearSession(message) {
    store.remove('sessionStorage', TOKEN_KEY);
    store.remove('sessionStorage', USER_KEY);
    if (message) store.set('sessionStorage', MESSAGE_KEY, message);
  }
  function takeAuthMessage() {
    const msg = store.get('sessionStorage', MESSAGE_KEY);
    store.remove('sessionStorage', MESSAGE_KEY);
    return msg;
  }

  // ---------- API ----------
  /**
   * "?a=1&b=x&b=y": omite undefined, null y ""; los arreglos se repiten; "" si no queda nada.
   */
  function buildQuery(params = {}) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      for (const v of [].concat(value)) {
        if (v === undefined || v === null || v === '') continue;
        qs.append(key, String(v));
      }
    }
    const text = qs.toString();
    return text ? `?${text}` : '';
  }

  /** Ante un 403 MODULE_FORBIDDEN o FORBIDDEN llama handler(code) (después se lanza el error). */
  function onForbidden(handler) { forbiddenHandler = handler; }

  /**
   * Llama a la API del servidor.
   *   await UI.api('/auth/me')                                → GET
   *   await UI.api('/x', { method: 'POST', body: {...} })      → POST con JSON
   * Si el servidor responde con error, lanza un Error con su mensaje, err.status, err.code y err.details.
   * Si la sesión ya no es válida, vuelve al login (salvo { redirectOn401: false }).
   */
  async function api(path, { method = 'GET', body, redirectOn401 = true } = {}) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      const err = new Error('No se pudo conectar con el servidor. Verifica que el programa Soñar Despierto siga abierto.');
      err.status = 0;
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { error: text }; }
    }

    if (res.status === 401 && redirectOn401 && data && SESSION_CODES.includes(data.code)) {
      clearSession(data.error);
      location.replace('/');
    }
    if (res.status === 403 && data && data.code === 'PASSWORD_CHANGE_REQUIRED' && location.pathname === '/app') {
      location.hash = '#cambiar-contrasena';
    }
    if (res.status === 403 && data && FORBIDDEN_CODES.includes(data.code) && forbiddenHandler) {
      try { forbiddenHandler(data.code); } catch { /* el manejador no debe romper la petición */ }
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Ocurrió un error inesperado.');
      err.status = res.status;
      err.code = (data && data.code) || 'HTTP_ERROR';
      err.details = (data && data.details) || null;
      err.data = data;
      throw err;
    }
    if (res.status === 204) return null;
    return data;
  }

  /** Descarga un archivo de la API (p. ej. CSV) con la sesión y lo guarda con el nombre que indique el servidor. */
  async function download(path, fallbackName = 'descarga.csv') {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch('/api' + path, { headers });
    } catch {
      const err = new Error('No se pudo conectar con el servidor. Verifica que el programa Soñar Despierto siga abierto.');
      err.code = 'NETWORK_ERROR';
      throw err;
    }
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch { /* sin cuerpo JSON */ }
      if (res.status === 401 && data && SESSION_CODES.includes(data.code)) {
        clearSession(data.error);
        location.replace('/');
      }
      if (res.status === 403 && data && FORBIDDEN_CODES.includes(data.code) && forbiddenHandler) forbiddenHandler(data.code);
      const err = new Error((data && data.error) || 'No se pudo descargar el archivo.');
      err.status = res.status;
      err.code = (data && data.code) || 'HTTP_ERROR';
      throw err;
    }
    const disposition = res.headers.get('content-disposition') || '';
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = match ? match[1] : fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Iconos (trazos de 24×24, estilo Lucide como el diseño de Lovable) ----------
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    calendarRange: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M17 14h-6M13 18H7M7 14h.01M17 18h.01"/>',
    calendarDays: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    scanSearch: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.9-1.9"/>',
    baby: '<path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/>',
    school: '<path d="M14 22v-4a2 2 0 1 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17M6 5v17"/><path d="m4 6 8-4 8 4"/><circle cx="12" cy="9" r="2"/>',
    contact: '<path d="M16 18a4 4 0 0 0-8 0"/><circle cx="12" cy="11" r="3"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v2M16 2v2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    boxes: '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85M7 16.5l5-3M7 16.5v5.17M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3M17 16.5l4.74-2.85M17 16.5v5.17M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15M12 8l4.74-2.85M12 13.5V8"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    userCog: '<circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2M21.7 16.4l-.9-.3M15.2 13.9l-.9-.3M16.6 18.7l.3-.9M19.1 12.2l.3-.9M19.6 18.7l-.4-1M16.8 12.3l-.4-1M14.3 16.6l1-.4M20.7 13.8l1-.4"/>',
    userCircle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.7V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.7"/>',
    key: '<path d="M2.6 18.2A2 2 0 0 0 2 19.6V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.7 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4M12 16h.01"/>',
    sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
    notes: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    progress: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 8v4l2.5 2.5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    scroll: '<path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/><path d="M14 8H10M14 12h-4"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    userX: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5M22 8l-5 5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
    shirt: '<path d="M20.4 3.5 16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.1a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.3-2.2z"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    mapPin: '<path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'
  };

  function icon(name, extraClass = '') {
    return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }
  /** Reemplaza cada <span data-icon="nombre"> por su SVG. */
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
  }

  // ---------- Marca ----------
  /** Logotipo de Soñar Despierto (tres arcos + texto). size: 'md' | 'lg'. */
  function logo({ size = 'md' } = {}) {
    return `
      <span class="logo ${size === 'lg' ? 'lg' : ''}">
        <svg class="logo-mark" viewBox="0 0 100 70" aria-hidden="true" focusable="false">
          <path d="M8 64 C 9 30, 30 8, 50 8 C 72 7, 92 30, 92 64" fill="none" stroke="var(--primary)" stroke-width="9" stroke-linecap="round"/>
          <path d="M22 64 C 22 40, 35 22, 50 22 C 66 21, 78 40, 78 64" fill="none" stroke="var(--secondary)" stroke-width="9" stroke-linecap="round"/>
          <path d="M36 64 C 36 50, 42 37, 50 37 C 59 36, 64 50, 64 64" fill="none" stroke="var(--sun)" stroke-width="9" stroke-linecap="round"/>
        </svg>
        <span class="logo-text">
          <span class="logo-name">Soñar</span>
          <span class="logo-sub" style="display:block">Despierto</span>
          <span class="logo-place" style="display:block">Veracruz</span>
        </span>
      </span>`;
  }
  /** Reemplaza cada <span data-logo="md|lg"> por el logotipo. */
  function hydrateLogos(root = document) {
    root.querySelectorAll('[data-logo]').forEach((el) => { el.outerHTML = logo({ size: el.dataset.logo }); });
  }

  // ---------- Formato ----------
  /** Convierte una fecha ISO de la API ("2026-10-19T15:30:00.000Z") en texto legible, en hora de Veracruz. */
  function formatDate(value, { dateStyle = 'long', timeStyle = 'short' } = {}) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('es-MX', { dateStyle, timeStyle, timeZone: 'America/Mexico_City' });
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  }

  // ---------- Botón ocupado ----------
  function setBusy(button, busy) {
    if (!button) return;
    if (busy) {
      if (button.dataset.busy) return;
      button.dataset.busy = '1';
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${button.dataset.label}`;
    } else if (button.dataset.busy) {
      button.innerHTML = button.dataset.label;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      delete button.dataset.busy;
      delete button.dataset.label;
    }
  }

  // ---------- Notificaciones ----------
  function toast(message, type = 'info') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = icon({ success: 'check', error: 'alert' }[type] || 'info') + `<span>${escape(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 220);
    }, type === 'error' ? 5000 : 3200);
  }

  // ---------- Modal base ----------
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function openDialog({ title, description = '', bodyHtml = '', footerHtml = '', as = 'div', onClose }) {
    const previousFocus = document.activeElement;
    const titleId = `dialog-title-${++uid}`;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <${as} class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="modal-header">
          <h2 id="${titleId}">${escape(title)}</h2>
          ${description ? `<p>${escape(description)}</p>` : ''}
        </div>
        ${bodyHtml ? `<div class="modal-body">${bodyHtml}</div>` : ''}
        <div class="modal-footer">${footerHtml}</div>
      </${as}>`;
    const modal = overlay.firstElementChild;
    let closed = false;

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      if (onClose) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const items = [...modal.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    return { el: modal, close };
  }

  /**
   * Diálogo de confirmación.
   *   if (await UI.confirm({ title: '¿Eliminar?', message: '...', confirmText: 'Eliminar', danger: true })) { ... }
   */
  function confirm({ title = '¿Estás seguro?', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise((resolve) => {
      const dialog = openDialog({
        title,
        description: message,
        footerHtml: `
          <button type="button" class="btn btn-outline" data-action="cancel">${escape(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'btn-destructive' : 'btn-primary'}" data-action="ok">${escape(confirmText)}</button>`,
        onClose: () => resolve(false)
      });
      dialog.el.querySelector('[data-action="cancel"]').addEventListener('click', dialog.close);
      const ok = dialog.el.querySelector('[data-action="ok"]');
      ok.addEventListener('click', () => { resolve(true); dialog.close(); });
      ok.focus();
    });
  }

  function fieldHtml(field, value) {
    const id = `field-${field.name}-${++uid}`;
    const attrs = [
      `id="${id}"`,
      `name="${escape(field.name)}"`,
      field.required ? 'required' : '',
      field.maxlength ? `maxlength="${Number(field.maxlength)}"` : '',
      field.placeholder ? `placeholder="${escape(field.placeholder)}"` : ''
    ].filter(Boolean).join(' ');

    let control;
    if (field.type === 'textarea') {
      control = `<textarea class="input textarea" ${attrs} rows="${field.rows || 4}">${escape(value)}</textarea>`;
    } else if (field.type === 'select') {
      const options = (field.options || []).map((o) =>
        `<option value="${escape(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${escape(o.label)}</option>`
      ).join('');
      control = `<div class="select-wrap"><select class="input select" ${attrs}>${options}</select></div>`;
    } else {
      control = `<input class="input" type="${escape(field.type || 'text')}" ${attrs} value="${escape(value)}">`;
    }
    return `
      <div class="field">
        <label for="${id}">${escape(field.label)}</label>
        ${control}
        ${field.hint ? `<p class="hint">${escape(field.hint)}</p>` : ''}
      </div>`;
  }

  /**
   * Formulario en un modal. Resuelve con lo que devuelva onSubmit (o con los
   * valores si no hay onSubmit), o con null si se cancela.
   * Si onSubmit lanza un error, el mensaje se muestra dentro del modal.
   *
   *   const guardado = await UI.formModal({
   *     title: 'Nuevo cliente',
   *     fields: [{ name: 'nombre', label: 'Nombre', required: true }],
   *     onSubmit: (values) => UI.api('/clientes', { method: 'POST', body: values })
   *   });
   */
  function formModal({ title, description = '', fields, values = {}, submitText = 'Guardar', onSubmit }) {
    return new Promise((resolve) => {
      const dialog = openDialog({
        title,
        description,
        as: 'form',
        bodyHtml: `
          <div class="form">
            ${fields.map((f) => fieldHtml(f, values[f.name] ?? f.default ?? '')).join('')}
            <div class="alert alert-error" data-form-error role="alert" hidden></div>
          </div>`,
        footerHtml: `
          <button type="button" class="btn btn-outline" data-action="cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">${escape(submitText)}</button>`,
        onClose: () => resolve(null)
      });

      const form = dialog.el;
      const errorBox = form.querySelector('[data-form-error]');
      const submit = form.querySelector('[type="submit"]');
      form.querySelector('[data-action="cancel"]').addEventListener('click', dialog.close);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        const data = {};
        for (const f of fields) data[f.name] = String(form.elements[f.name].value).trim();

        if (!onSubmit) { resolve(data); dialog.close(); return; }
        setBusy(submit, true);
        try {
          const result = await onSubmit(data);
          resolve(result === undefined ? data : result);
          dialog.close();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
          setBusy(submit, false);
        }
      });

      const first = form.querySelector('input, textarea, select');
      if (first) first.focus();
    });
  }

  return {
    escape,
    getToken, getUser, setUser, setSession, clearSession, takeAuthMessage,
    api, buildQuery, onForbidden, download,
    icon, hydrateIcons, logo, hydrateLogos,
    formatDate, initials,
    setBusy, toast, confirm, formModal, dialog: openDialog
  };
})();

if (typeof module !== 'undefined') module.exports = UI; // UI.buildQuery en las pruebas con node:test
