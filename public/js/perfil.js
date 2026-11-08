/**
 * Vista "Mi perfil": nombre, apellidos y teléfono editables; color de los botones principales;
 * correo, rol y módulos de solo lectura.
 */
const Perfil = (() => {
  const F = () => Components.form;
  const FIELDS = [
    { name: 'first_name', label: 'Nombre(s)', required: true, max: 80, autocomplete: 'given-name' },
    { name: 'last_name', label: 'Apellidos', required: true, max: 120, autocomplete: 'family-name' },
    { name: 'phone', label: 'Teléfono', type: 'tel', inputmode: 'tel', hint: '10 dígitos. Déjalo vacío para borrarlo.', autocomplete: 'tel' }
  ];
  // Mismo catálogo que ACCENT_COLORS (lib/catalogs.js); los tonos están en css/theme.css
  const ACCENTS = [
    ['CORAL', 'Coral', 'predeterminado'], ['NARANJA', 'Naranja'], ['ROSA', 'Rosa'], ['MORADO', 'Morado'],
    ['AZUL', 'Azul'], ['TURQUESA', 'Turquesa'], ['VERDE', 'Verde'], ['GRAFITO', 'Grafito']
  ];

  function accentPicker(selected) {
    const current = ACCENTS.some(([key]) => key === selected) ? selected : 'CORAL';
    return `
      <fieldset class="accent-picker" id="accentPicker">
        <legend>Color de los botones principales</legend>
        <div class="accent-grid">
          ${ACCENTS.map(([key, label, note]) => `
            <label class="accent-option" data-accent="${key}">
              <input type="radio" name="accent_color" value="${key}" ${key === current ? 'checked' : ''}>
              <span class="accent-dot" aria-hidden="true">${UI.icon('check')}</span>
              <span class="accent-label">${UI.escape(label)}${note ? `<small>${UI.escape(note)}</small>` : ''}</span>
            </label>`).join('')}
        </div>
        <p class="muted accent-hint">El cambio se ve al instante y se guarda en tu cuenta: lo verás igual en cualquier equipo donde inicies sesión.</p>
      </fieldset>
      <div class="accent-preview" aria-hidden="true">
        <span class="muted">Vista previa:</span>
        <span class="btn btn-primary">Guardar cambios</span>
        <span class="badge accent-preview-soft">Seleccionado</span>
      </div>`;
  }

  function bindAccent(container, ctx) {
    const picker = container.querySelector('#accentPicker');
    let saved = ctx.user.accent_color || 'CORAL';
    let pending = Promise.resolve();
    picker.addEventListener('change', (e) => {
      if (e.target.name !== 'accent_color') return;
      const value = e.target.value;
      SDTheme.setAccent(value);                       // vista previa inmediata
      pending = pending.then(async () => {
        if (value === saved) return;
        try {
          const out = await UI.api('/auth/me', { method: 'PATCH', body: { accent_color: value } });
          saved = out.user.accent_color;
          ctx.user = out.user;
          ctx.onUserChange({ user: out.user });
          UI.toast('Color guardado', 'success');
        } catch (err) {
          // Se regresa al color que sí quedó guardado
          SDTheme.setAccent(saved);
          const back = picker.querySelector(`input[value="${saved}"]`);
          if (back) back.checked = true;
          UI.toast(err.message, 'error');
        }
      });
    });
  }

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
        <h3 class="panel-title">Apariencia</h3>
        ${accentPicker(user.accent_color)}
      </section>
      <section class="card panel narrow">
        <h3 class="panel-title">Tu cuenta</h3>
        ${readOnly(user)}
      </section>`;

    bindAccent(container, ctx);
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
