/* Chequeo de seguridad antes de la rutina (paso 1 de la sesión guiada): dolor ahora, hormigueo
 * y herida. La recomendación es orientativa: decide el profesional. */

const MENSAJES_CHEQUEO = {
  ok: 'Todo bien para empezar.',
  detener: 'Se recomienda no hacer la rutina hoy y consultar al médico tratante.',
  bajar: (n) => `Haga la rutina con cuidado; considere bajar a la Fase ${n}.`,
  cuidado: 'Haga la rutina con cuidado y reduzca las repeticiones si hay dolor.',
  adelantada: (n) => `Esta fase está adelantada para el tiempo desde la cirugía; se recomienda la Fase ${n}.`,
};
const BANDA_SIMULADA = '<p class="banda-simulada">Sesión simulada: estos datos no son mediciones reales y no cuentan en el seguimiento.</p>';

const TEXTO_HERIDA = { enrojecida: 'herida enrojecida o con secreción', abierta: 'herida abierta' };

// Qué respuestas del chequeo llevaron a la recomendación.
function motivosChequeo({ dolorAntes, hormigueo, herida }) {
  const motivos = [];
  if (herida !== 'bien') motivos.push(TEXTO_HERIDA[herida] ?? 'herida que no está bien');
  if (hormigueo === 'fuerte') motivos.push('hormigueo o adormecimiento fuerte');
  if (hormigueo === 'leve') motivos.push('hormigueo o adormecimiento leve');
  if (dolorAntes >= 7) motivos.push(`dolor ${dolorAntes} de 10 (7 o más)`);
  else if (dolorAntes >= 4) motivos.push(`dolor ${dolorAntes} de 10 (entre 4 y 6)`);
  return motivos;
}

// detener: herida enrojecida/abierta, hormigueo fuerte o dolor ≥ 7. precaución: dolor 4–6 o hormigueo leve.
// fase { elegida, sugerida }: si la elegida supera la sugerida, hay que confirmarlo bajo criterio del profesional.
function evaluarChequeo(respuestas, etapa, fase = null) {
  const { dolorAntes, hormigueo, herida } = respuestas;
  const motivos = motivosChequeo(respuestas);
  const adelantada = fase && fase.elegida > fase.sugerida ? { elegida: fase.elegida, sugerida: fase.sugerida } : null;
  const marca = adelantada ? { faseAdelantada: adelantada } : {};
  if (adelantada) motivos.push(`Fase ${adelantada.elegida} elegida; por los días desde la cirugía se sugiere la Fase ${adelantada.sugerida}`);
  if (herida !== 'bien' || hormigueo === 'fuerte' || dolorAntes >= 7) {
    return { nivel: 'detener', mensaje: MENSAJES_CHEQUEO.detener, motivos, etapaSugerida: null, ...marca };
  }
  if (adelantada) {
    return { nivel: 'precaucion', mensaje: MENSAJES_CHEQUEO.adelantada(adelantada.sugerida), motivos, etapaSugerida: adelantada.sugerida, ...marca };
  }
  if (dolorAntes >= 4 || hormigueo === 'leve') {
    const menor = etapa > 1 ? etapa - 1 : null;
    return { nivel: 'precaucion', mensaje: menor ? MENSAJES_CHEQUEO.bajar(menor) : MENSAJES_CHEQUEO.cuidado, motivos, etapaSugerida: menor };
  }
  return { nivel: 'ok', mensaje: MENSAJES_CHEQUEO.ok, motivos, etapaSugerida: null };
}

/* ======================= Pantalla ======================= */

let chequeoPendiente = null; // { pacienteId, dolorAntes, hormigueo, herida, nivel, continuoBajoCriterio }
let alContinuarChequeo = null;
// Fase con la que se abrió el chequeo: "Bajar de fase" ofrece como mucho un paso menos que esta,
// y cancelar la restaura (bajar de fase solo vale si se continúa).
let etapaInicioChequeo = null;
let chequeoContinuado = false;

// Pinta la barra de pasos de la sesión en la ventana `dlg` (actual: 0–5). pruebaOmitida: por defecto
// según la sesión en curso; el Resumen lo pasa desde la sesión guardada (la de curso ya se borró).
function pintarPasosSesion(dlg, actual, pruebaOmitida = actual > 3 && !mv.sesion?.emgPrueba, simulada = (mv.sesion?.origen ?? (mv.conectado ? mv.origen : null)) === 'simulador') {
  const el = dlg.querySelector('.pasos-sesion');
  if (el) el.innerHTML = htmlPasosSesion(actual, { pruebaOmitida }) + (simulada ? BANDA_SIMULADA : '');
}

// Fase elegida frente a la que sugieren los días desde la cirugía.
function faseDelChequeo() {
  return { elegida: etapaElegida, sugerida: etapaSugerida(paciente().fechaCirugia, hoyISO()) };
}

function leerChequeo() {
  const v = $('#ch-dolor').value.trim();
  const dolor = v === '' ? NaN : Number(v);
  return {
    dolorAntes: Number.isInteger(dolor) && dolor >= 0 && dolor <= 10 ? dolor : null,
    hormigueo: $('#ch-hormigueo').value,
    herida: $('#ch-herida').value,
  };
}

