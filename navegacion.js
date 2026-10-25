/* Navegación en tres secciones y recorte de observaciones (funciones puras, sin DOM). */

const SECCIONES = ['ejercicios', 'seguimiento', 'reporte'];
const VISTAS_SEGUIMIENTO = ['resumen', 'sesion', 'comparar'];

// Sección no válida → Seguimiento; vista no válida → Resumen.
function normalizarRuta(ruta) {
  const seccion = SECCIONES.includes(ruta?.seccion) ? ruta.seccion : 'seguimiento';
  const vista = VISTAS_SEGUIMIENTO.includes(ruta?.vista) ? ruta.vista : 'resumen';
  return { seccion, vista };
}

// Sin sesiones se empieza por Ejercicios; con sesiones, por Seguimiento.
function seccionInicial(numSesiones) {
  return Number(numSesiones) > 0 ? 'seguimiento' : 'ejercicios';
}

const ORDEN_NIVEL = { critical: 0, warning: 1, info: 2, good: 3 };

// Ordena por gravedad (estable dentro del mismo nivel) y separa las `max` primeras.
function recortarObservaciones(obs, max = 3) {
  const orden = [...obs].sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]);
  return { visibles: orden.slice(0, max), ocultas: orden.slice(max) };
}

if (typeof module !== 'undefined') module.exports = { SECCIONES, VISTAS_SEGUIMIENTO, normalizarRuta, seccionInicial, recortarObservaciones };
