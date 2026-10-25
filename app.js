/* Panel del profesional — seguimiento de rehabilitación post túnel del carpo. */

const STORAGE_KEY = 'rehabcarpo.db.v1';

const estado = {
  db: null,
  pacienteId: null,
  sesionId: null,
  tab: 'evolucion',
  romModo: 'grados',
  indicador: 'cumplimiento',
  ejercicio: 'flexion',
  cmpA: null,
  cmpB: null,
  busqueda: '',
};
const charts = {};

/* ======================= Persistencia ======================= */
function cargarDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      if (db && Array.isArray(db.pacientes)) return db;
    }
  } catch (e) { /* almacenamiento no disponible: se usa la demo en memoria */ }
  return generarDemo();
}
function guardarDB() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(estado.db)); return true; }
  catch (e) { return false; }
}

/* ======================= Utilidades ======================= */
const $ = (sel) => document.querySelector(sel);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const prom = (arr) => {
  const v = arr.filter((x) => x != null && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const fmt = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const hoyISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function fmtFecha(iso, corto = false) {
  const f = new Date(iso + 'T12:00:00');
  return f.toLocaleDateString('es-CO', corto ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' });
}
function dias(desdeISO, hastaISO) {
  return Math.round((new Date(hastaISO + 'T12:00:00') - new Date(desdeISO + 'T12:00:00')) / 86400000);
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

const ic = (nombre, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
const iniciales = (nombre) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

const paciente = () => estado.db.pacientes.find((p) => p.id === estado.pacienteId);
const sesionesOrdenadas = (p) => [...p.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
const ejercicioDe = (s, tipo) => s.ejercicios.find((e) => e.tipo === tipo);

/* Promedio del % del valor de referencia alcanzado en una sesión (tope 100 % por ejercicio). */
function progresoGlobal(s) {
  if (!s) return null;
  return prom(s.ejercicios.filter((e) => EJERCICIOS[e.tipo]).map((e) => Math.min(100, (e.anguloMax / EJERCICIOS[e.tipo].ref) * 100)));
}

/* Indicadores agregados por sesión. Una sesión de rutina puede no tener ejercicios
 * medidos (ejercicios: []): sus indicadores medidos quedan en null ("—"). */
function metricas(s) {
  const ej = s.ejercicios;
  const rep = ej.reduce((a, e) => a + e.repeticiones, 0);
  const obj = ej.reduce((a, e) => a + e.repeticionesObjetivo, 0);
  return {
    cumplimiento: obj ? (rep / obj) * 100 : null,
    dolor: s.dolorEVA,
    velocidad: prom(ej.map((e) => e.velocidadMedia)),
    variabilidad: prom(ej.map((e) => e.variabilidadPct)),
    duracion: s.duracionMin,
  };
}

const INDICADORES = {
  cumplimiento: { titulo: 'Cumplimiento de repeticiones', unidad: '%', desc: 'Repeticiones completadas sobre las prescritas, todos los ejercicios.', mejorSube: true, min: 0, max: 100, d: 0 },
  dolor:        { titulo: 'Dolor reportado (EVA)', unidad: '', desc: 'Escala visual análoga 0–10 reportada por el paciente al final de la sesión.', mejorSube: false, min: 0, max: 10, d: 0 },
  velocidad:    { titulo: 'Velocidad angular media', unidad: '°/s', desc: 'Promedio de la velocidad angular media de los ejercicios.', mejorSube: true, min: 0, d: 1 },
  variabilidad: { titulo: 'Variabilidad entre repeticiones', unidad: '%', desc: 'Coeficiente de variación de la amplitud entre repeticiones (menor = más consistente).', mejorSube: false, min: 0, d: 1 },
  duracion:     { titulo: 'Duración de la sesión', unidad: 'min', desc: 'Tiempo total de la sesión registrada por el dispositivo.', mejorSube: null, min: 0, d: 0 },
};

/* ======================= Tema de las gráficas ======================= */
function aplicarTemaCharts() {
  Chart.defaults.font.family = css('--font') || 'system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css('--ink-2');
  Chart.defaults.borderColor = css('--grid');
  Chart.defaults.animation = false;
  Chart.defaults.maintainAspectRatio = false;
  const tt = Chart.defaults.plugins.tooltip;
  tt.backgroundColor = css('--surface');
  tt.titleColor = css('--ink');
  tt.bodyColor = css('--ink-2');
  tt.borderColor = css('--border');
  tt.borderWidth = 1;
  tt.padding = 10;
  tt.boxPadding = 4;
  tt.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
}
function ejeY(titulo, extra = {}) {
  return {
    title: { display: !!titulo, text: titulo, color: css('--muted') },
    grid: { color: css('--grid') },
    border: { display: false },
    ticks: { color: css('--muted') },
    ...extra,
  };
}
function ejeX(extra = {}) {
  return { grid: { display: false }, border: { color: css('--axis') }, ticks: { color: css('--muted') }, ...extra };
}
function nuevoChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
  return charts[id];
}

/* ======================= Lista de pacientes ======================= */
function renderLista() {
  const q = estado.busqueda.toLowerCase();
  const lista = estado.db.pacientes
    .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.documento.includes(q) || p.id.toLowerCase().includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  $('#lista-pacientes').innerHTML = lista.map((p) => {
    const ses = sesionesOrdenadas(p);
    const ult = ses[ses.length - 1];
    const prog = progresoGlobal(ult);
    return `<li class="patient-item ${p.id === estado.pacienteId ? 'active' : ''}" data-id="${esc(p.id)}" tabindex="0">
      <span class="avatar" aria-hidden="true">${esc(iniciales(p.nombre))}</span>
      <span class="pi-name">${esc(p.nombre)}</span>
      <span class="pi-meta"><span>${esc(p.id)} · Mano ${esc(p.mano.toLowerCase())}</span><span>${dias(p.fechaCirugia, hoyISO())} d post-op</span></span>
      <span class="pi-meta"><span>${ult ? 'Última: ' + fmtFecha(ult.fecha, true) : 'Sin sesiones'} · ${ses.length} ses.</span><span>${prog == null ? '' : fmt(prog) + ' %'}</span></span>
      ${prog == null ? '' : `<span></span><span class="pi-bar" title="Progreso global: ${fmt(prog)} % del valor de referencia"><span style="width:${prog}%"></span></span>`}
    </li>`;
  }).join('') || '<li class="muted" style="padding:12px">Sin resultados</li>';
}

function seleccionarPaciente(id) {
  if (id !== estado.pacienteId && typeof monitorPuedeCambiarPaciente === 'function' && !monitorPuedeCambiarPaciente()) return;
  estado.pacienteId = id;
  const p = paciente();
  const ses = sesionesOrdenadas(p);
  estado.sesionId = ses.length ? ses[ses.length - 1].id : null;
  estado.cmpA = ses.length ? ses[0].id : null;
  estado.cmpB = ses.length ? ses[ses.length - 1].id : null;
  renderLista();
  renderPaciente();
}

/* ======================= Vista del paciente ======================= */
function renderPaciente() {
  const p = paciente();
  $('#vacio').hidden = !!p;
  $('#vista-paciente').hidden = !p;
  if (!p) return;
  renderEncabezado(p);
  renderKPIs(p);
  renderTab();
}

function renderEncabezado(p) {
  const ses = sesionesOrdenadas(p);
  const prog = progresoGlobal(ses[ses.length - 1]);
  const prog0 = progresoGlobal(ses[0]);
  const C = 2 * Math.PI * 42;
  const dpo = dias(p.fechaCirugia, hoyISO());
  $('#encabezado').innerHTML = `
    <div>
      <div class="eyebrow">Paciente en seguimiento</div>
      <div class="ph-name">${esc(p.nombre)}</div>
      <p class="ph-sub">Rehabilitación post liberación del túnel del carpo · mano ${esc(p.mano.toLowerCase())}</p>
      <div class="chips">
        <span class="chip">${ic('id')}ID <b>${esc(p.id)}</b></span>
        <span class="chip">${ic('user')}<b>${esc(p.edad)}</b> años · ${esc(p.sexo)} · Doc. ${esc(p.documento)}</span>
        <span class="chip">${ic('hand')}Mano <b>${esc(p.mano)}</b></span>
        <span class="chip">${ic('calendar')}Cirugía <b>${fmtFecha(p.fechaCirugia)}</b></span>
        ${p.ocupacion ? `<span class="chip">${ic('briefcase')}<b>${esc(p.ocupacion)}</b></span>` : ''}
        ${p.profesional ? `<span class="chip">${ic('stetho')}<b>${esc(p.profesional)}</b></span>` : ''}
      </div>
    </div>
    <div class="hero-card">
      <div class="ring" role="img" aria-label="Progreso global ${prog == null ? 'sin datos' : fmt(prog) + ' %'}">
        <svg viewBox="0 0 100 100"><circle class="ring-bg" cx="50" cy="50" r="42"/>
          <circle class="ring-fg" cx="50" cy="50" r="42" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - (prog ?? 0) / 100)}"/></svg>
        <span class="ring-txt">${prog == null ? '—' : fmt(prog) + '%'}</span>
      </div>
      <div>
        <div class="hero-card-label">Progreso global</div>
        <div class="hero-card-small">del rango de referencia${prog != null && prog0 != null && ses.length > 1 ? ` · ${prog - prog0 >= 0 ? '+' : ''}${fmt(prog - prog0)} pp desde el inicio` : ''}</div>
        <hr>
        <div class="hero-card-big">${dpo} días</div>
        <div class="hero-card-small">post-operatorio · ${ses.length} sesiones</div>
      </div>
    </div>`;
}

function deltaHTML(valor, mejorSube, unidad, d = 0, ref = 'vs. sesión anterior') {
  if (valor == null || isNaN(valor)) return `<span class="muted">${ref}: —</span>`;
  const signo = valor > 0 ? '▲ +' : valor < 0 ? '▼ ' : '';
  let cls = '';
  if (mejorSube != null && Math.abs(valor) > 0.05) cls = (valor > 0) === mejorSube ? 'up-good' : 'down-bad';
  return `<span class="${cls}">${signo}${fmt(valor, d)}${unidad}</span> <span class="muted">${ref}</span>`;
}

function renderKPIs(p) {
  const ses = sesionesOrdenadas(p);
  if (!ses.length) { $('#kpis').innerHTML = '<div class="kpi muted">El paciente aún no tiene sesiones registradas.</div>'; return; }
  const ult = ses[ses.length - 1];
  const prev = ses[ses.length - 2];
  const primera = ses[0];

  const romTile = (tipo) => {
    const e = EJERCICIOS[tipo];
    const v = ejercicioDe(ult, tipo)?.anguloMax;
    const v0 = ejercicioDe(primera, tipo)?.anguloMax;
    const pct = v == null ? null : Math.min(100, (v / e.ref) * 100);
    return `<div class="kpi">
      <span class="icon-bubble">${ic('angle', tipo === 'extension' ? 'flip' : '')}</span>
      <div class="kpi-label">${e.nombre} (último)</div>
      <div class="kpi-value">${v == null ? '— <small>sin dato</small>' : `${fmt(v, 0)}° <small>${fmt(pct, 0)}% ref.</small>`}</div>
      <div class="kpi-delta">${deltaHTML(ses.length > 1 && v != null && v0 != null ? v - v0 : null, true, '°', 0, 'desde la 1.ª sesión')}</div>
      <div class="bar-track" title="${v == null ? 'Sin dato en la última sesión' : `${fmt(v, 0)}° de ${e.ref}° de referencia`}"><div class="bar-fill" style="width:${pct ?? 0}%;background:var(${e.color})"></div></div>
    </div>`;
  };
  const m = metricas(ult), mp = prev ? metricas(prev) : null;
  $('#kpis').innerHTML = `
    ${romTile('flexion')}
    ${romTile('extension')}
    <div class="kpi">
      <span class="icon-bubble">${ic('check')}</span>
      <div class="kpi-label">Cumplimiento de repeticiones</div>
      <div class="kpi-value">${m.cumplimiento == null ? '—' : fmt(m.cumplimiento) + '%'}</div>
      <div class="kpi-delta">${deltaHTML(mp && m.cumplimiento != null && mp.cumplimiento != null ? m.cumplimiento - mp.cumplimiento : null, true, ' pp')}</div>
    </div>
    <div class="kpi">
      <span class="icon-bubble">${ic('heart')}</span>
      <div class="kpi-label">Dolor reportado (EVA)</div>
      <div class="kpi-value">${m.dolor ?? '—'} <small>/ 10</small></div>
      <div class="kpi-delta">${deltaHTML(mp && m.dolor != null && mp.dolor != null ? m.dolor - mp.dolor : null, false, '')}</div>
    </div>
    <div class="kpi">
      <span class="icon-bubble">${ic('calendar')}</span>
      <div class="kpi-label">Última sesión</div>
      <div class="kpi-value">${fmtFecha(ult.fecha, true)}</div>
      <div class="kpi-delta muted">hace ${dias(ult.fecha, hoyISO())} días · ${ult.duracionMin} min</div>
    </div>`;
}

/* ======================= Pestañas ======================= */
function renderTab() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === estado.tab));
  document.querySelectorAll('.tab-panel').forEach((pn) => (pn.hidden = pn.dataset.panel !== estado.tab));
  const p = paciente();
  if (!p) return;
  if (estado.tab === 'evolucion') renderEvolucion(p);
  if (estado.tab === 'sesion') renderSesion(p);
  if (estado.tab === 'comparar') renderComparar(p);
  if (estado.tab === 'historial') renderHistorial(p);
  if (estado.tab === 'vivo') renderMonitor();
}

/* ---------- Evolución ---------- */
function renderEvolucion(p) {
  const ses = sesionesOrdenadas(p);
  const labels = ses.map((s) => fmtFecha(s.fecha, true));
  const pct = estado.romModo === 'pct';

  nuevoChart('chart-rom', {
    type: 'line',
    data: {
      labels,
      datasets: ORDEN_EJERCICIOS.map((tipo) => {
        const e = EJERCICIOS[tipo];
        const color = css(e.color);
        return {
          label: e.corto,
          data: ses.map((s) => {
            const v = ejercicioDe(s, tipo)?.anguloMax;
            return v == null ? null : pct ? (v / e.ref) * 100 : v;
          }),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBorderColor: css('--surface'),
          pointBorderWidth: 2,
          tension: 0.25,
          spanGaps: true,
        };
      }),
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: {
          filter: (it) => it.parsed.y != null,
          callbacks: {
            title: (it) => (it.length ? `Sesión ${it[0].dataIndex + 1} · ${fmtFecha(ses[it[0].dataIndex].fecha)} · ${dias(p.fechaCirugia, ses[it[0].dataIndex].fecha)} d post-op` : ''),
            label: (c) => {
              const tipo = ORDEN_EJERCICIOS[c.datasetIndex];
              const v = ejercicioDe(ses[c.dataIndex], tipo)?.anguloMax;
              return ` ${c.dataset.label}: ${fmt(v, 1)}°  (${fmt((v / EJERCICIOS[tipo].ref) * 100)}% de ${EJERCICIOS[tipo].ref}°)`;
            },
          },
        },
      },
      scales: {
        x: ejeX(),
        y: ejeY(pct ? '% del valor de referencia' : 'Ángulo máximo (°)', { beginAtZero: true, suggestedMax: pct ? 100 : undefined }),
      },
    },
  });

  // Indicador seleccionable
  const ind = INDICADORES[estado.indicador];
  $('#ind-titulo').textContent = ind.titulo;
  $('#ind-desc').textContent = ind.desc;
  $('#ind-select').value = estado.indicador;
  const valores = ses.map((s) => metricas(s)[estado.indicador]);
  const color = css('--s1');
  const esBarra = estado.indicador === 'cumplimiento' || estado.indicador === 'duracion';
  nuevoChart('chart-ind', {
    type: esBarra ? 'bar' : 'line',
    data: {
      labels,
      datasets: [{
        label: ind.titulo,
        data: valores,
        borderColor: color,
        backgroundColor: color,
        borderWidth: esBarra ? 0 : 2,
        borderRadius: esBarra ? { topLeft: 4, topRight: 4 } : 0,
        borderSkipped: 'bottom',
        maxBarThickness: 28,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBorderColor: css('--surface'),
        pointBorderWidth: 2,
        tension: 0.25,
      }],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (it) => `Sesión ${it[0].dataIndex + 1} · ${fmtFecha(ses[it[0].dataIndex].fecha)}`,
            label: (c) => (c.parsed.y == null ? ' Sin dato' : ` ${fmt(c.parsed.y, ind.d)} ${ind.unidad}`),
          },
        },
      },
      scales: { x: ejeX(), y: ejeY(ind.unidad, { min: ind.min, max: ind.max, beginAtZero: true }) },
    },
  });

  renderObservaciones(p, ses);
}

