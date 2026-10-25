/* Catálogo de ejercicios, datos de demostración y síntesis de señal.
 *
 * Valores de referencia: rangos articulares activos normativos de uso común
 * (AAOS). Se usan solo como punto de comparación visual, no como meta clínica.
 */

/* canal/signo: qué canal del dispositivo mide el ejercicio y en qué sentido
 * (ver protocolo en monitoreo.js). fe = flexo-extensión, rc = desviación
 * radio-cubital, mcf = flexión de dedos. */
const EJERCICIOS = {
  flexion:      { nombre: 'Flexión de muñeca',      corto: 'Flexión',       ref: 80, color: '--s1', canal: 'fe',  signo: 1 },
  extension:    { nombre: 'Extensión de muñeca',    corto: 'Extensión',     ref: 70, color: '--s2', canal: 'fe',  signo: -1 },
  desv_radial:  { nombre: 'Desviación radial',      corto: 'Desv. radial',  ref: 20, color: '--s3', canal: 'rc',  signo: 1 },
  desv_cubital: { nombre: 'Desviación cubital',     corto: 'Desv. cubital', ref: 30, color: '--s4', canal: 'rc',  signo: -1 },
  puno:         { nombre: 'Cierre de puño (MCF)',   corto: 'Puño (MCF)',    ref: 90, color: '--s5', canal: 'mcf', signo: 1 },
};
const ORDEN_EJERCICIOS = Object.keys(EJERCICIOS);

/* ---------- Generador pseudoaleatorio con semilla (reproducible) ---------- */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const r1 = (x) => Math.round(x * 10) / 10;

function sumarDias(iso, d) {
  const f = new Date(iso + 'T12:00:00');
  f.setDate(f.getDate() + d);
  return f.toISOString().slice(0, 10);
}

/* ---------- Datos de demostración ---------- */
function generarDemo() {
  const perfiles = [
    {
      id: 'P-001', nombre: 'María Fernanda Gómez', documento: '43.512.880', edad: 47, sexo: 'F',
      mano: 'Derecha', ocupacion: 'Manicurista', profesional: 'Ft. Laura Henao',
      fechaCirugia: '2026-07-20', inicio: '2026-08-05', n: 12, paso: [4, 5, 5, 4, 5, 5, 4, 5, 5, 4, 5],
      inicioPct: 0.42, finPct: 0.93, k: 0.30, dolor0: 6, seed: 11,
    },
    {
      id: 'P-002', nombre: 'Carlos Andrés Restrepo', documento: '71.230.455', edad: 52, sexo: 'M',
      mano: 'Izquierda', ocupacion: 'Mecánico automotriz', profesional: 'Ft. Laura Henao',
      fechaCirugia: '2026-08-10', inicio: '2026-08-26', n: 8, paso: [4, 5, 5, 4, 5, 4, 5],
      inicioPct: 0.38, finPct: 0.80, k: 0.35, dolor0: 7, seed: 22, meseta: true,
    },
    {
      id: 'P-003', nombre: 'Luz Dary Cardona', documento: '32.774.019', edad: 39, sexo: 'F',
      mano: 'Derecha', ocupacion: 'Cocinera', profesional: 'T.O. Andrés Mejía',
      fechaCirugia: '2026-06-25', inicio: '2026-07-10', n: 14, paso: [4, 5, 5, 4, 5, 5, 4, 5, 5, 4, 5, 5, 4],
      inicioPct: 0.48, finPct: 0.97, k: 0.25, dolor0: 5, seed: 33,
    },
    {
      id: 'P-004', nombre: 'Jhon Fredy Ospina', documento: '15.408.632', edad: 58, sexo: 'M',
      mano: 'Derecha', ocupacion: 'Operario minero', profesional: 'T.O. Andrés Mejía',
      fechaCirugia: '2026-09-05', inicio: '2026-09-21', n: 3, paso: [4, 5],
      inicioPct: 0.33, finPct: 0.85, k: 0.30, dolor0: 7, seed: 44,
    },
  ];

  return {
    version: 1,
    pacientes: perfiles.map((p) => {
      const rand = rng(p.seed);
      const sesiones = [];
      let fecha = p.inicio;
      for (let i = 0; i < p.n; i++) {
        if (i > 0) fecha = sumarDias(fecha, p.paso[i - 1]);
        const prog = 1 - Math.exp(-p.k * i);
        let pct = p.inicioPct + (p.finPct - p.inicioPct) * prog;
        // Paciente con estancamiento y leve retroceso en las últimas sesiones
        if (p.meseta && i >= 5) pct = p.inicioPct + (p.finPct - p.inicioPct) * (1 - Math.exp(-p.k * 5)) - (i - 5) * 0.025;

        const ejercicios = ORDEN_EJERCICIOS.map((tipo) => {
          const e = EJERCICIOS[tipo];
          let f = pct * (0.95 + rand() * 0.1);
          if (tipo === 'extension' && p.meseta && i >= 5) f -= 0.04 * (i - 4); // la extensión cae más
          const anguloMax = r1(e.ref * f);
          const objetivo = tipo === 'puno' ? 15 : 10;
          const completas = Math.min(objetivo, Math.round(objetivo * (0.6 + 0.4 * prog + (rand() - 0.5) * 0.15)));
          return {
            tipo,
            repeticionesObjetivo: objetivo,
            repeticiones: Math.max(3, completas),
            anguloMax,
            anguloMin: r1(rand() * 3),
            velocidadMedia: r1(anguloMax * (0.55 + 0.25 * prog + rand() * 0.08)),
            variabilidadPct: r1(Math.max(1.2, 9 - 6 * prog + (rand() - 0.5) * 2 + (p.meseta && i >= 5 ? 2 : 0))),
            duracionS: Math.round(objetivo * (5.5 - 1.5 * prog) + rand() * 6),
          };
        });

        let dolor = Math.round(Math.max(0, p.dolor0 - 5 * prog + (rand() - 0.5) * 1.5));
        if (p.meseta && i >= 6) dolor = Math.min(10, dolor + (i - 5));

        // Prueba de fuerza muscular (EMG) desde la Fase 2 (≥ 14 días post-op). El tenar mejora con el
        // nervio mediano; los extensores (control) casi no cambian; la co-contracción baja.
        // Paciente con estancamiento: el tenar cae en la última sesión (dispara el aviso del índice).
        let emg;
        if (dias(p.fechaCirugia, fecha) >= 14) {
          const picos = (media) => [0, 1, 2].map(() => Math.round(media * (0.97 + rand() * 0.06)));
          const bloque = (media) => { const pk = picos(media); return { picos: pk, media: Math.round(pk.reduce((a, b) => a + b, 0) / 3) }; };
          const tenarF = p.meseta && i === p.n - 1 ? 0.72 : 1;
          const flex = bloque(300 + 160 * prog);
          emg = {
            prueba: {
              tenar: bloque((240 + 220 * prog) * tenarF),
              flexores: { ...flex, extensoresDuranteFlexores: Math.round(flex.media * (0.38 - 0.22 * prog)) },
              extensores: bloque(360 + 20 * prog),
            },
          };
        }

        sesiones.push({
          id: `${p.id}-S${String(i + 1).padStart(2, '0')}`,
          fecha,
          duracionMin: Math.round(ejercicios.reduce((s, e) => s + e.duracionS, 0) / 60 + 8 + rand() * 6),
          calibracion: { tiempoS: r1(12 + rand() * 14), ok: true },
          perdidaDatosPct: r1(rand() * 0.8),
          dolorEVA: dolor,
          notas: i === 0 ? 'Sesión inicial. Se explica uso del dispositivo y protocolo de ejercicios.' : '',
          ejercicios,
          ...(emg ? { emg } : {}),
        });
      }
      const { inicio, n, paso, inicioPct, finPct, k, dolor0, seed, meseta, ...datos } = p;
      return { ...datos, sesiones };
    }),
  };
}

