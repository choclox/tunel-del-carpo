/* Rutinas de ejercicios por etapa del tratamiento y funciones puras (sin DOM).
 *
 * Contenido basado en protocolos habituales de rehabilitación tras la liberación del
 * túnel carpiano: deslizamientos tendinosos (Wehbé), deslizamiento del nervio mediano
 * (Totten y Hunter), movilidad activa desde la 2.ª semana y fortalecimiento progresivo
 * desde la 6.ª. El profesional debe validar el contenido.
 * Rutina orientativa. El profesional debe ajustarla a cada paciente.
 *
 * `medicion` dice cómo se cuenta cada paso: `{ fuente: 'imu', tipo }` (ángulo, tipo de EJERCICIOS),
 * `{ fuente: 'emg', musculo }` (activación del músculo) o `null` (conteo manual). `tipo` repite el
 * tipo IMU (o `null`) para las sesiones guardadas. `recalibrar`: pide CAL al empezar el paso.
 */

const IMU = (tipo) => ({ fuente: 'imu', tipo });
const EMG = (musculo) => ({ fuente: 'emg', musculo });
const INDICACION_DESVIACION = 'Mano de canto, pulgar hacia arriba y antebrazo apoyado. Desvíe la mano hacia el pulgar (radial) o hacia el meñique (cubital).';

