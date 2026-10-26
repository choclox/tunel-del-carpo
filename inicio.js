/* Inicio del profesional: qué hacer hoy (pacientes que requieren atención, citas de hoy,
 * sesiones recientes) y "Nueva sesión". Las funciones de cálculo son puras y reciben `hoy` (ISO). */

// Funciones de emg.js: globales en el navegador, require en Node (pruebas).
const emgDeInicio = () => (typeof medidasEmg === 'function' ? { medidasEmg, lineaBase } : require('./emg.js'));

const NIVEL_ATENCION = { critical: 0, warning: 1, info: 2 };
const diasEntre = (desde, hasta) => Math.round((new Date(hasta + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 86400000);
const fechaCorta = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
const ordenadas = (p) => [...(p.sesiones ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));

function saludo(hora) {
  if (hora < 12) return 'Buenos días';
  return hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function pacientesActivos(db) {
  return db.pacientes.filter((p) => !p.archivado);
}

// Sesiones de pacientes activos desde el lunes de la semana de `hoy` hasta `hoy`, inclusive.
function sesionesDeLaSemana(db, hoy) {
  const d = new Date(hoy + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const lunes = d.toISOString().slice(0, 10);
  return pacientesActivos(db).reduce((n, p) => n + (p.sesiones ?? []).filter((s) => s.fecha >= lunes && s.fecha <= hoy).length, 0);
}

function citasDeHoy(db, hoy) {
  return pacientesActivos(db).filter((p) => p.proximaCita === hoy);
}

// Motivos por los que un paciente requiere atención, el más grave primero (mismos umbrales que los avisos).
function motivosAtencion(p, hoy) {
  const ses = ordenadas(p);
  const m = [];
  if (!ses.length) return [{ nivel: 'info', texto: 'Aún sin sesiones' }];
  const ult = ses[ses.length - 1], prev = ses[ses.length - 2];

  if (ult.perdidaDatosPct >= 1) m.push({ nivel: 'critical', texto: 'Se perdieron datos en la última sesión' });
  if (ult.chequeo?.nivel === 'detener') m.push({ nivel: 'critical', texto: 'El chequeo pidió no hacer la sesión' });

  if (p.proximaCita && p.proximaCita < hoy && !ses.some((s) => s.fecha >= p.proximaCita)) {
    m.push({ nivel: 'warning', texto: `Cita vencida (${fechaCorta(p.proximaCita)})` });
  }
  if (prev && ult.dolorEVA != null && prev.dolorEVA != null && ult.dolorEVA - prev.dolorEVA >= 2) {
    m.push({ nivel: 'warning', texto: `El dolor subió (${prev.dolorEVA} → ${ult.dolorEVA})` });
  }
  if (prev) {
    const bajaron = (ult.ejercicios ?? []).filter((e) => {
      const a = (prev.ejercicios ?? []).find((x) => x.tipo === e.tipo)?.anguloMax;
      return a && (a - e.anguloMax) / a > 0.08;
    }).map((e) => (typeof EJERCICIOS !== 'undefined' && EJERCICIOS[e.tipo] ? EJERCICIOS[e.tipo].nombre.toLowerCase() : e.tipo));
    if (bajaron.length) m.push({ nivel: 'warning', texto: `Bajó el movimiento en ${bajaron.join(', ')}` });
  }
  const pruebas = ses.filter((s) => s.emg?.prueba);
  if (pruebas.length > 1) {
    const { medidasEmg: medidas, lineaBase: base } = emgDeInicio();
    const b = base(ses);
    const a = medidas(pruebas[pruebas.length - 2].emg.prueba, b).indiceMediano;
    const z = medidas(pruebas[pruebas.length - 1].emg.prueba, b).indiceMediano;
    if (a && z != null && (a - z) / a > 0.15) m.push({ nivel: 'warning', texto: 'Bajó el índice del nervio mediano' });
  }
  const sinSesion = diasEntre(ult.fecha, hoy);
  if (sinSesion > 10) m.push({ nivel: 'info', texto: `Sin sesión hace ${sinSesion} días` });

  return m.sort((x, y) => NIVEL_ATENCION[x.nivel] - NIVEL_ATENCION[y.nivel]);
}

function pacientesConAtencion(db, hoy) {
  return pacientesActivos(db)
    .map((paciente) => ({ paciente, motivos: motivosAtencion(paciente, hoy) }))
    .filter((x) => x.motivos.length)
    .sort((a, b) => NIVEL_ATENCION[a.motivos[0].nivel] - NIVEL_ATENCION[b.motivos[0].nivel] || a.paciente.nombre.localeCompare(b.paciente.nombre));
}

function sesionesRecientes(db, n = 5) {
  return pacientesActivos(db)
    .flatMap((paciente) => (paciente.sesiones ?? []).map((sesion) => ({ paciente, sesion })))
    .sort((a, b) => b.sesion.fecha.localeCompare(a.sesion.fecha))
    .slice(0, n);
}

/* ======================= Pantalla ======================= */

function renderInicio() {
  const db = estado.db, hoy = hoyISO();
  const activos = pacientesActivos(db);
  const atencion = pacientesConAtencion(db, hoy);
  const citas = citasDeHoy(db, hoy);
  const nombre = leerSesion()?.nombre;
  $('#inicio-saludo').textContent = `${saludo(new Date().getHours())}${nombre ? ', ' + nombre : ''}`;
  const fecha = new Date(hoy + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#inicio-fecha').textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  $('#inicio-vacio').hidden = activos.length > 0;
  $('#inicio-contenido').hidden = activos.length === 0;
  if (!activos.length) return;

  const cifra = (icono, titulo, valor) => `<div class="kpi"><span class="icon-bubble">${ic(icono)}</span>
    <div class="kpi-label">${titulo}</div><div class="kpi-value">${valor}</div></div>`;
  $('#inicio-cifras').innerHTML = cifra('users', 'Pacientes activos', activos.length) +
    cifra('activity', 'Sesiones esta semana', sesionesDeLaSemana(db, hoy)) +
    cifra('calendar', 'Citas de hoy', citas.length) +
    cifra('shield', 'Requieren atención', atencion.length);

  const punto = { critical: 'critical', warning: 'warning', info: '' };
  $('#inicio-atencion').innerHTML = atencion.map(({ paciente: p, motivos }) => `<li>
      <button class="inicio-item" data-id="${esc(p.id)}" data-accion="seguimiento">
        <span class="dot ${punto[motivos[0].nivel]}"></span>
        <span><b>${esc(p.nombre)}</b><small>${motivos.map((x) => esc(x.texto)).join(' · ')}</small></span>
      </button></li>`).join('') || '<li class="muted">Nadie requiere atención hoy.</li>';
  $('#inicio-citas').innerHTML = citas.map((p) => `<li class="inicio-fila">
      <span><b>${esc(p.nombre)}</b><small>Fase ${etapaSugerida(p.fechaCirugia, hoy)} sugerida</small></span>
      <button class="btn" data-id="${esc(p.id)}" data-accion="empezar">Empezar</button></li>`).join('') || '<li class="muted">No hay citas para hoy.</li>';
  $('#inicio-recientes').innerHTML = sesionesRecientes(db).map(({ paciente: p, sesion: s }) => `<li>
      <button class="inicio-item" data-id="${esc(p.id)}" data-accion="seguimiento">
        <span><b>${esc(p.nombre)}</b><small>${fmtFecha(s.fecha)} · dolor ${s.dolorEVA ?? '—'}/10</small></span>
      </button></li>`).join('') || '<li class="muted">Aún no hay sesiones.</li>';
}

function irInicio() {
  estado.pantalla = 'inicio';
  renderLista();
  renderPaciente();
}

// Abre al paciente en Ejercicios para empezar una sesión.
function empezarSesionCon(id) {
  seleccionarPaciente(id);
  if (estado.pacienteId !== id) return; // hay una sesión en vivo sin guardar y no se quiso descartar
  irA('ejercicios');
  abrirChequeo(abrirListos); // paso 1 de la sesión guiada
}

function renderElegirPaciente() {
  const q = $('#buscar-sesion').value.trim().toLowerCase();
  const lista = pacientesActivos(estado.db)
    .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.documento.includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  $('#elegir-lista').innerHTML = lista.map((p) => `<li><button class="inicio-item" data-id="${esc(p.id)}">
      <span class="avatar" aria-hidden="true">${esc(iniciales(p.nombre))}</span>
      <span><b>${esc(p.nombre)}</b><small>${esc(p.id)} · Fase ${etapaSugerida(p.fechaCirugia, hoyISO())} sugerida</small></span>
    </button></li>`).join('') || '<li class="muted">Sin resultados</li>';
}

function initInicio() {
  $('#nav-inicio').addEventListener('click', irInicio);
  $('#marca-inicio').addEventListener('click', (e) => { e.preventDefault(); irInicio(); });
  $('#btn-nueva-sesion').addEventListener('click', () => {
    $('#buscar-sesion').value = '';
    renderElegirPaciente();
    $('#dlg-elegir-paciente').showModal();
    $('#buscar-sesion').focus();
  });
  $('#inicio-btn-nuevo').addEventListener('click', () => $('#btn-nuevo').click());
  $('#buscar-sesion').addEventListener('input', renderElegirPaciente);
  $('#elegir-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    $('#dlg-elegir-paciente').close();
    empezarSesionCon(b.dataset.id);
  });
  $('#elegir-cancelar').addEventListener('click', () => $('#dlg-elegir-paciente').close());
  $('#inicio').addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'empezar') { empezarSesionCon(b.dataset.id); return; }
    seleccionarPaciente(b.dataset.id);
    if (estado.pacienteId === b.dataset.id) irA('seguimiento', 'resumen');
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initInicio);
if (typeof module !== 'undefined') module.exports = { saludo, pacientesActivos, sesionesDeLaSemana, citasDeHoy, motivosAtencion, pacientesConAtencion, sesionesRecientes };
