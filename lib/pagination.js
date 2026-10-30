/**
 * Paginación compartida por todos los listados (Fase 2 en adelante).
 *
 *   const pageParams = parsePageParams(req.query);               // ?page=1&page_size=20
 *   paginate(db, { select, from, where, params, orderBy, map }, pageParams)
 *     → { items, total, page, page_size, pages }
 *
 * Búsquedas: lower(col) LIKE @q ESCAPE '\'  con  params.q = likePattern(texto)
 */
const { validationError } = require('./errors');

const MAX_PAGE_SIZE = 100;

function parsePositiveInt(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : NaN;
  const text = String(raw).trim();
  return /^\d+$/.test(text) ? Number(text) : NaN;
}

/** Lee page y page_size de req.query. page ≥ 1; 1 ≤ page_size ≤ 100. */
function parsePageParams(query = {}, { defaultPageSize = 20 } = {}) {
  const details = [];
  let page = 1;
  let pageSize = defaultPageSize;

  if (query.page !== undefined && query.page !== '') {
    page = parsePositiveInt(query.page);
    if (!Number.isInteger(page) || page < 1) {
      details.push({ field: 'page', message: 'La página debe ser un número entero mayor o igual a 1.' });
    }
  }
  if (query.page_size !== undefined && query.page_size !== '') {
    pageSize = parsePositiveInt(query.page_size);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      details.push({ field: 'page_size', message: `El tamaño de página debe estar entre 1 y ${MAX_PAGE_SIZE}.` });
    }
  }
  if (details.length) throw validationError(details);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Ejecuta el conteo y la página pedida. `where` usa parámetros con nombre (@x). */
function paginate(db, { select, from, where = '', params = {}, orderBy, map = (r) => r }, { page, pageSize, offset }) {
  const whereSql = where ? ` WHERE ${where}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${from}${whereSql}`).get(params).n;
  const pages = total === 0 ? 0 : Math.ceil(total / pageSize);
  let items = [];
  if (offset < total) {
    const rows = db.prepare(
      `SELECT ${select} FROM ${from}${whereSql} ORDER BY ${orderBy} LIMIT @__limit OFFSET @__offset`
    ).all({ ...params, __limit: pageSize, __offset: offset });
    items = rows.map(map);
  }
  return { items, total, page, page_size: pageSize, pages };
}

/** '%texto%' en minúsculas, escapando \, % y _ (usar con: lower(col) LIKE @q ESCAPE '\'). */
function likePattern(text) {
  const escaped = String(text ?? '').trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

module.exports = { MAX_PAGE_SIZE, parsePageParams, paginate, likePattern };
