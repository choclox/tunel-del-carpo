const test = require('node:test');
const assert = require('node:assert');
const { crearDetector, suavizar } = require('../detector.js');
function rng(seed) { // mulberry32, como en data.js
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// n repeticiones de amplitud `amp` (coseno elevado) a 50 Hz, periodo 3 s, con 1 s de reposo antes.
function senal(n, amp, ruido, semilla = 7) {
  const r = rng(semilla);
  const v = [];
  for (let i = 0; i < 50 + n * 150 + 50; i++) {
    const s = (i - 50) / 150;
    const base = s > 0 && s < n ? amp * (0.5 - 0.5 * Math.cos(2 * Math.PI * (s % 1))) : 0;
    v.push(base + (r() - 0.5) * 2 * ruido);
  }
  return v;
}
const contar = (det, valores) => valores.filter((x) => det.agregar(x)).length;

test('suavizar: media móvil de las últimas n muestras', () => {
  assert.deepStrictEqual(suavizar([5, 5, 5, 5, 5, 10]), [5, 5, 5, 5, 5, 6]);
  assert.deepStrictEqual(suavizar([0, 3, 6], 3), [0, 1.5, 3]);
});

test('IMU: 10 repeticiones de 12° con ruido ±1,5° y ref 20 → 10', () => {
  const det = crearDetector({ tipoUmbral: 'imu', ref: 20 });
  assert.strictEqual(contar(det, senal(10, 12, 1.5)), 10);
  assert.strictEqual(det.picos.length, 10);
  assert.ok(det.picosRel.every((p) => p > 9 && p < 14));
});

test('IMU: ruido justo en el umbral no cuenta dobles', () => {
  // Cada repetición baja hasta quedarse un rato en el umbral de bajada con ruido.
  const r = rng(3);
  const v = [];
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 50; i++) v.push(25 * Math.sin((Math.PI / 2) * (i / 50)) + (r() - 0.5) * 3);
    for (let i = 0; i < 50; i++) v.push(25 - 21 * (i / 50) + (r() - 0.5) * 3);
    for (let i = 0; i < 50; i++) v.push(4 + (r() - 0.5) * 6); // ronda el umbral de bajada
    for (let i = 0; i < 50; i++) v.push((r() - 0.5) * 2);
  }
  const det = crearDetector({ tipoUmbral: 'imu', ref: 30 });
  assert.strictEqual(contar(det, v), 6);
});

test('IMU con rango amplio conserva los umbrales mínimos de 8° y 3°', () => {
  const det = crearDetector({ tipoUmbral: 'imu', ref: 80 });
  assert.strictEqual(contar(det, senal(4, 7, 0.5)), 0);
  assert.strictEqual(contar(crearDetector({ tipoUmbral: 'imu', ref: 80 }), senal(4, 50, 1)), 4);
});

test('EMG: reposo 20 y 8 contracciones a 300 → 8', () => {
  const v = senal(8, 280, 5).map((x) => 20 + x);
  const det = crearDetector({ tipoUmbral: 'emg' });
  // El detector recibe la activación sobre el reposo.
  assert.strictEqual(contar(det, v.map((x) => x - 20)), 8);
});

test('EMG: sin contracciones (plano 20 ± 5) → 0', () => {
  const det = crearDetector({ tipoUmbral: 'emg' });
  assert.strictEqual(contar(det, senal(0, 0, 5).concat(senal(0, 0, 5, 9))), 0);
});

test('umbrales: los expone para la gráfica', () => {
  assert.deepStrictEqual(crearDetector({ tipoUmbral: 'imu', ref: 20 }).umbrales(), { alto: 5, bajo: 2 });
  assert.deepStrictEqual(crearDetector({ tipoUmbral: 'emg' }).umbrales(), { alto: 150, bajo: 75 });
});
