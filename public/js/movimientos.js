/**
 * Vista "Movimientos" (#movimientos, módulo INVENTARIO): libro de entradas, salidas, traspasos y anulaciones
 * de todos los artículos, con filtros y anulación.
 * Parámetros: q, tipo (ENTRADA | SALIDA), motivo, centro, desde, hasta, quien (mios), page.
 */
const Movimientos = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const I = () => InventarioUI;

  const REASON_OPTIONS = () => [['', 'Todos los motivos'],
    ...Object.entries(C().MOVEMENT_REASON_LABEL).map(([k, v]) => [k, v])];

  function actions(m, user) {
    if (!I().canReverse(m, user) || !m.item.is_active || !m.center.is_active) return '';
    return `<div class="row-actions row-actions-labeled"><button type="button" class="btn btn-ghost btn-sm" data-reverse="${m.id}">${UI.icon('undo')}<span>Anular</span></button></div>`;
  }

  function mount(container, ctx) {
    let list;
    const reload = () => list.reload();
    const openMove = async (type) => { if (await I().movementDialog({ type, centerId: list.params().centro || null })) reload(); };
    const today = Fechas.todayLocal();

    list = Listado.mount(container, ctx, {
      title: 'Movimientos de inventario',
      description: 'Todo lo que entra y sale de los centros de acopio. Los movimientos no se editan: un error se corrige anulándolo.',
      actions: [
        { label: 'Entrada', icon: 'arrowDown', primary: true, onClick: () => openMove('ENTRADA') },
        { label: 'Salida', icon: 'arrowUp', onClick: () => openMove('SALIDA') },
        { label: 'Traspaso', icon: 'arrowLeftRight', onClick: () => openMove('TRASPASO') }
      ],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Artículo, donante o notas' },
        { name: 'tipo', type: 'select', label: 'Tipo', options: [['', 'Entradas y salidas'], ['ENTRADA', 'Solo entradas'], ['SALIDA', 'Solo salidas']] },
        { name: 'motivo', type: 'select', label: 'Motivo', options: REASON_OPTIONS() },
        { name: 'centro', type: 'select', label: 'Centro', options: () => I().centerFilterOptions() },
        { name: 'desde', type: 'date', label: 'Desde', max: today },
        { name: 'hasta', type: 'date', label: 'Hasta', max: today },
        { name: 'quien', type: 'select', label: 'Registró', options: [['', 'Cualquier persona'], ['mios', 'Solo yo']] }
      ],
      endpoint: '/inventory/movements',
      query: (p) => ({ search: p.q, direction: p.tipo, reason: p.motivo, center_id: p.centro, date_from: p.desde, date_to: p.hasta,
        mine: p.quien === 'mios' ? 'true' : undefined }),
      itemLabel: 'movimientos',
      columns: [
        { label: 'Fecha', className: 'date-cell', render: (m) => `<span class="cell-stack"><span class="nowrap">${esc(Fechas.formatDate(m.movement_date))}</span><span class="muted">Folio ${m.id}</span></span>` },
        { label: 'Artículo', render: (m) => `<a class="strong-link" href="#articulo/${m.item.id}">${esc(m.item.name)}</a>` },
        { label: 'Movimiento', className: 'detail-cell', render: (m) => `<span class="cell-stack">${I().movementChip(m)}<span class="mov-detail">${I().movementDetail(m)}</span>${I().reversedBadge(m)}</span>` },
        { label: 'Centro', render: (m) => esc(m.center.name) },
        { label: 'Cantidad', className: 'num', render: (m) => I().signedQty(m, m.item.unit) },
        { label: 'Registró', render: (m) => (m.created_by ? esc(m.created_by.full_name) : '<span class="muted">—</span>') },
        { label: '', className: 'actions-cell', render: (m) => actions(m, ctx.user) }
      ],
      card: (m) => `
        <div class="item-card-head"><p><a class="strong-link" href="#articulo/${m.item.id}">${esc(m.item.name)}</a></p>${I().signedQty(m, m.item.unit)}</div>
        <p>${I().movementChip(m)} <span class="muted">${esc(Fechas.formatDate(m.movement_date))} · Folio ${m.id} · ${esc(m.center.name)}</span></p>
        <p class="mov-detail">${I().movementDetail(m)}</p>
        ${m.notes ? `<p class="muted pre-line">${esc(m.notes)}</p>` : ''}${I().reversedBadge(m)}
        ${actions(m, ctx.user)}`,
      empty: (filtered) => ({
        iconName: 'arrowLeftRight', title: filtered ? 'Sin movimientos con esos filtros' : 'Aún no hay movimientos',
        text: filtered ? 'Cambia las fechas, el centro o el motivo.' : 'Registra la primera entrada de un artículo en un centro de acopio.'
      }),
      onItems: (el, items) => {
        const byId = Object.fromEntries(items.map((x) => [x.id, x]));
        el.querySelectorAll('[data-reverse]').forEach((b) => b.addEventListener('click', async () => {
          if (await I().reverseDialog(byId[b.dataset.reverse])) reload();
        }));
      }
    });
  }

  return { mount };
})();
