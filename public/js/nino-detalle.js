/**
 * Vista "#nino/<id>" (módulo BENEFICIARIOS): ficha de la niña o niño, escuela, tutor responsable,
 * madre/padre o tutor legal con su consentimiento, observaciones y acciones.
 */
const NinoDetalle = (() => {
  const esc = (v) => UI.escape(v);
  const dash = '<span class="muted">—</span>';
  const val = (v) => (v === null || v === undefined || v === '' ? dash : esc(v));

  function notFound(container) {
    container.innerHTML = `<section class="card panel narrow" style="margin: 24px auto 0">
      ${Components.empty({ iconName: 'baby', title: 'No encontramos este registro.',
        actionHtml: `<a class="btn btn-outline" href="#ninos">${UI.icon('arrowLeft')}Volver a Niñas y niños</a>` })}</section>`;
  }

  /** Cartas por evento; "Registrar carta" si tiene consentimiento y la persona tiene el módulo Cartas. */
  function lettersPanel(c, ctx) {
    const canLetters = Access.canSee(ctx.user, Access.viewByKey('cartas'));
    const items = c.letters || [];
    const list = items.length ? `<ul class="mini-list">${items.map((l) => `<li>
        ${canLetters ? `<a class="strong-link letter-code" href="#carta/${l.id}">${esc(l.code)}</a>` : `<span class="letter-code">${esc(l.code)}</span>`}
        ${CartasUI.statusChip(l.status)}<span class="muted">${esc(l.event.name)} · ${esc(l.main_wish)}</span></li>`).join('')}</ul>`
      : '<p class="muted">Aún no tiene cartas.</p>';
    const action = canLetters && c.is_active
      ? (c.guardian_consent
        ? `<a class="btn btn-outline btn-sm" href="#carta-form?nino=${c.id}">${UI.icon('plus')}Registrar carta</a>`
        : '<p class="hint">Para registrar su carta primero marca el consentimiento del tutor legal.</p>')
      : '';
    return `<section class="card panel"><div class="panel-head"><h3 class="panel-title">Cartas de Navidad</h3>${action.startsWith('<a') ? action : ''}</div>
      ${list}${action.startsWith('<p') ? action : ''}</section>`;
  }

  async function toggle(c, reload) {
    if (c.is_active) {
      const ok = await UI.confirm({ title: `¿Dar de baja a ${c.full_name}?`,
        message: 'Su registro se conserva (con su historial) y podrás reactivarlo después.', confirmText: 'Dar de baja', danger: true });
      if (!ok) return;
    }
    try {
      await UI.api(`/children/${c.id}`, { method: 'PATCH', body: { is_active: !c.is_active } });
      UI.toast(c.is_active ? 'Registro dado de baja' : 'Registro reactivado', 'success');
      reload();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  async function mount(container, ctx) {
    const id = Number(ctx.id);
    if (!Number.isInteger(id) || id <= 0) { notFound(container); return; }
    container.innerHTML = Components.loading(6);
    let c;
    try { c = (await UI.api(`/children/${id}`)).child; } catch (err) {
      if (err.status === 404) notFound(container); else Components.error(container, err, () => mount(container, ctx));
      return;
    }
    container.innerHTML = `
      <p class="back-link"><a href="#ninos">${UI.icon('arrowLeft')}Niñas y niños</a></p>
      <section class="page-header">
        <div><h2>${esc(c.full_name)}</h2>
          <p class="muted">${c.age} años · ${esc(Catalogos.GENDER_LABEL[c.gender])}${c.is_active ? '' : ` · ${Listado.activeBadge(c)}`}</p></div>
        <div class="header-actions">
          <a class="btn btn-outline" href="#nino-form/${c.id}">${UI.icon('pencil')}Editar</a>
          <button type="button" class="btn btn-outline" data-toggle>${UI.icon(c.is_active ? 'trash' : 'refresh')}${c.is_active ? 'Dar de baja' : 'Reactivar'}</button>
        </div>
      </section>
      ${c.guardian_consent ? '' : `<div class="alert alert-warning" role="note">${UI.icon('alert')}<span>Falta la autorización firmada de la madre, padre o tutor legal. Sin ella no se podrá registrar su carta de Navidad.</span></div>`}
      <div class="detail-grid">
        <div>
          <section class="card panel"><h3 class="panel-title">Ficha</h3>
            <dl class="data-list">
              <dt>Nombre(s)</dt><dd>${esc(c.first_name)}</dd>
              <dt>Apellidos</dt><dd>${esc(c.last_name)}</dd>
              <dt>Nacimiento</dt><dd>${esc(Fechas.formatDate(c.birth_date))} <span class="muted">(${c.age} años)</span></dd>
              <dt>Género</dt><dd>${esc(Catalogos.GENDER_LABEL[c.gender])}</dd>
              <dt>Observaciones</dt><dd>${val(c.notes)}</dd>
            </dl></section>
          <section class="card panel"><h3 class="panel-title">Escuela y grupo</h3>
            <dl class="data-list">
              <dt>Escuela</dt><dd>${c.school ? `${esc(c.school.name)}${c.school.zone ? ` <span class="muted">(${esc(c.school.zone)})</span>` : ''}` : '<span class="muted">Sin escuela</span>'}</dd>
              <dt>Grado</dt><dd>${val(c.grade)}</dd>
              <dt>Grupo</dt><dd>${val(c.group_name)}</dd>
              <dt>Tutor responsable</dt><dd>${c.tutor ? `${esc(c.tutor.full_name)} · ${Listado.phoneLink(c.tutor.phone)}` : '<span class="muted">Sin tutor asignado</span>'}</dd>
            </dl></section>
        </div>
        <div>
          <section class="card panel"><h3 class="panel-title">Madre, padre o tutor legal</h3>
            <dl class="data-list">
              <dt>Nombre</dt><dd>${esc(c.guardian_name)}</dd>
              <dt>Parentesco</dt><dd>${val(c.guardian_relationship)}</dd>
              <dt>Teléfono</dt><dd>${Listado.phoneLink(c.guardian_phone)}</dd>
              <dt>Consentimiento</dt><dd>${Ninos.consentBadge(c)}${c.guardian_consent_at ? `<br><span class="muted">Registrado el ${esc(Fechas.formatDateTime(c.guardian_consent_at))}</span>` : ''}</dd>
            </dl></section>
          ${lettersPanel(c, ctx)}
          <section class="card panel"><h3 class="panel-title">Registro</h3>
            <dl class="data-list">
              <dt>Registrado por</dt><dd>${c.created_by ? esc(c.created_by.full_name) : dash} <span class="muted">el ${esc(Fechas.formatDateTime(c.created_at))}</span></dd>
              <dt>Última modificación</dt><dd>${esc(Fechas.formatDateTime(c.updated_at))}</dd>
            </dl>
            ${ctx.user.role === 'ADMIN' ? `<p style="margin-top:12px"><a class="strong-link" href="#bitacora?objeto=${c.id}&entidad=children">Ver su historial en la bitácora →</a></p>` : ''}
          </section>
        </div>
      </div>`;
    container.querySelector('[data-toggle]').addEventListener('click', () => toggle(c, () => mount(container, ctx)));
  }

  return { mount, notFound };
})();
