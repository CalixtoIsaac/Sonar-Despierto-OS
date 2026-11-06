/**
 * Datos de demostración (F8): se cargan por la API sin errores y dejan un tablero con cifras en todos los módulos.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const demo = require('../scripts/demo');
const users = require('../services/users');

before(h.start);
after(h.stop);

test('npm run demo: cuentas de demostración y un evento con cartas en los cuatro estatus', async () => {
  h.resetDb();
  users.ensureFirstAdmin();
  await demo.seed(h.baseUrl(), () => {});
  const token = await h.login(demo.DEMO_ADMIN, demo.DEMO_PASSWORD);
  for (const u of demo.DEMO_USERS) {
    const me = (await h.request('POST', '/api/auth/login', { body: { email: u.email, password: demo.DEMO_PASSWORD } })).body.user;
    assert.deepEqual(me.modules, u.modules);
    assert.equal(me.must_change_password, false);
  }
  const d = (await h.request('GET', '/api/reports/dashboard', { token })).body;
  assert.match(d.event.name, /^Navidad \d{4}$/);
  for (const s of ['PENDIENTE', 'ASIGNADO', 'RECIBIDO', 'ENTREGADO']) assert.ok(d.letters.by_status[s] > 0, s);
  assert.ok(d.children.without_consent > 0);
  assert.ok(d.volunteers.confirmed > 0);
  assert.ok(d.activities.total > 0);
  assert.ok(d.inventory.items.length > 0);
  const cmp = (await h.request('GET', '/api/reports/events', { token })).body.items;
  assert.equal(cmp.length, 3);
  assert.equal((await h.request('GET', '/api/users/summary', { token })).body.pending, 1);
});
