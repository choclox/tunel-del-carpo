/* PDF del reporte de una sesión (jsPDF 2.5.1, cargado del CDN solo al descargar).
 * Las funciones de datos son puras; el texto se limpia para Helvetica (Latin-1). */

const URL_JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
const TEXTO_SIN_JSPDF = 'No se pudo generar el PDF: revise la conexión a internet.';

// Dependencias globales en el navegador; require en Node (pruebas).
const depsPdf = () => (typeof EJERCICIOS !== 'undefined'
  ? { EJERCICIOS, lineaBase, medidasEmg, NOMBRES_MUSCULO, MUSCULOS, lecturaSesion, comparacionConAnterior, medidoCon }
  : { ...require('./data.js'), ...require('./emg.js'), ...require('./reporte.js'), ...require('./resumen-sesion.js') });

const REEMPLAZOS_PDF = [['→', '->'], ['≥', '>='], ['≤', '<='], ['–', '-'], ['—', '-'], ['−', '-'], ['…', '...'], ['✓', 'OK'], ['⚠', '!'],
  ['“', '"'], ['”', '"'], ['‘', "'"], ['’', "'"]];

// Helvetica solo tiene Latin-1: lo demás se cambia por '?' (si no, jsPDF borra el carácter o
// estropea toda la línea).
function textoPdf(texto) {
  let s = String(texto ?? '');
  for (const [a, b] of REEMPLAZOS_PDF) s = s.split(a).join(b);
  return Array.from(s, (c) => (c.codePointAt(0) > 0xff ? '?' : c)).join('');
}

// <id>_sesion_<fecha>.pdf; la segunda sesión del mismo día lleva _2, la tercera _3…
function nombreArchivoPdf(p, s) {
  const mismoDia = p.sesiones.filter((x) => x.fecha === s.fecha);
  const n = mismoDia.indexOf(s) + 1;
  return `${p.id}_sesion_${s.fecha}${n > 1 ? `_${n}` : ''}.pdf`;
}

