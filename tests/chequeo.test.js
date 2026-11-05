// interfaz-medico/tests/chequeo.test.js
const test = require('node:test');
const assert = require('node:assert');
const { evaluarChequeo } = require('../chequeo.js');

const ev = (dolorAntes, hormigueo, herida, etapa) => evaluarChequeo({ dolorAntes, hormigueo, herida }, etapa);

test('fase adelantada: pide criterio y sugiere la fase que corresponde', () => {
  const r = evaluarChequeo({ dolorAntes: 0, hormigueo: 'no', herida: 'bien' }, 3, { elegida: 3, sugerida: 1 });
  assert.strictEqual(r.nivel, 'precaucion');
  assert.strictEqual(r.etapaSugerida, 1);
  assert.deepStrictEqual(r.faseAdelantada, { elegida: 3, sugerida: 1 });
  assert.ok(r.motivos[0].includes('Fase 3 elegida'), r.motivos[0]);
  assert.strictEqual(evaluarChequeo({ dolorAntes: 0, hormigueo: 'no', herida: 'bien' }, 1, { elegida: 1, sugerida: 2 }).nivel, 'ok');
  assert.strictEqual(evaluarChequeo({ dolorAntes: 9, hormigueo: 'no', herida: 'bien' }, 3, { elegida: 3, sugerida: 1 }).nivel, 'detener');
});

test('todo bien', () => {
  assert.deepStrictEqual(ev(2, 'no', 'bien', 2), { nivel: 'ok', mensaje: 'Todo bien para empezar.', motivos: [], etapaSugerida: null });
});

test('precaución por dolor 4–6 o hormigueo leve', () => {
  assert.deepStrictEqual(ev(5, 'no', 'bien', 2), { nivel: 'precaucion', mensaje: 'Haga la rutina con cuidado; considere bajar a la Fase 1.', motivos: ['dolor 5 de 10 (entre 4 y 6)'], etapaSugerida: 1 });
  assert.deepStrictEqual(ev(4, 'no', 'bien', 1), { nivel: 'precaucion', mensaje: 'Haga la rutina con cuidado y reduzca las repeticiones si hay dolor.', motivos: ['dolor 4 de 10 (entre 4 y 6)'], etapaSugerida: null });
  assert.strictEqual(ev(0, 'leve', 'bien', 3).nivel, 'precaucion');
  assert.strictEqual(ev(0, 'leve', 'bien', 3).etapaSugerida, 2);
});

test('detener por dolor ≥ 7, hormigueo fuerte o herida', () => {
  const detener = (...motivos) => ({ nivel: 'detener', mensaje: 'Se recomienda no hacer la rutina hoy y consultar al médico tratante.', motivos, etapaSugerida: null });
  assert.deepStrictEqual(ev(7, 'no', 'bien', 2), detener('dolor 7 de 10 (7 o más)'));
  assert.deepStrictEqual(ev(0, 'fuerte', 'bien', 2), detener('hormigueo o adormecimiento fuerte'));
  assert.deepStrictEqual(ev(0, 'no', 'enrojecida', 2), detener('herida enrojecida o con secreción'));
  assert.deepStrictEqual(ev(0, 'no', 'abierta', 2), detener('herida abierta'));
  assert.deepStrictEqual(ev(8, 'leve', 'abierta', 2), detener('herida abierta', 'hormigueo o adormecimiento leve', 'dolor 8 de 10 (7 o más)'));
});
