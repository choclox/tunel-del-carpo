// interfaz-medico/tests/reporte.test.js
const test = require('node:test');
const assert = require('node:assert');
const { ESTADOS, lecturaPaciente, lecturaSesion, porcentajeNormal } = require('../reporte.js');

const HOY = '2026-10-27';
const prueba = (t) => ({ tenar: { picos: [t, t, t], media: t }, flexores: { picos: [300, 300, 300], media: 300 }, extensores: { picos: [200, 200, 200], media: 200 } });
const ses = (fecha, flex, dolor, extra = {}) => ({ id: fecha, fecha, dolorEVA: dolor, perdidaDatosPct: 0, ejercicios: flex == null ? [] : [{ tipo: 'flexion', anguloMax: flex, repeticiones: 10, repeticionesObjetivo: 10 }], ...extra });
const base = () => ({
  id: 'P-1', nombre: 'Ana', proximaCita: '2026-11-03',
  sesiones: [
    ses('2026-10-17', 40, 7, { emg: { prueba: prueba(400) } }),
    ses('2026-10-24', 56, 3, { chequeo: { dolorAntes: 7 }, emg: { prueba: prueba(496) } }),
  ],
});
const estados = (l) => l.areas.map((a) => a.estado);
const area = (l, id) => l.areas.find((a) => a.id === id);

test('estados', () => assert.deepStrictEqual(ESTADOS, ['bien', 'atencion', 'revisar', 'sin-datos']));

test('porcentaje de lo normal', () => {
  assert.strictEqual(porcentajeNormal(ses('x', 40, 0)), 50);
  assert.strictEqual(porcentajeNormal(ses('x', null, 0)), null);
});

test('todo bien', () => {
  const l = lecturaPaciente(base(), HOY);
  assert.deepStrictEqual(l.areas.map((a) => a.titulo), ['Movimiento', 'Dolor', 'Músculo', 'Constancia']);
  assert.deepStrictEqual(estados(l), ['bien', 'bien', 'bien', 'bien']);
  assert.strictEqual(l.general, 'Va bien.');
  assert.strictEqual(area(l, 'movimiento').frase, 'Mueve la muñeca al 70 % de lo normal (+20 puntos desde la primera sesión).');
  assert.strictEqual(area(l, 'dolor').frase, 'Dolor 3/10 en la última sesión (al inicio: 7/10).');
  assert.strictEqual(area(l, 'musculo').frase, 'Índice del nervio mediano: 124 % de la primera prueba.');
  assert.ok(area(l, 'constancia').frase.startsWith('2 sesiones; la última hace 3 días. Próxima cita: '), area(l, 'constancia').frase);
});

test('dolor en atención', () => {
  const p = base(); p.sesiones[1].dolorEVA = 5;
  const l = lecturaPaciente(p, HOY);
  assert.strictEqual(area(l, 'dolor').estado, 'atencion');
  assert.strictEqual(l.general, 'Va avanzando; atención en dolor.');
});

test('movimiento que baja se revisa', () => {
  const p = base(); p.sesiones.push(ses('2026-10-26', 50, 3));
  const l = lecturaPaciente(p, HOY);
  assert.strictEqual(area(l, 'movimiento').estado, 'revisar');
  assert.ok(l.general.startsWith('Revisar: movimiento'), l.general);
});

test('constancia', () => {
  const con = (fecha, cita) => { const p = base(); p.sesiones[0].fecha = '2026-09-01'; p.sesiones[1].fecha = fecha; p.proximaCita = cita; return area(lecturaPaciente(p, HOY), 'constancia').estado; };
  assert.strictEqual(con('2026-10-12', null), 'atencion');   // hace 15 días
  assert.strictEqual(con('2026-10-02', null), 'revisar');    // hace 25 días
  assert.strictEqual(con('2026-10-24', '2026-10-25'), 'atencion'); // cita vencida
});

test('sin sesiones', () => {
  const l = lecturaPaciente({ id: 'X', nombre: 'X', sesiones: [] }, HOY);
  assert.deepStrictEqual(estados(l), ['sin-datos', 'sin-datos', 'sin-datos', 'sin-datos']);
  assert.strictEqual(area(l, 'constancia').frase, 'Aún no hay sesiones.');
  assert.strictEqual(l.general, 'Va bien.');
});

test('datos mínimos (sesión importada)', () => {
  const p = { id: 'X', nombre: 'X', sesiones: [{ fecha: '2026-10-25', ejercicios: [] }] };
  const l = lecturaPaciente(p, HOY);
  assert.deepStrictEqual(estados(l).slice(0, 3), ['sin-datos', 'sin-datos', 'sin-datos']);
  assert.doesNotThrow(() => lecturaSesion(p, p.sesiones[0]));
});

test('lectura de una sesión', () => {
  const p = base();
  const l = lecturaSesion(p, p.sesiones[1]);
  assert.deepStrictEqual(l.chips.map((c) => [c.id, c.estado, c.texto]), [['movimiento', 'bien', 'Sube'], ['dolor', 'bien', '7 → 3'], ['musculo', 'bien', '124 %']]);
  assert.ok(l.frase.length > 0);
  assert.deepStrictEqual(lecturaSesion(p, p.sesiones[0]).chips[0], { id: 'movimiento', titulo: 'Movimiento', estado: 'sin-datos', texto: '—' });
  delete p.sesiones[1].emg;
  assert.ok(!lecturaSesion(p, p.sesiones[1]).chips.some((c) => c.id === 'musculo'));
});
