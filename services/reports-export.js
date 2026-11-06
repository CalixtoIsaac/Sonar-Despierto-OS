/**
 * Exportación a Excel del dashboard de un evento (Fase 7, ADR-0014). Un libro .xlsx con una hoja por tema,
 * construido con los MISMOS datos de services/reports.js (así el archivo coincide con la pantalla).
 * Solo conteos: no lleva nombres de niñas, niños ni voluntarios. Queda en la bitácora (DATA_EXPORTED).
 */
const { getDb } = require('../lib/db');
const {
  LETTER_STATUSES, LETTER_STATUS_LABELS, PARTICIPATION_STATUSES, PARTICIPATION_STATUS_LABELS, VOLUNTEER_AREAS,
  VOLUNTEER_AREA_LABELS, SHIRT_SIZES, GENDERS, GENDER_LABELS, ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, ACTIVITY_STATUSES,
  ACTIVITY_STATUS_LABELS, INVENTORY_UNIT_LABELS, EVENT_STATUS_LABELS, EVENT_TYPE_LABELS
} = require('../lib/catalogs');
const { Workbook } = require('../lib/xlsx');
const { recordAudit } = require('./audit');
const R = require('./records');
const reports = require('./reports');

const longDate = (ymd) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
const stamp = (iso) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' })
  .format(new Date(iso));

const SHEETS = Object.freeze(['Resumen', 'Cartas por estatus', 'Por escuela', 'Avance semanal', 'Voluntarios', 'Actividades',
  'Inventario', 'Eventos']);

const EVENTS_BY_STATUS = { BORRADOR: 'en borrador', ABIERTO: 'abiertos', EN_CURSO: 'en curso', CERRADO: 'cerrados' };
const int = (header, width) => ({ header, type: 'int', width });
const pctCol = (header, width) => ({ header, type: 'pct', width });

function header(d, subtitle) {
  return [
    { title: `${subtitle} · ${d.event.name}` },
    { note: `${EVENT_TYPE_LABELS[d.event.event_type]} · ${EVENT_STATUS_LABELS[d.event.status]} · ${longDate(d.event.event_date)}. `
      + `Generado el ${stamp(d.generated_at)} con el sistema Soñar Despierto.` }
  ];
}

function summarySheet(wb, d) {
  const L = d.letters;
  const rows = [
    ['Cartas registradas', L.total, null],
    ['Cartas con padrino (asignadas, recibidas o entregadas)', L.with_sponsor, L.with_sponsor_pct],
    ['Regalos recibidos en acopio (recibidos o entregados)', L.received_or_delivered, L.received_pct],
    ['Regalos entregados', L.by_status.ENTREGADO, L.delivered_pct],
    ['Cartas sin padrino', L.by_status.PENDIENTE, reports.pct(L.by_status.PENDIENTE, L.total)],
    ['Cartas con foto', L.with_photo, reports.pct(L.with_photo, L.total)],
    ['Padrinos distintos', L.sponsors, null],
    ['Cartas por padrino (promedio)', { value: L.letters_per_sponsor, type: 'dec' }, null],
    [`Padrinos en el límite (${L.max_letters_per_sponsor} cartas)`, L.sponsors_at_limit, null],
    ['Voluntarios confirmados en el evento', d.volunteers.confirmed, null],
    ['Voluntarios postulados en el evento', d.volunteers.by_status.POSTULADO, null],
    ['Niñas y niños activos', d.children.active, null],
    ['Niñas y niños con carta en este evento', d.children.with_letter, null],
    ['Con consentimiento y sin carta en este evento', d.children.eligible_without_letter, null],
    ['Sin consentimiento del tutor', d.children.without_consent, reports.pct(d.children.without_consent, d.children.active)],
    ['Escuelas con cartas en este evento', d.schools.participating, null],
    ['Actividades del calendario ligadas (no canceladas)', d.activities.total - d.activities.by_status.CANCELADA, null],
    ['Unidades de inventario usadas en el evento', d.inventory.units_out, null],
    ['Artículos con existencia baja (todo el inventario)', d.inventory.low_stock_items, null]
  ];
  wb.addSheet('Resumen', [
    ...header(d, 'Reporte del evento'),
    { columns: [{ header: 'Indicador', width: 56 }, int('Valor', 12), pctCol('% del total', 14)], rows },
    { heading: 'Totales de la organización', columns: [{ header: 'Indicador', width: 56 }, int('Valor', 12)], rows: [
      ['Niñas y niños activos', d.global.children_active],
      ['Voluntarios activos', d.global.volunteers_active],
      ['Escuelas activas', d.global.schools_active],
      ['Tutores responsables activos', d.global.tutors_active],
      ...Object.entries(d.global.events_by_status).map(([s, n]) => [`Eventos ${EVENTS_BY_STATUS[s]}`, n])
    ] }
  ]);
}

function lettersSheet(wb, d) {
  const L = d.letters;
  wb.addSheet('Cartas por estatus', [
    ...header(d, 'Cartas por estatus'),
    { columns: [{ header: 'Estatus', width: 24 }, int('Cartas', 12), pctCol('% del total', 14)],
      rows: [...LETTER_STATUSES.map((s) => [LETTER_STATUS_LABELS[s], L.by_status[s], reports.pct(L.by_status[s], L.total)]),
        ['Total', L.total, L.total ? 100 : null]] },
    { heading: 'Cartas por género de la niña o niño', columns: [{ header: 'Género', width: 24 }, int('Cartas', 12)],
      rows: GENDERS.map((g) => [GENDER_LABELS[g], d.children.letters_by_gender[g]]) }
  ]);
}

