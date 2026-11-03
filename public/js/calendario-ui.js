/**
 * Piezas compartidas del Calendario (Fase 5, ADR-0012): cálculo de rangos y títulos, acomodo de bloques
 * en la vista semanal, chips por tipo, formulario de actividad con aviso de traslape y "mover".
 * Las funciones de fechas son puras (se prueban con node:test). Fechas 'YYYY-MM-DD' y horas 'HH:MM' locales.
 */
const CalendarioUI = (() => {
  const hasUI = typeof UI !== 'undefined';
  const esc = (v) => (hasUI ? UI.escape(v) : String(v ?? ''));
  const icon = (n) => (hasUI ? UI.icon(n) : '');
  const Cat = typeof Catalogos !== 'undefined' ? Catalogos : require('./catalogos');

  // ---------- Fechas (puras) ----------
  const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const VIEWS = ['mes', 'semana', 'agenda'];

  const parts = (d) => d.split('-').map(Number);
  const utc = (d) => new Date(`${d}T12:00:00Z`);
  const fmt = (date) => date.toISOString().slice(0, 10);
  function addDays(d, n) { const x = utc(d); x.setUTCDate(x.getUTCDate() + n); return fmt(x); }
  /** Lunes = 0 … domingo = 6 */
  const weekday = (d) => (utc(d).getUTCDay() + 6) % 7;
  const startOfWeek = (d) => addDays(d, -weekday(d));
  const startOfMonth = (d) => `${d.slice(0, 7)}-01`;
  function endOfMonth(d) { const [y, m] = parts(d); return fmt(new Date(Date.UTC(y, m, 0, 12))); }
  function addMonths(d, n) { const [y, m] = parts(d); return fmt(new Date(Date.UTC(y, m - 1 + n, 1, 12))); }
  const isValidDate = (d) => DATE_RE.test(String(d || '')) && fmt(utc(d)) === d;
  const daysList = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));

  /** Rango que pide cada vista: mes = 6 semanas completas (42 días); semana = lunes a domingo; agenda = el mes. */
  function rangeFor(vista, fecha) {
    if (vista === 'semana') { const from = startOfWeek(fecha); return { from, to: addDays(from, 6), days: daysList(from, 7) }; }
    if (vista === 'agenda') { const from = startOfMonth(fecha); const to = endOfMonth(fecha); return { from, to, days: daysList(from, Number(to.slice(8))) }; }
    const from = startOfWeek(startOfMonth(fecha));
    return { from, to: addDays(from, 41), days: daysList(from, 42) };
  }

  /** Anterior / siguiente: un mes (mes y agenda) o una semana. */
  function shift(vista, fecha, dir) {
    if (vista === 'semana') return addDays(fecha, 7 * dir);
    return addMonths(fecha, dir);
  }

  const dayMonth = (d) => `${parts(d)[2]} ${MONTHS_SHORT[parts(d)[1] - 1]}`;
  function titleFor(vista, fecha) {
    const [y, m] = parts(fecha);
    if (vista !== 'semana') return `${MONTHS[m - 1]} ${y}`;
    const from = startOfWeek(fecha);
    const to = addDays(from, 6);
    const [fy, fm, fd] = parts(from);
    const [ty, tm, td] = parts(to);
    if (fm === tm) return `${fd} – ${td} ${MONTHS_SHORT[tm - 1]} ${ty}`;
    return fy === ty ? `${dayMonth(from)} – ${dayMonth(to)} ${ty}` : `${dayMonth(from)} ${fy} – ${dayMonth(to)} ${ty}`;
  }

  /** "Martes 10 de noviembre" */
  function longDay(d) {
    const names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const [, m, day] = parts(d);
    return `${names[weekday(d)]} ${day} de ${MONTHS[m - 1]}`;
  }

  const toMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const fromMinutes = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const timeRange = (a) => `${a.start_time}–${a.end_time}`;

  function groupByDate(items) {
    const map = {};
    for (const a of items) (map[a.activity_date] = map[a.activity_date] || []).push(a);
    return map;
  }

  /**
   * Acomoda las actividades de un día en carriles para que las que se cruzan queden lado a lado.
   * → [{ item, lane, lanes }] en el mismo orden de entrada.
   */
  function layoutDay(items) {
    const sorted = [...items].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time) || toMinutes(b.end_time) - toMinutes(a.end_time));
    const out = new Map();
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      const laneEnds = [];
      for (const a of cluster) {
        let lane = laneEnds.findIndex((end) => end <= toMinutes(a.start_time));
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = toMinutes(a.end_time);
        out.set(a, { item: a, lane });
      }
      for (const a of cluster) out.get(a).lanes = laneEnds.length;
      cluster = [];
      clusterEnd = -1;
    };
    for (const a of sorted) {
      if (cluster.length && toMinutes(a.start_time) >= clusterEnd) flush();
      cluster.push(a);
      clusterEnd = Math.max(clusterEnd, toMinutes(a.end_time));
    }
    flush();
    return items.map((a) => out.get(a));
  }

  /** Horas visibles de la vista semanal: 7 a 21 h, ampliadas si alguna actividad sale de ahí. */
  function hourBounds(items, { min = 7, max = 21 } = {}) {
    let lo = min;
    let hi = max;
    for (const a of items) {
      lo = Math.min(lo, Math.floor(toMinutes(a.start_time) / 60));
      hi = Math.max(hi, Math.ceil(toMinutes(a.end_time) / 60));
    }
    return { start: lo, end: Math.min(hi, 24) };
  }

  /** Lee y corrige los parámetros de la URL. */
  function readParams(params, today) {
    return {
      vista: VIEWS.includes(params.vista) ? params.vista : 'mes',
      fecha: isValidDate(params.fecha) ? params.fecha : today,
      tipo: Cat.ACTIVITY_TYPES.includes(params.tipo) ? params.tipo : '',
      resp: params.resp === 'me' || /^\d+$/.test(params.resp || '') ? params.resp : '',
      evento: /^\d+$/.test(params.evento || '') ? params.evento : '',
      q: params.q || '',
      canceladas: params.canceladas === '1' ? '1' : ''
    };
  }

  // ---------- Presentación ----------
  const TYPE_META = {
    JUNTA: { icon: 'users', cls: 'cal-type-junta' },
    CAPACITACION: { icon: 'graduationCap', cls: 'cal-type-capacitacion' },
    ACOPIO: { icon: 'gift', cls: 'cal-type-acopio' },
    EVENTO: { icon: 'sparkles', cls: 'cal-type-evento' },
    OTRO: { icon: 'notes', cls: 'cal-type-otro' }
  };
  const typeMeta = (t) => ({ ...(TYPE_META[t] || TYPE_META.OTRO), label: Cat.ACTIVITY_TYPE_LABEL[t] || t });
  const typeChip = (t) => `<span class="badge badge-plain cal-chip ${typeMeta(t).cls}">${icon(typeMeta(t).icon)}${esc(typeMeta(t).label)}</span>`;
  const STATUS_TONE = { PROGRAMADA: 'badge-info', REALIZADA: 'badge-success', CANCELADA: 'badge-danger' };
  const statusBadge = (s) => `<span class="badge ${STATUS_TONE[s] || ''}">${esc(Cat.ACTIVITY_STATUS_LABEL[s] || s)}</span>`;
  const overlapBadge = () => `<span class="badge badge-plain badge-warning" title="El responsable tiene otra actividad a la misma hora">${icon('alert')}Traslape</span>`;

  /** Texto de una lista de conflictos: "Junta de logística (10:00–11:00)". */
  const conflictText = (list) => (list || []).map((c) => `${c.title} (${timeRange(c)})`).join(', ');

  return {
    DAY_NAMES, MONTHS, VIEWS, addDays, weekday, startOfWeek, startOfMonth, endOfMonth, addMonths, isValidDate,
    rangeFor, shift, titleFor, longDay, toMinutes, fromMinutes, timeRange, groupByDate, layoutDay, hourBounds, readParams,
    TYPE_META, typeMeta, typeChip, statusBadge, overlapBadge, conflictText
  };
})();

if (typeof module !== 'undefined') module.exports = CalendarioUI;
