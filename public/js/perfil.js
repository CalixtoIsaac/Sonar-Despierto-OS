/**
 * Vista "Mi perfil": datos de la cuenta (solo lectura en la Fase 1).
 */
const Perfil = (() => {
  function mount(container, { user }) {
    const modules = user.modules.length
      ? `<span class="pill-list">${user.modules.map((m) => `<span class="badge badge-plain">${UI.escape(Access.MODULE_INFO[m]?.label || m)}</span>`).join('')}</span>`
      : '<span class="muted">Sin módulos asignados</span>';

    container.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Mi perfil</h2>
          <p class="muted">Datos de tu cuenta. Solo el administrador puede cambiarlos.</p>
        </div>
        <a class="btn btn-outline" href="#cambiar-contrasena">${UI.icon('key')}Cambiar contraseña</a>
      </section>
      <section class="card panel narrow">
        <dl class="data-list">
          <dt>Nombre</dt><dd>${UI.escape(`${user.first_name} ${user.last_name}`)}</dd>
          <dt>Correo</dt><dd>${UI.escape(user.email)}</dd>
          <dt>Rol</dt><dd>${UI.escape(Access.ROLE_LABEL[user.role] || user.role)}</dd>
          <dt>Módulos</dt><dd>${modules}</dd>
          <dt>Último acceso</dt><dd>${user.last_login_at ? UI.escape(UI.formatDate(user.last_login_at)) : 'Este es tu primer acceso'}</dd>
        </dl>
      </section>`;
  }

  return { mount };
})();
