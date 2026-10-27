/* Rutina de rehabilitación por etapa: pasos de la sección "Ejercicios" y las tres
 * ventanas (#dlg-rutina en modo revisión o grabación, #dlg-listos "¿Listos para empezar?" y
 * #dlg-fin "Rutina terminada"). Las funciones de la primera parte son puras (sin DOM) para
 * poder probarlas con `node --test`; la segunda parte solo corre en el navegador.
 * El contenido de las rutinas está en rutinas.js (ETAPAS).
 */

// Navegación: guarda el índice actual acotado a [0, tipos.length - 1].
function crearRutina(tipos, inicial = 0) {
  const ultimo = tipos.length - 1;
  let i = Math.min(Math.max(Math.trunc(inicial) || 0, 0), ultimo);
  const ir = (n) => {
    i = Math.min(Math.max(Math.trunc(n) || 0, 0), ultimo);
    return tipos[i];
  };
  return {
    actual: () => tipos[i],
    indice: () => i,
    total: () => tipos.length,
    siguiente: () => ir(i + 1),
    anterior: () => ir(i - 1),
    ir,
    hayAnterior: () => i > 0,
    haySiguiente: () => i < ultimo,
  };
}

// Ruta del video de un ejercicio.
function rutaVideo(tipo) {
  return 'videos/' + tipo + '.mp4';
}

// ===== Navegador =====
const TEXTO_SIN_VIDEO = 'Video no adjuntado';
const CONFIRMAR_TERMINAR = '¿Terminar la rutina ahora? Podrá guardar los ejercicios ya grabados.';

let etapaElegida = 1;        // número de etapa elegido en la tarjeta
let etapaPaciente = null;    // paciente para el que se eligió la etapa (al cambiar, vuelve la sugerida)
let rt = null;               // navegación por los pasos mientras #dlg-rutina está abierta
let modoRutina = null;       // 'revision' | 'grabacion' | null
let etapaRutina = null;      // etapa que muestra #dlg-rutina
let timerContador = null;    // refresco del contador "Detectadas" (250 ms)
let timerListos = null;      // consulta del dispositivo en "¿Listos para empezar?" (200 ms)
let turnoListos = 0;         // invalida las tareas async de una ventana "¿Listos?" ya cerrada
let conectandoListos = 0;    // intentos de conexión lanzados desde "¿Listos?" en curso
let cierreFinPermitido = false; // #dlg-fin se cierra por Guardar, Descartar o Cerrar
let navBloqueadaHasta = 0;   // evita que un doble clic salte dos pasos (o termine la rutina)
const NAV_BLOQUEO_MS = 400;

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const textoReps = (p) => plural(p.reps, 'repetición', 'repeticiones') + (p.sostenerS ? ` · sostener ${p.sostenerS} s` : '');
const tituloEtapa = (e) => `Fase ${e.numero} — ${e.nombre}`;
const listaHTML = (items) => items.map((t) => `<li>${esc(t)}</li>`).join('');

/* ---------- Tarjeta "Rutina de rehabilitación" ---------- */

function diasDesdeCirugia(p) {
  if (!p?.fechaCirugia) return null;
  const d = Math.round((new Date(hoyISO() + 'T12:00:00') - new Date(p.fechaCirugia + 'T12:00:00')) / 86400000);
  return Number.isFinite(d) ? d : null;
}

function textoSugerida(d) {
  if (d == null) return 'Sin fecha de cirugía válida: se sugiere la Fase 1.';
  if (d < 0) return 'La fecha de cirugía es futura: se sugiere la Fase 1.';
  return `Sugerida por ${plural(d, 'día', 'días')} desde la cirugía.`;
}

function renderTarjetaRutina() {
  const tarjeta = $('#rt-tarjeta');
  const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
  tarjeta.hidden = !p;
  if (!p) return;
  const sugerida = etapaSugerida(p.fechaCirugia, hoyISO());
  if (etapaPaciente !== p.id) { etapaPaciente = p.id; etapaElegida = sugerida; }
  const e = etapaPorNumero(etapaElegida);

  $('#rt-etapas').innerHTML = ETAPAS.map((x) => `
    <button type="button" class="seg-btn${x.numero === e.numero ? ' active' : ''}" data-etapa="${x.numero}"
      aria-pressed="${x.numero === e.numero}">Fase ${x.numero}${x.numero === sugerida ? '<span class="rt-sug">Sugerida</span>' : ''}</button>`).join('');
  $('#rt-etapa-titulo').textContent = `${tituloEtapa(e)} · ${e.semanas}`;
  $('#rt-etapa-desc').textContent = e.descripcion;
  $('#rt-etapa-sug').textContent = textoSugerida(diasDesdeCirugia(p));
  $('#rt-pasos').innerHTML = e.pasos.map((x) => `
    <li><span class="rt-paso-nombre">${esc(x.nombre)}</span>
      <span class="rt-paso-meta"><span>${esc(textoReps(x))}</span>${x.medicion ? `<span class="rt-medido">Medido con ${x.medicion.fuente === 'emg' ? 'EMG' : 'el sensor de movimiento'}</span>` : ''}</span></li>`).join('');
  $('#rt-cuidado-gral').innerHTML = listaHTML(e.cuidado);
}

