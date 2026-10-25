// interfaz-medico/tests/prueba-emg.test.js
const test = require('node:test');
const assert = require('node:assert');
const { debeHacerPrueba } = require('../prueba-emg.js');

test('la prueba EMG solo va en Fase 2 y 3 con EMG', () => {
  assert.strictEqual(debeHacerPrueba(1, true), false);
  assert.strictEqual(debeHacerPrueba(2, true), true);
  assert.strictEqual(debeHacerPrueba(3, true), true);
  assert.strictEqual(debeHacerPrueba(3, false), false);
});
