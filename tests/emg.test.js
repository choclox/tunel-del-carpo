// interfaz-medico/tests/emg.test.js
const test = require('node:test');
const assert = require('node:assert');
const { MUSCULOS, NOMBRES_MUSCULO, parsearMuestra, picoContraccion, resumenBloque, lineaBase, medidasEmg, validarEmg } = require('../emg.js');

const p = (linea) => parsearMuestra(linea.split(','));
const prueba = (t, f, e, efl = null) => ({
  tenar: { picos: [t, t, t], media: t },
  flexores: { picos: [f, f, f], media: f, extensoresDuranteFlexores: efl },
  extensores: { picos: [e, e, e], media: e },
});

test('músculos', () => {
  assert.deepStrictEqual(MUSCULOS, ['tenar', 'flexores', 'extensores']);
  assert.strictEqual(NOMBRES_MUSCULO.tenar, 'Pulgar (tenar)');
});

test('parsearMuestra sin y con EMG', () => {
  assert.deepStrictEqual(p('D,7,140,1.5,-2,8'), { seq: 7, t: 0.14, fe: 1.5, rc: -2, ps: 8, emg: null });
  assert.deepStrictEqual(p('D,7,140,1.5,-2,8,410,96,30').emg, { tenar: 410, flexores: 96, extensores: 30 });
});

test('parsearMuestra rechaza líneas no válidas', () => {
  for (const l of ['D,7,140,1,2', 'D,7,140,1,2,3,4,5', 'D,1,20,0,0,0,12,x,5', 'D,1,20,0,0,0,12,1001,5', 'D,1,20,0,0,0,-1,0,0', 'D,1,x,0,0,0']) {
    assert.strictEqual(p(l), null, l);
  }
});

test('picoContraccion', () => {
  assert.strictEqual(picoContraccion([3, 9, 4]), 9);
  assert.strictEqual(picoContraccion([]), null);
});

test('resumenBloque', () => {
  assert.deepStrictEqual(resumenBloque([410, 425, 401]), { picos: [410, 425, 401], media: 412, dudosa: false });
  assert.strictEqual(resumenBloque([400, 420, 200]).dudosa, true);
});

test('lineaBase toma la sesión más antigua con prueba', () => {
  const a = prueba(1, 1, 1), b = prueba(2, 2, 2);
  const ses = [
    { fecha: '2026-10-10', emg: { prueba: b } },
    { fecha: '2026-09-01' },
    { fecha: '2026-09-20', emg: { prueba: a } },
    { fecha: '2026-09-05', emg: { prueba: null } },
  ];
  assert.strictEqual(lineaBase(ses), a);
  assert.strictEqual(lineaBase([{ fecha: '2026-09-01' }]), null);
});

test('medidasEmg', () => {
  assert.deepStrictEqual(medidasEmg(prueba(480, 500, 200, 100), prueba(400, 500, 200)),
    { tenarPct: 120, flexoresPct: 100, extensoresPct: 100, indiceMediano: 120, cocontraccion: 20 });
});

test('medidasEmg con ceros o faltantes da null', () => {
  const m = medidasEmg(prueba(480, 500, 200, 100), prueba(400, 500, 0));
  assert.strictEqual(m.extensoresPct, null);
  assert.strictEqual(m.indiceMediano, null);
  assert.strictEqual(m.tenarPct, 120);
  assert.deepStrictEqual(medidasEmg(prueba(480, 0, 200), null),
    { tenarPct: null, flexoresPct: null, extensoresPct: null, indiceMediano: null, cocontraccion: null });
});

test('validarEmg', () => {
  assert.doesNotThrow(() => validarEmg({ prueba: null }));
  assert.doesNotThrow(() => validarEmg(undefined));
  assert.doesNotThrow(() => validarEmg({ prueba: prueba(1, 2, 3, 4) }));
  assert.throws(() => validarEmg({ prueba: { tenar: { picos: [1, 2] } } }), /tres músculos|picos/);
  assert.throws(() => validarEmg({ prueba: { ...prueba(1, 2, 3), tenar: { picos: [1, 'x', 3] } } }), /picos/);
  assert.throws(() => validarEmg('x'), /emg/);
});
