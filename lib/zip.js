/**
 * ZIP mínimo sin dependencias (lo usan el Excel de la F7 y los respaldos de la F8, ADR-0015).
 *
 *   zip([{ name, data, store? }], fecha)  → Buffer .zip  (deflate; store: true guarda sin comprimir,
 *                                            útil para fotos que ya vienen comprimidas)
 *   unzip(buffer, { maxEntries, maxBytes }) → [{ name, data }]  (valida CRC, rutas y tamaños)
 *
 * Solo ZIP clásico (sin ZIP64): hasta 4 GB y 65 535 archivos, de sobra para la base de datos y las
 * fotos de una organización.
 */
const zlib = require('zlib');

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

const MAX_ZIP32 = 0xffffffff;

/** files: [{ name, data: string | Buffer, store?: boolean }] → Buffer .zip */
function zip(files, date = new Date()) {
  const { time, day } = dosDateTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  if (files.length > 0xffff) throw new Error('Demasiados archivos para un ZIP.');
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const method = f.store ? 0 : 8;
    const data = method === 8 ? zlib.deflateRawSync(raw, { level: 6 }) : raw;
    const crc = crc32(raw);
    if (raw.length > MAX_ZIP32 || offset + data.length > MAX_ZIP32) throw new Error('El archivo es demasiado grande para un ZIP.');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);         // versión necesaria
    local.writeUInt16LE(0x0800, 6);     // nombres en UTF-8
    local.writeUInt16LE(method, 8);
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
    central.writeUInt16LE(method, 10);
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

class ZipError extends Error {}

/** Nombre seguro dentro del ZIP: relativo, con "/", sin "..", sin unidad ni barra inicial. */
function safeEntryName(name) {
  if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false;
  return !name.split('/').some((part) => part === '..');
}

/**
 * Lee un ZIP completo en memoria. Lanza ZipError si está dañado, si una ruta sale de la carpeta
 * (zip slip) o si al descomprimirlo pasaría de maxBytes (bomba de compresión).
 */
function unzip(buf, { maxEntries = 20000, maxBytes = 2 * 1024 ** 3 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError('El archivo no es un ZIP.');
  let end = buf.length - 22;
  const stop = Math.max(0, buf.length - 22 - 0xffff);
  while (end >= stop && buf.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < stop) throw new ZipError('El archivo no es un ZIP.');
  const count = buf.readUInt16LE(end + 10);
  if (count > maxEntries) throw new ZipError('El ZIP tiene demasiados archivos.');
  let p = buf.readUInt32LE(end + 16);
  const out = [];
  let total = 0;
  try {
    for (let i = 0; i < count; i++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('El ZIP está dañado (directorio central).');
      const flags = buf.readUInt16LE(p + 8);
      const method = buf.readUInt16LE(p + 10);
      const crc = buf.readUInt32LE(p + 16);
      const size = buf.readUInt32LE(p + 20);
      const rawSize = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const offset = buf.readUInt32LE(p + 42);
      const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
      p += 46 + nameLen + extraLen + commentLen;
      if (flags & 0x1) throw new ZipError('El ZIP está cifrado.');
      if (name.endsWith('/')) continue; // carpeta
      if (!safeEntryName(name)) throw new ZipError(`Ruta no permitida dentro del ZIP: ${name}`);
      total += rawSize;
      if (total > maxBytes) throw new ZipError('El contenido del ZIP es demasiado grande.');
      if (buf.readUInt32LE(offset) !== 0x04034b50) throw new ZipError('El ZIP está dañado (encabezado local).');
      const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
      const stored = buf.subarray(start, start + size);
      if (stored.length !== size) throw new ZipError('El ZIP está incompleto.');
      let data;
      if (method === 0) data = stored;
      else if (method === 8) data = zlib.inflateRawSync(stored, { maxOutputLength: Math.max(rawSize, 1) });
      else throw new ZipError(`Método de compresión no admitido (${method}).`);
      if (data.length !== rawSize || crc32(data) !== crc) throw new ZipError(`El archivo ${name} del ZIP está dañado.`);
      out.push({ name, data });
    }
  } catch (err) {
    if (err instanceof ZipError) throw err;
    throw new ZipError('El ZIP está dañado.');
  }
  return out;
}

module.exports = { zip, unzip, crc32, ZipError, safeEntryName };
