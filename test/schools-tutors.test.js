const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

test('escuelas: alta, detalle, edición, baja y conteos', async () => {
  const { token } = await h.operatorSession(['BENEFICIARIOS']);
  const r = await api('POST', '/api/schools', token, h.schoolPayload({ name: 'Primaria Benito Juárez', cct: '30epr0001a' }));
  assert.equal(r.status, 201);
  const s = r.body.school;
  assert.equal(s.cct, '30EPR0001A');
  assert.equal(s.children_count, 0);
  assert.equal((await api('GET', `/api/schools/${s.id}`, token)).body.school.name, 'Primaria Benito Juárez');
  const p = await api('PATCH', `/api/schools/${s.id}`, token, { zone: 'Norte', is_active: false });
  assert.equal(p.body.school.zone, 'Norte');
  assert.equal(p.body.school.is_active, false);
  const actions = h.auditRows().filter((x) => x.entity === 'schools').map((x) => [x.action, x.detail]);
  assert.deepEqual(actions, [['RECORD_CREATED', null], ['RECORD_UPDATED', { changed: ['zone'] }], ['RECORD_DEACTIVATED', null]]);
  for (const id of ['999', 'abc']) {
    const nf = await api('GET', `/api/schools/${id}`, token);
    assert.deepEqual(nf.body, { error: 'No existe una escuela con ese identificador.', code: 'NOT_FOUND' });
  }
});

test('escuelas: duplicado por CCT o por nombre+zona (sin acentos ni mayúsculas) → 409 con existing_id', async () => {
  const { token } = await h.adminSession();
  const a = (await api('POST', '/api/schools', token, h.schoolPayload({ name: 'Primaria Benito Juárez', zone: 'Centro', cct: '30EPR0001A' }))).body.school;
  const byCct = await api('POST', '/api/schools', token, h.schoolPayload({ name: 'Otra', cct: '30EPR0001A' }));
  assert.equal(byCct.status, 409);
  assert.deepEqual(byCct.body, { error: 'Ya existe una escuela con esa CCT.', code: 'DUPLICATE_SCHOOL', existing_id: a.id });
  const byName = await api('POST', '/api/schools', token, h.schoolPayload({ name: '  primaria  BENITO juarez ', zone: 'centro' }));
  assert.equal(byName.status, 409);
  assert.equal(byName.body.existing_id, a.id);
  assert.equal((await api('POST', '/api/schools', token, h.schoolPayload({ name: 'Primaria Benito Juárez', zone: 'Norte' }))).status, 201);
  const b = (await api('POST', '/api/schools', token, h.schoolPayload({ name: 'Telesecundaria 5', zone: 'Sur' }))).body.school;
  assert.equal((await api('PATCH', `/api/schools/${b.id}`, token, { cct: '30epr0001a' })).status, 409, 'editar también detecta');
});

test('escuelas: validación y búsqueda', async () => {
  const { token } = await h.adminSession();
  const bad = await api('POST', '/api/schools', token, { name: '', cct: 'ABC', contact_phone: '123', otro: 1 });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.body.details.map((d) => d.field).sort(), ['cct', 'contact_phone', 'name', 'otro']);
  await api('POST', '/api/schools', token, h.schoolPayload({ name: 'Jardín de Niños Ávila Camacho', zone: 'Boca del Río' }));
  await api('POST', '/api/schools', token, h.schoolPayload({ name: 'Primaria Morelos', zone: 'Centro' }));
  const found = await api('GET', '/api/schools?search=avila%20jardin', token);
  assert.deepEqual(found.body.items.map((s) => s.name), ['Jardín de Niños Ávila Camacho']);
  assert.equal((await api('GET', '/api/schools?search=boca', token)).body.total, 1);
});

test('tutores: alta con escuela, duplicado por nombre y teléfono, escuela inexistente o dada de baja', async () => {
  const { token } = await h.adminSession();
  const school = (await api('POST', '/api/schools', token, h.schoolPayload())).body.school;
  const body = h.tutorPayload({ first_name: 'Carmen', last_name: 'Ruíz', phone: '229-555-1234', school_id: school.id });
  const r = await api('POST', '/api/tutors', token, body);
  assert.equal(r.status, 201);
  assert.equal(r.body.tutor.phone, '2295551234');
  assert.deepEqual(r.body.tutor.school, { id: school.id, name: school.name, zone: 'Centro' });
  const dup = await api('POST', '/api/tutors', token, { ...body, first_name: 'carmen', last_name: 'RUIZ' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'DUPLICATE_TUTOR');
  assert.equal(dup.body.existing_id, r.body.tutor.id);
  const missing = await api('POST', '/api/tutors', token, h.tutorPayload({ school_id: 999 }));
  assert.deepEqual(missing.body.details, [{ field: 'school_id', message: 'La escuela no existe.' }]);
  await api('PATCH', `/api/schools/${school.id}`, token, { is_active: false });
  const inactive = await api('POST', '/api/tutors', token, h.tutorPayload({ school_id: school.id }));
  assert.deepEqual(inactive.body.details, [{ field: 'school_id', message: 'La escuela está dada de baja.' }]);
  // El tutor que ya estaba en esa escuela se puede seguir editando
  assert.equal((await api('PATCH', `/api/tutors/${r.body.tutor.id}`, token, { position: 'Directora', school_id: school.id })).status, 200);
  const list = await api('GET', `/api/tutors?school_id=${school.id}`, token);
  assert.equal(list.body.total, 1);
});
