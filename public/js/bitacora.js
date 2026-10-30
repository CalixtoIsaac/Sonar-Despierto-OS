/**
 * Vista "Bitácora" (solo ADMIN): registro de accesos y cambios, con filtros y paginación.
 * Parámetros: desde, hasta (YYYY-MM-DD, días en hora de Veracruz; por defecto los últimos 7 días),
 * accion, usuario (id del actor), objeto (id de la cuenta afectada), page.
 * Con objeto o usuario, desde/hasta vacíos significan "sin límite".
 */
const Bitacora = (() => {
  const esc = (v) => UI.escape(v);

  function actionOptions(value) {
    const groups = Audit.GROUPS.map((g) => {
      const opts = Audit.AUDIT_ACTIONS.filter((a) => Audit.AUDIT_ACTION_GROUP[a] === g.key)
        .map((a) => `<option value="${a}"${a === value ? ' selected' : ''}>${esc(Audit.AUDIT_ACTION_LABEL[a])}</option>`).join('');
      return opts ? `<optgroup label="${esc(g.label)}">${opts}</optgroup>` : '';
    }).join('');
    return `<option value="">Todas</option>${groups}`;
  }

  function groupBadge(action) {
    const g = Audit.GROUPS.find((x) => x.key === Audit.AUDIT_ACTION_GROUP[action]);
    const tone = { sesion: 'badge-info', cuentas: 'badge-sun', permisos: 'badge-warning', personas: 'badge-success', exportaciones: 'badge-danger' }[g?.key] || '';
    return `<span class="badge badge-plain ${tone}">${g ? UI.icon(g.icon) : ''}${esc(Audit.auditActionLabel(action))}</span>`;
  }

  function about(log) {
    if (!log.entity) return '—';
    const label = Audit.ENTITY_LABEL[log.entity] || log.entity;
    let text = `${label} #${log.entity_id ?? '—'}`;
    if (log.entity === 'users' && log.detail && log.detail.email) text = log.detail.email;
    else if (log.entity === 'users' && log.actor && log.actor.id === log.entity_id) text = log.actor.email;
    const href = Audit.entityHref(log.entity, log.entity_id);
    return href ? `<a href="${href}">${esc(text)}</a>` : esc(text);
  }

  function actorCell(log) {
    return log.actor
      ? `<span class="cell-stack"><span>${esc(log.actor.full_name)}</span><span class="muted">${esc(log.actor.email)}</span></span>`
      : '<span class="muted">Sistema / desconocido</span>';
  }

  function mount(container, ctx) {
    let params = { ...ctx.params };
    const scoped = params.objeto || params.usuario;
    if (!scoped && !params.desde && !params.hasta && !params.todo) {
      params.desde = Fechas.daysAgoLocal(6);
      params.hasta = Fechas.todayLocal();
    }
    let seq = 0;

    container.innerHTML = `
      <section class="page-header">
        <div><h2>Bitácora</h2>
          <p class="muted">Registro de inicios de sesión y cambios en cuentas, permisos y datos de personas.</p></div>
      </section>
      <section class="card panel">
        <form class="filters" data-filters novalidate></form>
        <div data-chip></div>
        <div data-list></div>
        <div data-pager></div>
      </section>`;
    const form = container.querySelector('[data-filters]');
    const listEl = container.querySelector('[data-list]');
    const pagerEl = container.querySelector('[data-pager]');

    function setParams(patch, { push = true } = {}) {
      params = { ...params, ...patch };
      for (const k of Object.keys(params)) if (params[k] === null || params[k] === '') delete params[k];
      ctx.navigate(params, { push });
      load();
    }

    async function renderFilters() {
      form.innerHTML = `
        <label class="filter"><span class="filter-label">Desde</span>
          <input class="input" type="date" name="desde" value="${esc(params.desde || '')}"></label>
        <label class="filter" data-field="hasta"><span class="filter-label">Hasta</span>
          <input class="input" type="date" name="hasta" value="${esc(params.hasta || '')}" aria-describedby="hastaErr">
          <span class="field-error" id="hastaErr" hidden></span></label>
        <label class="filter"><span class="filter-label">Acción</span>
          <span class="select-wrap"><select class="input select" name="accion">${actionOptions(params.accion)}</select></span></label>
        <label class="filter"><span class="filter-label">Usuario</span>
          <span class="select-wrap"><select class="input select" name="usuario"><option value="">Todos</option></select></span></label>
        <div class="filter filter-end"><button type="button" class="btn btn-ghost" data-clear>${UI.icon('x')}Limpiar filtros</button></div>`;
      const hastaErr = form.querySelector('#hastaErr');
      form.querySelectorAll('input[type="date"]').forEach((input) => input.addEventListener('change', () => {
        const desde = form.elements.desde.value;
        const hasta = form.elements.hasta.value;
        if (desde && hasta && hasta < desde) {
          hastaErr.textContent = 'Hasta no puede ser anterior a Desde.';
          hastaErr.hidden = false;
          form.elements.hasta.setAttribute('aria-invalid', 'true');
          return;
        }
        hastaErr.hidden = true;
        form.elements.hasta.removeAttribute('aria-invalid');
        setParams({ desde, hasta, todo: !desde && !hasta ? '1' : null, page: null });
      }));
      form.elements.accion.addEventListener('change', () => setParams({ accion: form.elements.accion.value, page: null }));
      form.elements.usuario.addEventListener('change', () => setParams({ usuario: form.elements.usuario.value, page: null }));
      form.querySelector('[data-clear]').addEventListener('click', () => {
        params = { desde: Fechas.daysAgoLocal(6), hasta: Fechas.todayLocal() };
        ctx.navigate(params);
        renderFilters();
        load();
      });
      try {
        const users = await UI.api('/users?page_size=100&order_by=last_name');
        form.elements.usuario.innerHTML = '<option value="">Todos</option>' + users.items.map((u) =>
          `<option value="${u.id}"${String(u.id) === String(params.usuario || '') ? ' selected' : ''}>${esc(u.full_name)} (${esc(u.email)})</option>`).join('');
      } catch { /* el filtro de usuario queda en "Todos" */ }
    }

    async function renderChip() {
      const el = container.querySelector('[data-chip]');
      if (!params.objeto) { el.innerHTML = ''; return; }
      const entity = params.entidad || 'users';
      let label = `${Audit.ENTITY_LABEL[entity] || entity} #${params.objeto}`;
      if (entity === 'users') {
        try { label = (await UI.api(`/users/${Number(params.objeto)}`)).user.email; } catch { /* puede estar eliminada */ }
      }
      el.innerHTML = `<p class="chip-row"><span class="chip">Sobre: ${esc(label)}
        <button type="button" class="chip-x" aria-label="Quitar filtro">${UI.icon('x')}</button></span></p>`;
      el.querySelector('.chip-x').addEventListener('click', () => { setParams({ objeto: null, entidad: null, page: null }); renderChip(); });
    }

    function query() {
      const range = Fechas.localDayRangeToUtc(params.desde, params.hasta);
      const q = { page: Number(params.page) || 1, page_size: 50, action: params.accion, actor_id: params.usuario, ...range };
      if (params.objeto) { q.entity = params.entidad || 'users'; q.entity_id = params.objeto; }
      return q;
    }

    function render(data) {
      if (!data.items.length) {
        listEl.innerHTML = Components.empty({ iconName: 'scroll', title: 'No hay registros con estos filtros.' });
        return;
      }
      const rows = data.items.map((log) => {
        const detail = Audit.describeAuditDetail(log) || '—';
        return { log, detail };
      });
      listEl.innerHTML = `
        <div class="table-wrap desktop-only"><table class="table table-compact">
          <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Sobre</th><th>Detalle</th><th>IP</th></tr></thead>
          <tbody>${rows.map(({ log, detail }) => `
            <tr><td class="nowrap">${esc(Fechas.formatDateTime(log.created_at))}</td><td>${actorCell(log)}</td>
              <td>${groupBadge(log.action)}</td><td>${about(log)}</td>
              <td class="detail-cell">${esc(detail)}${log.detail ? `<details class="tech"><summary>Ver detalle técnico</summary><pre>${esc(JSON.stringify(log.detail, null, 2))}</pre></details>` : ''}</td>
              <td class="muted nowrap">${esc(log.ip_address || '—')}</td></tr>`).join('')}</tbody>
        </table></div>
        <ul class="card-list mobile-only">${rows.map(({ log, detail }) => `
          <li class="item-card">
            <div class="item-card-head">${groupBadge(log.action)}<span class="muted">${esc(Fechas.formatDateTime(log.created_at))}</span></div>
            <p>${actorCell(log)}</p>
            <p><span class="muted">Sobre:</span> ${about(log)}</p>
            ${detail !== '—' ? `<p>${esc(detail)}</p>` : ''}
            ${log.detail ? `<details class="tech"><summary>Ver detalle técnico</summary><pre>${esc(JSON.stringify(log.detail, null, 2))}</pre></details>` : ''}
          </li>`).join('')}</ul>`;
    }

    async function load() {
      const mySeq = ++seq;
      listEl.innerHTML = Components.loading(6);
      pagerEl.innerHTML = '';
      try {
        const data = await UI.api(`/audit-logs${UI.buildQuery(query())}`);
        if (mySeq !== seq) return;
        render(data);
        pagerEl.appendChild(Components.paginationBar({
          page: data.page, pages: data.pages, total: data.total, pageSize: data.page_size, itemLabel: 'registros',
          onPageChange: (p) => setParams({ page: p > 1 ? p : null })
        }));
      } catch (err) {
        if (mySeq !== seq) return;
        Components.error(listEl, err, load);
      }
    }

    renderFilters();
    renderChip();
    load();
  }

  return { mount };
})();