function schoolsSheet(wb, d) {
  wb.addSheet('Por escuela', [
    ...header(d, 'Cartas por escuela'),
    { columns: [{ header: 'Escuela', width: 44 }, int('Total'), ...LETTER_STATUSES.map((s) => int(LETTER_STATUS_LABELS[s], 16)),
      pctCol('% con padrino', 15), pctCol('% entregado', 14)],
    rows: d.by_school.map((x) => [x.name, x.total, ...LETTER_STATUSES.map((s) => x.by_status[s]), x.with_sponsor_pct, x.delivered_pct]) }
  ]);
}

function timelineSheet(wb, d) {
  wb.addSheet('Avance semanal', [
    ...header(d, 'Avance semanal de las cartas'),
    { note: 'Estatus de las cartas al cierre de cada semana (lunes a domingo, hora de Veracruz), reconstruido del historial.' },
    { columns: [{ header: 'Semana del', type: 'date', width: 14 }, { header: 'al', type: 'date', width: 14 },
      ...LETTER_STATUSES.map((s) => int(LETTER_STATUS_LABELS[s], 16)), int('Total de cartas', 16)],
    rows: d.timeline.map((p) => [p.week_start, p.week_end, ...LETTER_STATUSES.map((s) => p.by_status[s]), p.total]) }
  ]);
}

function volunteersSheet(wb, d) {
  const V = d.volunteers;
  wb.addSheet('Voluntarios', [
    ...header(d, 'Voluntarios del evento'),
    { heading: 'Confirmados por área', columns: [{ header: 'Área', width: 30 }, int('Confirmados', 14)],
      rows: VOLUNTEER_AREAS.map((a) => [VOLUNTEER_AREA_LABELS[a], V.confirmed_by_area[a]]) },
    { heading: 'Participación por estatus', columns: [{ header: 'Estatus', width: 30 }, int('Voluntarios', 14)],
      rows: PARTICIPATION_STATUSES.map((s) => [PARTICIPATION_STATUS_LABELS[s], V.by_status[s]]) },
    { heading: 'Tallas de playera de los confirmados', columns: [{ header: 'Talla', width: 30 }, int('Playeras', 14)],
      rows: SHIRT_SIZES.map((s) => [s, V.shirt_sizes[s]]) }
  ]);
}

function activitiesSheet(wb, d) {
  const A = d.activities;
  wb.addSheet('Actividades', [
    ...header(d, 'Actividades del calendario ligadas al evento'),
    { heading: 'Por tipo (sin canceladas)', columns: [{ header: 'Tipo', width: 30 }, int('Actividades', 14)],
      rows: ACTIVITY_TYPES.map((t) => [ACTIVITY_TYPE_LABELS[t], A.by_type[t]]) },
    { heading: 'Por estatus', columns: [{ header: 'Estatus', width: 30 }, int('Actividades', 14)],
      rows: ACTIVITY_STATUSES.map((s) => [ACTIVITY_STATUS_LABELS[s], A.by_status[s]]) }
  ]);
}

function inventorySheet(wb, d) {
  wb.addSheet('Inventario', [
    ...header(d, 'Inventario ligado al evento'),
    { note: 'Entradas y salidas registradas con este evento, ya descontadas las anulaciones (los traspasos entre centros no cuentan).' },
    { columns: [{ header: 'Artículo', width: 36 }, { header: 'Categoría', width: 26 }, { header: 'Unidad', width: 12 },
      int('Entradas', 12), int('Salidas', 12)],
    rows: d.inventory.items.map((x) => [x.name, x.category, INVENTORY_UNIT_LABELS[x.unit], x.in, x.out]) }
  ]);
}

function eventsSheet(wb, d, comparison) {
  wb.addSheet('Eventos', [
    { title: 'Comparativo de eventos' },
    { note: `Generado el ${stamp(d.generated_at)}.` },
    { columns: [{ header: 'Evento', width: 30 }, { header: 'Tipo', width: 14 }, { header: 'Estatus', width: 12 },
      { header: 'Fecha', type: 'date', width: 12 }, int('Cartas'), ...LETTER_STATUSES.map((s) => int(LETTER_STATUS_LABELS[s], 16)),
      pctCol('% con padrino', 15), pctCol('% entregado', 14), int('Voluntarios confirmados', 22), int('Actividades', 13)],
    rows: comparison.items.map((e) => [e.name, EVENT_TYPE_LABELS[e.event_type], EVENT_STATUS_LABELS[e.status], e.event_date,
      e.letters_total, ...LETTER_STATUSES.map((s) => e.letters_by_status[s]), e.with_sponsor_pct, e.delivered_pct,
      e.volunteers_confirmed, e.activities]) }
  ]);
}

/** Libro de Excel del evento. Devuelve { buffer, filename, sheets }. Se audita. */
function exportDashboard(actor, eventId, ip, db = getDb()) {
  const d = reports.dashboard(eventId, db);
  const comparison = reports.eventsComparison(db);
  const wb = new Workbook({ title: `Reporte ${d.event.name}` });
  summarySheet(wb, d);
  if (d.event.accepts_letters) {
    lettersSheet(wb, d);
    schoolsSheet(wb, d);
    timelineSheet(wb, d);
  }
  volunteersSheet(wb, d);
  activitiesSheet(wb, d);
  inventorySheet(wb, d);
  eventsSheet(wb, d, comparison);
  const buffer = wb.toBuffer();
  recordAudit({ action: 'DATA_EXPORTED', entity: 'events', entityId: d.event.id, userId: R.actorId(actor),
    detail: { format: 'xlsx', report: 'dashboard', sheets: wb.sheets.length, count: d.letters.total }, ip }, db);
  const slug = d.event.code_prefix.toLowerCase();
  return { buffer, filename: `reporte-${slug}-${d.today}.xlsx`, sheets: wb.sheets.map((s) => s.name), data: d };
}

module.exports = { exportDashboard, SHEETS };