/* ---------- #dlg-rutina: revisión y grabación ---------- */

// Registro ya guardado de un paso en la sesión en curso (o null).
function registroDePaso(paso) {
  return mv.sesion?.rutina?.pasos.find((r) => r.id === paso.id) ?? null;
}

function textoRegistro(r) {
  if (r.medicion || (r.tipo && !r.senal)) return `Detectadas: ${r.repeticiones ?? '—'} / ${r.repeticionesObjetivo}`;
  return 'Señal grabada';
}

function mostrarPaso() {
  const paso = rt.actual();
  const grabando = modoRutina === 'grabacion';
  // Al volver a un paso ya grabado no se graba de nuevo hasta pulsar "Volver a grabar".
  const enVivo = grabando && !!mv.paso;
  const previo = grabando && !enVivo ? registroDePaso(paso) : null;
  const video = $('#rt-video');
  $('#rt-nombre').textContent = paso.nombre;
  $('#rt-paso').textContent = `Ejercicio ${rt.indice() + 1} de ${rt.total()} · Fase ${etapaRutina.numero}`;
  $('#rt-modo').innerHTML = enVivo ? '<span class="live-dot"></span>Grabando' : grabando ? 'Grabación en pausa' : 'Revisión';
  $('#rt-reps').textContent = textoReps(paso);
  $('#rt-indicacion').textContent = paso.indicacion;
  $('#rt-cuidado').innerHTML = listaHTML([...paso.cuidado, ...etapaRutina.cuidado]);
  $('#rt-contador').hidden = !enVivo;
  $('#rt-grabado').hidden = !previo;
  if (previo) $('#rt-grabado-txt').textContent = textoRegistro(previo);
  actualizarContador();

  $('#rt-falta').hidden = true;
  video.hidden = false;
  video.src = rutaVideo(paso.id);
  video.play().catch(() => {});

  const anterior = $('#rt-anterior');
  const siguiente = $('#rt-siguiente');
  const ultimoAlGrabar = grabando && !rt.haySiguiente();
  $('#rt-siguiente-txt').textContent = ultimoAlGrabar ? 'Terminar rutina' : 'Siguiente';
  anterior.disabled = !rt.hayAnterior();
  siguiente.disabled = !rt.haySiguiente() && !ultimoAlGrabar;
  // Un botón deshabilitado pierde el foco y las flechas dejarían de funcionar:
  // pasar el foco al otro botón de navegación.
  if (document.activeElement === anterior && anterior.disabled) siguiente.focus();
  else if (document.activeElement === siguiente && siguiente.disabled) anterior.focus();
}

function actualizarContador() {
  if (modoRutina !== 'grabacion' || !rt || !mv.paso) return;
  const paso = rt.actual();
  const el = $('#rt-contador');
  const modo = medicionEnCurso();
  el.classList.toggle('medido', modo === 'medido');
  el.classList.toggle('aviso', modo === 'sin-emg');
  if (modo === 'medido') el.textContent = `Detectadas: ${repeticionesEnCurso() ?? '—'} / ${paso.reps}`;
  else if (modo === 'calibrando') el.textContent = 'Calibrando… mantenga la mano quieta en la posición del ejercicio.';
  else if (modo === 'sin-emg') el.textContent = TEXTO_PASO_SIN_EMG;
  else el.textContent = 'Cuente las repeticiones; las anotará al final.';
}

function abrirDlgRutina(modo) {
  modoRutina = modo;
  etapaRutina = etapaPorNumero(etapaElegida);
  rt = crearRutina(etapaRutina.pasos);
  if (modo === 'grabacion') iniciarPasoSiFalta();
  $('#dlg-rutina .pasos-sesion').hidden = modo !== 'grabacion';
  if (modo === 'grabacion') pintarPasosSesion($('#dlg-rutina'), 2);
  mostrarPaso();
  clearInterval(timerContador);
  if (modo === 'grabacion') timerContador = setInterval(actualizarContador, 250);
  $('#dlg-rutina').showModal();
}

