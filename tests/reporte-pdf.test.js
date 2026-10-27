// interfaz-medico/tests/reporte-pdf.test.js
const test = require('node:test');
const assert = require('node:assert');
const { textoPdf, nombreArchivoPdf, datosReporteSesion } = require('../reporte-pdf.js');

const prueba = (t) => ({ tenar: { picos: [t, t, t], media: t }, flexores: { picos: [300, 300, 300], media: 300, extensoresDuranteFlexores: 60 }, extensores: { picos: [200, 200, 200], media: 200 } });
const s1 = { id: 'S1', fecha: '2026-10-20', dolorEVA: 5, duracionMin: 20, perdidaDatosPct: 0, ejercicios: [{ tipo: 'flexion', anguloMax: 40, repeticiones: 9, repeticionesObjetivo: 10 }], emg: { prueba: prueba(400) } };
const s2 = {
  id: 'S2', fecha: '2026-10-27', dolorEVA: 3, duracionMin: 25, perdidaDatosPct: 0, origen: 'usb', notas: 'Buena tolerancia.',
  chequeo: { dolorAntes: 5, hormigueo: 'no', herida: 'bien', nivel: 'precaucion', continuoBajoCriterio: false },
  ejercicios: [{ tipo: 'flexion', anguloMax: 48, repeticiones: 10, repeticionesObjetivo: 10, repeticionesManual: 10 }],
  rutina: { etapa: 2, pasos: [{ id: 'flexion', nombre: 'Flexión de muñeca', tipo: 'flexion', repeticionesObjetivo: 10, repeticiones: 10, repeticionesManual: 10 }] },
  emg: { prueba: prueba(440) },
};
const pac = { id: 'P-1', nombre: 'Andrés Núñez', mano: 'Derecha', fechaCirugia: '2026-09-20', proximaCita: '2026-11-03', sesiones: [s1, s2] };
const avisosDe = () => [{ nivel: 'warning', texto: '<b>Dolor:</b> subió de 3 a 5.' }];

test('textoPdf deja solo caracteres de Helvetica', () => {
  assert.strictEqual(textoPdf('Dolor 5 → 3 · ≥ 7 – Andrés ñ ✓ …'), 'Dolor 5 -> 3 · >= 7 - Andrés ñ OK ...');
  assert.strictEqual(textoPdf('≤ 3 — ⚠'), '<= 3 - !');
  assert.strictEqual(textoPdf(null), '');
});

test('nombre de archivo, con sufijo si hay dos sesiones el mismo día', () => {
  const a = { id: 'A', fecha: '2026-10-27' }, b = { id: 'B', fecha: '2026-10-27' };
  const p = { id: 'P-002', sesiones: [a, b] };
  assert.strictEqual(nombreArchivoPdf(p, a), 'P-002_sesion_2026-10-27.pdf');
  assert.strictEqual(nombreArchivoPdf(p, b), 'P-002_sesion_2026-10-27_2.pdf');
});

test('datos de una sesión completa', () => {
  const d = datosReporteSesion(pac, s2, '2026-10-27', avisosDe);
  assert.strictEqual(d.encabezado.paciente.nombre, 'Andrés Núñez');
  assert.strictEqual(d.encabezado.sesion.numero, 2);
  assert.strictEqual(d.encabezado.sesion.fase, 2);
  assert.strictEqual(d.encabezado.sesion.diasPostop, 37);
  assert.ok(d.lectura.chips.length >= 2 && d.lectura.frases.length >= 1);
  assert.strictEqual(d.chequeo.dolorAntes, 5);
  assert.strictEqual(d.chequeo.recomendacion, 'Precaución');
  assert.deepStrictEqual(d.ejercicios.map((e) => [e.nombre, e.anguloMax, e.cambio, e.pctNormal]), [['Flexión de muñeca', '48°', '+8°', '60 %']]);
  assert.strictEqual(d.rutina.length, 1);
  assert.deepStrictEqual(d.emg.musculos.map((m) => m.nombre), ['Pulgar (tenar)', 'Flexores', 'Extensores']);
  assert.strictEqual(d.emg.cocontraccion, '20 %');
  assert.deepStrictEqual(d.avisos, ['Dolor: subió de 3 a 5.']);
  assert.strictEqual(d.notas, 'Buena tolerancia.');
  assert.notStrictEqual(d.proximaCita, 'Por definir');
});

test('datos de una sesión mínima (importada)', () => {
  const m = { id: 'M', fecha: '2026-10-25', ejercicios: [] };
  const d = datosReporteSesion({ id: 'P-9', nombre: 'X', sesiones: [m] }, m, '2026-10-27', () => []);
  assert.strictEqual(d.chequeo, null);
  assert.strictEqual(d.rutina, null);
  assert.strictEqual(d.emg, null);
  assert.deepStrictEqual(d.ejercicios, []);
  assert.strictEqual(d.proximaCita, 'Por definir');
});

test('sin cambio de ángulo la columna dice 0°', () => {
  const a = { id: 'A', fecha: '2026-10-01', ejercicios: [{ tipo: 'flexion', anguloMax: 50, repeticiones: 10, repeticionesObjetivo: 10 }] };
  const b = { id: 'B', fecha: '2026-10-05', ejercicios: [{ tipo: 'flexion', anguloMax: 50.2, repeticiones: 10, repeticionesObjetivo: 10 }] };
  assert.strictEqual(datosReporteSesion({ id: 'P', nombre: 'X', sesiones: [a, b] }, b, '2026-10-27', () => []).ejercicios[0].cambio, '0°');
});
