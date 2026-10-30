/**
 * Pantalla de inicio de sesión. El personal puede solicitar su cuenta en /registro (ADR-0008)
 * cuando el registro está habilitado.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const alertBox = $('authAlert');
  const form = $('loginForm');

  // Con sesión, directo a la aplicación (app.js la valida con el servidor)
  if (UI.getToken()) {
    location.replace('/app');
    return;
  }

  UI.hydrateIcons(document);
  UI.hydrateLogos(document);

  function showAlert(message, type = 'error') {
    const iconName = { error: 'alert', warning: 'clock' }[type] || 'info';
    alertBox.innerHTML = UI.icon(iconName) + `<span>${UI.escape(message)}</span>`;
    alertBox.className = `alert alert-${type}`;
    alertBox.setAttribute('role', type === 'error' ? 'alert' : 'status');
    alertBox.hidden = false;
  }

  function fieldError(inputId, message) {
    const input = $(inputId);
    const box = $(`${inputId}Error`);
    box.textContent = message || '';
    box.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  const pending = UI.takeAuthMessage();
  if (pending) showAlert(pending, 'info');

  // Enlace al registro solo si está habilitado (si falla la consulta, se conserva el texto anterior)
  UI.api('/auth/registration-info', { redirectOn401: false }).then((info) => {
    if (info && info.enabled) {
      $('authNote').innerHTML = '¿No tienes cuenta? <a href="/registro"><strong>Solicítala aquí</strong></a>';
    }
  }).catch(() => { /* sin cambios */ });

  // Botones para mostrar / ocultar la contraseña
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    const input = $(btn.dataset.togglePassword);
    const update = () => {
      const visible = input.type === 'text';
      btn.innerHTML = UI.icon(visible ? 'eyeOff' : 'eye');
      btn.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    };
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      update();
      input.focus();
    });
    update();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.hidden = true;
    const email = $('loginEmail').value.trim();
    const password = $('loginPass').value;

    const emailMsg = !email ? 'Escribe tu correo electrónico.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Escribe un correo electrónico válido.' : '';
    const passMsg = password ? '' : 'Escribe tu contraseña.';
    fieldError('loginEmail', emailMsg);
    fieldError('loginPass', passMsg);
    if (emailMsg || passMsg) {
      $(emailMsg ? 'loginEmail' : 'loginPass').focus();
      return;
    }

    const button = form.querySelector('[type="submit"]');
    UI.setBusy(button, true);
    try {
      const { token, user } = await UI.api('/auth/login', { method: 'POST', body: { email, password }, redirectOn401: false });
      UI.setSession(token, user);
      location.replace(user.must_change_password ? '/app#cambiar-contrasena' : '/app');
    } catch (err) {
      UI.setBusy(button, false);
      showAlert(err.message, err.code === 'ACCOUNT_PENDING' ? 'warning' : 'error');
    }
  });

  $('loginEmail').focus();
})();
