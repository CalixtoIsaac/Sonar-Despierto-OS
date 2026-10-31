/**
 * Gate de la Fase 4 (hoja de ruta): concurrencia — dos asignaciones simultáneas de la misma carta → una
 * recibe 409; historial completo de cada carta. Además: cartas solo con el módulo CARTAS.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);
beforeEach(h.resetDb);

const api = (method, url, token, body) => h.request(method, url, { token, body });

async function setup() {
  const { token: admin } = await h.adminSession();
  const event = await h.openEvent(admin, { code_prefix: 'NAV26' });
  const child = await h.makeChild(admin);
  const letter = await h.makeLetter(admin, { eventId: event.id, childId: child.id });
  const sponsors = [];
  for (let i = 0; i < 5; i++) sponsors.push(await h.makeVolunteer(admin));
  return { admin, event, letter, sponsors };
}

test('(a) dos asignaciones simultáneas de la misma carta → una 200 y otra 409 LETTER_ALREADY_ASSIGNED', async () => {
  const { letter, sponsors } = await setup();
  const { token: op1 } = await h.operatorSession(['CARTAS']);
  const { token: op2 } = await h.operatorSession(['CARTAS']);
  const [r1, r2] = await Promise.all([
    api('POST', `/api/letters/${letter.id}/assign`, op1, { volunteer_id: sponsors[0].id, version: letter.version }),
    api('POST', `/api/letters/${letter.id}/assign`, op2, { volunteer_id: sponsors[1].id, version: letter.version })
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const loser = r1.status === 409 ? r1 : r2;
  const winner = r1.status === 200 ? r1 : r2;
  assert.equal(loser.body.code, 'LETTER_ALREADY_ASSIGNED');
  assert.equal(loser.body.current_status, 'ASIGNADO');
  assert.equal(loser.body.current_version, 2);

  const final = (await api('GET', `/api/letters/${letter.id}`, op1)).body.letter;
  assert.equal(final.sponsor.id, winner.body.letter.sponsor.id, 'gana una sola asignación y no se sobrescribe');
  const hist = (await api('GET', `/api/letters/${letter.id}/history`, op1)).body.items;
  assert.deepEqual(hist.map((x) => x.to_status), ['PENDIENTE', 'ASIGNADO'], 'el perdedor no deja rastro en el historial');
});

test('(a′) cinco asignaciones simultáneas → exactamente una gana', async () => {
  const { letter, sponsors, admin } = await setup();
  const results = await Promise.all(sponsors.map((s) =>
    api('POST', `/api/letters/${letter.id}/assign`, admin, { volunteer_id: s.id, version: 1 })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 4);
});

test('(a″) "recibido" marcado a la vez desde dos puestos de acopio → una 409 LETTER_STATUS_CHANGED', async () => {
  const { letter, sponsors, admin } = await setup();
  const a = (await api('POST', `/api/letters/${letter.id}/assign`, admin, { volunteer_id: sponsors[0].id, version: 1 })).body.letter;
  const [r1, r2] = await Promise.all([1, 2].map(() =>
    api('POST', `/api/letters/${letter.id}/status`, admin, { to_status: 'RECIBIDO', version: a.version })));
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
  assert.equal((r1.status === 409 ? r1 : r2).body.code, 'LETTER_STATUS_CHANGED');
});

test('(b) historial completo: cada transición con quién, padrino del momento, comentario y orden cronológico', async () => {
  const { letter, sponsors, admin } = await setup();
  const { user: opUser, token: op } = await h.operatorSession(['CARTAS']);
  const [luis, ana] = sponsors;
  let l = letter;
  const call = async (token, path, body) => {
    const r = await api('POST', `/api/letters/${l.id}/${path}`, token, { version: l.version, ...body });
    assert.equal(r.status, 200, `${path} ${JSON.stringify(body)}: ${r.text}`);
    l = r.body.letter;
  };
  await call(op, 'assign', { volunteer_id: luis.id, comment: 'Lo eligió en la feria' });
  await call(op, 'release', { comment: 'Ya no podrá' });
  await call(op, 'assign', { volunteer_id: ana.id });
  await call(op, 'status', { to_status: 'RECIBIDO', gift_notes: 'Bolsa 12' });
  await call(admin, 'status', { to_status: 'ASIGNADO', comment: 'Bolsa equivocada' });
  await call(op, 'status', { to_status: 'RECIBIDO', comment: 'Bolsa 21' });
  await call(op, 'status', { to_status: 'ENTREGADO', comment: 'Entregado en el evento' });

  const hist = (await api('GET', `/api/letters/${l.id}/history`, op)).body.items;
  assert.deepEqual(hist.map((x) => [x.from_status, x.to_status]), [
    [null, 'PENDIENTE'], ['PENDIENTE', 'ASIGNADO'], ['ASIGNADO', 'PENDIENTE'], ['PENDIENTE', 'ASIGNADO'],
    ['ASIGNADO', 'RECIBIDO'], ['RECIBIDO', 'ASIGNADO'], ['ASIGNADO', 'RECIBIDO'], ['RECIBIDO', 'ENTREGADO']
  ]);
  assert.deepEqual(hist.map((x) => x.sponsor && x.sponsor.id), [null, luis.id, luis.id, ana.id, ana.id, ana.id, ana.id, ana.id]);
  assert.deepEqual(hist.map((x) => x.comment), [null, 'Lo eligió en la feria', 'Ya no podrá', null, null, 'Bolsa equivocada', 'Bolsa 21', 'Entregado en el evento']);
  assert.ok(hist.slice(1).every((x, i) => x.created_at >= hist[i].created_at), 'orden cronológico');
  assert.deepEqual(hist.map((x) => x.changed_by && x.changed_by.id).slice(1, 5), [opUser.id, opUser.id, opUser.id, opUser.id]);
  assert.equal(l.version, 8);
  assert.equal(l.status, 'ENTREGADO');
  assert.equal(h.auditActions().filter((a) => a === 'LETTER_STATUS_CHANGED').length, 7, 'una entrada de bitácora por transición');
});

test('(c) sin CARTAS → 403 en cartas; quitar el módulo tiene efecto inmediato', async () => {
  const { letter, admin } = await setup();
  const { user, token } = await h.operatorSession(['CARTAS']);
  assert.equal((await api('GET', `/api/letters/${letter.id}`, token)).status, 200);
  await api('PATCH', `/api/users/${user.id}`, admin, { modules: ['EVENTOS'] });
  for (const url of ['/api/letters', `/api/letters/${letter.id}`, `/api/letters/by-code/NAV26-1`, '/api/letters/export']) {
    const r = await api('GET', url, token);
    assert.equal(r.status, 403, url);
    assert.equal(r.body.error, 'No tienes acceso al módulo Cartas de Navidad.');
  }
  assert.equal((await api('GET', '/api/events', token)).status, 200, 'con EVENTOS sigue viendo eventos');
});
