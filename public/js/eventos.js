/**
 * Vista "Eventos" (P22, módulo EVENTOS): listado de macro-eventos con filtros, alta y edición en un diálogo.
 * Parámetros: q, estatus, tipo, page.
 */
const Eventos = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;

  function fields(event) {
    const locked = event && event.letters_count > 0;
    return [
      { name: 'name', label: 'Nombre del evento', required: true, max: 120, full: true, placeholder: 'Navidad 2026' },
      { name: 'event_type', label: 'Tipo', type: 'select', required: true,
        options: [{ value: '', label: 'Elige el tipo' }, ...C().EVENT_TYPES.map((t) => ({ value: t, label: C().EVENT_TYPE_LABEL[t] }))],
        hint: locked ? 'Ya tiene cartas: el tipo no se puede cambiar.' : 'Solo los eventos de Navidad reciben cartas.' },
      { name: 'code_prefix', label: 'Prefijo de los códigos de carta', required: true, max: 10, placeholder: 'NAV26',
        hint: locked ? 'Ya tiene cartas: el prefijo no se puede cambiar.' : `3 a 10 letras o números. Primer código: ${CartasUI.previewCode(event?.code_prefix)}` },
      { name: 'event_date', label: 'Fecha del evento (entrega)', type: 'date', required: true },
      { name: 'max_letters_per_sponsor', label: 'Cartas máximas por padrino', type: 'number', numeric: true,
        min: '1', hint: `De 1 a ${C().MAX_LETTERS_PER_SPONSOR}. Por defecto ${C().DEFAULT_LETTERS_PER_SPONSOR}.` },
      { name: 'location', label: 'Lugar', max: 255, full: true, placeholder: 'Explanada, colonia o municipio' },
      { name: 'description', label: 'Descripción (opcional)', type: 'textarea', max: 1000, full: true }
    ];
  }

  function validate(v, defs) {
    const errors = Listado.basicValidate(v, defs);
    if (v.code_prefix && !/^[A-Za-z0-9]{3,10}$/.test(v.code_prefix)) {
      errors.push({ field: 'code_prefix', message: 'Usa de 3 a 10 letras o números, sin espacios (p. ej. NAV26).' });
    }
    const n = v.max_letters_per_sponsor;
    if (n && (!/^\d+$/.test(n) || Number(n) < 1 || Number(n) > C().MAX_LETTERS_PER_SPONSOR)) {
      errors.push({ field: 'max_letters_per_sponsor', message: `El límite por padrino debe estar entre 1 y ${C().MAX_LETTERS_PER_SPONSOR}.` });
    }
    return errors;
  }

  /** Diálogo de alta (event = null) o edición. Resuelve con el evento guardado o null. */
  function openForm(event, onSaved) {
    const defs = fields(event);
    const values = event ? { ...event } : { max_letters_per_sponsor: C().DEFAULT_LETTERS_PER_SPONSOR, event_type: 'NAVIDAD' };
    const promise = Listado.formDialog({
      title: event ? `Editar ${event.name}` : 'Nuevo evento',
      description: event ? '' : 'El evento se crea como borrador; ábrelo cuando quieras empezar a registrar cartas.',
      fields: defs, values, submitText: event ? 'Guardar cambios' : 'Crear evento',
      validate: (v) => validate(v, defs),
      onSubmit: async (v) => {
        const body = Listado.toBody(v, defs);
        if (body.code_prefix) body.code_prefix = body.code_prefix.toUpperCase();
        let out;
        if (event) {
          const changes = {};
          for (const [k, val] of Object.entries(body)) if ((event[k] ?? null) !== (val ?? null)) changes[k] = val;
          if (!Object.keys(changes).length) { UI.toast('No hay cambios que guardar'); return event; }
          out = await UI.api(`/events/${event.id}`, { method: 'PATCH', body: changes });
        } else {
          out = await UI.api('/events', { method: 'POST', body });
        }
        UI.toast(event ? 'Evento actualizado' : `Evento "${out.event.name}" creado`, 'success');
        if (onSaved) onSaved(out.event);
        return out.event;
      },
      onDuplicate: (err) => Listado.duplicateNotice(err, { title: 'Ya existe un evento así', href: `#evento/${err.data.existing_id}`, linkText: 'Ver el evento' })
    });
    // Prefijo en mayúsculas mientras se escribe y vista previa del primer código
    const input = document.querySelector('.modal [name="code_prefix"]');
    if (input && !(event && event.letters_count > 0)) {
      const hint = input.closest('[data-field]').querySelector('.hint');
      input.addEventListener('input', () => {
        input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (hint) hint.textContent = `3 a 10 letras o números. Primer código: ${CartasUI.previewCode(input.value)}`;
      });
    }
    if (event && event.letters_count > 0) {
      for (const n of ['code_prefix', 'event_type']) {
        const el = document.querySelector(`.modal [name="${n}"]`);
        if (el) el.disabled = true;
      }
    }
    return promise;
  }

  const name = (e) => `<a class="strong-link" href="#evento/${e.id}">${esc(e.name)}</a>`;
  const when = (e) => esc(Fechas.formatDate(e.event_date));

  function mount(container, ctx) {
    let list;
    const statusOpts = [['', 'Todos'], ...C().EVENT_STATUSES.map((s) => [s, C().EVENT_STATUS_LABEL[s]])];
    const typeOpts = [['', 'Todos'], ...C().EVENT_TYPES.map((t) => [t, C().EVENT_TYPE_LABEL[t]])];
    list = Listado.mount(container, ctx, {
      title: 'Eventos',
      description: 'Macro-eventos de Navidad y Día del Niño: fechas, voluntarios y cartas de cada uno.',
      actions: [{ label: 'Nuevo evento', icon: 'plus', primary: true,
        onClick: () => openForm(null, (e) => { location.hash = `#evento/${e.id}`; }) }],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Nombre, prefijo o lugar' },
        { name: 'estatus', type: 'select', label: 'Estatus', options: statusOpts },
        { name: 'tipo', type: 'select', label: 'Tipo', options: typeOpts }
      ],
      endpoint: '/events',
      query: (p) => ({ search: p.q, status: p.estatus, event_type: p.tipo }),
      itemLabel: 'eventos',
      columns: [
        { label: 'Evento', render: (e) => `${name(e)}<br><span class="muted">${esc(C().EVENT_TYPE_LABEL[e.event_type])} · <code>${esc(e.code_prefix)}</code></span>` },
        { label: 'Fecha', className: 'nowrap', render: when },
        { label: 'Lugar', render: (e) => esc(e.location || '—') },
        { label: 'Estatus', render: (e) => CartasUI.eventBadge(e.status) },
        { label: 'Cartas', className: 'num', render: (e) => String(e.letters_count) },
        { label: 'Voluntarios', className: 'num', render: (e) => String(e.volunteers_count) },
        { label: '', className: 'actions-cell', render: (e) => `<div class="row-actions">
            <a class="btn btn-ghost btn-sm" href="#evento/${e.id}" title="Ver evento">${UI.icon('eye')}<span>Ver evento</span></a>
            ${Access.canSee(ctx.user, Access.viewByKey('cartas')) && e.event_type === 'NAVIDAD'
              ? `<a class="btn btn-ghost btn-sm" href="#cartas?evento=${e.id}" title="Ver cartas">${UI.icon('mail')}<span>Ver cartas</span></a>` : ''}</div>` }
      ],
      card: (e) => `
        <div class="item-card-head"><p>${name(e)}</p>${CartasUI.eventBadge(e.status)}</div>
        <p>${when(e)} · ${esc(C().EVENT_TYPE_LABEL[e.event_type])} · <code>${esc(e.code_prefix)}</code></p>
        ${e.location ? `<p class="muted">${esc(e.location)}</p>` : ''}
        <p>${e.letters_count} cartas · ${e.volunteers_count} voluntarios</p>`,
      empty: (filtered) => ({
        iconName: 'calendarDays', title: filtered ? 'Sin resultados' : 'Aún no hay eventos',
        text: filtered ? 'Prueba con otro nombre o filtro.' : 'Crea el primero, por ejemplo "Navidad 2026" con el prefijo NAV26.',
        actionHtml: ''
      })
    });
    return list;
  }

  return { mount, openForm };
})();
