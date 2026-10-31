const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const { detectImageType, stripMetadata } = require('../lib/images');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

/** JPEG mínimo con un segmento EXIF que incluye un texto reconocible. */
function jpegWithExif(marker = 'GPS-19.17N-96.13W') {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const exifBody = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), Buffer.from(marker)]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0, exifBody.length + 2]), exifBody]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0x56, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, sos]);
}

async function upload(token, id, buffer, type = 'image/jpeg') {
  const res = await fetch(`${h.baseUrl()}/api/letters/${id}/photo`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': type }, body: buffer
  });
  return { status: res.status, body: await res.json() };
}

async function setup() {
  const { token } = await h.adminSession();
  const event = await h.openEvent(token);
  const letter = await h.makeLetter(token, { eventId: event.id, childId: (await h.makeChild(token)).id });
  return { token, letter };
}

const photoFiles = () => {
  const dir = path.join(h.dataDir, 'uploads', 'letters');
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

test('lib/images: detecta el tipo por los bytes y quita EXIF de JPEG y PNG', () => {
  const jpg = jpegWithExif();
  assert.equal(detectImageType(jpg), 'jpeg');
  const clean = stripMetadata(jpg, 'jpeg');
  assert.ok(!clean.includes('GPS-19.17N'));
  assert.ok(clean.includes(Buffer.from('JFIF')), 'conserva APP0');
  assert.deepEqual([...clean.subarray(-2)], [0xff, 0xd9]);
  assert.equal(detectImageType(Buffer.from('GIF89a…………………')), null);

  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.alloc(13)),
    chunk('tEXt', Buffer.from('Author\0Ana')), chunk('IDAT', Buffer.alloc(3)), chunk('IEND', Buffer.alloc(0))]);
  assert.equal(detectImageType(png), 'png');
  const cleanPng = stripMetadata(png, 'png');
  assert.ok(!cleanPng.includes('Author'));
  assert.ok(cleanPng.includes(Buffer.from('IDAT')));
});

test('subir, ver, reemplazar y quitar la foto: sin EXIF, fuera de public/, sin caché y en la bitácora', async () => {
  const { token, letter } = await setup();
  const r = await upload(token, letter.id, jpegWithExif());
  assert.equal(r.status, 200);
  assert.equal(r.body.letter.has_photo, true);
  assert.ok(r.body.letter.photo_uploaded_at);
  const [first] = photoFiles();
  assert.match(first, /^[0-9a-f-]{36}\.jpg$/);
  assert.ok(!fs.readFileSync(path.join(h.dataDir, 'uploads', 'letters', first)).includes('GPS-19.17N'));

  const res = await fetch(`${h.baseUrl()}/api/letters/${letter.id}/photo`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${h.baseUrl()}/api/letters/${letter.id}/photo`)).status, 401);
  assert.equal((await fetch(`${h.baseUrl()}/uploads/letters/${first}`)).status, 404, 'no se sirve como archivo público');

  await upload(token, letter.id, jpegWithExif('otra'));
  const files = photoFiles();
  assert.equal(files.length, 1, 'la foto anterior se borra');
  assert.notEqual(files[0], first);

  const del = await api('DELETE', `/api/letters/${letter.id}/photo`, token);
  assert.equal(del.body.letter.has_photo, false);
  assert.deepEqual(photoFiles(), []);
  assert.equal((await api('GET', `/api/letters/${letter.id}/photo`, token)).status, 404);
  assert.deepEqual(h.auditActions().filter((a) => a.startsWith('LETTER_PHOTO')), ['LETTER_PHOTO_UPDATED', 'LETTER_PHOTO_UPDATED', 'LETTER_PHOTO_REMOVED']);
});

test('tipo no permitido → 415; vacío → 415; más de 5 MB → 413 FILE_TOO_LARGE', async () => {
  const { token, letter } = await setup();
  const gif = await upload(token, letter.id, Buffer.from('GIF89a' + 'x'.repeat(50)), 'image/gif');
  assert.equal(gif.status, 415);
  assert.equal(gif.body.code, 'UNSUPPORTED_MEDIA_TYPE');
  const fake = await upload(token, letter.id, Buffer.from('<svg>hola</svg>'.repeat(4)), 'image/jpeg');
  assert.equal(fake.status, 415, 'se valida por los bytes, no por el Content-Type');
  const json = await api('POST', `/api/letters/${letter.id}/photo`, token, { foto: 'x' });
  assert.equal(json.status, 415);
  const big = Buffer.concat([jpegWithExif(), Buffer.alloc(5 * 1024 * 1024 + 10)]);
  const tooBig = await upload(token, letter.id, big);
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.body.code, 'FILE_TOO_LARGE');
  assert.deepEqual(photoFiles(), []);
});
