/**
 * Componentes compartidos de la interfaz (Fase 2 en adelante).
 *
 *   Components.modulePicker(el, { value, onChange, disabled, highlight, idPrefix }) → { getValue, setValue, setDisabled }
 *   Components.paginationBar({ page, pages, total, pageSize, itemLabel, onPageChange }) → HTMLElement
 *   Components.passwordStrength(input) → HTMLElement (indicador que se actualiza solo)
 *   Components.secretReveal({ secret, title, hint }) → HTMLElement
 *   Components.loading(n) · Components.empty({...}) · Components.error(err, onRetry) → HTML de estados
 *   Components.form: field(def, value) · read(form, defs) · showErrors(form, details) · clearErrors(form)
 *
 * Las funciones puras (paginationText) se exportan para las pruebas con node:test.
 */
const Components = (() => {
  const esc = (v) => (typeof UI !== 'undefined' ? UI.escape(v) : String(v ?? ''));
  const icon = (n) => (typeof UI !== 'undefined' ? UI.icon(n) : '');
  let uid = 0;

  // ---------- Selector de módulos ----------
  function modulePicker(container, { value = [], onChange, disabled = false, highlight = [], idPrefix } = {}) {
    const prefix = idPrefix || `mp${++uid}`;
    const selected = new Set(value);
    container.classList.add('module-picker');
    container.setAttribute('role', 'group');
    container.innerHTML = Access.MODULE_KEYS.map((key) => {
      const info = Access.MODULE_INFO[key];
      const sensitive = Access.SENSITIVE_MODULES.includes(key);
      const requested = highlight.includes(key);
      return `
        <label class="module-option" for="${prefix}-${key}">
          <input type="checkbox" id="${prefix}-${key}" value="${key}">
          <span class="module-option-body">
            <span class="module-option-title">${esc(info.label)}</span>
            <span class="module-option-desc">${esc(info.description)}</span>
            ${sensitive || requested ? `<span class="module-option-tags">
              ${sensitive ? `<span class="badge badge-warning badge-plain">${icon('shield')}Datos de menores</span>` : ''}
              ${requested ? '<span class="badge badge-info badge-plain">Solicitado</span>' : ''}
            </span>` : ''}
          </span>
        </label>`;
    }).join('');

    const inputs = [...container.querySelectorAll('input[type="checkbox"]')];
    const getValue = () => Access.MODULE_KEYS.filter((k) => selected.has(k));
    function sync() {
      for (const input of inputs) {
        input.checked = selected.has(input.value);
        input.closest('.module-option').classList.toggle('checked', input.checked);
      }
    }
    inputs.forEach((input) => input.addEventListener('change', () => {
      if (input.checked) selected.add(input.value); else selected.delete(input.value);
      sync();
      if (onChange) onChange(getValue());
    }));
    function setDisabled(flag) {
      container.classList.toggle('disabled', flag);
      inputs.forEach((i) => { i.disabled = flag; });
    }
    function setValue(list) {
      selected.clear();
      (list || []).forEach((k) => selected.add(k));
      sync();
    }
    sync();
    setDisabled(disabled);
    return { getValue, setValue, setDisabled };
  }

  // ---------- Paginación ----------
  /** "Mostrando 21–40 de 134 usuarios" / "Sin usuarios". */
  function paginationText({ page, total, pageSize, itemLabel = 'registros' }) {
    if (!total) return `Sin ${itemLabel}`;
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    return `Mostrando ${from}–${to} de ${total} ${itemLabel}`;
  }

  function paginationBar({ page, pages, total, pageSize, itemLabel = 'registros', onPageChange }) {
    const bar = document.createElement('nav');
    bar.className = 'pagination';
    bar.setAttribute('aria-label', 'Paginación');
    bar.innerHTML = `
      <p class="pagination-text muted">${esc(paginationText({ page, total, pageSize, itemLabel }))}</p>
      ${pages > 1 ? `
        <div class="pagination-controls">
          <button type="button" class="btn btn-outline btn-sm" data-dir="-1" aria-label="Página anterior" ${page <= 1 ? 'disabled' : ''}>
            ${icon('chevronLeft')}<span>Anterior</span></button>
          <span class="pagination-page">Página ${page} de ${pages}</span>
          <button type="button" class="btn btn-outline btn-sm" data-dir="1" aria-label="Página siguiente" ${page >= pages ? 'disabled' : ''}>
            <span>Siguiente</span>${icon('chevronRight')}</button>
        </div>` : ''}`;
    bar.querySelectorAll('[data-dir]').forEach((btn) => btn.addEventListener('click', () => {
      onPageChange(page + Number(btn.dataset.dir));
    }));
    return bar;
  }

  // ---------- Fortaleza de contraseña ----------
  const LEVEL_LABEL = { 1: 'Débil', 2: 'Aceptable', 3: 'Fuerte' };
  function passwordStrength(input) {
    const meter = document.createElement('div');
    meter.className = 'strength';
    meter.dataset.level = '1';
    meter.setAttribute('aria-live', 'polite');
    meter.innerHTML = `
      <div class="strength-bars" aria-hidden="true"><span></span><span></span><span></span></div>
      <p>Seguridad: <strong>Débil</strong></p>`;
    input.addEventListener('input', () => {
      const level = Access.passwordStrength(input.value);
      meter.dataset.level = String(level);
      meter.querySelector('strong').textContent = LEVEL_LABEL[level];
    });
    const anchor = input.closest('.input-group') || input;
    anchor.insertAdjacentElement('afterend', meter);
    return meter;
  }

  // ---------- Contraseña temporal (se muestra una sola vez) ----------
  function secretReveal({ secret, title = 'Contraseña temporal', hint } = {}) {
    const box = document.createElement('div');
    box.className = 'secret-reveal';
    box.innerHTML = `
      <p class="secret-title">${esc(title)}</p>
      <div class="secret-row">
        <code class="secret-value" tabindex="0"></code>
        <button type="button" class="btn btn-outline btn-sm" data-copy>${icon('copy')}Copiar</button>
      </div>
      <p class="secret-feedback hint" aria-live="polite"></p>
      <div class="alert alert-warning" role="status">${icon('alert')}
        <span>${esc(hint || 'Cópiala ahora: por seguridad no se volverá a mostrar. La persona deberá cambiarla al iniciar sesión.')}</span>
      </div>`;
    const code = box.querySelector('.secret-value');
    code.textContent = secret; // texto plano: nunca innerHTML
    const feedback = box.querySelector('.secret-feedback');
    box.querySelector('[data-copy]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(secret);
        if (typeof UI !== 'undefined') UI.toast('Copiada', 'success');
        feedback.textContent = '';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        feedback.textContent = 'Selecciona y copia la contraseña';
      }
    });
    return box;
  }

  // ---------- Estados de carga, vacío y error ----------
  function loading(rows = 4) {
    return `<div class="skeleton-list" aria-busy="true" aria-label="Cargando">
      ${Array.from({ length: rows }, () => '<span class="skeleton skeleton-row"></span>').join('')}
    </div>`;
  }

  function empty({ iconName = 'inbox', title, text = '', actionHtml = '' }) {
    return `<div class="empty-state">
      <span class="empty-icon">${icon(iconName)}</span>
      ${title ? `<h3>${esc(title)}</h3>` : ''}
      ${text ? `<p class="muted">${esc(text)}</p>` : ''}
      ${actionHtml}
    </div>`;
  }

  /** Pinta un error con "Reintentar" dentro de el. */
  function error(el, err, onRetry) {
    el.innerHTML = `<div class="empty-state">
      <span class="empty-icon">${icon('alert')}</span>
      <h3>No se pudo cargar la información</h3>
      <p class="muted">${esc(err && err.message ? err.message : 'Ocurrió un error inesperado.')}</p>
      ${onRetry ? `<button type="button" class="btn btn-outline" data-retry>${icon('refresh')}Reintentar</button>` : ''}
    </div>`;
    const btn = el.querySelector('[data-retry]');
    if (btn) btn.addEventListener('click', onRetry);
  }

  // ---------- Formularios con errores por campo ----------
  /**
   * def: { name, label, type: text|email|tel|date|select|textarea|checkbox|number, required, max, hint,
   *        options: [{ value, label }], placeholder, inputmode, autocomplete, full (ocupa 2 columnas) }
   */
  function field(def, value = '') {
    const id = `f-${def.name}-${++uid}`;
    const err = `${id}-error`;
    const hint = def.hint ? `<p class="hint" id="${id}-hint">${esc(def.hint)}</p>` : '';
    const described = `aria-describedby="${err}${def.hint ? ` ${id}-hint` : ''}"`;
    const req = def.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
    const common = `id="${id}" name="${esc(def.name)}" ${described}${def.required ? ' aria-required="true"' : ''}`;
    let control;
    if (def.type === 'checkbox') {
      return `<div class="field field-check${def.full ? ' full' : ''}" data-field="${esc(def.name)}">
        <label class="check" for="${id}">
          <input type="checkbox" ${common}${value ? ' checked' : ''}>
          <span>${esc(def.label)}${req}</span>
        </label>
        ${hint}<p class="field-error" id="${err}" hidden></p>
      </div>`;
    }
    if (def.type === 'textarea') {
      control = `<textarea class="input textarea" ${common} rows="${def.rows || 3}"${def.max ? ` maxlength="${def.max}"` : ''}
        ${def.placeholder ? `placeholder="${esc(def.placeholder)}"` : ''}>${esc(value ?? '')}</textarea>`;
    } else if (def.type === 'select') {
      const opts = (def.options || []).map((o) =>
        `<option value="${esc(o.value)}"${String(o.value) === String(value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
      control = `<div class="select-wrap"><select class="input select" ${common}>${opts}</select></div>`;
    } else {
      const type = def.type || 'text';
      control = `<input class="input" type="${type}" ${common} value="${esc(value ?? '')}"
        ${def.max ? `maxlength="${def.max}"` : ''} ${def.placeholder ? `placeholder="${esc(def.placeholder)}"` : ''}
        ${def.inputmode ? `inputmode="${def.inputmode}"` : ''} ${def.autocomplete ? `autocomplete="${def.autocomplete}"` : 'autocomplete="off"'}
        ${def.min ? `min="${esc(def.min)}"` : ''} ${def.maxDate ? `max="${esc(def.maxDate)}"` : ''}>`;
    }
    return `<div class="field${def.full ? ' full' : ''}" data-field="${esc(def.name)}">
      <label for="${id}">${esc(def.label)}${req}</label>
      ${control}${hint}
      <p class="field-error" id="${err}" hidden></p>
    </div>`;
  }

  /** Lee los valores: texto recortado ('' → null), checkbox → booleano. */
  function read(form, defs) {
    const out = {};
    for (const def of defs) {
      const el = form.elements[def.name];
      if (!el) continue;
      if (def.type === 'checkbox') out[def.name] = el.checked;
      else {
        const v = String(el.value ?? '').trim();
        out[def.name] = v === '' ? null : v;
      }
    }
    return out;
  }

  function setError(form, name, message) {
    const wrap = form.querySelector(`[data-field="${name}"]`);
    if (!wrap) return false;
    const box = wrap.querySelector('.field-error');
    const input = wrap.querySelector('input, select, textarea');
    box.textContent = message || '';
    box.hidden = !message;
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    return true;
  }

  function clearErrors(form) {
    form.querySelectorAll('.field-error').forEach((b) => { b.hidden = true; b.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  }

  /** Borra el error de un campo en cuanto la persona lo corrige. */
  function bindLiveClear(form) {
    const handler = (e) => {
      const wrap = e.target.closest && e.target.closest('[data-field]');
      if (wrap) setError(form, wrap.dataset.field, '');
    };
    form.addEventListener('input', handler);
    form.addEventListener('change', handler);
  }

  /** details: [{ field, message }] → bajo cada campo. Devuelve los que no tenían campo visible. */
  function showErrors(form, details) {
    if (!form.dataset.liveClear) { form.dataset.liveClear = '1'; bindLiveClear(form); }
    const leftovers = [];
    let first = null;
    for (const d of details || []) {
      if (setError(form, d.field, d.message)) {
        if (!first) first = form.querySelector(`[data-field="${d.field}"] input, [data-field="${d.field}"] select, [data-field="${d.field}"] textarea`);
      } else leftovers.push(d);
    }
    if (first) first.focus();
    return leftovers;
  }

  return {
    modulePicker, paginationText, paginationBar, passwordStrength, secretReveal,
    loading, empty, error,
    form: { field, read, setError, clearErrors, showErrors, bindLiveClear }
  };
})();

if (typeof module !== 'undefined') module.exports = Components;