function abrirRevision() {
  abrirDlgRutina('revision');
}

function empezarGrabacion() {
  abrirDlgRutina('grabacion');
}

// Al grabar, un paso sin registro empieza a grabarse solo; uno ya grabado espera a "Volver a grabar".
function iniciarPasoSiFalta() {
  const paso = rt.actual();
  if (!registroDePaso(paso)) iniciarPasoRutina(paso);
}

function volverAGrabar() {
  if (modoRutina !== 'grabacion' || !rt || mv.paso) return;
  iniciarPasoRutina(rt.actual());
  mostrarPaso();
  $('#rt-siguiente').focus(); // el botón se oculta: el foco pasa a la navegación
}

// Cambia de paso; al grabar, cierra el registro del paso actual (si se estaba grabando) y
// empieza el del nuevo si todavía no tiene registro.
function navBloqueada() {
  return performance.now() < navBloqueadaHasta;
}

function irAPaso(direccion) {
  if (!rt || navBloqueada()) return;
  if (direccion > 0 ? !rt.haySiguiente() : !rt.hayAnterior()) return;
  navBloqueadaHasta = performance.now() + NAV_BLOQUEO_MS;
  if (modoRutina === 'grabacion') finalizarPasoRutina(); // sin paso en curso no hace nada
  if (direccion > 0) rt.siguiente(); else rt.anterior();
  if (modoRutina === 'grabacion') iniciarPasoSiFalta();
  mostrarPaso();
}

function cerrarDlgRutina() {
  $('#dlg-rutina').close();
}

// Pregunta antes de interrumpir una grabación (Esc o ✕).
function pedirTerminar() {
  if (confirm(CONFIRMAR_TERMINAR)) terminarRutina();
}

/* ---------- #dlg-listos: ¿Listos para empezar? ---------- */

async function abrirListos() {
  const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
  if (!p) return;
  const e = etapaPorNumero(etapaElegida);
  const turno = ++turnoListos;
  $('#ls-etapa').textContent = tituloEtapa(e);
  $('#ls-resumen').textContent = `${plural(e.pasos.length, 'ejercicio', 'ejercicios')} · Paciente: ${p.nombre}`;
  $('#ls-empezar').disabled = true;
  actualizarListos();
  pintarPasosSesion($('#dlg-listos'), 1);
  $('#dlg-listos').showModal();
  clearInterval(timerListos);
  timerListos = setInterval(actualizarListos, 200);

  await conectarYCalibrarListos(turno);
}

// Conecta (simulador si no hay dispositivo) y calibra; un fallo deja "Sin conexión" con "Reintentar".
async function conectarYCalibrarListos(turno) {
  if (!estadoDispositivo().conectado) {
    conectandoListos++;
    actualizarListos();
    try {
      await asegurarConexion();
    } catch (err) {
      console.warn('No se pudo conectar:', err);
    } finally {
      conectandoListos--;
    }
  }
  if (turno !== turnoListos || !$('#dlg-listos').open) return;
  const d = estadoDispositivo();
  if (d.conectado && !d.calOk && !d.calibrando) calibrar();
  actualizarListos();
}

function actualizarListos() {
  const d = estadoDispositivo();
  const usb = d.conectado && d.origen === 'usb';
  $('#ls-disp-dot').className = 'dot ' + (usb ? 'good' : 'warning');
  $('#ls-disp').textContent = usb
    ? 'Dispositivo conectado'
    : 'Sin dispositivo: se usará el simulador y la sesión quedará marcada como simulada.';

  let cal = 'Conectando…', dot = 'warning', fallo = false;
  if (!d.conectado && !mv.conectando && !conectandoListos) {
    cal = 'Sin conexión con el dispositivo.'; dot = 'critical'; fallo = true;
  } else if (d.conectado) {
    if (d.calibrando) cal = 'Calibrando… mantenga la mano quieta en posición neutra';
    else if (d.calOk) { cal = `Calibrado en ${fmt(d.calTiempoS, 1)} s`; dot = 'good'; }
    else if (d.calMotivo) { cal = `Falló: ${d.calMotivo}`; dot = 'critical'; fallo = true; }
    else cal = 'Sin calibrar.';
  }
  $('#ls-cal-dot').className = 'dot ' + dot;
  $('#ls-cal').textContent = cal;
  $('#ls-reintentar').hidden = !fallo;
  $('#ls-empezar').disabled = !(d.conectado && d.calOk);
}