function renderObservaciones(p, ses) {
  const obs = []; // {nivel: critical|warning|good|info, texto}
  const n = ses.length;
  if (!n) { $('#observaciones').innerHTML = '<li class="muted">Sin sesiones registradas.</li>'; return; }
  const ult = ses[n - 1], prev = ses[n - 2], primera = ses[0];

  // Calidad de datos de la última sesión (criterios de éxito del brief)
  if (ult.perdidaDatosPct >= 1) obs.push({ nivel: 'critical', texto: `<b>Calidad de datos:</b> la última sesión registró ${fmt(ult.perdidaDatosPct, 1)} % de pérdida de datos (criterio &lt; 1 %). Interpretar con precaución.` });
  if (ult.calibracion && (!ult.calibracion.ok || ult.calibracion.tiempoS > 30)) obs.push({ nivel: 'warning', texto: `<b>Calibración:</b> la última calibración ${ult.calibracion.ok ? `tardó ${fmt(ult.calibracion.tiempoS, 1)} s (criterio ≤ 30 s)` : 'reportó errores'}.` });

  ORDEN_EJERCICIOS.forEach((tipo) => {
    const e = EJERCICIOS[tipo];
    const v = ejercicioDe(ult, tipo)?.anguloMax;
    if (v == null) return;
    if (prev) {
      const vp = ejercicioDe(prev, tipo)?.anguloMax;
      if (vp && (vp - v) / vp > 0.08) obs.push({ nivel: 'warning', texto: `<b>${e.nombre}:</b> disminuyó ${fmt(((vp - v) / vp) * 100)} % respecto a la sesión anterior (${fmt(vp)}° → ${fmt(v)}°).` });
    }
    if (n >= 4) {
      // Solo sesiones con el ejercicio medido; hacen falta al menos 2 valores reales.
      const ult3 = ses.slice(-3).map((s) => ejercicioDe(s, tipo)?.anguloMax).filter((x) => x != null);
      const rango = Math.max(...ult3) - Math.min(...ult3);
      if (ult3.length >= 2 && rango < 3 && v / e.ref < 0.85) obs.push({ nivel: 'info', texto: `<b>${e.nombre}:</b> sin cambios mayores a 3° en las últimas 3 sesiones (${fmt(v)}°, ${fmt((v / e.ref) * 100)} % de referencia).` });
    }
  });

  if (!ult.ejercicios.length) obs.push({ nivel: 'info', texto: '<b>Última sesión:</b> no tiene ejercicios medidos por el dispositivo, así que no hay datos de movimiento para comparar.' });

  if (prev && ult.dolorEVA != null && prev.dolorEVA != null && ult.dolorEVA - prev.dolorEVA >= 2) {
    obs.push({ nivel: 'warning', texto: `<b>Dolor reportado:</b> aumentó de ${prev.dolorEVA} a ${ult.dolorEVA} (EVA) respecto a la sesión anterior.` });
  }

  if (n >= 2) {
    const ganancias = ORDEN_EJERCICIOS.map((tipo) => {
      const a = ejercicioDe(primera, tipo)?.anguloMax, b = ejercicioDe(ult, tipo)?.anguloMax;
      return a != null && b != null ? { tipo, d: b - a } : null;
    }).filter(Boolean).sort((x, y) => y.d - x.d);
    const mejor = ganancias[0];
    if (mejor && mejor.d > 0) obs.push({ nivel: 'good', texto: `<b>Mayor ganancia:</b> ${EJERCICIOS[mejor.tipo].nombre.toLowerCase()} +${fmt(mejor.d)}° desde la primera sesión (${fmtFecha(primera.fecha, true)}).` });
    const c0 = metricas(primera).variabilidad, c1 = metricas(ult).variabilidad;
    if (c0 != null && c1 != null && c1 < c0 - 1) obs.push({ nivel: 'good', texto: `<b>Consistencia:</b> la variabilidad entre repeticiones bajó de ${fmt(c0, 1)} % a ${fmt(c1, 1)} %.` });
  }

  const sinSesion = dias(ult.fecha, hoyISO());
  if (sinSesion > 10) obs.push({ nivel: 'info', texto: `<b>Seguimiento:</b> han pasado ${sinSesion} días desde la última sesión registrada.` });
  if (!obs.length) obs.push({ nivel: 'info', texto: 'No se detectaron cambios relevantes en la última sesión.' });

  const orden = { critical: 0, warning: 1, info: 2, good: 3 };
  const icono = { critical: '!', warning: '!', info: 'i', good: '✓' };
  const etiqueta = { critical: 'Crítico', warning: 'Atención', info: 'Información', good: 'Favorable' };
  $('#observaciones').innerHTML = obs
    .sort((a, b) => orden[a.nivel] - orden[b.nivel])
    .map((o) => `<li class="obs obs-${o.nivel}"><span class="obs-icon" role="img" aria-label="${etiqueta[o.nivel]}" title="${etiqueta[o.nivel]}">${icono[o.nivel]}</span><span>${o.texto}</span></li>`)
    .join('');
}

