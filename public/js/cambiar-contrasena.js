/**
 * Vista "Cambiar contraseña". Es obligatoria (y la única disponible) cuando la cuenta
 * tiene una contraseña temporal: must_change_password = true.
 */
const CambiarContrasena = (() => {
  const LEVEL_LABEL = { 1: 'Débil', 2: 'Aceptable', 3: 'Fuerte' };
  const FIELDS = [
    { name: 'current_password', label: 'Contraseña actual', autocomplete: 'current-password' },
    { name: 'new_password', label: 'Nueva contraseña', autocomplete: 'new-password' },
    { name: 'confirm_password', label: 'Confirma la nueva contraseña', autocomplete: 'new-password' }
  ];

  function fieldHtml(f) {
    return `
      <div class="field">
        <label for="cp-${f.name}">${f.label}</label>
        <input class="input" id="cp-${f.name}" name="${f.name}" type="password" autocomplete="${f.autocomplete}"
               aria-describedby="cp-${f.name}-error">
        ${f.name === 'new_password' ? `
          <div class="strength" id="cpStrength" data-level="1" aria-live="polite">
            <div class="strength-bars" aria-hidden="true"><span></span><span></span><span></span></div>
            <p>Seguridad: <strong>Débil</strong></p>
          </div>` : ''}
        <p class="field-error" id="cp-${f.name}-error" hidden></p>
      </div>`;
  }

  function mount(container, { user, onUserChange }) {
    const forced = Boolean(user.must_change_password);
    container.innerHTML = `
      <section class="page-header"><div><h2>Cambiar contraseña</h2></div></section>
      <section class="card panel narrow">
        <form class="form" id="cpForm" novalidate>
          ${forced ? `<div class="alert alert-warning" role="status">${UI.icon('shield')}<span>Por seguridad, cambia tu contraseña temporal antes de continuar.</span></div>` : ''}
          ${FIELDS.map(fieldHtml).join('')}
          <p class="hint">${UI.escape(Access.PASSWORD_POLICY_MESSAGE)}</p>
          <div class="alert alert-error" id="cpAlert" role="alert" hidden></div>
          <div><button class="btn btn-primary btn-lg" type="submit">Cambiar contraseña</button></div>
        </form>
      </section>`;

    const form = container.querySelector('#cpForm');
    const value = (name) => form.elements[name].value;
    const alertBox = container.querySelector('#cpAlert');

    function setError(name, message) {
      const input = form.elements[name];
      const box = container.querySelector(`#cp-${name}-error`);
      box.textContent = message || '';
      box.hidden = !message;
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }

    form.elements.new_password.addEventListener('input', () => {
      const level = Access.passwordStrength(value('new_password'));
      const meter = container.querySelector('#cpStrength');
      meter.dataset.level = String(level);
      meter.querySelector('strong').textContent = LEVEL_LABEL[level];
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.hidden = true;
      const current = value('current_password');
      const next = value('new_password');
      const errors = {
        current_password: current ? '' : 'Escribe tu contraseña actual.',
        new_password: !Access.meetsPasswordPolicy(next) ? Access.PASSWORD_POLICY_MESSAGE
          : next === current ? 'La nueva contraseña debe ser distinta de la actual.' : '',
        confirm_password: value('confirm_password') !== next ? 'Las contraseñas no coinciden.' : ''
      };
      for (const [name, msg] of Object.entries(errors)) setError(name, msg);
      const firstInvalid = Object.keys(errors).find((k) => errors[k]);
      if (firstInvalid) { form.elements[firstInvalid].focus(); return; }

      const button = form.querySelector('[type="submit"]');
      UI.setBusy(button, true);
      try {
        const session = await UI.api('/auth/change-password', {
          method: 'POST',
          body: { current_password: current, new_password: next }
        });
        onUserChange(session);
        UI.toast('Contraseña actualizada', 'success');
        location.hash = '#inicio'; // la URL siempre es #cambiar-contrasena aquí: dispara la navegación
      } catch (err) {
        UI.setBusy(button, false);
        if (err.code === 'INVALID_CURRENT_PASSWORD') setError('current_password', err.message);
        else if (err.code === 'PASSWORD_REUSED') setError('new_password', err.message);
        else {
          alertBox.textContent = err.message;
          alertBox.hidden = false;
        }
      }
    });

    form.elements.current_password.focus();
  }

  return { mount };
})();
