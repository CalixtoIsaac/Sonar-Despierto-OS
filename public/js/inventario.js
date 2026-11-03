/**
 * Vista "Inventario" (#inventario, módulo INVENTARIO): existencias por artículo, alta y edición de artículos,
 * captura de movimientos y exportación. Las existencias se calculan de los movimientos (ADR-0006, ADR-0013).
 * Parámetros: q, categoria, centro, existencia (con | sin | bajo), estado, orden, page, ver (id a editar), nuevo (1).
 */
const Inventario = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const I = () => InventarioUI;

  async function itemFields(item) {
    const o = await I().options({ fresh: true });
    const cats = o.categories.map((c) => ({ value: String(c.id), label: c.name }));
    if (item && !cats.some((c) => c.value === String(item.category.id))) {
      cats.push({ value: String(item.category.id), label: `${item.category.name} (dada de baja)` });
    }
    const unitLocked = item && item.movements_count > 0;
    return [
      { name: 'name', label: 'Nombre del artículo', required: true, max: 120, full: true, placeholder: 'Silla plegable, bolsa de regalo…' },
      { name: 'category_id', label: 'Categoría', type: 'select', required: true, numeric: true,
        options: [{ value: '', label: cats.length ? 'Elige la categoría' : 'No hay categorías activas' }, ...cats] },
      { name: 'unit', label: 'Unidad', type: 'select', required: true,
        options: [{ value: '', label: 'Elige la unidad' }, ...C().INVENTORY_UNITS.map((u) => ({ value: u, label: C().INVENTORY_UNIT_LABEL[u] }))],
        hint: unitLocked ? 'Ya tiene movimientos: la unidad no se puede cambiar.' : 'Cómo se cuenta. Las cantidades son enteras.' },
      { name: 'min_stock', label: 'Existencia mínima (opcional)', type: 'number', numeric: true, min: '0',
        hint: 'Avisa cuando el total baje de esta cantidad. Déjalo vacío para no avisar.' },
      { name: 'description', label: 'Descripción (opcional)', type: 'textarea', max: 500, full: true, rows: 2 }
    ];
  }

  function validate(v, defs) {
    const errors = Listado.basicValidate(v, defs);
    if (v.min_stock && (!/^\d+$/.test(v.min_stock) || Number(v.min_stock) > C().INVENTORY_MAX_QUANTITY)) {
      errors.push({ field: 'min_stock', message: 'Escribe un número entero de 0 en adelante.' });
    }
    return errors;
  }

  /** Alta (item = null) o edición de un artículo. Resuelve con el artículo guardado o null. */
  async function openForm(item, onSaved) {
    let defs;
    try { defs = await itemFields(item); } catch (err) { UI.toast(err.message, 'error'); return null; }
    const values = item ? { ...item, category_id: String(item.category.id), min_stock: item.min_stock || '' } : { unit: 'PIEZA' };
    return Listado.formDialog({
      title: item ? `Editar ${item.name}` : 'Nuevo artículo',
      description: item ? '' : 'Registra el artículo una vez; después captura sus entradas y salidas en cada centro.',
      fields: defs, values, submitText: item ? 'Guardar cambios' : 'Registrar artículo',
      validate: (v) => validate(v, defs),
      onSubmit: async (v) => {
        const body = Listado.toBody(v, defs);
        if (body.min_stock === null) body.min_stock = 0;
        let out;
        if (item) {
          const changes = {};
          const current = { ...item, category_id: item.category.id };
          for (const [k, val] of Object.entries(body)) if ((current[k] ?? null) !== (val ?? null)) changes[k] = val;
          if (!Object.keys(changes).length) { UI.toast('No hay cambios que guardar'); return item; }
          out = await UI.api(`/inventory/items/${item.id}`, { method: 'PATCH', body: changes });
        } else {
          out = await UI.api('/inventory/items', { method: 'POST', body });
        }
        UI.toast(item ? 'Artículo actualizado' : `"${out.item.name}" registrado`, 'success');
        if (onSaved) onSaved(out.item);
        return out.item;
      },
      onDuplicate: (err) => Listado.duplicateNotice(err, {
        title: 'Este artículo ya está registrado', href: `#articulo/${err.data.existing_id}`, linkText: 'Ver el artículo'
      })
    });
  }

  function statCard(label, value, { href, iconName, tone = '' } = {}) {
    const inner = `<span class="stat-value">${esc(I().num(value))}</span><span class="stat-label">${iconName ? UI.icon(iconName) : ''}${esc(label)}</span>`;
    return href ? `<a class="stat-card ${tone}" href="${href}">${inner}</a>` : `<div class="stat-card ${tone}">${inner}</div>`;
  }

  async function renderSummary(el) {
    try {
      const s = await UI.api('/inventory/summary');
      if (!el.isConnected) return;
      const noCenters = s.centers === 0;
      el.innerHTML = `${noCenters ? `<section class="card panel callout" role="status">
          <span class="callout-icon">${UI.icon('mapPin')}</span>
          <p>Para capturar entradas y salidas primero registra al menos un <strong>centro de acopio</strong>.</p>
          <a class="btn btn-primary" href="#inventario-catalogos?tab=centros">Registrar centro</a></section>` : ''}
        <div class="stat-grid inv-stats">
          ${statCard('Artículos activos', s.items, { iconName: 'boxes' })}
          ${statCard('Con existencia', s.with_stock, { href: '#inventario?existencia=con', iconName: 'check' })}
          ${statCard('Existencia baja', s.low_stock, { href: '#inventario?existencia=bajo', iconName: 'alert', tone: s.low_stock ? 'stat-low' : '' })}
          ${statCard('Centros de acopio', s.centers, { href: '#inventario-catalogos?tab=centros', iconName: 'mapPin' })}
        </div>`;
    } catch { el.innerHTML = ''; }
  }

  const stockCell = (it, centerSelected) => {
    const main = centerSelected ? it.center_stock : it.total_stock;
    return `<span class="cell-stack"><strong class="inv-stock">${esc(I().qty(main, it.unit))}</strong>
      ${centerSelected ? `<span class="muted">Total: ${esc(I().num(it.total_stock))}</span>` : ''}
      ${I().stockBadge(it)}</span>`;
  };

  function actions(it) {
    if (!it.is_active) {
      return `<div class="row-actions row-actions-labeled"><a class="btn btn-ghost btn-sm" href="#articulo/${it.id}">${UI.icon('list')}<span>Kardex</span></a></div>`;
    }
    return `<div class="row-actions row-actions-labeled">
      <button type="button" class="btn btn-ghost btn-sm" data-move="ENTRADA" data-id="${it.id}" title="Registrar entrada">${UI.icon('arrowDown')}<span>Entrada</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-move="SALIDA" data-id="${it.id}" title="Registrar salida"${it.total_stock > 0 ? '' : ' disabled'}>${UI.icon('arrowUp')}<span>Salida</span></button>
      <a class="btn btn-ghost btn-sm" href="#articulo/${it.id}" title="Ver kardex">${UI.icon('list')}<span>Kardex</span></a>
    </div>`;
  }

  function mount(container, ctx) {
    let list;
    const reload = () => list.reload();
    const centerSelected = () => Boolean(list && list.params().centro);
    const openMove = async (type, item) => {
      const p = list.params();
      const done = await I().movementDialog({ type, item, centerId: p.centro || null });
      if (done) reload();
    };

    list = Listado.mount(container, ctx, {
      title: 'Inventario',
      description: 'Existencias de insumos, mobiliario y materiales por centro de acopio. Los regalos de las cartas se siguen en Cartas.',
      actions: [
        { label: 'Registrar movimiento', icon: 'arrowLeftRight', primary: true, onClick: () => openMove('ENTRADA', null) },
        { label: 'Nuevo artículo', icon: 'plus', onClick: () => openForm(null, reload) },
        { label: 'Exportar CSV', icon: 'download', id: 'export', onClick: (btn, p) => Listado.exportCsv(btn,
          `/inventory/items/export${UI.buildQuery(query(p))}`, 'existencias-inventario.csv') }
      ],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Nombre del artículo' },
        { name: 'categoria', type: 'select', label: 'Categoría', options: () => I().categoryFilterOptions() },
        { name: 'centro', type: 'select', label: 'Centro de acopio', options: () => I().centerFilterOptions() },
        { name: 'existencia', type: 'select', label: 'Existencia',
          options: [['', 'Todas'], ['con', 'Con existencia'], ['sin', 'Sin existencia'], ['bajo', 'Existencia baja']] },
        { name: 'estado', type: 'select', label: 'Estado', options: Catalogos.ESTADO_OPTIONS }
      ],
      endpoint: '/inventory/items',
      query,
      top: (params, el) => renderSummary(el),
      itemLabel: 'artículos',
      columns: [
        { label: 'Artículo', render: (it) => `<span class="cell-stack"><a class="strong-link" href="#articulo/${it.id}">${esc(it.name)}</a>
          <span class="muted">${esc(it.category.name)}</span></span>` },
        { label: 'Existencia', render: (it) => stockCell(it, centerSelected()) },
        { label: 'Unidad', render: (it) => esc(C().INVENTORY_UNIT_LABEL[it.unit]) },
        { label: 'Centros', className: 'num', render: (it) => (it.centers_count ? String(it.centers_count) : '<span class="muted">—</span>') },
        { label: 'Último movimiento', render: (it) => (it.last_movement_date ? esc(Fechas.formatDate(it.last_movement_date)) : '<span class="muted">—</span>') },
        { label: '', className: 'actions-cell', render: actions }
      ],
      card: (it) => `
        <div class="item-card-head"><p><a class="strong-link" href="#articulo/${it.id}">${esc(it.name)}</a></p>${I().stockBadge(it)}</div>
        <p class="muted">${esc(it.category.name)}${it.last_movement_date ? ` · Último movimiento: ${esc(Fechas.formatDate(it.last_movement_date))}` : ''}</p>
        <p class="inv-card-stock"><strong>${esc(I().qty(centerSelected() ? it.center_stock : it.total_stock, it.unit))}</strong>
          ${centerSelected() ? `<span class="muted">en este centro · ${esc(I().num(it.total_stock))} en total</span>` : (it.centers_count > 1 ? `<span class="muted">en ${it.centers_count} centros</span>` : '')}</p>
        ${actions(it)}`,
      empty: (filtered) => ({
        iconName: 'boxes', title: filtered ? 'Sin resultados' : 'Aún no hay artículos registrados',
        text: filtered ? 'Prueba con otro nombre o cambia los filtros.' : 'Registra los insumos, mobiliario y materiales que maneja la organización.',
        actionHtml: filtered ? '' : `<button type="button" class="btn btn-primary" data-first-item>${UI.icon('plus')}Registrar el primer artículo</button>`
      }),
      onEmpty: (el) => {
        const b = el.querySelector('[data-first-item]');
        if (b) b.addEventListener('click', () => openForm(null, reload));
      },
      onItems: (el, items) => {
        const byId = Object.fromEntries(items.map((x) => [x.id, x]));
        el.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => openMove(b.dataset.move, byId[b.dataset.id])));
      }
    });

    if (ctx.params.ver) {
      UI.api(`/inventory/items/${Number(ctx.params.ver)}`).then(({ item }) => openForm(item, reload)).catch((err) => UI.toast(err.message, 'error'));
    } else if (ctx.params.nuevo) {
      list.setParams({ nuevo: null }, { push: false });
      openForm(null, reload);
    }
  }

  function query(p) {
    return {
      search: p.q, category_id: p.categoria, center_id: p.centro, stock: p.existencia,
      is_active: Catalogos.estadoToActive(p.estado), order_by: p.centro || p.existencia ? '-stock' : 'name'
    };
  }

  return { mount, openForm };
})();