/* ---------- Detalle de sesión ---------- */
function opcionesSesiones(ses, seleccion) {
  return ses.map((s, i) => `<option value="${esc(s.id)}" ${s.id === seleccion ? 'selected' : ''}>Sesión ${i + 1} — ${fmtFecha(s.fecha)}</option>`).reverse().join('');
}

function renderSesion(p) {
  const ses = sesionesOrdenadas(p);
  if (!ses.length) return;
  if (!ses.some((s) => s.id === estado.sesionId)) estado.sesionId = ses[ses.length - 1].id;
  const idx = ses.findIndex((s) => s.id === estado.sesionId);
  const s = ses[idx], prev = ses[idx - 1];

  $('#sesion-select').innerHTML = opcionesSesiones(ses, s.id);
  $('#sesion-meta').textContent = `Sesión ${idx + 1} de ${ses.length} · ${fmtFecha(s.fecha)} · ${dias(p.fechaCirugia, s.fecha)} días post-operatorio · ${s.duracionMin} min`;

  const perdidaOk = s.perdidaDatosPct < 1;
  const calOk = s.calibracion?.ok && s.calibracion.tiempoS <= 30;
  $('#sesion-calidad').innerHTML = `
    <span class="badge"><span class="dot ${calOk ? 'good' : 'warning'}"></span>Calibración: ${s.calibracion ? fmt(s.calibracion.tiempoS, 1) + ' s' : '—'} ${calOk ? '(OK)' : '(revisar)'}</span>
    <span class="badge"><span class="dot ${perdidaOk ? 'good' : 'critical'}"></span>Pérdida de datos: ${fmt(s.perdidaDatosPct, 2)} % ${perdidaOk ? '(OK)' : '(&gt; 1 %)'}</span>
    <span class="badge">Dolor EVA: ${s.dolorEVA ?? '—'} / 10</span>
    <span class="badge">Cumplimiento: ${metricas(s).cumplimiento == null ? '—' : fmt(metricas(s).cumplimiento) + ' %'}</span>
    ${s.origen === 'simulador' ? '<span class="badge"><span class="dot warning"></span>Datos generados con el simulador</span>' : ''}`;

  const filas = ORDEN_EJERCICIOS.map((tipo) => {
    const e = ejercicioDe(s, tipo);
    if (!e) return '';
    const ep = prev && ejercicioDe(prev, tipo);
    const d = ep ? e.anguloMax - ep.anguloMax : null;
    const dcls = d == null ? '' : d > 0.05 ? 'up-good' : d < -0.05 ? 'down-bad' : '';
    return `<tr>
      <td><span class="swatch" style="background:var(${EJERCICIOS[tipo].color})"></span>${EJERCICIOS[tipo].nombre}</td>
      <td class="num">${e.repeticiones} / ${e.repeticionesObjetivo}${e.repeticionesManual != null ? ` <span class="muted">(manual ${e.repeticionesManual})</span>` : ''}</td>
      <td class="num">${fmt(e.anguloMax, 1)}°</td>
      <td class="num ${dcls}">${d == null ? '—' : (d > 0 ? '+' : '') + fmt(d, 1) + '°'}</td>
      <td class="num">${fmt((e.anguloMax / EJERCICIOS[tipo].ref) * 100)} %</td>
      <td class="num">${fmt(e.velocidadMedia, 1)} °/s</td>
      <td class="num">${fmt(e.variabilidadPct, 1)} %</td>
      <td class="num">${e.duracionS} s</td>
    </tr>`;
  }).join('');
  $('#tabla-ejercicios').innerHTML = `<thead><tr>
      <th>Ejercicio</th><th class="num">Repeticiones</th><th class="num">Ángulo máx.</th><th class="num">Δ vs. anterior</th>
      <th class="num">% referencia</th><th class="num">Vel. media</th><th class="num">Variabilidad</th><th class="num">Duración</th>
    </tr></thead><tbody>${filas || '<tr><td colspan="8" class="muted">Sin ejercicios medidos por el dispositivo en esta sesión.</td></tr>'}</tbody>`;

  renderRutinaSesion(s);

  // Señal del ejercicio (oculta si la sesión no tiene ejercicios medidos)
  const disponibles = s.ejercicios.map((e) => e.tipo);
  $('#sesion-senal').hidden = !disponibles.length;
  if (!disponibles.length) { charts['chart-senal']?.destroy(); delete charts['chart-senal']; return; }
  if (!disponibles.includes(estado.ejercicio)) estado.ejercicio = disponibles[0];
  $('#ejercicio-select').innerHTML = disponibles.map((t) => `<option value="${t}" ${t === estado.ejercicio ? 'selected' : ''}>${EJERCICIOS[t]?.nombre ?? t}</option>`).join('');
  const ej = ejercicioDe(s, estado.ejercicio);
  const { fs, angulos, sintetica } = obtenerSenal(s.id, ej);
  const paso = Math.max(1, Math.ceil(angulos.length / 1500));
  const puntos = [];
  for (let i = 0; i < angulos.length; i += paso) puntos.push({ x: i / fs, y: angulos[i] });
  const picos = (Array.isArray(ej.picos) && !sintetica ? ej.picos : detectarPicos(angulos, fs)).map((i) => ({ x: i / fs, y: angulos[i] }));
  const color = css(EJERCICIOS[estado.ejercicio]?.color ?? '--s1');

  nuevoChart('chart-senal', {
    type: 'line',
    data: {
      datasets: [
        { label: 'Ángulo', data: puntos, borderColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 },
        { label: `Repeticiones detectadas (${picos.length})`, data: picos, type: 'scatter', backgroundColor: color, borderColor: css('--surface'), borderWidth: 2, pointRadius: 5, pointHoverRadius: 7 },
      ],
    },
    options: {
      parsing: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end' },
        subtitle: { display: sintetica, text: 'Señal representativa reconstruida a partir de los indicadores (la sesión no incluye la señal cruda).', color: css('--muted'), align: 'start', padding: { bottom: 6 } },
        tooltip: { callbacks: { title: (it) => `t = ${fmt(it[0].parsed.x, 2)} s`, label: (c) => ` ${fmt(c.parsed.y, 1)}°` } },
      },
      scales: {
        x: ejeX({ type: 'linear', title: { display: true, text: 'Tiempo (s)', color: css('--muted') }, min: 0, max: angulos.length / fs }),
        y: ejeY('Ángulo (°)', { beginAtZero: true }),
      },
    },
  });
}

