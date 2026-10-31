/**
 * Vista "Cartas" (P15, módulo CARTAS): selector de evento, pestañas por estatus con contador, filtros
 * (búsqueda por código o nombre, escuela, foto) y exportación CSV (queda en la bitácora).
 * Parámetros: evento (id), estatus, q, escuela (id | none), foto (si | no), page.
 */
const Cartas = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;

  function apiQuery(p) {
    return {
      event_id: p.evento, status: p.estatus, search: p.q, school_id: p.escuela,
      has_photo: p.foto === 'si' ? 'true' : (p.foto === 'no' ? 'false' : undefined), order_by: 'code'
    };
  }

  const code = (l) => `<a class="strong-link letter-code" href="#carta/${l.id}">${esc(l.code)}</a>`;
  const child = (l) => `${esc(CartasUI.childLabel(l.child))}${l.child.age !== null ? ` <span class="muted">· ${l.child.age} años</span>` : ''}`;
  const sponsor = (l) => (l.sponsor ? esc(l.sponsor.full_name) : '<span class="muted">Sin padrino</span>');
  const photo = (l) => (l.has_photo ? `<span class="photo-flag" title="Tiene foto">${UI.icon('image')}<span class="sr-only">Tiene foto</span></span>` : '');

  function renderTabs(el, params, getList) {
    const q = { ...apiQuery(params), status: undefined, order_by: undefined };
    UI.api(`/letters/summary${UI.buildQuery(q)}`).then((s) => {
      if (!el.isConnected) return;
      const tab = (value, label, n) => `<button type="button" role="tab" class="tab${(params.estatus || '') === value ? ' active' : ''}"
        aria-selected="${(params.estatus || '') === value}" data-status="${value}">${esc(label)} <span class="tab-count">${n}</span></button>`;
      el.innerHTML = `<div class="tabs" role="tablist" aria-label="Cartas por estatus">
        ${tab('', 'Todas', s.total)}${C().LETTER_STATUSES.map((st) => tab(st, C().LETTER_STATUS_LABEL[st], s.by_status[st])).join('')}</div>`;
      el.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => getList().setParams({ estatus: b.dataset.status, page: null })));
    }).catch(() => { el.innerHTML = ''; });
  }

  function noEvents(container, ctx) {
    const canCreate = Access.canSee(ctx.user, Access.viewByKey('eventos'));
    container.innerHTML = `<section class="page-header"><div><h2>Cartas de Navidad</h2></div></section>
      <section class="card panel">${Components.empty({ iconName: 'calendarDays', title: 'Aún no hay eventos',
        text: canCreate ? 'Crea el evento de Navidad (por ejemplo "Navidad 2026", prefijo NAV26) y ábrelo para registrar cartas.'
          : 'Pide a quien coordina los eventos que cree y abra el evento de Navidad.',
        actionHtml: canCreate ? `<a class="btn btn-primary" href="#eventos">${UI.icon('calendarDays')}Ir a Eventos</a>` : '' })}</section>`;
  }

  async function mount(container, ctx) {
    container.innerHTML = Components.loading(6);
    let events;
    try { events = await CartasUI.loadEvents(); } catch (err) { Components.error(container, err, () => mount(container, ctx)); return; }
    if (!events.length) { noEvents(container, ctx); return; }
    let event = events.find((e) => String(e.id) === String(ctx.params.evento));
    if (!event) {
      event = CartasUI.defaultEvent(events);
      ctx.params = { ...ctx.params, evento: String(event.id) };
      ctx.navigate(ctx.params, { push: false });
    }
    const open = ['ABIERTO', 'EN_CURSO'].includes(event.status) && C().LETTER_EVENT_TYPES.includes(event.event_type);

    let list;
    let schools = [['', 'Todas']];
    try {
      const s = await UI.api(`/letters/summary${UI.buildQuery({ event_id: event.id })}`);
      schools = [['', 'Todas'], ...s.by_school.map((x) => [x.id === null ? 'none' : String(x.id), `${x.name} (${x.total})`])];
    } catch { /* el filtro queda sin escuelas */ }

    list = Listado.mount(container, ctx, {
      title: 'Cartas de Navidad',
      description: 'Cada carta tiene un código único para escribirlo en la carta física y en la bolsa del regalo.',
      actions: [
        { label: 'Exportar CSV', icon: 'download', id: 'export',
          onClick: (btn) => Listado.exportCsv(btn, `/letters/export${UI.buildQuery(apiQuery(list.params()))}`, 'cartas.csv') },
        { label: 'Búsqueda por código', icon: 'scanSearch', href: '#buscar' },
        ...(open ? [{ label: 'Registrar carta', icon: 'plus', primary: true, href: `#carta-form?evento=${event.id}` }] : [])
      ],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Código (NAV26-000123) o nombre' },
        { name: 'escuela', type: 'select', label: 'Escuela', options: schools },
        { name: 'foto', type: 'select', label: 'Foto', options: [['', 'Todas'], ['si', 'Con foto'], ['no', 'Sin foto']] }
      ],
      endpoint: '/letters',
      query: apiQuery,
      itemLabel: 'cartas',
      pageSize: 25,
      top: (params, el) => {
        if (!el.dataset.ready) {
          el.dataset.ready = '1';
          el.innerHTML = `<section class="card panel event-bar">
            <label class="filter event-select"><span class="filter-label">Evento</span><span class="select-wrap"><select class="input select" data-event>
              ${events.map((e) => `<option value="${e.id}"${e.id === event.id ? ' selected' : ''}>${esc(CartasUI.eventLabel(e))}</option>`).join('')}
            </select></span></label>
            <p class="event-bar-info">${CartasUI.eventBadge(event.status)} <span class="muted">${esc(Fechas.formatDate(event.event_date))} · hasta ${event.max_letters_per_sponsor} cartas por padrino</span></p>
            ${!C().LETTER_EVENT_TYPES.includes(event.event_type) ? `<p class="hint">${UI.icon('info')} Este evento no es de Navidad: no recibe cartas.</p>`
              : (!open ? `<p class="hint">${UI.icon('info')} ${event.status === 'BORRADOR' ? 'El evento está en borrador: ábrelo en Eventos para registrar cartas.' : 'Evento cerrado: las cartas son de solo lectura.'}</p>` : '')}
          </section><div data-tabs></div>`;
          el.querySelector('[data-event]').addEventListener('change', (e) => { location.hash = Access.buildHash('cartas', null, { evento: e.target.value }); });
        }
        renderTabs(el.querySelector('[data-tabs]'), params, () => list);
      },
      columns: [
        { label: 'Código', className: 'nowrap', render: (l) => `${code(l)} ${photo(l)}` },
        { label: 'Niña o niño', render: child },
        { label: 'Escuela', render: (l) => esc(l.child.school ? l.child.school.name : '—') },
        { label: 'Deseo principal', render: (l) => esc(l.main_wish) },
        { label: 'Padrino', render: sponsor },
        { label: 'Estatus', render: (l) => CartasUI.statusChip(l.status) },
        { label: '', className: 'actions-cell', render: (l) => `<div class="row-actions">
          <a class="btn btn-ghost btn-sm" href="#carta/${l.id}" title="Ver carta">${UI.icon('eye')}<span>Ver carta</span></a></div>` }
      ],
      card: (l) => `
        <div class="item-card-head"><p>${code(l)} ${photo(l)}</p>${CartasUI.statusChip(l.status)}</div>
        <p>${child(l)}${l.child.school ? ` · <span class="muted">${esc(l.child.school.name)}</span>` : ''}</p>
        <p>${UI.icon('gift')} ${esc(l.main_wish)}</p>
        <p class="muted">${l.sponsor ? `Padrino: ${esc(l.sponsor.full_name)}` : 'Sin padrino'}</p>`,
      empty: (filtered) => ({
        iconName: 'mail', title: filtered || (list && list.params().estatus) ? 'Sin cartas con ese filtro' : 'Aún no hay cartas en este evento',
        text: filtered ? 'Prueba con otro código, nombre o escuela.' : (open ? 'Registra la primera; el código se genera solo.' : ''),
        actionHtml: !filtered && open ? `<a class="btn btn-primary" href="#carta-form?evento=${event.id}">${UI.icon('plus')}Registrar carta</a>` : ''
      })
    });
  }

  return { mount };
})();
