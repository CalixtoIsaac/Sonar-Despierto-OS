/**
 * Vista "Niños" (módulo BENEFICIARIOS — datos sensibles de menores): listado con filtros y
 * exportación a CSV (queda en la bitácora). Parámetros: q, escuela (id | none), tutor, consentimiento,
 * estado, page.
 */
const Ninos = (() => {
  const esc = (v) => UI.escape(v);

  function apiQuery(p) {
    return {
      search: p.q, school_id: p.escuela, tutor_id: p.tutor, consent: p.consentimiento,
      is_active: Catalogos.estadoToActive(p.estado), order_by: 'name'
    };
  }

  const consentBadge = (c) => (c.guardian_consent
    ? `<span class="badge badge-success">${UI.icon('check')}Con consentimiento</span>`
    : `<span class="badge badge-warning">${UI.icon('alert')}Sin consentimiento</span>`);
  const gradeGroup = (c) => esc([c.grade, c.group_name && `Grupo ${c.group_name}`].filter(Boolean).join(' · ') || '—');
  const name = (c) => `<a class="strong-link" href="#nino/${c.id}">${esc(c.full_name)}</a>`;

  async function tutorOptions() {
    const data = await UI.api('/tutors?is_active=true&page_size=100&order_by=name');
    return [['', 'Todos'], ...data.items.map((t) => [String(t.id), t.full_name])];
  }

  function mount(container, ctx) {
    let list;
    list = Listado.mount(container, ctx, {
      title: 'Niñas y niños',
      description: 'Beneficiarios de los eventos. Información confidencial: úsala solo para las actividades de Soñar Despierto.',
      actions: [
        { label: 'Exportar CSV', icon: 'download', id: 'export',
          onClick: (btn) => Listado.exportCsv(btn, `/children/export${UI.buildQuery(apiQuery(list.params()))}`, 'ninos.csv') },
        { label: 'Registrar niña o niño', icon: 'plus', primary: true, href: '#nino-form' }
      ],
      filters: [
        { name: 'q', type: 'search', label: 'Buscar', placeholder: 'Nombre o apellidos' },
        { name: 'escuela', type: 'select', label: 'Escuela', options: async () => {
          const opts = await Listado.schoolOptions({ emptyLabel: 'Todas' });
          return [opts[0], ['none', 'Sin escuela'], ...opts.slice(1)];
        } },
        { name: 'tutor', type: 'select', label: 'Tutor', options: tutorOptions },
        { name: 'consentimiento', type: 'select', label: 'Consentimiento', options: [['', 'Todos'], ['true', 'Con consentimiento'], ['false', 'Sin consentimiento']] },
        { name: 'estado', type: 'select', label: 'Estado', options: Catalogos.ESTADO_OPTIONS }
      ],
      endpoint: '/children',
      query: apiQuery,
      itemLabel: 'niñas y niños',
      columns: [
        { label: 'Nombre', render: name },
        { label: 'Edad', className: 'num', render: (c) => `${c.age} años` },
        { label: 'Escuela', render: (c) => (c.school ? esc(c.school.name) : '<span class="muted">Sin escuela</span>') },
        { label: 'Grado y grupo', render: gradeGroup },
        { label: 'Consentimiento', render: consentBadge },
        { label: '', className: 'actions-cell', render: (c) => `<div class="row-actions">
            <a class="btn btn-ghost btn-sm" href="#nino/${c.id}" title="Ver ficha">${UI.icon('eye')}<span>Ver ficha</span></a>
            <a class="btn btn-ghost btn-sm" href="#nino-form/${c.id}" title="Editar">${UI.icon('pencil')}<span>Editar</span></a></div>` }
      ],
      card: (c) => `
        <div class="item-card-head"><p>${name(c)}</p>${c.is_active ? '' : Listado.activeBadge(c)}</div>
        <p>${c.age} años · ${esc(Catalogos.GENDER_LABEL[c.gender])}</p>
        <p class="muted">${c.school ? esc(c.school.name) : 'Sin escuela'} · ${gradeGroup(c)}</p>
        <p>${consentBadge(c)}</p>`,
      empty: (filtered) => ({
        iconName: 'baby', title: filtered ? 'Sin resultados' : 'Aún no hay niñas ni niños registrados',
        text: filtered ? 'Prueba con otro nombre o filtro.' : 'Registra al primero; puedes capturar varios seguidos.',
        actionHtml: filtered ? '' : `<a class="btn btn-primary" href="#nino-form">${UI.icon('plus')}Registrar niña o niño</a>`
      })
    });
  }

  return { mount, consentBadge };
})();
