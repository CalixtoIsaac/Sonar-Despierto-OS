/**
 * Vista "Reportes" (P05 adaptada, módulo REPORTES — Fase 7): dashboard de un evento con indicadores, avisos,
 * gráficas (cartas por estatus, avance semanal, por escuela, voluntarios, actividades e inventario),
 * comparativo de eventos y exportación a Excel (queda en la bitácora). Se actualiza sola cada minuto
 * mientras está a la vista. Parámetros: evento (id).
 *
 * Solo muestra conteos. Los avisos enlazan a los listados filtrados únicamente si la persona tiene ese módulo.
 */
const Reportes = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const G = () => ReportesUI;
  const REFRESH_MS = 60e3;

  function noEvents(container, ctx) {
    const canCreate = Access.canSee(ctx.user, Access.viewByKey('eventos'));
    container.innerHTML = `<section class="page-header"><div><h2>Reportes</h2>
        <p class="muted">Indicadores por evento: cartas, niñas y niños, voluntarios y logística.</p></div></section>
      <section class="card panel">${Components.empty({ iconName: 'chart', title: 'Aún no hay eventos',
        text: canCreate ? 'Crea el evento de Navidad para empezar a ver sus indicadores.' : 'Los indicadores aparecen cuando se registra el primer evento.',
        actionHtml: canCreate ? `<a class="btn btn-primary" href="#eventos">${UI.icon('calendarDays')}Ir a Eventos</a>` : '' })}</section>`;
  }

  const eventOption = (e) => `${e.name} · ${C().EVENT_STATUS_LABEL[e.status]}`;

  function alertsHtml(alerts, user) {
    if (!alerts.length) return '';
    const items = alerts.map((a) => {
      const view = Access.viewByKey(a.link.view);
      const href = view && Access.canSee(user, view) ? Access.buildHash(a.link.view, null, a.link.params) : null;
      return `<li class="rep-alert">${UI.icon('alert')}<span>${esc(a.text)}</span>${href ? `<a class="btn btn-outline btn-sm" href="${href}">Ver</a>` : ''}</li>`;
    }).join('');
    return `<section class="card panel rep-alerts" aria-label="Avisos"><h3 class="panel-title">Pendientes</h3><ul>${items}</ul></section>`;
  }

  function kpisHtml(d, user) {
    const L = d.letters;
    const canLetters = Access.canSee(user, Access.viewByKey('cartas'));
    const link = (estatus) => (canLetters ? Access.buildHash('cartas', null, { evento: d.event.id, estatus }) : undefined);
    if (!d.event.accepts_letters) {
      return `<div class="rep-kpis">
        ${G().kpi('Voluntarios confirmados', d.volunteers.confirmed, { iconName: 'users' })}
        ${G().kpi('Voluntarios postulados', d.volunteers.by_status.POSTULADO, { iconName: 'userPlus' })}
        ${G().kpi('Actividades ligadas', d.activities.total - d.activities.by_status.CANCELADA, { iconName: 'calendarRange' })}
        ${G().kpi('Unidades de inventario usadas', d.inventory.units_out, { iconName: 'boxes' })}</div>`;
    }
    return `<div class="rep-kpis">
      ${G().kpi('Cartas registradas', L.total, { iconName: 'mail', href: link(''), hint: `${G().num(d.children.with_letter)} niñas y niños` })}
      ${G().ring(L.with_sponsor_pct, 'Ya tienen padrino', L.with_sponsor, 'asignado', `${G().num(L.sponsors)} padrinos`)}
      ${G().ring(L.received_pct, 'Regalos recibidos', L.received_or_delivered, 'recibido')}
      ${G().ring(L.delivered_pct, 'Entregados', L.by_status.ENTREGADO, 'entregado')}
      ${G().kpi('Voluntarios confirmados', d.volunteers.confirmed, { iconName: 'users', hint: `${G().num(d.volunteers.by_status.POSTULADO)} postulados` })}
      ${G().kpi('Sin carta (con consentimiento)', d.children.eligible_without_letter, { iconName: 'baby', tone: d.children.eligible_without_letter ? 'rep-warn' : '' })}
      ${G().kpi('Sin consentimiento', d.children.without_consent, { iconName: 'shield', tone: d.children.without_consent ? 'rep-warn' : '' })}
    </div>`;
  }

  function lettersPanels(d) {
    if (!d.event.accepts_letters) {
      return `<section class="card panel"><p class="hint">${UI.icon('info')} Este evento no es de Navidad: no tiene cartas. Se muestran voluntarios, actividades e inventario.</p></section>`;
    }
    const L = d.letters;
    const schools = d.by_school.map((s) => ({ ...s, extra: `${G().pctText(s.delivered_pct)} entregado` }));
    const many = schools.length > 8;
    return `
      <section class="card panel">
        <div class="panel-head"><h3 class="panel-title">Cartas por estatus</h3>
          <span class="muted">${G().num(L.with_photo)} con foto · ${L.letters_per_sponsor === null ? 'sin padrinos aún' : `${String(L.letters_per_sponsor)} cartas por padrino en promedio`}${L.sponsors_at_limit ? ` · ${G().num(L.sponsors_at_limit)} ${L.sponsors_at_limit === 1 ? 'padrino llegó' : 'padrinos llegaron'} al límite de ${L.max_letters_per_sponsor}` : ''}</span></div>
        ${G().statusBar(L.by_status, L.total)}
      </section>
      <div class="detail-grid rep-grid">
        <section class="card panel">
          <div class="panel-head"><h3 class="panel-title">Avance semanal</h3><span class="muted">Estatus al cierre de cada semana</span></div>
          ${G().weeklyColumns(d.timeline)}
        </section>
        <section class="card panel">
          <div class="panel-head"><h3 class="panel-title">Por escuela</h3><span class="muted">${G().num(d.schools.participating)} de ${G().num(d.schools.active)} escuelas</span></div>
          ${G().stackedRows(many ? schools.slice(0, 8) : schools)}
          ${many ? `<details class="rep-more"><summary>Ver las ${schools.length - 8} restantes</summary>${G().stackedRows(schools.slice(8))}</details>` : ''}
        </section>
      </div>`;
  }

  function sidePanels(d) {
    const V = d.volunteers;
    const A = d.activities;
    const I = d.inventory;
    const sizes = C().SHIRT_SIZES.filter((s) => V.shirt_sizes[s] > 0).map((s) => `<span class="badge badge-plain">${esc(s)} · ${V.shirt_sizes[s]}</span>`).join('');
    return `
      <div class="detail-grid rep-grid">
        <section class="card panel">
          <div class="panel-head"><h3 class="panel-title">Voluntarios del evento</h3>
            <span class="muted">${G().num(V.active)} activos en total</span></div>
          <p class="field-label">Confirmados por área</p>
          ${G().barList(C().VOLUNTEER_AREAS.map((a) => [C().VOLUNTEER_AREA_LABEL[a], V.confirmed_by_area[a]]), { tone: 'secondary' })}
          <dl class="rep-inline">${C().PARTICIPATION_STATUSES.map((s) => `<div><dt>${esc(C().PARTICIPATION_STATUS_LABEL[s])}</dt><dd>${G().num(V.by_status[s])}</dd></div>`).join('')}</dl>
          ${sizes ? `<p class="field-label">Playeras de los confirmados</p><p class="pill-list">${sizes}</p>` : ''}
        </section>
        <section class="card panel">
          <div class="panel-head"><h3 class="panel-title">Actividades y logística</h3></div>
          <p class="field-label">Actividades del calendario (sin canceladas)</p>
          ${G().barList(C().ACTIVITY_TYPES.map((t) => [C().ACTIVITY_TYPE_LABEL[t], A.by_type[t]]), { tone: 'info' })}
          ${A.upcoming.length ? `<p class="field-label">Próximas</p><ul class="rep-upcoming">${A.upcoming.map((a) => `<li>
              <a class="strong-link" href="#actividad/${a.id}">${esc(a.title)}</a>
              <span class="muted">${esc(Fechas.formatDate(a.activity_date))} · ${esc(a.start_time)}–${esc(a.end_time)}</span></li>`).join('')}</ul>` : ''}
          <p class="field-label">Inventario usado en el evento</p>
          ${I.items.length ? G().barList(I.items.slice(0, 6).map((x) => [x.name, x.out]), { tone: 'sun' })
            + (I.items.length > 6 ? `<p class="hint">Y ${I.items.length - 6} artículos más (en el Excel).</p>` : '')
            + `<p class="hint">${G().num(I.units_in)} unidades recibidas y ${G().num(I.units_out)} usadas con este evento.</p>`
            : '<p class="muted">No hay movimientos de inventario ligados a este evento.</p>'}
        </section>
      </div>`;
  }

  function comparisonHtml(items, currentId) {
    if (items.length < 2) return '';
    const rows = items.map((e) => `<tr${e.id === currentId ? ' class="rep-current"' : ''}>
        <td><a class="strong-link" href="#reportes?evento=${e.id}">${esc(e.name)}</a><br><span class="muted">${esc(Fechas.formatDate(e.event_date))}</span></td>
        <td>${CartasUI.eventBadge(e.status)}</td>
        <td class="num">${e.accepts_letters ? G().num(e.letters_total) : '—'}</td>
        <td class="num">${e.accepts_letters ? G().pctText(e.with_sponsor_pct) : '—'}</td>
        <td class="num">${e.accepts_letters ? G().pctText(e.delivered_pct) : '—'}</td>
        <td class="num">${G().num(e.volunteers_confirmed)}</td>
        <td class="num">${G().num(e.activities)}</td></tr>`).join('');
    return `<section class="card panel section-gap"><h3 class="panel-title">Comparativo de eventos</h3>
      <div class="table-wrap"><table class="table table-compact">
        <thead><tr><th>Evento</th><th>Estatus</th><th class="num">Cartas</th><th class="num">Con padrino</th><th class="num">Entregado</th>
          <th class="num">Voluntarios</th><th class="num">Actividades</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  async function exportExcel(btn, eventId) {
    UI.setBusy(btn, true);
    try {
      await UI.download(`/reports/dashboard/export${UI.buildQuery({ event_id: eventId })}`, 'reporte.xlsx');
      UI.toast('Reporte de Excel descargado. Quedó registrado en la bitácora.', 'success');
    } catch (err) { UI.toast(err.message, 'error'); } finally { UI.setBusy(btn, false); }
  }

  async function mount(container, ctx) {
    container.innerHTML = Components.loading(6);
    let options;
    try { options = await UI.api('/reports/options'); } catch (err) { Components.error(container, err, () => mount(container, ctx)); return; }
    if (!options.events.length) { noEvents(container, ctx); return; }
    let eventId = Number(ctx.params.evento);
    if (!options.events.some((e) => e.id === eventId)) {
      eventId = options.default_event_id;
      ctx.navigate({ ...ctx.params, evento: String(eventId) }, { push: false });
    }

    container.innerHTML = `
      <section class="page-header">
        <div><h2>Reportes</h2><p class="muted">Indicadores del evento con los datos registrados en este momento.</p></div>
        <div class="header-actions">
          <button type="button" class="btn btn-outline" data-refresh>${UI.icon('refresh')}Actualizar</button>
          <button type="button" class="btn btn-primary" data-export>${UI.icon('download')}Exportar a Excel</button>
        </div>
      </section>
      <section class="card panel event-bar">
        <label class="filter event-select"><span class="filter-label">Evento</span><span class="select-wrap"><select class="input select" data-event>
          ${options.events.map((e) => `<option value="${e.id}"${e.id === eventId ? ' selected' : ''}>${esc(eventOption(e))}</option>`).join('')}
        </select></span></label>
        <p class="event-bar-info" data-info></p>
      </section>
      <div data-body aria-live="polite">${Components.loading(6)}</div>`;

    const body = container.querySelector('[data-body]');
    const info = container.querySelector('[data-info]');
    let timer = null;
    let loading = false;

    async function load({ quiet = false } = {}) {
      if (loading) return;
      loading = true;
      if (!quiet) body.innerHTML = Components.loading(6);
      try {
        const [d, cmp] = await Promise.all([
          UI.api(`/reports/dashboard${UI.buildQuery({ event_id: eventId })}`),
          UI.api('/reports/events')
        ]);
        if (!body.isConnected) return;
        info.innerHTML = `${CartasUI.eventBadge(d.event.status)} <span class="muted">${esc(C().EVENT_TYPE_LABEL[d.event.event_type])} · ${esc(Fechas.formatDate(d.event.event_date))}${d.event.location ? ` · ${esc(d.event.location)}` : ''}</span>
          <span class="rep-updated muted" data-updated>Actualizado ${esc(Fechas.formatDateTime(d.generated_at))}</span>`;
        body.innerHTML = `${alertsHtml(d.alerts, ctx.user)}${kpisHtml(d, ctx.user)}${lettersPanels(d)}${sidePanels(d)}${comparisonHtml(cmp.items, d.event.id)}`;
        // En pantallas angostas el avance semanal se desplaza: se muestra la semana más reciente
        body.querySelectorAll('.rep-columns').forEach((el) => { el.scrollLeft = el.scrollWidth; });
      } catch (err) {
        if (!body.isConnected) return;
        if (quiet) UI.toast(err.message, 'error'); else Components.error(body, err, () => load());
      } finally { loading = false; }
    }

    container.querySelector('[data-event]').addEventListener('change', (e) => {
      eventId = Number(e.target.value);
      ctx.navigate({ evento: String(eventId) });
      load();
    });
    container.querySelector('[data-refresh]').addEventListener('click', () => load());
    container.querySelector('[data-export]').addEventListener('click', (e) => exportExcel(e.currentTarget, eventId));

    timer = setInterval(() => {
      if (!body.isConnected) { clearInterval(timer); return; }
      if (document.visibilityState === 'visible') load({ quiet: true });
    }, REFRESH_MS);
    await load();
  }

  return { mount };
})();
