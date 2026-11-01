/**
 * Formulario de actividad (alta y edición) y "mover" una actividad — Fase 5.
 * El aviso de traslape se muestra mientras se llena el formulario (GET /activities/overlaps) y, si la API
 * responde 409 ACTIVITY_OVERLAP, la persona puede confirmar "Guardar de todos modos" (allow_overlap: true).
 */
const ActividadForm = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;
  const CU = () => CalendarioUI;

  /** Personal (responsables) y eventos para los selects. Se piden una vez por formulario. */
  async function loadOptions() {
    const [people, events] = await Promise.all([
      UI.api('/activities/responsible-options'), UI.api('/activities/event-options')
    ]);
    return { people: people.items, events: events.items };
  }

  function fields({ people, events }, activity, user) {
    const peopleOpts = people.map((p) => ({ value: String(p.id), label: p.id === user.id ? `${p.full_name} (yo)` : p.full_name }));
    if (activity && activity.responsible && !people.some((p) => p.id === activity.responsible.id)) {
      peopleOpts.push({ value: String(activity.responsible.id), label: `${activity.responsible.full_name} (cuenta desactivada)` });
    }
    const eventOpts = events
      .filter((e) => e.status !== 'CERRADO' || (activity && activity.event && activity.event.id === e.id))
      .map((e) => ({ value: String(e.id), label: `${e.name}${e.status === 'CERRADO' ? ' (cerrado)' : ''}` }));
    return [
      { name: 'title', label: 'Título', required: true, max: 120, full: true, placeholder: 'Junta de logística de Navidad' },
      { name: 'activity_type', label: 'Tipo', type: 'select', required: true,
        options: C().ACTIVITY_TYPES.map((t) => ({ value: t, label: C().ACTIVITY_TYPE_LABEL[t] })) },
      { name: 'activity_date', label: 'Fecha', type: 'date', required: true },
      { name: 'start_time', label: 'Hora de inicio', type: 'time', required: true },
      { name: 'end_time', label: 'Hora de fin', type: 'time', required: true },
      { name: 'responsible_user_id', label: 'Responsable', type: 'select', required: true,
        options: [{ value: '', label: 'Elige a la persona responsable' }, ...peopleOpts] },
      { name: 'event_id', label: 'Evento relacionado (opcional)', type: 'select',
        options: [{ value: '', label: 'Ninguno' }, ...eventOpts] },
      { name: 'location', label: 'Lugar', max: 255, full: true, placeholder: 'Oficina, centro de acopio, escuela…' },
      { name: 'description', label: 'Descripción (opcional)', type: 'textarea', max: 2000, full: true,
        placeholder: 'Orden del día, qué llevar, a quién avisar…' }
    ];
  }

  function validate(v, defs) {
    const errors = Listado.basicValidate(v, defs);
    if (v.start_time && v.end_time && v.end_time <= v.start_time) {
      errors.push({ field: 'end_time', message: 'La hora de fin debe ser posterior a la de inicio.' });
    }
    return errors;
  }

  const conflictList = (list) => `<ul class="cal-conflicts">${list.map((c) => `<li>
      <a href="#actividad/${c.id}" target="_blank" rel="noopener">${esc(c.title)}</a>
      <span class="muted">${esc(Fechas.formatDate(c.activity_date))} · ${esc(CU().timeRange(c))}</span></li>`).join('')}</ul>`;

  /**
   * Abre el diálogo. activity = null para alta; defaults = { activity_date, start_time, end_time, event_id }.
   * Resuelve con la actividad guardada o null.
   */
  async function open({ activity = null, defaults = {}, user, onSaved } = {}) {
    let options;
    try { options = await loadOptions(); } catch (err) { UI.toast(err.message, 'error'); return null; }
    const defs = fields(options, activity, user);
    const values = activity ? {
      ...activity, responsible_user_id: activity.responsible ? String(activity.responsible.id) : '',
      event_id: activity.event ? String(activity.event.id) : ''
    } : { activity_type: 'JUNTA', activity_date: Fechas.todayLocal(), start_time: '10:00', end_time: '11:00',
      responsible_user_id: String(user.id), ...defaults };
    let accept = false; // la persona ya confirmó el traslape

    const promise = Listado.formDialog({
      title: activity ? `Editar ${activity.title}` : 'Nueva actividad',
      description: activity ? '' : 'Junta, capacitación, acopio u otra actividad del equipo.',
      fields: defs, values, submitText: activity ? 'Guardar cambios' : 'Agregar al calendario',
      validate: (v) => validate(v, defs),
      onSubmit: async (v) => {
        const body = Listado.toBody(v, defs);
        body.responsible_user_id = body.responsible_user_id ? Number(body.responsible_user_id) : null;
        body.event_id = body.event_id ? Number(body.event_id) : null;
        let out;
        try {
          if (activity) {
            const before = { ...values, responsible_user_id: values.responsible_user_id ? Number(values.responsible_user_id) : null,
              event_id: values.event_id ? Number(values.event_id) : null };
            const changes = {};
            for (const [k, val] of Object.entries(body)) if ((before[k] ?? null) !== (val ?? null)) changes[k] = val;
            if (!Object.keys(changes).length) { UI.toast('No hay cambios que guardar'); return activity; }
            out = await UI.api(`/activities/${activity.id}`, { method: 'PATCH',
              body: { ...changes, version: activity.version, ...(accept ? { allow_overlap: true } : {}) } });
          } else {
            out = await UI.api('/activities', { method: 'POST', body: { ...body, ...(accept ? { allow_overlap: true } : {}) } });
          }
        } catch (err) {
          if (err.code === 'ACTIVITY_OVERLAP') {
            showWarning(err.data.conflicts, true);
            const e = new Error('El responsable ya tiene otra actividad en ese horario. Marca "Guardar de todos modos" o cambia el horario.');
            throw e;
          }
          throw err;
        }
        UI.toast(activity ? 'Actividad actualizada' : `"${out.activity.title}" agregada al calendario`, 'success');
        if (onSaved) onSaved(out.activity);
        return out.activity;
      }
    });

    // Aviso de traslape dentro del formulario
    const forms = document.querySelectorAll('.modal-overlay form.modal');
    const form = forms[forms.length - 1];
    const box = document.createElement('div');
    box.className = 'alert alert-warning cal-overlap-box';
    box.setAttribute('role', 'status');
    box.hidden = true;
    form.querySelector('.form').insertBefore(box, form.querySelector('[data-dialog-error]'));

    function showWarning(conflicts, fromServer = false) {
      if (!conflicts || !conflicts.length) { box.hidden = true; box.innerHTML = ''; accept = false; return; }
      const who = form.elements.responsible_user_id.selectedOptions[0]?.textContent.replace(' (yo)', '') || 'El responsable';
      box.innerHTML = `${UI.icon('alert')}<div>
        <p><strong>Traslape de horario:</strong> ${esc(who)} ya tiene ${conflicts.length === 1 ? 'otra actividad' : `${conflicts.length} actividades`} a esa hora.</p>
        ${conflictList(conflicts)}
        <label class="check"><input type="checkbox" data-accept${accept ? ' checked' : ''}><span>Guardar de todos modos</span></label></div>`;
      box.hidden = false;
      box.querySelector('[data-accept]').addEventListener('change', (e) => { accept = e.target.checked; });
      if (fromServer) box.querySelector('[data-accept]').focus();
    }

    let seq = 0;
    async function preview() {
      const f = form.elements;
      const q = { activity_date: f.activity_date.value, start_time: f.start_time.value, end_time: f.end_time.value,
        responsible_id: f.responsible_user_id.value, exclude_id: activity ? activity.id : undefined };
      if (!q.activity_date || !q.start_time || !q.end_time || !q.responsible_id || q.end_time <= q.start_time) { showWarning([]); return; }
      const mine = ++seq;
      try {
        const { items } = await UI.api(`/activities/overlaps${UI.buildQuery(q)}`);
        if (mine === seq) showWarning(items.filter((x) => x.status !== 'CANCELADA'));
      } catch { /* la vista previa no es crítica */ }
    }
    for (const n of ['activity_date', 'start_time', 'end_time', 'responsible_user_id']) {
      form.elements[n].addEventListener('change', () => { accept = false; preview(); });
    }
    // Al cambiar la hora de inicio en un alta, la de fin sigue a una hora de distancia
    if (!activity) {
      let duration = CU().toMinutes(values.end_time) - CU().toMinutes(values.start_time);
      form.elements.end_time.addEventListener('change', () => {
        const d = CU().toMinutes(form.elements.end_time.value) - CU().toMinutes(form.elements.start_time.value);
        if (d > 0) duration = d;
      });
      form.elements.start_time.addEventListener('change', () => {
        const start = CU().toMinutes(form.elements.start_time.value);
        if (Number.isNaN(start)) return;
        form.elements.end_time.value = CU().fromMinutes(Math.min(start + duration, 23 * 60 + 59));
      });
    }
    preview();
    return promise;
  }

  /**
   * Mueve una actividad (arrastrar y soltar): cambia fecha y, si se indican, horas. Pide confirmar el traslape.
   * Resuelve true si se guardó.
   */
  async function move(activity, { activity_date, start_time, end_time }) {
    const changes = {};
    if (activity_date && activity_date !== activity.activity_date) changes.activity_date = activity_date;
    if (start_time && start_time !== activity.start_time) changes.start_time = start_time;
    if (end_time && end_time !== activity.end_time) changes.end_time = end_time;
    if (!Object.keys(changes).length) return false;
    const send = (extra = {}) => UI.api(`/activities/${activity.id}`, { method: 'PATCH', body: { ...changes, version: activity.version, ...extra } });
    const when = `${Fechas.formatDate(changes.activity_date || activity.activity_date)}, ${changes.start_time || activity.start_time}`;
    try {
      await send();
    } catch (err) {
      if (err.code === 'ACTIVITY_OVERLAP') {
        const ok = await UI.confirm({ title: 'Traslape de horario',
          message: `${err.message} Se cruza con: ${CU().conflictText(err.data.conflicts)}.`, confirmText: 'Mover de todos modos' });
        if (!ok) return false;
        try { await send({ allow_overlap: true }); } catch (e2) { UI.toast(e2.message, 'error'); return false; }
      } else {
        UI.toast(err.code === 'ACTIVITY_VERSION_CONFLICT' ? 'Alguien más cambió esta actividad. Actualizamos el calendario.' : err.message, 'error');
        return err.code === 'ACTIVITY_VERSION_CONFLICT';
      }
    }
    UI.toast(`"${activity.title}" movida al ${when}`, 'success');
    return true;
  }

  return { open, move, loadOptions };
})();
