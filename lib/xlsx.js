/**
 * Libro de Excel (.xlsx, Office Open XML) sin dependencias (ADR-0014). Genera hojas con títulos, tablas
 * con encabezado, anchos de columna, primera fila de la tabla fija y autofiltro. Solo escribe valores:
 * nunca fórmulas, así que un texto que empieza con "=" se queda como texto (sin inyección de fórmulas).
 *
 *   const wb = new Workbook({ title: 'Reporte Navidad 2026' });
 *   wb.addSheet('Resumen', [
 *     { title: 'Reporte de Navidad 2026', note: 'Generado el 5 de noviembre de 2026' },
 *     { columns: [{ header: 'Indicador', width: 40 }, { header: 'Valor', type: 'int' }], rows: [['Cartas', 420]] }
 *   ]);
 *   const buffer = wb.toBuffer();
 *
 * Tipos de columna: 'text' (por defecto), 'int' (#,##0), 'dec' (#,##0.0), 'pct' (valor 0–100 → se guarda como fracción con 0.0 %),
 * Una celda puede ser { value, type } para cambiar el tipo solo en ella. 'date' (texto AAAA-MM-DD; se escribe como texto para que no cambie con la zona horaria de la PC).
 */
const zlib = require('zlib');

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---------- ZIP (método deflate) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** files: [{ name, data: string | Buffer }] → Buffer .zip */
function zip(files, date = new Date()) {
  const { time, day } = dosDateTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const data = zlib.deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);         // versión necesaria
    local.writeUInt16LE(0x0800, 6);     // nombres en UTF-8
    local.writeUInt16LE(8, 8);          // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ---------- XML ----------
// Quita caracteres de control que XML 1.0 no admite (Excel marcaría el archivo como dañado)
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
function xmlEscape(value) {
  return String(value).replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colName(index) { // 0 → A, 25 → Z, 26 → AA
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Índices de estilo (cellXfs de styles.xml)
const STYLE = { text: 0, header: 1, int: 2, pct: 3, title: 4, note: 5, date: 0, subtitle: 6, dec: 7 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="#,##0.0"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><color rgb="FFB4322A"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF6B625C"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="12"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE0533F"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFE5DED8"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Nombre de hoja válido para Excel: ≤ 31 caracteres, sin []:*?/\ y único. */
function sheetName(name, used) {
  let base = String(name || 'Hoja').replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Hoja';
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

class Workbook {
  constructor({ title = '', author = 'Soñar Despierto' } = {}) {
    this.title = title;
    this.author = author;
    this.sheets = [];
    this.strings = [];
    this.stringIndex = new Map();
    this.usedNames = new Set();
  }

  sharedString(text) {
    const s = String(text);
    let i = this.stringIndex.get(s);
    if (i === undefined) {
      i = this.strings.length;
      this.strings.push(s);
      this.stringIndex.set(s, i);
    }
    return i;
  }

  cell(ref, value, type, styleOverride) {
    if (value && typeof value === 'object' && 'value' in value) { type = value.type || type; value = value.value; } // { value, type } cambia el tipo de una celda
    if (value === null || value === undefined || value === '') {
      return styleOverride !== undefined ? `<c r="${ref}" s="${styleOverride}"/>` : '';
    }
    if (type === 'int' || type === 'pct' || type === 'dec') {
      const n = Number(value);
      if (Number.isFinite(n)) {
        const v = type === 'pct' ? Number((n / 100).toFixed(6)) : n;
        return `<c r="${ref}" s="${styleOverride ?? STYLE[type]}"><v>${v}</v></c>`;
      }
    }
    const text = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value;
    return `<c r="${ref}" s="${styleOverride ?? STYLE.text}" t="s"><v>${this.sharedString(text)}</v></c>`;
  }

  /**
   * blocks: [{ title?, note? } | { heading?, columns: [{ header, width?, type? }], rows: [[...]] }]
   * Los bloques se apilan con una fila en blanco entre tablas. La primera tabla de la hoja queda con
   * su encabezado fijo y autofiltro.
   */
  addSheet(name, blocks) {
    const rowsXml = [];
    const widths = [];
    let r = 0;
    let freezeRow = null;
    let filter = null;
    const pushRow = (cells, { height } = {}) => {
      r += 1;
      const content = cells.map(([c, value, type, style]) => this.cell(`${colName(c)}${r}`, value, type, style)).join('');
      rowsXml.push(`<row r="${r}"${height ? ` ht="${height}" customHeight="1"` : ''}>${content}</row>`);
    };
    for (const block of blocks) {
      if (block.columns) {
        if (r > 0) r += 1; // fila en blanco antes de cada tabla
        if (block.heading) pushRow([[0, block.heading, 'text', STYLE.subtitle]], { height: 20 });
        block.columns.forEach((col, i) => {
          const w = col.width || Math.min(Math.max(String(col.header).length + 4, 10), 50);
          widths[i] = Math.max(widths[i] || 0, w);
        });
        pushRow(block.columns.map((col, i) => [i, col.header, 'text', STYLE.header]), { height: 20 });
        const headerRow = r;
        for (const row of block.rows) {
          pushRow(block.columns.map((col, i) => [i, row[i], col.type || 'text']));
        }
        if (!filter) {
          freezeRow = headerRow;
          filter = `A${headerRow}:${colName(block.columns.length - 1)}${Math.max(r, headerRow)}`;
        }
      } else {
        if (block.title) pushRow([[0, block.title, 'text', STYLE.title]], { height: 24 });
        if (block.note) pushRow([[0, block.note, 'text', STYLE.note]]);
      }
    }
    // Solo se congela si la tabla empieza cerca del inicio (si no, la vista quedaría partida)
    const pane = freezeRow && freezeRow <= 6
      ? `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/>` : '';
    const cols = widths.length
      ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"${this.sheets.length === 0 ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rowsXml.join('')}</sheetData>${filter ? `<autoFilter ref="${filter}"/>` : ''}
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
    const finalName = sheetName(name, this.usedNames);
    this.sheets.push({ name: finalName, xml, filter });
    return finalName;
  }

  toBuffer(date = new Date()) {
    if (!this.sheets.length) this.addSheet('Hoja 1', [{ title: this.title || 'Sin datos' }]);
    const n = this.sheets.length;
    const definedNames = this.sheets
      .map((s, i) => (s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${s.name.replace(/'/g, "''")}'!${s.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : ''))
      .join('');
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${this.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEscape(this.title)}</dc:title><dc:creator>${xmlEscape(this.author)}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${date.toISOString().replace(/\.\d{3}Z$/, 'Z')}</dcterms:created>
</cp:coreProperties>` },
      { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Soñar Despierto</Application></Properties>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${this.sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
${definedNames ? `<definedNames>${definedNames}</definedNames>` : ''}
</workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${this.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>` },
      { name: 'xl/styles.xml', data: STYLES_XML },
      ...this.sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml })),
      { name: 'xl/sharedStrings.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.strings.length}" uniqueCount="${this.strings.length}">${this.strings.map((s) => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`).join('')}</sst>` }
    ];
    return zip(files, date);
  }
}

module.exports = { Workbook, MIME, zip, crc32, colName, xmlEscape };