const ETAPAS = [
  {
    numero: 1,
    nombre: 'Protección y movilidad temprana',
    semanas: '0–2 semanas',
    descripcion: 'Movilidad suave de dedos y pulgar y deslizamientos de tendones y nervio, sin carga.',
    cuidado: [
      'Movimientos lentos y suaves, sin fuerza ni peso.',
      'Una leve tensión es normal; si aparece dolor fuerte, hormigueo o adormecimiento, deténgase.',
      'Mantenga la herida limpia y seca.',
      'Entre ejercicios, mantenga la mano elevada para reducir la hinchazón.',
    ],
    pasos: [
      { id: 'tendon_recto', nombre: 'Deslizamiento tendinoso: mano recta', tipo: null, medicion: EMG('flexores'), reps: 10, sostenerS: 5,
        indicacion: 'Dedos extendidos y juntos, muñeca neutra.', cuidado: [] },
      { id: 'puno_gancho', nombre: 'Deslizamiento tendinoso: puño en gancho', tipo: null, medicion: EMG('flexores'), reps: 10, sostenerS: 5,
        indicacion: 'Doble las articulaciones medias y finales; los nudillos quedan rectos.', cuidado: [] },
      { id: 'puno_completo', nombre: 'Deslizamiento tendinoso: puño completo', tipo: null, medicion: EMG('flexores'), reps: 10, sostenerS: 5,
        indicacion: 'Cierre la mano por completo sin apretar.', cuidado: ['No apriete el puño.'] },
      { id: 'mesa', nombre: 'Deslizamiento tendinoso: posición de mesa', tipo: null, medicion: EMG('flexores'), reps: 10, sostenerS: 5,
        indicacion: 'Doble solo los nudillos con los dedos rectos.', cuidado: [] },
      { id: 'puno_recto', nombre: 'Deslizamiento tendinoso: puño recto', tipo: null, medicion: EMG('flexores'), reps: 10, sostenerS: 5,
        indicacion: 'Doble nudillos y articulaciones medias; las puntas tocan la palma.', cuidado: [] },
      { id: 'pulgar_oposicion', nombre: 'Oposición del pulgar', tipo: null, medicion: { ...EMG('tenar'), manualSiHerida: true }, reps: 10, sostenerS: 2,
        indicacion: 'Toque con el pulgar la punta de cada dedo.', cuidado: [] },
      { id: 'nervio_mediano', nombre: 'Deslizamiento del nervio mediano', tipo: null, medicion: null, reps: 5, sostenerS: 3,
        indicacion: 'Siga la secuencia indicada por el profesional, sin forzar.',
        cuidado: ['Si siente hormigueo, haga el movimiento más corto.'] },
    ],
  },
  {
    numero: 2,
    nombre: 'Movilidad activa',
    semanas: '2–6 semanas',
    descripcion: 'Recuperar el rango de movimiento de muñeca y antebrazo.',
    cuidado: [
      'Llegue hasta una tensión cómoda, no hasta el dolor.',
      'No haga rebotes ni movimientos bruscos.',
      'Si el dolor pasa de 4/10 o dura más de una hora después, reduzca las repeticiones y avise al profesional.',
      'Aún no levante objetos pesados.',
    ],
    pasos: [
      { id: 'flexion', nombre: 'Flexión de muñeca', tipo: 'flexion', medicion: IMU('flexion'), reps: 10, sostenerS: 5,
        indicacion: 'Antebrazo apoyado, palma hacia abajo; baje la mano.', cuidado: [] },
      { id: 'extension', nombre: 'Extensión de muñeca', tipo: 'extension', medicion: IMU('extension'), reps: 10, sostenerS: 5,
        indicacion: 'Antebrazo apoyado, palma hacia abajo; suba la mano.', cuidado: [] },
      { id: 'desv_radial', nombre: 'Desviación radial', tipo: 'desv_radial', medicion: IMU('desv_radial'), recalibrar: true, reps: 10, sostenerS: 3,
        indicacion: INDICACION_DESVIACION, cuidado: [] },
      { id: 'desv_cubital', nombre: 'Desviación cubital', tipo: 'desv_cubital', medicion: IMU('desv_cubital'), recalibrar: true, reps: 10, sostenerS: 3,
        indicacion: INDICACION_DESVIACION, cuidado: [] },
      { id: 'pronacion', nombre: 'Pronación de antebrazo', tipo: 'pronacion', medicion: IMU('pronacion'), reps: 10, sostenerS: 3,
        indicacion: 'Codo pegado al cuerpo a 90°; gire la palma hacia abajo.', cuidado: [] },
      { id: 'supinacion', nombre: 'Supinación de antebrazo', tipo: 'supinacion', medicion: IMU('supinacion'), reps: 10, sostenerS: 3,
        indicacion: 'Codo pegado al cuerpo a 90°; gire la palma hacia arriba.', cuidado: [] },
      { id: 'puno_completo', nombre: 'Puño completo', tipo: null, medicion: EMG('flexores'), reps: 10, sostenerS: 3,
        indicacion: 'Cierre la mano por completo y ábrala del todo.', cuidado: ['No apriete el puño.'] },
      { id: 'pulgar_abduccion', nombre: 'Abducción del pulgar', tipo: null, medicion: EMG('tenar'), reps: 10, sostenerS: 3,
        indicacion: 'Separe el pulgar de la palma hacia arriba.', cuidado: [] },
    ],
  },
  {
    numero: 3,
    nombre: 'Fortalecimiento',
    semanas: '6–12 semanas',
    descripcion: 'Fuerza de agarre y de muñeca con carga ligera y progresiva.',
    cuidado: [
      'Empiece con poco peso (0,5 kg) o resistencia suave.',
      'Durante el ejercicio el dolor no debe pasar de 3/10.',
      'Descanse 30 a 60 segundos entre ejercicios.',
      'Deténgase si aparece hormigueo o adormecimiento en los dedos.',
    ],
    pasos: [
      { id: 'pelota', nombre: 'Apretar pelota terapéutica', tipo: null, medicion: EMG('flexores'), reps: 10, sostenerS: 3,
        indicacion: 'Apriete la pelota con toda la mano y suelte despacio.',
        cuidado: ['Apriete sin llegar al dolor.'] },
      { id: 'pinza', nombre: 'Pinza pulgar-índice', tipo: null, medicion: EMG('tenar'), reps: 10, sostenerS: 3,
        indicacion: 'Apriete masilla o una pinza de ropa entre pulgar e índice.', cuidado: [] },
      { id: 'extension_carga', nombre: 'Extensión de muñeca con peso ligero', tipo: 'extension', medicion: IMU('extension'), reps: 10, sostenerS: 2,
        indicacion: 'Antebrazo apoyado, palma hacia abajo; suba el peso despacio.',
        cuidado: ['Use 0,5 kg al principio.'] },
      { id: 'flexion_carga', nombre: 'Flexión de muñeca con peso ligero', tipo: 'flexion', medicion: IMU('flexion'), reps: 10, sostenerS: 2,
        indicacion: 'Antebrazo apoyado, palma hacia arriba; suba el peso despacio.',
        cuidado: ['Use 0,5 kg al principio.'] },
      { id: 'pronosup_martillo', nombre: 'Prono-supinación con martillo', tipo: 'supinacion', medicion: IMU('supinacion'), reps: 10, sostenerS: 2,
        indicacion: 'Sujete un martillo por el mango y gírelo despacio a cada lado.',
        cuidado: ['Agarre más cerca de la cabeza si cuesta.'] },
    ],
  },
];

