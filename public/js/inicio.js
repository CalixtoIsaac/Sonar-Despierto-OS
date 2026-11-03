/**
 * Vista "Inicio": saludo y tarjetas de los módulos a los que la persona tiene acceso.
 */
const Inicio = (() => {
  function greeting() {
    const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }));
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  function card(view) {
    const info = view.module ? Access.MODULE_INFO[view.module] : null;
    const description = view.description || (info && info.description) || '';
    const phase = view.ready ? null : (view.phase || (info && info.phase));
    return `
      <a class="module-card" href="#${view.key}">
        <span class="module-card-head">
          <span class="module-card-icon">${UI.icon(view.icon)}</span>
          <span class="module-card-title">${UI.escape(view.label)}</span>
        </span>
        ${description ? `<p>${UI.escape(description)}</p>` : ''}
        ${phase ? `<span><span class="badge badge-sun">Próximamente · Fase ${phase}</span></span>` : ''}
      </a>`;
  }

  async function showPending(container) {
    const slot = container.querySelector('#pendingSlot');
    try {
      const { pending } = await UI.api('/users/summary');
      if (!pending || !slot.isConnected) return;
      slot.innerHTML = `
        <section class="card panel callout" role="status">
          <span class="callout-icon">${UI.icon('userCheck')}</span>
          <p>Tienes <strong>${pending}</strong> ${pending === 1 ? 'solicitud' : 'solicitudes'} de cuenta por revisar.</p>
          <a class="btn btn-primary" href="#usuarios?tab=solicitudes">Revisar</a>
        </section>`;
    } catch { /* el aviso no es crítico */ }
  }

  /** Próximas actividades de la persona (14 días) si tiene el Calendario. */
  async function showUpcoming(container) {
    const slot = container.querySelector('#upcomingSlot');
    const from = Fechas.todayLocal();
    try {
      const { items } = await UI.api(`/activities${UI.buildQuery({ date_from: from, date_to: CalendarioUI.addDays(from, 13),
        responsible_id: 'me', status: 'PROGRAMADA' })}`);
      if (!slot.isConnected) return;
      const list = items.slice(0, 5);
      slot.innerHTML = `<section class="card panel section-gap">
        <div class="panel-head"><h3 class="panel-title">Tus próximas actividades</h3>
          <a class="btn btn-outline btn-sm" href="#calendario?resp=me&vista=agenda">${UI.icon('calendarRange')}Ver calendario</a></div>
        ${list.length ? `<ul class="cal-agenda-list upcoming-list cal-agenda-wide">${list.map((a) => `<li><a class="cal-agenda-item" href="#actividad/${a.id}">
            <span class="cal-agenda-time">${UI.escape(Fechas.formatDate(a.activity_date).replace(/ \d{4}$/, ''))}<span class="muted">${UI.escape(CalendarioUI.timeRange(a))}</span></span>
            <span class="cal-agenda-main"><strong>${UI.escape(a.title)}</strong><span class="cal-agenda-meta">${CalendarioUI.typeChip(a.activity_type)}${a.has_overlap ? CalendarioUI.overlapBadge() : ''}</span>
            ${a.location ? `<span class="muted">${UI.escape(a.location)}</span>` : ''}</span></a></li>`).join('')}</ul>`
          : '<p class="muted">No tienes actividades a tu cargo en las próximas dos semanas.</p>'}
      </section>`;
    } catch { /* el resumen no es crítico */ }
  }

  /** Aviso de existencias bajas si tiene el Inventario. */
  async function showLowStock(container) {
    const slot = container.querySelector('#lowStockSlot');
    try {
      const s = await UI.api('/inventory/summary');
      if (!s.low_stock || !slot.isConnected) return;
      slot.innerHTML = `
        <section class="card panel callout section-gap" role="status">
          <span class="callout-icon">${UI.icon('boxes')}</span>
          <p><strong>${s.low_stock}</strong> ${s.low_stock === 1 ? 'artículo está' : 'artículos están'} por debajo de su existencia mínima.</p>
          <a class="btn btn-outline" href="#inventario?existencia=bajo">Ver inventario</a>
        </section>`;
    } catch { /* el aviso no es crítico */ }
  }

  function mount(container, { user }) {
    const items = Access.visibleMenu(user).filter((v) => v.module || v.adminOnly);
    container.innerHTML = `
      <div id="pendingSlot"></div>
      <section class="page-header">
        <div>
          <h2>${greeting()}, ${UI.escape(user.first_name)}</h2>
          <p class="muted">Estos son los módulos a los que tienes acceso.</p>
        </div>
      </section>
      <section class="card panel">
        <h3 class="panel-title">Tus módulos</h3>
        ${items.length
          ? `<div class="module-grid">${items.map(card).join('')}</div>`
          : `<div class="empty-state">
               <span class="empty-icon">${UI.icon('inbox')}</span>
               <h3>Aún no tienes módulos asignados</h3>
               <p class="muted">Pide al administrador que te habilite los que necesites.</p>
             </div>`}
      </section>
      <div id="upcomingSlot"></div>
      <div id="lowStockSlot"></div>`;
    if (user.role === 'ADMIN') showPending(container);
    if (Access.canSee(user, Access.viewByKey('calendario'))) showUpcoming(container);
    if (Access.canSee(user, Access.viewByKey('inventario'))) showLowStock(container);
  }

  return { mount };
})();
