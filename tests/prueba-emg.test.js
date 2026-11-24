// interfaz-medico/tests/prueba-emg.test.js
const test = require('node:test');
const assert = require('node:assert');
const { debeHacerPrueba } = require('../prueba-emg.js');

test('con el EMG desactivado la prueba de fuerza no se hace en ninguna fase', () => {
  for (const etapa of [1, 2, 3]) for (const conEmg of [true, false]) assert.strictEqual(debeHacerPrueba(etapa, conEmg), false);
});
