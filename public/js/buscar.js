/**
 * Vista "#buscar" (P18, módulo CARTAS) — uso en campo (centro de acopio y día del evento).
 * Campo grande con autofocus: se escribe o se escanea el código (un lector de código de barras "teclea" y
 * da Enter). La tarjeta muestra lo esencial y UN botón grande con la siguiente acción lógica
 * (Marcar regalo recibido / Marcar entregado). Al terminar, el campo se limpia para la siguiente carta.
 * Parámetro: codigo (para abrir directo una carta).
 */
const Buscar = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const recent = []; // lo hecho en esta sesión de la pantalla (no se guarda)

  // Siguiente paso en campo para cada estatus
  const NEXT = {
    ASIGNADO: { to: 'RECIBIDO', label: 'Marcar regalo recibido', icon: 'gift', done: 'Regalo recibido' },
    RECIBIDO: { to: 'ENTREGADO', label: 'Marcar entregado', icon: 'check', done: 'Entregado' }
  };

  function renderRecent(el) {
    el.innerHTML = recent.length ? `<section class="card panel"><h3 class="panel-title">Hecho en esta pantalla</h3>
      <ul class="recent-list">${recent.map((r) => `<li><a class="letter-code" href="#carta/${r.id}">${esc(r.code)}</a> ${CartasUI.statusChip(r.status)}
        <span class="muted">${esc(Fechas.formatDateTime(r.at))}</span></li>`).join('')}</ul></section>` : '';
  }

  function renderResult(el, letter, { onDone, focusInput }) {
    const next = letter.event.status === 'CERRADO' ? null : NEXT[letter.status];
    const c = letter.child;
    el.innerHTML = `
      <section class="card panel scan-result" aria-live="polite">
        <div class="scan-head"><span class="big-code">${esc(letter.code)}</span>${CartasUI.statusChip(letter.status)}</div>
        <p class="scan-child">${esc(c.display_name)}${c.age !== null ? ` · ${c.age} años` : ''}${c.grade ? ` · ${esc(c.grade)}` : ''}</p>
        <p class="muted">${c.school ? esc(c.school.name) : 'Sin escuela'} · ${esc(letter.event.name)}</p>
        <dl class="data-list">
          <dt>Deseo</dt><dd><strong>${esc(letter.main_wish)}</strong>${letter.secondary_wish ? `<br><span class="muted">${esc(letter.secondary_wish)}</span>` : ''}</dd>
          <dt>Padrino</dt><dd>${letter.sponsor ? `${esc(letter.sponsor.full_name)} · ${Listado.phoneLink(letter.sponsor.phone)}` : '<span class="muted">Sin padrino</span>'}</dd>
          ${letter.gift_notes ? `<dt>Notas del regalo</dt><dd>${esc(letter.gift_notes)}</dd>` : ''}
        </dl>
        ${next && next.to === 'RECIBIDO' ? `<div class="field"><label for="scan-notes">Notas del regalo (opcional)</label>
          <input id="scan-notes" class="input" data-notes maxlength="500" value="${esc(letter.gift_notes || '')}" placeholder="Ej. Bicicleta roja, bolsa #120"></div>` : ''}
        <div class="scan-actions">
          ${next ? `<button type="button" class="btn btn-primary btn-lg btn-block" data-next>${UI.icon(next.icon)}${esc(next.label)}</button>` : ''}
          ${!next && letter.status === 'PENDIENTE' ? `<div class="alert alert-warning">${UI.icon('alert')}<span>Esta carta aún no tiene padrino.</span></div>
            <a class="btn btn-outline btn-lg btn-block" href="#carta/${letter.id}">${UI.icon('heart')}Asignar padrino</a>` : ''}
          ${!next && letter.status === 'ENTREGADO' ? `<div class="alert alert-success">${UI.icon('check')}<span>Este regalo ya fue entregado${letter.delivered_at ? ` el ${esc(Fechas.formatDateTime(letter.delivered_at))}` : ''}.</span></div>` : ''}
          ${letter.event.status === 'CERRADO' ? `<div class="alert alert-warning">${UI.icon('lock')}<span>El evento está cerrado: la carta es de solo lectura.</span></div>` : ''}
          <a class="btn btn-ghost btn-block" href="#carta/${letter.id}">${UI.icon('eye')}Ver la carta completa</a>
        </div>
      </section>`;
    const btn = el.querySelector('[data-next]');
    if (!btn) return;
    btn.focus();
    btn.addEventListener('click', async () => {
      UI.setBusy(btn, true);
      const notes = el.querySelector('[data-notes]');
      const body = { to_status: next.to, version: letter.version };
      if (notes) body.gift_notes = notes.value.trim() || null;
      try {
        const updated = (await UI.api(`/letters/${letter.id}/status`, { method: 'POST', body })).letter;
        UI.toast(`${updated.code}: ${next.done}`, 'success');
        onDone(updated);
      } catch (err) {
        UI.setBusy(btn, false);
        if (err.status === 409) {
          UI.toast(err.message, 'error');
          try { renderResult(el, (await UI.api(`/letters/${letter.id}`)).letter, { onDone, focusInput }); } catch { /* se queda igual */ }
          return;
        }
        UI.toast(err.message, 'error');
        focusInput();
      }
    });
  }

  function mount(container, ctx) {
    container.innerHTML = `
      <section class="page-header"><div><h2>Búsqueda por código</h2>
        <p class="muted">Escribe o escanea el código de la carta (por ejemplo NAV26-000123 o nav26-123).</p></div></section>
      <form class="card panel scan-form" data-form role="search">
        <label for="scan-code" class="scan-label">Código de la carta</label>
        <div class="scan-row">
          <input id="scan-code" class="input input-xl" data-code autocomplete="off" autocapitalize="characters" spellcheck="false"
            enterkeyhint="search" placeholder="NAV26-000123" value="${esc(ctx.params.codigo || '')}">
          <button type="submit" class="btn btn-primary btn-lg">${UI.icon('search')}Buscar</button>
        </div>
      </form>
      <div data-result></div>
      <div data-recent></div>`;
    const form = container.querySelector('[data-form]');
    const input = container.querySelector('[data-code]');
    const resultEl = container.querySelector('[data-result]');
    const recentEl = container.querySelector('[data-recent]');
    const focusInput = () => { input.focus(); input.select(); };
    renderRecent(recentEl);

    async function search() {
      const code = input.value.trim();
      if (!code) { focusInput(); return; }
      resultEl.innerHTML = Components.loading(2);
      try {
        const { letter } = await UI.api(`/letters/by-code/${encodeURIComponent(code)}`);
        input.value = letter.code;
        renderResult(resultEl, letter, {
          focusInput,
          onDone: (updated) => {
            recent.unshift({ id: updated.id, code: updated.code, status: updated.status, at: new Date().toISOString() });
            recent.splice(10);
            renderRecent(recentEl);
            resultEl.innerHTML = `<div class="alert alert-success scan-done" role="status">${UI.icon('check')}<span><strong>${esc(updated.code)}</strong> quedó como
              "${esc(C().LETTER_STATUS_LABEL[updated.status])}". Escanea la siguiente carta.</span></div>`;
            input.value = '';
            input.focus();
          }
        });
      } catch (err) {
        resultEl.innerHTML = `<div class="alert alert-error" role="alert">${UI.icon('alert')}<span>${esc(err.status === 404 ? `${err.message} Revisa que esté bien escrito.` : err.message)}</span></div>`;
        focusInput();
      }
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); search(); });
    input.focus();
    if (ctx.params.codigo) search();
  }

  return { mount };
})();
