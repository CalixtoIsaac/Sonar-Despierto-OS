/**
 * Vista "#voluntario/<id>" (módulo VOLUNTARIOS): datos personales, contacto de emergencia, notas
 * médicas resaltadas, participación y acciones (editar, dar de baja / reactivar).
 */
const VoluntarioDetalle = (() => {
  const esc = (v) => UI.escape(v);
  const dash = '<span class="muted">—</span>';
  const val = (v) => (v === null || v === undefined || v === '' ? dash : esc(v));

  function notFound(container) {
    container.innerHTML = `<section class="card panel narrow" style="margin: 24px auto 0">
      ${Components.empty({ iconName: 'users', title: 'No encontramos a este voluntario.',
        actionHtml: `<a class="btn btn-outline" href="#voluntarios">${UI.icon('arrowLeft')}Volver a Voluntarios</a>` })}</section>`;
  }

  /** Eventos en los que participa y cartas que apadrina (F4). */
  function eventsPanel(v, ctx) {
    const canEvents = Access.canSee(ctx.user, Access.viewByKey('evento'));
    const canLetters = Access.canSee(ctx.user, Access.viewByKey('carta'));
    const events = (v.events || []).map((p) => `<li>
        ${canEvents ? `<a class="strong-link" href="#evento/${p.event.id}">${esc(p.event.name)}</a>` : `<strong>${esc(p.event.name)}</strong>`}
        <span class="badge badge-plain">${esc(Catalogos.PARTICIPATION_STATUS_LABEL[p.status])}</span>
        <span class="muted">${esc(Catalogos.VOLUNTEER_AREA_LABEL[p.area])}</span></li>`).join('');
    const letters = (v.sponsored_letters || []).map((l) => `<li>
        ${canLetters ? `<a class="strong-link letter-code" href="#carta/${l.id}">${esc(l.code)}</a>` : `<span class="letter-code">${esc(l.code)}</span>`}
        ${CartasUI.statusChip(l.status)}<span class="muted">${esc(l.event.name)}</span></li>`).join('');
    return `<section class="card panel"><h3 class="panel-title">Eventos y cartas</h3>
      <p class="field-label">Eventos</p>${events ? `<ul class="mini-list">${events}</ul>` : '<p class="muted">Aún no participa en eventos.</p>'}
      <p class="field-label" style="margin-top:14px">Cartas que apadrina</p>${letters ? `<ul class="mini-list">${letters}</ul>` : '<p class="muted">No apadrina cartas.</p>'}
    </section>`;
  }

  async function toggle(v, reload) {
    if (v.is_active) {
      const ok = await UI.confirm({ title: `¿Dar de baja a ${v.full_name}?`,
        message: 'Su registro se conserva y podrás reactivarlo después.', confirmText: 'Dar de baja', danger: true });
      if (!ok) return;
    }
    try {
      await UI.api(`/volunteers/${v.id}`, { method: 'PATCH', body: { is_active: !v.is_active } });
      UI.toast(v.is_active ? 'Voluntario dado de baja' : 'Voluntario reactivado', 'success');
      reload();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  async function mount(container, ctx) {
    const id = Number(ctx.id);
    if (!Number.isInteger(id) || id <= 0) { notFound(container); return; }
    container.innerHTML = Components.loading(6);
    let v;
    try { v = (await UI.api(`/volunteers/${id}`)).volunteer; } catch (err) {
      if (err.status === 404) notFound(container); else Components.error(container, err, () => mount(container, ctx));
      return;
    }
    const isAdmin = ctx.user.role === 'ADMIN';
    container.innerHTML = `
      <p class="back-link"><a href="#voluntarios">${UI.icon('arrowLeft')}Voluntarios</a></p>
      <section class="page-header">
        <div><h2>${esc(v.full_name)}</h2>
          <p class="muted">${esc(Catalogos.VOLUNTEER_AREA_LABEL[v.area_of_interest])} · Talla ${esc(v.shirt_size)} · ${Listado.activeBadge(v)}</p></div>
        <div class="header-actions">
          <a class="btn btn-outline" href="#voluntario-form/${v.id}">${UI.icon('pencil')}Editar</a>
          <button type="button" class="btn btn-outline" data-toggle>${UI.icon(v.is_active ? 'trash' : 'refresh')}${v.is_active ? 'Dar de baja' : 'Reactivar'}</button>
        </div>
      </section>
      ${v.medical_notes ? `<div class="alert alert-warning medical" role="note">${UI.icon('heart')}<span><strong>Notas médicas:</strong> ${esc(v.medical_notes)}</span></div>` : ''}
      <div class="detail-grid">
        <div>
          <section class="card panel"><h3 class="panel-title">Datos personales</h3>
            <dl class="data-list">
              <dt>Teléfono</dt><dd>${Listado.phoneLink(v.phone)}</dd>
              <dt>Correo</dt><dd>${v.email ? `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>` : dash}</dd>
              <dt>Nacimiento</dt><dd>${v.birth_date ? `${esc(Fechas.formatDate(v.birth_date))} <span class="muted">(${v.age} años)</span>` : dash}</dd>
              <dt>Ciudad</dt><dd>${val(v.city)}</dd>
              <dt>Ocupación</dt><dd>${val(v.occupation)}</dd>
            </dl></section>
          <section class="card panel"><h3 class="panel-title">Contacto de emergencia</h3>
            <dl class="data-list">
              <dt>Nombre</dt><dd>${val(v.emergency_contact_name)}</dd>
              <dt>Teléfono</dt><dd>${Listado.phoneLink(v.emergency_contact_phone)}</dd>
              <dt>Parentesco</dt><dd>${val(v.emergency_contact_relationship)}</dd>
            </dl></section>
        </div>
        <div>
          <section class="card panel"><h3 class="panel-title">Participación</h3>
            <dl class="data-list">
              <dt>Área de apoyo</dt><dd>${esc(Catalogos.VOLUNTEER_AREA_LABEL[v.area_of_interest])}</dd>
              <dt>Talla de playera</dt><dd><span class="badge badge-plain">${esc(v.shirt_size)}</span></dd>
              <dt>Observaciones</dt><dd>${val(v.notes)}</dd>
            </dl>
          </section>
          ${eventsPanel(v, ctx)}
          <section class="card panel"><h3 class="panel-title">Registro</h3>
            <dl class="data-list">
              <dt>Aviso de privacidad</dt><dd>Aceptado el ${esc(Fechas.formatDateTime(v.privacy_consent_at))}</dd>
              <dt>Registrado por</dt><dd>${v.created_by ? esc(v.created_by.full_name) : dash} <span class="muted">el ${esc(Fechas.formatDateTime(v.created_at))}</span></dd>
              <dt>Última modificación</dt><dd>${esc(Fechas.formatDateTime(v.updated_at))}</dd>
            </dl>
            ${isAdmin ? `<p style="margin-top:12px"><a class="strong-link" href="#bitacora?objeto=${v.id}&entidad=volunteers">Ver su historial en la bitácora →</a></p>` : ''}
          </section>
        </div>
      </div>`;
    container.querySelector('[data-toggle]').addEventListener('click', () => toggle(v, () => mount(container, ctx)));
  }

  return { mount, notFound };
})();
