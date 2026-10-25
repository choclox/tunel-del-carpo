/* Prueba de fuerza muscular (EMG): 3 contracciones guiadas por músculo, entre "Terminar rutina"
 * y "Rutina terminada", solo en Fase 2 y 3 y con un dispositivo que envía EMG.
 * Los resultados quedan en mv.sesion.emgPrueba (null si se omite o no se completa). */

const TIEMPOS_PRUEBA_EMG = (typeof window !== 'undefined' && window.TIEMPOS_PRUEBA_EMG) || { prepara: 3000, fuerza: 3000, descanso: 5000 };
const CONTRACCIONES_PRUEBA = 3;
const INDICACION_PRUEBA = {
  tenar: 'Separe el pulgar de la mano con fuerza contra la resistencia.',
  flexores: 'Apriete la pelota (o el puño) con toda su fuerza.',
  extensores: 'Lleve la muñeca hacia arriba con fuerza contra la resistencia.',
};
const TEXTO_SIN_CONEXION_PRUEBA = 'Se perdió la conexión: la prueba no se completó.';

function debeHacerPrueba(etapa, conEmg) {
  return etapa >= 2 && !!conEmg;
}

let pr = null; // { indice, resultados, alTerminar, turno }

// Espera ms; devuelve false si la prueba se canceló o cambió de bloque mientras tanto.
function esperarPrueba(ms, turno) {
  return new Promise((r) => setTimeout(() => r(!!pr && pr.turno === turno), ms));
}

const enviarPrueba = (cmd) => mv.transporte?.enviar(cmd).catch(() => {});
const ultimoEmg = () => mv.buffer[mv.buffer.length - 1]?.emg ?? null;

function textoResultado(musculo, media) {
  const p = estado.db.pacientes.find((x) => x.id === mv.sesion?.pacienteId);
  const base = lineaBase(p?.sesiones ?? [])?.[musculo]?.media;
  const cambio = base ? Math.round((media / base - 1) * 100) : null;
  const detalle = cambio == null ? 'primera prueba: será la referencia' : `${cambio >= 0 ? '+' : ''}${cambio} % desde la primera prueba`;
  return `${NOMBRES_MUSCULO[musculo]}: ${media} unidades (${detalle})`;
}

async function correrBloque() {
  const turno = ++pr.turno;
  const musculo = MUSCULOS[pr.indice];
  const ultimo = pr.indice === MUSCULOS.length - 1;
  $('#pr-paso').textContent = `Músculo ${pr.indice + 1} de ${MUSCULOS.length}`;
  $('#pr-musculo').textContent = NOMBRES_MUSCULO[musculo];
  $('#pr-indicacion').textContent = INDICACION_PRUEBA[musculo];
  $('#pr-resultado').textContent = '';
  $('#pr-dudosa').hidden = true;
  $('#pr-repetir').hidden = true;
  $('#pr-siguiente').disabled = true;
  $('#pr-siguiente').textContent = ultimo ? 'Terminar prueba' : 'Siguiente músculo';

  const picos = [], extensores = [];
  for (let i = 0; i < CONTRACCIONES_PRUEBA; i++) {
    $('#pr-contador').textContent = `Contracción ${i + 1} de ${CONTRACCIONES_PRUEBA}`;
    for (const n of ['3', '2', '1']) {
      $('#pr-cuenta').textContent = n;
      if (!(await esperarPrueba(TIEMPOS_PRUEBA_EMG.prepara / 3, turno))) return;
    }
    $('#pr-cuenta').textContent = '¡Fuerza!';
    enviarPrueba(`PR,${musculo}`);
    const tInicio = mv.buffer[mv.buffer.length - 1]?.t ?? -Infinity;
    const barra = setInterval(() => {
      const e = ultimoEmg();
      $('#pr-barra').style.width = `${e ? Math.min(100, e[musculo] / 10) : 0}%`;
    }, 50);
    const sigue = await esperarPrueba(TIEMPOS_PRUEBA_EMG.fuerza, turno);
    clearInterval(barra);
    $('#pr-barra').style.width = '0%';
    enviarPrueba('PR,-');
    if (!sigue) return;
    const muestras = mv.buffer.filter((m) => m.t > tInicio && m.emg);
    picos.push(picoContraccion(muestras.map((m) => m.emg[musculo])) ?? 0);
    extensores.push(picoContraccion(muestras.map((m) => m.emg.extensores)) ?? 0);
    $('#pr-cuenta').textContent = 'Descanse';
    if (!(await esperarPrueba(TIEMPOS_PRUEBA_EMG.descanso, turno))) return;
  }

  const r = resumenBloque(picos);
  const resultado = { picos: r.picos, media: r.media };
  if (musculo === 'flexores') resultado.extensoresDuranteFlexores = resumenBloque(extensores).media;
  pr.resultados[musculo] = resultado;
  $('#pr-cuenta').textContent = '✓';
  $('#pr-contador').textContent = '';
  $('#pr-resultado').textContent = textoResultado(musculo, r.media);
  $('#pr-dudosa').hidden = !r.dudosa;
  $('#pr-repetir').hidden = !r.dudosa;
  $('#pr-siguiente').disabled = false;
  $('#pr-siguiente').focus();
}

function abrirPrueba(alTerminar) {
  pr = { indice: 0, resultados: {}, alTerminar, turno: 0 };
  if (mv.sesion) mv.sesion.emgPrueba = null;
  $('#dlg-prueba').showModal();
  correrBloque();
}

// completa: guarda los 3 resultados; si no, la sesión queda sin prueba. Luego "Rutina terminada".
function terminarPrueba(completa) {
  if (!pr) return;
  const { alTerminar, resultados } = pr;
  pr = null; // cancela las esperas en curso
  enviarPrueba('PR,-');
  if (mv.sesion) mv.sesion.emgPrueba = completa ? resultados : null;
  if ($('#dlg-prueba').open) $('#dlg-prueba').close();
  alTerminar();
}

function siguienteMusculo() {
  if (!pr || $('#pr-siguiente').disabled) return;
  pr.indice++;
  if (pr.indice < MUSCULOS.length) correrBloque();
  else terminarPrueba(true);
}

// La llama alPerderConexion (monitoreo.js).
function pruebaPerdioConexion() {
  if (!pr) return;
  pr.turno++; // detiene el bloque en curso
  $('#pr-cuenta').textContent = '';
  $('#pr-resultado').textContent = TEXTO_SIN_CONEXION_PRUEBA;
  $('#pr-siguiente').disabled = true;
  setTimeout(() => terminarPrueba(false), 2000);
}

function initPrueba() {
  const dlg = $('#dlg-prueba');
  $('#pr-siguiente').addEventListener('click', siguienteMusculo);
  $('#pr-repetir').addEventListener('click', () => { if (pr) correrBloque(); });
  $('#pr-omitir').addEventListener('click', () => terminarPrueba(false));
  // Esc o cualquier cierre que no sea de la prueba cuenta como "Omitir prueba": la rutina no se pierde.
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); terminarPrueba(false); });
  dlg.addEventListener('close', () => { if (pr) terminarPrueba(false); });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initPrueba);
if (typeof module !== 'undefined') module.exports = { debeHacerPrueba };
