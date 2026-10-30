const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

test('alta con todos los datos; detalle con contacto de emergencia y notas médicas', async () => {
  const { token, user } = await h.operatorSession(['VOLUNTARIOS']);
  const r = await api('POST', '/api/volunteers', token, h.volunteerPayload({ email: 'Luis@Correo.com', phone: '229 111 2233' }));
  assert.equal(r.status, 201);
  const v = r.body.volunteer;
  assert.equal(v.email, 'luis@correo.com');
  assert.equal(v.phone, '2291112233');
  assert.equal(v.medical_notes, 'Alergia a la penicilina');
  assert.ok(v.privacy_consent_at);
  assert.equal(v.created_by.id, user.id);
  assert.equal(typeof v.age, 'number');
  const got = await api('GET', `/api/volunteers/${v.id}`, token);
  assert.equal(got.body.volunteer.emergency_contact_name, 'María Cruz');
  const [audit] = h.auditRows().filter((x) => x.entity === 'volunteers');
  assert.deepEqual([audit.action, audit.entity_id, audit.detail], ['RECORD_CREATED', v.id, null]);
});

test('validaciones: obligatorios, teléfonos, catálogos, edad mínima y aviso de privacidad', async () => {
  const { token } = await h.adminSession();
  const r = await api('POST', '/api/volunteers', token, {
    first_name: '', phone: '123', shirt_size: 'XXXL', area_of_interest: 'NADA', birth_date: '2020-01-01', email: 'x'
  });
  assert.equal(r.status, 422);
  const byField = Object.fromEntries(r.body.details.map((d) => [d.field, d.message]));
  assert.equal(byField.accepts_privacy, 'Confirma que la persona aceptó el aviso de privacidad.');
  assert.equal(byField.first_name, 'Este campo es obligatorio.');
  assert.equal(byField.phone, 'El teléfono debe tener 10 dígitos.');
  assert.equal(byField.shirt_size, 'Elige una talla.');
  assert.equal(byField.area_of_interest, 'Elige un área.');
  assert.equal(byField.birth_date, 'La persona voluntaria debe tener al menos 15 años.');
  assert.equal(byField.email, 'Escribe un correo electrónico válido.');
  assert.equal(byField.emergency_contact_name, 'Este campo es obligatorio.');
});

test('duplicados: mismo correo, o mismo nombre (sin acentos) y teléfono → 409 DUPLICATE_VOLUNTEER', async () => {
  const { token } = await h.adminSession();
  const a = (await api('POST', '/api/volunteers', token, h.volunteerPayload({ first_name: 'José', last_name: 'Pérez', email: 'jose@x.org', phone: '2291234567' }))).body.volunteer;
  const byEmail = await api('POST', '/api/volunteers', token, h.volunteerPayload({ email: 'JOSE@x.org' }));
  assert.equal(byEmail.status, 409);
  assert.deepEqual(byEmail.body, { error: 'Ya existe un voluntario con ese correo.', code: 'DUPLICATE_VOLUNTEER', existing_id: a.id });
  const byName = await api('POST', '/api/volunteers', token, h.volunteerPayload({ first_name: 'jose', last_name: 'PEREZ', phone: '229-123-4567' }));
  assert.equal(byName.status, 409);
  assert.equal(byName.body.error, 'Ya existe un voluntario con ese nombre y teléfono.');
});

test('listado con búsqueda sin acentos, filtros, resumen de tallas y baja lógica', async () => {
  const { token } = await h.adminSession();
  const mk = (o) => api('POST', '/api/volunteers', token, h.volunteerPayload(o)).then((r) => r.body.volunteer);
  const a = await mk({ first_name: 'Ángela', last_name: 'Núñez', shirt_size: 'S', area_of_interest: 'FOTOGRAFIA' });
  await mk({ first_name: 'Pedro', last_name: 'Gómez', shirt_size: 'M' });
  await mk({ first_name: 'Rita', last_name: 'López', shirt_size: 'M' });
  const q = async (qs) => (await api('GET', `/api/volunteers?${qs}`, token)).body;
  assert.deepEqual((await q('search=angela%20nunez')).items.map((v) => v.id), [a.id]);
  assert.equal((await q('shirt_size=M')).total, 2);
  assert.equal((await q('area=FOTOGRAFIA')).total, 1);
  assert.deepEqual((await q('order_by=name')).items.map((v) => v.last_name), ['Gómez', 'López', 'Núñez']);
  const summary = (await api('GET', '/api/volunteers/summary?is_active=true', token)).body;
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.shirt_sizes, { XS: 0, S: 1, M: 2, L: 0, XL: 0, XXL: 0 });
  assert.equal(summary.areas.FOTOGRAFIA, 1);
  await api('PATCH', `/api/volunteers/${a.id}`, token, { is_active: false });
  assert.equal((await q('is_active=true')).total, 2);
  assert.equal((await q('is_active=false')).total, 1);
  assert.equal((await q('order_by=apellido')).items, undefined, 'orden inválido → 422');
  assert.equal(h.auditRows().pop().action, 'RECORD_DEACTIVATED');
});

test('exportación CSV: BOM, filtros, sin notas médicas, protección de fórmulas y registro en bitácora', async () => {
  const { token, user } = await h.operatorSession(['VOLUNTARIOS']);
  await api('POST', '/api/volunteers', token, h.volunteerPayload({ first_name: '=CMD()', last_name: 'Prueba, "A"', shirt_size: 'L' }));
  await api('POST', '/api/volunteers', token, h.volunteerPayload({ shirt_size: 'M' }));
  const r = await api('GET', '/api/volunteers/export?shirt_size=L&search=prueba', token);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="voluntarios-\d{4}-\d{2}-\d{2}\.csv"/);
  // fetch().text() quita el BOM al decodificar: se revisan los bytes crudos
  const raw = Buffer.from(await (await fetch(h.baseUrl() + '/api/volunteers/export?shirt_size=L&search=prueba',
    { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'UTF-8 con BOM para Excel');
  const lines = r.text.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Nombre\(s\),Apellidos,Correo,Teléfono/);
  assert.match(lines[1], /^'=CMD\(\),"Prueba, ""A"""/);
  assert.doesNotMatch(r.text, /penicilina/);
  const last = h.auditRows().pop();
  assert.equal(last.action, 'DATA_EXPORTED');
  assert.equal(last.entity, 'volunteers');
  assert.equal(last.user_id, user.id);
  assert.deepEqual(last.detail, { format: 'csv', count: 1, filters: { search: true, shirt_size: 'L' } });
});
