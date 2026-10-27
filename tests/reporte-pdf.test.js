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
  // Comillas de autocorrección, signo menos y lo que no está en Latin-1.
  assert.strictEqual(textoPdf('“can’t” ‘x’ −3 € 😀'), '"can\'t" \'x\' -3 ? ?');
});

test('datosReporteSesion: los avisos no traen entidades HTML', () => {
  const d = datosReporteSesion(pac, s2, '2026-10-28', () => [{ nivel: 'critical', texto: '<b>Datos:</b> 2 % (criterio &lt; 1 %) &amp; &gt; &quot;x&quot; &#39;y&#39;' }]);
  assert.deepStrictEqual(d.avisos, ['Datos: 2 % (criterio < 1 %) & > "x" \'y\'']);
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

test('datosReporteSesion: la rutina dice con qué se midió cada paso', () => {
  const f1 = {
    id: 'F1', fecha: '2026-10-28', dolorEVA: 2, perdidaDatosPct: 0, ejercicios: [],
    rutina: { etapa: 1, pasos: [
      { id: 'tendon_recto', nombre: 'Mano recta', tipo: null, medicion: { fuente: 'emg', musculo: 'flexores' }, repeticionesObjetivo: 10, repeticiones: 8, repeticionesManual: null, emg: { musculo: 'flexores', repeticiones: 8 } },
      { id: 'pulgar_oposicion', nombre: 'Oposición', tipo: null, medicion: null, repeticionesObjetivo: 10, repeticiones: null, repeticionesManual: 9, senal: {} },
      { id: 'flexion', nombre: 'Flexión', tipo: 'flexion', medicion: { fuente: 'imu', tipo: 'flexion' }, repeticionesObjetivo: 10, repeticiones: 10, repeticionesManual: null },
      { id: 'viejo', nombre: 'Paso antiguo medido', tipo: 'flexion', repeticionesObjetivo: 10, repeticiones: 10, repeticionesManual: null },
      { id: 'viejo2', nombre: 'Paso antiguo sin medir', tipo: null, repeticionesObjetivo: 10, repeticiones: null, repeticionesManual: null, senal: {} },
    ] },
  };
  const d = datosReporteSesion({ ...pac, sesiones: [s1, s2, f1] }, f1, '2026-10-28', avisosDe);
  assert.deepStrictEqual(d.rutina.map((r) => r.medidoCon), ['EMG (flexores)', 'Manual', 'IMU', 'IMU', 'Manual']);
});
