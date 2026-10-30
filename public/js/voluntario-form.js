/**
 * Vista "#voluntario-form" (alta) y "#voluntario-form/<id>" (edición) — módulo VOLUNTARIOS.
 */
const VoluntarioForm = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;

  const SECTIONS = () => [
    { title: 'Datos personales', fields: [
      { name: 'first_name', label: 'Nombre(s)', required: true, max: 80 },
      { name: 'last_name', label: 'Apellidos', required: true, max: 120 },
      { name: 'phone', label: 'Teléfono', type: 'tel', required: true, inputmode: 'tel', hint: '10 dígitos' },
      { name: 'email', label: 'Correo (opcional)', type: 'email', max: 255 },
      { name: 'birth_date', label: 'Fecha de nacimiento (opcional)', type: 'date', maxDate: Fechas.todayLocal(), hint: `Debe tener al menos ${C().VOLUNTEER_MIN_AGE} años.` },
      { name: 'city', label: 'Ciudad o municipio', max: 100 },
      { name: 'occupation', label: 'Ocupación', max: 100, hint: 'Ej. Estudiante, Contadora, Jubilado' }
    ] },
    { title: 'Contacto de emergencia', fields: [
      { name: 'emergency_contact_name', label: 'Nombre', required: true, max: 150 },
      { name: 'emergency_contact_phone', label: 'Teléfono', type: 'tel', required: true, inputmode: 'tel', hint: '10 dígitos' },
      { name: 'emergency_contact_relationship', label: 'Parentesco', max: 50, hint: 'Ej. Madre, Esposo, Amiga' }
    ] },
    { title: 'Participación', fields: [
      { name: 'area_of_interest', label: 'Área de apoyo', type: 'select', required: true,
        options: [{ value: '', label: 'Elige un área' }, ...C().VOLUNTEER_AREAS.map((a) => ({ value: a, label: C().VOLUNTEER_AREA_LABEL[a] }))] },
      { name: 'shirt_size', label: 'Talla de playera', type: 'select', required: true,
        options: [{ value: '', label: 'Elige una talla' }, ...C().SHIRT_SIZES.map((s) => ({ value: s, label: s }))] }
    ] },
    { title: 'Salud y notas', fields: [
      { name: 'medical_notes', label: 'Notas médicas (opcional)', type: 'textarea', max: 500, full: true,
        hint: 'Alergias o condiciones importantes para los eventos. Solo las ve el personal con acceso a Voluntarios.' },
      { name: 'notes', label: 'Observaciones (opcional)', type: 'textarea', max: 500, full: true }
    ] }
  ];

  const allFields = () => SECTIONS().flatMap((s) => s.fields);

  function validate(v, creating) {
    const fields = allFields();
    const errors = Listado.basicValidate(v, fields);
    if (v.birth_date) {
      const age = Fechas.ageOn(v.birth_date);
      if (age === null || age > 100) errors.push({ field: 'birth_date', message: 'Escribe una fecha de nacimiento válida.' });
      else if (age < C().VOLUNTEER_MIN_AGE) errors.push({ field: 'birth_date', message: `La persona voluntaria debe tener al menos ${C().VOLUNTEER_MIN_AGE} años.` });
    }
    if (creating && !v.accepts_privacy) errors.push({ field: 'accepts_privacy', message: 'Confirma que la persona aceptó el aviso de privacidad.' });
    return errors;
  }

  function render(container, ctx, volunteer) {
    const F = Components.form;
    const creating = !volunteer;
    const values = volunteer ? { ...volunteer,
      phone: Phone.format(volunteer.phone), emergency_contact_phone: Phone.format(volunteer.emergency_contact_phone) } : {};
    container.innerHTML = `
      <p class="back-link"><a href="${creating ? '#voluntarios' : `#voluntario/${volunteer.id}`}">${UI.icon('arrowLeft')}${creating ? 'Voluntarios' : esc(volunteer.full_name)}</a></p>
      <section class="page-header"><div>
        <h2>${creating ? 'Nuevo voluntario' : `Editar a ${esc(volunteer.full_name)}`}</h2>
        <p class="muted">Los campos con <span class="req">*</span> son obligatorios.</p></div></section>
      <form class="card panel form form-page" id="volForm" novalidate>
        ${SECTIONS().map((s) => `<fieldset class="form-section"><legend>${esc(s.title)}</legend>
          <div class="form-grid">${s.fields.map((f) => F.field(f, values[f.name] ?? '')).join('')}</div></fieldset>`).join('')}
        ${creating ? `<fieldset class="form-section"><legend>Aviso de privacidad</legend>
          ${F.field({ name: 'accepts_privacy', type: 'checkbox', required: true,
            label: 'La persona conoce y acepta el aviso de privacidad de Soñar Despierto para el uso de sus datos.' })}</fieldset>` : ''}
        <div class="alert alert-error" id="volAlert" role="alert" hidden></div>
        <div class="form-actions">
          <a class="btn btn-ghost" href="${creating ? '#voluntarios' : `#voluntario/${volunteer.id}`}">Cancelar</a>
          ${creating ? '<button type="submit" class="btn btn-outline" data-again>Guardar y registrar otro</button>' : ''}
          <button type="submit" class="btn btn-primary" data-save>${creating ? 'Guardar' : 'Guardar cambios'}</button>
        </div>
      </form>`;

    const form = container.querySelector('#volForm');
    const alertBox = container.querySelector('#volAlert');
    F.bindLiveClear(form);
    let again = false;
    form.querySelectorAll('[type="submit"]').forEach((b) => b.addEventListener('click', () => { again = b.hasAttribute('data-again'); }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.hidden = true;
      F.clearErrors(form);
      const fields = allFields();
      const v = F.read(form, creating ? [...fields, { name: 'accepts_privacy', type: 'checkbox' }] : fields);
      const errors = validate(v, creating);
      if (errors.length) { F.showErrors(form, errors); return; }
      const body = Listado.toBody(v, fields);
      if (body.email) body.email = body.email.toLowerCase();
      const button = form.querySelector(again ? '[data-again]' : '[data-save]');
      UI.setBusy(button, true);
      try {
        let saved;
        if (creating) {
          saved = (await UI.api('/volunteers', { method: 'POST', body: { ...body, accepts_privacy: true } })).volunteer;
        } else {
          const changes = {};
          for (const [k, val] of Object.entries(body)) if ((volunteer[k] ?? null) !== (val ?? null)) changes[k] = val;
          if (!Object.keys(changes).length) { location.hash = `#voluntario/${volunteer.id}`; UI.toast('No hay cambios que guardar'); return; }
          saved = (await UI.api(`/volunteers/${volunteer.id}`, { method: 'PATCH', body: changes })).volunteer;
        }
        UI.toast(creating ? `${saved.full_name} quedó registrado` : 'Cambios guardados', 'success');
        if (again) { render(container, ctx, null); window.scrollTo(0, 0); container.querySelector('[name="first_name"]').focus(); }
        else location.hash = `#voluntario/${saved.id}`;
      } catch (err) {
        UI.setBusy(button, false);
        if (err.status === 409) {
          Listado.duplicateNotice(err, { title: 'Esta persona ya está registrada', href: `#voluntario/${err.data.existing_id}` });
          return;
        }
        const rest = err.details ? F.showErrors(form, err.details) : [err];
        if (rest.length) { alertBox.textContent = rest[0].message || err.message; alertBox.hidden = false; }
      }
    });
    form.querySelector('[name="first_name"]').focus();
  }

  async function mount(container, ctx) {
    if (!ctx.id) { render(container, ctx, null); return; }
    container.innerHTML = Components.loading(6);
    try {
      const { volunteer } = await UI.api(`/volunteers/${Number(ctx.id)}`);
      render(container, ctx, volunteer);
    } catch (err) {
      if (err.status === 404) VoluntarioDetalle.notFound(container);
      else Components.error(container, err, () => mount(container, ctx));
    }
  }

  return { mount };
})();
