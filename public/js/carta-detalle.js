/**
 * Vista "#carta/<id>" (P17, módulo CARTAS): código y estatus, foto (toca para ampliar), deseos, niña o niño
 * (completo o restringido según el permiso BENEFICIARIOS), padrino, acciones según el estatus e historial.
 */
const CartaDetalle = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const dash = '<span class="muted">—</span>';
  const val = (v) => (v === null || v === undefined || v === '' ? dash : esc(v));
  let photoUrl = null;

  function notFound(container) {
    container.innerHTML = `<section class="card panel narrow" style="margin: 24px auto 0">
      ${Components.empty({ iconName: 'mail', title: 'No encontramos esta carta.',
        actionHtml: `<a class="btn btn-outline" href="#cartas">${UI.icon('arrowLeft')}Volver a Cartas</a>` })}</section>`;
  }

  const HISTORY_TEXT = {
    'null>PENDIENTE': 'Carta registrada',
    'PENDIENTE>ASIGNADO': 'Padrino asignado',
    'ASIGNADO>PENDIENTE': 'Padrino liberado',
    'ASIGNADO>RECIBIDO': 'Regalo recibido en acopio',
    'RECIBIDO>ENTREGADO': 'Regalo entregado',
    'RECIBIDO>ASIGNADO': 'Corrección: regresó a "Con padrino"'
  };

  function timeline(items) {
    if (!items.length) return '<p class="muted">Sin movimientos.</p>';
    return `<ol class="timeline">${items.map((h) => {
      const text = HISTORY_TEXT[`${h.from_status}>${h.to_status}`] || `${h.from_status || '—'} → ${h.to_status}`;
      return `<li class="timeline-item">
        <span class="timeline-dot letter-dot-${h.to_status.toLowerCase()}" aria-hidden="true"></span>
        <div><p><strong>${esc(text)}</strong> ${CartasUI.statusChip(h.to_status)}</p>
          ${h.sponsor ? `<p>Padrino: ${esc(h.sponsor.full_name)}</p>` : ''}
          ${h.comment ? `<p class="quote">${esc(h.comment)}</p>` : ''}
          <p class="muted">${esc(Fechas.formatDateTime(h.created_at))} · ${h.changed_by ? esc(h.changed_by.full_name) : 'Usuario eliminado'}</p></div>
      </li>`;
    }).join('')}</ol>`;
  }

  function stepper(letter) {
    const steps = [
      ['PENDIENTE', 'Registrada', letter.created_at], ['ASIGNADO', 'Con padrino', letter.assigned_at],
      ['RECIBIDO', 'Regalo recibido', letter.received_at], ['ENTREGADO', 'Entregado', letter.delivered_at]
    ];
    const current = C().LETTER_STATUSES.indexOf(letter.status);
    return `<ol class="steps" aria-label="Avance de la carta">${steps.map(([st, label, at], i) => `
      <li class="step${i <= current ? ' done' : ''}${i === current ? ' current' : ''}"${i === current ? ' aria-current="step"' : ''}>
        <span class="step-dot">${i < current ? UI.icon('check') : i + 1}</span>
        <span class="step-label">${esc(label)}${i <= current && at ? `<span class="muted">${esc(Fechas.formatDate(at))}</span>` : ''}</span></li>`).join('')}</ol>`;
  }

  async function renderPhoto(el, letter, reload) {
    const closed = letter.event.status === 'CERRADO';
    if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; }
    if (letter.has_photo) {
      el.innerHTML = Components.loading(1);
      photoUrl = await CartasUI.photoUrl(letter.id);
      if (!el.isConnected) return;
    }
    el.innerHTML = `
      ${photoUrl ? `<button type="button" class="photo-frame" data-zoom aria-label="Ampliar la foto de la carta"><img src="${photoUrl}" alt="Foto de la carta ${esc(letter.code)}"></button>`
        : `<div class="photo-empty">${UI.icon('image')}<span>Sin foto de la carta</span></div>`}
      ${closed ? '' : `<div class="row-actions photo-actions">
        <label class="btn btn-outline btn-sm">${UI.icon('camera')}<span>${letter.has_photo ? 'Cambiar foto' : 'Agregar foto'}</span>
          <input type="file" accept="image/*" capture="environment" class="sr-only" data-file></label>
        ${letter.has_photo ? `<button type="button" class="btn btn-ghost btn-sm btn-danger-ghost" data-remove>${UI.icon('trash')}<span>Quitar</span></button>` : ''}
      </div>
      <p class="hint">${UI.icon('shield')} Cubre apellidos y escuela antes de fotografiar.</p>`}`;
    const zoom = el.querySelector('[data-zoom]');
    if (zoom) zoom.addEventListener('click', () => CartasUI.zoomPhoto(photoUrl, `Carta ${letter.code}`));
    const file = el.querySelector('[data-file]');
    if (file) file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const label = file.closest('label');
      label.classList.add('is-busy');
      label.setAttribute('aria-busy', 'true');
      label.querySelector('span').textContent = 'Subiendo foto…';
      try {
        const blob = await CartasUI.compressImage(f);
        await CartasUI.uploadPhoto(letter.id, blob);
        UI.toast('Foto guardada', 'success');
      } catch (err) { UI.toast(err.message, 'error'); }
      reload();
    });
    const remove = el.querySelector('[data-remove]');
    if (remove) remove.addEventListener('click', async () => {
      if (!await UI.confirm({ title: '¿Quitar la foto?', message: 'La foto se borra del sistema. Puedes tomar otra después.', confirmText: 'Quitar foto', danger: true })) return;
      try { await UI.api(`/letters/${letter.id}/photo`, { method: 'DELETE' }); UI.toast('Foto eliminada', 'success'); reload(); } catch (err) { UI.toast(err.message, 'error'); }
    });
  }

  function childPanel(c, ctx) {
    const canSeeChild = !c.restricted && Access.canSee(ctx.user, Access.viewByKey('nino'));
    return `<section class="card panel"><h3 class="panel-title">Niña o niño</h3>
      <dl class="data-list">
        <dt>Nombre</dt><dd>${canSeeChild ? `<a class="strong-link" href="#nino/${c.id}">${esc(c.display_name)}</a>` : esc(c.display_name)}</dd>
        <dt>Edad</dt><dd>${c.age !== null ? `${c.age} años` : dash}</dd>
        <dt>Género</dt><dd>${esc(C().GENDER_LABEL[c.gender] || '—')}</dd>
        <dt>Grado y grupo</dt><dd>${val([c.grade, c.group_name && `Grupo ${c.group_name}`].filter(Boolean).join(' · '))}</dd>
        <dt>Escuela</dt><dd>${c.school ? esc(c.school.name) : '<span class="muted">Sin escuela</span>'}</dd>
      </dl>
      ${c.restricted ? `<p class="hint" style="margin-top:12px">${UI.icon('shield')} Vista restringida: los datos completos solo se ven con el módulo Beneficiarios.</p>` : ''}
    </section>`;
  }

  async function mount(container, ctx) {
    const id = Number(ctx.id);
    if (!Number.isInteger(id) || id <= 0) { notFound(container); return; }
    container.innerHTML = Components.loading(6);
    let letter;
    let history;
    try {
      [{ letter }, { items: history }] = await Promise.all([UI.api(`/letters/${id}`), UI.api(`/letters/${id}/history`)]);
    } catch (err) {
      if (err.status === 404) notFound(container); else Components.error(container, err, () => mount(container, ctx));
      return;
    }
    const reload = () => mount(container, ctx);
    const closed = letter.event.status === 'CERRADO';
    const editable = !closed;
    container.innerHTML = `
      <p class="back-link"><a href="#cartas?evento=${letter.event.id}">${UI.icon('arrowLeft')}Cartas · ${esc(letter.event.name)}</a></p>
      <section class="page-header">
        <div><h2 class="letter-title"><span class="letter-code">${esc(letter.code)}</span> ${CartasUI.statusChip(letter.status)}</h2>
          <p class="muted">${esc(letter.event.name)} · ${esc(CartasUI.childLabel(letter.child))}</p></div>
        <div class="header-actions">${editable ? `<a class="btn btn-outline" href="#carta-form/${letter.id}">${UI.icon('pencil')}Editar</a>` : ''}</div>
      </section>
      ${closed ? `<div class="alert alert-warning" role="note">${UI.icon('lock')}<span>El evento está cerrado: esta carta es de solo lectura.</span></div>` : ''}
      <section class="card panel progress-panel">${stepper(letter)}
        ${letter.next_actions.length ? `<div class="action-bar" data-actions>${CartasUI.actionButtons(letter)}</div>` : ''}
        ${letter.status === 'ENTREGADO' ? `<p class="hint" style="margin-top:12px">${UI.icon('check')} Regalo entregado. Trazabilidad completa en el historial.</p>` : ''}
      </section>
      <div class="detail-grid">
        <div>
          <section class="card panel"><h3 class="panel-title">Carta</h3><div data-photo></div>
            <dl class="data-list" style="margin-top:16px">
              <dt>Deseo principal</dt><dd><strong>${esc(letter.main_wish)}</strong></dd>
              <dt>Deseo secundario</dt><dd>${val(letter.secondary_wish)}</dd>
              <dt>Transcripción</dt><dd>${letter.letter_text ? `<p class="letter-text">${esc(letter.letter_text)}</p>` : dash}</dd>
              <dt>Notas del regalo</dt><dd>${val(letter.gift_notes)}</dd>
            </dl></section>
        </div>
        <div>
          ${childPanel(letter.child, ctx)}
          <section class="card panel"><h3 class="panel-title">Padrino</h3>
            ${letter.sponsor ? `<dl class="data-list">
                <dt>Nombre</dt><dd>${Access.canSee(ctx.user, Access.viewByKey('voluntario')) ? `<a class="strong-link" href="#voluntario/${letter.sponsor.id}">${esc(letter.sponsor.full_name)}</a>` : esc(letter.sponsor.full_name)}</dd>
                <dt>Teléfono</dt><dd>${Listado.phoneLink(letter.sponsor.phone)}</dd>
                <dt>Correo</dt><dd>${letter.sponsor.email ? `<a href="mailto:${esc(letter.sponsor.email)}">${esc(letter.sponsor.email)}</a>` : dash}</dd>
                <dt>Asignada</dt><dd>${letter.assigned_at ? esc(Fechas.formatDateTime(letter.assigned_at)) : dash}</dd>
              </dl>` : '<p class="muted">Sin padrino todavía.</p>'}
          </section>
          <section class="card panel"><h3 class="panel-title">Historial</h3>${timeline(history)}
            ${ctx.user.role === 'ADMIN' ? `<p style="margin-top:12px"><a class="strong-link" href="#bitacora?objeto=${letter.id}&entidad=letters">Ver en la bitácora →</a></p>` : ''}
          </section>
        </div>
      </div>`;
    renderPhoto(container.querySelector('[data-photo]'), letter, reload);
    container.querySelectorAll('[data-letter-action]').forEach((b) => b.addEventListener('click', async () => {
      const result = await CartasUI.runAction(letter, b.dataset.letterAction);
      if (result) reload();
    }));
  }

  return { mount, notFound };
})();
