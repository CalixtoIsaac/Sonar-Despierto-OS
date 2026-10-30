/**
 * Pantalla de listado reutilizable (Fase 3 en adelante): encabezado, filtros sincronizados con la URL,
 * tabla en escritorio y tarjetas en móvil, paginación y estados de carga, vacío y error.
 *
 *   const lista = Listado.mount(container, ctx, {
 *     title, description, actions: [{ label, icon, primary, href, onClick, id }],
 *     filters: [{ name: 'q', type: 'search', label, placeholder } | { name, type: 'select', label, options }],
 *     endpoint: '/children', query: (params) => ({ … }), itemLabel: 'niñas y niños',
 *     columns: [{ label, render: (item) => html, className }], card: (item) => html,
 *     empty: (hasFilters) => ({ iconName, title, text, actionHtml }),
 *     onItems: (listEl, items) => {}, top: (params, el) => {}
 *   });
 *   lista.reload() · lista.params()
 *
 * options de un select: [[valor, etiqueta], …] o una función async que los devuelve.
 */
const Listado = (() => {
  const esc = (v) => UI.escape(v);

  function selectHtml(f, value, options) {
    return `<label class="filter"><span class="filter-label">${esc(f.label)}</span>
      <span class="select-wrap"><select class="input select" name="${f.name}">
        ${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}
      </select></span></label>`;
  }

  function mount(container, ctx, config) {
    let params = { ...ctx.params };
    let seq = 0;
    let searchTimer = null;

    container.innerHTML = `
      <section class="page-header">
        <div><h2>${esc(config.title)}</h2>${config.description ? `<p class="muted">${esc(config.description)}</p>` : ''}</div>
        <div class="header-actions" data-actions></div>
      </section>
      <div data-top></div>
      <section class="card panel">
        <div class="filters" data-filters></div>
        <div data-list></div>
        <div data-pager></div>
      </section>`;

    const actionsEl = container.querySelector('[data-actions]');
    const filtersEl = container.querySelector('[data-filters]');
    const listEl = container.querySelector('[data-list]');
    const pagerEl = container.querySelector('[data-pager]');
    const topEl = container.querySelector('[data-top]');

    for (const a of config.actions || []) {
      const el = document.createElement(a.href ? 'a' : 'button');
      el.className = `btn ${a.primary ? 'btn-primary' : 'btn-outline'}`;
      if (a.href) el.href = a.href; else el.type = 'button';
      if (a.id) el.dataset.action = a.id;
      el.innerHTML = `${a.icon ? UI.icon(a.icon) : ''}${esc(a.label)}`;
      if (a.onClick) el.addEventListener('click', () => a.onClick(el, { ...params }));
      actionsEl.appendChild(el);
    }

    function setParams(patch, { push = true } = {}) {
      params = { ...params, ...patch };
      for (const k of Object.keys(params)) if (params[k] === null || params[k] === '' || params[k] === undefined) delete params[k];
      ctx.navigate(params, { push });
      load();
    }

    async function renderFilters() {
      const parts = [];
      for (const f of config.filters || []) {
        if (f.type === 'search') {
          parts.push(`<label class="filter filter-search"><span class="filter-label">${esc(f.label || 'Buscar')}</span>
            <span class="search">${UI.icon('search')}<input class="input" type="search" name="${f.name}"
              value="${esc(params[f.name] || '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off"></span></label>`);
        } else {
          const opts = typeof f.options === 'function' ? [['', f.loadingLabel || 'Cargando…']] : f.options;
          parts.push(selectHtml(f, params[f.name], opts));
        }
      }
      filtersEl.innerHTML = parts.join('');
      for (const f of config.filters || []) {
        const el = filtersEl.querySelector(`[name="${f.name}"]`);
        if (f.type === 'search') {
          el.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => setParams({ [f.name]: el.value.trim(), page: null }, { push: false }), 300);
          });
        } else {
          el.addEventListener('change', () => setParams({ [f.name]: el.value, page: null }));
          if (typeof f.options === 'function') {
            try {
              const opts = await f.options();
              el.closest('.filter').outerHTML = selectHtml(f, params[f.name], opts);
              filtersEl.querySelector(`[name="${f.name}"]`).addEventListener('change', (e) => setParams({ [f.name]: e.target.value, page: null }));
            } catch { /* el filtro queda sin opciones */ }
          }
        }
      }
    }

    const hasFilters = () => (config.filters || []).some((f) => params[f.name]);

    async function load() {
      const mySeq = ++seq;
      listEl.innerHTML = Components.loading(5);
      pagerEl.innerHTML = '';
      if (config.top) config.top({ ...params }, topEl);
      try {
        const q = { page: Number(params.page) || 1, page_size: config.pageSize || 20, ...config.query({ ...params }) };
        const data = await UI.api(`${config.endpoint}${UI.buildQuery(q)}`);
        if (mySeq !== seq) return;
        if (!data.items.length) {
          const e = config.empty(hasFilters());
          listEl.innerHTML = Components.empty(e);
          if (config.onEmpty) config.onEmpty(listEl);
        } else {
          listEl.innerHTML = `
            <div class="table-wrap desktop-only"><table class="table">
              <thead><tr>${config.columns.map((c) => `<th${c.className ? ` class="${c.className}"` : ''}>${c.label ? esc(c.label) : '<span class="sr-only">Acciones</span>'}</th>`).join('')}</tr></thead>
              <tbody>${data.items.map((item) => `<tr data-row="${item.id}"${item.is_active === false ? ' class="row-inactive"' : ''}>
                ${config.columns.map((c) => `<td${c.className ? ` class="${c.className}"` : ''}>${c.render(item)}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>
            <ul class="card-list mobile-only">${data.items.map((item) => `<li class="item-card${item.is_active === false ? ' row-inactive' : ''}" data-row="${item.id}">${config.card(item)}</li>`).join('')}</ul>`;
          if (config.onItems) config.onItems(listEl, data.items);
        }
        pagerEl.appendChild(Components.paginationBar({
          page: data.page, pages: data.pages, total: data.total, pageSize: data.page_size, itemLabel: config.itemLabel,
          onPageChange: (p) => { setParams({ page: p > 1 ? p : null }); container.scrollIntoView(); }
        }));
      } catch (err) {
        if (mySeq !== seq) return;
        Components.error(listEl, err, load);
      }
    }

    renderFilters();
    load();
    return { reload: load, params: () => ({ ...params }), setParams };
  }

  /** Insignia de estado de un registro de persona. */
  const activeBadge = (item) => (item.is_active
    ? '<span class="badge badge-success">Activo</span>'
    : '<span class="badge badge-danger">Dado de baja</span>');

  /** Teléfono como enlace tel: (o "—"). */
  const phoneLink = (phone) => (phone ? `<a href="tel:${esc(phone)}" class="nowrap">${esc(Phone.format(phone))}</a>` : '<span class="muted">—</span>');

  /**
   * Muestra el aviso de duplicado (409) con enlace al registro existente.
   * Devuelve una promesa que se resuelve al cerrar.
   */
  function duplicateNotice(err, { title, href, linkText = 'Ver registro existente' }) {
    return new Promise((resolve) => {
      const dialog = UI.dialog({
        title,
        description: err.message,
        footerHtml: `<button type="button" class="btn btn-outline" data-close>Seguir editando</button>
          ${href ? `<a class="btn btn-primary" href="${href}" data-go>${UI.icon('eye')}${esc(linkText)}</a>` : ''}`,
        onClose: resolve
      });
      dialog.el.querySelector('[data-close]').addEventListener('click', dialog.close);
      const go = dialog.el.querySelector('[data-go]');
      if (go) { go.addEventListener('click', () => dialog.close()); go.focus(); }
    });
  }

  /** Exporta a CSV con los filtros actuales (la descarga queda registrada en la bitácora). */
  async function exportCsv(button, path, fallbackName) {
    UI.setBusy(button, true);
    try {
      await UI.download(path, fallbackName);
      UI.toast('Archivo descargado. La exportación quedó registrada en la bitácora.', 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    } finally {
      UI.setBusy(button, false);
    }
  }

  /**
   * Formulario en un diálogo con errores por campo (escuelas, tutores).
   *   fields: definiciones de Components.form.field; validate(values) → [{ field, message }]
   *   onSubmit(values) → resultado (cierra) | lanza error de la API (422 bajo cada campo; 409 → onDuplicate)
   */
  function formDialog({ title, description = '', fields, values = {}, submitText = 'Guardar', validate, onSubmit, onDuplicate }) {
    return new Promise((resolve) => {
      let result = null;
      const F = Components.form;
      const dialog = UI.dialog({
        title, description, as: 'form',
        bodyHtml: `<div class="form"><div class="form-grid">${fields.map((f) => F.field(f, values[f.name] ?? '')).join('')}</div>
          <div class="alert alert-error" data-dialog-error role="alert" hidden></div></div>`,
        footerHtml: `<div class="modal-actions"><span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="submit" class="btn btn-primary">${esc(submitText)}</button></div>`,
        onClose: () => resolve(result)
      });
      dialog.el.classList.add('modal-wide');
      const form = dialog.el;
      const errorBox = form.querySelector('[data-dialog-error]');
      form.querySelector('[data-cancel]').addEventListener('click', dialog.close);
      F.bindLiveClear(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        F.clearErrors(form);
        const data = F.read(form, fields);
        const errors = validate ? validate(data) : [];
        if (errors.length) { F.showErrors(form, errors); return; }
        const button = form.querySelector('[type="submit"]');
        UI.setBusy(button, true);
        try {
          result = await onSubmit(data);
          dialog.close();
        } catch (err) {
          UI.setBusy(button, false);
          if (err.status === 409 && onDuplicate) { onDuplicate(err); return; }
          const rest = err.details ? F.showErrors(form, err.details) : [err];
          if (rest.length) { errorBox.innerHTML = UI.icon('alert') + `<span>${esc(rest[0].message || err.message)}</span>`; errorBox.hidden = false; }
        }
      });
      const first = form.querySelector('input, select, textarea');
      if (first) first.focus();
    });
  }

  /** Reglas del navegador comunes: obligatorios, teléfonos y correos (los mismos mensajes que el servidor). */
  function basicValidate(values, fields) {
    const errors = [];
    for (const f of fields) {
      const v = values[f.name];
      if (f.required && (v === null || v === '' || v === undefined) && f.type !== 'checkbox') {
        errors.push({ field: f.name, message: f.type === 'select' ? 'Elige una opción.' : 'Este campo es obligatorio.' });
      } else if (v && f.type === 'tel' && !Phone.isValid(v)) {
        errors.push({ field: f.name, message: 'El teléfono debe tener 10 dígitos.' });
      } else if (v && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        errors.push({ field: f.name, message: 'Escribe un correo electrónico válido.' });
      } else if (v && f.max && [...String(v)].length > f.max) {
        errors.push({ field: f.name, message: `Máximo ${f.max} caracteres.` });
      }
    }
    return errors;
  }

  /** Convierte los valores del formulario al cuerpo de la API: teléfonos normalizados, ids numéricos. */
  function toBody(values, fields) {
    const body = {};
    for (const f of fields) {
      let v = values[f.name];
      if (f.type === 'tel' && v) v = Phone.normalize(v);
      if (f.numeric) v = v ? Number(v) : null;
      body[f.name] = v;
    }
    return body;
  }

  /** Opciones de escuelas activas para selects (máximo 100, por nombre). */
  async function schoolOptions({ includeId = null, emptyLabel = 'Sin escuela' } = {}) {
    const data = await UI.api('/schools?is_active=true&page_size=100&order_by=name');
    const opts = data.items.map((s) => [String(s.id), s.zone ? `${s.name} (${s.zone})` : s.name]);
    if (includeId && !opts.some(([v]) => v === String(includeId))) {
      try {
        const { school } = await UI.api(`/schools/${includeId}`);
        opts.push([String(school.id), `${school.name} (dada de baja)`]);
      } catch { /* sin acceso o eliminada */ }
    }
    return [['', emptyLabel], ...opts];
  }

  return { mount, activeBadge, phoneLink, duplicateNotice, exportCsv, formDialog, basicValidate, toBody, schoolOptions };
})();
