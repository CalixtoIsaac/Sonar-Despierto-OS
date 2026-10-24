/**
 * Vista "Sin acceso": la persona abrió un módulo que no tiene asignado.
 */
const SinAcceso = (() => {
  function mount(container, { blocked }) {
    const label = blocked && blocked.module ? Access.MODULE_INFO[blocked.module]?.label : null;
    container.innerHTML = `
      <section class="card panel narrow" style="margin: 24px auto 0">
        <div class="empty-state">
          <span class="empty-icon">${UI.icon('lock')}</span>
          <h3>No tienes acceso a este módulo</h3>
          <p>${label ? `No tienes acceso al módulo <strong>${UI.escape(label)}</strong>. ` : ''}Pide al administrador que te lo asigne.</p>
          <a class="btn btn-primary btn-lg" href="#inicio">Volver al inicio</a>
        </div>
      </section>`;
  }

  return { mount };
})();
