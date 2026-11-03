/**
 * Vista "Centros y categorías" (#inventario-catalogos, módulo INVENTARIO): catálogos editables del Inventario
 * (ADR-0006 §4). Pestañas: centros (centros de acopio) | categorias.
 * Parámetros: tab, q, estado, page, ver (id para abrir su edición).
 */
const InventarioCatalogos = (() => {
  const esc = (v) => UI.escape(v);
  const I = () => InventarioUI;

  const TABS = {
    centros: { label: 'Centros de acopio', icon: 'mapPin' },
    categorias: { label: 'Categorías', icon: 'tag' }
  };

  // ---------- Centros ----------
  const CENTER_FIELDS = [
    { name: 'name', label: 'Nombre del centro', required: true, max: 120, full: true, placeholder: 'Oficina Centro, Bodega Norte…' },
    { name: 'address', label: 'Dirección', max: 255, full: true },
    { name: 'contact_name', label: 'Persona responsable', max: 150 },
    { name: 'contact_phone', label: 'Teléfono', type: 'tel', inputmode: 'tel', hint: '10 dígitos' },
    { name: 'notes', label: 'Notas (opcional)', type: 'textarea', max: 500, full: true, rows: 2, placeholder: 'Horario, acceso, quién tiene la llave…' }
  ];

  function openCenter(center, onSaved) {
    return Listado.formDialog({
      title: center ? `Editar ${center.name}` : 'Nuevo centro de acopio',
      description: center ? '' : 'Lugar donde se reciben y guardan los artículos: la oficina, una bodega, una escuela aliada…',
      fields: CENTER_FIELDS,
      values: center ? { ...center, contact_phone: center.contact_phone ? Phone.format(center.contact_phone) : '' } : {},
      submitText: center ? 'Guardar cambios' : 'Registrar centro',
      validate: (v) => Listado.basicValidate(v, CENTER_FIELDS),
      onSubmit: async (values) => {
        const body = Listado.toBody(values, CENTER_FIELDS);
        const out = center
          ? await UI.api(`/inventory/centers/${center.id}`, { method: 'PATCH', body })
          : await UI.api('/inventory/centers', { method: 'POST', body });
        I().invalidateOptions();
        UI.toast(center ? 'Centro actualizado' : 'Centro registrado', 'success');
        onSaved();
        return out.center;
      },
      onDuplicate: (err) => Listado.duplicateNotice(err, {
        title: 'Ese centro ya está registrado', href: `#inventario-catalogos?tab=centros&ver=${err.data.existing_id}`, linkText: 'Ver el centro'
      })
    });
  }

  async function toggle(kind, row, reload) {
    const isCenter = kind === 'centros';
    if (row.is_active) {
      const ok = await UI.confirm({
        title: `¿Dar de baja ${row.name}?`,
        message: isCenter
          ? 'Ya no se podrán capturar movimientos en este centro. Su historial se conserva y podrás reactivarlo después.'
          : `Ya no se ofrecerá para artículos nuevos.${row.items_count ? ` Sus ${row.items_count} artículos conservan la categoría.` : ''} Podrás reactivarla después.`,
        confirmText: 'Dar de baja', danger: true
      });
      if (!ok) return;
    }
    try {
      await UI.api(`/inventory/${isCenter ? 'centers' : 'categories'}/${row.id}`, { method: 'PATCH', body: { is_active: !row.is_active } });
      I().invalidateOptions();
      UI.toast(row.is_active ? 'Dado de baja' : 'Reactivado', 'success');
      reload();
    } catch (err) {
      if (err.code === 'CENTER_HAS_STOCK') {
        const go = await UI.confirm({ title: 'El centro todavía tiene existencias', message: err.message,
          confirmText: 'Ver sus existencias', cancelText: 'Cerrar' });
        if (go) location.hash = `#inventario?centro=${row.id}&existencia=con`;
        return;
      }
      UI.toast(err.message, 'error');
    }
  }

  function centerActions(c) {
    return `<div class="row-actions">
      <a class="btn btn-ghost btn-sm" href="#inventario?centro=${c.id}&existencia=con" title="Ver existencias">${UI.icon('boxes')}<span>Existencias</span></a>
      <button type="button" class="btn btn-ghost btn-sm" data-edit="${c.id}" title="Editar">${UI.icon('pencil')}<span>Editar</span></button>
      <button type="button" class="btn btn-ghost btn-sm ${c.is_active ? 'btn-danger-ghost' : ''}" data-toggle="${c.id}" title="${c.is_active ? 'Dar de baja' : 'Reactivar'}">
        ${UI.icon(c.is_active ? 'trash' : 'refresh')}<span>${c.is_active ? 'Dar de baja' : 'Reactivar'}</span></button>
    </div>`;
  }

  const contact = (c) => (c.contact_name || c.contact_phone
    ? `<span class="cell-stack"><span>${esc(c.contact_name || '—')}</span>${c.contact_phone ? Listado.phoneLink(c.contact_phone) : ''}</span>`
    : '<span class="muted">—</span>');

  function centersConfig(reload) {
    return {
      actions: [{ label: 'Nuevo centro', icon: 'plus', primary: true, onClick: () => openCenter(null, reload) }],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Nombre o dirección' },
        { name: 'estado', type: 'select', label: 'Estado', options: Catalogos.ESTADO_OPTIONS }
      ],
      endpoint: '/inventory/centers',
      query: (p) => ({ search: p.q, is_active: Catalogos.estadoToActive(p.estado) }),
      itemLabel: 'centros',
      columns: [
        { label: 'Centro', render: (c) => `<span class="cell-stack"><strong>${esc(c.name)}</strong>${c.address ? `<span class="muted">${esc(c.address)}</span>` : ''}</span>` },
        { label: 'Responsable', render: contact },
        { label: 'Artículos con existencia', className: 'num', render: (c) => esc(I().num(c.items_count)) },
        { label: 'Último movimiento', render: (c) => (c.last_movement_date ? esc(Fechas.formatDate(c.last_movement_date)) : '<span class="muted">—</span>') },
        { label: 'Estado', render: Listado.activeBadge },
        { label: '', className: 'actions-cell', render: centerActions }
      ],
      card: (c) => `
        <div class="item-card-head"><p>${esc(c.name)}</p>${Listado.activeBadge(c)}</div>
        ${c.address ? `<p class="muted">${esc(c.address)}</p>` : ''}
        <p>${esc(I().num(c.items_count))} ${c.items_count === 1 ? 'artículo' : 'artículos'} con existencia</p>
        ${c.contact_name || c.contact_phone ? `<p>${esc(c.contact_name || '')} ${c.contact_phone ? Listado.phoneLink(c.contact_phone) : ''}</p>` : ''}
        ${centerActions(c)}`,
      empty: (filtered) => ({
        iconName: 'mapPin', title: filtered ? 'Sin resultados' : 'Aún no hay centros de acopio',
        text: filtered ? 'Prueba con otro nombre o cambia el estado.' : 'Registra la oficina o bodega donde se reciben los artículos.'
      }),
      open: openCenter,
      endpointOne: '/inventory/centers', key: 'center'
    };
  }

  // ---------- Categorías ----------
  const CATEGORY_FIELDS = [
    { name: 'name', label: 'Nombre de la categoría', required: true, max: 80, full: true },
    { name: 'description', label: 'Descripción (opcional)', max: 255, full: true }
  ];

  function openCategory(category, onSaved) {
    return Listado.formDialog({
      title: category ? `Editar ${category.name}` : 'Nueva categoría',
      fields: CATEGORY_FIELDS, values: category || {},
      submitText: category ? 'Guardar cambios' : 'Registrar categoría',
      validate: (v) => Listado.basicValidate(v, CATEGORY_FIELDS),
      onSubmit: async (values) => {
        const body = Listado.toBody(values, CATEGORY_FIELDS);
        const out = category
          ? await UI.api(`/inventory/categories/${category.id}`, { method: 'PATCH', body })
          : await UI.api('/inventory/categories', { method: 'POST', body });
        I().invalidateOptions();
        UI.toast(category ? 'Categoría actualizada' : 'Categoría registrada', 'success');
        onSaved();
        return out.category;
      },
      onDuplicate: (err) => Listado.duplicateNotice(err, {
        title: 'Esa categoría ya existe', href: `#inventario-catalogos?tab=categorias&ver=${err.data.existing_id}`, linkText: 'Ver la categoría'
      })
    });
  }

  function categoryActions(c) {
    return `<div class="row-actions">
      <a class="btn btn-ghost btn-sm" href="#inventario?categoria=${c.id}" title="Ver artículos">${UI.icon('boxes')}<span>Artículos</span></a>
      <button type="button" class="btn btn-ghost btn-sm" data-edit="${c.id}" title="Editar">${UI.icon('pencil')}<span>Editar</span></button>
      <button type="button" class="btn btn-ghost btn-sm ${c.is_active ? 'btn-danger-ghost' : ''}" data-toggle="${c.id}" title="${c.is_active ? 'Dar de baja' : 'Reactivar'}">
        ${UI.icon(c.is_active ? 'trash' : 'refresh')}<span>${c.is_active ? 'Dar de baja' : 'Reactivar'}</span></button>
    </div>`;
  }

  function categoriesConfig(reload) {
    return {
      actions: [{ label: 'Nueva categoría', icon: 'plus', primary: true, onClick: () => openCategory(null, reload) }],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Nombre' },
        { name: 'estado', type: 'select', label: 'Estado', options: Catalogos.ESTADO_OPTIONS }
      ],
      endpoint: '/inventory/categories',
      query: (p) => ({ search: p.q, is_active: Catalogos.estadoToActive(p.estado) }),
      itemLabel: 'categorías',
      columns: [
        { label: 'Categoría', render: (c) => `<strong>${esc(c.name)}</strong>` },
        { label: 'Descripción', render: (c) => (c.description ? esc(c.description) : '<span class="muted">—</span>') },
        { label: 'Artículos activos', className: 'num', render: (c) => esc(I().num(c.items_count)) },
        { label: 'Estado', render: Listado.activeBadge },
        { label: '', className: 'actions-cell', render: categoryActions }
      ],
      card: (c) => `
        <div class="item-card-head"><p>${esc(c.name)}</p>${Listado.activeBadge(c)}</div>
        ${c.description ? `<p class="muted">${esc(c.description)}</p>` : ''}
        <p>${esc(I().num(c.items_count))} ${c.items_count === 1 ? 'artículo activo' : 'artículos activos'}</p>
        ${categoryActions(c)}`,
      empty: (filtered) => ({
        iconName: 'tag', title: filtered ? 'Sin resultados' : 'Aún no hay categorías',
        text: filtered ? 'Prueba con otro nombre o cambia el estado.' : 'Agrupa los artículos: mobiliario, papelería, alimentos…'
      }),
      open: openCategory,
      endpointOne: '/inventory/categories', key: 'category'
    };
  }

  function mount(container, ctx) {
    const tab = TABS[ctx.params.tab] ? ctx.params.tab : 'centros';
    container.innerHTML = `
      <section class="page-header"><div><h2>Centros y categorías</h2>
        <p class="muted">Catálogos del Inventario. Se pueden renombrar o dar de baja; nunca se borran para no perder el historial.</p></div></section>
      <div class="tabs" role="tablist" aria-label="Catálogos del inventario">
        ${Object.entries(TABS).map(([k, t]) => `<button type="button" role="tab" class="tab${k === tab ? ' active' : ''}" data-tab="${k}"
          id="tab-${k}" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}" aria-controls="catPanel">${UI.icon(t.icon)} ${esc(t.label)}</button>`).join('')}
      </div>
      <div id="catPanel" role="tabpanel" aria-labelledby="tab-${tab}"></div>`;

    const panel = container.querySelector('#catPanel');
    let list;
    const reload = () => list.reload();
    const config = tab === 'centros' ? centersConfig(reload) : categoriesConfig(reload);
    list = Listado.mount(panel, { ...ctx, params: { ...ctx.params, tab } }, {
      ...config,
      onItems: (el, items) => {
        const byId = Object.fromEntries(items.map((x) => [x.id, x]));
        el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => config.open(byId[b.dataset.edit], reload)));
        el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => toggle(tab, byId[b.dataset.toggle], reload)));
      }
    });

    const switchTo = (k) => {
      if (k === tab) return;
      ctx.navigate({ tab: k });
      mount(container, { ...ctx, params: { tab: k } });
      container.querySelector(`[data-tab="${k}"]`).focus();
    };
    container.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.tab)));
    container.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      switchTo(tab === 'centros' ? 'categorias' : 'centros');
    });

    if (ctx.params.ver) {
      UI.api(`${config.endpointOne}/${Number(ctx.params.ver)}`).then((out) => config.open(out[config.key], reload))
        .catch((err) => UI.toast(err.message, 'error'));
    }
  }

  return { mount };
})();
