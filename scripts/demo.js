/**
 * Datos de demostración (Fase 8). Todos son FICTICIOS y viven en su propia carpeta y puerto, así que
 * nunca se mezclan con los datos reales:
 *
 *   npm run demo            → abre el sistema con datos de demostración (crea la carpeta la primera vez)
 *   npm run demo -- --reiniciar   → borra la carpeta de demostración y la vuelve a llenar
 *   node server.js --demo   → lo mismo (el instalador crea el acceso "Soñar Despierto (demostración)")
 *
 * Carpeta: %LOCALAPPDATA%\SonarDespierto-Demo (paquete) o <repo>\.data-demo (código fuente). Puerto 8775.
 * Se llena por la API (con sus validaciones y su bitácora), como lo haría una persona.
 * Cuentas (contraseña Demo2026 en todas): ver DEMO_USERS.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEMO_PORT = 8775;
const DEMO_PASSWORD = 'Demo2026';
const DEMO_ADMIN = 'admin@demo.sonardespierto.org';
const DEMO_USERS = Object.freeze([
  { email: 'laura@demo.sonardespierto.org', first: 'Laura', last: 'Méndez (demo)', modules: ['REPORTES'], what: 'solo Reportes' },
  { email: 'carlos@demo.sonardespierto.org', first: 'Carlos', last: 'Ruiz (demo)', modules: ['EVENTOS', 'CARTAS'], what: 'Eventos y Cartas' },
  { email: 'maria@demo.sonardespierto.org', first: 'María', last: 'Torres (demo)', modules: ['VOLUNTARIOS', 'BENEFICIARIOS'], what: 'Personas' },
  { email: 'pedro@demo.sonardespierto.org', first: 'Pedro', last: 'Lara (demo)', modules: ['CALENDARIO', 'INVENTARIO'], what: 'Calendario e Inventario' }
]);
const READY_MARK = 'DEMOSTRACION.txt';

function demoDataDir(env = process.env) {
  const root = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(root, 'PORTABLE'))) {
    const base = env.LOCALAPPDATA || (process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local') : path.join(os.homedir(), '.local', 'share'));
    return path.join(base, 'SonarDespierto-Demo');
  }
  return path.join(root, '.data-demo');
}

// Generador pseudoaleatorio con semilla: la demostración sale igual cada vez
function rng(seed = 2026) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const FIRST_GIRLS = ['Sofía', 'Valentina', 'Regina', 'Ximena', 'Camila', 'Renata', 'Natalia', 'Mariana', 'Fernanda', 'Itzel', 'Daniela', 'Paola', 'Abril', 'Jimena', 'Luciana'];
const FIRST_BOYS = ['Santiago', 'Mateo', 'Diego', 'Emiliano', 'Leonardo', 'Sebastián', 'Iker', 'Ángel', 'Gael', 'Tadeo', 'Alexander', 'Joaquín', 'Rodrigo', 'Bruno', 'Axel'];
const LAST = ['Hernández', 'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Morales', 'Jiménez', 'Reyes', 'Vázquez', 'Domínguez', 'Aguilar', 'Castillo', 'Romero'];
const WISHES = ['Bicicleta', 'Muñeca', 'Balón de fútbol', 'Juego de mesa', 'Patines', 'Set de pinturas', 'Carrito de control remoto', 'Mochila', 'Libro de cuentos', 'Peluche', 'Rompecabezas', 'Tenis', 'Lego', 'Guitarra de juguete'];

async function seed(baseUrl, log = console.log) {
  const users = require('../services/users');
  const { getDb } = require('../lib/db');
  const { hashPasswordSync } = require('../lib/security');
  const random = rng();
  const pick = (list) => list[Math.floor(random() * list.length)];

  // ---------- Cuentas ----------
  const db = getDb();
  const admin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1").get();
  db.prepare(`UPDATE users SET email = ?, first_name = 'Ana', last_name = 'Administradora (demo)', password_hash = ?,
    must_change_password = 0, updated_at = ? WHERE id = ?`).run(DEMO_ADMIN, hashPasswordSync(DEMO_PASSWORD), new Date().toISOString(), admin.id);
  try { fs.unlinkSync(users.credentialsPath()); } catch { /* no había */ }
  for (const u of DEMO_USERS) {
    users.createUser({ email: u.email, password: DEMO_PASSWORD, firstName: u.first, lastName: u.last, role: 'OPERADOR',
      modules: u.modules, mustChangePassword: false });
  }

  const call = async (method, url, token, body) => {
    const res = await fetch(baseUrl + url, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${data && data.error}`);
    return data;
  };
  const token = (await call('POST', '/api/auth/login', null, { email: DEMO_ADMIN, password: DEMO_PASSWORD })).token;
  const post = (url, body) => call('POST', url, token, body);

  // Una solicitud de cuenta pendiente (para mostrar la aprobación)
  await call('POST', '/api/auth/register', null, {
    first_name: 'Jorge', last_name: 'Solicitante (demo)', email: 'jorge@demo.sonardespierto.org', phone: '2291002003',
    password: DEMO_PASSWORD, requested_modules: ['CARTAS', 'CALENDARIO'], note: 'Ayudo con el acopio de la zona norte.',
    accepts_confidentiality: true
  });

  // ---------- Escuelas y tutores ----------
  const schoolNames = [['Primaria Benito Juárez', 'Centro'], ['Primaria Miguel Hidalgo', 'Norte'], ['Escuela Rural Emiliano Zapata', 'Rural'],
    ['Primaria Sor Juana Inés de la Cruz', 'Sur'], ['Comunidad La Esperanza', 'Conurbada']];
  const schools = [];
  for (const [name, zone] of schoolNames) {
    schools.push((await post('/api/schools', { name, zone, address: 'Dirección de ejemplo s/n', contact_name: 'Dirección escolar', contact_phone: '2290000000' })).school);
  }
  const tutors = [];
  for (let i = 0; i < 4; i++) {
    tutors.push((await post('/api/tutors', { first_name: pick(['Rosa', 'Carmen', 'Juan', 'Elena', 'Marco']), last_name: `${pick(LAST)} (demo)`,
      phone: `22920000${10 + i}`, position: pick(['Profesora de 3°', 'Director', 'Líder comunitario', 'Profesor de 5°']), school_id: schools[i].id })).tutor);
  }

  // ---------- Niñas y niños ----------
  const children = [];
  for (let i = 0; i < 40; i++) {
    const girl = i % 2 === 0;
    const year = 2014 + Math.floor(random() * 7);
    const child = (await post('/api/children', {
      first_name: girl ? FIRST_GIRLS[i % FIRST_GIRLS.length] : FIRST_BOYS[i % FIRST_BOYS.length],
      last_name: `${pick(LAST)} ${pick(LAST)}`,
      birth_date: `${year}-${String(1 + Math.floor(random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`,
      gender: girl ? 'NINA' : 'NINO', grade: `${1 + Math.floor(random() * 6)}° primaria`, group_name: pick(['A', 'B', 'C']),
      school_id: schools[i % schools.length].id, tutor_id: i % 3 === 0 ? tutors[i % tutors.length].id : null,
      guardian_name: `${pick(['Rosa', 'María', 'Guadalupe', 'José', 'Juana', 'Luis'])} ${pick(LAST)}`, guardian_relationship: pick(['Madre', 'Padre', 'Abuela', 'Tía']),
      guardian_phone: `2293${String(100000 + i).slice(-6)}`, guardian_consent: i % 9 !== 4, notes: null
    })).child;
    children.push(child);
  }

  // ---------- Voluntarios ----------
  const areas = ['PADRINO', 'PADRINO', 'PADRINO', 'LOGISTICA', 'GUIA_NINOS', 'ACOPIO_REGALOS', 'REGISTRO', 'ALIMENTOS', 'FOTOGRAFIA'];
  const volunteers = [];
  for (let i = 0; i < 18; i++) {
    volunteers.push((await post('/api/volunteers', {
      first_name: pick([...FIRST_GIRLS, ...FIRST_BOYS]), last_name: `${pick(LAST)} (demo)`, email: null, phone: `2294${String(200000 + i).slice(-6)}`,
      birth_date: `${1975 + Math.floor(random() * 30)}-0${1 + Math.floor(random() * 9)}-1${Math.floor(random() * 9)}`, city: 'Veracruz',
      occupation: pick(['Estudiante', 'Contadora', 'Ingeniero', 'Maestra', 'Comerciante']), emergency_contact_name: `${pick(FIRST_GIRLS)} ${pick(LAST)}`,
      emergency_contact_phone: '2297776655', emergency_contact_relationship: pick(['Madre', 'Pareja', 'Hermano']),
      shirt_size: pick(['S', 'M', 'M', 'L', 'XL']), area_of_interest: areas[i % areas.length], medical_notes: null, accepts_privacy: true
    })).volunteer);
  }
  const sponsors = volunteers; // cualquier voluntario puede ser padrino (máximo 3 cartas por evento)

  // ---------- Eventos ----------
  const year = new Date().getFullYear();
  const yy = String(year).slice(-2);
  const pastYy = String(year - 1).slice(-2);
  const makeEvent = async (body, status) => {
    const ev = (await post('/api/events', body)).event;
    const steps = ['ABIERTO', 'EN_CURSO', 'CERRADO'];
    for (const s of steps.slice(0, steps.indexOf(status) + 1)) await post(`/api/events/${ev.id}/status`, { to_status: s });
    return ev;
  };
  const navidadPasada = await makeEvent({ name: `Navidad ${year - 1}`, event_type: 'NAVIDAD', code_prefix: `NAV${pastYy}`, event_date: `${year - 1}-12-19`,
    location: 'Explanada del puerto', max_letters_per_sponsor: 3, description: 'Entrega de regalos del año pasado (demostración).' }, 'ABIERTO');
  const navidad = await makeEvent({ name: `Navidad ${year}`, event_type: 'NAVIDAD', code_prefix: `NAV${yy}`, event_date: `${year}-12-20`,
    location: 'Explanada del puerto', max_letters_per_sponsor: 3, description: 'Entrega de regalos (demostración).' }, 'ABIERTO');
  const diaNino = await makeEvent({ name: `Día del Niño ${year}`, event_type: 'DIA_DEL_NINO', code_prefix: `DN${yy}`, event_date: `${year}-04-30`,
    location: 'Parque Zamora', max_letters_per_sponsor: 3, description: 'Festival con juegos y comida (demostración).' }, 'CERRADO');

  const addVolunteers = async (ev, list, status) => post(`/api/events/${ev.id}/volunteers`, { volunteer_ids: list.map((v) => v.id), status });
  await addVolunteers(navidad, volunteers.slice(0, 13), 'CONFIRMADO');
  await addVolunteers(navidad, volunteers.slice(13, 16), 'POSTULADO');
  await addVolunteers(navidadPasada, volunteers.slice(0, 10), 'CONFIRMADO');

  // ---------- Cartas ----------
  const withConsent = children.filter((c) => c.guardian_consent);
  const lettersFor = async (ev, kids, plan) => {
    let s = 0;
    for (let i = 0; i < kids.length; i++) {
      let letter = (await post('/api/letters', { event_id: ev.id, child_id: kids[i].id, main_wish: pick(WISHES), secondary_wish: pick(WISHES),
        letter_text: 'Querido Santa: me he portado muy bien este año. (texto de demostración)' })).letter;
      const target = plan(i);
      if (target === 'PENDIENTE') continue;
      const sponsor = sponsors[s++ % sponsors.length];
      letter = (await post(`/api/letters/${letter.id}/assign`, { volunteer_id: sponsor.id, version: letter.version })).letter;
      if (target === 'ASIGNADO') continue;
      letter = (await post(`/api/letters/${letter.id}/status`, { to_status: 'RECIBIDO', version: letter.version, gift_notes: 'Regalo envuelto' })).letter;
      if (target === 'RECIBIDO') continue;
      await post(`/api/letters/${letter.id}/status`, { to_status: 'ENTREGADO', version: letter.version });
    }
  };
  await lettersFor(navidadPasada, withConsent.slice(0, 12), (i) => (i < 11 ? 'ENTREGADO' : 'RECIBIDO'));
  await post(`/api/events/${navidadPasada.id}/status`, { to_status: 'EN_CURSO' });
  await post(`/api/events/${navidadPasada.id}/status`, { to_status: 'CERRADO' });
  const plan = (i) => (i % 10 < 3 ? 'PENDIENTE' : i % 10 < 6 ? 'ASIGNADO' : i % 10 < 8 ? 'RECIBIDO' : 'ENTREGADO');
  await lettersFor(navidad, withConsent.slice(0, 30), plan);

  // ---------- Calendario ----------
  const adminId = admin.id;
  const pedro = users.getUserByEmail(DEMO_USERS[3].email);
  const month = (offset, day) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  const acts = [
    { title: 'Junta de planeación de Navidad', activity_type: 'JUNTA', activity_date: month(0, 8), start_time: '18:00', end_time: '19:30', responsible_user_id: adminId, event_id: navidad.id },
    { title: 'Capacitación de voluntarios', activity_type: 'CAPACITACION', activity_date: month(0, 15), start_time: '10:00', end_time: '12:00', responsible_user_id: adminId, event_id: navidad.id },
    { title: 'Acopio de regalos — zona centro', activity_type: 'ACOPIO', activity_date: month(0, 22), start_time: '09:00', end_time: '14:00', responsible_user_id: pedro.id, event_id: navidad.id },
    { title: 'Acopio de regalos — zona norte', activity_type: 'ACOPIO', activity_date: month(1, 6), start_time: '09:00', end_time: '14:00', responsible_user_id: pedro.id, event_id: navidad.id },
    { title: 'Revisión de cartas con padrinos', activity_type: 'JUNTA', activity_date: month(1, 10), start_time: '17:00', end_time: '18:00', responsible_user_id: adminId, event_id: navidad.id },
    { title: 'Visita a la Comunidad La Esperanza', activity_type: 'OTRO', activity_date: month(0, 26), start_time: '11:00', end_time: '13:00', responsible_user_id: adminId }
  ];
  for (const a of acts) {
    const act = (await post('/api/activities', { ...a, location: 'Oficina de Soñar Despierto', description: 'Actividad de demostración', allow_overlap: true })).activity;
    if (a.activity_type === 'CAPACITACION') await post(`/api/activities/${act.id}/volunteers`, { volunteer_ids: volunteers.slice(0, 8).map((v) => v.id) });
  }

  // ---------- Inventario ----------
  const cats = (await call('GET', '/api/inventory/categories?page_size=100', token)).items;
  const catIds = {};
  const cat = async (name) => {
    if (catIds[name]) return catIds[name];
    const found = cats.find((c) => c.name.startsWith(name));
    catIds[name] = found ? found.id : (await post('/api/inventory/categories', { name })).category.id;
    return catIds[name];
  };
  const centro = (await post('/api/inventory/centers', { name: 'Oficina central (demo)', address: 'Centro, Veracruz' })).center;
  const bodega = (await post('/api/inventory/centers', { name: 'Bodega norte (demo)', address: 'Zona norte' })).center;
  const items = {};
  for (const [name, c, unit, min] of [['Bolsa de regalo', 'Bolsas', 'PIEZA', 50], ['Silla plegable', 'Mobiliario', 'PIEZA', 0],
    ['Mesa plegable', 'Mobiliario', 'PIEZA', 0], ['Juguete sin carta', 'Juguetes', 'PIEZA', 20], ['Agua embotellada', 'Alimentos', 'CAJA', 10],
    ['Papel para envolver', 'Papelería', 'PAQUETE', 15]]) {
    items[name] = (await post('/api/inventory/items', { name, category_id: await cat(c), unit, min_stock: min })).item;
  }
  const mv = (type, center, lines, extra = {}) => post('/api/inventory/movements', { type, center_id: center.id, lines, ...extra });
  const L = (name, quantity) => ({ item_id: items[name].id, quantity });
  await mv('ENTRADA', centro, [L('Bolsa de regalo', 200), L('Papel para envolver', 40), L('Juguete sin carta', 35)], { reason: 'DONACION', counterpart: 'Donación de ejemplo' });
  await mv('ENTRADA', bodega, [L('Silla plegable', 60), L('Mesa plegable', 12), L('Agua embotellada', 8)], { reason: 'COMPRA' });
  await mv('TRASPASO', bodega, [L('Silla plegable', 20)], { to_center_id: centro.id });
  await mv('SALIDA', centro, [L('Bolsa de regalo', 30), L('Papel para envolver', 28)], { reason: 'USO_EVENTO', event_id: navidad.id });

  log(`  Demostración lista: ${children.length} niñas y niños, ${volunteers.length} voluntarios, 3 eventos y ${acts.length} actividades.`);
}

/** Llena la carpeta de demostración si aún no tiene datos (server.js --demo). */
async function seedIfEmpty() {
  const { getConfig } = require('../lib/config');
  const { getDb } = require('../lib/db');
  const config = getConfig();
  const mark = path.join(config.dataDir, READY_MARK);
  if (fs.existsSync(mark)) return false;
  if (getDb().prepare('SELECT COUNT(*) AS n FROM events').get().n > 0) return false;
  console.log('Preparando los datos de demostración (solo la primera vez)…');
  const { createApp } = require('../lib/app');
  const server = await new Promise((resolve) => { const s = createApp().listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    await seed(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  require('../services/auth').loginLimiter.resetAll();
  fs.writeFileSync(mark, [
    'Carpeta de DEMOSTRACIÓN de Soñar Despierto: todos los datos son ficticios.',
    'Bórrala (o usa "npm run demo -- --reiniciar") para volver a empezar.',
    '',
    `Administradora: ${DEMO_ADMIN}  contraseña: ${DEMO_PASSWORD}`,
    ...DEMO_USERS.map((u) => `${u.first} (${u.what}): ${u.email}  contraseña: ${DEMO_PASSWORD}`),
    ''
  ].join('\r\n'), 'utf8');
  return true;
}

/** Texto del recuadro de la consola en modo demostración. */
function credentialsText() {
  return [`Administradora: ${DEMO_ADMIN}`, ...DEMO_USERS.map((u) => `${u.first} (${u.what}): ${u.email}`), `Contraseña de todas: ${DEMO_PASSWORD}`].join('\n');
}

module.exports = { DEMO_PORT, DEMO_PASSWORD, DEMO_ADMIN, DEMO_USERS, demoDataDir, seed, seedIfEmpty, credentialsText };

// npm run demo [-- --reiniciar]: abre el sistema en modo demostración
if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = demoDataDir();
  if (args.includes('--reiniciar')) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Se borró la carpeta de demostración (${dir}).`);
  }
  process.argv = [process.argv[0], path.join(__dirname, '..', 'server.js'), '--demo', ...args.filter((a) => a !== '--reiniciar')];
  require('../server.js');
}
