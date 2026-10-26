/* Chequeo de seguridad antes de la rutina (paso 1 de la sesión guiada): dolor ahora, hormigueo
 * y herida. La recomendación es orientativa: decide el profesional. */

const MENSAJES_CHEQUEO = {
  ok: 'Todo bien para empezar.',
  detener: 'Se recomienda no hacer la rutina hoy y consultar al médico tratante.',
  bajar: (n) => `Haga la rutina con cuidado; considere bajar a la Fase ${n}.`,
  cuidado: 'Haga la rutina con cuidado y reduzca las repeticiones si hay dolor.',
};

// detener: herida enrojecida/abierta, hormigueo fuerte o dolor ≥ 7. precaución: dolor 4–6 o hormigueo leve.
function evaluarChequeo({ dolorAntes, hormigueo, herida }, etapa) {
  if (herida !== 'bien' || hormigueo === 'fuerte' || dolorAntes >= 7) {
    return { nivel: 'detener', mensaje: MENSAJES_CHEQUEO.detener, etapaSugerida: null };
  }
  if (dolorAntes >= 4 || hormigueo === 'leve') {
    const menor = etapa > 1 ? etapa - 1 : null;
    return { nivel: 'precaucion', mensaje: menor ? MENSAJES_CHEQUEO.bajar(menor) : MENSAJES_CHEQUEO.cuidado, etapaSugerida: menor };
  }
  return { nivel: 'ok', mensaje: MENSAJES_CHEQUEO.ok, etapaSugerida: null };
}

/* ======================= Pantalla ======================= */

let chequeoPendiente = null; // { pacienteId, dolorAntes, hormigueo, herida, nivel, continuoBajoCriterio }
let alContinuarChequeo = null;

// Pinta la barra de pasos de la sesión en la ventana `dlg` (actual: 0–5).
function pintarPasosSesion(dlg, actual) {
  const el = dlg.querySelector('.pasos-sesion');
  if (el) el.innerHTML = htmlPasosSesion(actual, { pruebaOmitida: actual > 3 && !mv.sesion?.emgPrueba });
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
  const r = d.dolorAntes == null ? null : evaluarChequeo(d, etapaElegida);
  const detener = r?.nivel === 'detener';
  if (r) {
    $('#ch-mensaje').textContent = r.mensaje;
    $('#ch-resultado').dataset.nivel = r.nivel;
    $('#ch-bajar').hidden = !r.etapaSugerida;
    if (r.etapaSugerida) $('#ch-bajar').textContent = `Bajar a la Fase ${r.etapaSugerida}`;
  }
  $('#ch-criterio-fila').hidden = !detener;
  $('#ch-continuar-criterio').hidden = !detener;
  $('#ch-continuar-criterio').disabled = !$('#ch-criterio').checked;
  $('#ch-no-hacer').hidden = !detener;
  $('#ch-continuar').hidden = detener;
}

function abrirChequeo(alContinuar) {
  const p = paciente();
  if (!p) return;
  alContinuarChequeo = alContinuar;
  chequeoPendiente = null;
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
  const r = evaluarChequeo(d, etapaElegida);
  if (r.nivel === 'detener' && !bajoCriterio) return;
  chequeoPendiente = { pacienteId: estado.pacienteId, ...d, nivel: r.nivel, continuoBajoCriterio: !!bajoCriterio };
  $('#dlg-chequeo').close();
  alContinuarChequeo?.();
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
  $('#ch-no-hacer').addEventListener('click', () => { $('#dlg-chequeo').close(); toast('No se hizo la sesión hoy.'); });
  $('#ch-cancelar').addEventListener('click', () => $('#dlg-chequeo').close());
  $('#ch-bajar').addEventListener('click', () => {
    const r = evaluarChequeo(leerChequeo(), etapaElegida);
    if (!r.etapaSugerida) return;
    etapaElegida = r.etapaSugerida;
    renderTarjetaRutina();
    $('#ch-paciente').textContent = `${paciente().nombre} · Fase ${etapaElegida}`;
    actualizarChequeo();
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initChequeo);
if (typeof module !== 'undefined') module.exports = { evaluarChequeo };
