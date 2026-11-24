/* Arrastre de la tapa: el sensor va dentro de la tapa, sobre la mesa, y los dedos la traen hacia
 * la palma y la devuelven. Funciones puras, sin DOM.
 *
 * Entrada: aceleración lineal horizontal del sensor (ax, ay en mg; el firmware ya restó la gravedad).
 * 1. Tramos: la tapa se mueve cuando la |a| suavizada pasa de INICIO_MG y vuelve al reposo cuando
 *    queda bajo QUIETO_MG durante QUIETO_S. En reposo se sigue el sesgo del sensor.
 * 2. Al cerrar un tramo se integra dos veces la aceleración (sin el sesgo). La velocidad que sobra
 *    al final es deriva: se reparte en el tramo como un sesgo constante (velocidad cero en reposo).
 * 3. El tramo se parte en movimientos donde la velocidad cambia de sentido (ida y vuelta sin pausa).
 * 4. Una repetición es un movimiento seguido de otro en sentido contrario (arrastre y devolución).
 *
 * El desplazamiento es una estimación (doble integración): sirve para comparar sesiones del mismo
 * paciente, no como medida exacta. Los umbrales son iniciales y hay que ajustarlos con registros
 * reales del dispositivo. */

const DESLIZAMIENTO = {
  SUAVIZADO: 5,       // muestras de la media móvil de |a| (~100 ms a 50 Hz)
  INICIO_MG: 12,      // |a| suavizada que abre un tramo
  QUIETO_MG: 6,       // por debajo, la tapa está quieta
  QUIETO_S: 0.3,      // tiempo quieta que cierra el tramo
  PREVIO_S: 0.2,      // el tramo se integra desde un poco antes del umbral
  MAX_S: 15,          // un tramo más largo se cierra igual (vaivén sin pausas)
  MIN_CM: 1,          // movimiento más corto que se cuenta
  MIN_S: 0.2,
  V_MIN_CMS: 2,       // velocidad que debe alcanzar un movimiento antes de poder cambiar de sentido
  ALFA_SESGO: 0.02,   // seguimiento del sesgo en reposo
};
const CM_S2_POR_MG = 0.980665; // 1 mg = 0,980665 cm/s²

const promedio = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r1d = (x) => (x == null ? null : Math.round(x * 10) / 10);

// Integra un tramo [{ t (s), x, y (mg, sin sesgo) }] y lo parte en movimientos.
// Devuelve [{ tIni, tFin, dx, dy, cm, s }] (cm y s del tramo en que la velocidad supera el 10 % del pico).
function movimientosDelTramo(muestras, cfg = DESLIZAMIENTO) {
  const n = muestras.length;
  if (n < 3) return [];
  const t0 = muestras[0].t, T = muestras[n - 1].t - t0;
  if (T <= 0) return [];
  const v = [{ x: 0, y: 0 }], p = [{ x: 0, y: 0 }];
  for (let i = 1; i < n; i++) {
    const a = muestras[i - 1], b = muestras[i], dt = b.t - a.t;
    const vx = v[i - 1].x + ((a.x + b.x) / 2) * CM_S2_POR_MG * dt;
    const vy = v[i - 1].y + ((a.y + b.y) / 2) * CM_S2_POR_MG * dt;
    v.push({ x: vx, y: vy });
    p.push({ x: p[i - 1].x + ((v[i - 1].x + vx) / 2) * dt, y: p[i - 1].y + ((v[i - 1].y + vy) / 2) * dt });
  }
  // Deriva: velocidad final distinta de cero → sesgo constante en el tramo.
  const fx = v[n - 1].x / T, fy = v[n - 1].y / T;
  for (let i = 0; i < n; i++) {
    const u = muestras[i].t - t0;
    v[i] = { x: v[i].x - fx * u, y: v[i].y - fy * u };
    p[i] = { x: p[i].x - (fx * u * u) / 2, y: p[i].y - (fy * u * u) / 2 };
  }

  const movs = [];
  const cerrar = (ini, fin, pico) => {
    let a = ini, b = fin;
    while (a < fin && Math.hypot(v[a].x, v[a].y) < 0.1 * pico) a++;
    while (b > a && Math.hypot(v[b].x, v[b].y) < 0.1 * pico) b--;
    const dx = p[fin].x - p[ini].x, dy = p[fin].y - p[ini].y;
    movs.push({ tIni: muestras[a].t, tFin: muestras[b].t, dx, dy, cm: Math.hypot(dx, dy), s: muestras[b].t - muestras[a].t });
  };
  let ini = 0, pico = 0, ref = null;
  for (let i = 1; i < n; i++) {
    const vel = Math.hypot(v[i].x, v[i].y);
    if (vel > pico) { pico = vel; ref = v[i]; }
    if (pico >= cfg.V_MIN_CMS && v[i].x * ref.x + v[i].y * ref.y <= 0) {
      cerrar(ini, i, pico);
      ini = i; pico = 0; ref = null;
    }
  }
  if (pico > 0) cerrar(ini, n - 1, pico);
  return movs.filter((m) => m.cm >= cfg.MIN_CM && m.s >= cfg.MIN_S);
}

