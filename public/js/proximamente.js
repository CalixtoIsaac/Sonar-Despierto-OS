/**
 * Pantalla provisional de un módulo que llega en una fase posterior.
 */
const Proximamente = (() => {
  function mount(container, { view }) {
    const info = view.module ? Access.MODULE_INFO[view.module] : null;
    const description = view.description || (info && info.description) || '';
    const phase = view.phase || (info && info.phase);
    container.innerHTML = `
      <section class="page-header"><div><h2>${UI.escape(view.label)}</h2></div></section>
      <section class="card panel">
        <div class="empty-state">
          <span class="empty-icon">${UI.icon('sparkles')}</span>
          <p style="font-size: 18px">${UI.escape(description)}</p>
          ${phase ? `<span class="badge badge-sun">Próximamente · Fase ${phase}</span>` : ''}
        </div>
      </section>`;
  }

  return { mount };
})();
