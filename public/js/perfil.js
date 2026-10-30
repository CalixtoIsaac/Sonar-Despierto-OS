/**
 * Vista "Mi perfil": nombre, apellidos y teléfono editables; correo, rol y módulos de solo lectura.
 */
const Perfil = (() => {
  const F = () => Components.form;
  const FIELDS = [
    { name: 'first_name', label: 'Nombre(s)', required: true, max: 80, autocomplete: 'given-name' },
    { name: 'last_name', label: 'Apellidos', required: true, max: 120, autocomplete: 'family-name' },
    { name: 'phone', label: 'Teléfono', type: 'tel', inputmode: 'tel', hint: '10 dígitos. Déjalo vacío para borrarlo.', autocomplete: 'tel' }
  ];

  function readOnly(user) {
    const modules = user.modules.length
      ? `<span class="pill-list">${user.modules.map((m) => `<span class="badge badge-plain">${UI.escape(Access.MODULE_INFO[m]?.label || m)}</span>`).join('')}</span>`
      : '<span class="muted">Sin módulos asignados</span>';
    return `
      <dl class="data-list">
        <dt>Correo</dt><dd>${UI.escape(user.email)}</dd>
        <dt>Rol</dt><dd>${UI.escape(Access.ROLE_LABEL[user.role] || user.role)}</dd>
        <dt>Módulos</dt><dd>${modules}</dd>
        <dt>Último acceso</dt><dd>${user.last_login_at ? UI.escape(Fechas.formatDateTime(user.last_login_at)) : 'Este es tu primer acceso'}</dd>
      </dl>`;
  }

  function mount(container, ctx) {
    const { user } = ctx;
    container.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Mi perfil</h2>
          <p class="muted">Actualiza tus datos de contacto. El correo, el rol y los módulos los administra la coordinación.</p>
        </div>
        <a class="btn btn-outline" href="#cambiar-contrasena">${UI.icon('key')}Cambiar contraseña</a>
      </section>
      <section class="card panel narrow">
        <h3 class="panel-title">Tus datos</h3>
        <form class="form" id="profileForm" novalidate>
          ${F().field(FIELDS[0], user.first_name)}
          ${F().field(FIELDS[1], user.last_name)}
          ${F().field(FIELDS[2], user.phone ? Phone.format(user.phone) : '')}
          <div class="alert alert-error" id="profileAlert" role="alert" hidden></div>
          <div><button class="btn btn-primary" type="submit">Guardar cambios</button></div>
        </form>
      </section>
      <section class="card panel narrow">
        <h3 class="panel-title">Tu cuenta</h3>
        ${readOnly(user)}
      </section>`;

    const form = container.querySelector('#profileForm');
    const alertBox = container.querySelector('#profileAlert');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.hidden = true;
      F().clearErrors(form);
      const v = F().read(form, FIELDS);
      const errors = [];
      if (!v.first_name) errors.push({ field: 'first_name', message: 'Este campo es obligatorio.' });
      if (!v.last_name) errors.push({ field: 'last_name', message: 'Este campo es obligatorio.' });
      if (v.phone && !Phone.isValid(v.phone)) errors.push({ field: 'phone', message: 'El teléfono debe tener 10 dígitos.' });
      if (errors.length) { F().showErrors(form, errors); return; }

      const body = {};
      if (v.first_name !== user.first_name) body.first_name = v.first_name;
      if (v.last_name !== user.last_name) body.last_name = v.last_name;
      const phone = v.phone ? Phone.normalize(v.phone) : null;
      if (phone !== (user.phone || null)) body.phone = phone;
      if (!Object.keys(body).length) { UI.toast('No hay cambios que guardar'); return; }

      const button = form.querySelector('[type="submit"]');
      UI.setBusy(button, true);
      try {
        const out = await UI.api('/auth/me', { method: 'PATCH', body });
        ctx.onUserChange({ user: out.user });
        UI.toast('Perfil actualizado', 'success');
        mount(container, { ...ctx, user: out.user });
      } catch (err) {
        UI.setBusy(button, false);
        const rest = err.details ? F().showErrors(form, err.details) : [err];
        if (rest.length) { alertBox.textContent = err.message; alertBox.hidden = false; }
      }
    });
  }

  return { mount };
})();
