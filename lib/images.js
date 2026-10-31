/**
 * Imágenes subidas (fotos de cartas, ADR-0011) sin dependencias nativas:
 *
 *   detectImageType(buffer)  → 'jpeg' | 'png' | 'webp' | null   (por los bytes, nunca por el nombre)
 *   stripMetadata(buffer, type) → Buffer sin EXIF/XMP (ubicación, cámara, fecha)
 *
 * El navegador ya redimensiona y recodifica a JPEG (eso elimina los metadatos); esto es una segunda
 * barrera para fotos que lleguen por otra vía.
 */
const MIME = Object.freeze({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
const EXTENSION = Object.freeze({ jpeg: 'jpg', png: 'png', webp: 'webp' });

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** JPEG: quita los segmentos APP1 (EXIF y XMP) y APP13 (IPTC). Si la estructura es rara, la deja igual. */
function stripJpeg(buf) {
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf; // estructura inesperada: no tocar
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; } // relleno
    if (marker === 0xda) { parts.push(buf.subarray(i)); return Buffer.concat(parts); } // inicio de datos de imagen
    if (marker === 0xd9) { parts.push(buf.subarray(i)); return Buffer.concat(parts); }
    if (marker >= 0xd0 && marker <= 0xd7) { parts.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return buf;
    if (marker !== 0xe1 && marker !== 0xed) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return buf;
}

/** PNG: quita los fragmentos eXIf y de texto (tEXt, iTXt, zTXt). */
function stripPng(buf) {
  const parts = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) return buf;
    if (!['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(type)) parts.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}

/** WebP: quita los fragmentos EXIF y XMP, apaga sus banderas en VP8X y corrige el tamaño RIFF. */
function stripWebp(buf) {
  const parts = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.toString('ascii', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > buf.length) return buf;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~0x0c; // bits de EXIF (0x08) y XMP (0x04)
      parts.push(chunk);
    }
    i = end;
  }
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}

function stripMetadata(buf, type) {
  try {
    if (type === 'jpeg') return stripJpeg(buf);
    if (type === 'png') return stripPng(buf);
    if (type === 'webp') return stripWebp(buf);
  } catch { /* imagen dañada: se guarda tal cual (ya pasó la validación de tipo) */ }
  return buf;
}

module.exports = { MIME, EXTENSION, detectImageType, stripMetadata };
