/**
 * Piezas visuales del dashboard (Fase 7): gráficas hechas con HTML y CSS (sin bibliotecas), que se adaptan
 * a 360 px y a los temas claro y oscuro con los tokens de theme.css. Cada gráfica lleva su texto: el color
 * nunca es la única señal y un lector de pantalla lee las cifras.
 *
 *   ReportesUI.statusBar(byStatus, total)      → barra segmentada de cartas por estatus + leyenda
 *   ReportesUI.ring(pct, label, value, tone)    → indicador con anillo de porcentaje
 *   ReportesUI.weeklyColumns(points)            → columnas apiladas del avance semanal
 *   ReportesUI.stackedRows(rows)                → barras horizontales apiladas (por escuela)
 *   ReportesUI.barList(entries, { max })        → barras horizontales simples (por área, por tipo…)
 *   ReportesUI.pctText(pct) · ReportesUI.weekLabel(point)
 *
 * Funciones puras: se exportan para las pruebas con node:test.
 */
const ReportesUI = (() => {
  const hasUI = typeof UI !== 'undefined';
  const esc = (v) => (hasUI ? UI.escape(v) : String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const Cat = typeof Catalogos !== 'undefined' ? Catalogos : require('./catalogos');

  const STATUS_TONE = { PENDIENTE: 'pendiente', ASIGNADO: 'asignado', RECIBIDO: 'recibido', ENTREGADO: 'entregado' };
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const nf = new Intl.NumberFormat('es-MX');

  const num = (n) => nf.format(Number(n) || 0);
  /** 71.4 → "71.4 %", null → "—" */
  const pctText = (p) => (p === null || p === undefined ? '—' : `${String(p).replace(/\.0$/, '')} %`);
  const share = (part, total) => (total > 0 ? (part / total) * 100 : 0);
  /** "2026-11-02" → "2 nov" */
  const shortDate = (ymd) => { const [, m, d] = String(ymd).split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
  const weekLabel = (p) => `${shortDate(p.week_start)} – ${shortDate(p.week_end)}`;

  function legend(byStatus, total) {
    return `<ul class="rep-legend">${Cat.LETTER_STATUSES.map((s) => `<li><span class="rep-swatch rep-${STATUS_TONE[s]}" aria-hidden="true"></span>
      ${esc(Cat.LETTER_STATUS_LABEL[s])} <strong>${num(byStatus[s])}</strong>${total ? ` <span class="muted">(${pctText(Math.round(share(byStatus[s], total) * 10) / 10)})</span>` : ''}</li>`).join('')}</ul>`;
  }

  function statusBar(byStatus, total) {
    if (!total) return '<p class="muted">Aún no hay cartas registradas en este evento.</p>';
    const segs = Cat.LETTER_STATUSES.filter((s) => byStatus[s] > 0).map((s) => `<span class="rep-seg rep-${STATUS_TONE[s]}"
      style="width:${share(byStatus[s], total).toFixed(3)}%" title="${esc(Cat.LETTER_STATUS_LABEL[s])}: ${num(byStatus[s])}"></span>`).join('');
    const label = Cat.LETTER_STATUSES.map((s) => `${Cat.LETTER_STATUS_LABEL[s]}: ${byStatus[s]}`).join(', ');
    return `<div class="rep-bar rep-bar-lg" role="img" aria-label="Cartas por estatus. ${esc(label)}.">${segs}</div>${legend(byStatus, total)}`;
  }

  /** Anillo de porcentaje (conic-gradient). tone: asignado | recibido | entregado | primary */
  function ring(p, label, value, tone = 'primary', hint = '') {
    const deg = p === null || p === undefined ? 0 : Math.max(0, Math.min(100, p)) * 3.6;
    return `<div class="rep-kpi rep-kpi-ring">
      <span class="rep-ring rep-ring-${tone}" style="--deg:${deg.toFixed(1)}deg" aria-hidden="true"><span>${pctText(p)}</span></span>
      <span class="rep-kpi-text"><span class="stat-value">${num(value)}</span><span class="stat-label">${esc(label)}</span>
        <span class="sr-only">${pctText(p)} del total</span>${hint ? `<span class="rep-hint">${esc(hint)}</span>` : ''}</span></div>`;
  }

  /** Indicador simple; con href se vuelve enlace. */
  function kpi(label, value, { href, iconName, tone = '', hint = '' } = {}) {
    const ic = iconName && hasUI ? UI.icon(iconName) : '';
    const inner = `<span class="stat-value">${num(value)}</span><span class="stat-label">${ic}${esc(label)}</span>${hint ? `<span class="rep-hint">${esc(hint)}</span>` : ''}`;
    return href ? `<a class="stat-card rep-kpi ${tone}" href="${href}">${inner}</a>` : `<div class="stat-card rep-kpi ${tone}">${inner}</div>`;
  }

  /** Columnas apiladas por semana (estatus al cierre de cada semana). */
  function weeklyColumns(points) {
    if (!points || !points.length) return '<p class="muted">El avance aparece cuando se registran cartas.</p>';
    const max = Math.max(...points.map((p) => p.total), 1);
    const cols = points.map((p) => {
      const parts = Cat.LETTER_STATUSES.map((s) => `${Cat.LETTER_STATUS_LABEL[s]} ${p.by_status[s]}`).join(', ');
      // Se apila de abajo hacia arriba: entregado, recibido, con padrino, pendiente
      const segs = [...Cat.LETTER_STATUSES].reverse().filter((s) => p.by_status[s] > 0)
        .map((s) => `<span class="rep-seg rep-${STATUS_TONE[s]}" style="height:${share(p.by_status[s], p.total).toFixed(3)}%"></span>`).join('');
      return `<li class="rep-col" title="Semana del ${esc(weekLabel(p))}: ${esc(parts)}">
        <span class="rep-col-value">${num(p.total)}</span>
        <span class="rep-col-track"><span class="rep-col-bar" style="height:${share(p.total, max).toFixed(3)}%">${segs}</span></span>
        <span class="rep-col-label">${esc(shortDate(p.week_start))}</span>
        <span class="sr-only">Semana del ${esc(weekLabel(p))}: ${esc(parts)}.</span></li>`;
    }).join('');
    return `<ol class="rep-columns" aria-label="Cartas al cierre de cada semana">${cols}</ol>`;
  }

  /** Barras horizontales apiladas por estatus. rows: [{ name, total, by_status, extra? }] */
  function stackedRows(rows) {
    if (!rows || !rows.length) return '<p class="muted">Sin datos.</p>';
    const max = Math.max(...rows.map((r) => r.total), 1);
    return `<ul class="rep-rows">${rows.map((r) => {
      const segs = Cat.LETTER_STATUSES.filter((s) => r.by_status[s] > 0).map((s) => `<span class="rep-seg rep-${STATUS_TONE[s]}"
        style="width:${share(r.by_status[s], r.total).toFixed(3)}%"></span>`).join('');
      const parts = Cat.LETTER_STATUSES.map((s) => `${Cat.LETTER_STATUS_LABEL[s]} ${r.by_status[s]}`).join(', ');
      return `<li class="rep-row">
        <span class="rep-row-head"><span class="rep-row-name">${esc(r.name)}</span>
          <span class="rep-row-value"><strong>${num(r.total)}</strong>${r.extra ? ` <span class="muted">· ${esc(r.extra)}</span>` : ''}</span></span>
        <span class="rep-track" title="${esc(parts)}"><span class="rep-bar" style="width:${share(r.total, max).toFixed(3)}%">${segs}</span></span>
        <span class="sr-only">${esc(parts)}.</span></li>`;
    }).join('')}</ul>`;
  }

  /** entries: [[etiqueta, valor]]; las de valor 0 se ocultan salvo { showZero: true }. */
  function barList(entries, { showZero = false, tone = 'primary', unit = '' } = {}) {
    const list = entries.filter(([, v]) => showZero || v > 0);
    if (!list.length) return '<p class="muted">Sin datos.</p>';
    const max = Math.max(...list.map(([, v]) => v), 1);
    return `<ul class="rep-rows">${list.map(([label, v]) => `<li class="rep-row">
      <span class="rep-row-head"><span class="rep-row-name">${esc(label)}</span><span class="rep-row-value"><strong>${num(v)}</strong>${unit ? ` ${esc(unit)}` : ''}</span></span>
      <span class="rep-track" aria-hidden="true"><span class="rep-bar rep-fill-${tone}" style="width:${share(v, max).toFixed(3)}%"></span></span></li>`).join('')}</ul>`;
  }

  return { STATUS_TONE, num, pctText, share, shortDate, weekLabel, statusBar, legend, ring, kpi, weeklyColumns, stackedRows, barList };
})();

if (typeof module !== 'undefined') module.exports = ReportesUI; // para las pruebas con node:test
