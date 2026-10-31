/**
 * Vista "#carta-form" (P16, alta) y "#carta-form/<id>" (edición) — módulo CARTAS.
 * Alta: evento abierto → niña o niño elegible (con consentimiento y sin carta en el evento) → deseos →
 * foto con la cámara. Al guardar muestra el código en grande para escribirlo en la carta física.
 * Parámetros de alta: evento (id), nino (id, desde la ficha de la niña o niño).
 */
const CartaForm = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const F = () => Components.form;

  const WISH_FIELDS = [
    { name: 'main_wish', label: 'Deseo principal', required: true, max: 255, full: true, placeholder: 'Ej. Bicicleta rodada 16' },
    { name: 'secondary_wish', label: 'Deseo secundario (opcional)', max: 255, full: true, placeholder: 'Ej. Libro de dinosaurios' },
    { name: 'letter_text', label: 'Transcripción de la carta (opcional)', type: 'textarea', max: 4000, rows: 4, full: true,
      hint: 'Copia lo que escribió, sin apellidos ni datos de la escuela.' }
  ];

  const REASON = {
    CONSENT_REQUIRED: 'Sin consentimiento del tutor legal',
    HAS_LETTER: 'Ya tiene carta en este evento'
  };

  function childOption(item, selectedId, ctx) {
    const c = item.child;
    const meta = [c.age !== null ? `${c.age} años` : null, c.grade, c.school && c.school.name].filter(Boolean).join(' · ');
    let reason = '';
    if (item.reason === 'HAS_LETTER') reason = `<a href="#carta/${item.letter.id}">${esc(REASON.HAS_LETTER)} (${esc(item.letter.code)})</a>`;
    else if (item.reason === 'CONSENT_REQUIRED') {
      reason = Access.canSee(ctx.user, Access.viewByKey('nino'))
        ? `<a href="#nino/${c.id}">${esc(REASON.CONSENT_REQUIRED)}: regístralo en su ficha</a>` : esc(REASON.CONSENT_REQUIRED);
    }
    return `<label class="radio-card${item.eligible ? '' : ' disabled'}">
      <input type="radio" name="child_pick" value="${c.id}"${item.eligible ? '' : ' disabled'}${String(selectedId) === String(c.id) ? ' checked' : ''}>
      <span class="cell-stack"><strong>${esc(c.display_name)}</strong><span class="muted">${esc(meta || '—')}</span>
        ${reason ? `<span class="field-error">${UI.icon('alert')} ${reason}</span>` : ''}</span></label>`;
  }

  function success(container, ctx, letter, { photoFailed }) {
    container.innerHTML = `
      <section class="card panel narrow code-success" role="status">
        <span class="empty-icon">${UI.icon('check')}</span>
        <h2>Carta registrada</h2>
        <p class="muted">Escribe este código en la carta física y en la bolsa del regalo:</p>
        <p class="big-code" tabindex="0">${esc(letter.code)}</p>
        <p>${esc(CartasUI.childLabel(letter.child))} · ${esc(letter.main_wish)}</p>
        ${photoFailed ? `<div class="alert alert-warning">${UI.icon('alert')}<span>La carta se guardó, pero la foto no se pudo subir: ${esc(photoFailed)}. Inténtalo desde la carta.</span></div>` : ''}
        <div class="form-actions centered">
          <a class="btn btn-outline" href="#carta/${letter.id}">${UI.icon('eye')}Ver carta</a>
          <a class="btn btn-primary" href="${Access.buildHash('carta-form', null, { evento: letter.event.id, n: Date.now() })}" data-again>${UI.icon('plus')}Registrar otra</a>
        </div>
      </section>`;
    container.querySelector('[data-again]').focus();
  }

  async function renderCreate(container, ctx) {
    const events = (await CartasUI.loadEvents()).filter((e) => C().LETTER_EVENT_TYPES.includes(e.event_type) && ['ABIERTO', 'EN_CURSO'].includes(e.status));
    if (!events.length) {
      container.innerHTML = `<p class="back-link"><a href="#cartas">${UI.icon('arrowLeft')}Cartas</a></p>
        <section class="card panel">${Components.empty({ iconName: 'calendarDays', title: 'No hay un evento de Navidad abierto',
          text: 'Para registrar cartas, el evento debe estar abierto o en curso.',
          actionHtml: Access.canSee(ctx.user, Access.viewByKey('eventos')) ? `<a class="btn btn-primary" href="#eventos">${UI.icon('calendarDays')}Ir a Eventos</a>` : '' })}</section>`;
      return;
    }
    let event = events.find((e) => String(e.id) === String(ctx.params.evento)) || events[0];
    let selectedChild = null;
    let photo = null;

    container.innerHTML = `
      <p class="back-link"><a href="#cartas?evento=${event.id}">${UI.icon('arrowLeft')}Cartas</a></p>
      <section class="page-header"><div><h2>Registrar carta</h2>
        <p class="muted">El código se genera al guardar. Los campos con <span class="req">*</span> son obligatorios.</p></div></section>
      <form class="card panel form form-page" id="letterForm" novalidate>
        <fieldset class="form-section"><legend>Evento</legend>
          <div class="form-grid"><div class="field full" data-field="event_id"><label for="lf-event">Evento <span class="req">*</span></label>
            <span class="select-wrap"><select id="lf-event" class="input select" name="event_id">
              ${events.map((e) => `<option value="${e.id}"${e.id === event.id ? ' selected' : ''}>${esc(CartasUI.eventLabel(e))}</option>`).join('')}
            </select></span><p class="field-error" hidden></p></div></div></fieldset>
        <fieldset class="form-section"><legend>Niña o niño</legend>
          <div class="field" data-field="child_id"><label for="lf-q">Buscar por nombre <span class="req">*</span></label>
            <span class="search">${UI.icon('search')}<input id="lf-q" class="input" type="search" data-q placeholder="Nombre o apellidos" autocomplete="off"></span>
            <p class="field-error" hidden></p></div>
          <div class="radio-group child-list" data-children role="radiogroup" aria-label="Niñas y niños"></div>
          <p class="hint">Solo se puede registrar carta a quien tiene la autorización firmada de su madre, padre o tutor legal.</p>
        </fieldset>
        <fieldset class="form-section"><legend>Deseos</legend>
          <div class="form-grid">${WISH_FIELDS.map((f) => F().field(f)).join('')}</div></fieldset>
        <fieldset class="form-section"><legend>Foto de la carta (opcional)</legend><div data-photo></div></fieldset>
        <div class="alert alert-error" id="letterAlert" role="alert" hidden></div>
        <div class="form-actions">
          <a class="btn btn-ghost" href="#cartas?evento=${event.id}">Cancelar</a>
          <button type="submit" class="btn btn-primary">${UI.icon('mail')}Registrar carta</button>
        </div>
      </form>`;
    const form = container.querySelector('#letterForm');
    const alertBox = container.querySelector('#letterAlert');
    const listEl = form.querySelector('[data-children]');
    F().bindLiveClear(form);
    CartasUI.photoPicker(form.querySelector('[data-photo]'), { onChange: (b) => { photo = b; } });

    let seq = 0;
    async function searchChildren() {
      const mySeq = ++seq;
      listEl.innerHTML = '<p class="muted">Buscando…</p>';
      try {
        const { items } = await UI.api(`/letters/eligible-children${UI.buildQuery({ event_id: event.id, search: form.querySelector('[data-q]').value.trim() })}`);
        if (mySeq !== seq) return;
        let html = items.map((it) => childOption(it, selectedChild && selectedChild.id, ctx)).join('');
        if (selectedChild && !items.some((it) => it.child.id === selectedChild.id)) {
          html = childOption({ child: selectedChild, eligible: true }, selectedChild.id, ctx) + html;
        }
        listEl.innerHTML = html || '<p class="muted">No hay niñas ni niños activos con ese nombre.</p>';
        listEl.querySelectorAll('input[name="child_pick"]').forEach((r) => r.addEventListener('change', () => {
          const it = items.find((x) => String(x.child.id) === r.value);
          selectedChild = it ? it.child : selectedChild;
          F().setError(form, 'child_id', '');
        }));
      } catch (err) { if (mySeq === seq) listEl.innerHTML = `<p class="field-error">${esc(err.message)}</p>`; }
    }
    let t = null;
    form.querySelector('[data-q]').addEventListener('input', () => { clearTimeout(t); t = setTimeout(searchChildren, 300); });
    form.elements.event_id.addEventListener('change', (e) => {
      event = events.find((x) => String(x.id) === e.target.value);
      selectedChild = null;
      searchChildren();
    });

    // Preselección desde la ficha de la niña o niño
    if (ctx.params.nino && Access.canSee(ctx.user, Access.viewByKey('nino'))) {
      try {
        const { child } = await UI.api(`/children/${Number(ctx.params.nino)}`);
        selectedChild = { id: child.id, display_name: child.full_name, age: child.age, grade: child.grade, school: child.school };
        form.querySelector('[data-q]').value = child.first_name;
      } catch { /* sin preselección */ }
    }
    searchChildren();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.hidden = true;
      F().clearErrors(form);
      const v = F().read(form, WISH_FIELDS);
      const errors = Listado.basicValidate(v, WISH_FIELDS);
      if (!selectedChild) errors.unshift({ field: 'child_id', message: 'Elige a la niña o niño de la carta.' });
      if (errors.length) { F().showErrors(form, errors); return; }
      const button = form.querySelector('[type="submit"]');
      UI.setBusy(button, true);
      try {
        let { letter } = await UI.api('/letters', { method: 'POST', body: { event_id: event.id, child_id: selectedChild.id, ...v } });
        let photoFailed = null;
        if (photo) {
          try { letter = (await CartasUI.uploadPhoto(letter.id, photo)).letter; } catch (err) { photoFailed = err.message; }
        }
        UI.toast(`Carta ${letter.code} registrada`, 'success');
        success(container, ctx, letter, { photoFailed });
        window.scrollTo(0, 0);
      } catch (err) {
        UI.setBusy(button, false);
        if (err.code === 'LETTER_ALREADY_EXISTS') {
          Listado.duplicateNotice(err, { title: 'Esta niña o niño ya tiene carta', href: `#carta/${err.data.existing_id}`, linkText: 'Ver su carta' });
          return;
        }
        const rest = err.details ? F().showErrors(form, err.details) : [err];
        if (rest.length) { alertBox.innerHTML = `${UI.icon('alert')}<span>${esc(rest[0].message || err.message)}</span>`; alertBox.hidden = false; }
      }
    });
  }

  async function renderEdit(container, ctx, id) {
    const { letter } = await UI.api(`/letters/${id}`);
    const locked = letter.status !== 'PENDIENTE' && ctx.user.role !== 'ADMIN';
    const fields = [...WISH_FIELDS, { name: 'gift_notes', label: 'Notas del regalo (opcional)', type: 'textarea', max: 500, rows: 2, full: true,
      hint: 'Ej. Se cambió por talla 8 · bolsa #120' }];
    container.innerHTML = `
      <p class="back-link"><a href="#carta/${letter.id}">${UI.icon('arrowLeft')}${esc(letter.code)}</a></p>
      <section class="page-header"><div><h2>Editar carta ${esc(letter.code)}</h2>
        <p class="muted">${esc(CartasUI.childLabel(letter.child))} · ${CartasUI.statusChip(letter.status)}</p></div></section>
      ${locked ? `<div class="alert alert-info" role="note">${UI.icon('lock')}<span>La carta ya tiene padrino: solo un administrador puede cambiar los deseos o la transcripción. Sí puedes editar las notas del regalo.</span></div>` : ''}
      <form class="card panel form form-page" id="letterEdit" novalidate>
        <div class="form-grid">${fields.map((f) => F().field(f, letter[f.name] ?? '')).join('')}</div>
        <div class="alert alert-error" id="editAlert" role="alert" hidden></div>
        <div class="form-actions"><a class="btn btn-ghost" href="#carta/${letter.id}">Cancelar</a>
          <button type="submit" class="btn btn-primary">Guardar cambios</button></div>
      </form>`;
    const form = container.querySelector('#letterEdit');
    if (locked) WISH_FIELDS.forEach((f) => { form.elements[f.name].disabled = true; });
    const alertBox = container.querySelector('#editAlert');
    F().bindLiveClear(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.hidden = true;
      F().clearErrors(form);
      const editable = locked ? fields.filter((f) => f.name === 'gift_notes') : fields;
      const v = F().read(form, editable);
      const errors = Listado.basicValidate(v, editable);
      if (errors.length) { F().showErrors(form, errors); return; }
      const changes = {};
      for (const [k, val] of Object.entries(v)) if ((letter[k] ?? null) !== (val ?? null)) changes[k] = val;
      if (!Object.keys(changes).length) { location.hash = `#carta/${letter.id}`; UI.toast('No hay cambios que guardar'); return; }
      const button = form.querySelector('[type="submit"]');
      UI.setBusy(button, true);
      try {
        await UI.api(`/letters/${letter.id}`, { method: 'PATCH', body: { ...changes, version: letter.version } });
        UI.toast('Cambios guardados', 'success');
        location.hash = `#carta/${letter.id}`;
      } catch (err) {
        UI.setBusy(button, false);
        if (err.status === 409) { if (await CartasUI.conflictNotice(err) === 'reload') renderEdit(container, ctx, id); return; }
        const rest = err.details ? F().showErrors(form, err.details) : [err];
        if (rest.length) { alertBox.innerHTML = `${UI.icon('alert')}<span>${esc(rest[0].message || err.message)}</span>`; alertBox.hidden = false; }
      }
    });
    const first = form.querySelector('textarea:not([disabled]), input:not([disabled])');
    if (first) first.focus();
  }

  async function mount(container, ctx) {
    container.innerHTML = Components.loading(6);
    try {
      if (ctx.id) await renderEdit(container, ctx, Number(ctx.id));
      else await renderCreate(container, ctx);
    } catch (err) {
      if (err.status === 404) CartaDetalle.notFound(container);
      else Components.error(container, err, () => mount(container, ctx));
    }
  }

  return { mount };
})();
