const test = require('node:test');
const assert = require('node:assert');
const { avisoDispositivo, debeMostrar } = require('../avisos.js');

const casos = [
  ['#Recalibre', 'recalibre', true],
  ['#Giroscopio no responde: modo sin giroscopio', 'giroscopio', true],
  ['#Acelerometro sin calibrar: envie ACEL', 'acelerometro', false],
  ['#Magnetometro sin calibrar: envie MAG', 'magnetometro', false],
  ['#Error de lectura del GY-85, reintentando', 'lectura', false],
  ['#GY-85 recuperado', 'recuperado', false],
];

for (const [linea, clave, recalibrar] of casos) {
  test(`mapea ${linea}`, () => {
    const a = avisoDispositivo(linea);
    assert.ok(a);
    assert.strictEqual(a.clave, clave);
    assert.strictEqual(a.recalibrar, recalibrar);
    assert.ok(typeof a.texto === 'string' && a.texto.length > 0);
  });
}

test('otras líneas devuelven null', () => {
  for (const l of ['#RAW,1,2,3', '#ESTADO,giro=1', 'D,1,2,3,4,5', '']) assert.strictEqual(avisoDispositivo(l), null);
});

test('tolera \r final', () => {
  assert.strictEqual(avisoDispositivo('#Recalibre\r').clave, 'recalibre');
});

test('debeMostrar limita por clave', () => {
  const u = {};
  assert.strictEqual(debeMostrar('a', 1000, u), true);
  assert.strictEqual(debeMostrar('a', 6000, u), false);
  assert.strictEqual(debeMostrar('a', 11000, u), true);
  assert.strictEqual(debeMostrar('b', 11000, u), true);
});
