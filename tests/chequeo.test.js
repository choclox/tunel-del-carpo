// interfaz-medico/tests/chequeo.test.js
const test = require('node:test');
const assert = require('node:assert');
const { evaluarChequeo } = require('../chequeo.js');

const ev = (dolorAntes, hormigueo, herida, etapa) => evaluarChequeo({ dolorAntes, hormigueo, herida }, etapa);

test('todo bien', () => {
  assert.deepStrictEqual(ev(2, 'no', 'bien', 2), { nivel: 'ok', mensaje: 'Todo bien para empezar.', etapaSugerida: null });
});

test('precaución por dolor 4–6 o hormigueo leve', () => {
  assert.deepStrictEqual(ev(5, 'no', 'bien', 2), { nivel: 'precaucion', mensaje: 'Haga la rutina con cuidado; considere bajar a la Fase 1.', etapaSugerida: 1 });
  assert.deepStrictEqual(ev(4, 'no', 'bien', 1), { nivel: 'precaucion', mensaje: 'Haga la rutina con cuidado y reduzca las repeticiones si hay dolor.', etapaSugerida: null });
  assert.strictEqual(ev(0, 'leve', 'bien', 3).nivel, 'precaucion');
  assert.strictEqual(ev(0, 'leve', 'bien', 3).etapaSugerida, 2);
});

test('detener por dolor ≥ 7, hormigueo fuerte o herida', () => {
  const detener = { nivel: 'detener', mensaje: 'Se recomienda no hacer la rutina hoy y consultar al médico tratante.', etapaSugerida: null };
  assert.deepStrictEqual(ev(7, 'no', 'bien', 2), detener);
  assert.deepStrictEqual(ev(0, 'fuerte', 'bien', 2), detener);
  assert.deepStrictEqual(ev(0, 'no', 'enrojecida', 2), detener);
  assert.deepStrictEqual(ev(0, 'no', 'abierta', 2), detener);
});
