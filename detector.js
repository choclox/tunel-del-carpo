/* Detector de repeticiones (puro, sin DOM): umbrales con histéresis sobre el valor relativo al
 * reposo, ajustados a la mediana de las repeticiones ya detectadas.
 *   IMU: ángulo en grados. Subida = máx(8°, 50 % de la amplitud típica), bajada = máx(3°, 25 %);
 *        en rangos pequeños (ref ≤ 30°) los mínimos bajan a 5° y 2°.
 *   EMG: activación sobre el reposo (0–1000). Subida = máx(60, 50 % de la mediana de los picos),
 *        bajada = máx(25, 25 %); sin picos todavía, la mediana se toma como 300.
 * Antes de comparar, el valor pasa por una media móvil de 5 muestras (~100 ms a 50 Hz). */

const VENTANA_SUAVIZADO = 5;
const MEDIANA_EMG_INICIAL = 300;

const medianaDe = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Media móvil de las últimas n muestras (al principio, de las que haya).
function suavizar(valores, n = VENTANA_SUAVIZADO) {
  let suma = 0;
  return valores.map((v, i) => {
    suma += v;
    if (i >= n) suma -= valores[i - n];
    return suma / Math.min(i + 1, n);
  });
}

// tipoUmbral: 'imu' | 'emg'. ref: rango normal del ejercicio IMU en grados.
function crearDetector({ tipoUmbral = 'imu', ref = 0 } = {}) {
  const emg = tipoUmbral === 'emg';
  const min = emg ? { alto: 60, bajo: 25 } : ref <= 30 ? { alto: 5, bajo: 2 } : { alto: 8, bajo: 3 };
  const ventana = [];
  let suma = 0, i = -1, arriba = false, pico = 0, picoIdx = 0;
  let refAmp = emg ? MEDIANA_EMG_INICIAL : 0.3 * ref;

  const det = {
    picos: [],     // índices de las muestras de cada pico
    picosRel: [],  // amplitud de cada repetición sobre el reposo
    umbrales: () => ({ alto: Math.max(min.alto, 0.5 * refAmp), bajo: Math.max(min.bajo, 0.25 * refAmp) }),
    // true si con esta muestra se completa una repetición.
    agregar(valor) {
      i++;
      ventana.push(valor);
      suma += valor;
      if (ventana.length > VENTANA_SUAVIZADO) suma -= ventana.shift();
      const v = suma / ventana.length;
      const { alto, bajo } = det.umbrales();
      if (!arriba) {
        if (v > alto) { arriba = true; pico = v; picoIdx = i; }
        return false;
      }
      if (v > pico) { pico = v; picoIdx = i; }
      if (v >= bajo) return false;
      arriba = false;
      det.picos.push(picoIdx);
      det.picosRel.push(pico);
      refAmp = medianaDe(det.picosRel);
      return true;
    },
  };
  return det;
}

if (typeof module !== 'undefined') module.exports = { crearDetector, suavizar };
