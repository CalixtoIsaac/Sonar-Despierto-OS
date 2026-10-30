/**
 * Página /registro: el personal solicita su propia cuenta (ADR-0008). La cuenta queda pendiente
 * hasta que un administrador la aprueba. La contraseña solo vive en el formulario.
 */
(() => {
  const root = document.getElementById('regRoot');
  const F = Components.form;

  if (UI.getToken()) {
    location.replace('/app');
    return;
  }
  UI.hydrateIcons(document);
  UI.hydrateLogos(document);

  const MSG = {
    required: 'Este campo es obligatorio.',
    phone: 'El teléfono debe tener 10 dígitos.',
    email: 'Escribe un correo electrónico válido.',
    mismatch: 'Las contraseñas no coinciden.',
    consent: 'Debes aceptar el compromiso de confidencialidad.',
    max: (n) => `Máximo ${n} caracteres.`
  };

  function passwordField(name, label, autocomplete) {
    return `<div class="field" data-field="${name}">
      <label for="reg-${name}">${label} <span class="req" aria-hidden="true">*</span></label>
      <div class="input-group">
        <input class="input" id="reg-${name}" name="${name}" type="password" autocomplete="${autocomplete}"
               aria-describedby="reg-${name}-error" aria-required="true">
        <button class="input-addon" type="button" data-toggle-password="reg-${name}"></button>
      </div>
      <p class="field-error" id="reg-${name}-error" hidden></p>
    </div>`;
  }

  function renderForm() {
    root.innerHTML = `
      <form id="regForm" class="form" novalidate>
        <fieldset class="form-section">
          <legend>Tus datos</legend>
          <div class="form-grid">
            ${F.field({ name: 'first_name', label: 'Nombre(s)', required: true, max: 80, autocomplete: 'given-name' })}
            ${F.field({ name: 'last_name', label: 'Apellidos', required: true, max: 120, autocomplete: 'family-name' })}
            ${F.field({ name: 'phone', label: 'Teléfono', type: 'tel', required: true, inputmode: 'tel', hint: '10 dígitos', autocomplete: 'tel' })}
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend>Tu cuenta</legend>
          ${F.field({ name: 'email', label: 'Correo electrónico', type: 'email', required: true, max: 255, autocomplete: 'email' })}
          ${passwordField('password', 'Contraseña', 'new-password')}
          <p class="hint">${UI.escape(Access.PASSWORD_POLICY_MESSAGE)}</p>
          ${passwordField('confirm', 'Confirmar contraseña', 'new-password')}
        </fieldset>

        <fieldset class="form-section">
          <legend>¿Con qué módulos vas a colaborar?</legend>
          <p class="hint">Marca los que necesitas. El administrador decidirá cuáles te habilita; si no estás seguro, puedes dejarlo en blanco.</p>
          <div id="regModules"></div>
          <p class="field-error" id="regModulesError" hidden></p>
        </fieldset>

        <fieldset class="form-section">
          <legend>Comentario para el administrador (opcional)</legend>
          <div class="field" data-field="note">
            <label class="sr-only" for="reg-note">Comentario</label>
            <textarea class="input textarea" id="reg-note" name="note" rows="3" maxlength="500"
              placeholder="Ej. Coordino el acopio de regalos de la zona norte." aria-describedby="reg-note-count reg-note-error"></textarea>
            <p class="hint counter" id="reg-note-count">0/500</p>
            <p class="field-error" id="reg-note-error" hidden></p>
          </div>
        </fieldset>

        ${F.field({ name: 'accepts_confidentiality', type: 'checkbox', required: true,
          label: 'Me comprometo a usar la información del sistema —en especial la de niñas y niños— solo para las actividades de Soñar Despierto y a no compartirla.' })}

        <div class="alert alert-error" id="regAlert" role="alert" hidden></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Enviar solicitud</button>
      </form>`;

    const form = root.querySelector('#regForm');
    const picker = Components.modulePicker(root.querySelector('#regModules'), { idPrefix: 'reg-mod' });
    Components.passwordStrength(form.elements.password);
    bindPasswordToggles(form);
    const note = form.elements.note;
    note.addEventListener('input', () => { root.querySelector('#reg-note-count').textContent = `${[...note.value].length}/500`; });
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(form, picker); });
    form.elements.first_name.focus();
  }

  function bindPasswordToggles(scope) {
    scope.querySelectorAll('[data-toggle-password]').forEach((btn) => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const update = () => {
        const visible = input.type === 'text';
        btn.innerHTML = UI.icon(visible ? 'eyeOff' : 'eye');
        btn.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
      };
      btn.addEventListener('click', () => { input.type = input.type === 'password' ? 'text' : 'password'; update(); input.focus(); });
      update();
    });
  }

  /** Mismas reglas que el servidor (lib/validation.js); devuelve [{ field, message }]. */
  function validate(v) {
    const errors = [];
    const add = (field, message) => errors.push({ field, message });
    if (!v.first_name) add('first_name', MSG.required);
    else if ([...v.first_name].length > 80) add('first_name', MSG.max(80));
    if (!v.last_name) add('last_name', MSG.required);
    else if ([...v.last_name].length > 120) add('last_name', MSG.max(120));
    if (!v.phone) add('phone', MSG.required);
    else if (!Phone.isValid(v.phone)) add('phone', MSG.phone);
    if (!v.email) add('email', MSG.required);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) add('email', MSG.email);
    if (!v.password) add('password', MSG.required);
    else if (!Access.meetsPasswordPolicy(v.password)) add('password', Access.PASSWORD_POLICY_MESSAGE);
    if (!v.confirm) add('confirm', MSG.required);
    else if (v.confirm !== v.password) add('confirm', MSG.mismatch);
    if (v.note && [...v.note].length > 500) add('note', MSG.max(500));
    if (!v.accepts_confidentiality) add('accepts_confidentiality', MSG.consent);
    return errors;
  }

  async function submit(form, picker) {
    const alertBox = root.querySelector('#regAlert');
    alertBox.hidden = true;
    F.clearErrors(form);
    const v = {
      first_name: form.elements.first_name.value.trim(),
      last_name: form.elements.last_name.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      password: form.elements.password.value,
      confirm: form.elements.confirm.value,
      note: form.elements.note.value.trim(),
      accepts_confidentiality: form.elements.accepts_confidentiality.checked
    };
    const errors = validate(v);
    if (errors.length) { F.showErrors(form, errors); return; }

    const button = form.querySelector('[type="submit"]');
    UI.setBusy(button, true);
    try {
      const out = await UI.api('/auth/register', {
        method: 'POST',
        redirectOn401: false,
        body: {
          first_name: v.first_name, last_name: v.last_name, phone: Phone.normalize(v.phone), email: v.email,
          password: v.password, requested_modules: picker.getValue(), note: v.note || null,
          accepts_confidentiality: true
        }
      });
      renderSuccess(out.email);
    } catch (err) {
      UI.setBusy(button, false);
      if (err.code === 'EMAIL_ALREADY_EXISTS') F.showErrors(form, [{ field: 'email', message: err.message }]);
      else if (err.code === 'VALIDATION_ERROR' && err.details) {
        const rest = F.showErrors(form, err.details.map((d) => (d.field === 'requested_modules' ? { ...d, field: '__modules' } : d)));
        const mod = err.details.find((d) => d.field === 'requested_modules');
        if (mod) { const box = root.querySelector('#regModulesError'); box.textContent = mod.message; box.hidden = false; }
        if (rest.length > (mod ? 1 : 0)) { alertBox.textContent = err.message; alertBox.hidden = false; }
      } else {
        alertBox.innerHTML = UI.icon('alert') + `<span>${UI.escape(err.message)}</span>`;
        alertBox.hidden = false;
      }
    }
  }

  function renderSuccess(email) {
    root.innerHTML = `
      <section class="card panel success-panel" role="status">
        <span class="empty-icon">${UI.icon('mail')}</span>
        <h2>¡Solicitud enviada!</h2>
        <p>Registramos tu solicitud con el correo <strong>${UI.escape(email)}</strong>. Cuando un administrador la apruebe
          podrás iniciar sesión con ese correo y la contraseña que elegiste. Si es urgente, avísale a la coordinación.</p>
        <a class="btn btn-primary btn-lg" href="/">Ir a iniciar sesión</a>
      </section>`;
    root.querySelector('a').focus();
  }

  function renderDisabled() {
    root.innerHTML = `
      <div class="alert alert-info" role="status">${UI.icon('info')}
        <span>El registro de cuentas está desactivado. Pide al administrador del sistema que te cree una cuenta.</span></div>
      <p style="margin-top:16px"><a class="btn btn-outline" href="/">${UI.icon('arrowLeft')}Volver a iniciar sesión</a></p>`;
  }

  async function init() {
    root.innerHTML = '<div class="empty-state"><span class="spinner" aria-label="Cargando"></span></div>';
    try {
      const info = await UI.api('/auth/registration-info', { redirectOn401: false });
      if (info.enabled) renderForm(); else renderDisabled();
    } catch (err) {
      root.innerHTML = `<div class="alert alert-error" role="alert">${UI.icon('alert')}<span>${UI.escape(err.message)}</span></div>
        <p style="margin-top:16px"><button type="button" class="btn btn-outline" id="regRetry">${UI.icon('refresh')}Reintentar</button></p>`;
      root.querySelector('#regRetry').addEventListener('click', init);
    }
  }

  init();
})();
