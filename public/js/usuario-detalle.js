/**
 * Vista "#usuario/<id>" (solo ADMIN): cuenta, módulos, solicitud, acciones y actividad en la bitácora.
 */
const UsuarioDetalle = (() => {
  const esc = (v) => UI.escape(v);
  const D = () => UsuariosDialogos;

  function notFound(container) {
    container.innerHTML = `
      <section class="card panel narrow" style="margin: 24px auto 0">
        ${Components.empty({ iconName: 'userX', title: 'No encontramos este usuario.',
          actionHtml: `<a class="btn btn-outline" href="#usuarios">${UI.icon('arrowLeft')}Volver a Usuarios</a>` })}
      </section>`;
  }

  function accountPanel(u) {
    const status = u.account_status === 'APROBADA'
      ? (u.is_active ? '<span class="badge badge-success">Activa</span>' : '<span class="badge badge-danger">Inactiva</span>')
      : `<span class="badge ${u.account_status === 'PENDIENTE' ? 'badge-warning' : 'badge-danger'}">${esc(Access.ACCOUNT_STATUS_LABEL[u.account_status])}</span>`;
    return `
      <section class="card panel">
        <h3 class="panel-title">Cuenta</h3>
        <dl class="data-list">
          <dt>Correo</dt><dd>${esc(u.email)}</dd>
          <dt>Teléfono</dt><dd>${u.phone ? `<a href="tel:${esc(u.phone)}">${esc(Phone.format(u.phone))}</a>` : '<span class="muted">Sin teléfono</span>'}</dd>
          <dt>Rol</dt><dd>${esc(Access.ROLE_LABEL[u.role])}</dd>
          <dt>Estado</dt><dd>${status}</dd>
          <dt>Último acceso</dt><dd>${u.last_login_at ? `${esc(Fechas.formatDateTime(u.last_login_at))} <span class="muted">(${esc(Fechas.formatRelative(u.last_login_at))})</span>` : '<span class="muted">Nunca</span>'}</dd>
          <dt>Creada</dt><dd>${esc(Fechas.formatDateTime(u.created_at))}</dd>
        </dl>
      </section>`;
  }

  function modulesPanel(u) {
    let body;
    if (u.account_status !== 'APROBADA') body = '<p class="muted">La cuenta aún no tiene módulos: primero debe aprobarse.</p>';
    else if (u.role === 'ADMIN') body = '<p><span class="badge badge-sun badge-plain">Todos los módulos</span> <span class="muted">(administrador)</span></p>';
    else body = D().moduleBadges(u.modules, { empty: 'Sin módulos asignados' });
    const notGranted = (u.requested_modules || []).filter((m) => u.role !== 'ADMIN' && !u.modules.includes(m));
    return `
      <section class="card panel">
        <h3 class="panel-title">Módulos</h3>
        ${body}
        ${u.requested_modules && u.requested_modules.length ? `
          <p class="hint" style="margin-top:12px">Solicitó: ${u.requested_modules.map((m) => esc(Access.MODULE_INFO[m]?.label || m)
            + (notGranted.includes(m) && u.account_status === 'APROBADA' ? ' (no concedido)' : '')).join(', ')}</p>` : ''}
      </section>`;
  }

  function requestPanel(u) {
    if (!u.confidentiality_accepted_at) return '';
    const reviewed = u.reviewed_at
      ? `<dt>Revisada por</dt><dd>${esc(u.reviewed_by ? u.reviewed_by.full_name : 'Un administrador')} el ${esc(Fechas.formatDateTime(u.reviewed_at))}</dd>`
      : '<dt>Revisión</dt><dd><span class="muted">Pendiente</span></dd>';
    return `
      <section class="card panel">
        <h3 class="panel-title">Solicitud</h3>
        <dl class="data-list">
          <dt>Nota</dt><dd>${u.registration_note ? `“${esc(u.registration_note)}”` : '<span class="muted">Sin nota</span>'}</dd>
          <dt>Confidencialidad</dt><dd>Aceptó el compromiso el ${esc(Fechas.formatDateTime(u.confidentiality_accepted_at))}</dd>
          ${reviewed}
          ${u.review_note ? `<dt>${u.account_status === 'RECHAZADA' ? 'Motivo' : 'Nota de revisión'}</dt><dd>${esc(u.review_note)}</dd>` : ''}
        </dl>
      </section>`;
  }

  function actionButtons(u, me) {
    const self = u.id === me.id;
    if (u.account_status === 'PENDIENTE') {
      return `<button type="button" class="btn btn-primary" data-act="review">${UI.icon('userCheck')}Revisar solicitud</button>
        <button type="button" class="btn btn-outline" data-act="delete">${UI.icon('trash')}Eliminar</button>`;
    }
    if (u.account_status === 'RECHAZADA') {
      return `<button type="button" class="btn btn-outline" data-act="approve">Aprobar de todos modos</button>
        <button type="button" class="btn btn-outline" data-act="delete">${UI.icon('trash')}Eliminar</button>`;
    }
    return `<button type="button" class="btn btn-outline" data-act="edit">${UI.icon('pencil')}Editar</button>
      ${self ? '' : `<button type="button" class="btn btn-outline" data-act="reset">${UI.icon('key')}Restablecer contraseña</button>
        <button type="button" class="btn btn-outline" data-act="toggle">${UI.icon(u.is_active ? 'userX' : 'userCheck')}${u.is_active ? 'Desactivar' : 'Activar'}</button>`}`;
  }

  // ---------- Actividad ----------
  function activityRows(items) {
    if (!items.length) return '<p class="muted">Sin registros.</p>';
    return `<ul class="activity-list">${items.map((log) => {
      const detail = Audit.describeAuditDetail(log);
      return `<li>
        <span class="activity-when" title="${esc(Fechas.formatDateTime(log.created_at))}">${esc(Fechas.formatRelative(log.created_at))}</span>
        <span class="activity-what"><strong>${esc(Audit.auditActionLabel(log.action))}</strong>${detail ? ` · ${esc(detail)}` : ''}
          ${log.actor ? `<span class="muted"> — ${esc(log.actor.full_name)}</span>` : ''}</span>
      </li>`;
    }).join('')}</ul>`;
  }

  function mountActivity(el, userId) {
    const tabs = [
      { key: 'about', label: 'Sobre esta cuenta', query: { entity: 'users', entity_id: userId }, link: `#bitacora?objeto=${userId}` },
      { key: 'by', label: 'Hecho por esta persona', query: { actor_id: userId }, link: `#bitacora?usuario=${userId}` }
    ];
    let active = 'about';
    el.innerHTML = `
      <h3 class="panel-title">Actividad</h3>
      <div class="tabs tabs-sm" role="tablist">${tabs.map((t) => `<button type="button" role="tab" class="tab" data-t="${t.key}">${t.label}</button>`).join('')}</div>
      <div data-act-body></div>
      <p style="margin-top:12px"><a data-act-link class="strong-link" href="#">Ver todo en la bitácora →</a></p>`;
    const body = el.querySelector('[data-act-body]');
    async function load() {
      const t = tabs.find((x) => x.key === active);
      el.querySelectorAll('[data-t]').forEach((b) => {
        b.classList.toggle('active', b.dataset.t === active);
        b.setAttribute('aria-selected', String(b.dataset.t === active));
      });
      el.querySelector('[data-act-link]').href = t.link;
      body.innerHTML = Components.loading(3);
      try {
        const data = await UI.api(`/audit-logs${UI.buildQuery({ ...t.query, page_size: 10 })}`);
        body.innerHTML = activityRows(data.items);
      } catch (err) {
        Components.error(body, err, load);
      }
    }
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { active = b.dataset.t; load(); }));
    load();
  }

  async function mount(container, ctx) {
    const id = Number(ctx.id);
    if (!Number.isInteger(id) || id <= 0) { notFound(container); return; }
    container.innerHTML = Components.loading(5);
    let u;
    try {
      u = (await UI.api(`/users/${id}`)).user;
    } catch (err) {
      if (err.status === 404) { notFound(container); return; }
      Components.error(container, err, () => mount(container, ctx));
      return;
    }
    container.innerHTML = `
      <p class="back-link"><a href="#usuarios">${UI.icon('arrowLeft')}Usuarios</a></p>
      <section class="page-header">
        <div><h2>${esc(u.full_name)}${u.id === ctx.user.id ? ' <span class="muted" style="font-size:18px">(tú)</span>' : ''}</h2>
          <p class="muted">${esc(u.email)}</p></div>
        <div class="header-actions">${actionButtons(u, ctx.user)}</div>
      </section>
      <div class="detail-grid">
        <div>${accountPanel(u)}${modulesPanel(u)}${requestPanel(u)}</div>
        <section class="card panel" data-activity></section>
      </div>`;
    mountActivity(container.querySelector('[data-activity]'), u.id);

    const reload = () => mount(container, ctx);
    container.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'review' || act === 'approve') { if (await D().reviewRequest(u, { mode: act })) reload(); }
      else if (act === 'delete') { if (await D().deleteRequest(u)) location.hash = '#usuarios?tab=solicitudes'; }
      else if (act === 'edit') {
        if (await D().userForm({ mode: 'edit', user: u, self: u.id === ctx.user.id })) {
          if (u.id === ctx.user.id) ctx.refreshUser({ force: true });
          reload();
        }
      } else if (act === 'reset') { await D().resetPassword(u); reload(); }
      else if (act === 'toggle') { if (await D().toggleActive(u)) reload(); }
    }));
  }

  return { mount };
})();
