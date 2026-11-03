/**
 * Piezas compartidas del Inventario (Fase 6): cantidades con unidad, chips de movimiento, opciones de los
 * selectores y los diálogos "Registrar movimiento" y "Anular movimiento".
 *
 *   InventarioUI.movementDialog({ type: 'ENTRADA' | 'SALIDA' | 'TRASPASO', item, centerId }) → Promise<movements | null>
 *   InventarioUI.reverseDialog(movement) → Promise<movements | null>
 */
const InventarioUI = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const nf = new Intl.NumberFormat('es-MX');

  const num = (n) => nf.format(Number(n) || 0);
  /** "12 piezas", "1 pieza", "3 kg". */
  function qty(n, unit) {
    const v = Number(n) || 0;
    const label = Math.abs(v) === 1 ? (C().INVENTORY_UNIT_LABEL[unit] || '').toLowerCase() : C().INVENTORY_UNIT_PLURAL[unit];
    return `${num(v)} ${label || ''}`.trim();
  }

  const TYPE_META = {
    ENTRADA: { label: 'Entrada', icon: 'arrowDown', cls: 'mov-in' },
    SALIDA: { label: 'Salida', icon: 'arrowUp', cls: 'mov-out' },
    TRASPASO: { label: 'Traspaso', icon: 'arrowLeftRight', cls: 'mov-transfer' },
    ANULACION: { label: 'Anulación', icon: 'undo', cls: 'mov-reversal' }
  };

  /** Tipo visible de un movimiento: traspaso y anulación se distinguen de entrada/salida. */
  const kindOf = (m) => (m.reason === 'ANULACION' ? 'ANULACION' : (m.reason === 'TRASPASO' ? 'TRASPASO' : m.direction));

  function movementChip(m) {
    const meta = TYPE_META[kindOf(m)];
    const dir = m.reason === 'TRASPASO' || m.reason === 'ANULACION' ? ` <span class="mov-dir">${m.direction === 'ENTRADA' ? 'entra' : 'sale'}</span>` : '';
    return `<span class="mov-chip ${meta.cls}">${UI.icon(meta.icon)}${esc(meta.label)}${dir}</span>`;
  }

  /** Texto secundario del movimiento: motivo, centro del traspaso, folio anulado, evento y donante. */
  function movementDetail(m, { showCenter = false } = {}) {
    const parts = [];
    if (m.reason === 'TRASPASO' && m.peer_center) parts.push(`${m.direction === 'SALIDA' ? 'Hacia' : 'Desde'} ${esc(m.peer_center.name)}`);
    else if (m.reason === 'ANULACION') parts.push(`Anula el folio ${m.reverses_id}`);
    else parts.push(esc(C().MOVEMENT_REASON_LABEL[m.reason] || m.reason));
    if (showCenter) parts.push(esc(m.center.name));
    if (m.event) parts.push(`${UI.icon('calendarDays')}${esc(m.event.name)}`);
    if (m.counterpart) parts.push(esc(m.counterpart));
    return parts.map((p) => `<span>${p}</span>`).join('');
  }

  const signedQty = (m, unit) => `<span class="qty ${m.direction === 'ENTRADA' ? 'qty-in' : 'qty-out'}">${m.direction === 'ENTRADA' ? '+' : '−'}${esc(qty(m.quantity, unit))}</span>`;

  const reversedBadge = (m) => (m.reversed_by_id ? `<span class="badge badge-plain">Anulado (folio ${m.reversed_by_id})</span>` : '');

  /** ¿Puede esta persona anular el movimiento? (el servidor lo vuelve a revisar) */
  const canReverse = (m, user) => m.reason !== 'ANULACION' && !m.reversed_by_id && user
    && (user.role === 'ADMIN' || (m.created_by && m.created_by.id === user.id));

  function stockBadge(item) {
    if (!item.is_active) return '<span class="badge badge-danger">Dado de baja</span>';
    if (item.low_stock) return `<span class="badge badge-warning" title="Existencia mínima: ${num(item.min_stock)}">Existencia baja</span>`;
    if (item.total_stock === 0) return '<span class="badge badge-plain">Sin existencia</span>';
    return '';
  }

  // ---------- Opciones de los selectores ----------
  let optionsCache = null;
  let optionsAt = 0;
  async function options({ fresh = false } = {}) {
    if (!fresh && optionsCache && Date.now() - optionsAt < 30e3) return optionsCache;
    optionsCache = await UI.api('/inventory/options');
    optionsAt = Date.now();
    return optionsCache;
  }
  const invalidateOptions = () => { optionsCache = null; };

  async function centerFilterOptions(emptyLabel = 'Todos los centros') {
    const o = await options();
    return [['', emptyLabel], ...o.centers.map((c) => [String(c.id), c.name])];
  }
  async function categoryFilterOptions(emptyLabel = 'Todas las categorías') {
    const o = await options();
    return [['', emptyLabel], ...o.categories.map((c) => [String(c.id), c.name])];
  }

  // ---------- Registrar movimiento ----------
  const TYPE_TEXT = {
    ENTRADA: { title: 'Registrar entrada', submit: 'Registrar entrada', center: 'Centro que recibe', counterpart: 'Donante o proveedor',
      counterpartHint: 'Persona, empresa o escuela que lo entregó (opcional).', desc: 'Lo que llega a un centro de acopio: donaciones, compras o devoluciones.' },
    SALIDA: { title: 'Registrar salida', submit: 'Registrar salida', center: 'Centro de donde sale', counterpart: 'Entregado a',
      counterpartHint: 'Quién se lo llevó o a quién se entregó (opcional).', desc: 'Lo que sale de un centro: uso en un evento, entregas, mermas o ajustes.' },
    TRASPASO: { title: 'Registrar traspaso', submit: 'Registrar traspaso', center: 'Centro de origen', counterpart: 'Quién lo llevó',
      counterpartHint: 'Persona que trasladó los artículos (opcional).', desc: 'Mueve existencias de un centro a otro sin cambiar el total.' }
  };

  /**
   * Diálogo de captura con varias líneas. opts: { type, item (precargado), centerId }.
   * Resuelve con los movimientos creados o null si se cancela.
   */
  function movementDialog({ type = 'ENTRADA', item = null, centerId = null } = {}) {
    return new Promise((resolve) => {
      let result = null;
      const state = {
        type, centerId: centerId ? String(centerId) : '', toCenterId: '', lines: [], opts: null,
        stock: {} // existencia por artículo en el centro elegido: { itemId: n }
      };
      if (item) state.lines.push({ item: { id: item.id, name: item.name, unit: item.unit, category: item.category }, quantity: '' });

      const dialog = UI.dialog({
        title: TYPE_TEXT[type].title, as: 'form',
        bodyHtml: `<div class="form mov-form">
          <div class="segmented mov-types" role="group" aria-label="Tipo de movimiento">
            ${['ENTRADA', 'SALIDA', 'TRASPASO'].map((t) => `<button type="button" class="segmented-btn" data-type="${t}" aria-pressed="${t === type}">
              ${UI.icon(TYPE_META[t].icon)}${TYPE_META[t].label}</button>`).join('')}
          </div>
          <p class="muted" data-desc></p>
          <div class="form-grid">
            <div class="field" data-field="center_id"><label for="mvCenter" data-center-label></label>
              <div class="select-wrap"><select class="input select" id="mvCenter" name="center_id" aria-required="true"><option value="">Cargando…</option></select></div>
              <p class="field-error" hidden></p></div>
            <div class="field" data-field="to_center_id" data-only="TRASPASO"><label for="mvTo">Centro de destino <span class="req" aria-hidden="true">*</span></label>
              <div class="select-wrap"><select class="input select" id="mvTo" name="to_center_id"></select></div>
              <p class="field-error" hidden></p></div>
            <div class="field" data-field="reason" data-only="ENTRADA SALIDA"><label for="mvReason">Motivo <span class="req" aria-hidden="true">*</span></label>
              <div class="select-wrap"><select class="input select" id="mvReason" name="reason"></select></div>
              <p class="field-error" hidden></p></div>
            <div class="field" data-field="movement_date"><label for="mvDate">Fecha <span class="req" aria-hidden="true">*</span></label>
              <input class="input" type="date" id="mvDate" name="movement_date" value="${Fechas.todayLocal()}" max="${Fechas.todayLocal()}">
              <p class="hint">Si lo capturas después, pon el día en que ocurrió.</p>
              <p class="field-error" hidden></p></div>
          </div>
          <div class="mov-lines-field">
            <div data-field="lines"><span class="field-label">Artículos <span class="req" aria-hidden="true">*</span></span>
              <p class="field-error" hidden></p></div>
            <ul class="mov-lines" data-lines></ul>
            <div class="mov-picker">
              <span class="search">${UI.icon('search')}<input class="input" type="search" data-item-search placeholder="Busca un artículo para agregarlo" autocomplete="off" aria-label="Buscar artículo para agregar"></span>
              <div class="mov-results" data-results hidden></div>
            </div>
          </div>
          <div class="form-grid">
            <div class="field" data-field="event_id"><label for="mvEvent">Evento (opcional)</label>
              <div class="select-wrap"><select class="input select" id="mvEvent" name="event_id"><option value="">Sin evento</option></select></div>
              <p class="field-error" hidden></p></div>
            <div class="field" data-field="counterpart"><label for="mvWho" data-who-label></label>
              <input class="input" id="mvWho" name="counterpart" maxlength="150" autocomplete="off">
              <p class="hint" data-who-hint></p><p class="field-error" hidden></p></div>
            <div class="field full" data-field="notes"><label for="mvNotes">Notas (opcional)</label>
              <textarea class="input textarea" id="mvNotes" name="notes" rows="2" maxlength="500"></textarea>
              <p class="field-error" hidden></p></div>
          </div>
          <div class="alert alert-error" data-dialog-error role="alert" hidden></div>
        </div>`,
        footerHtml: `<div class="modal-actions"><span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="submit" class="btn btn-primary" data-submit></button></div>`,
        onClose: () => resolve(result)
      });
      const form = dialog.el;
      form.classList.add('modal-wide');
      const $ = (sel) => form.querySelector(sel);
      const F = Components.form;
      const errorBox = $('[data-dialog-error]');
      $('[data-cancel]').addEventListener('click', dialog.close);
      F.bindLiveClear(form);

      function fillSelect(sel, opts, value) {
        sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
      }

      function renderType() {
        const t = TYPE_TEXT[state.type];
        form.querySelector('.modal-header h2').textContent = t.title;
        $('[data-desc]').textContent = t.desc;
        $('[data-center-label]').innerHTML = `${esc(t.center)} <span class="req" aria-hidden="true">*</span>`;
        $('[data-who-label]').textContent = `${t.counterpart} (opcional)`;
        $('[data-who-hint]').textContent = t.counterpartHint;
        $('[data-submit]').textContent = t.submit;
        form.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === state.type)));
        form.querySelectorAll('[data-only]').forEach((el) => { el.hidden = !el.dataset.only.split(' ').includes(state.type); });
        const reasons = state.type === 'ENTRADA' ? C().ENTRY_REASONS : C().EXIT_REASONS;
        const current = $('#mvReason').value;
        fillSelect($('#mvReason'), [['', 'Elige el motivo'], ...reasons.map((r) => [r, C().MOVEMENT_REASON_LABEL[r]])],
          reasons.includes(current) ? current : '');
        renderLines();
      }

      function renderCenters() {
        const centers = state.opts.centers;
        fillSelect($('#mvCenter'), [['', centers.length ? 'Elige el centro' : 'No hay centros de acopio activos'], ...centers.map((c) => [String(c.id), c.name])], state.centerId);
        fillSelect($('#mvTo'), [['', 'Elige el destino'], ...centers.filter((c) => String(c.id) !== state.centerId).map((c) => [String(c.id), c.name])], state.toCenterId);
        fillSelect($('#mvEvent'), [['', 'Sin evento'], ...state.opts.events.map((e) => [String(e.id), e.name])], '');
        if (!centers.length) {
          errorBox.innerHTML = `${UI.icon('alert')}<span>Primero registra un centro de acopio en <a href="#inventario-catalogos?tab=centros">Centros y categorías</a>.</span>`;
          errorBox.hidden = false;
        }
      }

      const needsStock = () => state.type !== 'ENTRADA' && state.centerId;

      /** Existencia en el centro de origen de los artículos de la lista (para avisar antes de enviar). */
      async function refreshStock() {
        if (!needsStock() || !state.lines.length) { renderLines(); return; }
        const center = state.centerId;
        await Promise.all(state.lines.map(async (l) => {
          const key = `${center}:${l.item.id}`;
          if (state.stock[key] !== undefined) return;
          try {
            const { item: it } = await UI.api(`/inventory/items/${l.item.id}`);
            for (const s of it.stock_by_center) state.stock[`${s.center.id}:${it.id}`] = s.stock;
            if (state.stock[key] === undefined) state.stock[key] = 0;
          } catch { /* el aviso es orientativo */ }
        }));
        renderLines();
      }

      function renderLines() {
        const list = $('[data-lines]');
        if (!state.lines.length) {
          list.innerHTML = '<li class="mov-line-empty muted">Aún no agregas artículos.</li>';
          return;
        }
        list.innerHTML = state.lines.map((l, i) => {
          const available = needsStock() ? state.stock[`${state.centerId}:${l.item.id}`] : undefined;
          const over = available !== undefined && Number(l.quantity) > available;
          const hint = available === undefined ? (C().INVENTORY_UNIT_LABEL[l.item.unit] || '')
            : `Hay ${qty(available, l.item.unit)} en este centro`;
          return `<li class="mov-line" data-line="${i}">
            <div class="mov-line-item" data-field="lines[${i}].item_id">
              <strong>${esc(l.item.name)}</strong>
              <span class="muted${over ? ' mov-over' : ''}">${esc(hint)}</span>
              <p class="field-error" hidden></p>
            </div>
            <div class="mov-line-qty" data-field="lines[${i}].quantity">
              <label class="sr-only" for="mvQty${i}">Cantidad de ${esc(l.item.name)}</label>
              <input class="input" id="mvQty${i}" type="number" inputmode="numeric" min="1" max="${C().INVENTORY_MAX_QUANTITY}" step="1"
                value="${esc(l.quantity)}" data-qty="${i}" placeholder="Cantidad">
              <p class="field-error" hidden></p>
            </div>
            <button type="button" class="btn btn-ghost btn-icon" data-remove="${i}" aria-label="Quitar ${esc(l.item.name)}">${UI.icon('x')}</button>
          </li>`;
        }).join('');
        list.querySelectorAll('[data-qty]').forEach((inp) => inp.addEventListener('input', () => {
          state.lines[Number(inp.dataset.qty)].quantity = inp.value;
          const i = Number(inp.dataset.qty);
          const l = state.lines[i];
          const available = needsStock() ? state.stock[`${state.centerId}:${l.item.id}`] : undefined;
          const hintEl = inp.closest('.mov-line').querySelector('.mov-line-item .muted');
          if (hintEl) hintEl.classList.toggle('mov-over', available !== undefined && Number(inp.value) > available);
        }));
        list.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
          state.lines.splice(Number(b.dataset.remove), 1);
          renderLines();
          $('[data-item-search]').focus();
        }));
      }

      // Búsqueda de artículos
      let searchTimer = null;
      let searchSeq = 0;
      const results = $('[data-results]');
      const searchInput = $('[data-item-search]');
      async function search() {
        const term = searchInput.value.trim();
        const mySeq = ++searchSeq;
        if (!term) { results.hidden = true; results.innerHTML = ''; return; }
        try {
          const q = { search: term, is_active: 'true', page_size: 8, order_by: 'name' };
          if (needsStock()) q.center_id = state.centerId;
          const data = await UI.api(`/inventory/items${UI.buildQuery(q)}`);
          if (mySeq !== searchSeq) return;
          const taken = new Set(state.lines.map((l) => l.item.id));
          const items = data.items.filter((x) => !taken.has(x.id));
          results.innerHTML = items.length ? items.map((x) => `<button type="button" class="mov-result" data-pick="${x.id}">
              <span><strong>${esc(x.name)}</strong><span class="muted"> · ${esc(x.category.name)}</span></span>
              <span class="muted nowrap">${needsStock() ? `Hay ${esc(qty(x.center_stock, x.unit))}` : esc(qty(x.total_stock, x.unit))}</span>
            </button>`).join('')
            : `<p class="muted mov-noresults">No hay artículos activos con ese nombre. <a href="#inventario?nuevo=1" data-new-item>Registrar artículo</a></p>`;
          results.hidden = false;
          const byId = Object.fromEntries(items.map((x) => [x.id, x]));
          results.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
            const x = byId[b.dataset.pick];
            if (state.lines.length >= C().INVENTORY_MAX_LINES) { UI.toast(`Máximo ${C().INVENTORY_MAX_LINES} artículos por captura`, 'error'); return; }
            state.lines.push({ item: { id: x.id, name: x.name, unit: x.unit, category: x.category }, quantity: '' });
            if (needsStock()) state.stock[`${state.centerId}:${x.id}`] = x.center_stock;
            F.setError(form, 'lines', '');
            searchInput.value = '';
            results.hidden = true;
            renderLines();
            const last = form.querySelector(`[data-qty="${state.lines.length - 1}"]`);
            if (last) last.focus();
          }));
          const newLink = results.querySelector('[data-new-item]');
          if (newLink) newLink.addEventListener('click', () => dialog.close());
        } catch (err) {
          results.innerHTML = `<p class="field-error">${esc(err.message)}</p>`;
          results.hidden = false;
        }
      }
      searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 250); });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const first = results.querySelector('[data-pick]'); if (first) first.click(); }
        if (e.key === 'Escape' && !results.hidden) { e.stopPropagation(); results.hidden = true; }
      });

      form.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
        state.type = b.dataset.type;
        renderType();
        refreshStock();
      }));
      $('#mvCenter').addEventListener('change', (e) => {
        state.centerId = e.target.value;
        if (state.toCenterId === state.centerId) state.toCenterId = '';
        renderCenters();
        refreshStock();
      });
      $('#mvTo').addEventListener('change', (e) => { state.toCenterId = e.target.value; });

      function clientErrors(body) {
        const errors = [];
        if (!body.center_id) errors.push({ field: 'center_id', message: 'Elige el centro de acopio.' });
        if (state.type === 'TRASPASO' && !body.to_center_id) errors.push({ field: 'to_center_id', message: 'Elige el centro de destino.' });
        if (state.type !== 'TRASPASO' && !body.reason) errors.push({ field: 'reason', message: 'Elige el motivo.' });
        if (!body.movement_date) errors.push({ field: 'movement_date', message: 'Escribe la fecha.' });
        else if (body.movement_date > Fechas.todayLocal()) errors.push({ field: 'movement_date', message: 'La fecha no puede ser futura.' });
        if (!body.lines.length) errors.push({ field: 'lines', message: 'Agrega al menos un artículo.' });
        body.lines.forEach((l, i) => {
          if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > C().INVENTORY_MAX_QUANTITY) {
            errors.push({ field: `lines[${i}].quantity`, message: 'Escribe una cantidad entera mayor a 0.' });
          }
        });
        return errors;
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        F.clearErrors(form);
        const val = (name) => { const v = String(form.elements[name].value || '').trim(); return v === '' ? null : v; };
        const body = {
          type: state.type,
          center_id: val('center_id') ? Number(val('center_id')) : null,
          movement_date: val('movement_date'),
          event_id: val('event_id') ? Number(val('event_id')) : null,
          counterpart: val('counterpart'),
          notes: val('notes'),
          lines: state.lines.map((l) => ({ item_id: l.item.id, quantity: /^\d+$/.test(String(l.quantity).trim()) ? Number(l.quantity) : NaN }))
        };
        if (state.type === 'TRASPASO') body.to_center_id = val('to_center_id') ? Number(val('to_center_id')) : null;
        else body.reason = val('reason');
        const errors = clientErrors(body);
        if (errors.length) { F.showErrors(form, errors); return; }
        const button = $('[data-submit]');
        UI.setBusy(button, true);
        try {
          const out = await UI.api('/inventory/movements', { method: 'POST', body });
          result = out.movements;
          const n = body.lines.length;
          UI.toast(`${TYPE_META[state.type].label} registrada${n > 1 ? ` (${n} artículos)` : ''}`, 'success');
          dialog.close();
        } catch (err) {
          UI.setBusy(button, false);
          if (err.code === 'INSUFFICIENT_STOCK' && err.data && err.data.line !== null && err.data.line !== undefined) {
            const l = state.lines[err.data.line];
            if (l) state.stock[`${state.centerId}:${l.item.id}`] = err.data.available;
            renderLines();
            F.showErrors(form, [{ field: `lines[${err.data.line}].quantity`, message: err.message }]);
            return;
          }
          const rest = err.details ? F.showErrors(form, err.details) : [err];
          if (rest.length) { errorBox.innerHTML = `${UI.icon('alert')}<span>${esc(rest[0].message || err.message)}</span>`; errorBox.hidden = false; }
        }
      });

      renderType();
      options({ fresh: true }).then((o) => {
        state.opts = o;
        if (!state.centerId && o.centers.length === 1) state.centerId = String(o.centers[0].id);
        renderCenters();
        refreshStock();
        (state.lines.length ? form.querySelector('[data-qty="0"]') : $('#mvCenter')).focus();
      }).catch((err) => {
        errorBox.innerHTML = `${UI.icon('alert')}<span>${esc(err.message)}</span>`;
        errorBox.hidden = false;
      });
    });
  }

  // ---------- Anular ----------
  function reverseDialog(m) {
    return new Promise((resolve) => {
      let result = null;
      const transfer = m.reason === 'TRASPASO';
      const dialog = UI.dialog({
        title: `¿Anular el folio ${m.id}?`, as: 'form',
        description: transfer
          ? 'Se registrará el movimiento contrario en los dos centros del traspaso, con fecha de hoy. El original se conserva en el kardex.'
          : `Se registrará una ${m.direction === 'ENTRADA' ? 'salida' : 'entrada'} por la misma cantidad, con fecha de hoy. El original se conserva en el kardex.`,
        bodyHtml: `<div class="form">
          <p><strong>${esc(m.item ? m.item.name : '')}</strong> · ${movementChip(m)} ${esc(qty(m.quantity, m.item ? m.item.unit : 'PIEZA'))} · ${esc(m.center.name)}</p>
          ${Components.form.field({ name: 'reason', label: 'Motivo de la anulación', type: 'textarea', required: true, max: 500, rows: 2,
            placeholder: 'Ej.: se capturó dos veces' })}
          <div class="alert alert-error" data-dialog-error role="alert" hidden></div></div>`,
        footerHtml: `<div class="modal-actions"><span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="submit" class="btn btn-destructive">Anular movimiento</button></div>`,
        onClose: () => resolve(result)
      });
      const form = dialog.el;
      const F = Components.form;
      const errorBox = form.querySelector('[data-dialog-error]');
      form.querySelector('[data-cancel]').addEventListener('click', dialog.close);
      F.bindLiveClear(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        F.clearErrors(form);
        errorBox.hidden = true;
        const reason = String(form.elements.reason.value || '').trim();
        if ([...reason].length < 5) { F.showErrors(form, [{ field: 'reason', message: 'Escribe al menos 5 caracteres.' }]); return; }
        const button = form.querySelector('[type="submit"]');
        UI.setBusy(button, true);
        try {
          result = (await UI.api(`/inventory/movements/${m.id}/reverse`, { method: 'POST', body: { reason } })).movements;
          UI.toast(`Folio ${m.id} anulado`, 'success');
          dialog.close();
        } catch (err) {
          UI.setBusy(button, false);
          const rest = err.details ? F.showErrors(form, err.details) : [err];
          if (rest.length) { errorBox.innerHTML = `${UI.icon('alert')}<span>${esc(rest[0].message || err.message)}</span>`; errorBox.hidden = false; }
        }
      });
      form.querySelector('textarea').focus();
    });
  }

  return {
    num, qty, TYPE_META, kindOf, movementChip, movementDetail, signedQty, reversedBadge, canReverse, stockBadge,
    options, invalidateOptions, centerFilterOptions, categoryFilterOptions, movementDialog, reverseDialog
  };
})();