const fechaLargaPdf = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const ENTIDADES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };
const sinHtml = (t) => String(t).replace(/<[^>]*>/g, '').replace(/&(lt|gt|quot|#39|amp);/g, (e) => ENTIDADES[e]);
const num = (v) => (v == null || !isFinite(v) ? '—' : String(Math.round(v)));
const RECOMENDACION = { ok: 'Todo bien', precaucion: 'Precaución', detener: 'No hacer la sesión' };

// avisosDe(p, sesionesHastaS) -> [{ nivel, texto(HTML) }]; en el navegador es calcularObservaciones.
function datosReporteSesion(p, s, hoy, avisosDe) {
  const { EJERCICIOS: EJ, lineaBase: base, medidasEmg: medidas, NOMBRES_MUSCULO: NOMBRES, MUSCULOS: MUS, lecturaSesion: lectura, comparacionConAnterior: comparar, medidoCon: medido } = depsPdf();
  const ses = [...p.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const i = ses.indexOf(s);
  const prev = i > 0 ? ses[i - 1] : null;
  const diasPostop = p.fechaCirugia ? Math.round((new Date(s.fecha + 'T12:00:00') - new Date(p.fechaCirugia + 'T12:00:00')) / 86400000) : null;

  const ejercicios = (s.ejercicios ?? []).filter((e) => EJ[e.tipo]).map((e) => {
    const a = prev?.ejercicios?.find((x) => x.tipo === e.tipo)?.anguloMax;
    const d = a == null ? null : Math.round(e.anguloMax - a);
    return {
      nombre: EJ[e.tipo].nombre,
      repeticiones: `${num(e.repeticiones)} / ${num(e.repeticionesObjetivo)}${e.repeticionesManual != null ? ` (manual ${e.repeticionesManual})` : ''}`,
      anguloMax: `${num(e.anguloMax)}°`,
      cambio: d == null ? '—' : d === 0 ? '0°' : `${d > 0 ? '+' : ''}${d}°`,
      pctNormal: `${num(Math.min(100, (e.anguloMax / EJ[e.tipo].ref) * 100))} %`,
    };
  });

  let emg = null;
  if (s.emg?.prueba) {
    const m = medidas(s.emg.prueba, base(ses));
    const pct = { tenar: m.tenarPct, flexores: m.flexoresPct, extensores: m.extensoresPct };
    emg = {
      musculos: MUS.map((k) => ({ nombre: NOMBRES[k], picos: s.emg.prueba[k].picos.map(num).join(' · '), media: num(s.emg.prueba[k].media), pct: pct[k] == null ? '—' : `${num(pct[k])} %` })),
      indice: m.indiceMediano == null ? '—' : `${num(m.indiceMediano)} %`,
      cocontraccion: m.cocontraccion == null ? '—' : `${num(m.cocontraccion)} %`,
    };
  }

  const ls = lectura(p, s);
  return {
    encabezado: {
      paciente: { nombre: p.nombre, id: p.id, mano: p.mano ?? '—', fechaCirugia: fechaLargaPdf(p.fechaCirugia) },
      sesion: { fecha: fechaLargaPdf(s.fecha), numero: i + 1, fase: s.rutina?.etapa ?? null, diasPostop, duracionMin: s.duracionMin ?? null, origen: s.origen === 'simulador' ? 'Simulador' : s.origen === 'usb' ? 'Dispositivo USB' : '—' },
      generado: fechaLargaPdf(hoy),
    },
    lectura: { chips: ls.chips, frases: comparar(p, s) },
    chequeo: s.chequeo ? { ...s.chequeo, recomendacion: RECOMENDACION[s.chequeo.nivel] ?? '—' } : null,
    ejercicios,
    rutina: s.rutina?.pasos?.length ? s.rutina.pasos.map((x) => ({ nombre: x.nombre, medidoCon: medido(x), objetivo: num(x.repeticionesObjetivo), detectadas: num(x.repeticiones), manual: num(x.repeticionesManual) })) : null,
    emg,
    avisos: (avisosDe(p, ses.slice(0, i + 1)) ?? []).map((o) => sinHtml(o.texto)),
    notas: s.notas ?? '',
    proximaCita: p.proximaCita ? fechaLargaPdf(p.proximaCita) : 'Por definir',
  };
}

/* ======================= Generación del PDF (navegador) ======================= */

let promesaJsPdf = null;
function cargarJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  promesaJsPdf ??= new Promise((ok, falla) => {
    const sc = document.createElement('script');
    sc.src = URL_JSPDF;
    sc.onload = () => (window.jspdf?.jsPDF ? ok(window.jspdf.jsPDF) : falla(new Error('jsPDF no disponible')));
    sc.onerror = () => falla(new Error('no se pudo cargar jsPDF'));
    document.head.appendChild(sc);
  }).catch((e) => { promesaJsPdf = null; throw e; });
  return promesaJsPdf;
}

// Gráfica del ángulo máximo por sesión hasta `s`, como PNG (tema claro fijo).
function imagenEvolucion(p, s) {
  const ses = [...p.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const hasta = ses.slice(0, ses.indexOf(s) + 1);
  const colores = ['#0a8f80', '#eb6834', '#2a78d6', '#eda100', '#e87ba4'];
  const tipos = ORDEN_EJERCICIOS.filter((t) => hasta.some((x) => x.ejercicios?.some((e) => e.tipo === t)));
  if (!tipos.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 360;
  const caja = document.createElement('div');
  caja.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:360px';
  caja.appendChild(canvas);
  document.body.appendChild(caja);
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: hasta.map((x) => fmtFecha(x.fecha, true)),
      datasets: tipos.map((t, k) => ({
        label: EJERCICIOS[t].corto, data: hasta.map((x) => x.ejercicios?.find((e) => e.tipo === t)?.anguloMax ?? null),
        borderColor: colores[k % colores.length], backgroundColor: colores[k % colores.length], borderWidth: 2, pointRadius: 3, spanGaps: true,
      })),
    },
    plugins: [{ id: 'fondoBlanco', beforeDraw: (c) => { c.ctx.save(); c.ctx.fillStyle = '#ffffff'; c.ctx.fillRect(0, 0, c.width, c.height); c.ctx.restore(); } }],
    options: {
      responsive: false, animation: false, devicePixelRatio: 2,
      plugins: { legend: { position: 'top', labels: { color: '#0b1f33' } } },
      scales: { x: { ticks: { color: '#43566b' }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: '#43566b' }, grid: { color: '#e3e9f0' }, title: { display: true, text: 'Ángulo máximo (°)', color: '#43566b' } } },
    },
  });
  const jpg = canvas.toDataURL('image/jpeg', 0.85);
  chart.destroy();
  caja.remove();
  return jpg;
}

