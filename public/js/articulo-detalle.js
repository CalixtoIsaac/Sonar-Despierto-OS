/**
 * Vista "#articulo/<id>" (módulo INVENTARIO): existencia total y por centro, acciones (entrada, salida,
 * traspaso, editar, baja) y KARDEX con saldo acumulado, filtros por centro y periodo, anulación y exportación.
 * Parámetros: centro, desde, hasta, page.
 */
const ArticuloDetalle = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const I = () => InventarioUI;
  const dash = '<span class="muted">—</span>';

  function notFound(container) {
    container.innerHTML = `<section class="card panel narrow" style="margin: 24px auto 0">
      ${Components.empty({ iconName: 'boxes', title: 'No encontramos este artículo.',
        actionHtml: `<a class="btn btn-outline" href="#inventario">${UI.icon('arrowLeft')}Volver al Inventario</a>` })}</section>`;
  }

  async function toggle(item, reload) {
    if (item.is_active) {
      const ok = await UI.confirm({ title: `¿Dar de baja ${item.name}?`,
        message: 'Ya no aparecerá para capturar movimientos. Su kardex se conserva y podrás reactivarlo después.',
        confirmText: 'Dar de baja', danger: true });
      if (!ok) return;
    }
    try {
      await UI.api(`/inventory/items/${item.id}`, { method: 'PATCH', body: { is_active: !item.is_active } });
      UI.toast(item.is_active ? 'Artículo dado de baja' : 'Artículo reactivado', 'success');
      reload();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  function centersPanel(item) {
    const rows = item.stock_by_center;
    if (!rows.length) return '<p class="muted">Todavía no tiene movimientos en ningún centro.</p>';
    return `<ul class="inv-centers">${rows.map((s) => `<li>
        <span class="inv-center-name">${UI.icon('mapPin')}<a class="strong-link" href="#articulo/${item.id}?centro=${s.center.id}" data-center="${s.center.id}">${esc(s.center.name)}</a>
          ${s.center.is_active ? '' : '<span class="badge badge-plain">Dado de baja</span>'}</span>
        <strong class="${s.stock === 0 ? 'muted' : ''}">${esc(I().qty(s.stock, item.unit))}</strong></li>`).join('')}</ul>`;
  }

  function kardexRow(r, item, ctx) {
    const reversible = I().canReverse(r, ctx.user) && item.is_active && r.center.is_active;
    const muted = r.reversed_by_id || r.reason === 'ANULACION';
    return {
      reversible,
      tr: `<tr class="${muted ? 'row-inactive' : ''}">
        <td class="date-cell"><span class="cell-stack"><span class="nowrap">${esc(Fechas.formatDate(r.movement_date))}</span><span class="muted">Folio ${r.id}</span></span></td>
        <td class="detail-cell"><span class="cell-stack">${I().movementChip(r)}<span class="mov-detail">${I().movementDetail(r)}</span>
          ${r.notes ? `<span class="muted pre-line">${esc(r.notes)}</span>` : ''}${I().reversedBadge(r)}</span></td>
        <td>${esc(r.center.name)}</td>
        <td class="num qty-in">${r.in ? `+${esc(I().num(r.in))}` : ''}</td>
        <td class="num qty-out">${r.out ? `−${esc(I().num(r.out))}` : ''}</td>
        <td class="num"><strong>${esc(I().num(r.balance))}</strong></td>
        <td class="muted">${r.created_by ? esc(r.created_by.full_name) : '—'}</td>
        <td class="actions-cell">${reversible ? `<div class="row-actions row-actions-labeled"><button type="button" class="btn btn-ghost btn-sm" data-reverse="${r.id}">${UI.icon('undo')}<span>Anular</span></button></div>` : ''}</td>
      </tr>`,
      card: `<li class="item-card${muted ? ' row-inactive' : ''}">
        <div class="item-card-head"><p>${I().movementChip(r)} <span class="muted">Folio ${r.id}</span></p>
          <strong class="${r.in ? 'qty-in' : 'qty-out'}">${r.in ? '+' : '−'}${esc(I().num(r.in || r.out))}</strong></div>
        <p class="muted">${esc(Fechas.formatDate(r.movement_date))} · ${esc(r.center.name)} · Saldo <strong>${esc(I().num(r.balance))}</strong></p>
        <p class="mov-detail">${I().movementDetail(r)}</p>
        ${r.notes ? `<p class="muted pre-line">${esc(r.notes)}</p>` : ''}${I().reversedBadge(r)}
        ${reversible ? `<div class="row-actions"><button type="button" class="btn btn-ghost btn-sm" data-reverse="${r.id}">${UI.icon('undo')}<span>Anular</span></button></div>` : ''}
      </li>`
    };
  }

  async function mount(container, ctx) {
    const id = Number(ctx.id);
    if (!Number.isInteger(id) || id <= 0) { notFound(container); return; }
    container.innerHTML = Components.loading(6);
    let item;
    try { item = (await UI.api(`/inventory/items/${id}`)).item; } catch (err) {
      if (err.status === 404) notFound(container); else Components.error(container, err, () => mount(container, ctx));
      return;
    }
    let params = { ...ctx.params };
    const isAdmin = ctx.user.role === 'ADMIN';
    const reloadAll = () => mount(container, { ...ctx, params });
    const centerOptions = [['', 'Todos los centros'], ...item.stock_by_center.map((s) => [String(s.center.id), s.center.name])];
    if (params.centro && !centerOptions.some(([v]) => v === String(params.centro))) params.centro = '';

    container.innerHTML = `
      <p class="back-link"><a href="#inventario">${UI.icon('arrowLeft')}Inventario</a></p>
      <section class="page-header">
        <div><h2>${esc(item.name)}</h2>
          <p class="muted">${esc(item.category.name)} · ${esc(C().INVENTORY_UNIT_LABEL[item.unit])} ${I().stockBadge(item)}</p></div>
        <div class="header-actions">
          ${item.is_active ? `<button type="button" class="btn btn-primary" data-move="ENTRADA">${UI.icon('arrowDown')}Entrada</button>
          <button type="button" class="btn btn-outline" data-move="SALIDA"${item.total_stock > 0 ? '' : ' disabled'}>${UI.icon('arrowUp')}Salida</button>
          <button type="button" class="btn btn-outline" data-move="TRASPASO"${item.total_stock > 0 ? '' : ' disabled'}>${UI.icon('arrowLeftRight')}Traspaso</button>` : ''}
          <button type="button" class="btn btn-ghost" data-edit>${UI.icon('pencil')}Editar</button>
          <button type="button" class="btn btn-ghost" data-toggle>${UI.icon(item.is_active ? 'trash' : 'refresh')}${item.is_active ? 'Dar de baja' : 'Reactivar'}</button>
        </div>
      </section>
      <div class="inv-top">
          <section class="card panel">
            <h3 class="panel-title">Existencia</h3>
            <p class="inv-total"><span class="stat-value">${esc(I().num(item.total_stock))}</span>
              <span class="muted">${esc(C().INVENTORY_UNIT_PLURAL[item.unit])} en total</span></p>
            ${item.min_stock ? `<p class="hint">Existencia mínima: ${esc(I().qty(item.min_stock, item.unit))}${item.low_stock ? ' — <strong>por debajo del mínimo</strong>' : ''}</p>` : ''}
            <p class="field-label" style="margin-top:14px">Por centro de acopio</p>
            ${centersPanel(item)}
          </section>
          <section class="card panel"><h3 class="panel-title">Datos del artículo</h3>
            <dl class="data-list">
              <dt>Categoría</dt><dd>${esc(item.category.name)}${item.category.is_active ? '' : ' <span class="badge badge-plain">Dada de baja</span>'}</dd>
              <dt>Unidad</dt><dd>${esc(C().INVENTORY_UNIT_LABEL[item.unit])}</dd>
              <dt>Descripción</dt><dd>${item.description ? `<span class="pre-line">${esc(item.description)}</span>` : dash}</dd>
              <dt>Movimientos</dt><dd>${esc(I().num(item.movements_count))}</dd>
              <dt>Registrado</dt><dd>${esc(Fechas.formatDateTime(item.created_at))}</dd>
            </dl>
            ${isAdmin ? `<p style="margin-top:12px"><a class="strong-link" href="#bitacora?objeto=${item.id}&entidad=inventory_items">Ver su historial en la bitácora →</a></p>` : ''}
          </section>
      </div>
      <section class="card panel kardex-panel section-gap">
          <div class="panel-head"><h3 class="panel-title">Kardex</h3>
            <button type="button" class="btn btn-outline btn-sm" data-export>${UI.icon('download')}Exportar CSV</button></div>
          <div class="filters">
            <label class="filter"><span class="filter-label">Centro</span><span class="select-wrap"><select class="input select" name="centro">
              ${centerOptions.map(([v, l]) => `<option value="${esc(v)}"${v === String(params.centro || '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></span></label>
            <label class="filter filter-date"><span class="filter-label">Desde</span><input class="input" type="date" name="desde" value="${esc(params.desde || '')}"></label>
            <label class="filter filter-date"><span class="filter-label">Hasta</span><input class="input" type="date" name="hasta" value="${esc(params.hasta || '')}"></label>
          </div>
          <div data-totals></div>
          <div data-kardex></div>
          <div data-pager></div>
      </section>`;

    const listEl = container.querySelector('[data-kardex]');
    const totalsEl = container.querySelector('[data-totals]');
    const pagerEl = container.querySelector('[data-pager]');
    let seq = 0;

    const kardexQuery = (p) => ({ center_id: p.centro, date_from: p.desde, date_to: p.hasta });

    function setParams(patch) {
      params = { ...params, ...patch };
      for (const k of Object.keys(params)) if (params[k] === null || params[k] === '' || params[k] === undefined) delete params[k];
      ctx.navigate(params);
      loadKardex();
    }

    async function loadKardex() {
      const mySeq = ++seq;
      listEl.innerHTML = Components.loading(5);
      pagerEl.innerHTML = '';
      try {
        const k = await UI.api(`/inventory/items/${item.id}/kardex${UI.buildQuery({ ...kardexQuery(params), order: 'desc', page: Number(params.page) || 1, page_size: 25 })}`);
        if (mySeq !== seq) return;
        const ranged = params.desde || params.hasta;
        totalsEl.innerHTML = `<div class="kardex-totals">
          ${ranged ? `<span><span class="muted">Saldo inicial</span><strong>${esc(I().num(k.opening_balance))}</strong></span>` : ''}
          <span><span class="muted">Entradas</span><strong class="qty-in">+${esc(I().num(k.total_in))}</strong></span>
          <span><span class="muted">Salidas</span><strong class="qty-out">−${esc(I().num(k.total_out))}</strong></span>
          <span><span class="muted">${ranged ? 'Saldo final' : 'Existencia'}</span><strong>${esc(I().num(k.closing_balance))}</strong></span>
          ${k.center ? `<span class="muted">${esc(k.center.name)}</span>` : ''}
        </div>`;
        if (!k.items.length) {
          listEl.innerHTML = Components.empty({ iconName: 'list', title: ranged || params.centro ? 'Sin movimientos en este periodo' : 'Sin movimientos todavía',
            text: ranged || params.centro ? 'Cambia el centro o las fechas.' : 'Registra la primera entrada para empezar el kardex.' });
          return;
        }
        const rows = k.items.map((r) => kardexRow(r, item, ctx));
        listEl.innerHTML = `
          <div class="table-wrap desktop-only"><table class="table table-compact kardex-table">
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Centro</th><th class="num">Entrada</th><th class="num">Salida</th>
              <th class="num">Saldo</th><th>Registró</th><th><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${rows.map((r) => r.tr).join('')}</tbody></table></div>
          <ul class="card-list mobile-only">${rows.map((r) => r.card).join('')}</ul>
          <p class="hint">Lo más reciente primero. El saldo es el acumulado ${k.center ? 'en el centro' : 'de todos los centros'} después de cada movimiento.</p>`;
        const byId = Object.fromEntries(k.items.map((r) => [r.id, r]));
        listEl.querySelectorAll('[data-reverse]').forEach((b) => b.addEventListener('click', async () => {
          const r = byId[b.dataset.reverse];
          if (await I().reverseDialog({ ...r, item })) reloadAll();
        }));
        pagerEl.appendChild(Components.paginationBar({
          page: k.page, pages: k.pages, total: k.total, pageSize: k.page_size, itemLabel: 'movimientos',
          onPageChange: (p) => setParams({ page: p > 1 ? p : null })
        }));
      } catch (err) {
        if (mySeq !== seq) return;
        Components.error(listEl, err, loadKardex);
      }
    }

    const q = (sel) => container.querySelector(sel);
    q('[name="centro"]').addEventListener('change', (e) => setParams({ centro: e.target.value, page: null }));
    q('[name="desde"]').addEventListener('change', (e) => setParams({ desde: e.target.value, page: null }));
    q('[name="hasta"]').addEventListener('change', (e) => setParams({ hasta: e.target.value, page: null }));
    container.querySelectorAll('[data-center]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      q('[name="centro"]').value = a.dataset.center;
      setParams({ centro: a.dataset.center, page: null });
      q('.kardex-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    q('[data-export]').addEventListener('click', (e) => Listado.exportCsv(e.currentTarget,
      `/inventory/items/${item.id}/kardex/export${UI.buildQuery(kardexQuery(params))}`, `kardex-articulo-${item.id}.csv`));
    container.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
      const centerId = params.centro || (item.stock_by_center.length === 1 ? item.stock_by_center[0].center.id : null);
      if (await I().movementDialog({ type: b.dataset.move, item, centerId })) reloadAll();
    }));
    q('[data-edit]').addEventListener('click', async () => { if (await Inventario.openForm(item)) reloadAll(); });
    q('[data-toggle]').addEventListener('click', () => toggle(item, reloadAll));
    loadKardex();
  }

  return { mount };
})();
