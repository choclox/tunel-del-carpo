/* EMG de 3 canales (tenar, flexores, extensores): formato de la línea D, picos de la prueba
 * de fuerza, línea base y medidas de mejora. Funciones puras, sin DOM. */

const MUSCULOS = ['tenar', 'flexores', 'extensores'];
const NOMBRES_MUSCULO = { tenar: 'Pulgar (tenar)', flexores: 'Flexores', extensores: 'Extensores' };

const enRangoEmg = (v) => Number.isInteger(v) && v >= 0 && v <= 1000;

// "D,seq,t_ms,fe,rc,mcf" (6 campos) o con ",emg1,emg2,emg3" (9 campos, enteros 0–1000).
function parsearMuestra(partes) {
  if (partes.length !== 6 && partes.length !== 9) return null;
  const n = partes.slice(1).map((x) => (x.trim() === '' ? NaN : Number(x)));
  const [seq, tms, fe, rc, mcf] = n;
  if ([seq, tms, fe, rc, mcf].some((x) => !isFinite(x))) return null;
  let emg = null;
  if (partes.length === 9) {
    const [tenar, flexores, extensores] = n.slice(5);
    if (![tenar, flexores, extensores].every(enRangoEmg)) return null;
    emg = { tenar, flexores, extensores };
  }
  return { seq, t: tms / 1000, fe, rc, mcf, emg };
}

function picoContraccion(valores) {
  return valores.length ? valores.reduce((a, b) => (b > a ? b : a), -Infinity) : null;
}

// Una contracción es dudosa si su pico queda por debajo del 70 % del promedio del bloque.
function resumenBloque(picos) {
  const media = Math.round(picos.reduce((a, b) => a + b, 0) / picos.length);
  return { picos, media, dudosa: picos.some((x) => x < 0.7 * media) };
}

// Prueba de la sesión más antigua (por fecha) que la tenga: es la referencia (100 %).
function lineaBase(sesiones) {
  const con = sesiones.filter((s) => s.emg?.prueba).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return con.length ? con[0].emg.prueba : null;
}

const pct = (a, b) => (a == null || b == null || !isFinite(a) || !isFinite(b) || b === 0 ? null : Math.round((a / b) * 1000) / 10);
const cociente = (a, b) => (a == null || b == null || b === 0 ? null : a / b);

function medidasEmg(prueba, base) {
  const m = (p, k) => p?.[k]?.media ?? null;
  return {
    tenarPct: pct(m(prueba, 'tenar'), m(base, 'tenar')),
    flexoresPct: pct(m(prueba, 'flexores'), m(base, 'flexores')),
    extensoresPct: pct(m(prueba, 'extensores'), m(base, 'extensores')),
    indiceMediano: pct(cociente(m(prueba, 'tenar'), m(prueba, 'extensores')), cociente(m(base, 'tenar'), m(base, 'extensores'))),
    cocontraccion: pct(prueba?.flexores?.extensoresDuranteFlexores ?? null, m(prueba, 'flexores')),
  };
}

// Valida el campo opcional "emg" de una sesión importada; completa "media" si falta.
function validarEmg(emg) {
  if (emg == null) return;
  if (typeof emg !== 'object') throw new Error('El campo "emg" de la sesión debe ser un objeto.');
  const p = emg.prueba;
  if (p == null) return;
  if (typeof p !== 'object' || !MUSCULOS.every((k) => p[k] && typeof p[k] === 'object')) {
    throw new Error('La prueba EMG debe incluir los tres músculos: tenar, flexores y extensores.');
  }
  for (const k of MUSCULOS) {
    const picos = p[k].picos;
    if (!Array.isArray(picos) || picos.length !== 3 || !picos.every((x) => typeof x === 'number' && isFinite(x))) {
      throw new Error(`Prueba EMG (${k}): "picos" debe ser una lista de 3 números.`);
    }
    p[k].media ??= resumenBloque(picos).media;
  }
}

if (typeof module !== 'undefined') module.exports = { MUSCULOS, NOMBRES_MUSCULO, parsearMuestra, picoContraccion, resumenBloque, lineaBase, medidasEmg, validarEmg };
