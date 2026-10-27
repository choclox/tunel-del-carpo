/* Reporte: lectura rápida del paciente y de cada sesión en lenguaje simple, con semáforo
 * (bien / atención / revisar / sin datos). Las funciones de cálculo son puras y reciben `hoy`. */

// Dependencias globales en el navegador; require en Node (pruebas).
const depsReporte = () => (typeof EJERCICIOS !== 'undefined'
  ? { EJERCICIOS, lineaBase, medidasEmg, comparacionConAnterior }
  : { ...require('./data.js'), ...require('./emg.js'), ...require('./resumen-sesion.js') });

const ESTADOS = ['bien', 'atencion', 'revisar', 'sin-datos'];
const TITULOS_AREA = { movimiento: 'Movimiento', dolor: 'Dolor', musculo: 'Músculo', constancia: 'Constancia' };
const NOMBRE_AREA = { movimiento: 'movimiento', dolor: 'dolor', musculo: 'músculo', constancia: 'constancia' };

const diasHasta = (desde, hasta) => Math.round((new Date(hasta + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 86400000);
const ordenarSesiones = (p) => [...(p.sesiones ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
const signo = (n) => `${n >= 0 ? '+' : ''}${n}`;

// Promedio del % de lo normal (tope 100 % por ejercicio) de los ejercicios medidos con IMU.
function porcentajeNormal(s) {
  const { EJERCICIOS: EJ } = depsReporte();
  const v = (s.ejercicios ?? []).filter((e) => EJ[e.tipo] && e.anguloMax != null).map((e) => Math.min(100, (e.anguloMax / EJ[e.tipo].ref) * 100));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

// true si algún ejercicio bajó más del 8 % frente a la sesión anterior.
function bajoMovimiento(s, prev) {
  return !!prev && (s.ejercicios ?? []).some((e) => {
    const a = (prev.ejercicios ?? []).find((x) => x.tipo === e.tipo)?.anguloMax;
    return a && (a - e.anguloMax) / a > 0.08;
  });
}

const estadoDolor = (d, antes) => (d >= 7 || (antes != null && d - antes >= 2) ? 'revisar' : d >= 4 ? 'atencion' : 'bien');

// Índices del nervio mediano de las sesiones con prueba EMG (hasta `s` incluida si se da).
function indicesEmg(ses) {
  const { lineaBase: base, medidasEmg: medidas } = depsReporte();
  const b = base(ses);
  return ses.filter((x) => x.emg?.prueba).map((x) => ({ sesion: x, indice: medidas(x.emg.prueba, b).indiceMediano }));
}
const estadoIndice = (i, previo) => (previo && i != null && (previo - i) / previo > 0.15 ? 'revisar' : i != null && i >= 105 ? 'bien' : 'atencion');

function lecturaPaciente(p, hoy) {
  const ses = ordenarSesiones(p);
  const ult = ses[ses.length - 1], prev = ses[ses.length - 2], primera = ses[0];
  const areas = [];

  // Movimiento
  const conMedidos = ses.filter((s) => porcentajeNormal(s) != null);
  if (!conMedidos.length) {
    areas.push({ id: 'movimiento', estado: 'sin-datos', frase: 'Aún no hay ejercicios medidos.' });
  } else {
    const pct = porcentajeNormal(conMedidos[conMedidos.length - 1]);
    const dif = pct - porcentajeNormal(conMedidos[0]);
    const estado = bajoMovimiento(ult, prev) ? 'revisar' : dif >= 5 ? 'bien' : 'atencion';
    areas.push({ id: 'movimiento', estado, frase: `Mueve la muñeca al ${pct} % de lo normal (${signo(dif)} puntos desde la primera sesión).` });
  }

  // Dolor
  const conDolor = ses.filter((s) => s.dolorEVA != null);
  if (!conDolor.length) {
    areas.push({ id: 'dolor', estado: 'sin-datos', frase: 'Aún no hay dolor registrado.' });
  } else {
    const d = conDolor[conDolor.length - 1].dolorEVA, dPrev = conDolor[conDolor.length - 2]?.dolorEVA;
    areas.push({ id: 'dolor', estado: estadoDolor(d, dPrev), frase: `Dolor ${d}/10 en la última sesión (al inicio: ${conDolor[0].dolorEVA}/10).` });
  }

  // Músculo (EMG)
  const indices = indicesEmg(ses);
  const ultimo = indices[indices.length - 1];
  if (!ultimo || ultimo.indice == null) {
    areas.push({ id: 'musculo', estado: 'sin-datos', frase: 'Sin prueba EMG (empieza en la Fase 2).' });
  } else {
    areas.push({ id: 'musculo', estado: estadoIndice(ultimo.indice, indices[indices.length - 2]?.indice), frase: `Índice del nervio mediano: ${Math.round(ultimo.indice)} % de la primera prueba.` });
  }

  // Constancia
  if (!ult) {
    areas.push({ id: 'constancia', estado: 'sin-datos', frase: 'Aún no hay sesiones.' });
  } else {
    const hace = diasHasta(ult.fecha, hoy);
    const citaVencida = p.proximaCita && p.proximaCita < hoy && !ses.some((s) => s.fecha >= p.proximaCita);
    const estado = hace > 21 ? 'revisar' : hace > 10 || citaVencida ? 'atencion' : 'bien';
    const cita = p.proximaCita ? ` Próxima cita: ${new Date(p.proximaCita + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}.` : '';
    areas.push({ id: 'constancia', estado, frase: `${ses.length} ${ses.length === 1 ? 'sesión' : 'sesiones'}; la última hace ${hace} ${hace === 1 ? 'día' : 'días'}.${cita}` });
  }

  areas.forEach((a) => { a.titulo = TITULOS_AREA[a.id]; });
  const en = (estado) => areas.filter((a) => a.estado === estado).map((a) => NOMBRE_AREA[a.id]).join(', ');
  const general = en('revisar') ? `Revisar: ${en('revisar')}.` : en('atencion') ? `Va avanzando; atención en ${en('atencion')}.` : 'Va bien.';
  return { general, areas: areas.map(({ id, titulo, estado, frase }) => ({ id, titulo, estado, frase })) };
}

// Chips de una sesión frente a la anterior y la primera frase de la comparación.
function lecturaSesion(p, s) {
  const { comparacionConAnterior: comparar } = depsReporte();
  const ses = ordenarSesiones(p);
  const i = ses.indexOf(s);
  const prev = i > 0 ? ses[i - 1] : null;
  const chips = [];

  const pct = porcentajeNormal(s), pctPrev = prev ? porcentajeNormal(prev) : null;
  if (pct == null || pctPrev == null) chips.push({ id: 'movimiento', titulo: 'Movimiento', estado: 'sin-datos', texto: '—' });
  else if (bajoMovimiento(s, prev)) chips.push({ id: 'movimiento', titulo: 'Movimiento', estado: 'revisar', texto: 'Baja' });
  else if (pct - pctPrev >= 1) chips.push({ id: 'movimiento', titulo: 'Movimiento', estado: 'bien', texto: 'Sube' });
  else chips.push({ id: 'movimiento', titulo: 'Movimiento', estado: 'atencion', texto: 'Igual' });

  if (s.dolorEVA != null) {
    const antes = s.chequeo?.dolorAntes;
    chips.push({ id: 'dolor', titulo: 'Dolor', estado: estadoDolor(s.dolorEVA, prev?.dolorEVA), texto: antes != null ? `${antes} → ${s.dolorEVA}` : `${s.dolorEVA}/10` });
  } else {
    chips.push({ id: 'dolor', titulo: 'Dolor', estado: 'sin-datos', texto: '—' });
  }

  if (s.emg?.prueba) {
    const indices = indicesEmg(ses.slice(0, i + 1));
    const actual = indices[indices.length - 1]?.indice;
    if (actual != null) chips.push({ id: 'musculo', titulo: 'Músculo', estado: estadoIndice(actual, indices[indices.length - 2]?.indice), texto: `${Math.round(actual)} %` });
  }
  return { chips, frase: comparar(p, s)[0] };
}

if (typeof module !== 'undefined') module.exports = { ESTADOS, lecturaPaciente, lecturaSesion, porcentajeNormal };
