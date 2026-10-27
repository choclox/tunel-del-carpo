// interfaz-medico/tests/rutinas.test.js
const test = require('node:test');
const assert = require('node:assert');
const { ETAPAS, etapaPorNumero, etapaSugerida, guardarRegistroPaso, resumenSenal } = require('../rutinas.js');

const TIPOS = ['flexion', 'extension', 'desv_radial', 'desv_cubital', 'puno'];

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
    assert.ok(tipos.length >= 1);
  }
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
