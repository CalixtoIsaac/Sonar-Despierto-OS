// REGISTRATION_ENABLED=false se fija ANTES de cargar la configuración (helpers.js)
process.env.REGISTRATION_ENABLED = 'false';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);

test('REGISTRATION_ENABLED=false → 403 REGISTRATION_DISABLED y registration-info { enabled: false }', async () => {
  const r = await h.request('POST', '/api/auth/register', { body: h.registerPayload() });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, {
    error: 'El registro de cuentas está desactivado. Contacta al administrador.', code: 'REGISTRATION_DISABLED'
  });
  assert.deepEqual((await h.request('GET', '/api/auth/registration-info')).body, { enabled: false });
});
