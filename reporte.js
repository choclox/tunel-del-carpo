/* Reporte: lectura rápida del paciente y de cada sesión en lenguaje simple, con semáforo
 * (bien / atención / revisar / sin datos). Las funciones de cálculo son puras y reciben `hoy`. */

// Dependencias globales en el navegador; require en Node (pruebas).
const depsReporte = () => (typeof EJERCICIOS !== 'undefined'
  ? { EJERCICIOS, lineaBase, medidasEmg, comparacionConAnterior, esSimulada, sesionesClinicas }
  : { ...require('./data.js'), ...require('./emg.js'), ...require('./resumen-sesion.js') });

const ESTADOS = ['bien', 'atencion', 'revisar', 'sin-datos'];
const TITULOS_AREA = { movimiento: 'Movimiento', dolor: 'Dolor', musculo: 'Tenar/extensores', constancia: 'Constancia' };
const NOMBRE_AREA = { movimiento: 'movimiento', dolor: 'dolor', musculo: 'tenar/extensores', constancia: 'constancia' };
// Término del glosario que explica cada área.
const TERMINO_AREA = { movimiento: 'movimiento', dolor: 'dolor', musculo: 'razon', constancia: 'constancia' };

const diasHasta = (desde, hasta) => Math.round((new Date(hasta + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 86400000);
const ordenarSesiones = (p) => [...(p.sesiones ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
const signo = (n) => `${n >= 0 ? '+' : ''}${n}`;

// Promedio del % de lo normal (tope 100 % por ejercicio) de los ejercicios medidos con IMU.
function porcentajeNormal(s) {
  const { EJERCICIOS: EJ } = depsReporte();
  const v = (s.ejercicios ?? []).filter((e) => EJ[e.tipo] && e.anguloMax != null).map((e) => Math.min(100, (e.anguloMax / EJ[e.tipo].ref) * 100));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

// Ejercicios que bajaron más del 8 % frente a la sesión anterior.
function ejerciciosQueBajaron(s, prev) {
  if (!prev) return [];
  const { EJERCICIOS: EJ } = depsReporte();
  return (s.ejercicios ?? []).filter((e) => {
    const a = (prev.ejercicios ?? []).find((x) => x.tipo === e.tipo)?.anguloMax;
    return a && (a - e.anguloMax) / a > 0.08;
  }).map((e) => EJ[e.tipo]?.nombre.toLowerCase() ?? e.tipo);
}
const bajoMovimiento = (s, prev) => ejerciciosQueBajaron(s, prev).length > 0;

// Cómo se contó un paso de la rutina: 'IMU', 'EMG (<músculo>)' o 'Manual'. Las sesiones guardadas
// antes de `medicion` se midieron con el IMU si tenían `tipo` y no guardaron la señal cruda.
function medidoCon(paso) {
  const m = paso.medicion;
  if (m === undefined) return paso.tipo && !paso.senal ? 'IMU' : 'Manual';
  if (m?.fuente === 'emg') return `EMG (${m.musculo})`;
  return m?.fuente === 'imu' ? 'IMU' : 'Manual';
}

// "Medido con: IMU 2 · EMG 2 · Manual 1" para la línea de tiempo ('' si la sesión no tiene rutina).
function resumenMedicion(s) {
  const n = { IMU: 0, EMG: 0, Manual: 0 };
  for (const x of s.rutina?.pasos ?? []) n[medidoCon(x).split(' ')[0]]++;
  const partes = Object.entries(n).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`);
  return partes.length ? `Medido con: ${partes.join(' · ')}` : '';
}

const estadoDolor = (d, antes) => (d >= 7 || (antes != null && d - antes >= 2) ? 'revisar' : d >= 4 ? 'atencion' : 'bien');

// Índices del nervio mediano de las sesiones con prueba EMG (hasta `s` incluida si se da).
function indicesEmg(ses) {
  const { lineaBase: base, medidasEmg: medidas } = depsReporte();
  const b = base(ses);
  return ses.filter((x) => x.emg?.prueba).map((x) => ({ sesion: x, indice: medidas(x.emg.prueba, b).indiceMediano }));
}
const estadoIndice = (i, previo) => (previo && i != null && (previo - i) / previo > 0.15 ? 'revisar' : i != null && i >= 105 ? 'bien' : 'atencion');

// Cada frase dice el motivo real de su estado (mismos umbrales que estadoDolor y estadoIndice).
function fraseDolor(d, antes, inicio) {
  const inicial = `(al inicio: ${inicio}/10)`;
  if (antes != null && d - antes >= 2) return `Dolor ${d}/10 en la última sesión: subió de ${antes} a ${d} frente a la sesión anterior ${inicial}.`;
  if (d >= 7) return `Dolor ${d}/10 en la última sesión: 7 o más ${inicial}.`;
  if (d >= 4) return `Dolor ${d}/10 en la última sesión: entre 4 y 6 ${inicial}.`;
  return `Dolor ${d}/10 en la última sesión ${inicial}.`;
}

function fraseIndice(i, previo) {
  const texto = `Razón tenar/extensores: ${Math.round(i)} % de la primera prueba`;
  if (previo && (previo - i) / previo > 0.15) return `${texto}; bajó ${Math.round(((previo - i) / previo) * 100)} % frente a la prueba anterior (${Math.round(previo)} %).`;
  return i >= 105 ? `${texto}.` : `${texto}; aún no la supera en 5 %.`;
}

function lecturaPaciente(p, hoy) {
  const todas = ordenarSesiones(p);
  const ses = depsReporte().sesionesClinicas(todas);
  const ult = ses[ses.length - 1], prev = ses[ses.length - 2], primera = ses[0];
  const areas = [];

  // Movimiento
  const conMedidos = ses.filter((s) => porcentajeNormal(s) != null);
  if (!conMedidos.length) {
    areas.push({ id: 'movimiento', estado: 'sin-datos', frase: 'Aún no hay ejercicios medidos.' });
  } else {
    const pct = porcentajeNormal(conMedidos[conMedidos.length - 1]);
    const dif = pct - porcentajeNormal(conMedidos[0]);
    const bajaron = ejerciciosQueBajaron(ult, prev);
    const estado = bajaron.length ? 'revisar' : dif >= 5 ? 'bien' : 'atencion';
    const motivo = bajaron.length ? `; bajó más de 8 % en ${bajaron.join(', ')} frente a la sesión anterior.`
      : conMedidos.length === 1 ? '; es la primera medición.'
      : dif >= 5 ? ` (${signo(dif)} puntos desde la primera sesión).`
      : ` (${signo(dif)} puntos desde la primera sesión; no mejoró al menos 5).`;
    areas.push({ id: 'movimiento', estado, frase: `Mueve la muñeca al ${pct} % de lo normal${motivo}` });
  }

  // Dolor
  const conDolor = ses.filter((s) => s.dolorEVA != null);
  if (!conDolor.length) {
    areas.push({ id: 'dolor', estado: 'sin-datos', frase: 'Aún no hay dolor registrado.' });
  } else {
    const d = conDolor[conDolor.length - 1].dolorEVA, dPrev = conDolor[conDolor.length - 2]?.dolorEVA;
    areas.push({ id: 'dolor', estado: estadoDolor(d, dPrev), frase: fraseDolor(d, dPrev, conDolor[0].dolorEVA) });
  }

  // Razón tenar/extensores (EMG)
  const indices = indicesEmg(ses);
  const ultimo = indices[indices.length - 1];
  if (!ultimo || ultimo.indice == null) {
    areas.push({ id: 'musculo', estado: 'sin-datos', frase: 'Sin prueba EMG (empieza en la Fase 2).' });
  } else {
    const previo = indices[indices.length - 2]?.indice;
    areas.push({ id: 'musculo', estado: estadoIndice(ultimo.indice, previo), frase: fraseIndice(ultimo.indice, previo) });
  }

  // Constancia
  if (!ult) {
    areas.push({ id: 'constancia', estado: 'sin-datos', frase: 'Aún no hay sesiones.' });
  } else {
    const hace = diasHasta(ult.fecha, hoy);
    const citaVencida = p.proximaCita && p.proximaCita < hoy && !ses.some((s) => s.fecha >= p.proximaCita);
    const estado = hace > 21 ? 'revisar' : hace > 10 || citaVencida ? 'atencion' : 'bien';
    const fechaCita = p.proximaCita && new Date(p.proximaCita + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
    const cita = !fechaCita ? '' : citaVencida ? ` Cita vencida: ${fechaCita}.` : ` Próxima cita: ${fechaCita}.`;
    const limite = hace > 21 ? ' (más de 21)' : hace > 10 ? ' (más de 10)' : '';
    areas.push({ id: 'constancia', estado, frase: `${ses.length} ${ses.length === 1 ? 'sesión' : 'sesiones'}; la última hace ${hace} ${hace === 1 ? 'día' : 'días'}${limite}.${cita}` });
  }

  areas.forEach((a) => { a.titulo = TITULOS_AREA[a.id]; });
  const en = (estado) => areas.filter((a) => a.estado === estado).map((a) => NOMBRE_AREA[a.id]).join(', ');
  const general = en('revisar') ? `Revisar: ${en('revisar')}.` : en('atencion') ? `Va avanzando; atención en ${en('atencion')}.` : en('bien') ? 'Va bien.' : 'Aún no hay datos para una lectura.';
  return { general, simuladas: todas.length - ses.length, areas: areas.map(({ id, titulo, estado, frase }) => ({ id, titulo, estado, frase })) };
}

// Chips de una sesión frente a la anterior y la primera frase de la comparación.
function lecturaSesion(p, s) {
  const { comparacionConAnterior: comparar, esSimulada: simulada, sesionesClinicas: clinicas } = depsReporte();
  if (simulada(s)) return { chips: [{ id: 'simulada', titulo: 'Sesión', estado: 'sin-datos', texto: 'Simulada' }], frase: comparar(p, s)[0] };
  const ses = clinicas(ordenarSesiones(p));
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
    if (actual != null) chips.push({ id: 'musculo', titulo: 'Tenar/extensores', estado: estadoIndice(actual, indices[indices.length - 2]?.indice), texto: `${Math.round(actual)} %` });
  }
  return { chips, frase: comparar(p, s)[0] };
}

/* ======================= Pantalla ======================= */

const ETIQUETA_ESTADO = { bien: 'Bien', atencion: 'Atención', revisar: 'Revisar', 'sin-datos': 'Sin datos' };

function htmlChip(c) {
  return `<span class="chip-estado chip" data-estado="${c.estado}" title="${esc(ETIQUETA_ESTADO[c.estado])}">
    <span class="semaforo" aria-hidden="true"></span>${esc(c.titulo)}: <b>${esc(c.texto)}</b><span class="sr-solo"> (${esc(ETIQUETA_ESTADO[c.estado])})</span></span>`;
}

// Lectura rápida y línea de tiempo de la sección Reporte.
function renderReporte(p) {
  const l = lecturaPaciente(p, hoyISO());
  $('#lectura-general').textContent = l.general;
  const n = l.simuladas;
  $('#lectura-nota').textContent = `Lectura orientativa calculada con los datos registrados. No es un diagnóstico.${n ? ` No incluye ${n === 1 ? '1 sesión simulada' : `${n} sesiones simuladas`}.` : ''}`;
  $('#lectura-areas').innerHTML = l.areas.map((a) => `<li class="area" data-estado="${a.estado}">
      <span class="semaforo" aria-hidden="true"></span>
      <div><div class="area-titulo">${esc(a.titulo)}${botonTermino(TERMINO_AREA[a.id])}</div><div class="area-estado">${ETIQUETA_ESTADO[a.estado]}</div>
      <p>${esc(a.frase)}</p></div></li>`).join('');

  const ses = sesionesOrdenadas(p);
  const items = ses.map((s, i) => {
    const ls = lecturaSesion(p, s);
    const marcas = [];
    if (s.perdidaDatosPct >= 1 || (s.calibracion && (!s.calibracion.ok || s.calibracion.tiempoS > 30))) marcas.push('<span class="marca marca-alerta" title="Se perdieron datos o la calibración falló">⚠ datos</span>');
    if (s.origen === 'simulador') marcas.push('<span class="marca">Simulador</span>');
    if (s.notas) marcas.push('<span class="marca marca-nota">Nota</span>');
    return { fecha: s.fecha, html: `<li data-id="${esc(s.id)}" class="${s.id === estado.sesionId ? 'seleccionada' : ''}">
      <div class="ses-cabecera">
        <div><b>${fmtFecha(s.fecha)}</b> <span class="muted">· Sesión ${i + 1} · ${s.rutina ? `Fase ${esc(s.rutina.etapa)}` : 'Sin rutina'}</span></div>
        <div class="ses-marcas">${marcas.join('')}</div>
      </div>
      <div class="ses-chips">${ls.chips.map(htmlChip).join('')}</div>
      <p class="ses-frase">${esc(ls.frase)}</p>
      ${s.rutina?.pasos?.length ? `<p class="ses-medicion muted">${esc(resumenMedicion(s))}</p>` : ''}
      <div class="ses-acciones">
        <button class="btn btn-ghost btn-ver" data-id="${esc(s.id)}">Ver detalle</button>
        <details class="ses-mas">
          <summary>Más</summary>
          <button class="btn btn-ghost btn-notas" data-id="${esc(s.id)}">Notas</button>
          <button class="btn btn-pdf" data-id="${esc(s.id)}"><svg class="ic"><use href="#i-download"/></svg>Descargar PDF</button>
        </details>
      </div>
    </li>` };
  });
  for (const n of p.noRealizadas ?? []) {
    items.push({ fecha: n.fecha, html: `<li class="ses-no-realizada">
      <div class="ses-cabecera"><div><b>${fmtFecha(n.fecha)}</b> <span class="muted">· Sesión no realizada</span></div></div>
      <p class="ses-frase">Motivo: ${esc(n.motivos.join('; '))}.</p>
    </li>` });
  }
  $('#lista-sesiones').innerHTML = items.sort((a, b) => a.fecha.localeCompare(b.fecha)).reverse().map((x) => x.html).join('') || '<li class="muted">Aún no hay sesiones.</li>';
}

if (typeof module !== 'undefined') module.exports = { ESTADOS, lecturaPaciente, lecturaSesion, porcentajeNormal, medidoCon, resumenMedicion };
