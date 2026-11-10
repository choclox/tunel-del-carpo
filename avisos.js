/* Avisos del firmware: traduce las líneas '#...' del dispositivo a mensajes para el profesional.
   Módulo puro (sin DOM), probado con node --test. */

const AVISOS_FIRMWARE = {
  '#Recalibre': {
    clave: 'recalibre',
    texto: 'El dispositivo pide recalibrar: pulse Calibrar antes de seguir midiendo.',
    recalibrar: true,
  },
  '#Giroscopio no responde: modo sin giroscopio': {
    clave: 'giroscopio',
    texto: 'El giroscopio del sensor no responde: se mide sin él, con menos precisión. Revise el módulo.',
    recalibrar: true,
  },
  '#Acelerometro sin calibrar: envie ACEL': {
    clave: 'acelerometro',
    texto: 'Acelerómetro sin calibrar: haga ACEL desde el monitor serie (ver README).',
    recalibrar: false,
  },
  '#Magnetometro sin calibrar: envie MAG': {
    clave: 'magnetometro',
    texto: 'Magnetómetro sin calibrar: haga MAG desde el monitor serie (ver README).',
    recalibrar: false,
  },
  '#Error de lectura del GY-85, reintentando': {
    clave: 'lectura',
    texto: 'Se perdió la lectura del sensor: revise el cable.',
    recalibrar: false,
  },
  '#GY-85 recuperado': {
    clave: 'recuperado',
    texto: 'Sensor recuperado.',
    recalibrar: false,
  },
};

function avisoDispositivo(linea) {
  const a = AVISOS_FIRMWARE[String(linea).trim()];
  return a ? { ...a } : null;
}

// Limitador: true si no hubo aviso de esa clave en los últimos intervaloMs; en ese caso lo registra.
function debeMostrar(clave, ahoraMs, ultimos, intervaloMs = 10000) {
  if (ultimos[clave] !== undefined && ahoraMs - ultimos[clave] < intervaloMs) return false;
  ultimos[clave] = ahoraMs;
  return true;
}

// En la cuenta regresiva de un paso (enEspera, sin ejercicio en marcha) una calibración invalidada
// deja el paso en conteo manual; un ejercicio ya en marcha no se toca.
function debeAnularMedicion({ enEspera, hayEjercicio }) {
  return !!enEspera && !hayEjercicio;
}

if (typeof module !== 'undefined') module.exports = { avisoDispositivo, debeMostrar, debeAnularMedicion };
