/**
 * Vista "Voluntarios" (módulo VOLUNTARIOS): listado con filtros, resumen de tallas del filtro actual
 * (para pedir playeras) y exportación a CSV (queda en la bitácora).
 * Parámetros: q, area, talla, estado, page.
 */
const Voluntarios = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;

  function apiQuery(p) {
    return { search: p.q, area: p.area, shirt_size: p.talla, is_active: C().estadoToActive(p.estado), order_by: 'name' };
  }

  async function renderSizes(params, el) {
    try {
      const s = await UI.api(`/volunteers/summary${UI.buildQuery(apiQuery(params))}`);
      if (!s.total) { el.innerHTML = ''; return; }
      el.innerHTML = `<section class="card panel sizes-panel" aria-label="Tallas de playera del filtro actual">
        <span class="sizes-title">${UI.icon('shirt')}Tallas de playera <span class="muted">(${s.total} ${s.total === 1 ? 'persona' : 'personas'})</span></span>
        <span class="sizes">${C().SHIRT_SIZES.map((k) => `<span class="size-chip${s.shirt_sizes[k] ? '' : ' zero'}"><strong>${k}</strong> ${s.shirt_sizes[k]}</span>`).join('')}</span>
      </section>`;
    } catch { el.innerHTML = ''; }
  }

  const name = (v) => `<a class="strong-link" href="#voluntario/${v.id}">${esc(v.full_name)}</a>`;

  function mount(container, ctx) {
    const areaOpts = [['', 'Todas'], ...C().VOLUNTEER_AREAS.map((a) => [a, C().VOLUNTEER_AREA_LABEL[a]])];
    const sizeOpts = [['', 'Todas'], ...C().SHIRT_SIZES.map((s) => [s, s])];
    let list;
    list = Listado.mount(container, ctx, {
      title: 'Voluntarios',
      description: 'Personas que apoyan en los eventos: contacto, contacto de emergencia, talla y área de apoyo.',
      actions: [
        { label: 'Exportar CSV', icon: 'download', id: 'export',
          onClick: (btn) => Listado.exportCsv(btn, `/volunteers/export${UI.buildQuery(apiQuery(list.params()))}`, 'voluntarios.csv') },
        { label: 'Nuevo voluntario', icon: 'plus', primary: true, href: '#voluntario-form' }
      ],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Nombre, correo o teléfono' },
        { name: 'area', type: 'select', label: 'Área', options: areaOpts },
        { name: 'talla', type: 'select', label: 'Talla', options: sizeOpts },
        { name: 'estado', type: 'select', label: 'Estado', options: C().ESTADO_OPTIONS }
      ],
      endpoint: '/volunteers',
      query: apiQuery,
      itemLabel: 'voluntarios',
      top: renderSizes,
      columns: [
        { label: 'Nombre', render: (v) => `${name(v)}${v.city ? `<br><span class="muted">${esc(v.city)}</span>` : ''}` },
        { label: 'Contacto', render: (v) => `<span class="cell-stack">${Listado.phoneLink(v.phone)}${v.email ? `<span class="muted">${esc(v.email)}</span>` : ''}</span>` },
        { label: 'Área', render: (v) => esc(C().VOLUNTEER_AREA_LABEL[v.area_of_interest] || v.area_of_interest) },
        { label: 'Talla', render: (v) => `<span class="badge badge-plain">${esc(v.shirt_size)}</span>` },
        { label: 'Estado', render: Listado.activeBadge },
        { label: '', className: 'actions-cell', render: (v) => `<div class="row-actions">
            <a class="btn btn-ghost btn-sm" href="#voluntario/${v.id}" title="Ver detalle">${UI.icon('eye')}<span>Ver detalle</span></a>
            <a class="btn btn-ghost btn-sm" href="#voluntario-form/${v.id}" title="Editar">${UI.icon('pencil')}<span>Editar</span></a></div>` }
      ],
      card: (v) => `
        <div class="item-card-head"><p>${name(v)}</p>${Listado.activeBadge(v)}</div>
        <p>${Listado.phoneLink(v.phone)}${v.email ? ` · <span class="muted">${esc(v.email)}</span>` : ''}</p>
        <p>${esc(C().VOLUNTEER_AREA_LABEL[v.area_of_interest])} · Talla <strong>${esc(v.shirt_size)}</strong></p>`,
      empty: (filtered) => ({
        iconName: 'users', title: filtered ? 'Sin resultados' : 'Aún no hay voluntarios registrados',
        text: filtered ? 'Prueba con otro nombre o filtro.' : 'Registra a la primera persona voluntaria.',
        actionHtml: filtered ? '' : `<a class="btn btn-primary" href="#voluntario-form">${UI.icon('plus')}Nuevo voluntario</a>`
      })
    });
  }

  return { mount };
})();
