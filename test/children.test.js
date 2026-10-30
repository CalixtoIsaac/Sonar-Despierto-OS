const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { todayLocal } = require('../lib/text');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

async function setup() {
  const s = await h.operatorSession(['BENEFICIARIOS']);
  const school = (await api('POST', '/api/schools', s.token, h.schoolPayload())).body.school;
  const tutor = (await api('POST', '/api/tutors', s.token, h.tutorPayload({ school_id: school.id }))).body.tutor;
  return { ...s, school, tutor };
}

test('alta con escuela, tutor y consentimiento; detalle completo; la bitácora no guarda datos del menor', async () => {
  const { token, school, tutor } = await setup();
  const r = await api('POST', '/api/children', token, h.childPayload({ first_name: 'Sofía', last_name: 'Cruz Pérez', school_id: school.id, tutor_id: tutor.id }));
  assert.equal(r.status, 201);
  const c = r.body.child;
  assert.equal(c.full_name, 'Sofía Cruz Pérez');
  assert.deepEqual(c.school, { id: school.id, name: school.name, zone: 'Centro' });
  assert.equal(c.tutor.id, tutor.id);
  assert.equal(c.guardian_consent, true);
  assert.ok(c.guardian_consent_at);
  assert.equal(c.gender, 'NINA');
  assert.deepEqual(c.letters, []);
  assert.equal((await api('GET', `/api/schools/${school.id}`, token)).body.school.children_count, 1);
  assert.equal((await api('GET', `/api/tutors/${tutor.id}`, token)).body.tutor.children_count, 1);
  const audit = JSON.stringify(h.auditRows().filter((x) => x.entity === 'children'));
  assert.doesNotMatch(audit, /Sofía|Cruz|cacahuate|Rosa/);
});

test('edad: 0 a 17 años; fecha futura o inválida → 422', async () => {
  const { token } = await setup();
  const [y] = todayLocal().split('-').map(Number);
  const msg = 'La fecha de nacimiento debe corresponder a una niña o niño de 0 a 17 años.';
  for (const birth of [`${y - 18}-01-01`, `${y + 1}-01-01`]) {
    const r = await api('POST', '/api/children', token, h.childPayload({ birth_date: birth }));
    assert.deepEqual(r.body.details, [{ field: 'birth_date', message: msg }], birth);
  }
  assert.equal((await api('POST', '/api/children', token, h.childPayload({ birth_date: '2017-02-30' }))).body.details[0].message,
    'Escribe una fecha válida (AAAA-MM-DD).');
  assert.equal((await api('POST', '/api/children', token, h.childPayload({ birth_date: todayLocal() }))).status, 201, 'recién nacido');
});

test('duplicado: mismo nombre (sin acentos ni mayúsculas) y fecha de nacimiento → 409 DUPLICATE_CHILD con existing_id', async () => {
  const { token, school } = await setup();
  const a = (await api('POST', '/api/children', token, h.childPayload({ first_name: 'José Ángel', last_name: 'Núñez', school_id: school.id }))).body.child;
  const dup = await api('POST', '/api/children', token, h.childPayload({ first_name: 'jose angel', last_name: ' NUNEZ ' }));
  assert.equal(dup.status, 409);
  assert.deepEqual(dup.body, {
    error: 'Ya existe una niña o niño registrado con ese nombre y fecha de nacimiento.', code: 'DUPLICATE_CHILD', existing_id: a.id
  });
  assert.equal((await api('POST', '/api/children', token, h.childPayload({ first_name: 'José Ángel', last_name: 'Núñez', birth_date: '2016-01-01' }))).status, 201);
});

test('consentimiento: al marcarlo se guarda la fecha y al quitarlo se borra; edición audita campos', async () => {
  const { token } = await setup();
  const c = (await api('POST', '/api/children', token, h.childPayload({ guardian_consent: false }))).body.child;
  assert.equal(c.guardian_consent_at, null);
  const on = (await api('PATCH', `/api/children/${c.id}`, token, { guardian_consent: true, grade: '4° primaria' })).body.child;
  assert.ok(on.guardian_consent_at);
  const off = (await api('PATCH', `/api/children/${c.id}`, token, { guardian_consent: false })).body.child;
  assert.equal(off.guardian_consent_at, null);
  const updates = h.auditRows().filter((x) => x.action === 'RECORD_UPDATED').map((x) => x.detail);
  assert.deepEqual(updates, [{ changed: ['grade', 'guardian_consent'] }, { changed: ['guardian_consent'] }]);
});

test('listado: búsqueda sin acentos, filtros por escuela (o sin escuela), tutor, consentimiento y baja', async () => {
  const { token, school, tutor } = await setup();
  const mk = (o) => api('POST', '/api/children', token, h.childPayload(o)).then((r) => r.body.child);
  const a = await mk({ first_name: 'Mía', last_name: 'Ángeles', school_id: school.id, tutor_id: tutor.id });
  await mk({ first_name: 'Leo', last_name: 'Barrios', school_id: school.id, guardian_consent: false });
  await mk({ first_name: 'Ana', last_name: 'Zamora' });
  const q = async (qs) => (await api('GET', `/api/children?${qs}`, token)).body;
  assert.deepEqual((await q('search=mia%20angeles')).items.map((c) => c.id), [a.id]);
  assert.equal((await q(`school_id=${school.id}`)).total, 2);
  assert.equal((await q('school_id=none')).total, 1);
  assert.equal((await q(`tutor_id=${tutor.id}`)).total, 1);
  assert.equal((await q('consent=false')).total, 1);
  assert.deepEqual((await q('order_by=name')).items.map((c) => c.last_name), ['Ángeles', 'Barrios', 'Zamora']);
  await api('PATCH', `/api/children/${a.id}`, token, { is_active: false });
  assert.equal((await q('is_active=true')).total, 2);
  const item = (await q('search=leo')).items[0];
  assert.deepEqual(Object.keys(item).sort(), ['age', 'birth_date', 'first_name', 'full_name', 'gender', 'grade', 'group_name',
    'guardian_consent', 'id', 'is_active', 'last_name', 'school', 'tutor'].sort(), 'el listado no expone teléfonos ni observaciones');
});

test('escuela o tutor inexistentes → 422; 404 con el mensaje del recurso', async () => {
  const { token } = await setup();
  const r = await api('POST', '/api/children', token, h.childPayload({ school_id: 999, tutor_id: 999 }));
  assert.deepEqual(r.body.details, [{ field: 'school_id', message: 'La escuela no existe.' }]);
  const nf = await api('GET', '/api/children/12345', token);
  assert.deepEqual(nf.body, { error: 'No existe una niña o niño con ese identificador.', code: 'NOT_FOUND' });
});
