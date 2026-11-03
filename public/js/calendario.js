/**
 * Vista "Calendario" (módulo CALENDARIO, Fase 5): actividades en vista mensual, semanal y agenda, con filtros
 * por tipo, responsable y evento. Arrastrar una actividad a otro día (o a otra hora en la semana) la mueve.
 * Parámetros: vista (mes|semana|agenda), fecha (YYYY-MM-DD), tipo, resp (id|me), evento, q, canceladas (1), dia.
 */
const Calendario = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const CU = () => CalendarioUI;
  const HOUR_PX = 56;
  const SNAP_MIN = 15;
  const MONTH_CHIPS = 3;

  const chipClass = (a) => `cal-item ${CU().typeMeta(a.activity_type).cls}${a.status === 'CANCELADA' ? ' is-cancelled' : ''}${a.status === 'REALIZADA' ? ' is-done' : ''}`;
  const itemLabel = (a) => `${a.title}, ${C().ACTIVITY_TYPE_LABEL[a.activity_type]}, ${CU().timeRange(a)}${a.status !== 'PROGRAMADA' ? `, ${C().ACTIVITY_STATUS_LABEL[a.status]}` : ''}${a.has_overlap ? ', con traslape' : ''}`;
  const overlapIcon = (a) => (a.has_overlap ? `<span class="cal-warn" title="Traslape de horario">${UI.icon('alert')}</span>` : '');
  const draggable = (a) => (a.status === 'PROGRAMADA' ? ' draggable="true"' : '');

  // ---------- Vista mensual ----------
  function renderMonth(el, state, items, today) {
    const { days } = CU().rangeFor('mes', state.fecha);
    const byDate = CU().groupByDate(items);
    const month = state.fecha.slice(0, 7);
    const selected = state.dia && days.includes(state.dia) ? state.dia : (days.includes(today) && today.startsWith(month) ? today : `${month}-01`);
    el.innerHTML = `
      <div class="cal-month" role="grid" aria-label="${esc(CU().titleFor('mes', state.fecha))}">
        <div class="cal-weekdays" role="row">${CU().DAY_NAMES.map((d) => `<span role="columnheader">${d}</span>`).join('')}</div>
        <div class="cal-grid">${days.map((d) => {
          const list = byDate[d] || [];
          const extra = list.length - MONTH_CHIPS;
          return `<div class="cal-day${d.startsWith(month) ? '' : ' is-outside'}${d === today ? ' is-today' : ''}${d === selected ? ' is-selected' : ''}" role="gridcell" data-date="${d}">
            <button type="button" class="cal-day-num" data-pick="${d}" aria-label="${esc(CU().longDay(d))}: ${list.length} ${list.length === 1 ? 'actividad' : 'actividades'}">${Number(d.slice(8))}</button>
            <div class="cal-chips">${list.slice(0, MONTH_CHIPS).map((a) => `<a class="${chipClass(a)}" href="#actividad/${a.id}" data-id="${a.id}"${draggable(a)} title="${esc(itemLabel(a))}">
              <span class="cal-item-time">${esc(a.start_time)}</span><span class="cal-item-title">${esc(a.title)}</span>${overlapIcon(a)}</a>`).join('')}
              ${extra > 0 ? `<button type="button" class="cal-more" data-week="${d}">+${extra} más</button>` : ''}</div>
            <div class="cal-dots" aria-hidden="true">${list.slice(0, 4).map((a) => `<span class="cal-dot ${CU().typeMeta(a.activity_type).cls}"></span>`).join('')}</div>
          </div>`;
        }).join('')}</div>
      </div>
      <section class="cal-daylist mobile-only" aria-live="polite">${dayList(selected, byDate[selected] || [])}</section>`;
  }

  function dayList(d, list) {
    return `<h3 class="panel-title">${esc(CU().longDay(d))}</h3>${list.length ? agendaItems(list)
      : `<p class="muted">Sin actividades.</p>`}<button type="button" class="btn btn-outline btn-sm" data-new="${d}">${UI.icon('plus')}Agregar este día</button>`;
  }

  // ---------- Agenda (lista por día) ----------
  function agendaItems(list) {
    return `<ul class="cal-agenda-list">${list.map((a) => `<li><a class="cal-agenda-item${a.status === 'CANCELADA' ? ' is-cancelled' : ''}" href="#actividad/${a.id}">
        <span class="cal-agenda-time">${esc(a.start_time)}<span class="muted">${esc(a.end_time)}</span></span>
        <span class="cal-agenda-main"><strong>${esc(a.title)}</strong>
          <span class="cal-agenda-meta">${CU().typeChip(a.activity_type)}${a.status !== 'PROGRAMADA' ? CU().statusBadge(a.status) : ''}${a.has_overlap ? CU().overlapBadge() : ''}</span>
          <span class="muted">${[a.location, a.responsible && `Responsable: ${a.responsible.full_name}`, a.event && a.event.name,
            a.volunteers_count ? `${a.volunteers_count} ${a.volunteers_count === 1 ? 'voluntario' : 'voluntarios'}` : ''].filter(Boolean).map(esc).join(' · ')}</span></span></a></li>`).join('')}</ul>`;
  }

  function renderAgenda(el, days, items, today, emptyText) {
    const byDate = CU().groupByDate(items);
    const withItems = days.filter((d) => byDate[d]);
    el.innerHTML = withItems.length ? withItems.map((d) => `<section class="cal-agenda-day${d === today ? ' is-today' : ''}">
        <h3 class="cal-agenda-date">${esc(CU().longDay(d))}${d === today ? ' <span class="badge badge-sun">Hoy</span>' : ''}</h3>${agendaItems(byDate[d])}</section>`).join('')
      : Components.empty({ iconName: 'calendarRange', title: 'Sin actividades', text: emptyText });
  }

  // ---------- Vista semanal ----------
  function renderWeek(el, state, items, today, emptyText) {
    const { days } = CU().rangeFor('semana', state.fecha);
    const byDate = CU().groupByDate(items);
    const { start, end } = CU().hourBounds(items);
    const hours = Array.from({ length: end - start }, (_, i) => start + i);
    const height = (end - start) * HOUR_PX;
    el.innerHTML = `
      <div class="cal-week desktop-only" style="--cal-hour:${HOUR_PX}px" data-start="${start}">
        <div class="cal-week-head"><span></span>${days.map((d) => `<button type="button" class="cal-week-day${d === today ? ' is-today' : ''}" data-new="${d}" title="Agregar actividad el ${esc(CU().longDay(d))}">
          <span>${CU().DAY_NAMES[CU().weekday(d)]}</span><strong>${Number(d.slice(8))}</strong></button>`).join('')}</div>
        <div class="cal-week-body">
          <div class="cal-hours">${hours.map((hh) => `<span style="height:${HOUR_PX}px">${String(hh).padStart(2, '0')}:00</span>`).join('')}</div>
          ${days.map((d) => `<div class="cal-col${d === today ? ' is-today' : ''}" data-date="${d}" style="height:${height}px">
            ${CU().layoutDay(byDate[d] || []).map(({ item: a, lane, lanes }) => {
              const top = (CU().toMinutes(a.start_time) - start * 60) * HOUR_PX / 60;
              const h = Math.max((CU().toMinutes(a.end_time) - CU().toMinutes(a.start_time)) * HOUR_PX / 60, 22);
              const dur = CU().toMinutes(a.end_time) - CU().toMinutes(a.start_time);
              const size = dur <= 30 ? ' is-tiny' : (dur < 75 ? ' is-short' : '');
              return `<a class="${chipClass(a)} cal-block${size}${a.has_overlap ? ' has-warn' : ''}" href="#actividad/${a.id}" data-id="${a.id}"${draggable(a)} title="${esc(itemLabel(a))}"
                style="top:${top}px;height:${h}px;left:calc(${(100 / lanes) * lane}% + 2px);width:calc(${100 / lanes}% - 4px)">
                <span class="cal-item-title">${esc(a.title)}</span><span class="cal-item-time">${esc(CU().timeRange(a))}</span>${overlapIcon(a)}</a>`;
            }).join('')}</div>`).join('')}
        </div>
      </div>
      <div class="mobile-only cal-week-mobile" data-agenda></div>`;
    renderAgenda(el.querySelector('[data-agenda]'), days, items, today, emptyText);
  }

  // ---------- Arrastrar y soltar ----------
  function bindDrag(el, items, reload) {
    const byId = new Map(items.map((a) => [String(a.id), a]));
    let dragging = null;
    let grabOffset = 0;
    el.addEventListener('dragstart', (e) => {
      const item = e.target.closest && e.target.closest('[data-id][draggable="true"]');
      if (!item) return;
      dragging = byId.get(item.dataset.id);
      grabOffset = item.classList.contains('cal-block') ? e.clientY - item.getBoundingClientRect().top : 0;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.id);
      item.classList.add('is-dragging');
    });
    el.addEventListener('dragend', (e) => {
      const item = e.target.closest && e.target.closest('[data-id]');
      if (item) item.classList.remove('is-dragging');
      el.querySelectorAll('.is-drop').forEach((x) => x.classList.remove('is-drop'));
      dragging = null;
    });
    el.addEventListener('dragover', (e) => {
      const target = dragging && e.target.closest('[data-date]');
      if (!target) return;
      e.preventDefault();
      el.querySelectorAll('.is-drop').forEach((x) => x !== target && x.classList.remove('is-drop'));
      target.classList.add('is-drop');
    });
    el.addEventListener('drop', async (e) => {
      const target = dragging && e.target.closest('[data-date]');
      if (!target) return;
      e.preventDefault();
      const a = dragging;
      const change = { activity_date: target.dataset.date };
      if (target.classList.contains('cal-col')) {
        const startHour = Number(el.querySelector('.cal-week').dataset.start);
        const y = e.clientY - target.getBoundingClientRect().top - grabOffset;
        const duration = CU().toMinutes(a.end_time) - CU().toMinutes(a.start_time);
        let startMin = startHour * 60 + Math.round((y * 60 / HOUR_PX) / SNAP_MIN) * SNAP_MIN;
        startMin = Math.max(0, Math.min(startMin, 24 * 60 - 1 - duration));
        change.start_time = CU().fromMinutes(startMin);
        change.end_time = CU().fromMinutes(startMin + duration);
      }
      if (await ActividadForm.move(a, change)) reload();
      else el.querySelectorAll('.is-drop').forEach((x) => x.classList.remove('is-drop'));
    });
  }

  // ---------- Página ----------
  async function mount(container, ctx) {
    const today = Fechas.todayLocal();
    let state = CU().readParams(ctx.params, today);
    state.dia = CU().isValidDate(ctx.params.dia) ? ctx.params.dia : '';
    let seq = 0;
    let people = [];
    let events = [];
    try { ({ people, events } = await ActividadForm.loadOptions()); } catch { /* los filtros quedan sin opciones */ }

    const opt = (value, label, current) => `<option value="${esc(value)}"${String(current) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
    container.innerHTML = `
      <section class="page-header">
        <div><h2>Calendario</h2><p class="muted">Juntas, capacitaciones, acopios y eventos del equipo.</p></div>
        <div class="header-actions"><button type="button" class="btn btn-primary" data-new="">${UI.icon('plus')}Nueva actividad</button></div>
      </section>
      <section class="card panel cal-panel">
        <div class="cal-toolbar">
          <div class="cal-nav">
            <button type="button" class="btn btn-outline btn-sm" data-today>Hoy</button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" data-prev aria-label="Anterior">${UI.icon('chevronLeft')}</button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" data-next aria-label="Siguiente">${UI.icon('chevronRight')}</button>
            <h3 class="cal-title" data-title aria-live="polite"></h3>
          </div>
          <div class="segmented" role="group" aria-label="Vista">${[['mes', 'Mes', 'calendarDays'], ['semana', 'Semana', 'columns'], ['agenda', 'Agenda', 'list']]
            .map(([k, l, i]) => `<button type="button" class="segmented-btn" data-vista="${k}" aria-pressed="false">${UI.icon(i)}<span>${l}</span></button>`).join('')}</div>
        </div>
        <div class="filters cal-filters">
          <label class="filter"><span class="filter-label">Tipo</span><span class="select-wrap"><select class="input select" data-f="tipo">
            ${opt('', 'Todos', state.tipo)}${C().ACTIVITY_TYPES.map((t) => opt(t, C().ACTIVITY_TYPE_LABEL[t], state.tipo)).join('')}</select></span></label>
          <label class="filter"><span class="filter-label">Responsable</span><span class="select-wrap"><select class="input select" data-f="resp">
            ${opt('', 'Todas las personas', state.resp)}${opt('me', 'Mis actividades', state.resp)}${people.map((p) => opt(p.id, p.full_name, state.resp)).join('')}</select></span></label>
          <label class="filter"><span class="filter-label">Evento</span><span class="select-wrap"><select class="input select" data-f="evento">
            ${opt('', 'Todos', state.evento)}${events.map((e) => opt(e.id, e.name, state.evento)).join('')}</select></span></label>
          <label class="filter"><span class="filter-label">Buscar</span><span class="search">${UI.icon('search')}<input class="input" type="search" data-f="q" value="${esc(state.q)}" placeholder="Título o lugar" autocomplete="off"></span></label>
          <label class="check cal-check"><input type="checkbox" data-f="canceladas"${state.canceladas ? ' checked' : ''}><span>Mostrar canceladas</span></label>
        </div>
        <div class="cal-legend" aria-label="Tipos de actividad">${C().ACTIVITY_TYPES.map((t) => CU().typeChip(t)).join('')}
          <span class="cal-legend-note">${UI.icon('alert')}Traslape de horario del responsable</span></div>
        <div class="alert alert-warning" data-trunc role="note" hidden></div>
        <div data-body></div>
      </section>`;
    const body = container.querySelector('[data-body]');

    const sync = () => ctx.navigate({ vista: state.vista === 'mes' ? null : state.vista, fecha: state.fecha === today ? null : state.fecha,
      tipo: state.tipo || null, resp: state.resp || null, evento: state.evento || null, q: state.q || null,
      canceladas: state.canceladas || null, dia: state.dia || null }, { push: false });

    async function load() {
      const mine = ++seq;
      container.querySelector('[data-title]').textContent = CU().titleFor(state.vista, state.fecha);
      container.querySelectorAll('[data-vista]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === state.vista)));
      body.innerHTML = Components.loading(6);
      const range = CU().rangeFor(state.vista, state.fecha);
      try {
        const data = await UI.api(`/activities${UI.buildQuery({
          date_from: range.from, date_to: range.to, activity_type: state.tipo, responsible_id: state.resp, event_id: state.evento,
          search: state.q, status: state.canceladas ? undefined : ['PROGRAMADA', 'REALIZADA']
        })}`);
        if (mine !== seq) return;
        const trunc = container.querySelector('[data-trunc]');
        trunc.hidden = !data.truncated;
        trunc.innerHTML = data.truncated ? `${UI.icon('alert')}<span>Hay demasiadas actividades en este periodo: usa los filtros para verlas todas.</span>` : '';
        const filtered = state.tipo || state.resp || state.evento || state.q;
        const emptyText = filtered ? 'Prueba con otros filtros.' : 'Usa "Nueva actividad" para agregar la primera.';
        if (state.vista === 'mes') renderMonth(body, state, data.items, today);
        else if (state.vista === 'semana') renderWeek(body, state, data.items, today, emptyText);
        else renderAgenda(body, range.days, data.items, today, emptyText);
        bindDrag(body, data.items, load);
      } catch (err) {
        if (mine === seq) Components.error(body, err, load);
      }
    }

    const newActivity = (date, time) => ActividadForm.open({
      user: ctx.user,
      defaults: { ...(date || state.dia ? { activity_date: date || state.dia } : {}),
        ...(time ? { start_time: time, end_time: CU().fromMinutes(Math.min(CU().toMinutes(time) + 60, 23 * 60 + 59)) } : {}),
        ...(state.evento ? { event_id: state.evento } : {}) },
      onSaved: (a) => { state = { ...state, fecha: a.activity_date, dia: a.activity_date }; sync(); load(); }
    });

    container.addEventListener('click', (e) => {
      const t = e.target.closest('button, .cal-col, .cal-day');
      if (!t) return;
      if (t.matches('[data-new]')) { newActivity(t.dataset.new || ''); return; }
      if (t.matches('[data-today]')) { state = { ...state, fecha: today, dia: '' }; sync(); load(); return; }
      if (t.matches('[data-prev], [data-next]')) { state = { ...state, fecha: CU().shift(state.vista, state.fecha, t.matches('[data-prev]') ? -1 : 1), dia: '' }; sync(); load(); return; }
      if (t.matches('[data-vista]')) { state = { ...state, vista: t.dataset.vista }; sync(); load(); return; }
      if (t.matches('[data-week]')) { state = { ...state, vista: 'semana', fecha: t.dataset.week }; sync(); load(); return; }
      if (t.matches('[data-pick]')) {
        const d = t.dataset.pick;
        if (window.matchMedia('(max-width: 767px)').matches) { state = { ...state, dia: d }; sync(); load(); }
        else newActivity(d);
        return;
      }
      // Clic en un espacio libre de la semana: nueva actividad a esa hora
      if (t.matches('.cal-col') && e.target === t) {
        const startHour = Number(container.querySelector('.cal-week').dataset.start);
        const min = startHour * 60 + Math.floor(((e.clientY - t.getBoundingClientRect().top) * 60 / HOUR_PX) / 30) * 30;
        newActivity(t.dataset.date, CU().fromMinutes(Math.min(min, 23 * 60)));
      }
    });
    container.querySelectorAll('select[data-f], input[type="checkbox"][data-f]').forEach((s) => s.addEventListener('change', () => {
      state = { ...state, [s.dataset.f]: s.type === 'checkbox' ? (s.checked ? '1' : '') : s.value };
      sync(); load();
    }));
    let t = null;
    container.querySelector('input[data-f="q"]').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state = { ...state, q: e.target.value.trim() }; sync(); load(); }, 300);
    });
    load();
  }

  return { mount };
})();