function actualizarChequeo() {
  const d = leerChequeo();
  $('#ch-resultado').hidden = d.dolorAntes == null;
  if (d.dolorAntes != null) $('#ch-error').textContent = '';
  const r = d.dolorAntes == null ? null : evaluarChequeo(d, etapaInicioChequeo, faseDelChequeo());
  const detener = r?.nivel === 'detener';
  const conCriterio = detener || !!r?.faseAdelantada;
  if (r) {
    $('#ch-mensaje').textContent = r.mensaje;
    $('#ch-motivo').hidden = !r.motivos.length;
    $('#ch-motivo').textContent = `Motivo: ${r.motivos.join('; ')}.`;
    $('#ch-resultado').dataset.nivel = r.nivel;
    $('#ch-bajar').hidden = !r.etapaSugerida || etapaElegida < etapaInicioChequeo;
    if (r.etapaSugerida) $('#ch-bajar').textContent = `Bajar a la Fase ${r.etapaSugerida}`;
  }
  $('#ch-criterio-fila').hidden = !conCriterio;
  $('#ch-continuar-criterio').hidden = !conCriterio;
  $('#ch-continuar-criterio').disabled = !$('#ch-criterio').checked;
  $('#ch-no-hacer').hidden = !detener;
  $('#ch-continuar').hidden = conCriterio;
}

function abrirChequeo(alContinuar) {
  const p = paciente();
  if (!p) return;
  alContinuarChequeo = alContinuar;
  chequeoPendiente = null;
  etapaInicioChequeo = etapaElegida;
  chequeoContinuado = false;
  $('#ch-dolor').value = '';
  $('#ch-hormigueo').value = 'no';
  $('#ch-herida').value = 'bien';
  $('#ch-criterio').checked = false;
  $('#ch-error').textContent = '';
  $('#ch-paciente').textContent = `${p.nombre} · Fase ${etapaElegida}`;
  actualizarChequeo();
  pintarPasosSesion($('#dlg-chequeo'), 0);
  $('#dlg-chequeo').showModal();
  $('#ch-dolor').focus();
}

function continuarChequeo(bajoCriterio) {
  const d = leerChequeo();
  if (d.dolorAntes == null) {
    $('#ch-error').textContent = 'Indique el dolor de 0 a 10.';
    $('#ch-dolor').focus();
    return;
  }
  const r = evaluarChequeo(d, etapaInicioChequeo, faseDelChequeo());
  if ((r.nivel === 'detener' || r.faseAdelantada) && !bajoCriterio) return;
  chequeoPendiente = { pacienteId: estado.pacienteId, ...d, nivel: r.nivel, continuoBajoCriterio: !!bajoCriterio, ...(r.faseAdelantada ? { faseAdelantada: r.faseAdelantada } : {}) };
  chequeoContinuado = true;
  $('#dlg-chequeo').close();
  alContinuarChequeo?.();
}

// "No hacer la sesión hoy": deja constancia con el motivo, aunque no haya sesión que guardar.
function registrarNoRealizada() {
  const p = paciente();
  const d = leerChequeo();
  const { motivos } = evaluarChequeo(d, etapaInicioChequeo, faseDelChequeo());
  (p.noRealizadas ??= []).push({ fecha: hoyISO(), dolorAntes: d.dolorAntes, hormigueo: d.hormigueo, herida: d.herida, motivos });
  const guardado = guardarDB();
  $('#dlg-chequeo').close();
  toast(guardado ? 'Sesión no realizada: quedó registrado el motivo.' : 'Sesión no realizada. No se pudo guardar el registro en este navegador.');
  renderLista();
  renderPaciente();
}

// Entrega el chequeo hecho para ese paciente y lo borra (una sesión usa un solo chequeo).
function tomarChequeo(pacienteId) {
  const c = chequeoPendiente;
  chequeoPendiente = null;
  if (!c || c.pacienteId !== pacienteId) return null;
  const { pacienteId: _, ...chequeo } = c;
  return chequeo;
}

function initChequeo() {
  for (const id of ['#ch-dolor', '#ch-hormigueo', '#ch-herida', '#ch-criterio']) $(id).addEventListener('input', actualizarChequeo);
  $('#ch-continuar').addEventListener('click', () => continuarChequeo(false));
  $('#ch-continuar-criterio').addEventListener('click', () => continuarChequeo(true));
  $('#ch-no-hacer').addEventListener('click', registrarNoRealizada);
  $('#ch-cancelar').addEventListener('click', () => $('#dlg-chequeo').close());
  // Cancelar, Esc o "No hacer la sesión hoy": la fase vuelve a la de antes del chequeo.
  $('#dlg-chequeo').addEventListener('close', () => {
    if (chequeoContinuado || etapaInicioChequeo == null || etapaElegida === etapaInicioChequeo) return;
    etapaElegida = etapaInicioChequeo;
    renderTarjetaRutina();
  });
  $('#ch-bajar').addEventListener('click', () => {
    const r = evaluarChequeo(leerChequeo(), etapaInicioChequeo, faseDelChequeo());
    if (!r.etapaSugerida || etapaElegida < etapaInicioChequeo) return;
    etapaElegida = r.etapaSugerida;
    renderTarjetaRutina();
    $('#ch-paciente').textContent = `${paciente().nombre} · Fase ${etapaElegida}`;
    actualizarChequeo();
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initChequeo);
if (typeof module !== 'undefined') module.exports = { evaluarChequeo };
