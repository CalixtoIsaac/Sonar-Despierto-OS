/**
 * Vista "Escuelas" (módulo BENEFICIARIOS): listado, alta y edición en un diálogo, baja lógica.
 * Parámetros: q, estado (''=activas | inactivos | todos), page, ver (id para abrir su edición).
 */
const Escuelas = (() => {
  const esc = (v) => UI.escape(v);
  const FIELDS = [
    { name: 'name', label: 'Nombre de la escuela o comunidad', required: true, max: 150, full: true },
    { name: 'cct', label: 'CCT (opcional)', max: 15, hint: 'Clave de Centro de Trabajo de la SEP, p. ej. 30EPR0001A' },
    { name: 'zone', label: 'Zona, colonia o municipio', max: 100 },
    { name: 'address', label: 'Dirección', max: 255, full: true },
    { name: 'contact_name', label: 'Persona de contacto', max: 150 },
    { name: 'contact_phone', label: 'Teléfono de contacto', type: 'tel', inputmode: 'tel', hint: '10 dígitos' }
  ];

  function validate(v) {
    const errors = Listado.basicValidate(v, FIELDS);
    if (v.cct && !/^\d{2}[A-Za-z]{3}\d{4}[A-Za-z]$/.test(v.cct)) {
      errors.push({ field: 'cct', message: 'La CCT tiene 10 caracteres, por ejemplo 30EPR0001A.' });
    }
    return errors;
  }

  function openForm(school, onSaved) {
    return Listado.formDialog({
      title: school ? `Editar ${school.name}` : 'Nueva escuela',
      fields: FIELDS,
      values: school ? { ...school, contact_phone: school.contact_phone ? Phone.format(school.contact_phone) : '' } : {},
      submitText: school ? 'Guardar cambios' : 'Registrar escuela',
      validate,
      onSubmit: async (values) => {
        const body = Listado.toBody(values, FIELDS);
        const out = school
          ? await UI.api(`/schools/${school.id}`, { method: 'PATCH', body })
          : await UI.api('/schools', { method: 'POST', body });
        UI.toast(school ? 'Escuela actualizada' : 'Escuela registrada', 'success');
        onSaved();
        return out.school;
      },
      onDuplicate: (err) => Listado.duplicateNotice(err, {
        title: 'Esta escuela ya está registrada', href: `#escuelas?ver=${err.data.existing_id}`, linkText: 'Ver la escuela'
      })
    });
  }

  async function toggle(school, reload) {
    if (school.is_active) {
      const ok = await UI.confirm({
        title: `¿Dar de baja ${school.name}?`,
        message: school.children_count
          ? `Tiene ${school.children_count} niñas y niños activos. Seguirán registrados, pero la escuela ya no aparecerá para nuevos registros.`
          : 'Ya no aparecerá para nuevos registros. Podrás reactivarla después.',
        confirmText: 'Dar de baja', danger: true
      });
      if (!ok) return;
    }
    try {
      await UI.api(`/schools/${school.id}`, { method: 'PATCH', body: { is_active: !school.is_active } });
      UI.toast(school.is_active ? 'Escuela dada de baja' : 'Escuela reactivada', 'success');
      reload();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  const actions = (s) => `<div class="row-actions">
    <a class="btn btn-ghost btn-sm" href="#ninos?escuela=${s.id}" title="Ver niñas y niños">${UI.icon('baby')}<span>Ver niñas y niños</span></a>
    <button type="button" class="btn btn-ghost btn-sm" data-edit="${s.id}" title="Editar">${UI.icon('pencil')}<span>Editar</span></button>
    <button type="button" class="btn btn-ghost btn-sm ${s.is_active ? 'btn-danger-ghost' : ''}" data-toggle="${s.id}" title="${s.is_active ? 'Dar de baja' : 'Reactivar'}">
      ${UI.icon(s.is_active ? 'trash' : 'refresh')}<span>${s.is_active ? 'Dar de baja' : 'Reactivar'}</span></button>
  </div>`;

  const contact = (s) => (s.contact_name || s.contact_phone
    ? `<span class="cell-stack"><span>${esc(s.contact_name || '—')}</span>${s.contact_phone ? Listado.phoneLink(s.contact_phone) : ''}</span>`
    : '<span class="muted">—</span>');

  function mount(container, ctx) {
    let list;
    const reload = () => list.reload();
    list = Listado.mount(container, ctx, {
      title: 'Escuelas',
      description: 'Escuelas y comunidades de donde vienen las niñas y niños beneficiarios.',
      actions: [{ label: 'Nueva escuela', icon: 'plus', primary: true, onClick: () => openForm(null, reload) }],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Nombre, CCT o zona' },
        { name: 'estado', type: 'select', label: 'Estado', options: Catalogos.ESTADO_OPTIONS }
      ],
      endpoint: '/schools',
      query: (p) => ({ search: p.q, is_active: Catalogos.estadoToActive(p.estado), order_by: 'name' }),
      itemLabel: 'escuelas',
      columns: [
        { label: 'Nombre', render: (s) => `<strong>${esc(s.name)}</strong>` },
        { label: 'CCT', render: (s) => (s.cct ? `<code>${esc(s.cct)}</code>` : '<span class="muted">—</span>') },
        { label: 'Zona', render: (s) => esc(s.zone || '—') },
        { label: 'Contacto', render: contact },
        { label: 'Niñas y niños', className: 'num', render: (s) => String(s.children_count) },
        { label: 'Estado', render: Listado.activeBadge },
        { label: '', className: 'actions-cell', render: actions }
      ],
      card: (s) => `
        <div class="item-card-head"><p>${esc(s.name)}</p>${Listado.activeBadge(s)}</div>
        <p class="muted">${esc([s.cct, s.zone].filter(Boolean).join(' · ') || 'Sin CCT ni zona')}</p>
        <p>${s.children_count} niñas y niños · ${s.tutors_count} tutores</p>
        ${s.contact_name || s.contact_phone ? `<p>${esc(s.contact_name || '')} ${s.contact_phone ? Listado.phoneLink(s.contact_phone) : ''}</p>` : ''}
        ${actions(s)}`,
      empty: (filtered) => ({
        iconName: 'school', title: filtered ? 'Sin resultados' : 'Aún no hay escuelas registradas',
        text: filtered ? 'Prueba con otro nombre o cambia el estado.' : 'Registra la primera escuela o comunidad.'
      }),
      onItems: (el, items) => {
        const byId = Object.fromEntries(items.map((s) => [s.id, s]));
        el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openForm(byId[b.dataset.edit], reload)));
        el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => toggle(byId[b.dataset.toggle], reload)));
      }
    });
    if (ctx.params.ver) {
      UI.api(`/schools/${Number(ctx.params.ver)}`).then(({ school }) => openForm(school, reload)).catch((err) => UI.toast(err.message, 'error'));
    }
  }

  return { mount, openForm };
})();