function empezarDesdeListos() {
  if (!estadoDispositivo().calOk) return;
  if (sesionTieneDatos()) {
    if (!confirm('Hay una sesión sin guardar. ¿Descartarla y empezar una nueva?')) return;
    descartarSesion(false);
  }
  iniciarSesionRutina(etapaElegida);
  $('#dlg-listos').close();
  empezarGrabacion();
}

/* ---------- #dlg-fin: Rutina terminada ---------- */

function terminarRutina() {
  clearInterval(timerContador);
  timerContador = null;
  finalizarPasoRutina();
  rt = null;
  modoRutina = null; // antes de cerrar: el evento 'close' (asíncrono) ya no ve una grabación
  if ($('#dlg-rutina').open) cerrarDlgRutina();
  // Fase 2 y 3 con EMG: la prueba de fuerza muscular va antes de "Rutina terminada".
  const etapa = mv.sesion?.rutina?.etapa ?? etapaElegida;
  const hayPasos = !!mv.sesion?.rutina?.pasos.length;
  // La conexión actual debe traer EMG (no basta con que lo haya traído antes en la sesión).
  if (hayPasos && mv.conectado && debeHacerPrueba(etapa, mv.conEmg && mv.sesion?.conEmg)) abrirPrueba(abrirFin);
  else abrirFin();
}

function abrirFin() {
  const pasos = mv.sesion?.rutina?.pasos ?? [];
  const e = etapaPorNumero(mv.sesion?.rutina?.etapa ?? etapaElegida);
  const hay = pasos.length > 0;
  $('#fin-etapa').textContent = tituloEtapa(e);
  $('#fin-con-datos').hidden = !hay;
  $('#fin-vacio').hidden = hay;
  $('#fin-descartar').hidden = !hay;
  $('#fin-guardar').hidden = !hay;
  $('#fin-cerrar').hidden = hay;
  $('#fin-tabla').innerHTML = pasos.map((r) => `
    <tr>
      <td>${esc(r.nombre)}</td>
      <td class="num">${r.repeticionesObjetivo}</td>
      <td class="num">${r.repeticiones ?? '—'}</td>
      <td class="num"><input type="number" class="input-manual" min="0" step="1" data-id="${esc(r.id)}" aria-label="Conteo manual de ${esc(r.nombre)}"></td>
    </tr>`).join('');
  $('#fin-dolor').value = '';
  $('#fin-notas').value = '';
  if (!hay && mv.sesion) descartarSesion(false); // nada que guardar
  $('#fin-cita').value = sumarDiasISO(hoyISO(), 7);
  $('#fin-sin-cita').checked = false;
  $('#fin-cita').disabled = false;
  pintarPasosSesion($('#dlg-fin'), 4);
  $('#dlg-fin').showModal();
}

function descartarDesdeFin() {
  if (!confirm('¿Descartar los ejercicios registrados en esta sesión?')) return;
  descartarSesion(false);
  cerrarFin();
}

function cerrarFin() {
  cierreFinPermitido = true;
  $('#dlg-fin').close();
}

function guardarDesdeFin() {
  const manuales = {};
  document.querySelectorAll('#fin-tabla input[data-id]').forEach((i) => { manuales[i.dataset.id] = i.value; });
  const proximaCita = $('#fin-sin-cita').checked ? null : ($('#fin-cita').value || null);
  const s = guardarSesionRutina({ dolor: $('#fin-dolor').value, notas: $('#fin-notas').value, manuales, proximaCita });
  if (!s) return;
  cerrarFin();
  const p = estado.db.pacientes.find((x) => x.sesiones.includes(s));
  if (p) abrirResumen(p, s); // paso 6
}

/* ---------- Eventos ---------- */

