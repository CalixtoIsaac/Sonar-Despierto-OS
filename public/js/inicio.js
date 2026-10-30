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
      </section>`;
    if (user.role === 'ADMIN') showPending(container);
  }

  return { mount };
})();
