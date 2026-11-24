// interfaz-medico/tests/deslizamiento.test.js
const test = require('node:test');
const assert = require('node:assert');
const { DESLIZAMIENTO, acelArrastreMg, movimientosDelTramo, crearDetectorDeslizamiento, resumenDeslizamiento } = require('../deslizamiento.js');

// Generador reproducible (mulberry32) para el ruido.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Señal a 50 Hz: lista de tramos { cm, s, dir: [ux, uy] } y pausas { pausa: s }; ruido uniforme ±ruido mg.
function senal(plan, { ruido = 3, sesgo = { x: 5, y: -3 }, seed = 1, fs = 50 } = {}) {
  const r = rng(seed);
  const out = [];
  let t = 0;
  const muestra = (ax, ay) => { out.push({ t, ax: Math.round(ax + sesgo.x + (r() - 0.5) * 2 * ruido), ay: Math.round(ay + sesgo.y + (r() - 0.5) * 2 * ruido) }); t += 1 / fs; };
  for (const p of plan) {
    if (p.pausa != null) { for (let k = 0; k < p.pausa * fs; k++) muestra(0, 0); continue; }
    const n = Math.round(p.s * fs);
    for (let k = 0; k < n; k++) {
      const a = acelArrastreMg(p.cm, p.s, k / n);
      muestra(a * p.dir[0], a * p.dir[1]);
    }
  }
  return out;
}
const ciclo = (cm = 7, dir = [1, 0]) => [{ cm, s: 1.2, dir }, { pausa: 0.5 }, { cm, s: 0.8, dir: [-dir[0], -dir[1]] }, { pausa: 1 }];
const correr = (muestras, sesgo = { x: 5, y: -3 }) => {
  const det = crearDetectorDeslizamiento({ sesgo });
  let reps = 0;
  for (const m of muestras) reps += det.agregar(m.t, m.ax, m.ay);
  reps += det.cerrarTramo();
  return { det, reps, r: resumenDeslizamiento(det) };
};

test('acelArrastreMg: perfil suave que integra al desplazamiento', () => {
  assert.strictEqual(acelArrastreMg(7, 1, 0), 0);
  assert.strictEqual(acelArrastreMg(7, 1, 1), 0);
  assert.ok(Math.abs(acelArrastreMg(7, 1, 0.5)) < 1e-9);
  // Doble integración numérica: 7 cm.
  let v = 0, p = 0; const dt = 0.001;
  for (let u = 0; u < 1; u += dt) { v += acelArrastreMg(7, 1, u) * 0.980665 * dt; p += v * dt; }
  assert.ok(Math.abs(p - 7) < 0.05, p);
});

test('cinco arrastres con devolución: 5 repeticiones y unos 7 cm', () => {
  const plan = [{ pausa: 1 }, ...Array.from({ length: 5 }, () => ciclo()).flat()];
  const { reps, r, det } = correr(senal(plan));
  assert.strictEqual(reps, 5);
  assert.strictEqual(det.picos.length, 5);
  assert.strictEqual(r.repeticiones, 5);
  assert.ok(r.desplazamientoCm > 6 && r.desplazamientoCm < 8, `desplazamiento ${r.desplazamientoCm}`);
  assert.ok(r.velocidadMediaCms > 3 && r.velocidadMediaCms < 15, `velocidad ${r.velocidadMediaCms}`);
  assert.ok(r.duracionRepS > 2 && r.duracionRepS < 3.2, `duración ${r.duracionRepS}`);
  assert.ok(r.variabilidadPct < 10, `variabilidad ${r.variabilidadPct}`);
  assert.strictEqual(r.sinPareja, 0);
});

test('sin conocer el sesgo: lo sigue en reposo', () => {
  const plan = [{ pausa: 3 }, ...Array.from({ length: 3 }, () => ciclo()).flat()];
  const { reps, r } = correr(senal(plan, { sesgo: { x: 8, y: 4 } }), { x: 0, y: 0 });
  assert.strictEqual(reps, 3);
  assert.ok(r.desplazamientoCm > 5.5 && r.desplazamientoCm < 8.5, `desplazamiento ${r.desplazamientoCm}`);
});

test('vaivén sin pausas y en otra dirección: cuenta igual', () => {
  const dir = [Math.SQRT1_2, -Math.SQRT1_2];
  const vaiven = Array.from({ length: 4 }, () => [{ cm: 6, s: 1, dir }, { cm: 6, s: 1, dir: [-dir[0], -dir[1]] }]).flat();
  const { reps, r } = correr(senal([{ pausa: 1 }, ...vaiven, { pausa: 1 }]));
  assert.strictEqual(reps, 4);
  assert.ok(r.desplazamientoCm > 4.5 && r.desplazamientoCm < 7.5, `desplazamiento ${r.desplazamientoCm}`);
});

test('solo ruido o un arrastre sin devolución: 0 repeticiones', () => {
  assert.strictEqual(correr(senal([{ pausa: 10 }], { ruido: 4 })).reps, 0);
  const uno = correr(senal([{ pausa: 1 }, { cm: 7, s: 1.2, dir: [1, 0] }, { pausa: 1 }]));
  assert.strictEqual(uno.reps, 0);
  assert.strictEqual(uno.r.sinPareja, 1);
  assert.strictEqual(uno.r.desplazamientoCm, null);
});

test('movimientos muy cortos no cuentan', () => {
  const plan = [{ pausa: 1 }, ...Array.from({ length: 3 }, () => ciclo(0.5)).flat()];
  assert.strictEqual(correr(senal(plan)).reps, 0);
});

test('movimientosDelTramo corrige la deriva de un sesgo constante', () => {
  // 5 cm en 1 s con 4 mg de sesgo sin restar y reposo a ambos lados.
  const m = [];
  for (let k = 0; k <= 150; k++) {
    const t = k / 50, u = (t - 0.5) / 1;
    m.push({ t, x: acelArrastreMg(5, 1, u) + 4, y: 0 });
  }
  const movs = movimientosDelTramo(m);
  assert.strictEqual(movs.length, 1);
  assert.ok(Math.abs(movs[0].cm - 5) < 0.3, movs[0].cm);
  assert.ok(movs[0].dx > 0);
  assert.ok(Math.abs(movs[0].s - 1) < 0.35, movs[0].s);
});

test('umbrales expuestos para la gráfica', () => {
  const det = crearDetectorDeslizamiento();
  assert.deepStrictEqual(det.umbrales(), { alto: DESLIZAMIENTO.INICIO_MG, bajo: DESLIZAMIENTO.QUIETO_MG });
});
