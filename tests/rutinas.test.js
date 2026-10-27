// interfaz-medico/tests/rutinas.test.js
const test = require('node:test');
const assert = require('node:assert');
const { ETAPAS, etapaPorNumero, etapaSugerida, guardarRegistroPaso, resumenSenal, medicionDelPaso } = require('../rutinas.js');
const { EJERCICIOS } = require('../data.js');

const TIPOS = ['flexion', 'extension', 'desv_radial', 'desv_cubital', 'pronacion', 'supinacion'];

test('hay 3 etapas con pasos', () => {
  assert.deepStrictEqual(ETAPAS.map((e) => e.numero), [1, 2, 3]);
  assert.deepStrictEqual(ETAPAS.map((e) => e.nombre), ['Protección y movilidad temprana', 'Movilidad activa', 'Fortalecimiento']);
  for (const e of ETAPAS) {
    assert.ok(e.pasos.length >= 5);
    assert.ok(e.cuidado.length >= 3);
  }
});

test('tipos válidos y sin repetir por etapa', () => {
  for (const e of ETAPAS) {
    const tipos = e.pasos.map((p) => p.tipo).filter((t) => t !== null);
    for (const t of tipos) assert.ok(TIPOS.includes(t), `${e.numero}: ${t}`);
    assert.strictEqual(new Set(tipos).size, tipos.length);
  }
});

const IMU = (tipo) => ({ fuente: 'imu', tipo });
const EMG = (musculo) => ({ fuente: 'emg', musculo });
const MEDICION_ESPERADA = {
  1: { tendon_recto: EMG('flexores'), puno_gancho: EMG('flexores'), puno_completo: EMG('flexores'), mesa: EMG('flexores'),
    puno_recto: EMG('flexores'), pulgar_oposicion: { ...EMG('tenar'), manualSiHerida: true }, nervio_mediano: null },
  2: { flexion: IMU('flexion'), extension: IMU('extension'), desv_radial: IMU('desv_radial'), desv_cubital: IMU('desv_cubital'),
    pronacion: IMU('pronacion'), supinacion: IMU('supinacion'), puno_completo: EMG('flexores'), pulgar_abduccion: EMG('tenar') },
  3: { pelota: EMG('flexores'), pinza: EMG('tenar'), extension_carga: IMU('extension'), flexion_carga: IMU('flexion'),
    pronosup_martillo: IMU('supinacion') },
};

test('cada paso tiene la medición de la tabla', () => {
  for (const e of ETAPAS) {
    const real = Object.fromEntries(e.pasos.map((p) => [p.id, p.medicion]));
    assert.deepStrictEqual(real, MEDICION_ESPERADA[e.numero], `Fase ${e.numero}`);
  }
});

test('tipo sigue a la medición IMU y ningún paso usa puño', () => {
  for (const e of ETAPAS) for (const p of e.pasos) {
    assert.strictEqual(p.tipo, p.medicion?.fuente === 'imu' ? p.medicion.tipo : null, p.id);
    assert.notStrictEqual(p.tipo, 'puno');
    if (p.medicion?.fuente === 'imu') assert.ok(EJERCICIOS[p.medicion.tipo], p.id);
  }
});

test('desviaciones: recalibrar y postura de canto', () => {
  const ind = 'Mano de canto, pulgar hacia arriba y antebrazo apoyado. Desvíe la mano hacia el pulgar (radial) o hacia el meñique (cubital).';
  for (const id of ['desv_radial', 'desv_cubital']) {
    const p = etapaPorNumero(2).pasos.find((x) => x.id === id);
    assert.strictEqual(p.recalibrar, true);
    assert.strictEqual(p.indicacion, ind);
  }
  // Prono-supinación también: se calibra con el pulgar hacia arriba para que `ps` no pase de ±180°.
  const otros = ETAPAS.flatMap((e) => e.pasos).filter((p) => p.recalibrar);
  assert.deepStrictEqual(otros.map((p) => p.id), ['desv_radial', 'desv_cubital', 'pronacion', 'supinacion', 'pronosup_martillo']);
  for (const p of otros.slice(2)) assert.match(p.indicacion, /pulgar hacia arriba/);
});

test('pronación y supinación por el canal ps', () => {
  assert.deepStrictEqual([EJERCICIOS.pronacion.canal, EJERCICIOS.pronacion.signo, EJERCICIOS.pronacion.ref], ['ps', -1, 80]);
  assert.deepStrictEqual([EJERCICIOS.supinacion.canal, EJERCICIOS.supinacion.signo, EJERCICIOS.supinacion.ref], ['ps', 1, 80]);
});

