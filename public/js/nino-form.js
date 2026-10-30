/**
 * Vista "#nino-form" (alta) y "#nino-form/<id>" (edición) — módulo BENEFICIARIOS.
 * "Guardar y registrar otro" conserva escuela, grado, grupo y tutor para capturar un grupo completo.
 * Un 409 DUPLICATE_CHILD muestra un aviso con enlace al registro existente.
 * Parámetros de alta: escuela, tutor (preselección).
 */
const NinoForm = (() => {
  const esc = (v) => UI.escape(v);
  const C = () => Catalogos;

  function sections(schoolOpts, tutorOpts) {
    return [
      { title: 'Datos de la niña o niño', fields: [
        { name: 'first_name', label: 'Nombre(s)', required: true, max: 80 },
        { name: 'last_name', label: 'Apellidos', required: true, max: 120 },
        { name: 'birth_date', label: 'Fecha de nacimiento', type: 'date', required: true, maxDate: Fechas.todayLocal() },
        { name: 'gender', label: 'Género', type: 'select', options: C().GENDERS.map((g) => ({ value: g, label: C().GENDER_LABEL[g] })) },
        { name: 'notes', label: 'Observaciones (opcional)', type: 'textarea', max: 500, full: true,
          hint: 'Alergias o cuidados especiales. No escribas datos que no sean necesarios.' }
      ] },
      { title: 'Escuela y grupo', fields: [
        { name: 'school_id', label: 'Escuela', type: 'select', options: schoolOpts, numeric: true, full: true },
        { name: 'grade', label: 'Grado', max: 20, hint: 'Ej. 3° primaria' },
        { name: 'group_name', label: 'Grupo', max: 10, hint: 'Ej. B' }
      ] },
      { title: 'Tutor responsable', fields: [
        { name: 'tutor_id', label: 'Tutor (profesora, director o líder comunitario)', type: 'select', options: tutorOpts, numeric: true, full: true }
      ] },
      { title: 'Madre, padre o tutor legal', fields: [
        { name: 'guardian_name', label: 'Nombre completo', required: true, max: 150 },
        { name: 'guardian_relationship', label: 'Parentesco', max: 50, hint: 'Ej. Madre, Abuelo' },
        { name: 'guardian_phone', label: 'Teléfono (opcional)', type: 'tel', inputmode: 'tel', hint: '10 dígitos' },
        { name: 'guardian_consent', type: 'checkbox', full: true,
          label: 'Cuenta con la autorización firmada de la madre, padre o tutor legal para participar y para el uso de sus datos.',
          hint: 'Sin esta autorización no se podrá registrar su carta de Navidad.' }
      ] }
    ];
  }

  function validate(v, fields) {
    const errors = Listado.basicValidate(v, fields);
    if (v.birth_date) {
      const age = Fechas.ageOn(v.birth_date);
      if (age === null || age < 0 || age > C().CHILD_MAX_AGE) {
        errors.push({ field: 'birth_date', message: `La fecha de nacimiento debe corresponder a una niña o niño de 0 a ${C().CHILD_MAX_AGE} años.` });
      }
    }
    return errors;
  }

  async function options(child) {
    const [schoolOpts, tutors] = await Promise.all([
      Listado.schoolOptions({ includeId: child?.school?.id }),
      UI.api('/tutors?is_active=true&page_size=100&order_by=name')
    ]);
    const tutorOpts = [['', 'Sin tutor asignado'], ...tutors.items.map((t) => [String(t.id), `${t.full_name}${t.school ? ` — ${t.school.name}` : ''}`])];
    if (child?.tutor && !tutorOpts.some(([v]) => v === String(child.tutor.id))) tutorOpts.push([String(child.tutor.id), `${child.tutor.full_name} (dado de baja)`]);
    const toOpts = (list) => list.map(([value, label]) => ({ value, label }));
    return { schoolOpts: toOpts(schoolOpts), tutorOpts: toOpts(tutorOpts) };
  }

  function render(container, ctx, child, opts, keep = {}) {
    const F = Components.form;
    const creating = !child;
    const secs = sections(opts.schoolOpts, opts.tutorOpts);
    const fields = secs.flatMap((s) => s.fields);
    const values = child ? {
      ...child, school_id: child.school ? String(child.school.id) : '', tutor_id: child.tutor ? String(child.tutor.id) : '',
      guardian_phone: child.guardian_phone ? Phone.format(child.guardian_phone) : ''
    } : { gender: 'NO_ESPECIFICA', school_id: ctx.params.escuela || '', tutor_id: ctx.params.tutor || '', ...keep };
    const back = creating ? '#ninos' : `#nino/${child.id}`;

    container.innerHTML = `
      <p class="back-link"><a href="${back}">${UI.icon('arrowLeft')}${creating ? 'Niñas y niños' : esc(child.full_name)}</a></p>
      <section class="page-header"><div>
        <h2>${creating ? 'Registrar niña o niño' : `Editar a ${esc(child.full_name)}`}</h2>
        <p class="muted">Los campos con <span class="req">*</span> son obligatorios.</p></div></section>
      <div class="alert alert-info privacy-note" role="note">${UI.icon('shield')}<span>Datos de una persona menor de edad: captura solo lo necesario.
        El sistema registra en la bitácora quién crea, modifica o exporta esta información.</span></div>
      <form class="card panel form form-page" id="childForm" novalidate>
        ${secs.map((s) => `<fieldset class="form-section"><legend>${esc(s.title)}</legend>
          <div class="form-grid">${s.fields.map((f) => F.field(f, values[f.name] ?? '')).join('')}</div></fieldset>`).join('')}
        <div class="alert alert-error" id="childAlert" role="alert" hidden></div>
        <div class="form-actions">
          <a class="btn btn-ghost" href="${back}">Cancelar</a>
          ${creating ? '<button type="submit" class="btn btn-outline" data-again>Guardar y registrar otro</button>' : ''}
          <button type="submit" class="btn btn-primary" data-save>${creating ? 'Guardar' : 'Guardar cambios'}</button>
        </div>
      </form>`;

    const form = container.querySelector('#childForm');
    const alertBox = container.querySelector('#childAlert');
    F.bindLiveClear(form);
    // Edad calculada junto a la fecha
    const birth = form.elements.birth_date;
    const ageHint = document.createElement('p');
    ageHint.className = 'hint';
    ageHint.setAttribute('aria-live', 'polite');
    birth.insertAdjacentElement('afterend', ageHint);
    const showAge = () => {
      const age = Fechas.ageOn(birth.value);
      ageHint.textContent = age !== null && age >= 0 ? `Edad: ${age} ${age === 1 ? 'año' : 'años'}` : '';
    };
    birth.addEventListener('input', showAge);
    showAge();

    let again = false;
    form.querySelectorAll('[type="submit"]').forEach((b) => b.addEventListener('click', () => { again = b.hasAttribute('data-again'); }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.hidden = true;
      F.clearErrors(form);
      const v = F.read(form, fields);
      const errors = validate(v, fields);
      if (errors.length) { F.showErrors(form, errors); return; }
      const body = Listado.toBody(v, fields);
      const button = form.querySelector(again ? '[data-again]' : '[data-save]');
      UI.setBusy(button, true);
      try {
        let saved;
        if (creating) {
          saved = (await UI.api('/children', { method: 'POST', body })).child;
        } else {
          const before = { ...child, school_id: child.school?.id ?? null, tutor_id: child.tutor?.id ?? null };
          const changes = {};
          for (const [k, val] of Object.entries(body)) if ((before[k] ?? null) !== (val ?? null)) changes[k] = val;
          if (!Object.keys(changes).length) { location.hash = `#nino/${child.id}`; UI.toast('No hay cambios que guardar'); return; }
          saved = (await UI.api(`/children/${child.id}`, { method: 'PATCH', body: changes })).child;
        }
        UI.toast(creating ? `${saved.full_name} quedó registrado` : 'Cambios guardados', 'success');
        if (again) {
          render(container, ctx, null, opts, { school_id: v.school_id || '', tutor_id: v.tutor_id || '', grade: v.grade || '', group_name: v.group_name || '' });
          window.scrollTo(0, 0);
          container.querySelector('[name="first_name"]').focus();
        } else location.hash = `#nino/${saved.id}`;
      } catch (err) {
        UI.setBusy(button, false);
        if (err.status === 409) {
          Listado.duplicateNotice(err, { title: 'Ya existe una niña o niño con estos datos', href: `#nino/${err.data.existing_id}` });
          return;
        }
        const rest = err.details ? F.showErrors(form, err.details) : [err];
        if (rest.length) { alertBox.textContent = rest[0].message || err.message; alertBox.hidden = false; }
      }
    });
    form.querySelector('[name="first_name"]').focus();
  }

  async function mount(container, ctx) {
    container.innerHTML = Components.loading(8);
    try {
      const child = ctx.id ? (await UI.api(`/children/${Number(ctx.id)}`)).child : null;
      render(container, ctx, child, await options(child));
    } catch (err) {
      if (err.status === 404) NinoDetalle.notFound(container);
      else Components.error(container, err, () => mount(container, ctx));
    }
  }

  return { mount };
})();