// Etapa por número; si no existe devuelve la Fase 1.
function etapaPorNumero(n) {
  return ETAPAS.find((e) => e.numero === n) || ETAPAS[0];
}

// Etapa sugerida según días desde la cirugía: <14 → 1; 14–41 → 2; ≥42 → 3.
// Fecha futura, vacía o inválida → 1. Fechas a mediodía, como sumarDias en data.js.
function etapaSugerida(fechaCirugiaISO, hoyISO) {
  if (!fechaCirugiaISO) return 1;
  const c = new Date(fechaCirugiaISO + 'T12:00:00');
  const h = new Date(hoyISO + 'T12:00:00');
  const dias = Math.round((h - c) / 86400000);
  if (!Number.isFinite(dias) || dias < 14) return 1;
  return dias < 42 ? 2 : 3;
}

// Medición que se usa hoy en el paso: con la herida distinta de "Bien" en el chequeo, los pasos
// marcados `manualSiHerida` (electrodo del tenar junto a la incisión) se cuentan a mano.
function medicionDelPaso(paso, chequeo) {
  const m = paso.medicion ?? null;
  if (!m) return null;
  if (m.manualSiHerida) return chequeo && chequeo.herida !== 'bien' ? null : { fuente: m.fuente, musculo: m.musculo };
  return m;
}

// Devuelve un arreglo nuevo: reemplaza el registro con el mismo id o lo agrega al final.
function guardarRegistroPaso(pasos, registro) {
  const i = pasos.findIndex((p) => p.id === registro.id);
  if (i < 0) return [...pasos, registro];
  const copia = pasos.slice();
  copia[i] = registro;
  return copia;
}

// Señal cruda de 3 canales diezmada a ~10 Hz (una muestra de cada k, con k según la frecuencia
// real) para no llenar el almacenamiento del navegador. null si hay menos de 25 muestras o
// duran menos de 1 s (criterio sobre las muestras originales).
const FS_SENAL_CRUDA = 10;

function resumenSenal(muestras) {
  const n = muestras.length;
  const dur = n > 1 ? muestras[n - 1].t - muestras[0].t : 0;
  if (n < 25 || dur < 1) return null;
  const r1 = (x) => Math.round(x * 10) / 10;
  const fsReal = (n - 1) / dur;
  const k = Math.max(1, Math.round(fsReal / FS_SENAL_CRUDA));
  const elegidas = k === 1 ? muestras : muestras.filter((_, i) => i % k === 0);
  return {
    duracionS: Math.round(dur * 100) / 100,
    senal: {
      fs: r1(fsReal / k),
      fe: elegidas.map((m) => r1(m.fe)),
      rc: elegidas.map((m) => r1(m.rc)),
      ps: elegidas.map((m) => r1(m.ps)),
    },
  };
}

if (typeof module !== 'undefined') module.exports = { ETAPAS, etapaPorNumero, etapaSugerida, medicionDelPaso, guardarRegistroPaso, resumenSenal };
