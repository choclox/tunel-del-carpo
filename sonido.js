/* Tonos de la sesión guiada: el profesional puede seguir el conteo sin mirar la pantalla.
 * Activos por defecto; la preferencia se recuerda en este navegador. Sin dependencias del DOM. */

const CLAVE_SONIDO = 'kinemo.sonido';
// Cada tono: [frecuencia en Hz, duración en s], uno tras otro.
const TONOS = {
  cuenta: [[660, 0.12]],
  inicio: [[880, 0.28]],
  repeticion: [[520, 0.08]],
  objetivo: [[660, 0.12], [990, 0.22]],
  alerta: [[220, 0.2], [180, 0.3]],
};

let contextoAudio = null;

function sonidoActivo() {
  try { return localStorage.getItem(CLAVE_SONIDO) !== 'no'; } catch (e) { return true; }
}

function cambiarSonido(activo) {
  try { localStorage.setItem(CLAVE_SONIDO, activo ? 'si' : 'no'); } catch (e) { /* sin almacenamiento: vale solo en esta visita */ }
}

function tono(tipo) {
  if (!sonidoActivo() || typeof AudioContext === 'undefined') return;
  try {
    contextoAudio ??= new AudioContext();
    contextoAudio.resume();
    let t = contextoAudio.currentTime;
    for (const [frecuencia, duracion] of TONOS[tipo]) {
      const osc = contextoAudio.createOscillator();
      const vol = contextoAudio.createGain();
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.25, t);
      vol.gain.exponentialRampToValueAtTime(0.001, t + duracion);
      osc.connect(vol).connect(contextoAudio.destination);
      osc.start(t);
      osc.stop(t + duracion);
      t += duracion;
    }
  } catch (e) { /* un fallo de audio nunca interrumpe la sesión */ }
}

if (typeof module !== 'undefined') module.exports = { TONOS, sonidoActivo, cambiarSonido, tono };