// Detector en vivo. sesgo: aceleración en reposo (mg) medida antes de empezar.
function crearDetectorDeslizamiento({ sesgo = { x: 0, y: 0 }, cfg = DESLIZAMIENTO } = {}) {
  let bx = sesgo.x, by = sesgo.y;
  const ventana = [];
  let suma = 0, i = -1;
  let previas = [];     // muestras sin sesgo de los últimos PREVIO_S (para empezar antes del umbral)
  let tramo = null;     // { muestras, quietoDesde }
  let pendiente = null; // último movimiento sin su contrario

  const det = {
    picos: [],          // índice de la muestra en que se completó cada repetición
    movimientos: [],    // todos los movimientos válidos
    repeticiones: [],   // [{ ida, vuelta }]
    umbrales: () => ({ alto: cfg.INICIO_MG, bajo: cfg.QUIETO_MG }),
    enMovimiento: () => !!tramo,
    // Valor suavizado de |a| (mg) de la última muestra: lo que se grafica.
    ultimo: 0,
    // Devuelve cuántas repeticiones se completaron con esta muestra (0 casi siempre).
    agregar(t, ax, ay) {
      i++;
      const x = ax - bx, y = ay - by;
      const mag = Math.hypot(x, y);
      ventana.push(mag);
      suma += mag;
      if (ventana.length > cfg.SUAVIZADO) suma -= ventana.shift();
      const s = suma / ventana.length;
      det.ultimo = s;
      const m = { t, x, y };

      if (!tramo) {
        previas.push(m);
        while (previas.length && previas[0].t < t - cfg.PREVIO_S) previas.shift();
        if (s > cfg.INICIO_MG) { tramo = { muestras: previas, quietoDesde: null }; previas = []; return 0; }
        if (s < cfg.QUIETO_MG) { bx += cfg.ALFA_SESGO * x; by += cfg.ALFA_SESGO * y; }
        return 0;
      }
      tramo.muestras.push(m);
      if (s < cfg.QUIETO_MG) tramo.quietoDesde ??= t; else tramo.quietoDesde = null;
      const quieto = tramo.quietoDesde != null && t - tramo.quietoDesde >= cfg.QUIETO_S;
      if (!quieto && t - tramo.muestras[0].t < cfg.MAX_S) return 0;
      return det.cerrarTramo();
    },
    // Cierra el tramo abierto (también al terminar el paso) y empareja sus movimientos.
    cerrarTramo() {
      if (!tramo) return 0;
      const movs = movimientosDelTramo(tramo.muestras, cfg);
      tramo = null;
      let nuevas = 0;
      for (const mov of movs) {
        det.movimientos.push(mov);
        if (pendiente && mov.dx * pendiente.dx + mov.dy * pendiente.dy < 0) {
          det.repeticiones.push({ ida: pendiente, vuelta: mov });
          det.picos.push(i);
          pendiente = null;
          nuevas++;
        } else pendiente = mov;
      }
      return nuevas;
    },
  };
  return det;
}

// Aceleración (mg) de un movimiento suave de `cm` centímetros en `durS` segundos (perfil de mínima
// sacudida), en la fracción u ∈ [0, 1] del movimiento. La usan el simulador y las pruebas.
function acelArrastreMg(cm, durS, u) {
  if (u <= 0 || u >= 1) return 0;
  return ((cm / (durS * durS)) * (60 * u - 180 * u * u + 120 * u * u * u)) / CM_S2_POR_MG;
}

// Medidas del paso a partir de las repeticiones (null si no hubo ninguna).
//   desplazamientoCm: promedio de arrastre y devolución de cada repetición, luego promedio general.
//   velocidadMediaCms: distancia / duración de cada movimiento, promediada.
//   duracionRepS: desde que empieza el arrastre hasta que termina la devolución.
//   variabilidadPct: coeficiente de variación del desplazamiento entre repeticiones.
//   sinPareja: movimientos que no formaron una repetición (arrastre sin devolución, etc.).
function resumenDeslizamiento(det) {
  const reps = det.repeticiones;
  if (!reps.length) return { repeticiones: 0, desplazamientoCm: null, desplazamientoMaxCm: null, velocidadMediaCms: null, duracionRepS: null, variabilidadPct: null, sinPareja: det.movimientos.length };
  const porRep = reps.map((r) => (r.ida.cm + r.vuelta.cm) / 2);
  const movs = reps.flatMap((r) => [r.ida, r.vuelta]);
  const media = promedio(porRep);
  const cv = porRep.length >= 2 ? (Math.sqrt(promedio(porRep.map((d) => (d - media) ** 2))) / media) * 100 : null;
  return {
    repeticiones: reps.length,
    desplazamientoCm: r1d(media),
    desplazamientoMaxCm: r1d(Math.max(...movs.map((m) => m.cm))),
    velocidadMediaCms: r1d(promedio(movs.filter((m) => m.s > 0).map((m) => m.cm / m.s))),
    duracionRepS: r1d(promedio(reps.map((r) => r.vuelta.tFin - r.ida.tIni))),
    variabilidadPct: cv == null ? null : r1d(cv),
    sinPareja: det.movimientos.length - 2 * reps.length,
  };
}

if (typeof module !== 'undefined') module.exports = { DESLIZAMIENTO, acelArrastreMg, movimientosDelTramo, crearDetectorDeslizamiento, resumenDeslizamiento };
