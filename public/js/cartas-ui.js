/**
 * Piezas compartidas de Eventos y Cartas (Fase 4): chips de estatus, selector de evento, fotos privadas,
 * compresión de imágenes en el navegador y los diálogos de cada acción de la máquina de estados.
 *
 *   CartasUI.statusChip('ASIGNADO') · CartasUI.eventBadge('ABIERTO') · CartasUI.childLabel(letter.child)
 *   await CartasUI.loadEvents() → eventos (más recientes primero) · CartasUI.defaultEvent(events)
 *   await CartasUI.runAction(letter, 'receive', { user }) → carta actualizada | 'reload' | null
 *   await CartasUI.photoUrl(id) → URL temporal de la foto (con sesión) · CartasUI.compressImage(file) → Blob JPEG
 *   await CartasUI.uploadPhoto(id, blob) → { letter }
 *
 * Las funciones puras (statusMeta, nextEventStatus, previewCode) se exportan para las pruebas con node:test.
 */
const CartasUI = (() => {
  const hasUI = typeof UI !== 'undefined';
  const esc = (v) => (hasUI ? UI.escape(v) : String(v ?? ''));
  const icon = (n) => (hasUI ? UI.icon(n) : '');
  const Cat = typeof Catalogos !== 'undefined' ? Catalogos : require('./catalogos');

  // Chips de estatus de carta (Pantallas_UI §1.1): color + ícono + texto
  const STATUS_META = {
    PENDIENTE: { icon: 'clock', cls: 'letter-chip-pendiente' },
    ASIGNADO: { icon: 'heart', cls: 'letter-chip-asignado' },
    RECIBIDO: { icon: 'gift', cls: 'letter-chip-recibido' },
    ENTREGADO: { icon: 'check', cls: 'letter-chip-entregado' }
  };
  const statusMeta = (status) => ({ ...(STATUS_META[status] || { icon: 'info', cls: '' }), label: Cat.LETTER_STATUS_LABEL[status] || status });

  function statusChip(status) {
    const m = statusMeta(status);
    return `<span class="badge badge-plain letter-chip ${m.cls}">${icon(m.icon)}${esc(m.label)}</span>`;
  }

  const EVENT_TONE = { BORRADOR: '', ABIERTO: 'badge-success', EN_CURSO: 'badge-sun', CERRADO: 'badge-danger' };
  const eventBadge = (status) => `<span class="badge ${EVENT_TONE[status] || ''}">${esc(Cat.EVENT_STATUS_LABEL[status] || status)}</span>`;

  /** Siguiente estatus del evento y su botón (null si ya está cerrado). */
  function nextEventStatus(status) {
    return {
      BORRADOR: { to: 'ABIERTO', label: 'Abrir evento', icon: 'play', hint: 'Ya se podrán registrar cartas y asignar padrinos.' },
      ABIERTO: { to: 'EN_CURSO', label: 'Iniciar evento', icon: 'flag', hint: 'Marca que el evento ya está en marcha (entregas).' },
      EN_CURSO: { to: 'CERRADO', label: 'Cerrar evento', icon: 'lock', hint: 'El evento quedará de solo lectura: ya no se podrán cambiar cartas ni voluntarios.' }
    }[status] || null;
  }

  /** "NAV26" → "NAV26-000001" (vista previa del primer código). */
  const previewCode = (prefix) => `${String(prefix || 'PREFIJO').toUpperCase()}-000001`;

  /** Nombre visible de la niña o niño dentro de Cartas ("Sofía C." si es restringido). */
  const childLabel = (child) => (child ? child.display_name : '—');

  // ---------- Eventos ----------
  async function loadEvents() {
    const data = await UI.api('/events?page_size=100&order_by=-event_date');
    return data.items;
  }

  /** El evento de Navidad abierto o en curso más reciente; si no hay, el más reciente. */
  function defaultEvent(events) {
    const open = events.filter((e) => Cat.LETTER_EVENT_TYPES.includes(e.event_type) && ['ABIERTO', 'EN_CURSO'].includes(e.status));
    return open[0] || events.find((e) => Cat.LETTER_EVENT_TYPES.includes(e.event_type)) || events[0] || null;
  }

  const eventLabel = (e) => `${e.name} (${e.code_prefix}) · ${Cat.EVENT_STATUS_LABEL[e.status]}`;

  // ---------- Fotos (se piden con la sesión: nunca son archivos públicos) ----------
  async function photoUrl(letterId) {
    const res = await fetch(`/api/letters/${letterId}/photo`, { headers: { Authorization: `Bearer ${UI.getToken()}` } });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  }

  /** Reduce la foto a máx. 1600 px y la vuelve JPEG (así se borran los datos EXIF, p. ej. la ubicación). */
  async function compressImage(file, { max = 1600, quality = 0.85 } = {}) {
    let source;
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo leer la imagen. Usa una foto JPG o PNG.'));
        img.src = URL.createObjectURL(file);
      });
    }
    const w = source.width || source.naturalWidth;
    const h = source.height || source.naturalHeight;
    const scale = Math.min(1, max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('No se pudo preparar la foto.');
    return blob;
  }

  async function uploadPhoto(letterId, blob) {
    let res;
    try {
      res = await fetch(`/api/letters/${letterId}/photo`, {
        method: 'POST', headers: { Authorization: `Bearer ${UI.getToken()}`, 'Content-Type': blob.type || 'image/jpeg' }, body: blob
      });
    } catch {
      throw new Error('No se pudo conectar con el servidor para subir la foto.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && data.error) || 'No se pudo subir la foto.');
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  /** Selector de foto con cámara del celular, vista previa y aviso de privacidad. onChange(blob | null). */
  function photoPicker(el, { onChange, label = 'Tomar o elegir foto de la carta' } = {}) {
    el.innerHTML = `
      <div class="photo-picker">
        <div class="alert alert-warning" role="note">${icon('shield')}<span><strong>Cubre apellidos y escuela antes de fotografiar.</strong>
          La foto se reduce y se le quitan los datos de ubicación antes de guardarse.</span></div>
        <label class="btn btn-outline photo-picker-btn">${icon('camera')}<span>${esc(label)}</span>
          <input type="file" accept="image/*" capture="environment" class="sr-only" data-file></label>
        <div class="photo-preview" data-preview hidden></div>
        <p class="hint" data-status aria-live="polite"></p>
      </div>`;
    const input = el.querySelector('[data-file]');
    const preview = el.querySelector('[data-preview]');
    const status = el.querySelector('[data-status]');
    let url = null;
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      status.textContent = 'Preparando la foto…';
      try {
        const blob = await compressImage(file);
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
        preview.innerHTML = `<img src="${url}" alt="Vista previa de la carta">
          <button type="button" class="btn btn-ghost btn-sm" data-clear>${icon('x')}Quitar</button>`;
        preview.hidden = false;
        status.textContent = `Lista para guardar (${Math.round(blob.size / 1024)} KB).`;
        preview.querySelector('[data-clear]').addEventListener('click', () => {
          input.value = '';
          preview.hidden = true;
          preview.innerHTML = '';
          status.textContent = '';
          onChange(null);
        });
        onChange(blob);
      } catch (err) {
        status.textContent = err.message;
        onChange(null);
      }
    });
  }

  /** Abre la foto en grande (toca o clic para cerrar). */
  function zoomPhoto(url, alt = 'Foto de la carta') {
    const dialog = UI.dialog({ title: alt, bodyHtml: `<img class="photo-zoom" src="${url}" alt="${esc(alt)}">`,
      footerHtml: '<button type="button" class="btn btn-outline" data-close>Cerrar</button>' });
    dialog.el.classList.add('modal-wide');
    dialog.el.querySelector('[data-close]').addEventListener('click', dialog.close);
    dialog.el.querySelector('.photo-zoom').addEventListener('click', dialog.close);
  }

  // ---------- Acciones sobre una carta ----------
  const ACTIONS = {
    assign: { label: 'Asignar padrino', icon: 'heart', primary: true },
    release: { label: 'Liberar carta', icon: 'undo' },
    receive: { label: 'Marcar regalo recibido', icon: 'gift', primary: true },
    deliver: { label: 'Marcar entregado', icon: 'check', primary: true },
    revert: { label: 'Regresar a "Con padrino"', icon: 'undo' }
  };

  /** 409 de concurrencia: avisa y ofrece actualizar. Resuelve 'reload' o null. */
  function conflictNotice(err) {
    return new Promise((resolve) => {
      let choice = null;
      const dialog = UI.dialog({
        title: 'La carta cambió mientras la veías',
        description: err.message,
        footerHtml: `<button type="button" class="btn btn-outline" data-close>Cerrar</button>
          <button type="button" class="btn btn-primary" data-reload>${icon('refresh')}Actualizar</button>`,
        onClose: () => resolve(choice)
      });
      dialog.el.querySelector('[data-close]').addEventListener('click', dialog.close);
      const reload = dialog.el.querySelector('[data-reload]');
      reload.addEventListener('click', () => { choice = 'reload'; dialog.close(); });
      reload.focus();
    });
  }

  async function sponsorSearch(form, letter, state) {
    const box = form.querySelector('[data-sponsors]');
    const q = form.querySelector('[data-sponsor-q]').value.trim();
    box.innerHTML = '<p class="muted">Buscando…</p>';
    try {
      const { items } = await UI.api(`/letters/sponsor-options${UI.buildQuery({ event_id: letter.event.id, search: q })}`);
      if (!items.length) {
        box.innerHTML = `<p class="muted">No hay voluntarios activos con ese nombre.</p>`;
        return;
      }
      box.innerHTML = items.map((o) => {
        const full = o.letters_in_event >= o.limit;
        const v = o.volunteer;
        return `<label class="radio-card${full ? ' disabled' : ''}">
          <input type="radio" name="volunteer_id" value="${v.id}"${full ? ' disabled' : ''}${String(state.selected) === String(v.id) ? ' checked' : ''}>
          <span class="cell-stack"><strong>${esc(v.full_name)}</strong>
            <span class="muted">${v.phone ? esc(Phone.format(v.phone)) : ''}${v.area_of_interest === 'PADRINO' ? ' · Padrino o madrina' : ''}</span>
            <span class="${full ? 'field-error' : 'muted'}">${o.letters_in_event} de ${o.limit} cartas en este evento${full ? ' · límite alcanzado' : ''}</span></span>
        </label>`;
      }).join('');
      box.querySelectorAll('input[name="volunteer_id"]').forEach((r) => r.addEventListener('change', () => { state.selected = r.value; }));
    } catch (err) {
      box.innerHTML = `<p class="field-error">${esc(err.message)}</p>`;
    }
  }

  function actionBody(action, letter) {
    const comment = (required, placeholder) => Components.form.field({ name: 'comment', label: required ? 'Motivo de la corrección' : 'Comentario (opcional)',
      type: 'textarea', max: 255, required, full: true, rows: 2, placeholder });
    const code = `<p class="action-code"><code>${esc(letter.code)}</code> · ${esc(childLabel(letter.child))}</p>`;
    switch (action) {
      case 'assign':
        return `${code}<div class="field"><label for="sponsor-q">Buscar voluntario</label>
            <span class="search">${icon('search')}<input id="sponsor-q" class="input" type="search" data-sponsor-q placeholder="Nombre o teléfono" autocomplete="off"></span></div>
          <div class="radio-group sponsor-list" data-sponsors role="radiogroup" aria-label="Voluntarios"></div>
          <p class="field-error" data-sponsor-error hidden></p>
          ${comment(false, 'Ej. Lo eligió en la feria de cartas')}`;
      case 'release':
        return `${code}<p>La carta volverá a <strong>Pendiente</strong> y ${esc(letter.sponsor ? letter.sponsor.full_name : 'el padrino')} dejará de ser su padrino.</p>
          ${comment(false, 'Ej. No podrá comprar el regalo')}`;
      case 'receive':
        return `${code}<p>Padrino: <strong>${esc(letter.sponsor ? letter.sponsor.full_name : '—')}</strong></p>
          ${Components.form.field({ name: 'gift_notes', label: 'Notas del regalo (opcional)', type: 'textarea', max: 500, rows: 2, full: true,
            placeholder: 'Ej. Bicicleta roja, bolsa #120' }, letter.gift_notes || '')}
          ${comment(false, 'Ej. Recibido en el acopio de la zona norte')}`;
      case 'deliver':
        return `${code}<p>Confirma que la niña o niño ya recibió su regalo. <strong>Es el último paso</strong> y no se puede deshacer.</p>
          ${comment(false, 'Ej. Entregado en el evento')}`;
      case 'revert':
        return `${code}<p>La carta regresará a <strong>Con padrino</strong> (se borra la fecha de recepción). Úsalo solo para corregir un error.</p>
          ${comment(true, 'Ej. Se registró en la carta equivocada')}`;
      default:
        return '';
    }
  }

  /**
   * Abre el diálogo de la acción y la ejecuta. Resuelve con la carta actualizada, 'reload' (hubo un
   * conflicto y la persona quiere ver la versión nueva) o null (canceló).
   */
  function runAction(letter, action) {
    const meta = ACTIONS[action];
    return new Promise((resolve) => {
      let result = null;
      let conflict = false;
      const state = { selected: null };
      const dialog = UI.dialog({
        title: meta.label, as: 'form',
        bodyHtml: `<div class="form">${actionBody(action, letter)}<div class="alert alert-error" data-error role="alert" hidden></div></div>`,
        footerHtml: `<div class="modal-actions"><span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="submit" class="btn ${action === 'revert' ? 'btn-destructive' : 'btn-primary'}">${icon(meta.icon)}${esc(meta.label)}</button></div>`,
        onClose: () => { if (!conflict) resolve(result); }
      });
      const form = dialog.el;
      const errorBox = form.querySelector('[data-error]');
      form.querySelector('[data-cancel]').addEventListener('click', dialog.close);
      Components.form.bindLiveClear(form);
      if (action === 'assign') {
        const q = form.querySelector('[data-sponsor-q]');
        let t = null;
        q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => sponsorSearch(form, letter, state), 300); });
        sponsorSearch(form, letter, state);
        q.focus();
      } else {
        const first = form.querySelector('textarea');
        if (first) first.focus();
      }
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        Components.form.clearErrors(form);
        const comment = (form.elements.comment && form.elements.comment.value.trim()) || null;
        let path;
        const body = { version: letter.version, comment };
        if (action === 'assign') {
          if (!state.selected) {
            const err = form.querySelector('[data-sponsor-error]');
            err.textContent = 'Elige al voluntario que será el padrino.';
            err.hidden = false;
            return;
          }
          path = 'assign';
          body.volunteer_id = Number(state.selected);
        } else if (action === 'release') path = 'release';
        else {
          path = 'status';
          body.to_status = { receive: 'RECIBIDO', deliver: 'ENTREGADO', revert: 'ASIGNADO' }[action];
          if (action === 'revert' && !comment) { Components.form.setError(form, 'comment', 'Explica el motivo de la corrección.'); return; }
          if (action === 'receive') body.gift_notes = form.elements.gift_notes.value.trim() || null;
        }
        const button = form.querySelector('[type="submit"]');
        UI.setBusy(button, true);
        try {
          result = (await UI.api(`/letters/${letter.id}/${path}`, { method: 'POST', body })).letter;
          UI.toast(`${letter.code}: ${Cat.LETTER_STATUS_LABEL[result.status]}`, 'success');
          dialog.close();
        } catch (err) {
          UI.setBusy(button, false);
          if (err.status === 409) {
            conflict = true;
            dialog.close();
            resolve(await conflictNotice(err));
            return;
          }
          const rest = err.details ? Components.form.showErrors(form, err.details) : [err];
          if (rest.length) { errorBox.innerHTML = `${icon('alert')}<span>${esc(rest[0].message || err.message)}</span>`; errorBox.hidden = false; }
        }
      });
    });
  }

  /** Botones de las acciones disponibles (según next_actions de la API). */
  const actionButtons = (letter, { size = '' } = {}) => (letter.next_actions || []).map((a) => {
    const m = ACTIONS[a];
    return `<button type="button" class="btn ${m.primary ? 'btn-primary' : (a === 'revert' ? 'btn-ghost btn-danger-ghost' : 'btn-outline')} ${size}" data-letter-action="${a}">${icon(m.icon)}${esc(m.label)}</button>`;
  }).join('');

  return {
    STATUS_META, ACTIONS, statusMeta, statusChip, eventBadge, nextEventStatus, previewCode, childLabel,
    loadEvents, defaultEvent, eventLabel, photoUrl, compressImage, uploadPhoto, photoPicker, zoomPhoto,
    runAction, conflictNotice, actionButtons
  };
})();

if (typeof module !== 'undefined') module.exports = CartasUI;
