// interfaz-medico/tests/rutina.test.js
const test = require('node:test');
const assert = require('node:assert');
const { crearRutina, rutaVideo } = require('../rutina.js');

const TIPOS = ['flexion', 'extension', 'desv_radial', 'desv_cubital', 'puno'];

test('empieza en el índice inicial', () => {
  const r = crearRutina(TIPOS, 2);
  assert.strictEqual(r.actual(), 'desv_radial');
  assert.strictEqual(r.indice(), 2);
  assert.strictEqual(r.total(), 5);
});

test('siguiente y anterior avanzan y retroceden', () => {
  const r = crearRutina(TIPOS);
  assert.strictEqual(r.siguiente(), 'extension');
  assert.strictEqual(r.siguiente(), 'desv_radial');
  assert.strictEqual(r.anterior(), 'extension');
});

test('no pasa del último ni del primero', () => {
  const r = crearRutina(TIPOS);
  assert.strictEqual(r.anterior(), 'flexion');
  assert.strictEqual(r.hayAnterior(), false);
  for (let i = 0; i < 10; i++) r.siguiente();
  assert.strictEqual(r.actual(), 'puno');
  assert.strictEqual(r.haySiguiente(), false);
  assert.strictEqual(r.hayAnterior(), true);
});

test('inicial e ir() fuera de rango se acotan', () => {
  assert.strictEqual(crearRutina(TIPOS, 99).actual(), 'puno');
  assert.strictEqual(crearRutina(TIPOS, -3).actual(), 'flexion');
  assert.strictEqual(crearRutina(TIPOS).ir(3), 'desv_cubital');
});

test('rutaVideo usa la carpeta videos', () => {
  assert.strictEqual(rutaVideo('flexion'), 'videos/flexion.mp4');
});