/* Tarjeta "Rutina" del detalle: solo para sesiones grabadas desde la rutina. */
function renderRutinaSesion(s) {
  const r = s.rutina;
  $('#sesion-rutina').hidden = !r;
  if (!r) return;
  // Datos importados: etapa fuera de 1–3 se muestra como "Fase —" y los números no válidos como "—".
  const conocida = ETAPAS.some((e) => e.numero === r.etapa);
  const etapa = etapaPorNumero(r.etapa);
  const orden = (id) => { const i = etapa.pasos.findIndex((x) => x.id === id); return i < 0 ? Infinity : i; };
  const pasos = (Array.isArray(r.pasos) ? r.pasos : []).filter((x) => x && typeof x === 'object')
    .sort((a, b) => orden(a.id) - orden(b.id));
  const num = (v, d = 0) => ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? fmt(Number(v), d) : '—');
  $('#sesion-rutina-titulo').textContent = conocida ? `Rutina: Fase ${r.etapa} — ${etapa.nombre}` : 'Rutina: Fase —';
  const filas = pasos.map((x) => `<tr>
      <td>${esc(x.nombre)}${x.tipo ? ' <span class="rt-medido">Medido</span>' : ''}</td>
      <td class="num">${num(x.repeticionesObjetivo)}</td>
      <td class="num">${num(x.repeticiones)}</td>
      <td class="num">${num(x.repeticionesManual)}</td>
      <td class="num">${num(x.duracionS)}</td>
    </tr>`).join('');
  $('#tabla-rutina').innerHTML = `<thead><tr>
      <th>Ejercicio</th><th class="num">Objetivo</th><th class="num">Detectadas</th><th class="num">Manual</th><th class="num">Duración (s)</th>
    </tr></thead><tbody>${filas || '<tr><td colspan="5" class="muted">No se grabó ningún ejercicio de la rutina.</td></tr>'}</tbody>`;
}

