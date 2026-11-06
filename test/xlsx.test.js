/**
 * lib/xlsx.js: el libro se puede volver a leer, con números como números, porcentajes como fracción,
 * textos que parecen fórmulas guardados como texto y nombres de hoja válidos.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { Workbook, crc32, colName, xmlEscape } = require('../lib/xlsx');
const { readXlsx } = require('./xlsx-reader');

test('crc32 y nombres de columna', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  if (zlib.crc32) assert.equal(crc32(Buffer.from('Soñar Despierto')), zlib.crc32(Buffer.from('Soñar Despierto')));
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(colName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  assert.equal(xmlEscape('a<b & "c"\u0007'), 'a&lt;b &amp; &quot;c&quot;');
});

test('el libro se lee de vuelta con tipos, títulos, encabezados y varias tablas por hoja', () => {
  const wb = new Workbook({ title: 'Reporte de prueba' });
  wb.addSheet('Resumen', [
    { title: 'Reporte · Navidad 2026' }, { note: 'Generado hoy' },
    { columns: [{ header: 'Indicador' }, { header: 'Valor', type: 'int' }, { header: '%', type: 'pct' }],
      rows: [['Cartas', 420, 71.4], ['=SUMA(A1:A2)', { value: 2.25, type: 'dec' }, null], ['Ñandú & <niños>', 2500, 100]] },
    { heading: 'Otra tabla', columns: [{ header: 'Talla' }, { header: 'Playeras', type: 'int' }], rows: [['M', 3]] }
  ]);
  const buf = wb.toBuffer();
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  const { names, sheets, files } = readXlsx(buf);
  assert.deepEqual(names, ['Resumen']);
  const rows = sheets.Resumen;
  assert.equal(rows[0][0], 'Reporte · Navidad 2026');
  assert.equal(rows[1][0], 'Generado hoy');
  assert.deepEqual(rows[3], ['Indicador', 'Valor', '%']);
  assert.deepEqual(rows[4], ['Cartas', 420, 0.714]);
  assert.deepEqual(rows[5].slice(0, 2), ['=SUMA(A1:A2)', 2.25], 'un texto con = se guarda como texto, no como fórmula');
  assert.deepEqual(rows[6], ['Ñandú & <niños>', 2500, 1]);
  assert.equal(rows[8][0], 'Otra tabla');
  assert.deepEqual(rows[10], ['M', 3]);
  const sheetXml = files['xl/worksheets/sheet1.xml'];
  assert.doesNotMatch(sheetXml, /<f>/, 'nunca se escriben fórmulas');
  assert.match(sheetXml, /<c r="B6" s="7"><v>2.25<\/v><\/c>/, 'una celda puede cambiar de tipo');
  assert.match(sheetXml, /<autoFilter ref="A4:C7"\/>/);
  assert.match(sheetXml, /state="frozen"/);
  assert.match(files['xl/workbook.xml'], /_xlnm\._FilterDatabase/);
});

test('nombres de hoja: sin caracteres prohibidos, máximo 31 y sin repetir', () => {
  const wb = new Workbook();
  const a = wb.addSheet('Cartas: [estatus]/escuela*?', [{ title: 'x' }]);
  const b = wb.addSheet('Cartas: [estatus]/escuela*?', [{ title: 'y' }]);
  const c = wb.addSheet('Un nombre de hoja muy largo que pasa de treinta y un caracteres', [{ title: 'z' }]);
  assert.equal(a, 'Cartas estatus escuela');
  assert.equal(b, 'Cartas estatus escuela (2)');
  assert.ok(c.length <= 31);
  assert.deepEqual(readXlsx(wb.toBuffer()).names, [a, b, c]);
});

test('un libro vacío sigue siendo válido', () => {
  const { names } = readXlsx(new Workbook({ title: 'Vacío' }).toBuffer());
  assert.deepEqual(names, ['Hoja 1']);
});