test('medicionDelPaso: herida distinta de bien pasa la oposición a manual', () => {
  const op = etapaPorNumero(1).pasos.find((x) => x.id === 'pulgar_oposicion');
  assert.deepStrictEqual(medicionDelPaso(op, { herida: 'bien' }), EMG('tenar'));
  assert.deepStrictEqual(medicionDelPaso(op, null), EMG('tenar'));
  assert.strictEqual(medicionDelPaso(op, { herida: 'roja' }), null);
  const pelota = etapaPorNumero(3).pasos.find((x) => x.id === 'pelota');
  assert.deepStrictEqual(medicionDelPaso(pelota, { herida: 'roja' }), EMG('flexores'));
  const flex = etapaPorNumero(2).pasos.find((x) => x.id === 'flexion');
  assert.deepStrictEqual(medicionDelPaso(flex, { herida: 'roja' }), IMU('flexion'));
});

test('ids únicos por etapa y reps positivas', () => {
  for (const e of ETAPAS) {
    const ids = e.pasos.map((p) => p.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    for (const p of e.pasos) {
      assert.ok(p.reps > 0);
      assert.ok(p.sostenerS >= 0);
    }
  }
});

test('etapaSugerida por días', () => {
  assert.strictEqual(etapaSugerida('2026-10-01', '2026-10-14'), 1);
  assert.strictEqual(etapaSugerida('2026-10-01', '2026-10-15'), 2);
  assert.strictEqual(etapaSugerida('2026-10-01', '2026-11-11'), 2);
  assert.strictEqual(etapaSugerida('2026-10-01', '2026-11-12'), 3);
  assert.strictEqual(etapaSugerida('2026-10-01', '2027-03-01'), 3);
});

test('etapaSugerida con fecha futura o inválida', () => {
  assert.strictEqual(etapaSugerida('2026-12-01', '2026-10-14'), 1);
  assert.strictEqual(etapaSugerida('', '2026-10-14'), 1);
  assert.strictEqual(etapaSugerida('xx', '2026-10-14'), 1);
});

test('etapaPorNumero', () => {
  assert.strictEqual(etapaPorNumero(2).numero, 2);
  assert.strictEqual(etapaPorNumero(9).numero, 1);
});

test('guardarRegistroPaso reemplaza por id', () => {
  const a = [{ id: 'x', r: 1 }, { id: 'y', r: 1 }];
  assert.deepStrictEqual(guardarRegistroPaso(a, { id: 'x', r: 2 }), [{ id: 'x', r: 2 }, { id: 'y', r: 1 }]);
  assert.deepStrictEqual(a, [{ id: 'x', r: 1 }, { id: 'y', r: 1 }]);
  const b = guardarRegistroPaso(a, { id: 'z' });
  assert.strictEqual(b.length, 3);
  assert.strictEqual(b[2].id, 'z');
});

test('resumenSenal', () => {
  const m = Array.from({ length: 51 }, (_, i) => ({ t: i * 0.02, fe: i, rc: 0, ps: 1.26 }));
  const r = resumenSenal(m);
  assert.strictEqual(r.duracionS, 1);
  // Diezmada a ~10 Hz: una muestra de cada 5 (índices 0, 5, …, 50).
  assert.strictEqual(r.senal.fs, 10);
  assert.strictEqual(r.senal.fe.length, 11);
  assert.strictEqual(r.senal.rc.length, 11);
  assert.strictEqual(r.senal.ps.length, 11);
  assert.deepStrictEqual(r.senal.fe, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  assert.strictEqual(r.senal.ps[0], 1.3);
  assert.strictEqual(resumenSenal(m.slice(0, 24)), null);
  const corto = Array.from({ length: 30 }, (_, i) => ({ t: (i * 0.5) / 29, fe: 0, rc: 0, ps: 0 }));
  assert.strictEqual(resumenSenal(corto), null);
});

test('resumenSenal a 10 Hz conserva todas las muestras', () => {
  const m = Array.from({ length: 30 }, (_, i) => ({ t: i * 0.1, fe: i + 0.04, rc: -i, ps: 0 }));
  const r = resumenSenal(m);
  assert.strictEqual(r.senal.fs, 10);
  assert.strictEqual(r.senal.fe.length, 30);
  assert.strictEqual(r.senal.fe[3], 3);
  assert.strictEqual(r.senal.rc[29], -29);
  assert.strictEqual(r.duracionS, 2.9);
});
