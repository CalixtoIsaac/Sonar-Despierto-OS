/**
 * Diálogos de la administración de usuarios (solo ADMIN). Todos resuelven con el usuario actualizado
 * (o true/false) y disparan el evento "sd:users-changed" al terminar con éxito.
 *
 *   UsuariosDialogos.reviewRequest(user, { mode: 'review' | 'approve' })
 *   UsuariosDialogos.userForm({ mode: 'create' | 'edit', user, self })
 *   UsuariosDialogos.resetPassword(user) · toggleActive(user) · deleteRequest(user)
 *   UsuariosDialogos.changedFields(antes, despues)  (pura; se prueba con node:test)
 *
 * La contraseña temporal solo vive en el componente secretReveal mientras el diálogo está abierto.
 */
const UsuariosDialogos = (() => {
  const changedEvent = () => window.dispatchEvent(new Event('sd:users-changed'));
  const esc = (v) => UI.escape(v);

  /** Solo lo que cambió; "modules" se compara como conjunto. */
  function changedFields(before, after) {
    const out = {};
    for (const [key, value] of Object.entries(after)) {
      if (key === 'modules') {
        const a = new Set(before.modules || []);
        const b = new Set(value || []);
        if (a.size !== b.size || [...b].some((m) => !a.has(m))) out.modules = value;
      } else if ((before[key] ?? null) !== (value ?? null)) {
        out[key] = value;
      }
    }
    return out;
  }

  function errorBox() {
    return '<div class="alert alert-error" data-dialog-error role="alert" hidden></div>';
  }
  function showError(dialog, err) {
    const box = dialog.el.querySelector('[data-dialog-error]');
    box.innerHTML = UI.icon('alert') + `<span>${esc(err.message)}</span>`;
    box.hidden = false;
  }

  function moduleBadges(list, { empty = 'Sin módulos' } = {}) {
    if (!list || !list.length) return `<span class="muted">${esc(empty)}</span>`;
    return `<span class="pill-list">${list.map((m) => `<span class="badge badge-plain">${esc(Access.MODULE_INFO[m]?.label || m)}</span>`).join('')}</span>`;
  }

  function roleRadios(name, value, { disabled = false } = {}) {
    return `<fieldset class="radio-group" ${disabled ? 'disabled' : ''}>
      <legend>Rol</legend>
      <label class="radio-card"><input type="radio" name="${name}" value="OPERADOR" ${value !== 'ADMIN' ? 'checked' : ''}>
        <span><strong>Operador</strong> — solo los módulos que marques</span></label>
      <label class="radio-card"><input type="radio" name="${name}" value="ADMIN" ${value === 'ADMIN' ? 'checked' : ''}>
        <span><strong>Administrador</strong> — acceso total, incluida la gestión de usuarios y la bitácora</span></label>
    </fieldset>`;
  }

  /** Conecta rol ↔ selector de módulos y los avisos. */
  function bindRole(form, picker, name = 'role') {
    const adminWarn = form.querySelector('[data-admin-warn]');
    const emptyWarn = form.querySelector('[data-empty-warn]');
    const adminNote = form.querySelector('[data-admin-note]');
    const update = () => {
      const role = form.querySelector(`input[name="${name}"]:checked`)?.value || 'OPERADOR';
      picker.setDisabled(role === 'ADMIN' || picker.locked === true);
      if (adminWarn) adminWarn.hidden = role !== 'ADMIN';
      if (adminNote) adminNote.hidden = role !== 'ADMIN';
      if (emptyWarn) emptyWarn.hidden = !(role === 'OPERADOR' && picker.getValue().length === 0);
    };
    form.querySelectorAll(`input[name="${name}"]`).forEach((r) => r.addEventListener('change', update));
    form.addEventListener('change', update);
    update();
    return () => form.querySelector(`input[name="${name}"]:checked`)?.value || 'OPERADOR';
  }

  const roleNotices = () => `
    <p class="hint" data-admin-note hidden>Los administradores tienen todos los módulos.</p>
    <div class="alert alert-warning" data-admin-warn hidden>${UI.icon('shield')}
      <span>Un administrador puede ver y cambiar todo, incluidos los datos de niñas y niños y las cuentas del personal.</span></div>
    <div class="alert alert-info" data-empty-warn hidden>${UI.icon('info')}
      <span>Sin módulos, la persona solo verá Inicio y Mi perfil.</span></div>`;

  // ---------- Revisar / aprobar solicitud ----------
  function reviewRequest(user, { mode = 'review' } = {}) {
    return new Promise((resolve) => {
      let result = null;
      const dialog = UI.dialog({
        title: mode === 'approve' ? `Aprobar a ${user.full_name}` : 'Revisar solicitud',
        as: 'form',
        bodyHtml: '<div data-body></div>',
        footerHtml: '<div data-footer class="modal-actions"></div>',
        onClose: () => resolve(result)
      });
      dialog.el.classList.add('modal-wide');
      const body = dialog.el.querySelector('[data-body]');
      const footer = dialog.el.querySelector('[data-footer]');
      let picker;
      let getRole;

      function renderReview() {
        body.innerHTML = `
          <div class="request-summary">
            <p><strong>${esc(user.full_name)}</strong></p>
            <p class="muted">${esc(user.email)}${user.phone ? ` · ${esc(Phone.format(user.phone))}` : ''}</p>
            <p>Solicitó: ${moduleBadges(user.requested_modules, { empty: 'Sin módulos solicitados' })}</p>
            ${user.registration_note ? `<blockquote class="quote">“${esc(user.registration_note)}”</blockquote>` : ''}
          </div>
          <div class="form">
            ${roleRadios('role', 'OPERADOR')}
            <div class="field"><span class="field-label">Módulos</span><div data-picker></div></div>
            ${roleNotices()}
            ${Components.form.field({ name: 'note', label: 'Nota (opcional, queda en la bitácora)', type: 'textarea', max: 500, rows: 2 })}
            ${errorBox()}
          </div>`;
        picker = Components.modulePicker(body.querySelector('[data-picker]'), {
          value: user.requested_modules || [], highlight: user.requested_modules || []
        });
        getRole = bindRole(dialog.el, picker);
        footer.innerHTML = `
          ${mode === 'review' ? '<button type="button" class="btn btn-outline" data-reject>Rechazar</button>' : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="submit" class="btn btn-primary">${UI.icon('userCheck')}Aprobar cuenta</button>`;
        footer.querySelector('[data-cancel]').addEventListener('click', dialog.close);
        const rej = footer.querySelector('[data-reject]');
        if (rej) rej.addEventListener('click', renderReject);
        dialog.el.onsubmit = approve;
      }

      async function approve(e) {
        e.preventDefault();
        const button = footer.querySelector('[type="submit"]');
        const role = getRole();
        const note = dialog.el.elements.note.value.trim();
        UI.setBusy(button, true);
        try {
          const out = await UI.api(`/users/${user.id}/approve`, {
            method: 'POST', body: { role, modules: role === 'ADMIN' ? [] : picker.getValue(), note: note || null }
          });
          result = out.user;
          UI.toast(`Cuenta de ${user.full_name} aprobada`, 'success');
          changedEvent();
          dialog.close();
        } catch (err) {
          UI.setBusy(button, false);
          showError(dialog, err);
        }
      }

      function renderReject() {
        body.innerHTML = `
          <p>Vas a rechazar la solicitud de <strong>${esc(user.full_name)}</strong>. La persona verá un aviso al intentar entrar.</p>
          <div class="form">
            ${Components.form.field({ name: 'reason', label: 'Motivo del rechazo', type: 'textarea', required: true, max: 500, rows: 3 })}
            <p class="hint counter" data-count>0/500</p>
            ${errorBox()}
          </div>`;
        const reason = dialog.el.elements.reason;
        reason.addEventListener('input', () => { body.querySelector('[data-count]').textContent = `${[...reason.value].length}/500`; });
        footer.innerHTML = `
          <button type="button" class="btn btn-ghost" data-back>${UI.icon('arrowLeft')}Volver</button>
          <span class="spacer"></span>
          <button type="submit" class="btn btn-destructive">Confirmar rechazo</button>`;
        footer.querySelector('[data-back]').addEventListener('click', renderReview);
        dialog.el.onsubmit = reject;
        reason.focus();
      }

      async function reject(e) {
        e.preventDefault();
        const form = dialog.el;
        const reason = form.elements.reason.value.trim();
        Components.form.clearErrors(form);
        if ([...reason].length < 5) {
          Components.form.showErrors(form, [{ field: 'reason', message: reason ? 'Escribe al menos 5 caracteres.' : 'Este campo es obligatorio.' }]);
          return;
        }
        const button = footer.querySelector('[type="submit"]');
        UI.setBusy(button, true);
        try {
          const out = await UI.api(`/users/${user.id}/reject`, { method: 'POST', body: { reason } });
          result = out.user;
          UI.toast('Solicitud rechazada', 'success');
          changedEvent();
          dialog.close();
        } catch (err) {
          UI.setBusy(button, false);
          if (err.details) Components.form.showErrors(form, err.details);
          else showError(dialog, err);
        }
      }

      renderReview();
    });
  }

  // ---------- Alta y edición ----------
  const PERSON_FIELDS = [
    { name: 'first_name', label: 'Nombre(s)', required: true, max: 80 },
    { name: 'last_name', label: 'Apellidos', required: true, max: 120 },
    { name: 'email', label: 'Correo electrónico', type: 'email', required: true, max: 255 },
    { name: 'phone', label: 'Teléfono (opcional)', type: 'tel', inputmode: 'tel', hint: '10 dígitos' }
  ];

  function userForm({ mode = 'create', user = null, self = false } = {}) {
    return new Promise((resolve) => {
      let result = null;
      const editing = mode === 'edit';
      const F = Components.form;
      const dialog = UI.dialog({
        title: editing ? `Editar a ${user.full_name}` : 'Nuevo usuario',
        description: editing ? '' : 'El sistema genera una contraseña temporal que la persona cambiará al entrar.',
        as: 'form',
        bodyHtml: `<div data-body class="form">
          <div class="form-grid">
            ${F.field(PERSON_FIELDS[0], user?.first_name)}
            ${F.field(PERSON_FIELDS[1], user?.last_name)}
            ${editing ? `<div class="field"><span class="field-label">Correo electrónico</span><p class="readonly-value">${esc(user.email)}</p></div>`
              : F.field(PERSON_FIELDS[2])}
            ${F.field(PERSON_FIELDS[3], user?.phone ? Phone.format(user.phone) : '')}
          </div>
          ${roleRadios('role', user?.role || 'OPERADOR', { disabled: self })}
          <div class="field"><span class="field-label">Módulos</span><div data-picker></div></div>
          ${roleNotices()}
          ${editing ? `<label class="switch"><input type="checkbox" name="is_active" ${user.is_active ? 'checked' : ''} ${self ? 'disabled' : ''}>
            <span class="switch-track" aria-hidden="true"></span><span>Cuenta activa</span></label>` : ''}
          ${self ? `<p class="hint">${UI.icon('lock')} No puedes cambiar tu propio rol ni desactivar tu cuenta.</p>` : ''}
          ${errorBox()}
        </div>`,
        footerHtml: `<div data-footer class="modal-actions">
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="submit" class="btn btn-primary">${editing ? 'Guardar cambios' : `${UI.icon('userPlus')}Crear usuario`}</button>
        </div>`,
        onClose: () => resolve(result)
      });
      dialog.el.classList.add('modal-wide');
      const form = dialog.el;
      const picker = Components.modulePicker(form.querySelector('[data-picker]'), {
        value: user && user.role !== 'ADMIN' ? user.modules : []
      });
      const getRole = bindRole(form, picker);
      form.querySelector('[data-cancel]').addEventListener('click', dialog.close);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        F.clearErrors(form);
        const v = F.read(form, editing ? [PERSON_FIELDS[0], PERSON_FIELDS[1], PERSON_FIELDS[3]] : PERSON_FIELDS);
        const errors = [];
        if (!v.first_name) errors.push({ field: 'first_name', message: 'Este campo es obligatorio.' });
        if (!v.last_name) errors.push({ field: 'last_name', message: 'Este campo es obligatorio.' });
        if (!editing && !v.email) errors.push({ field: 'email', message: 'Este campo es obligatorio.' });
        else if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.push({ field: 'email', message: 'Escribe un correo electrónico válido.' });
        if (v.phone && !Phone.isValid(v.phone)) errors.push({ field: 'phone', message: 'El teléfono debe tener 10 dígitos.' });
        if (errors.length) { F.showErrors(form, errors); return; }

        const role = getRole();
        const data = {
          first_name: v.first_name, last_name: v.last_name, phone: v.phone ? Phone.normalize(v.phone) : null,
          role, modules: role === 'ADMIN' ? [] : picker.getValue()
        };
        const button = form.querySelector('[type="submit"]');
        UI.setBusy(button, true);
        try {
          if (editing) {
            if (form.elements.is_active) data.is_active = form.elements.is_active.checked;
            if (self) { delete data.role; delete data.is_active; }
            const before = { ...user, modules: user.role === 'ADMIN' ? [] : user.modules };
            const body = changedFields(before, data);
            if (role === 'ADMIN') delete body.modules;
            if (!Object.keys(body).length) { dialog.close(); UI.toast('No hay cambios que guardar'); return; }
            const out = await UI.api(`/users/${user.id}`, { method: 'PATCH', body });
            result = out.user;
            UI.toast('Cambios guardados', 'success');
            changedEvent();
            dialog.close();
          } else {
            const out = await UI.api('/users', { method: 'POST', body: { ...data, email: v.email } });
            result = out.user;
            changedEvent();
            showSecret(dialog, out.temporary_password, `Cuenta de ${out.user.full_name} creada`);
          }
        } catch (err) {
          UI.setBusy(button, false);
          const rest = err.details ? F.showErrors(form, err.details) : [err];
          if (err.code === 'EMAIL_ALREADY_EXISTS') F.showErrors(form, [{ field: 'email', message: err.message }]);
          else if (rest.length) showError(dialog, err);
        }
      });
      form.elements.first_name.focus();
    });
  }

  /** Sustituye el contenido del diálogo por la contraseña temporal y el botón "Listo". */
  function showSecret(dialog, secret, title) {
    const header = dialog.el.querySelector('.modal-header');
    header.querySelector('h2').textContent = title;
    const p = header.querySelector('p');
    if (p) p.remove();
    const bodyWrap = dialog.el.querySelector('.modal-body');
    bodyWrap.innerHTML = '';
    bodyWrap.appendChild(Components.secretReveal({ secret }));
    dialog.el.querySelector('.modal-footer').innerHTML = '<button type="button" class="btn btn-primary" data-done>Listo</button>';
    dialog.el.onsubmit = (e) => e.preventDefault();
    const done = dialog.el.querySelector('[data-done]');
    done.addEventListener('click', dialog.close);
    dialog.el.querySelector('.secret-value').focus();
  }

  // ---------- Restablecer contraseña ----------
  function resetPassword(user) {
    return new Promise((resolve) => {
      let result = false;
      const dialog = UI.dialog({
        title: `¿Restablecer la contraseña de ${user.full_name}?`,
        description: 'Su sesión se cerrará en todas las computadoras y tendrá que elegir una nueva al entrar.',
        bodyHtml: errorBox(),
        footerHtml: `<button type="button" class="btn btn-outline" data-cancel>Cancelar</button>
          <button type="button" class="btn btn-primary" data-ok>${UI.icon('key')}Restablecer</button>`,
        onClose: () => resolve(result)
      });
      dialog.el.querySelector('[data-cancel]').addEventListener('click', dialog.close);
      const ok = dialog.el.querySelector('[data-ok]');
      ok.addEventListener('click', async () => {
        UI.setBusy(ok, true);
        try {
          const out = await UI.api(`/users/${user.id}/reset-password`, { method: 'POST' });
          result = true;
          changedEvent();
          showSecret(dialog, out.temporary_password, 'Nueva contraseña temporal');
        } catch (err) {
          UI.setBusy(ok, false);
          showError(dialog, err);
        }
      });
      ok.focus();
    });
  }

  // ---------- Activar / desactivar / eliminar ----------
  async function toggleActive(user) {
    const activating = !user.is_active;
    if (!activating) {
      const ok = await UI.confirm({
        title: `¿Desactivar a ${user.full_name}?`,
        message: 'Perderá el acceso de inmediato en todas las computadoras.',
        confirmText: 'Desactivar', danger: true
      });
      if (!ok) return null;
    }
    try {
      const out = await UI.api(`/users/${user.id}`, { method: 'PATCH', body: { is_active: activating } });
      UI.toast(activating ? `${user.full_name} vuelve a tener acceso` : `${user.full_name} fue desactivado`, 'success');
      changedEvent();
      return out.user;
    } catch (err) {
      UI.toast(err.message, 'error');
      return null;
    }
  }

  async function deleteRequest(user) {
    const ok = await UI.confirm({
      title: `¿Eliminar la solicitud de ${user.full_name}?`,
      message: 'Podrá volver a registrarse con el mismo correo.',
      confirmText: 'Eliminar', danger: true
    });
    if (!ok) return false;
    try {
      await UI.api(`/users/${user.id}`, { method: 'DELETE' });
      UI.toast('Solicitud eliminada', 'success');
      changedEvent();
      return true;
    } catch (err) {
      UI.toast(err.message, 'error');
      return false;
    }
  }

  return { reviewRequest, userForm, resetPassword, toggleActive, deleteRequest, changedFields, moduleBadges };
})();

if (typeof module !== 'undefined') module.exports = UsuariosDialogos;
