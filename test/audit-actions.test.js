const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } = require('../lib/audit-actions');
const { recordAudit } = require('../services/audit');
const { getDb } = require('../lib/db');

after(h.stop);

test('cada acción tiene etiqueta', () => {
  for (const a of AUDIT_ACTIONS) assert.ok(AUDIT_ACTION_LABELS[a], a);
  assert.deepEqual(Object.keys(AUDIT_ACTION_LABELS).sort(), [...AUDIT_ACTIONS].sort());
});

test('recordAudit rechaza acciones fuera del catálogo', () => {
  assert.throws(() => recordAudit({ action: 'BORRAR_TODO', entity: 'users' }), /Acción de bitácora desconocida: BORRAR_TODO/);
});

test('detail anidado con temporary_password se guarda limpio', () => {
  h.resetDb();
  recordAudit({ action: 'USER_CREATED', entity: 'users', detail: { a: { temporary_password: 'X1y2z3w4', ok: 1 }, token: 't' } });
  const row = getDb().prepare('SELECT detail FROM audit_logs').get();
  assert.deepEqual(JSON.parse(row.detail), { a: { ok: 1 } });
});