function construirPdf(JsPDF, d, imagen) {
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const M = 15, ANCHO = 180, LIMITE = 280;
  let y = M;
  const t = (x) => textoPdf(x);
  const salto = (alto) => { if (y + alto > LIMITE) { doc.addPage(); y = M; } };
  const parrafo = (texto, { tam = 10, negrita = false, sangria = 0 } = {}) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(tam);
    for (const linea of doc.splitTextToSize(t(texto), ANCHO - sangria)) {
      salto(tam * 0.45);
      doc.text(linea, M + sangria, y);
      y += tam * 0.45;
    }
  };
  const titulo = (texto) => {
    salto(12); y += 3;
    doc.setTextColor('#1e6895'); parrafo(texto, { tam: 12, negrita: true }); doc.setTextColor('#000000');
    y += 1;
  };
  const tabla = (columnas, filas, anchos) => {
    const fila = (celdas, negrita) => {
      doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(9);
      const partes = celdas.map((c, k) => doc.splitTextToSize(t(c), anchos[k] - 2));
      const alto = Math.max(...partes.map((p) => p.length)) * 4 + 1.5;
      salto(alto);
      let x = M;
      partes.forEach((p, k) => { doc.text(p, x, y + 3); x += anchos[k]; });
      y += alto;
      doc.setDrawColor('#d0d7de'); doc.line(M, y - 0.8, M + ANCHO, y - 0.8);
    };
    fila(columnas, true);
    filas.forEach((f) => fila(f, false));
    y += 4; // la línea siguiente usa y como línea base: sin esto se monta sobre la última fila
  };

  doc.setTextColor('#1e6895'); parrafo('Kinemo · Reporte de sesión', { tam: 16, negrita: true }); doc.setTextColor('#000000');
  const { paciente: pa, sesion: se } = d.encabezado;
  parrafo(`${pa.nombre} (${pa.id}) · Mano ${String(pa.mano).toLowerCase()} · Cirugía: ${pa.fechaCirugia}`, { negrita: true });
  parrafo(`Sesión ${se.numero} del ${se.fecha}${se.fase ? ` · Fase ${se.fase}` : ''}${se.diasPostop != null ? ` · ${se.diasPostop} días desde la cirugía` : ''}${se.duracionMin ? ` · ${se.duracionMin} min` : ''} · Origen: ${se.origen}`);
  parrafo(`Profesional: ${d.profesional || '—'} · Generado el ${d.encabezado.generado}`, { tam: 9 });

  titulo('Lectura de la sesión');
  parrafo(d.lectura.chips.map((c) => `${c.titulo}: ${c.texto}`).join('   ·   '));
  d.lectura.frases.forEach((f) => parrafo(`- ${f}`, { sangria: 2 }));

  if (d.chequeo) {
    titulo('Chequeo de seguridad');
    parrafo(`Dolor antes: ${d.chequeo.dolorAntes}/10 · Hormigueo: ${d.chequeo.hormigueo} · Herida: ${d.chequeo.herida} · Recomendación: ${d.chequeo.recomendacion}${d.chequeo.continuoBajoCriterio ? ' · Continuó bajo criterio del profesional' : ''}`);
  }

  titulo('Ejercicios medidos');
  if (d.ejercicios.length) tabla(['Ejercicio', 'Repeticiones', 'Ángulo máx.', 'Cambio', '% de lo normal'], d.ejercicios.map((e) => [e.nombre, e.repeticiones, e.anguloMax, e.cambio, e.pctNormal]), [60, 45, 25, 20, 30]);
  else parrafo('Sin ejercicios medidos en esta sesión.');

  if (imagen) {
    salto(78);
    doc.addImage(imagen, 'JPEG', M, y, ANCHO, 81);
    y += 84;
  }

  if (d.rutina) {
    titulo('Rutina grabada');
    tabla(['Ejercicio', 'Medido con', 'Objetivo', 'Detectadas', 'Manual'], d.rutina.map((r) => [r.nombre, r.medidoCon, r.objetivo, r.detectadas, r.manual]), [72, 36, 24, 24, 24]);
  }

  if (d.emg) {
    titulo('Prueba de fuerza muscular (EMG)');
    tabla(['Músculo', 'Contracciones', 'Promedio', '% primera prueba'], d.emg.musculos.map((m) => [m.nombre, m.picos, m.media, m.pct]), [50, 60, 30, 40]);
    parrafo(`Índice del nervio mediano: ${d.emg.indice} · Co-contracción: ${d.emg.cocontraccion}`);
  }

  titulo('Avisos');
  if (d.avisos.length) d.avisos.forEach((a) => parrafo(`- ${a}`, { sangria: 2 }));
  else parrafo('Sin avisos.');

  titulo('Notas del profesional');
  parrafo(d.notas || 'Sin notas.');

  titulo('Próxima cita');
  parrafo(d.proximaCita);

  const paginas = doc.getNumberOfPages();
  for (let k = 1; k <= paginas; k++) {
    doc.setPage(k);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor('#555555');
    doc.text(t(`Kinemo · Prototipo académico. No es un dispositivo médico certificado. — Página ${k} de ${paginas}`), M, 290);
  }
  return doc;
}

async function descargarPdfSesion(p, s) {
  let JsPDF;
  try {
    JsPDF = await cargarJsPdf();
  } catch (e) {
    toast(TEXTO_SIN_JSPDF);
    return;
  }
  const d = datosReporteSesion(p, s, hoyISO(), calcularObservaciones);
  d.profesional = leerSesion()?.nombre ?? '';
  construirPdf(JsPDF, d, imagenEvolucion(p, s)).save(nombreArchivoPdf(p, s));
}

// Descarga el PDF de la sesión `id` del paciente abierto.
function descargarPdfDeSesion(id) {
  const p = paciente();
  const s = p?.sesiones.find((x) => x.id === id);
  if (p && s) descargarPdfSesion(p, s);
}

if (typeof module !== 'undefined') module.exports = { textoPdf, nombreArchivoPdf, datosReporteSesion };
