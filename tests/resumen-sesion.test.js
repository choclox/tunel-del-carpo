// interfaz-medico/tests/resumen-sesion.test.js
const test = require('node:test');
const assert = require('node:assert');
const { sumarDiasISO, comparacionConAnterior, datosHojaPaciente } = require('../resumen-sesion.js');

const prueba = (t) => ({ tenar: { picos: [t, t, t], media: t }, flexores: { picos: [300, 300, 300], media: 300 }, extensores: { picos: [200, 200, 200], media: 200 } });
const s1 = { id: 'S1', fecha: '2026-10-20', dolorEVA: 4, ejercicios: [{ tipo: 'flexion', anguloMax: 46, repeticiones: 10 }], emg: { prueba: prueba(400) } };
const s2 = {
  id: 'S2', fecha: '2026-10-24', dolorEVA: 3, chequeo: { dolorAntes: 5 },
  ejercicios: [{ tipo: 'flexion', anguloMax: 52, repeticiones: 10 }], emg: { prueba: prueba(440) },
  rutina: { etapa: 2, pasos: [{ id: 'flexion', nombre: 'Flexión de muñeca', repeticiones: 9, repeticionesManual: 10, repeticionesObjetivo: 10 }] },
};
const pac = { id: 'P-1', nombre: 'Ana Pérez', fechaCirugia: '2026-09-20', sesiones: [s2, s1] };

test('sumarDiasISO', () => {
  assert.strictEqual(sumarDiasISO('2026-10-30', 7), '2026-11-06');
  assert.strictEqual(sumarDiasISO('2026-12-28', 7), '2027-01-04');
});

test('comparación con la sesión anterior', () => {
  const c = comparacionConAnterior(pac, s2);
  assert.ok(c.includes('Flexión de muñeca: 52° (+6° que la sesión anterior)'), c.join(' | '));
  assert.ok(c.includes('Dolor: 5 → 3 durante la sesión'), c.join(' | '));
  assert.ok(c.some((x) => x.startsWith('Índice del nervio mediano')), c.join(' | '));
  assert.ok(c.length <= 3);
});

test('primera sesión', () => {
  assert.deepStrictEqual(comparacionConAnterior(pac, s1), ['Primera sesión: será la referencia para comparar.']);
});

test('nunca más de 3 frases', () => {
  const ej = (a) => ['flexion', 'extension', 'desv_radial', 'desv_cubital', 'puno'].map((tipo) => ({ tipo, anguloMax: a }));
  const a = { fecha: '2026-10-01', ejercicios: ej(20) }, b = { fecha: '2026-10-05', ejercicios: ej(30), dolorEVA: 1, chequeo: { dolorAntes: 4 } };
  assert.strictEqual(comparacionConAnterior({ sesiones: [a, b] }, b).length, 3);
});

test('hoja para el paciente', () => {
  const h = datosHojaPaciente(pac, s2);
  assert.strictEqual(h.nombre, 'Ana Pérez');
  assert.deepStrictEqual(h.hizo, [{ nombre: 'Flexión de muñeca', reps: 10 }]);
  assert.strictEqual(h.ejercicios.length, 8);
  assert.ok(h.ejercicios.every((e) => e.nombre && e.reps > 0));
  assert.ok(h.cuidados.length > 0);
  assert.strictEqual(h.proximaCita, 'Por definir');
  assert.notStrictEqual(datosHojaPaciente({ ...pac, proximaCita: '2026-11-03' }, s2).proximaCita, 'Por definir');
});

test('sin nada comparable, una frase que lo dice', () => {
  const a = { fecha: '2026-10-01', ejercicios: [{ tipo: 'flexion', anguloMax: 40 }] }, b = { fecha: '2026-10-05', ejercicios: [], dolorEVA: null };
  assert.deepStrictEqual(comparacionConAnterior({ sesiones: [a, b] }, b), ['Sin datos comparables con la sesión anterior.']);
});

test('la hoja no da por hechas repeticiones que nadie contó', () => {
  const s = { fecha: '2026-10-24', ejercicios: [], rutina: { etapa: 1, pasos: [{ id: 'mesa', nombre: 'Mesa', repeticiones: null, repeticionesManual: null, repeticionesObjetivo: 10 }] } };
  assert.deepStrictEqual(datosHojaPaciente({ nombre: 'X', fechaCirugia: '2026-10-10', sesiones: [s] }, s).hizo, [{ nombre: 'Mesa', reps: null }]);
});