function initRutina() {
  const dlg = $('#dlg-rutina');
  const video = $('#rt-video');

  $('#rt-etapas').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-etapa]');
    if (!b) return;
    etapaElegida = Number(b.dataset.etapa);
    renderTarjetaRutina();
  });
  $('#rt-revisar').addEventListener('click', abrirRevision);
  $('#rt-iniciar').addEventListener('click', () => abrirChequeo(abrirListos)); // paso 1: chequeo

  $('#rt-cerrar').addEventListener('click', () => {
    if (modoRutina === 'grabacion') pedirTerminar(); else cerrarDlgRutina();
  });
  $('#rt-regrabar').addEventListener('click', volverAGrabar);
  $('#rt-anterior').addEventListener('click', () => irAPaso(-1));
  $('#rt-siguiente').addEventListener('click', () => {
    if (navBloqueada()) return;
    if (modoRutina === 'grabacion' && rt && !rt.haySiguiente()) terminarRutina();
    else irAPaso(1);
  });
  dlg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); irAPaso(-1); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); irAPaso(1); }
    // Chrome deja de permitir cancelar el evento 'cancel' si se pulsa Esc dos veces seguidas;
    // anular la tecla evita la petición de cierre y siempre se pregunta.
    else if (ev.key === 'Escape' && modoRutina === 'grabacion') { ev.preventDefault(); pedirTerminar(); }
  });
  dlg.addEventListener('cancel', (ev) => {
    if (modoRutina !== 'grabacion') return; // revisión: Esc cierra como siempre
    // Si el navegador no deja cancelar, el cierre lo atiende 'close' sin perder nada.
    if (!ev.cancelable) return;
    ev.preventDefault();
    pedirTerminar();
  });
  // El contenido está en .rt-body; un clic sobre el propio <dialog> es un clic en el fondo.
  // Solo cierra (en revisión) si se presionó y se soltó en el fondo (no al arrastrar desde adentro).
  let presionEnFondo = false;
  dlg.addEventListener('pointerdown', (ev) => { presionEnFondo = ev.target === dlg; });
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg && presionEnFondo && modoRutina !== 'grabacion') cerrarDlgRutina();
    presionEnFondo = false;
  });
  // 'close' llega en una tarea aparte: si la ventana ya se volvió a abrir, no hay nada que limpiar.
  dlg.addEventListener('close', () => {
    if (dlg.open) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    clearInterval(timerContador);
    timerContador = null;
    // Cierre no pedido durante la grabación (terminarRutina pone modoRutina en null antes de
    // cerrar): pasar a "Rutina terminada" para no perder lo grabado.
    if (modoRutina === 'grabacion') { terminarRutina(); return; }
    modoRutina = null;
    rt = null;
  });

  video.addEventListener('error', () => {
    if (!dlg.open || !video.hasAttribute('src') || !rt) return;
    video.hidden = true;
    const falta = $('#rt-falta');
    falta.textContent = TEXTO_SIN_VIDEO;
    falta.hidden = false;
  });

  const listos = $('#dlg-listos');
  $('#ls-cancelar').addEventListener('click', () => listos.close());
  $('#ls-reintentar').addEventListener('click', () => {
    if (estadoDispositivo().conectado) { calibrar(); actualizarListos(); }
    else conectarYCalibrarListos(turnoListos);
  });
  $('#ls-empezar').addEventListener('click', empezarDesdeListos);
  listos.addEventListener('close', () => {
    if (listos.open) return;
    clearInterval(timerListos);
    timerListos = null;
    turnoListos++;
  });

  const fin = $('#dlg-fin');
  $('#fin-descartar').addEventListener('click', descartarDesdeFin);
  $('#fin-guardar').addEventListener('click', guardarDesdeFin);
  $('#fin-sin-cita').addEventListener('change', (e) => { $('#fin-cita').disabled = e.target.checked; });
  $('#fin-cerrar').addEventListener('click', cerrarFin);
  // Un cierre que no fue Guardar, Descartar ni Cerrar (p. ej. una petición de cierre que el
  // navegador no deja cancelar) no puede dejar datos grabados sin forma de guardarlos.
  fin.addEventListener('close', () => {
    if (fin.open) return;
    const permitido = cierreFinPermitido;
    cierreFinPermitido = false;
    if (!permitido && sesionTieneDatos()) fin.showModal();
  });
  // Con datos grabados Esc no hace nada (hay que elegir Guardar o Descartar); sin datos cierra
  // como "Cerrar". Si el navegador no deja cancelar, 'close' vuelve a abrir la ventana.
  fin.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    if ($('#fin-guardar').hidden) cerrarFin();
  });
  fin.addEventListener('cancel', (ev) => {
    if ($('#fin-guardar').hidden) { cierreFinPermitido = true; return; } // sin datos: Esc cierra
    if (ev.cancelable) ev.preventDefault();
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initRutina);

if (typeof module !== 'undefined') module.exports = { crearRutina, rutaVideo };
