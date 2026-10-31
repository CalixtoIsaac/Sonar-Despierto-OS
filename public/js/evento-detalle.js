/**
 * Vista "#evento/<id>" (P23, módulo EVENTOS): datos y estatus del evento, contadores de cartas y voluntarios,
 * tallas de playera de los confirmados y voluntarios asignados (agregar varios, cambiar área y estatus).
 * Parámetros: vq (búsqueda de voluntarios), vestatus, vpage.
 */
const EventoDetalle = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;

  function notFound(container) {
    container.innerHTML = `<section class="card panel narrow" style="margin: 24px auto 0">
      ${Components.empty({ iconName: 'calendarDays', title: 'No encontramos este evento.',
        actionHtml: `<a class="btn btn-outline" href="#eventos">${UI.icon('arrowLeft')}Volver a Eventos</a>` })}</section>`;
  }

  async function changeStatus(event, to, reload) {
    const next = CartasUI.nextEventStatus(event.status);
    const forward = next && next.to === to;
    const pending = event.stats.letters.total - event.stats.letters.ENTREGADO;
    const message = forward
      ? `${next.hint}${to === 'CERRADO' && pending ? ` Atención: ${pending} ${pending === 1 ? 'carta sigue' : 'cartas siguen'} sin entregar.` : ''}`
      : 'Solo un administrador puede regresar un evento a un estatus anterior. Úsalo para corregir.';
    const ok = await UI.confirm({
      title: forward ? `¿${next.label}?` : `¿Regresar a "${C().EVENT_STATUS_LABEL[to]}"?`,
      message, confirmText: forward ? next.label : 'Regresar', danger: to === 'CERRADO' || !forward
    });
    if (!ok) return;
    try {
      await UI.api(`/events/${event.id}/status`, { method: 'POST', body: { to_status: to } });
      UI.toast(`Evento ${C().EVENT_STATUS_LABEL[to].toLowerCase()}`, 'success');
      reload();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  function statCard(label, value, { href, tone = '', iconName } = {}) {
    const inner = `<span class="stat-value">${value}</span><span class="stat-label">${iconName ? UI.icon(iconName) : ''}${esc(label)}</span>`;
    return href ? `<a class="stat-card ${tone}" href="${href}">${inner}</a>` : `<div class="stat-card ${tone}">${inner}</div>`;
  }

  // ---------- Voluntarios del evento ----------
  function addDialog(event, onDone) {
    const selected = new Map();
    const areaOpts = [{ value: '', label: 'Su área de interés' }, ...C().VOLUNTEER_AREAS.map((a) => ({ value: a, label: C().VOLUNTEER_AREA_LABEL[a] }))];
    const statusOpts = C().PARTICIPATION_STATUSES.filter((s) => ['CONFIRMADO', 'POSTULADO'].includes(s))
      .map((s) => ({ value: s, label: C().PARTICIPATION_STATUS_LABEL[s] }));
    const F = Components.form;
    const dialog = UI.dialog({
      title: `Agregar voluntarios a ${event.name}`, as: 'form',
      bodyHtml: `<div class="form">
        <div class="field"><label for="ev-vq">Buscar voluntario</label>
          <span class="search">${UI.icon('search')}<input id="ev-vq" class="input" type="search" data-q placeholder="Nombre, correo o teléfono" autocomplete="off"></span></div>
        <div class="pick-list" data-options aria-live="polite"></div>
        <p class="hint" data-count>Ninguno seleccionado.</p>
        <div class="form-grid">${F.field({ name: 'area', label: 'Área asignada', type: 'select', options: areaOpts })}
          ${F.field({ name: 'status', label: 'Estatus', type: 'select', options: statusOpts }, 'CONFIRMADO')}</div>
        <div class="alert alert-error" data-error role="alert" hidden></div></div>`,
      footerHtml: `<div class="modal-actions"><span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
        <button type="submit" class="btn btn-primary">${UI.icon('userPlus')}Agregar</button></div>`
    });
    dialog.el.classList.add('modal-wide');
    const form = dialog.el;
    const box = form.querySelector('[data-options]');
    const count = form.querySelector('[data-count]');
    const errorBox = form.querySelector('[data-error]');
    const syncCount = () => {
      count.textContent = selected.size ? `${selected.size} ${selected.size === 1 ? 'seleccionado' : 'seleccionados'}: ${[...selected.values()].join(', ')}` : 'Ninguno seleccionado.';
    };
    async function search() {
      box.innerHTML = '<p class="muted">Buscando…</p>';
      try {
        const { items } = await UI.api(`/events/${event.id}/volunteer-options${UI.buildQuery({ search: form.querySelector('[data-q]').value.trim() })}`);
        box.innerHTML = items.length ? items.map((v) => `<label class="check pick-item">
            <input type="checkbox" value="${v.id}"${selected.has(v.id) ? ' checked' : ''}>
            <span><strong>${esc(v.full_name)}</strong> <span class="muted">· ${esc(C().VOLUNTEER_AREA_LABEL[v.area_of_interest])} · Talla ${esc(v.shirt_size)}</span></span></label>`).join('')
          : '<p class="muted">No hay más voluntarios activos con ese nombre (los que ya están en el evento no aparecen).</p>';
        box.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener('change', () => {
          const v = items.find((x) => String(x.id) === cb.value);
          if (cb.checked) selected.set(v.id, v.full_name); else selected.delete(v.id);
          syncCount();
        }));
      } catch (err) { box.innerHTML = `<p class="field-error">${esc(err.message)}</p>`; }
    }
    let t = null;
    form.querySelector('[data-q]').addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 300); });
    form.querySelector('[data-cancel]').addEventListener('click', dialog.close);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.hidden = true;
      if (!selected.size) { errorBox.innerHTML = `${UI.icon('alert')}<span>Elige al menos un voluntario.</span>`; errorBox.hidden = false; return; }
      const button = form.querySelector('[type="submit"]');
      UI.setBusy(button, true);
      try {
        const r = await UI.api(`/events/${event.id}/volunteers`, { method: 'POST', body: {
          volunteer_ids: [...selected.keys()], area: form.elements.area.value || null, status: form.elements.status.value
        } });
        UI.toast(`${r.added} ${r.added === 1 ? 'voluntario agregado' : 'voluntarios agregados'}${r.skipped.length ? ` (${r.skipped.length} ya estaban)` : ''}`, 'success');
        dialog.close();
        onDone();
      } catch (err) {
        UI.setBusy(button, false);
        errorBox.innerHTML = `${UI.icon('alert')}<span>${esc(err.details ? err.details[0].message : err.message)}</span>`;
        errorBox.hidden = false;
      }
    });
    search();
    form.querySelector('[data-q]').focus();
  }

  function mountVolunteers(el, event, ctx, refreshEvent) {
    const closed = event.status === 'CERRADO';
    const canSeeVolunteer = Access.canSee(ctx.user, Access.viewByKey('voluntario'));
    let params = { vq: ctx.params.vq || '', vestatus: ctx.params.vestatus || '', vpage: Number(ctx.params.vpage) || 1 };
    let seq = 0;
    el.innerHTML = `
      <div class="panel-head"><h3 class="panel-title">Voluntarios del evento</h3>
        ${closed ? '' : `<button type="button" class="btn btn-primary btn-sm" data-add>${UI.icon('userPlus')}Agregar voluntarios</button>`}</div>
      <div class="filters">
        <label class="filter filter-search"><span class="filter-label">Buscar</span>
          <span class="search">${UI.icon('search')}<input class="input" type="search" data-vq value="${esc(params.vq)}" placeholder="Nombre o teléfono" autocomplete="off"></span></label>
        <label class="filter"><span class="filter-label">Estatus</span><span class="select-wrap"><select class="input select" data-vestatus>
          <option value="">Todos</option>${C().PARTICIPATION_STATUSES.map((s) => `<option value="${s}"${params.vestatus === s ? ' selected' : ''}>${esc(C().PARTICIPATION_STATUS_LABEL[s])}</option>`).join('')}
        </select></span></label>
      </div>
      <div data-vlist></div><div data-vpager></div>`;
    const listEl = el.querySelector('[data-vlist]');
    const pagerEl = el.querySelector('[data-vpager]');

    const sync = () => ctx.navigate({ ...ctx.params, vq: params.vq || null, vestatus: params.vestatus || null, vpage: params.vpage > 1 ? params.vpage : null }, { push: false });

    const selectHtml = (name, values, labels, value) => `<span class="select-wrap select-sm"><select class="input select" data-${name}${closed ? ' disabled' : ''} aria-label="${name === 'area' ? 'Área' : 'Estatus'}">
      ${values.map((v) => `<option value="${v}"${v === value ? ' selected' : ''}>${esc(labels[v])}</option>`).join('')}</select></span>`;

    async function load() {
      const mySeq = ++seq;
      listEl.innerHTML = Components.loading(3);
      pagerEl.innerHTML = '';
      try {
        const data = await UI.api(`/events/${event.id}/volunteers${UI.buildQuery({ search: params.vq, status: params.vestatus, page: params.vpage, page_size: 20 })}`);
        if (mySeq !== seq) return;
        if (!data.items.length) {
          listEl.innerHTML = Components.empty({ iconName: 'users',
            title: params.vq || params.vestatus ? 'Sin resultados' : 'Aún no hay voluntarios en este evento',
            text: params.vq || params.vestatus ? 'Prueba con otro nombre o estatus.' : (closed ? '' : 'Agrega a las personas que apoyarán y asígnales un área.') });
          return;
        }
        const nameOf = (p) => (canSeeVolunteer ? `<a class="strong-link" href="#voluntario/${p.volunteer.id}">${esc(p.volunteer.full_name)}</a>` : `<strong>${esc(p.volunteer.full_name)}</strong>`);
        const area = (p) => selectHtml('area', C().VOLUNTEER_AREAS, C().VOLUNTEER_AREA_LABEL, p.area);
        const status = (p) => selectHtml('status', C().PARTICIPATION_STATUSES, C().PARTICIPATION_STATUS_LABEL, p.status);
        listEl.innerHTML = `
          <div class="table-wrap desktop-only"><table class="table table-compact">
            <thead><tr><th>Nombre</th><th>Teléfono</th><th>Talla</th><th>Área asignada</th><th>Estatus</th></tr></thead>
            <tbody>${data.items.map((p) => `<tr data-vid="${p.volunteer.id}"${['RECHAZADO', 'CANCELADO'].includes(p.status) ? ' class="row-inactive"' : ''}>
              <td>${nameOf(p)}</td><td>${Listado.phoneLink(p.volunteer.phone)}</td>
              <td><span class="badge badge-plain">${esc(p.volunteer.shirt_size)}</span></td><td>${area(p)}</td><td>${status(p)}</td></tr>`).join('')}</tbody>
          </table></div>
          <ul class="card-list mobile-only">${data.items.map((p) => `<li class="item-card" data-vid="${p.volunteer.id}">
            <div class="item-card-head"><p>${nameOf(p)}</p><span class="badge badge-plain">Talla ${esc(p.volunteer.shirt_size)}</span></div>
            <p>${Listado.phoneLink(p.volunteer.phone)}</p>
            <div class="form-grid">${area(p)}${status(p)}</div></li>`).join('')}</ul>`;
        listEl.querySelectorAll('[data-vid] select').forEach((sel) => sel.addEventListener('change', async () => {
          const vid = sel.closest('[data-vid]').dataset.vid;
          const field = sel.hasAttribute('data-area') ? 'area' : 'status';
          sel.disabled = true;
          try {
            await UI.api(`/events/${event.id}/volunteers/${vid}`, { method: 'PATCH', body: { [field]: sel.value } });
            UI.toast(field === 'area' ? 'Área actualizada' : `Estatus: ${C().PARTICIPATION_STATUS_LABEL[sel.value]}`, 'success');
            if (field === 'status') { load(); refreshEvent(); }
          } catch (err) { UI.toast(err.message, 'error'); load(); } finally { sel.disabled = false; }
        }));
        pagerEl.appendChild(Components.paginationBar({ page: data.page, pages: data.pages, total: data.total, pageSize: data.page_size,
          itemLabel: 'voluntarios', onPageChange: (p) => { params.vpage = p; sync(); load(); } }));
      } catch (err) {
        if (mySeq === seq) Components.error(listEl, err, load);
      }
    }

    let t = null;
    el.querySelector('[data-vq]').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { params = { ...params, vq: e.target.value.trim(), vpage: 1 }; sync(); load(); }, 300);
    });
    el.querySelector('[data-vestatus]').addEventListener('change', (e) => { params = { ...params, vestatus: e.target.value, vpage: 1 }; sync(); load(); });
    const add = el.querySelector('[data-add]');
    if (add) add.addEventListener('click', () => addDialog(event, () => { load(); refreshEvent(); }));
    load();
  }

  // ---------- Página ----------
  function renderSummary(el, event, ctx) {
    const s = event.stats;
    const canLetters = Access.canSee(ctx.user, Access.viewByKey('cartas')) && C().LETTER_EVENT_TYPES.includes(event.event_type);
    const lettersHref = (st) => (canLetters ? `#cartas?evento=${event.id}${st ? `&estatus=${st}` : ''}` : null);
    const letters = C().LETTER_EVENT_TYPES.includes(event.event_type) ? `
      <section class="card panel"><div class="panel-head"><h3 class="panel-title">Cartas</h3>
        ${canLetters ? `<a class="btn btn-outline btn-sm" href="${lettersHref()}">${UI.icon('mail')}Ver cartas</a>` : ''}</div>
        <div class="stat-grid">
          ${statCard('Total', s.letters.total, { href: lettersHref(), iconName: 'mail' })}
          ${C().LETTER_STATUSES.map((st) => statCard(C().LETTER_STATUS_LABEL[st], s.letters[st], { href: lettersHref(st), tone: `stat-${st.toLowerCase()}`, iconName: CartasUI.STATUS_META[st].icon })).join('')}
        </div>
        <p class="hint" style="margin-top:12px">${s.sponsors} ${s.sponsors === 1 ? 'padrino' : 'padrinos'} · hasta ${event.max_letters_per_sponsor} cartas por padrino</p>
      </section>` : '';
    const totalSizes = Object.values(s.shirt_sizes).reduce((a, b) => a + b, 0);
    el.innerHTML = `${letters}
      <section class="card panel"><h3 class="panel-title">Voluntarios</h3>
        <div class="stat-grid">${C().PARTICIPATION_STATUSES.map((st) => statCard(C().PARTICIPATION_STATUS_LABEL[st], s.volunteers[st])).join('')}</div>
        <div class="sizes-inline"><span class="sizes-title">${UI.icon('shirt')}Playeras de confirmados <span class="muted">(${totalSizes})</span></span>
          <span class="sizes">${C().SHIRT_SIZES.map((k) => `<span class="size-chip${s.shirt_sizes[k] ? '' : ' zero'}"><strong>${k}</strong> ${s.shirt_sizes[k]}</span>`).join('')}</span></div>
      </section>`;
  }

  async function mount(container, ctx) {
    const id = Number(ctx.id);
    if (!Number.isInteger(id) || id <= 0) { notFound(container); return; }
    container.innerHTML = Components.loading(6);
    let event;
    try { event = (await UI.api(`/events/${id}`)).event; } catch (err) {
      if (err.status === 404) notFound(container); else Components.error(container, err, () => mount(container, ctx));
      return;
    }
    const isAdmin = ctx.user.role === 'ADMIN';
    const next = CartasUI.nextEventStatus(event.status);
    const idx = C().EVENT_STATUSES.indexOf(event.status);
    const back = isAdmin && idx > 0 ? C().EVENT_STATUSES[idx - 1] : null;
    const reload = () => mount(container, ctx);
    container.innerHTML = `
      <p class="back-link"><a href="#eventos">${UI.icon('arrowLeft')}Eventos</a></p>
      <section class="page-header">
        <div><h2>${esc(event.name)}</h2>
          <p class="muted">${esc(C().EVENT_TYPE_LABEL[event.event_type])} · ${esc(Fechas.formatDate(event.event_date))} · ${CartasUI.eventBadge(event.status)}</p></div>
        <div class="header-actions">
          ${event.status === 'CERRADO' ? '' : `<button type="button" class="btn btn-outline" data-edit>${UI.icon('pencil')}Editar</button>`}
          ${back && !(back === 'BORRADOR' && event.letters_count) ? `<button type="button" class="btn btn-ghost" data-back="${back}">${UI.icon('undo')}${event.status === 'CERRADO' ? 'Reabrir' : `Regresar a ${esc(C().EVENT_STATUS_LABEL[back].toLowerCase())}`}</button>` : ''}
          ${next ? `<button type="button" class="btn ${next.to === 'CERRADO' ? 'btn-outline' : 'btn-primary'}" data-next="${next.to}">${UI.icon(next.icon)}${esc(next.label)}</button>` : ''}
        </div>
      </section>
      ${event.status === 'BORRADOR' ? `<div class="alert alert-info" role="note">${UI.icon('info')}<span>El evento está en borrador. Ábrelo para registrar cartas y asignar padrinos.</span></div>` : ''}
      ${event.status === 'CERRADO' ? `<div class="alert alert-warning" role="note">${UI.icon('lock')}<span>Evento cerrado: sus datos, voluntarios y cartas son de solo lectura.${isAdmin ? ' Como administrador puedes reabrirlo.' : ''}</span></div>` : ''}
      <div class="detail-grid">
        <div>
          <section class="card panel"><h3 class="panel-title">Datos del evento</h3>
            <dl class="data-list">
              <dt>Fecha</dt><dd>${esc(Fechas.formatDate(event.event_date))}</dd>
              <dt>Lugar</dt><dd>${esc(event.location || '—')}</dd>
              <dt>Prefijo de cartas</dt><dd><code>${esc(event.code_prefix)}</code> <span class="muted">(${esc(CartasUI.previewCode(event.code_prefix))}…)</span></dd>
              <dt>Cartas por padrino</dt><dd>Hasta ${event.max_letters_per_sponsor}</dd>
              <dt>Descripción</dt><dd>${esc(event.description || '—')}</dd>
              <dt>Creado por</dt><dd>${event.created_by ? esc(event.created_by.full_name) : '—'} <span class="muted">el ${esc(Fechas.formatDateTime(event.created_at))}</span></dd>
            </dl>
            ${isAdmin ? `<p style="margin-top:12px"><a class="strong-link" href="#bitacora?objeto=${event.id}&entidad=events">Ver su historial en la bitácora →</a></p>` : ''}
          </section>
        </div>
        <div data-summary></div>
      </div>
      <section class="card panel section-gap" data-volunteers></section>`;
    renderSummary(container.querySelector('[data-summary]'), event, ctx);
    const refreshEvent = async () => {
      try {
        event = (await UI.api(`/events/${id}`)).event;
        const el = container.querySelector('[data-summary]');
        if (el) renderSummary(el, event, ctx);
      } catch { /* el resumen no es crítico */ }
    };
    mountVolunteers(container.querySelector('[data-volunteers]'), event, ctx, refreshEvent);
    const edit = container.querySelector('[data-edit]');
    if (edit) edit.addEventListener('click', () => Eventos.openForm(event, reload));
    container.querySelectorAll('[data-next], [data-back]').forEach((b) => b.addEventListener('click', () => changeStatus(event, b.dataset.next || b.dataset.back, reload)));
  }

  return { mount, notFound };
})();
