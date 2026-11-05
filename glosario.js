/* Glosario: qué significa cada indicador, con sus umbrales. Se abre desde "Glosario" en la barra
 * lateral o desde el botón de ayuda junto a cada término. Los umbrales son los mismos del código
 * de reporte.js, chequeo.js y calcularObservaciones: si cambian allá, deben cambiar aquí. */

const GLOSARIO = {
  estados: {
    titulo: 'Bien, Atención, Revisar y Sin datos',
    texto: 'Lectura orientativa de cada área. Revisar señala lo primero que conviene mirar; Atención, algo que hay que vigilar; Sin datos, que todavía no hay con qué calcular. No es un diagnóstico: decide el profesional.',
  },
  movimiento: {
    titulo: 'Movimiento (% de lo normal)',
    texto: 'Promedio de los ejercicios medidos: ángulo máximo alcanzado frente al rango normal de referencia (AAOS), con un tope de 100 % por ejercicio. La referencia sirve para comparar, no es una meta clínica.',
    lectura: 'Bien: subió 5 puntos o más desde la primera sesión. Revisar: algún ejercicio bajó más de 8 % frente a la sesión anterior.',
  },
  puntos: {
    titulo: 'Puntos',
    texto: 'Diferencia entre dos porcentajes. Pasar de 60 % a 68 % son +8 puntos.',
  },
  dolor: {
    titulo: 'Dolor (EVA)',
    texto: 'Escala visual análoga de 0 a 10 reportada por el paciente. El dolor antes se anota en el chequeo y el dolor después, en el cierre de la sesión.',
    lectura: 'Bien: menos de 4. Atención: de 4 a 6. Revisar: 7 o más, o si subió 2 o más frente a la sesión anterior.',
  },
  activacion: {
    titulo: 'Activación muscular (EMG)',
    texto: 'Amplitud de la señal EMG durante una contracción máxima, en unidades del equipo y en % de la primera prueba del paciente. No es una medida de fuerza en kilos ni en newtons.',
  },
  razon: {
    titulo: 'Razón tenar/extensores',
    texto: 'Activación del tenar dividida por la de los extensores, en % de esa misma razón en la primera prueba (100 %). Los extensores sirven de control, porque no dependen del nervio mediano. No es una prueba de conducción nerviosa ni mide el nervio directamente.',
    lectura: 'Bien: 105 % o más. Revisar: bajó más de 15 % frente a la prueba anterior.',
  },
  cocontraccion: {
    titulo: 'Co-contracción',
    texto: 'Activación de los extensores mientras el paciente aprieta con los flexores, en % de la activación de los flexores.',
    lectura: 'Se avisa por encima de 30 %. Es un umbral del prototipo, no un rango clínico validado.',
  },
  constancia: {
    titulo: 'Constancia',
    texto: 'Sesiones registradas y tiempo desde la última.',
    lectura: 'Atención: más de 10 días sin sesión o una cita vencida. Revisar: más de 21 días sin sesión.',
  },
};

// Botón de ayuda junto a un término; el clic lo atiende initGlosario.
function botonTermino(id) {
  return `<button type="button" class="termino" data-termino="${id}" aria-label="Qué significa: ${GLOSARIO[id].titulo}" title="Qué significa"><svg class="ic" aria-hidden="true"><use href="#i-ayuda"/></svg></button>`;
}

function htmlGlosario() {
  return Object.entries(GLOSARIO).map(([id, g]) => `<section class="glo-termino" id="glo-${id}" tabindex="-1">
      <h3>${g.titulo}</h3>
      <p>${g.texto}</p>
      ${g.lectura ? `<p class="glo-lectura">${g.lectura}</p>` : ''}
    </section>`).join('');
}

function abrirGlosario(id) {
  const dlg = document.getElementById('dlg-glosario');
  dlg.querySelectorAll('.glo-termino').forEach((el) => el.classList.remove('activo'));
  if (!dlg.open) dlg.showModal();
  const termino = id && document.getElementById(`glo-${id}`);
  if (termino) {
    termino.classList.add('activo');
    termino.focus();
    termino.scrollIntoView({ block: 'nearest' });
  }
}

function initGlosario() {
  document.getElementById('glo-lista').innerHTML = htmlGlosario();
  document.getElementById('glo-cerrar').addEventListener('click', () => document.getElementById('dlg-glosario').close());
  document.getElementById('nav-glosario').addEventListener('click', () => abrirGlosario());
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-termino]');
    if (b) abrirGlosario(b.dataset.termino);
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initGlosario);
if (typeof module !== 'undefined') module.exports = { GLOSARIO, botonTermino, htmlGlosario };
