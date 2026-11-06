/**
 * Vista "Respaldos" (solo ADMIN, Fase 8, ADR-0015): estado del respaldo diario, respaldar ahora,
 * descargar, restaurar un respaldo de la lista o subir un .zip (p. ej. desde una USB).
 * Al restaurar, el servidor cierra TODAS las sesiones: se vuelve al inicio de sesión.
 */
const Respaldos = (() => {
  const esc = (v) => UI.escape(v);
  const STALE_DAYS = 2;
  const KIND_TONE = { AUTO: 'badge-info', MANUAL: 'badge-sun', ANTES_DE_RESTAURAR: 'badge-warning', ANTES_DE_ACTUALIZAR: 'badge-warning', IMPORTADO: 'badge-plain' };

  function size(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString('es-MX', { maximumFractionDigits: 1 })} MB`;
    return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('es-MX')} KB`;
  }

  function contents(b) {
    if (!b.counts) return '<span class="muted">Sin información</span>';
    const c = b.counts;
    const parts = [];
    if (c.children !== null && c.children !== undefined) parts.push(`${c.children} niñas y niños`);
    if (c.letters !== null && c.letters !== undefined) parts.push(`${c.letters} cartas`);
    if (c.volunteers !== null && c.volunteers !== undefined) parts.push(`${c.volunteers} voluntarios`);
    if (b.uploads) parts.push(`${b.uploads} ${b.uploads === 1 ? 'foto' : 'fotos'}`);
    return esc(parts.join(' · ') || 'Sin registros');
  }

  const kindBadge = (b) => `<span class="badge ${KIND_TONE[b.kind] || ''}">${esc(b.kind_label)}</span>`;

  function statusPanel(s) {
    const last = s.last_backup_at;
    const ageDays = last ? (Date.now() - new Date(last).getTime()) / 86400e3 : Infinity;
    const lastHtml = last
      ? `${esc(Fechas.formatDateTime(last))} <span class="muted">(${esc(Fechas.formatRelative(last))})</span>`
      : '<span class="muted">Todavía no hay respaldos</span>';
    const warn = ageDays > STALE_DAYS
      ? `<div class="alert alert-warning" role="status">${UI.icon('alert')}<span>${last ? `El último respaldo tiene más de ${STALE_DAYS} días.` : 'Aún no hay ningún respaldo.'} Haz uno ahora con <strong>Respaldar ahora</strong>.</span></div>` : '';
    const error = s.last_error ? `<div class="alert alert-error" role="alert">${UI.icon('alert')}<span>Último aviso del respaldo automático: ${esc(s.last_error)}</span></div>` : '';
    return `
      <section class="card panel">
        <h3 class="panel-title">Estado</h3>
        ${warn}${error}
        <dl class="data-list">
          <dt>Último respaldo</dt><dd>${lastHtml}</dd>
          <dt>Respaldo automático</dt><dd>${s.auto_enabled
            ? '<span class="badge badge-success">Activado</span> <span class="muted">uno al día mientras el programa esté abierto</span>'
            : '<span class="badge badge-warning">Desactivado</span> <span class="muted">(BACKUP_AUTO=false en config.env)</span>'}</dd>
          <dt>Se conservan</dt><dd>los ${esc(s.keep)} automáticos más recientes, 30 manuales y 5 de cada tipo de seguridad</dd>
          <dt>Carpeta</dt><dd><code class="break">${esc(s.dir)}</code></dd>
          <dt>Copia extra</dt><dd>${s.copy_dir ? `<code class="break">${esc(s.copy_dir)}</code>`
            : '<span class="muted">No configurada. Para guardar una copia en otra unidad, USB o carpeta en la nube, configura BACKUP_COPY_DIR (ver el manual).</span>'}</dd>
        </dl>
      </section>`;
  }

  function actions(b) {
    const restore = b.can_restore
      ? `<button type="button" class="btn btn-outline btn-sm" data-restore="${esc(b.name)}">${UI.icon('undo')}<span>Restaurar</span></button>`
      : `<span class="muted" title="Es de una versión más nueva del sistema o está dañado">No se puede restaurar</span>`;
    return `<div class="row-actions row-actions-labeled"><button type="button" class="btn btn-outline btn-sm" data-download="${esc(b.name)}">${UI.icon('download')}<span>Descargar</span></button>${restore}</div>`;
  }

  function listHtml(items) {
    if (!items.length) {
      return Components.empty({ iconName: 'shield', title: 'Todavía no hay respaldos', text: 'Haz el primero con "Respaldar ahora". Después se hará uno automático cada día.' });
    }
    return `
      <div class="table-wrap desktop-only"><table class="table table-compact">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Contenido</th><th class="num">Tamaño</th><th>Versión</th><th></th></tr></thead>
        <tbody>${items.map((b) => `
          <tr><td class="date-cell">${esc(Fechas.formatDateTime(b.created_at))}<br><span class="muted">${esc(b.created_by || 'Sistema')}</span></td>
            <td>${kindBadge(b)}</td><td>${contents(b)}</td><td class="num">${esc(size(b.size_bytes))}</td>
            <td class="nowrap">${esc(b.app_version || '—')}</td><td class="actions-cell">${actions(b)}</td></tr>`).join('')}</tbody>
      </table></div>
      <ul class="card-list mobile-only">${items.map((b) => `
        <li class="item-card">
          <div class="item-card-head">${kindBadge(b)}<span class="muted">${esc(size(b.size_bytes))}</span></div>
          <p><strong>${esc(Fechas.formatDateTime(b.created_at))}</strong> <span class="muted">· ${esc(b.created_by || 'Sistema')}</span></p>
          <p>${contents(b)}</p>
          ${actions(b)}
        </li>`).join('')}</ul>`;
  }

  /** Diálogo de confirmación: hay que escribir RESTAURAR. Resuelve true/false. */
  function confirmRestore(description) {
    return new Promise((resolve) => {
      let done = false;
      const dialog = UI.dialog({
        title: '¿Restaurar este respaldo?',
        description,
        bodyHtml: `
          <div class="alert alert-warning">${UI.icon('alert')}<span>Se <strong>reemplazarán todos los datos actuales</strong> (personas, cartas, fotos, inventario, usuarios y contraseñas) por los del respaldo.
            Antes se guarda automáticamente un respaldo "Antes de restaurar" para poder deshacerlo.
            Todas las personas conectadas tendrán que volver a iniciar sesión.</span></div>
          <div class="field"><label for="restoreConfirm">Escribe <strong>RESTAURAR</strong> para confirmar</label>
            <input id="restoreConfirm" class="input" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>`,
        footerHtml: `
          <button type="button" class="btn btn-outline" data-action="cancel">Cancelar</button>
          <button type="button" class="btn btn-destructive" data-action="ok" disabled>Restaurar</button>`,
        onClose: () => { if (!done) resolve(false); }
      });
      const input = dialog.el.querySelector('#restoreConfirm');
      const ok = dialog.el.querySelector('[data-action="ok"]');
      input.addEventListener('input', () => { ok.disabled = input.value.trim().toUpperCase() !== 'RESTAURAR'; });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !ok.disabled) ok.click(); });
      dialog.el.querySelector('[data-action="cancel"]').addEventListener('click', dialog.close);
      ok.addEventListener('click', () => { done = true; resolve(true); dialog.close(); });
      input.focus();
    });
  }

  function afterRestore(result) {
    const when = result.restored && result.restored.created_at ? Fechas.formatDateTime(result.restored.created_at) : '';
    UI.clearSession(`Se restauró el respaldo${when ? ` del ${when}` : ''}. Inicia sesión con la contraseña que tenías en esa fecha.`);
    location.replace('/');
  }

  async function uploadAndRestore(file) {
    let res;
    try {
      res = await fetch('/api/backups/restore-upload?confirm=RESTAURAR', {
        method: 'POST',
        headers: { Authorization: `Bearer ${UI.getToken()}`, 'Content-Type': 'application/zip' },
        body: file
      });
    } catch {
      throw new Error('No se pudo conectar con el servidor. Verifica que el programa Soñar Despierto siga abierto.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* sin JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'No se pudo restaurar el respaldo.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function mount(container) {
    container.innerHTML = `
      <section class="page-header">
        <div><h2>Respaldos</h2>
          <p class="muted">Copias de seguridad de la base de datos y las fotos. Guarda de vez en cuando una copia fuera de esta computadora.</p></div>
        <button type="button" class="btn btn-primary" data-backup-now>${UI.icon('shield')}<span>Respaldar ahora</span></button>
      </section>
      <div data-status>${Components.loading(3)}</div>
      <section class="card panel">
        <div class="panel-head"><h3 class="panel-title">Respaldos guardados</h3>
          <button type="button" class="btn btn-ghost btn-sm" data-refresh>${UI.icon('refresh')}<span>Actualizar</span></button></div>
        <div data-list>${Components.loading(4)}</div>
      </section>
      <section class="card panel">
        <h3 class="panel-title">Restaurar desde un archivo</h3>
        <p class="muted">Para un respaldo que guardaste en una USB u otra computadora (archivo <code>sonar-….zip</code>).</p>
        <form class="upload-row" data-upload novalidate>
          <input type="file" class="input" name="file" accept=".zip,application/zip" aria-label="Archivo del respaldo">
          <button type="submit" class="btn btn-outline">${UI.icon('undo')}<span>Restaurar este archivo</span></button>
        </form>
        <p class="field-error" data-upload-error hidden></p>
      </section>`;

    const statusEl = container.querySelector('[data-status]');
    const listEl = container.querySelector('[data-list]');
    const backupBtn = container.querySelector('[data-backup-now]');
    const uploadForm = container.querySelector('[data-upload]');
    const uploadError = container.querySelector('[data-upload-error]');
    let items = [];

    async function load() {
      try {
        const data = await UI.api('/backups');
        items = data.items;
        statusEl.innerHTML = statusPanel(data.settings);
        listEl.innerHTML = listHtml(items);
      } catch (err) {
        statusEl.innerHTML = '';
        Components.error(listEl, err, load);
      }
    }

    backupBtn.addEventListener('click', async () => {
      UI.setBusy(backupBtn, true);
      try {
        const { backup } = await UI.api('/backups', { method: 'POST' });
        UI.toast(backup.copy && !backup.copy.ok
          ? `Respaldo guardado, pero no se pudo copiar a la carpeta extra: ${backup.copy.error}`
          : 'Respaldo guardado.', backup.copy && !backup.copy.ok ? 'error' : 'success');
        await load();
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        UI.setBusy(backupBtn, false);
      }
    });

    container.querySelector('[data-refresh]').addEventListener('click', load);

    listEl.addEventListener('click', async (e) => {
      const dl = e.target.closest('[data-download]');
      if (dl) {
        UI.setBusy(dl, true);
        try { await UI.download(`/backups/${encodeURIComponent(dl.dataset.download)}/download`, dl.dataset.download); }
        catch (err) { UI.toast(err.message, 'error'); }
        finally { UI.setBusy(dl, false); }
        return;
      }
      const rs = e.target.closest('[data-restore]');
      if (!rs) return;
      const b = items.find((x) => x.name === rs.dataset.restore);
      if (!b) return;
      const ok = await confirmRestore(`${b.kind_label} del ${Fechas.formatDateTime(b.created_at)} · ${b.counts ? `${b.counts.children ?? 0} niñas y niños, ${b.counts.letters ?? 0} cartas` : ''}`);
      if (!ok) return;
      UI.setBusy(rs, true);
      try {
        afterRestore(await UI.api(`/backups/${encodeURIComponent(b.name)}/restore`, { method: 'POST', body: { confirm: 'RESTAURAR' }, redirectOn401: false }));
      } catch (err) {
        UI.toast(err.message, 'error');
        UI.setBusy(rs, false);
      }
    });

    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      uploadError.hidden = true;
      const file = uploadForm.elements.file.files[0];
      if (!file) { uploadError.textContent = 'Elige el archivo .zip del respaldo.'; uploadError.hidden = false; return; }
      if (!/\.zip$/i.test(file.name)) { uploadError.textContent = 'El respaldo es un archivo .zip (sonar-….zip).'; uploadError.hidden = false; return; }
      const ok = await confirmRestore(`Archivo ${file.name} (${size(file.size)})`);
      if (!ok) return;
      const btn = uploadForm.querySelector('button[type="submit"]');
      UI.setBusy(btn, true);
      try {
        afterRestore(await uploadAndRestore(file));
      } catch (err) {
        uploadError.textContent = err.message;
        uploadError.hidden = false;
        UI.setBusy(btn, false);
      }
    });

    load();
  }

  return { mount };
})();
