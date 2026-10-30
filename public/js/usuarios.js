/**
 * Vista "Usuarios" (solo ADMIN): pestañas Solicitudes y Usuarios, filtros, alta y acciones.
 * Parámetros de la URL: tab (solicitudes | usuarios), estado, q, rol, modulo, page.
 */
const Usuarios = (() => {
  const esc = (v) => UI.escape(v);
  const D = () => UsuariosDialogos;

  function mount(container, ctx) {
    const { user: me } = ctx;
    let params = { ...ctx.params };
    if (params.tab !== 'solicitudes') params.tab = params.tab === 'usuarios' ? 'usuarios' : null;
    let summary = null;
    let searchTimer = null;
    let seq = 0;

    const tab = () => (params.tab === 'solicitudes' ? 'solicitudes' : (params.tab === 'usuarios' ? 'usuarios' : null));

    container.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Usuarios</h2>
          <p class="muted">Revisa las solicitudes de cuenta y administra quién tiene acceso a cada módulo.</p>
        </div>
        <button type="button" class="btn btn-primary" data-new>${UI.icon('userPlus')}Nuevo usuario</button>
      </section>
      <div class="tabs" role="tablist" aria-label="Secciones de usuarios">
        <button type="button" role="tab" class="tab" data-tab="solicitudes" id="tab-sol" aria-controls="usersPanel">Solicitudes <span class="tab-count" data-count></span></button>
        <button type="button" role="tab" class="tab" data-tab="usuarios" id="tab-usr" aria-controls="usersPanel">Usuarios</button>
      </div>
      <section class="card panel" id="usersPanel" role="tabpanel">
        <div class="filters" data-filters></div>
        <div data-list></div>
        <div data-pager></div>
      </section>`;

    const filtersEl = container.querySelector('[data-filters]');
    const listEl = container.querySelector('[data-list]');
    const pagerEl = container.querySelector('[data-pager]');

    container.querySelector('[data-new]').addEventListener('click', async () => {
      const created = await D().userForm({ mode: 'create' });
      if (created) { setParams({ tab: 'usuarios', estado: null, q: null, rol: null, modulo: null, page: null }); }
    });
    container.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tab !== tab()) setParams({ tab: b.dataset.tab, estado: null, q: null, rol: null, modulo: null, page: null });
    }));
    container.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tab() === 'solicitudes' ? 'usuarios' : 'solicitudes';
      setParams({ tab: next, estado: null, q: null, rol: null, modulo: null, page: null });
      container.querySelector(`[data-tab="${next}"]`).focus();
    });

    function setParams(patch, { push = true, keepFilters = false } = {}) {
      params = { ...params, ...patch };
      for (const k of Object.keys(params)) if (params[k] === null || params[k] === '') delete params[k];
      ctx.navigate(params, { push });
      render({ keepFilters });
    }

    async function loadSummary() {
      try {
        summary = await UI.api('/users/summary');
        const count = container.querySelector('[data-count]');
        count.textContent = summary.pending ? String(summary.pending) : '';
        count.hidden = !summary.pending;
        if (!tab()) { params.tab = summary.pending ? 'solicitudes' : 'usuarios'; ctx.navigate(params, { push: false }); render(); }
      } catch { if (!tab()) { params.tab = 'usuarios'; render(); } }
    }

    function renderTabs() {
      container.querySelectorAll('[data-tab]').forEach((b) => {
        const active = b.dataset.tab === tab();
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
        b.tabIndex = active ? 0 : -1;
      });
      container.querySelector('#usersPanel').setAttribute('aria-labelledby', tab() === 'solicitudes' ? 'tab-sol' : 'tab-usr');
    }

    function renderFilters() {
      const isReq = tab() === 'solicitudes';
      const sel = (name, label, options, value) => `
        <label class="filter"><span class="filter-label">${label}</span>
          <span class="select-wrap"><select class="input select" name="${name}">
            ${options.map(([v, l]) => `<option value="${v}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}
          </select></span></label>`;
      filtersEl.innerHTML = `
        <label class="filter filter-search"><span class="filter-label">Buscar</span>
          <span class="search">${UI.icon('search')}<input class="input" type="search" name="q" value="${esc(params.q || '')}"
            placeholder="Nombre o correo" autocomplete="off"></span></label>
        ${isReq
          ? sel('estado', 'Estado', [['', 'Pendientes'], ['RECHAZADA', 'Rechazadas']], params.estado)
          : sel('rol', 'Rol', [['', 'Todos'], ['ADMIN', 'Administrador'], ['OPERADOR', 'Operador']], params.rol)
            + sel('estado', 'Estado', [['', 'Activos'], ['inactivos', 'Inactivos'], ['todos', 'Todos']], params.estado)
            + sel('modulo', 'Módulo', [['', 'Todos'], ...Access.MODULE_KEYS.map((k) => [k, Access.MODULE_INFO[k].label])], params.modulo)}`;
      filtersEl.querySelector('[name="q"]').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => setParams({ q: e.target.value.trim(), page: null }, { push: false, keepFilters: true }), 300);
      });
      filtersEl.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => {
        setParams({ [s.name]: s.value, page: null }, { keepFilters: true });
      }));
    }

    function query() {
      const page = Number(params.page) || 1;
      if (tab() === 'solicitudes') {
        return { page, page_size: 20, search: params.q, account_status: params.estado === 'RECHAZADA' ? 'RECHAZADA' : 'PENDIENTE', order_by: '-created_at' };
      }
      const active = { inactivos: 'false', todos: undefined }[params.estado];
      return {
        page, page_size: 20, search: params.q, account_status: 'APROBADA', role: params.rol, module: params.modulo,
        is_active: params.estado === 'inactivos' || params.estado === 'todos' ? active : 'true', order_by: 'last_name'
      };
    }

    async function render({ keepFilters = false } = {}) {
      if (!tab()) { listEl.innerHTML = Components.loading(3); return; }
      renderTabs();
      if (!keepFilters) renderFilters();
      const mySeq = ++seq;
      listEl.innerHTML = Components.loading(4);
      pagerEl.innerHTML = '';
      try {
        const data = await UI.api(`/users${UI.buildQuery(query())}`);
        if (mySeq !== seq) return;
        if (tab() === 'solicitudes') renderRequests(data); else renderUsers(data);
        if (data.pages > 1 || data.total) {
          pagerEl.appendChild(Components.paginationBar({
            page: data.page, pages: data.pages, total: data.total, pageSize: data.page_size,
            itemLabel: tab() === 'solicitudes' ? 'solicitudes' : 'usuarios',
            onPageChange: (p) => { setParams({ page: p > 1 ? p : null }, { keepFilters: true }); container.scrollIntoView(); }
          }));
        }
      } catch (err) {
        if (mySeq !== seq) return;
        Components.error(listEl, err, () => render({ keepFilters: true }));
      }
    }

    // ---------- Solicitudes ----------
    function renderRequests(data) {
      const rejected = params.estado === 'RECHAZADA';
      if (!data.items.length) {
        listEl.innerHTML = Components.empty({
          iconName: 'inbox',
          title: params.q ? 'Sin resultados' : (rejected ? 'No hay solicitudes rechazadas.' : 'No hay solicitudes pendientes.'),
          text: params.q ? 'Prueba con otro nombre o correo.' : (rejected ? '' : 'Cuando alguien se registre, aparecerá aquí.')
        });
        return;
      }
      listEl.innerHTML = `<ul class="request-list">${data.items.map((u) => `
        <li class="request-card">
          <div class="request-main">
            <p class="request-name">${esc(u.full_name)}</p>
            <p class="muted">${esc(u.email)}${u.phone ? ` · <a href="tel:${esc(u.phone)}">${esc(Phone.format(u.phone))}</a>` : ''}</p>
            <p class="request-modules"><span class="muted">Solicitó:</span> ${D().moduleBadges(u.requested_modules, { empty: 'Sin módulos solicitados' })}</p>
            <p class="hint">Solicitada el ${esc(Fechas.formatDateTime(u.created_at))} (${esc(Fechas.formatRelative(u.created_at))})</p>
            <p class="hint" data-extra="${u.id}"></p>
          </div>
          <div class="request-actions">
            ${rejected
              ? `<button type="button" class="btn btn-outline btn-sm" data-approve="${u.id}">Aprobar de todos modos</button>`
              : `<button type="button" class="btn btn-primary btn-sm" data-review="${u.id}">${UI.icon('userCheck')}Revisar solicitud</button>`}
            <button type="button" class="btn btn-ghost btn-sm btn-danger-ghost" data-delete="${u.id}">${UI.icon('trash')}Eliminar</button>
          </div>
        </li>`).join('')}</ul>`;
      const byId = Object.fromEntries(data.items.map((u) => [u.id, u]));
      // Nota y datos de revisión (vienen en el detalle)
      for (const u of data.items) {
        UI.api(`/users/${u.id}`).then(({ user: d }) => {
          byId[u.id] = d;
          const el = listEl.querySelector(`[data-extra="${u.id}"]`);
          if (!el) return;
          const parts = [];
          if (d.registration_note) parts.push(`<span class="quote-inline">“${esc(d.registration_note)}”</span>`);
          if (rejected && d.reviewed_at) {
            parts.push(`Rechazada por ${esc(d.reviewed_by ? d.reviewed_by.full_name : 'un administrador')} el ${esc(Fechas.formatDate(d.reviewed_at))}`
              + `${d.review_note ? ` · Motivo: ${esc(d.review_note)}` : ''}`);
          }
          el.innerHTML = parts.join('<br>');
        }).catch(() => {});
      }
      listEl.querySelectorAll('[data-review],[data-approve]').forEach((b) => b.addEventListener('click', async () => {
        const id = Number(b.dataset.review || b.dataset.approve);
        const done = await D().reviewRequest(byId[id], { mode: b.dataset.review ? 'review' : 'approve' });
        if (done) { render({ keepFilters: true }); loadSummary(); }
      }));
      listEl.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
        if (await D().deleteRequest(byId[Number(b.dataset.delete)])) { render({ keepFilters: true }); loadSummary(); }
      }));
    }

    // ---------- Usuarios ----------
    function modulesCell(u) {
      if (u.role === 'ADMIN') return '<span class="badge badge-sun badge-plain">Todos</span>';
      if (!u.modules.length) return '<span class="muted">Ninguno</span>';
      const shown = u.modules.slice(0, 3).map((m) => `<span class="badge badge-plain">${esc(Access.MODULE_INFO[m]?.label || m)}</span>`).join('');
      const more = u.modules.length > 3 ? `<span class="badge badge-plain" title="${esc(u.modules.slice(3).map((m) => Access.MODULE_INFO[m]?.label || m).join(', '))}">+${u.modules.length - 3}</span>` : '';
      return `<span class="pill-list">${shown}${more}</span>`;
    }
    const statusBadge = (u) => (u.is_active
      ? `<span class="badge badge-success">Activo</span>`
      : `<span class="badge badge-danger">Inactivo</span>`);
    const lastLogin = (u) => (u.last_login_at ? esc(Fechas.formatRelative(u.last_login_at)) : '<span class="muted">Nunca</span>');

    function actions(u) {
      const self = u.id === me.id;
      return `<div class="row-actions">
        <a class="btn btn-ghost btn-sm" href="#usuario/${u.id}" title="Ver detalle">${UI.icon('eye')}<span>Ver detalle</span></a>
        <button type="button" class="btn btn-ghost btn-sm" data-edit="${u.id}" title="Editar">${UI.icon('pencil')}<span>Editar</span></button>
        ${self ? '' : `
          <button type="button" class="btn btn-ghost btn-sm" data-reset="${u.id}" title="Restablecer contraseña">${UI.icon('key')}<span>Restablecer contraseña</span></button>
          <button type="button" class="btn btn-ghost btn-sm ${u.is_active ? 'btn-danger-ghost' : ''}" data-toggle="${u.id}" title="${u.is_active ? 'Desactivar' : 'Activar'}">
            ${UI.icon(u.is_active ? 'userX' : 'userCheck')}<span>${u.is_active ? 'Desactivar' : 'Activar'}</span></button>`}
      </div>`;
    }

    function renderUsers(data) {
      if (!data.items.length) {
        const filtered = params.q || params.rol || params.modulo || params.estado;
        listEl.innerHTML = Components.empty({
          iconName: 'users', title: filtered ? 'Sin resultados' : 'Aún no hay usuarios',
          text: filtered ? 'Prueba con otros filtros.' : 'Crea el primero o aprueba una solicitud.',
          actionHtml: `<button type="button" class="btn btn-primary" data-new-empty>${UI.icon('userPlus')}Nuevo usuario</button>`
        });
        listEl.querySelector('[data-new-empty]').addEventListener('click', () => container.querySelector('[data-new]').click());
        return;
      }
      const name = (u) => `<a href="#usuario/${u.id}" class="strong-link">${esc(u.full_name)}</a>${u.id === me.id ? ' <span class="muted">(tú)</span>' : ''}`;
      listEl.innerHTML = `
        <div class="table-wrap desktop-only">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Módulos</th><th>Estado</th><th>Último acceso</th><th><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${data.items.map((u) => `<tr>
              <td>${name(u)}</td><td class="break">${esc(u.email)}</td><td>${esc(Access.ROLE_LABEL[u.role])}</td>
              <td>${modulesCell(u)}</td><td>${statusBadge(u)}</td><td>${lastLogin(u)}</td><td class="actions-cell">${actions(u)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <ul class="card-list mobile-only">${data.items.map((u) => `
          <li class="item-card">
            <div class="item-card-head"><p>${name(u)}</p>${statusBadge(u)}</div>
            <p class="muted">${esc(u.email)}</p>
            <p>${esc(Access.ROLE_LABEL[u.role])} · Último acceso: ${lastLogin(u)}</p>
            <p>${modulesCell(u)}</p>
            ${actions(u)}
          </li>`).join('')}</ul>`;
      const byId = Object.fromEntries(data.items.map((u) => [u.id, u]));
      listEl.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
        const u = byId[Number(b.dataset.edit)];
        const out = await D().userForm({ mode: 'edit', user: u, self: u.id === me.id });
        if (out) { render({ keepFilters: true }); if (u.id === me.id) ctx.refreshUser({ force: true }); }
      }));
      listEl.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
        await D().resetPassword(byId[Number(b.dataset.reset)]);
      }));
      listEl.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
        if (await D().toggleActive(byId[Number(b.dataset.toggle)])) render({ keepFilters: true });
      }));
    }

    loadSummary();
    render();
  }

  return { mount };
})();