/* ---------- Comparar ---------- */
function renderComparar(p) {
  const ses = sesionesOrdenadas(p);
  if (!ses.length) return;
  if (!ses.some((s) => s.id === estado.cmpA)) estado.cmpA = ses[0].id;
  if (!ses.some((s) => s.id === estado.cmpB)) estado.cmpB = ses[ses.length - 1].id;
  $('#cmp-a').innerHTML = opcionesSesiones(ses, estado.cmpA);
  $('#cmp-b').innerHTML = opcionesSesiones(ses, estado.cmpB);
  const A = ses.find((s) => s.id === estado.cmpA), B = ses.find((s) => s.id === estado.cmpB);
  const nA = ses.indexOf(A) + 1, nB = ses.indexOf(B) + 1;
  const tipos = ORDEN_EJERCICIOS.filter((t) => ejercicioDe(A, t) || ejercicioDe(B, t));

  nuevoChart('chart-cmp', {
    type: 'bar',
    data: {
      labels: tipos.map((t) => EJERCICIOS[t].corto),
      datasets: [
        { label: `A · Sesión ${nA} (${fmtFecha(A.fecha, true)})`, data: tipos.map((t) => ejercicioDe(A, t)?.anguloMax ?? null), backgroundColor: css('--s1') },
        { label: `B · Sesión ${nB} (${fmtFecha(B.fecha, true)})`, data: tipos.map((t) => ejercicioDe(B, t)?.anguloMax ?? null), backgroundColor: css('--s2') },
      ].map((d) => ({ ...d, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', borderColor: css('--surface'), borderWidth: { left: 1, right: 1 }, maxBarThickness: 40 })),
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: { filter: (it) => it.parsed.y != null, callbacks: { label: (c) => ` ${c.dataset.label.split(' (')[0]}: ${fmt(c.parsed.y, 1)}° (${fmt((c.parsed.y / EJERCICIOS[tipos[c.dataIndex]].ref) * 100)}% ref.)` } },
      },
      scales: { x: ejeX(), y: ejeY('Ángulo máximo (°)', { beginAtZero: true }) },
    },
  });

  const filas = tipos.map((t) => {
    const a = ejercicioDe(A, t), b = ejercicioDe(B, t);
    const d = a && b ? b.anguloMax - a.anguloMax : null;
    const dcls = d == null ? '' : d > 0.05 ? 'up-good' : d < -0.05 ? 'down-bad' : '';
    return `<tr>
      <td>${EJERCICIOS[t].nombre}</td>
      <td class="num">${a ? fmt(a.anguloMax, 1) + '°' : '—'}</td>
      <td class="num">${b ? fmt(b.anguloMax, 1) + '°' : '—'}</td>
      <td class="num ${dcls}">${d == null ? '—' : (d > 0 ? '+' : '') + fmt(d, 1) + '°'}</td>
      <td class="num">${a && b && a.anguloMax ? (d > 0 ? '+' : '') + fmt((d / a.anguloMax) * 100) + ' %' : '—'}</td>
      <td class="num">${EJERCICIOS[t].ref}°</td>
    </tr>`;
  }).join('');
  const mA = metricas(A), mB = metricas(B);
  const filaM = (nombre, k, d, unidad) => `<tr><td>${nombre}</td><td class="num">${mA[k] == null ? '—' : fmt(mA[k], d) + unidad}</td><td class="num">${mB[k] == null ? '—' : fmt(mB[k], d) + unidad}</td><td class="num">${mA[k] == null || mB[k] == null ? '—' : (mB[k] - mA[k] > 0 ? '+' : '') + fmt(mB[k] - mA[k], d) + unidad}</td><td></td><td></td></tr>`;
  $('#tabla-cmp').innerHTML = `<thead><tr><th>Variable</th><th class="num">A · S${nA}</th><th class="num">B · S${nB}</th><th class="num">Diferencia</th><th class="num">Cambio relativo</th><th class="num">Referencia</th></tr></thead>
    <tbody>${filas}
      ${filaM('Cumplimiento de repeticiones', 'cumplimiento', 0, ' %')}
      ${filaM('Velocidad angular media', 'velocidad', 1, ' °/s')}
      ${filaM('Variabilidad entre repeticiones', 'variabilidad', 1, ' %')}
      ${filaM('Dolor reportado (EVA)', 'dolor', 0, '')}
    </tbody>`;
}

/* ---------- Historial y notas ---------- */
const grados = (v) => (v == null ? '—' : fmt(v, 1) + '°');

function renderHistorial(p) {
  const ses = sesionesOrdenadas(p);
  if (!ses.some((s) => s.id === estado.sesionId) && ses.length) estado.sesionId = ses[ses.length - 1].id;
  const filas = ses.map((s, i) => {
    const m = metricas(s);
    const okDatos = s.perdidaDatosPct < 1;
    return `<tr data-id="${esc(s.id)}" class="${s.id === estado.sesionId ? 'selected' : ''}">
      <td>${i + 1}</td>
      <td>${fmtFecha(s.fecha)}</td>
      <td class="num">${dias(p.fechaCirugia, s.fecha)}</td>
      <td class="num">${s.duracionMin} min</td>
      <td class="num">${m.cumplimiento == null ? '—' : fmt(m.cumplimiento) + ' %'}</td>
      <td class="num">${grados(ejercicioDe(s, 'flexion')?.anguloMax)}</td>
      <td class="num">${grados(ejercicioDe(s, 'extension')?.anguloMax)}</td>
      <td class="num">${s.dolorEVA ?? '—'}</td>
      <td><span class="dot ${okDatos ? 'good' : 'critical'}" style="display:inline-block"></span> ${okDatos ? 'OK' : 'Revisar'}</td>
      <td>${s.notas ? '📝' : ''}</td>
      <td><button class="btn btn-ghost btn-ver" data-id="${esc(s.id)}">Ver detalle</button></td>
    </tr>`;
  }).reverse().join('');
  $('#tabla-historial').innerHTML = `<thead><tr>
      <th>#</th><th>Fecha</th><th class="num">Días post-op</th><th class="num">Duración</th><th class="num">Cumplimiento</th>
      <th class="num">Flexión</th><th class="num">Extensión</th><th class="num">EVA</th><th>Datos</th><th>Nota</th><th></th>
    </tr></thead><tbody>${filas || '<tr><td colspan="11" class="muted">Sin sesiones</td></tr>'}</tbody>`;

  const s = ses.find((x) => x.id === estado.sesionId);
  $('#nota').disabled = !s;
  $('#nota').value = s?.notas ?? '';
  $('#nota-sesion-label').textContent = s ? `— Sesión ${ses.indexOf(s) + 1}, ${fmtFecha(s.fecha)}` : '';
  $('#nota-estado').textContent = '';
}

/* ======================= Importar / exportar ======================= */
function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function validarSesion(s) {
  if (!s || typeof s.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.fecha)) throw new Error('La sesión debe tener "fecha" en formato AAAA-MM-DD.');
  // Una sesión de rutina puede no tener ejercicios medidos si grabó al menos un paso.
  if (s.rutina != null) {
    if (typeof s.rutina !== 'object' || !Array.isArray(s.rutina.pasos)) throw new Error('La rutina de la sesión debe incluir una lista "pasos".');
    if (typeof s.rutina.etapa !== 'number' || !Number.isFinite(s.rutina.etapa)) throw new Error('La rutina de la sesión debe indicar la "etapa" con un número.');
  }
  if (!Array.isArray(s.ejercicios) || (!s.ejercicios.length && !s.rutina?.pasos?.length)) throw new Error('La sesión debe incluir una lista "ejercicios".');
  s.ejercicios.forEach((e, i) => {
    for (const k of ['tipo', 'repeticiones', 'repeticionesObjetivo', 'anguloMax']) {
      if (e[k] == null) throw new Error(`Ejercicio ${i + 1}: falta el campo "${k}".`);
    }
    if (!EJERCICIOS[e.tipo]) throw new Error(`Ejercicio ${i + 1}: tipo "${e.tipo}" no reconocido. Válidos: ${ORDEN_EJERCICIOS.join(', ')}.`);
    e.anguloMin ??= 0;
    e.velocidadMedia ??= null; // sin dato: se excluye de promedios
    e.variabilidadPct ??= null;
    e.duracionS ??= e.senal?.angulos ? Math.round(e.senal.angulos.length / (e.senal.fs || 50)) : 0;
  });
  s.duracionMin ??= Math.round(s.ejercicios.reduce((a, e) => a + e.duracionS, 0) / 60);
  s.perdidaDatosPct ??= 0;
  s.dolorEVA ??= null;
  s.notas ??= '';
  return s;
}

function importarJSON(texto) {
  const data = JSON.parse(texto);
  // Base de datos completa
  if (Array.isArray(data.pacientes)) {
    if (!confirm(`El archivo contiene ${data.pacientes.length} pacientes. ¿Reemplazar todos los datos actuales?`)) return;
    data.pacientes.forEach((p) => p.sesiones.forEach(validarSesion));
    estado.db = data;
    guardarDB();
    estado.pacienteId = null;
    renderLista(); renderPaciente();
    toast('Base de datos importada.');
    return;
  }
  // Una sesión (o varias) generada por el dispositivo
  const sesiones = Array.isArray(data.sesiones) ? data.sesiones : [data.sesion ?? data];
  const pid = data.pacienteId ?? estado.pacienteId;
  const p = estado.db.pacientes.find((x) => x.id === pid);
  if (!p) throw new Error(pid ? `No existe el paciente "${pid}".` : 'Seleccione un paciente o incluya "pacienteId" en el archivo.');
  sesiones.forEach((s) => {
    validarSesion(s);
    s.id ??= `${p.id}-S${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const i = p.sesiones.findIndex((x) => x.id === s.id);
    if (i >= 0) p.sesiones[i] = s; else p.sesiones.push(s);
  });
  guardarDB();
  seleccionarPaciente(p.id);
  estado.sesionId = sesiones[sesiones.length - 1].id;
  toast(`${sesiones.length} sesión(es) importada(s) para ${p.nombre}.`);
}

function exportarCSV(p) {
  const enc = ['paciente_id', 'sesion_id', 'fecha', 'dias_postop', 'duracion_min', 'dolor_eva', 'perdida_datos_pct', 'calibracion_s',
    'ejercicio', 'repeticiones', 'repeticiones_objetivo', 'angulo_max', 'angulo_min', 'velocidad_media', 'variabilidad_pct', 'duracion_s'];
  const filas = [enc.join(';')];
  // Una sesión sin ejercicios medidos sale en una fila con las columnas del ejercicio vacías.
  sesionesOrdenadas(p).forEach((s) => (s.ejercicios.length ? s.ejercicios : [{}]).forEach((e) => {
    filas.push([p.id, s.id, s.fecha, dias(p.fechaCirugia, s.fecha), s.duracionMin, s.dolorEVA ?? '', s.perdidaDatosPct, s.calibracion?.tiempoS ?? '',
      e.tipo, e.repeticiones, e.repeticionesObjetivo, e.anguloMax, e.anguloMin, e.velocidadMedia, e.variabilidadPct, e.duracionS]
      .map((v) => String(v ?? '').replace('.', ',')).join(';'));
  }));
  descargar(`${p.id}_sesiones.csv`, '﻿' + filas.join('\r\n'), 'text/csv;charset=utf-8');
}

/* ======================= Eventos ======================= */
function init() {
  estado.db = cargarDB();
  aplicarTemaCharts();

  $('#lista-pacientes').addEventListener('click', (e) => {
    const li = e.target.closest('.patient-item');
    if (li) seleccionarPaciente(li.dataset.id);
  });
  $('#lista-pacientes').addEventListener('keydown', (e) => {
    const li = e.target.closest('.patient-item');
    if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); seleccionarPaciente(li.dataset.id); }
  });
  $('#buscar').addEventListener('input', (e) => { estado.busqueda = e.target.value; renderLista(); });

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { estado.tab = t.dataset.tab; renderTab(); }));
  document.querySelectorAll('#rom-modo .seg-btn').forEach((b) => b.addEventListener('click', () => {
    estado.romModo = b.dataset.modo;
    document.querySelectorAll('#rom-modo .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    renderEvolucion(paciente());
  }));
  $('#ind-select').addEventListener('change', (e) => { estado.indicador = e.target.value; renderEvolucion(paciente()); });
  $('#sesion-select').addEventListener('change', (e) => { estado.sesionId = e.target.value; renderSesion(paciente()); });
  $('#ejercicio-select').addEventListener('change', (e) => { estado.ejercicio = e.target.value; renderSesion(paciente()); });
  $('#cmp-a').addEventListener('change', (e) => { estado.cmpA = e.target.value; renderComparar(paciente()); });
  $('#cmp-b').addEventListener('change', (e) => { estado.cmpB = e.target.value; renderComparar(paciente()); });

  $('#tabla-historial').addEventListener('click', (e) => {
    const ver = e.target.closest('.btn-ver');
    if (ver) { estado.sesionId = ver.dataset.id; estado.tab = 'sesion'; renderTab(); return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr) { estado.sesionId = tr.dataset.id; renderHistorial(paciente()); }
  });

  let notaTimer;
  $('#nota').addEventListener('input', (e) => {
    const s = paciente()?.sesiones.find((x) => x.id === estado.sesionId);
    if (!s) return;
    s.notas = e.target.value;
    $('#nota-estado').textContent = 'Guardando…';
    clearTimeout(notaTimer);
    notaTimer = setTimeout(() => {
      $('#nota-estado').textContent = guardarDB() ? 'Nota guardada.' : 'No se pudo guardar en este navegador.';
      const fila = document.querySelector(`#tabla-historial tr[data-id="${CSS.escape(s.id)}"] td:nth-child(10)`);
      if (fila) fila.textContent = s.notas ? '📝' : '';
    }, 500);
  });

  $('#btn-csv').addEventListener('click', () => paciente() && exportarCSV(paciente()));
  $('#btn-exportar').addEventListener('click', () => descargar(`rehab_carpo_${hoyISO()}.json`, JSON.stringify(estado.db, null, 2), 'application/json'));
  $('#btn-importar').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { importarJSON(await f.text()); }
    catch (err) { alert('No se pudo importar el archivo:\n' + err.message); }
  });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Se reemplazarán todos los datos (incluidas las notas) por los datos de demostración. ¿Continuar?')) return;
    estado.db = generarDemo();
    guardarDB();
    estado.pacienteId = null;
    renderLista(); renderPaciente();
    toast('Datos de demostración restablecidos.');
  });

  $('#btn-nuevo').addEventListener('click', () => { $('#form-paciente').reset(); $('#dlg-paciente').showModal(); });
  $('#dlg-paciente').addEventListener('close', () => {
    if ($('#dlg-paciente').returnValue !== 'ok') return;
    const d = Object.fromEntries(new FormData($('#form-paciente')));
    const num = Math.max(0, ...estado.db.pacientes.map((p) => parseInt(p.id.replace(/\D/g, ''), 10) || 0)) + 1;
    const p = { id: `P-${String(num).padStart(3, '0')}`, ...d, edad: Number(d.edad), sesiones: [] };
    estado.db.pacientes.push(p);
    guardarDB();
    seleccionarPaciente(p.id);
    toast(`Paciente ${p.id} creado.`);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { aplicarTemaCharts(); renderTab(); });
  // Redibuja las gráficas cuando termine de cargar la tipografía web
  document.fonts?.ready.then(() => { aplicarTemaCharts(); renderTab(); });
  window.addEventListener('beforeunload', guardarDB);

  renderLista();
  const primero = [...estado.db.pacientes].sort((a, b) => a.nombre.localeCompare(b.nombre))[0];
  if (primero) seleccionarPaciente(primero.id); else renderPaciente();
}

document.addEventListener('DOMContentLoaded', init);
