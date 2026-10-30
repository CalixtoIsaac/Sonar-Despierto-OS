/**
 * Vista "Tutores" (módulo BENEFICIARIOS): profesoras, directores o líderes comunitarios responsables
 * de un grupo de niñas y niños. No tienen cuenta en el sistema (ADR-0004).
 * Parámetros: q, escuela, estado, page, ver (id para abrir su edición).
 */
const Tutores = (() => {
  const esc = (v) => UI.escape(v);
  const fields = (schoolOpts) => [
    { name: 'first_name', label: 'Nombre(s)', required: true, max: 80 },
    { name: 'last_name', label: 'Apellidos', required: true, max: 120 },
    { name: 'phone', label: 'Teléfono', type: 'tel', required: true, inputmode: 'tel', hint: '10 dígitos' },
    { name: 'email', label: 'Correo (opcional)', type: 'email', max: 255 },
    { name: 'position', label: 'Cargo o relación', max: 80, hint: 'Ej. Profesora de 3°A, Director, Líder comunitario' },
    { name: 'school_id', label: 'Escuela', type: 'select', options: schoolOpts, numeric: true },
    { name: 'notes', label: 'Notas (opcional)', type: 'textarea', max: 500, full: true }
  ];

  async function openForm(tutor, onSaved) {
    let opts;
    try { opts = await Listado.schoolOptions({ includeId: tutor?.school?.id }); } catch (err) { UI.toast(err.message, 'error'); return null; }
    const defs = fields(opts.map(([value, label]) => ({ value, label })));
    return Listado.formDialog({
      title: tutor ? `Editar a ${tutor.full_name}` : 'Nuevo tutor',
      description: 'Persona responsable de un grupo de niñas y niños (no tiene cuenta en el sistema).',
      fields: defs,
      values: tutor ? { ...tutor, phone: Phone.format(tutor.phone), school_id: tutor.school ? String(tutor.school.id) : '' } : {},
      submitText: tutor ? 'Guardar cambios' : 'Registrar tutor',
      validate: (v) => Listado.basicValidate(v, defs),
      onSubmit: async (values) => {
        const body = Listado.toBody(values, defs);
        const out = tutor
          ? await UI.api(`/tutors/${tutor.id}`, { method: 'PATCH', body })
          : await UI.api('/tutors', { method: 'POST', body });
        UI.toast(tutor ? 'Tutor actualizado' : 'Tutor registrado', 'success');
        onSaved();
        return out.tutor;
      },
      onDuplicate: (err) => Listado.duplicateNotice(err, {
        title: 'Este tutor ya está registrado', href: `#tutores?ver=${err.data.existing_id}`, linkText: 'Ver al tutor'
      })
    });
  }

  async function toggle(t, reload) {
    if (t.is_active) {
      const ok = await UI.confirm({
        title: `¿Dar de baja a ${t.full_name}?`,
        message: 'Sus niñas y niños seguirán registrados, pero ya no aparecerá para nuevos registros.',
        confirmText: 'Dar de baja', danger: true
      });
      if (!ok) return;
    }
    try {
      await UI.api(`/tutors/${t.id}`, { method: 'PATCH', body: { is_active: !t.is_active } });
      UI.toast(t.is_active ? 'Tutor dado de baja' : 'Tutor reactivado', 'success');
      reload();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  const actions = (t) => `<div class="row-actions">
    <a class="btn btn-ghost btn-sm" href="#ninos?tutor=${t.id}" title="Ver niñas y niños">${UI.icon('baby')}<span>Ver niñas y niños</span></a>
    <button type="button" class="btn btn-ghost btn-sm" data-edit="${t.id}" title="Editar">${UI.icon('pencil')}<span>Editar</span></button>
    <button type="button" class="btn btn-ghost btn-sm ${t.is_active ? 'btn-danger-ghost' : ''}" data-toggle="${t.id}" title="${t.is_active ? 'Dar de baja' : 'Reactivar'}">
      ${UI.icon(t.is_active ? 'trash' : 'refresh')}<span>${t.is_active ? 'Dar de baja' : 'Reactivar'}</span></button>
  </div>`;

  function mount(container, ctx) {
    let list;
    const reload = () => list.reload();
    list = Listado.mount(container, ctx, {
      title: 'Tutores',
      description: 'Profesoras, directores y líderes comunitarios responsables de las niñas y niños.',
      actions: [{ label: 'Nuevo tutor', icon: 'plus', primary: true, onClick: () => openForm(null, reload) }],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Nombre, teléfono o correo' },
        { name: 'escuela', type: 'select', label: 'Escuela', options: () => Listado.schoolOptions({ emptyLabel: 'Todas' }) },
        { name: 'estado', type: 'select', label: 'Estado', options: Catalogos.ESTADO_OPTIONS }
      ],
      endpoint: '/tutors',
      query: (p) => ({ search: p.q, school_id: p.escuela, is_active: Catalogos.estadoToActive(p.estado), order_by: 'name' }),
      itemLabel: 'tutores',
      columns: [
        { label: 'Nombre', render: (t) => `<strong>${esc(t.full_name)}</strong>${t.position ? `<br><span class="muted">${esc(t.position)}</span>` : ''}` },
        { label: 'Teléfono', render: (t) => Listado.phoneLink(t.phone) },
        { label: 'Escuela', render: (t) => (t.school ? esc(t.school.name) : '<span class="muted">Sin escuela</span>') },
        { label: 'Niñas y niños', className: 'num', render: (t) => String(t.children_count) },
        { label: 'Estado', render: Listado.activeBadge },
        { label: '', className: 'actions-cell', render: actions }
      ],
      card: (t) => `
        <div class="item-card-head"><p>${esc(t.full_name)}</p>${Listado.activeBadge(t)}</div>
        ${t.position ? `<p class="muted">${esc(t.position)}</p>` : ''}
        <p>${Listado.phoneLink(t.phone)} · ${t.school ? esc(t.school.name) : 'Sin escuela'}</p>
        <p>${t.children_count} niñas y niños</p>
        ${actions(t)}`,
      empty: (filtered) => ({
        iconName: 'contact', title: filtered ? 'Sin resultados' : 'Aún no hay tutores registrados',
        text: filtered ? 'Prueba con otro nombre o filtro.' : 'Registra a la persona responsable de cada grupo.'
      }),
      onItems: (el, items) => {
        const byId = Object.fromEntries(items.map((t) => [t.id, t]));
        el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openForm(byId[b.dataset.edit], reload)));
        el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => toggle(byId[b.dataset.toggle], reload)));
      }
    });
    if (ctx.params.ver) {
      UI.api(`/tutors/${Number(ctx.params.ver)}`).then(({ tutor }) => openForm(tutor, reload)).catch((err) => UI.toast(err.message, 'error'));
    }
  }

  return { mount, openForm };
})();
