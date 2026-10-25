// interfaz-medico/tests/navegacion.test.js
const test = require('node:test');
const assert = require('node:assert');
const { SECCIONES, VISTAS_SEGUIMIENTO, normalizarRuta, seccionInicial, recortarObservaciones } = require('../navegacion.js');

test('secciones y vistas', () => {
  assert.deepStrictEqual(SECCIONES, ['ejercicios', 'seguimiento', 'reporte']);
  assert.deepStrictEqual(VISTAS_SEGUIMIENTO, ['resumen', 'sesion', 'comparar']);
});

test('normalizarRuta corrige valores no válidos', () => {
  assert.deepStrictEqual(normalizarRuta(null), { seccion: 'seguimiento', vista: 'resumen' });
  assert.deepStrictEqual(normalizarRuta({ seccion: 'vivo' }), { seccion: 'seguimiento', vista: 'resumen' });
  assert.deepStrictEqual(normalizarRuta({ seccion: 'reporte', vista: 'x' }), { seccion: 'reporte', vista: 'resumen' });
  assert.deepStrictEqual(normalizarRuta({ seccion: 'seguimiento', vista: 'comparar' }), { seccion: 'seguimiento', vista: 'comparar' });
});

test('seccionInicial', () => {
  assert.strictEqual(seccionInicial(0), 'ejercicios');
  assert.strictEqual(seccionInicial(undefined), 'ejercicios');
  assert.strictEqual(seccionInicial(4), 'seguimiento');
});

test('recortarObservaciones ordena por gravedad y corta', () => {
  const o = (nivel, texto) => ({ nivel, texto });
  const r = recortarObservaciones([o('good', 'g'), o('info', 'i1'), o('critical', 'c'), o('warning', 'w'), o('info', 'i2')]);
  assert.deepStrictEqual(r.visibles.map((x) => x.texto), ['c', 'w', 'i1']);
  assert.deepStrictEqual(r.ocultas.map((x) => x.texto), ['i2', 'g']);
  assert.deepStrictEqual(recortarObservaciones([], 3), { visibles: [], ocultas: [] });
});