/* ---------- Señal angular ----------
 * Si la sesión importada trae la señal cruda del dispositivo
 * (ejercicio.senal = { fs: Hz, angulos: [...] }) se usa esa.
 * Si no, se sintetiza una señal representativa a partir de los indicadores
 * (solo para visualización en la demostración).
 */
function obtenerSenal(sesionId, ej) {
  if (ej.senal && Array.isArray(ej.senal.angulos) && ej.senal.angulos.length) {
    return { fs: ej.senal.fs || 50, angulos: ej.senal.angulos, sintetica: false };
  }
  const fs = 50;
  const rand = rng(hashStr(sesionId + ej.tipo));
  const n = Math.max(1, Math.round(ej.duracionS * fs));
  const reps = ej.repeticiones;
  const periodo = n / (reps + 0.6);
  const amps = Array.from({ length: reps }, () => 1 - (rand() * ej.variabilidadPct * 2) / 100);
  const angulos = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i - periodo * 0.3;
    const k = Math.floor(t / periodo);
    let v = ej.anguloMin;
    if (k >= 0 && k < reps) {
      const fase = (t - k * periodo) / periodo;
      const forma = 0.5 - 0.5 * Math.cos(2 * Math.PI * fase);
      v = ej.anguloMin + (ej.anguloMax - ej.anguloMin) * Math.pow(forma, 0.8) * amps[k];
    }
    angulos[i] = r1(v + (rand() - 0.5) * 0.8);
  }
  // Fuerza que el máximo coincida con el indicador registrado
  const imax = angulos.reduce((m, v, i) => (v > angulos[m] ? i : m), 0);
  angulos[imax] = ej.anguloMax;
  return { fs, angulos, sintetica: true };
}

/* Detección simple de picos (repeticiones) para marcarlas sobre la señal. */
function detectarPicos(angulos, fs, umbralFrac = 0.6) {
  const max = angulos.reduce((a, b) => (b > a ? b : a), -Infinity);
  const min = angulos.reduce((a, b) => (b < a ? b : a), Infinity);
  const umbral = min + (max - min) * umbralFrac;
  const separacion = Math.round(fs * 0.8);
  const picos = [];
  let i = 0;
  while (i < angulos.length) {
    if (angulos[i] >= umbral) {
      let j = i, best = i;
      while (j < angulos.length && angulos[j] >= umbral) { if (angulos[j] > angulos[best]) best = j; j++; }
      if (!picos.length || best - picos[picos.length - 1] >= separacion) picos.push(best);
      i = j;
    } else i++;
  }
  return picos;
}
