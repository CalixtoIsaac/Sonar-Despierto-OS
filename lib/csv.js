/**
 * CSV para Excel en español (México): UTF-8 con BOM, separador coma y fin de línea CRLF.
 * Protege contra "inyección de fórmulas": un valor que empieza con = + - @ (o tabulador) se antepone con '.
 */
const BOM = '﻿';

function cell(value) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** columns: [{ header, value: (row) => … }] */
function toCsv(columns, rows) {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv, cell };
