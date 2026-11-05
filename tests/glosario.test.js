// interfaz-medico/tests/glosario.test.js
const test = require('node:test');
const assert = require('node:assert');
const { GLOSARIO, botonTermino, htmlGlosario } = require('../glosario.js');

test('cada término tiene título y definición', () => {
  for (const [id, g] of Object.entries(GLOSARIO)) assert.ok(g.titulo && g.texto, id);
});

test('la razón tenar/extensores aclara lo que no mide', () => {
  assert.match(GLOSARIO.razon.texto, /No es una prueba de conducción nerviosa/);
});

test('botonTermino nombra el término para lectores de pantalla', () => {
  const b = botonTermino('cocontraccion');
  assert.ok(b.includes('data-termino="cocontraccion"'), b);
  assert.ok(b.includes('aria-label="Qué significa: Co-contracción"'), b);
});

test('htmlGlosario incluye todos los términos', () => {
  const h = htmlGlosario();
  for (const id of Object.keys(GLOSARIO)) assert.ok(h.includes(`id="glo-${id}"`), id);
});
