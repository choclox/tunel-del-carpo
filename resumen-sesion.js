/* Paso 6 de la sesión guiada: resumen de lo que mejoró frente a la sesión anterior y hoja
 * imprimible para el paciente. Las funciones de cálculo son puras. */

// Dependencias globales en el navegador; require en Node (pruebas).
const depsResumen = () => (typeof EJERCICIOS !== 'undefined'
  ? { EJERCICIOS, etapaPorNumero, etapaSugerida, lineaBase, medidasEmg }
  : { ...require('./data.js'), ...require('./rutinas.js'), ...require('./emg.js') });

const TEXTO_PRIMERA_SESION = 'Primera sesión: será la referencia para comparar.';
const TEXTO_SIN_COMPARABLES = 'Sin datos comparables con la sesión anterior.';
const fechaLarga = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const conSigno = (n) => `${n >= 0 ? '+' : ''}${n}`;

function sumarDiasISO(iso, n) {
  const f = new Date(iso + 'T12:00:00');
  f.setDate(f.getDate() + n);
  return f.toISOString().slice(0, 10);
}

// Hasta 3 frases sencillas, la mejor primero: el ejercicio que más mejoró, el dolor antes → después
// y el índice del nervio mediano; si sobra espacio, otros ejercicios.
function comparacionConAnterior(p, s) {
  const { EJERCICIOS: EJ, lineaBase: base, medidasEmg: medidas } = depsResumen();
  const ses = [...p.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const prev = ses.filter((x) => x.fecha < s.fecha || (x.fecha === s.fecha && ses.indexOf(x) < ses.indexOf(s))).pop();
  if (!prev) return [TEXTO_PRIMERA_SESION];

  const movimientos = (s.ejercicios ?? []).map((e) => {
    const a = (prev.ejercicios ?? []).find((x) => x.tipo === e.tipo)?.anguloMax;
    if (a == null || !EJ[e.tipo]) return null;
    const d = Math.round(e.anguloMax - a);
    return { puntaje: d / EJ[e.tipo].ref, texto: `${EJ[e.tipo].nombre}: ${Math.round(e.anguloMax)}° (${d === 0 ? 'igual que' : `${conSigno(d)}° que`} la sesión anterior)` };
  }).filter(Boolean).sort((x, y) => y.puntaje - x.puntaje);

  const otras = [];
  const antes = s.chequeo?.dolorAntes;
  if (antes != null && s.dolorEVA != null) otras.push({ puntaje: (antes - s.dolorEVA) / 10, texto: `Dolor: ${antes} → ${s.dolorEVA} durante la sesión` });

  const pruebas = ses.filter((x) => x.emg?.prueba && ses.indexOf(x) <= ses.indexOf(s));
  if (s.emg?.prueba && pruebas.length > 1) {
    const b = base(ses);
    const ahora = medidas(s.emg.prueba, b).indiceMediano;
    const antesIdx = medidas(pruebas[pruebas.length - 2].emg.prueba, b).indiceMediano;
    if (ahora != null && antesIdx != null) {
      otras.push({ puntaje: (ahora - antesIdx) / 100, texto: `Índice del nervio mediano: ${Math.round(ahora)} % (${conSigno(Math.round(ahora - antesIdx))} puntos)` });
    }
  }

  const elegidas = [...movimientos.slice(0, 1), ...otras].sort((x, y) => y.puntaje - x.puntaje);
  for (const m of movimientos.slice(1)) if (elegidas.length < 3) elegidas.push(m);
  return elegidas.length ? elegidas.slice(0, 3).map((x) => x.texto) : [TEXTO_SIN_COMPARABLES];
}

function datosHojaPaciente(p, s) {
  const { EJERCICIOS: EJ, etapaPorNumero: porNumero, etapaSugerida: sugerida } = depsResumen();
  const etapa = porNumero(s.rutina?.etapa ?? sugerida(p.fechaCirugia, s.fecha));
  const hizo = s.rutina?.pasos?.length
    // Solo repeticiones contadas (a mano o por el detector): nunca el objetivo como si se hubiera hecho.
    ? s.rutina.pasos.map((x) => ({ nombre: x.nombre, reps: x.repeticionesManual ?? x.repeticiones ?? null }))
    : (s.ejercicios ?? []).map((e) => ({ nombre: EJ[e.tipo]?.nombre ?? e.tipo, reps: e.repeticiones }));
  return {
    nombre: p.nombre,
    fecha: fechaLarga(s.fecha),
    hizo,
    comoVa: comparacionConAnterior(p, s),
    ejercicios: etapa.pasos.map((x) => ({ nombre: x.nombre, reps: x.reps, sostenerS: x.sostenerS ?? null })),
    cuidados: etapa.cuidado,
    proximaCita: p.proximaCita ? fechaLarga(p.proximaCita) : 'Por definir',
  };
}

/* ======================= Pantalla ======================= */

let resumenActual = null; // { pacienteId, sesionId }

function abrirResumen(p, s) {
  resumenActual = { pacienteId: p.id, sesionId: s.id };
  const dlg = $('#dlg-resumen');
  dlg.dataset.destino = '';
  pintarPasosSesion(dlg, 5, !s.emg?.prueba);
  $('#rs-sub').textContent = `${p.nombre} · ${fmtFecha(s.fecha)}`;
  $('#rs-comparacion').innerHTML = comparacionConAnterior(p, s).map((t) => `<li>${esc(t)}</li>`).join('');
  const avisos = calcularObservaciones(p, sesionesOrdenadas(p)).filter((o) => o.nivel === 'critical' || o.nivel === 'warning').slice(0, 3);
  $('#rs-avisos-bloque').hidden = !avisos.length;
  $('#rs-avisos').innerHTML = avisos.map((o) => `<li class="obs obs-${o.nivel}"><span class="obs-icon">!</span><span>${o.texto}</span></li>`).join('');
  $('#rs-cita').textContent = p.proximaCita ? `Próxima cita: ${fmtFecha(p.proximaCita)}` : 'Sin próxima cita.';
  dlg.showModal();
}

function imprimirHojaPaciente(p, s) {
  const h = datosHojaPaciente(p, s);
  const lista = (items) => items.map((x) => `<li>${esc(x)}</li>`).join('');
  $('#hoja-paciente').innerHTML = `
    <header class="hoja-cabecera">
      <img src="img/kinemo-logo.jpg" alt="Kinemo" width="150">
      <div><h1>${esc(h.nombre)}</h1><p>Sesión del ${esc(h.fecha)}</p></div>
    </header>
    <section><h2>Hoy hizo</h2>
      <table><tbody>${h.hizo.map((x) => `<tr><td>${esc(x.nombre)}</td><td>${x.reps ?? '—'} repeticiones</td></tr>`).join('')}</tbody></table>
    </section>
    <section><h2>Cómo va</h2><ul>${lista(h.comoVa)}</ul></section>
    <section><h2>Ejercicios para casa</h2>
      <table><tbody>${h.ejercicios.map((x) => `<tr><td>${esc(x.nombre)}</td><td>${x.reps} repeticiones${x.sostenerS ? ` · sostener ${x.sostenerS} s` : ''}</td></tr>`).join('')}</tbody></table>
    </section>
    <section><h2>Cuidados</h2><ul>${lista(h.cuidados)}</ul></section>
    <section class="hoja-cita"><h2>Próxima cita</h2><p>${esc(h.proximaCita)}</p></section>
    <footer>Kinemo · Prototipo académico. Siga las indicaciones de su profesional.</footer>`;
  window.print();
}

function initResumen() {
  const dlg = $('#dlg-resumen');
  const actual = () => {
    const p = estado.db.pacientes.find((x) => x.id === resumenActual?.pacienteId);
    return { p, s: p?.sesiones.find((x) => x.id === resumenActual?.sesionId) };
  };
  $('#rs-hoja').addEventListener('click', () => { const { p, s } = actual(); if (p && s) imprimirHojaPaciente(p, s); });
  $('#rs-seguimiento').addEventListener('click', () => { dlg.dataset.destino = 'seguimiento'; dlg.close(); });
  $('#rs-inicio').addEventListener('click', () => dlg.close());
  // Cerrar (incluido Esc) vuelve al Inicio: la sesión ya está guardada.
  dlg.addEventListener('close', () => {
    const { p, s } = actual();
    if (dlg.dataset.destino === 'seguimiento' && p && s) {
      seleccionarPaciente(p.id);
      estado.sesionId = s.id;
      irA('seguimiento', 'sesion');
    } else {
      irInicio();
    }
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initResumen);
if (typeof module !== 'undefined') module.exports = { sumarDiasISO, comparacionConAnterior, datosHojaPaciente };
