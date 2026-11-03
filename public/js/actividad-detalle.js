/**
 * Vista "#actividad/<id>" (módulo CALENDARIO, Fase 5): datos de la actividad, aviso de traslape, estatus
 * (realizada, cancelar con motivo, reprogramar), edición y voluntarios convocados.
 */
const ActividadDetalle = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const CU = () => CalendarioUI;

  function notFound(container) {
    container.innerHTML = `<section class="card panel narrow" style="margin: 24px auto 0">
      ${Components.empty({ iconName: 'calendarRange', title: 'No encontramos esta actividad.',
        actionHtml: `<a class="btn btn-outline" href="#calendario">${UI.icon('arrowLeft')}Volver al calendario</a>` })}</section>`;
  }

  async function sendStatus(a, body, reload) {
    try {
      await UI.api(`/activities/${a.id}/status`, { method: 'POST', body: { ...body, version: a.version } });
      return true;
    } catch (err) {
      if (err.code === 'ACTIVITY_OVERLAP') {
        const ok = await UI.confirm({ title: 'Traslape de horario', confirmText: 'Reprogramar de todos modos',
          message: `${err.message} Se cruza con: ${CU().conflictText(err.data.conflicts)}.` });
        if (ok) return sendStatus(a, { ...body, allow_overlap: true }, reload);
        return false;
      }
      UI.toast(err.message, 'error');
      if (err.code === 'ACTIVITY_VERSION_CONFLICT') reload();
      return false;
    }
  }

  function cancelDialog(a, reload) {
    const F = Components.form;
    const dialog = UI.dialog({
      title: `¿Cancelar "${a.title}"?`, as: 'form',
      description: 'Seguirá en el calendario marcada como cancelada (con "Mostrar canceladas"). Puedes reprogramarla después.',
      bodyHtml: `<div class="form">${F.field({ name: 'reason', label: 'Motivo de la cancelación', type: 'textarea', required: true, max: 500,
        placeholder: 'Ej. Se pospone por lluvia; nueva fecha por confirmar.' })}</div>`,
      footerHtml: `<div class="modal-actions"><span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-cancel>Volver</button>
        <button type="submit" class="btn btn-destructive">${UI.icon('ban')}Cancelar actividad</button></div>`
    });
    const form = dialog.el;
    form.querySelector('[data-cancel]').addEventListener('click', dialog.close);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = form.elements.reason.value.trim();
      if ([...reason].length < 5) { F.showErrors(form, [{ field: 'reason', message: 'Escribe al menos 5 caracteres.' }]); return; }
      const btn = form.querySelector('[type="submit"]');
      UI.setBusy(btn, true);
      if (await sendStatus(a, { to_status: 'CANCELADA', reason }, reload)) {
        dialog.close();
        UI.toast('Actividad cancelada', 'success');
        reload();
      } else UI.setBusy(btn, false);
    });
    form.elements.reason.focus();
  }

  // ---------- Voluntarios ----------
  function addDialog(a, onDone) {
    const selected = new Map();
    const dialog = UI.dialog({
      title: `Convocar voluntarios a "${a.title}"`, as: 'form',
      bodyHtml: `<div class="form">
        <div class="field"><label for="act-vq">Buscar voluntario</label>
          <span class="search">${UI.icon('search')}<input id="act-vq" class="input" type="search" data-q placeholder="Nombre, correo o teléfono" autocomplete="off"></span></div>
        <div class="pick-list" data-options aria-live="polite"></div>
        <p class="hint" data-count>Ninguno seleccionado.</p>
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
    const syncCount = () => { count.textContent = selected.size ? `${selected.size} ${selected.size === 1 ? 'seleccionado' : 'seleccionados'}: ${[...selected.values()].join(', ')}` : 'Ninguno seleccionado.'; };
    async function search() {
      box.innerHTML = '<p class="muted">Buscando…</p>';
      try {
        const { items } = await UI.api(`/activities/${a.id}/volunteer-options${UI.buildQuery({ search: form.querySelector('[data-q]').value.trim() })}`);
        box.innerHTML = items.length ? items.map((v) => `<label class="check pick-item"><input type="checkbox" value="${v.id}"${selected.has(v.id) ? ' checked' : ''}>
            <span><strong>${esc(v.full_name)}</strong> <span class="muted">· ${esc(C().VOLUNTEER_AREA_LABEL[v.area_of_interest] || '')}</span></span></label>`).join('')
          : '<p class="muted">No hay más voluntarios activos con ese nombre (los que ya están convocados no aparecen).</p>';
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
        const r = await UI.api(`/activities/${a.id}/volunteers`, { method: 'POST', body: { volunteer_ids: [...selected.keys()] } });
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

  function volunteersPanel(a, ctx) {
    const editable = a.status !== 'CANCELADA';
    const canSeeVolunteer = Access.canSee(ctx.user, Access.viewByKey('voluntario'));
    const name = (v) => (canSeeVolunteer ? `<a class="strong-link" href="#voluntario/${v.id}">${esc(v.full_name)}</a>` : `<strong>${esc(v.full_name)}</strong>`);
    return `<section class="card panel"><div class="panel-head"><h3 class="panel-title">Voluntarios convocados <span class="muted">(${a.volunteers.length})</span></h3>
        ${editable ? `<button type="button" class="btn btn-primary btn-sm" data-add>${UI.icon('userPlus')}Convocar</button>` : ''}</div>
      ${a.volunteers.length ? `<ul class="cal-people">${a.volunteers.map((v) => `<li>
          <span>${name(v)}${v.is_active ? '' : ' <span class="badge badge-plain">Dado de baja</span>'}<br>${Listado.phoneLink(v.phone)}</span>
          ${editable ? `<button type="button" class="btn btn-danger-ghost btn-sm" data-remove="${v.id}" data-name="${esc(v.full_name)}" aria-label="Quitar a ${esc(v.full_name)}">${UI.icon('x')}<span>Quitar</span></button>` : ''}</li>`).join('')}</ul>`
        : Components.empty({ iconName: 'users', title: 'Nadie convocado todavía', text: editable ? 'Agrega a los voluntarios que participarán.' : '' })}
    </section>`;
  }

  // ---------- Página ----------
  async function mount(container, ctx) {
    const id = Number(ctx.id);
    if (!Number.isInteger(id) || id <= 0) { notFound(container); return; }
    container.innerHTML = Components.loading(6);
    let a;
    try { a = (await UI.api(`/activities/${id}`)).activity; } catch (err) {
      if (err.status === 404) notFound(container); else Components.error(container, err, () => mount(container, ctx));
      return;
    }
    const reload = () => mount(container, ctx);
    const isAdmin = ctx.user.role === 'ADMIN';
    const canEvent = a.event && Access.canSee(ctx.user, Access.viewByKey('evento'));
    const actions = [];
    if (a.status !== 'CANCELADA') actions.push(`<button type="button" class="btn btn-outline" data-edit>${UI.icon('pencil')}Editar o mover</button>`);
    if (a.status === 'PROGRAMADA') {
      actions.push(`<button type="button" class="btn btn-ghost" data-cancel-act>${UI.icon('ban')}Cancelar</button>`);
      actions.push(`<button type="button" class="btn btn-primary" data-done>${UI.icon('check')}Marcar realizada</button>`);
    } else {
      actions.push(`<button type="button" class="btn btn-outline" data-reopen>${UI.icon('undo')}${a.status === 'CANCELADA' ? 'Reprogramar' : 'Volver a programada'}</button>`);
    }
    container.innerHTML = `
      <p class="back-link"><a href="#calendario?fecha=${esc(a.activity_date)}">${UI.icon('arrowLeft')}Calendario</a></p>
      <section class="page-header">
        <div><h2>${esc(a.title)}</h2>
          <p class="cal-head-meta">${CU().typeChip(a.activity_type)} ${CU().statusBadge(a.status)} ${a.has_overlap ? CU().overlapBadge() : ''}</p></div>
        <div class="header-actions">${actions.join('')}</div>
      </section>
      ${a.status === 'CANCELADA' ? `<div class="alert alert-warning cal-alert" role="note">${UI.icon('ban')}<span><strong>Cancelada.</strong> Motivo: ${esc(a.cancel_reason)}</span></div>` : ''}
      ${a.overlaps.length ? `<div class="alert alert-warning cal-alert" role="note">${UI.icon('alert')}<div><p><strong>Traslape de horario:</strong>
        ${esc(a.responsible ? a.responsible.full_name : 'El responsable')} tiene ${a.overlaps.length === 1 ? 'otra actividad' : `${a.overlaps.length} actividades`} a la misma hora.</p>
        <ul class="cal-conflicts">${a.overlaps.map((o) => `<li><a href="#actividad/${o.id}">${esc(o.title)}</a> <span>${esc(CU().timeRange(o))}</span></li>`).join('')}</ul></div></div>` : ''}
      <div class="detail-grid">
        <div><section class="card panel"><h3 class="panel-title">Datos de la actividad</h3>
          <dl class="data-list">
            <dt>Cuándo</dt><dd>${esc(CU().longDay(a.activity_date))} ${esc(a.activity_date.slice(0, 4))} · <span class="nowrap">${esc(CU().timeRange(a))}</span></dd>
            <dt>Lugar</dt><dd>${esc(a.location || '—')}</dd>
            <dt>Responsable</dt><dd>${a.responsible ? esc(a.responsible.full_name) : '—'}</dd>
            <dt>Evento</dt><dd>${a.event ? (canEvent ? `<a class="strong-link" href="#evento/${a.event.id}">${esc(a.event.name)}</a>` : esc(a.event.name)) : '—'}</dd>
            <dt>Descripción</dt><dd class="pre-line">${esc(a.description || '—')}</dd>
            <dt>Registrada por</dt><dd>${a.created_by ? esc(a.created_by.full_name) : '—'} <span class="muted">el ${esc(Fechas.formatDateTime(a.created_at))}</span></dd>
          </dl>
          ${isAdmin ? `<p style="margin-top:12px"><a class="strong-link" href="#bitacora?objeto=${a.id}&entidad=activities">Ver su historial en la bitácora →</a></p>` : ''}
        </section></div>
        <div data-volunteers>${volunteersPanel(a, ctx)}</div>
      </div>`;

    const on = (sel, fn) => { const el = container.querySelector(sel); if (el) el.addEventListener('click', fn); };
    on('[data-edit]', () => ActividadForm.open({ activity: a, user: ctx.user, onSaved: reload }));
    on('[data-cancel-act]', () => cancelDialog(a, reload));
    on('[data-done]', async () => {
      if (await sendStatus(a, { to_status: 'REALIZADA' }, reload)) { UI.toast('Actividad marcada como realizada', 'success'); reload(); }
    });
    on('[data-reopen]', async () => {
      const ok = await UI.confirm({ title: a.status === 'CANCELADA' ? '¿Reprogramar la actividad?' : '¿Volver a programada?',
        message: a.status === 'CANCELADA' ? 'Vuelve a quedar programada en la misma fecha y hora; después puedes moverla.' : 'Úsalo si se marcó como realizada por error.',
        confirmText: a.status === 'CANCELADA' ? 'Reprogramar' : 'Volver a programada' });
      if (ok && await sendStatus(a, { to_status: 'PROGRAMADA' }, reload)) { UI.toast('Actividad programada', 'success'); reload(); }
    });
    on('[data-add]', () => addDialog(a, reload));
    container.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!await UI.confirm({ title: `¿Quitar a ${b.dataset.name}?`, message: 'Dejará de aparecer como convocado a esta actividad.', confirmText: 'Quitar', danger: true })) return;
      try {
        await UI.api(`/activities/${a.id}/volunteers/${b.dataset.remove}`, { method: 'DELETE' });
        UI.toast('Voluntario quitado', 'success');
        reload();
      } catch (err) { UI.toast(err.message, 'error'); }
    }));
  }

  return { mount, notFound };
})();
