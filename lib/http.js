/**
 * Utilidades de la capa HTTP compartidas por las rutas de la Fase 3 en adelante.
 */
const { AppError } = require('./errors');
const { parseId } = require('./validation');
const { todayLocal } = require('./text');

/** :id numérico o 404 con el mensaje del recurso. */
function idParam(req, message) {
  const raw = req.params.id;
  if (!/^\d{1,15}$/.test(raw)) throw new AppError(404, 'NOT_FOUND', message);
  return Number(raw);
}

function boolQuery(value, field, c) {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  c.add(field, 'Usa true o false.');
  return undefined;
}

function enumQuery(value, field, values, c) {
  if (value === undefined || value === '') return undefined;
  const v = String(value).toUpperCase();
  if (!values.includes(v)) { c.add(field, 'Valor no válido.'); return undefined; }
  return v;
}

function idQuery(value, field, c, { allowNone = false } = {}) {
  if (value === undefined || value === '') return undefined;
  if (allowNone && value === 'none') return 'none';
  const id = parseId(value);
  if (!id) c.add(field, 'Identificador no válido.');
  return id || undefined;
}

function orderQuery(value, allowed, fallback, c) {
  if (value === undefined || value === '') return fallback;
  if (!allowed.includes(value)) { c.add('order_by', `Orden no válido. Usa: ${allowed.join(', ')}.`); return fallback; }
  return value;
}

const searchQuery = (value) => (typeof value === 'string' ? value.trim().slice(0, 100) : '');

/** Envía un CSV como descarga: <nombre>-AAAA-MM-DD.csv, sin caché. */
function sendCsv(res, csv, baseName) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${baseName}-${todayLocal()}.csv"`,
    'Cache-Control': 'no-store'
  });
  res.send(csv);
}

module.exports = { idParam, boolQuery, enumQuery, idQuery, orderQuery, searchQuery, sendCsv };
