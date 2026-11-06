/**
 * Lector mínimo de .xlsx para las pruebas (solo lo que escribe lib/xlsx.js): descomprime el ZIP y
 * devuelve { sheets: { [nombre]: filas[][] }, names: [...] } con números como Number y textos como String.
 */
const zlib = require('zlib');

function unzip(buf) {
  const files = {};
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('no es un ZIP');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('directorio central inválido');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(offset + 26);
    const lExtraLen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + size);
    files[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

function colIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(buf) {
  const files = unzip(buf);
  const strings = [...(files['xl/sharedStrings.xml'] || '').matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g)].map((m) => unescape(m[1]));
  const names = [...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => unescape(m[1]));
  const sheets = {};
  names.forEach((name, i) => {
    const xml = files[`xl/worksheets/sheet${i + 1}.xml`];
    const rows = [];
    for (const rm of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cm of rm[2].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = /<v>([\s\S]*?)<\/v>/.exec(cm[3] || '');
        if (!v) continue;
        row[colIndex(cm[1])] = /t="s"/.test(cm[2]) ? strings[Number(v[1])] : Number(v[1]);
      }
      rows[Number(rm[1]) - 1] = row;
    }
    sheets[name] = Array.from(rows, (r) => r || []);
  });
  return { names, sheets, files };
}

/** Busca en una hoja la fila cuya primera celda es `label` y devuelve la fila. */
function findRow(rows, label) {
  return rows.find((r) => r && r[0] === label) || null;
}

module.exports = { readXlsx, unzip, findRow };
