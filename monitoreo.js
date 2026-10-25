/* Monitoreo en vivo: conexión con el dispositivo (Web Serial) o con un simulador,
 * calibración, conteo de repeticiones en tiempo real y registro de la sesión.
 *
 * PROTOCOLO (texto ASCII, un mensaje por línea terminada en \n)
 *
 *   Dispositivo → PC
 *     D,<seq>,<t_ms>,<fe>,<rc>,<mcf>   Muestra. seq: contador creciente (detecta pérdidas),
 *                                      t_ms: tiempo del dispositivo en ms,
 *                                      fe:  flexo-extensión de muñeca en grados (+flexión / −extensión),
 *                                      rc:  desviación en grados (+radial / −cubital),
 *                                      mcf: flexión de dedos (metacarpofalángica) en grados.
 *     CAL,OK,<ms>                      Calibración terminada (ms que tardó en el dispositivo).
 *     CAL,ERR,<motivo>                 Calibración fallida.
 *     BAT,<porcentaje>                 Nivel de batería (opcional).
 *     #<texto>                         Mensaje libre de depuración (se ignora).
 *
 *   PC → Dispositivo
 *     START                            Empezar a transmitir muestras.
 *     STOP                             Dejar de transmitir.
 *     CAL                              Ejecutar calibración (posición neutra = 0°).
 *     EJ,<tipo>,<objetivo> | EJ,-      Ejercicio en curso / ninguno (informativo para el dispositivo).
 *     PR,<musculo> | PR,-              Contracción de la prueba de fuerza EMG (informativo).
 *
 *   La línea D puede traer 3 campos más: ,<emg1>,<emg2>,<emg3> (tenar, flexores, extensores; 0–1000).
 */

const VENTANA_S = 15;        // segundos visibles en la gráfica
const REFRESCO_MS = 100;     // periodo de actualización de la pantalla (criterio ≤ 500 ms)
const CAL_TIMEOUT_S = 30;    // criterio de calibración
const CANALES = {
  fe:  { nombre: 'Flexo-extensión', color: '--s1' },
  rc:  { nombre: 'Desv. radio-cubital', color: '--s3' },
  mcf: { nombre: 'Flexión MCF', color: '--s5' },
};

const mv = {
  transporte: null,
  origen: null,
  conectado: false,
  conectando: false,
  cal: null,             // { tiempoS, ok, motivo }
  calInicio: null,       // performance.now() al pedir la calibración
  bateria: null,
  stats: null,
  buffer: [],            // [{ t (s, reloj del dispositivo), fe, rc, mcf, emg: {tenar, flexores, extensores} | null }]
  conEmg: false,         // llegó al menos una línea D con EMG en esta conexión
  ej: null,              // ejercicio en curso
  paso: null,            // paso de rutina en curso: { paso, muestras, registro? }
  sesion: null,          // { pacienteId, inicio, ejercicios, calibracion, origen, base, rutina }
  chart: null,
  timer: null,
};

function statsVacias() {
  return { recibidas: 0, perdidas: 0, malformadas: 0, ultimoSeq: null, ultimaRx: 0 };
}

/* ======================= Transportes ======================= */

class TransporteSerial {
  static disponible() { return 'serial' in navigator; }

  async conectar({ baud }) {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: baud });
    this.activo = true;
    this._leer();
  }

  async _leer() {
    const decoder = new TextDecoderStream();
    this.cerrado = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();
    let resto = '';
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        resto += value;
        const lineas = resto.split(/\r?\n/);
        resto = lineas.pop();
        if (resto.length > 4096) resto = ''; // basura sin fin de línea
        for (const l of lineas) if (l.trim()) this.onLinea?.(l.trim());
      }
    } catch (e) {
      /* el puerto se cerró o el cable se desconectó */
    } finally {
      this.reader.releaseLock();
    }
    if (this.activo) {
      this.activo = false;
      this.onCierre?.('Se perdió la conexión con el dispositivo.');
    }
  }

  async enviar(cmd) {
    if (!this.port?.writable) return;
    const w = this.port.writable.getWriter();
    try { await w.write(new TextEncoder().encode(cmd + '\n')); } finally { w.releaseLock(); }
  }

  async desconectar() {
    this.activo = false;
    try { await this.enviar('STOP'); } catch (e) { /* ya desconectado */ }
    try { await this.reader?.cancel(); } catch (e) { /* idem */ }
    try { await this.cerrado; } catch (e) { /* idem */ }
    try { await this.port?.close(); } catch (e) { /* idem */ }
  }
}

/* Simula el dispositivo a 50 Hz hablando el mismo protocolo, para probar la
 * interfaz sin hardware. Imita a un paciente que hace el ejercicio indicado. */
class TransporteSimulado {
  async conectar() {
    this.rand = rng(Date.now() >>> 0);
    this.t0 = performance.now();
    this.enviadas = 0;
    this.seq = 0;
    this.transmitiendo = false;
    this.ejercicio = null;
    this.cal = null;
    this.contraccion = null; // músculo pedido con PR en la prueba de fuerza
    this.emg = !(typeof window !== 'undefined' && window.SIMULADOR_SIN_EMG === true);
    this.emgPlano = typeof window !== 'undefined' && window.SIMULADOR_EMG_PLANO === true; // electrodos despegados
    this.timer = setInterval(() => this._tick(), 20);
    setTimeout(() => { this.onLinea?.('#Simulador listo'); this.onLinea?.('BAT,87'); }, 50);
  }

  _ahora() { return performance.now() - this.t0; }

  async enviar(cmd) {
    const [c, tipo, objetivo] = cmd.split(',');
    if (c === 'START') this.transmitiendo = true;
    if (c === 'STOP') this.transmitiendo = false;
    if (c === 'CAL') this.cal = { inicio: performance.now(), dur: 3000 + this.rand() * 5000 };
    if (c === 'PR') this.contraccion = MUSCULOS.includes(tipo) ? { musculo: tipo, amp: 400 + this.rand() * 100 } : null;
    if (c === 'EJ') {
      if (!EJERCICIOS[tipo]) { this.ejercicio = null; return; }
      const reps = Math.max(1, Number(objetivo) - (this.rand() < 0.3 ? 1 : 0));
      const amp = EJERCICIOS[tipo].ref * (0.65 + this.rand() * 0.2);
      this.ejercicio = {
        tipo,
        t0: this._ahora(),
        periodo: 3 + this.rand() * 1.2,
        reps,
        amps: Array.from({ length: reps }, () => amp * (0.95 + this.rand() * 0.1)),
      };
    }
  }

  _tick() {
    if (this.cal && performance.now() - this.cal.inicio >= this.cal.dur) {
      this.onLinea?.(`CAL,OK,${Math.round(this.cal.dur)}`);
      this.cal = null;
    }
    const objetivo = Math.floor(this._ahora() / 20);
    if (!this.transmitiendo) { this.enviadas = objetivo; return; }
    while (this.enviadas < objetivo) {
      const t = this.enviadas * 20;
      this.enviadas++;
      this.seq++;
      if (this.rand() < 0.003) continue; // pérdida simulada de ~0,3 %
      const a = this._angulos(t);
      const emg = this.emg ? ',' + this._emg(t).join(',') : '';
      this.onLinea?.(`D,${this.seq},${t},${a.fe.toFixed(1)},${a.rc.toFixed(1)},${a.mcf.toFixed(1)}${emg}`);
    }
  }

  _angulos(t) {
    const ruido = () => (this.rand() - 0.5) * 1.2;
    const a = { fe: 2 + ruido(), rc: ruido(), mcf: 8 + ruido() };
    const ej = this.ejercicio;
    if (ej) {
      const { canal, signo } = EJERCICIOS[ej.tipo];
      const s = (t - ej.t0) / 1000 - 1.5; // el paciente arranca tras 1,5 s
      const k = Math.floor(s / ej.periodo);
      if (s > 0 && k < ej.reps) {
        const fase = (s - k * ej.periodo) / ej.periodo;
        a[canal] += signo * ej.amps[k] * (0.5 - 0.5 * Math.cos(2 * Math.PI * fase));
      }
    }
    return a;
  }

  // EMG simulado (0–1000): reposo ~20; en la prueba, el músculo pedido ~400–500 y los otros ~60–100;
  // en la rutina, flexión/puño activan los flexores y extensión los extensores (~150).
  _emg(t) {
    const v = { tenar: 20, flexores: 20, extensores: 20 };
    const c = this.contraccion;
    if (c) {
      MUSCULOS.forEach((k) => { v[k] = k === c.musculo ? c.amp : 60 + this.rand() * 40; });
    } else if (this.ejercicio) {
      const ej = this.ejercicio;
      const musculo = ej.tipo === 'extension' ? 'extensores' : ['flexion', 'puno'].includes(ej.tipo) ? 'flexores' : null;
      const s = (t - ej.t0) / 1000 - 1.5;
      if (musculo && s > 0) v[musculo] += 130 * (0.5 - 0.5 * Math.cos(2 * Math.PI * ((s % ej.periodo) / ej.periodo)));
    }
    if (this.emgPlano) return [0, 0, 0];
    return MUSCULOS.map((k) => Math.max(0, Math.min(1000, Math.round(v[k] + (this.rand() - 0.5) * 10))));
  }

  async desconectar() { clearInterval(this.timer); }
}

/* ======================= Recepción de datos ======================= */

function procesarLinea(linea) {
  const st = mv.stats;
  const partes = linea.split(',');
  switch (partes[0]) {
    case 'D': {
      const d = parsearMuestra(partes);
      if (!d) { st.malformadas++; return; }
      const { seq, t, fe, rc, mcf, emg } = d;
      if (st.ultimoSeq != null && seq > st.ultimoSeq + 1) st.perdidas += seq - st.ultimoSeq - 1;
      st.ultimoSeq = seq;
      st.recibidas++;
      st.ultimaRx = performance.now();
      const m = { t, fe, rc, mcf, emg };
      if (emg) {
        mv.conEmg = true;
        if (mv.sesion) mv.sesion.conEmg = true;
        if (mv.paso && mv.sesion) acumularSenalEmg(mv.sesion, emg);
        if (typeof pruebaRecibirMuestra === 'function') pruebaRecibirMuestra(emg);
      }
      const ult = mv.buffer[mv.buffer.length - 1];
      if (ult && m.t < ult.t) mv.buffer = []; // el dispositivo se reinició
      mv.buffer.push(m);
      while (mv.buffer.length && mv.buffer[0].t < m.t - VENTANA_S) mv.buffer.shift();
      if (mv.paso) mv.paso.muestras.push(m);
      if (mv.ej) procesarMuestraEjercicio(m);
      break;
    }
    case 'CAL': {
      if (mv.calInicio == null) return;
      const tiempoS = (performance.now() - mv.calInicio) / 1000;
      mv.cal = partes[1] === 'OK'
        ? { tiempoS, ok: tiempoS <= CAL_TIMEOUT_S }
        : { tiempoS, ok: false, motivo: partes.slice(2).join(',') || 'error del dispositivo' };
      mv.calInicio = null;
      if (mv.sesion) mv.sesion.calibracion = mv.cal;
      renderMonitorControles();
      break;
    }
    case 'BAT':
      mv.bateria = Number(partes[1]);
      break;
    default:
      if (!linea.startsWith('#')) st.malformadas++;
  }
}

function acumularSenalEmg(sesion, emg) {
  const v = sesion.emgVentana;
  MUSCULOS.forEach((k) => { v.max[k] = Math.max(v.max[k], emg[k]); });
  if (++v.n < 25) return;
  MUSCULOS.forEach((k) => { sesion.emgSenal[k].push(v.max[k]); v.max[k] = 0; });
  v.n = 0;
}

/* ======================= Ejercicios ======================= */

const maximo = (arr) => arr.reduce((a, b) => (b > a ? b : a), -Infinity);
const minimo = (arr) => arr.reduce((a, b) => (b < a ? b : a), Infinity);

const mediana = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* Umbrales con histéresis relativos a la posición de reposo, ajustados a la
 * amplitud típica de las repeticiones ya detectadas. */
function umbrales(ej) {
  return { alto: Math.max(8, 0.5 * ej.refAmp), bajo: Math.max(3, 0.25 * ej.refAmp) };
}

function nuevaSesion() {
  return {
    pacienteId: estado.pacienteId,
    inicio: Date.now(),
    ejercicios: [],
    calibracion: mv.cal,
    origen: mv.origen,
    base: { recibidas: mv.stats?.recibidas ?? 0, perdidas: mv.stats?.perdidas ?? 0 },
    conEmg: mv.conEmg,
    // Señal EMG de los pasos a 2 Hz: máximo de cada 25 muestras (~0,5 s). Así una rutina de 10 min
    // ocupa ~15 KB y no llena el almacenamiento del navegador.
    emgSenal: { fs: 2, tenar: [], flexores: [], extensores: [] },
    emgVentana: { n: 0, max: { tenar: 0, flexores: 0, extensores: 0 } },
    emgPrueba: null,       // la llena la prueba de fuerza muscular
  };
}

function iniciarEjercicio(tipo, objetivo) {
  objetivo = Math.max(1, parseInt(objetivo, 10) || 10);
  if (!mv.conectado || mv.ej || !EJERCICIOS[tipo]) return;
  if (!mv.cal?.ok) { toast('Calibre el dispositivo antes de iniciar.'); return; }

  if (!mv.sesion) mv.sesion = nuevaSesion();

  const { canal, signo } = EJERCICIOS[tipo];
  const reposo = mv.buffer.slice(-25).map((m) => signo * m[canal]);
  mv.ej = {
    tipo, objetivo, canal, signo,
    base: reposo.length ? prom(reposo) : 0,
    inicio: Date.now(),
    tiempos: [],
    valores: [],
    picos: [],       // índices de los picos (repeticiones)
    picosRel: [],    // amplitud de cada repetición sobre el reposo
    arriba: false,
    pico: 0,
    picoIdx: 0,
    refAmp: 0.3 * EJERCICIOS[tipo].ref,
  };
  mv.transporte.enviar(`EJ,${tipo},${objetivo}`);
  renderMonitorControles();
}

function procesarMuestraEjercicio(m) {
  const e = mv.ej;
  const v = e.signo * m[e.canal];
  const i = e.valores.length;
  e.tiempos.push(m.t);
  e.valores.push(v);
  const rel = v - e.base;
  const { alto, bajo } = umbrales(e);
  if (!e.arriba) {
    if (rel > alto) { e.arriba = true; e.pico = rel; e.picoIdx = i; }
  } else {
    if (rel > e.pico) { e.pico = rel; e.picoIdx = i; }
    if (rel < bajo) {
      e.arriba = false;
      e.picos.push(e.picoIdx);
      e.picosRel.push(e.pico);
      e.refAmp = mediana(e.picosRel);
      if (e.picos.length === e.objetivo) toast(`Objetivo alcanzado: ${e.objetivo} repeticiones.`);
    }
  }
}

function finalizarEjercicio() {
  const e = mv.ej;
  if (!e) return null;
  mv.ej = null;
  mv.transporte?.enviar('EJ,-').catch(() => {});
  renderMonitorControles();

  const n = e.valores.length;
  const dur = n > 1 ? e.tiempos[n - 1] - e.tiempos[0] : 0;
  if (n < 25 || dur < 1) { toast('Ejercicio demasiado corto: no se registró.'); return null; }

  let suma = 0, cuenta = 0;
  for (let i = 2; i < n; i++) {
    const dt = e.tiempos[i] - e.tiempos[i - 2];
    if (dt <= 0) continue;
    const w = Math.abs(e.valores[i] - e.valores[i - 2]) / dt;
    if (w > 5) { suma += w; cuenta++; }
  }
  const amps = e.picosRel;
  const media = prom(amps);
  const cv = amps.length >= 2 ? (Math.sqrt(prom(amps.map((a) => (a - media) ** 2))) / media) * 100 : null;

  const registro = {
    tipo: e.tipo,
    repeticionesObjetivo: e.objetivo,
    repeticiones: e.picos.length,
    repeticionesManual: null,
    anguloMax: r1(maximo(e.valores)),
    anguloMin: r1(minimo(e.valores)),
    velocidadMedia: cuenta ? r1(suma / cuenta) : null,
    variabilidadPct: cv == null ? null : r1(cv),
    duracionS: Math.round(dur),
    senal: { fs: r1((n - 1) / dur), angulos: e.valores.map(r1) },
    picos: e.picos,
  };
  const ejs = mv.sesion.ejercicios;
  const previo = ejs.findIndex((x) => x.tipo === e.tipo);
  if (previo >= 0) ejs[previo] = registro; else ejs.push(registro);
  return registro;
}

/* ======================= Rutina por pasos ======================= */

function iniciarSesionRutina(etapa) {
  mv.sesion = nuevaSesion();
  mv.sesion.rutina = { etapa, pasos: [] };
  renderMonitorControles();
}

function iniciarPasoRutina(paso) {
  if (mv.paso) finalizarPasoRutina();
  mv.paso = { paso, muestras: [] };
  if (paso.tipo && mv.conectado) iniciarEjercicio(paso.tipo, paso.reps);
  else mv.transporte?.enviar('EJ,-').catch(() => {});
  renderMonitorControles();
}

function finalizarPasoRutina() {
  const actual = mv.paso;
  if (!actual) return;
  // Si la conexión se perdió durante el paso, el registro ya quedó guardado en actual.registro.
  const registro = mv.ej ? finalizarEjercicio() : actual.registro ?? null;
  mv.paso = null;
  renderMonitorControles();

  const { paso, muestras } = actual;
  const resumen = resumenSenal(muestras);
  if (!registro && !resumen) { toast(`${paso.nombre}: sin datos suficientes, no se registró.`); return; }
  if (!mv.sesion?.rutina) return;

  const reg = {
    id: paso.id,
    nombre: paso.nombre,
    tipo: paso.tipo ?? null,
    repeticionesObjetivo: paso.reps,
    repeticiones: registro?.repeticiones ?? null,
    repeticionesManual: null,
    duracionS: registro?.duracionS ?? resumen.duracionS,
  };
  // Sin registro medido (paso sin tipo, o el ejercicio no llegó a iniciarse): se guarda la señal cruda.
  if (!registro) reg.senal = resumen.senal;
  mv.sesion.rutina.pasos = guardarRegistroPaso(mv.sesion.rutina.pasos, reg);
}

function repeticionesEnCurso() {
  return mv.ej ? mv.ej.picos.length : null;
}

function estadoDispositivo() {
  const cal = mv.cal;
  return {
    conectado: mv.conectado,
    origen: mv.conectado ? mv.origen : null,
    calibrando: mv.calInicio != null,
    calOk: !!cal?.ok,
    calMotivo: cal && !cal.ok ? cal.motivo || `tardó ${fmt(cal.tiempoS, 1)} s (> ${CAL_TIMEOUT_S} s)` : null,
    calTiempoS: cal ? cal.tiempoS : null,
    conEmg: mv.conEmg,
  };
}

/* ======================= Sesión ======================= */

function sesionTieneDatos() {
  return !!(mv.ej || mv.paso || mv.sesion?.ejercicios.length || mv.sesion?.rutina?.pasos.length);
}

function descartarSesion(preguntar = true) {
  if (preguntar && sesionTieneDatos() && !confirm('¿Descartar los ejercicios registrados en esta sesión?')) return;
  if (mv.ej) { mv.ej = null; mv.transporte?.enviar('EJ,-').catch(() => {}); }
  mv.paso = null;
  mv.sesion = null;
  renderMonitor();
}

const conteoManual = (v) => (v == null || v === '' || !isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v))));

function guardarSesionRutina({ dolor = null, notas = '', manuales = {} } = {}) {
  if (mv.paso) finalizarPasoRutina();
  if (mv.ej) finalizarEjercicio();
  if (!mv.sesion?.rutina?.pasos.length) { toast('No se grabó ningún ejercicio; no se puede guardar.'); return false; }
  const p = estado.db.pacientes.find((x) => x.id === mv.sesion.pacienteId);
  if (!p) { toast('El paciente de esta sesión ya no existe.'); return false; }

  const eva = dolor == null || dolor === '' || !isFinite(Number(dolor)) ? null : Math.min(10, Math.max(0, Math.round(Number(dolor))));
  const pasos = (mv.sesion.rutina?.pasos ?? []).map((r) => ({ ...r, repeticionesManual: conteoManual(manuales[r.id]) }));
  const ejercicios = mv.sesion.ejercicios.map((e) => {
    const r = pasos.find((x) => x.tipo === e.tipo);
    return r ? { ...e, repeticionesManual: r.repeticionesManual } : e;
  });
  const rec = (mv.stats?.recibidas ?? 0) - mv.sesion.base.recibidas;
  const per = (mv.stats?.perdidas ?? 0) - mv.sesion.base.perdidas;
  const cal = mv.sesion.calibracion;

  const s = {
    id: `${p.id}-S${Date.now().toString(36)}`,
    fecha: hoyISO(),
    duracionMin: Math.max(1, Math.round((Date.now() - mv.sesion.inicio) / 60000)),
    calibracion: cal ? { tiempoS: r1(cal.tiempoS), ok: cal.ok } : null,
    perdidaDatosPct: rec + per ? Math.round((per / (rec + per)) * 10000) / 100 : 0,
    dolorEVA: eva,
    notas: String(notas ?? '').trim(),
    origen: mv.sesion.origen,
    ejercicios,
  };
  if (mv.sesion.rutina) s.rutina = { etapa: mv.sesion.rutina.etapa, pasos };
  if (mv.sesion.conEmg) s.emg = { prueba: mv.sesion.emgPrueba ?? null, senal: mv.sesion.emgSenal };
  p.sesiones.push(s);
  if (!guardarDB()) {
    p.sesiones.pop();
    alert('No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado. Exporte los datos y libere espacio.');
    return false;
  }
  descartarSesion(false);
  toast(`Sesión guardada para ${p.nombre}.`);
  if (p.id === estado.pacienteId) {
    estado.sesionId = s.id;
    estado.seccion = 'seguimiento';
    estado.vista = 'sesion';
    renderLista();
    renderPaciente();
  }
  return true;
}

function monitorPuedeCambiarPaciente() {
  if (!sesionTieneDatos()) { mv.sesion = null; return true; }
  const p = estado.db.pacientes.find((x) => x.id === mv.sesion?.pacienteId);
  if (!confirm(`Hay una sesión en vivo sin guardar${p ? ' de ' + p.nombre : ''}. ¿Descartarla y cambiar de paciente?`)) return false;
  descartarSesion(false);
  return true;
}

/* ======================= Conexión ======================= */

async function alternarConexion() {
  if (mv.conectado) { await desconectar(); return; }
  if (mv.conectando) return;
  const origen = $('#mv-origen').value;
  await conectarCon(origen === 'usb' ? new TransporteSerial() : new TransporteSimulado(), origen);
}

/* Si no hay dispositivo conectado, conecta el simulador (la sesión queda marcada como simulada). */
async function asegurarConexion() {
  while (mv.conectando) await new Promise((r) => setTimeout(r, 100));
  if (mv.conectado) return;
  $('#mv-origen').value = 'simulador';
  await conectarCon(new TransporteSimulado(), 'simulador');
}

async function conectarCon(t, origen) {
  t.onLinea = procesarLinea;
  t.onCierre = (motivo) => alPerderConexion(motivo);

  mv.conectando = true;
  renderMonitorControles();
  try {
    await t.conectar({ baud: Number($('#mv-baud').value) });
  } catch (err) {
    mv.conectando = false;
    renderMonitorControles();
    if (err.name !== 'NotFoundError') alert('No se pudo abrir el puerto:\n' + err.message + '\n\n¿Está el puerto en uso por otro programa (por ejemplo el monitor serie de Arduino)?');
    return;
  }
  mv.transporte = t;
  mv.origen = origen;
  mv.conectado = true;
  mv.conectando = false;
  mv.stats = statsVacias();
  mv.buffer = [];
  mv.cal = null;
  mv.bateria = null;
  mv.conEmg = false;
  await t.enviar('START');
  clearInterval(mv.timer);
  mv.timer = setInterval(refrescar, REFRESCO_MS);
  renderMonitor();
}

/* motivo: aviso a mostrar (se omite en una desconexión pedida por el usuario). Si hay un paso
 * de rutina en curso se guarda lo ya medido y la rutina sigue, sin datos en los pasos siguientes. */
function alPerderConexion(motivo) {
  if (mv.ej) {
    const registro = finalizarEjercicio();
    if (mv.paso) mv.paso.registro = registro;
  }
  if (typeof pruebaPerdioConexion === 'function') pruebaPerdioConexion();
  if (mv.paso) toast('Se perdió la conexión: los ejercicios siguientes quedarán sin datos.');
  else if (motivo) toast(motivo);
  mv.conectado = false;
  mv.transporte = null;
  mv.calInicio = null;
  clearInterval(mv.timer);
  renderMonitor();
}

async function desconectar() {
  const t = mv.transporte;
  alPerderConexion();
  await t?.desconectar();
}

function calibrar() {
  if (!mv.conectado || mv.ej || mv.paso || mv.calInicio != null) return;
  mv.calInicio = performance.now();
  mv.cal = null;
  mv.transporte.enviar('CAL');
  renderMonitorControles();
}

/* ======================= Render ======================= */

function estadoConexion() {
  if (mv.conectando) return { dot: 'warning', txt: 'Conectando…' };
  if (!mv.conectado) return { dot: '', txt: 'Desconectado' };
  if (mv.ej || mv.paso) return { dot: 'critical', txt: 'Registrando' };
  return { dot: 'good', txt: mv.origen === 'simulador' ? 'Conectado (simulador)' : 'Conectado' };
}

function renderMonitor() {
  mv.chart = null; // se recrea con los colores del tema actual
  const p = estado.db.pacientes.find((x) => x.id === (mv.sesion?.pacienteId ?? estado.pacienteId));
  $('#mv-paciente').textContent = mv.sesion && p ? `Registrando para: ${p.nombre} (${p.id})` : '';
  $('#mv-paciente').hidden = !$('#mv-paciente').textContent;
  renderMonitorControles();
  refrescar();
  renderTarjetaRutina();
}

function renderMonitorControles() {
  const sinSerial = !TransporteSerial.disponible();
  const optUsb = $('#mv-origen option[value="usb"]');
  optUsb.disabled = sinSerial;
  if (sinSerial && $('#mv-origen').value === 'usb') $('#mv-origen').value = 'simulador';
  $('#mv-ayuda-conexion').textContent = sinSerial
    ? 'Este navegador no puede conectar el dispositivo: se usará el simulador.'
    : 'Si no hay dispositivo, la rutina usa el simulador.';
  $('#mv-baud-wrap').hidden = $('#mv-origen').value !== 'usb';
  $('#mv-origen').disabled = $('#mv-baud').disabled = mv.conectado || mv.conectando;

  const btn = $('#mv-conectar');
  btn.textContent = mv.conectando ? 'Conectando…' : mv.conectado ? 'Desconectar' : 'Conectar';
  btn.disabled = mv.conectando;

  const est = estadoConexion();
  $('#mv-estado').innerHTML = `<span class="dot ${est.dot}"></span>${est.txt}`;
  $('#nav-ejercicios-dot').hidden = !mv.ej && !mv.paso;

  // Calibración
  const calBtn = $('#mv-calibrar');
  calBtn.disabled = !mv.conectado || !!mv.ej || !!mv.paso || mv.calInicio != null;
  calBtn.textContent = mv.cal ? 'Recalibrar' : 'Calibrar';
  const calEl = $('#mv-cal');
  if (mv.calInicio != null) {
    calEl.innerHTML = `<span class="badge"><span class="dot warning"></span>Calibrando… mantenga la mano quieta</span>`;
  } else if (mv.cal) {
    calEl.innerHTML = mv.cal.ok
      ? `<span class="badge"><span class="dot good"></span>Calibrado en ${fmt(mv.cal.tiempoS, 1)} s (✓ ≤ ${CAL_TIMEOUT_S} s)</span>`
      : `<span class="badge"><span class="dot critical"></span>Falló: ${esc(mv.cal.motivo || `tardó ${fmt(mv.cal.tiempoS, 1)} s (> ${CAL_TIMEOUT_S} s)`)}</span>`;
  } else {
    calEl.textContent = mv.conectado ? 'Sin calibrar.' : 'Conecte el dispositivo para calibrar.';
  }
}

function stat(label, valor, dot) {
  return `<div class="stat"><div class="stat-label">${dot ? `<span class="dot ${dot}"></span>` : ''}${label}</div><div class="stat-value">${valor}</div></div>`;
}

/* Bucle de pantalla: estadísticas, lecturas y gráfica. */
function refrescar() {
  const st = mv.stats;
  if (mv.calInicio != null && (performance.now() - mv.calInicio) / 1000 > CAL_TIMEOUT_S) {
    mv.cal = { tiempoS: CAL_TIMEOUT_S, ok: false, motivo: `el dispositivo no respondió en ${CAL_TIMEOUT_S} s` };
    mv.calInicio = null;
    renderMonitorControles();
  }
  if (estado.seccion !== 'ejercicios') return;

  // Estadísticas de comunicación
  if (mv.conectado && st) {
    const b = mv.buffer;
    const tUlt = b.length ? b[b.length - 1].t : 0;
    const enVentana = b.filter((m) => m.t > tUlt - 2).length;
    const hz = b.length > 10 ? enVentana / Math.min(2, tUlt - b[0].t || 1) : 0;
    const total = st.recibidas + st.perdidas;
    const perdida = total ? (st.perdidas / total) * 100 : 0;
    const retardo = st.ultimaRx ? performance.now() - st.ultimaRx : null;
    $('#mv-stats').innerHTML =
      stat('Frecuencia de muestreo', `${fmt(hz, 0)} Hz`) +
      stat('Muestras recibidas', fmt(st.recibidas)) +
      stat('Pérdida de datos', `${fmt(perdida, 2)} %`, total ? (perdida < 1 ? 'good' : 'critical') : '') +
      stat('Último dato hace', retardo == null ? '—' : `${fmt(retardo)} ms`, retardo == null ? '' : retardo <= 500 ? 'good' : 'critical') +
      (mv.bateria != null ? stat('Batería', `${fmt(mv.bateria)} %`, mv.bateria > 20 ? 'good' : 'warning') : '') +
      (st.malformadas ? stat('Líneas no válidas', fmt(st.malformadas), 'warning') : '');
  } else {
    $('#mv-stats').innerHTML = '';
  }

  // Lecturas grandes
  const e = mv.ej;
  const ult = mv.buffer[mv.buffer.length - 1];
  if (e) {
    const actual = e.valores.length ? e.valores[e.valores.length - 1] : null;
    const max = e.valores.length ? maximo(e.valores) : null;
    const pct = Math.min(100, (e.picos.length / e.objetivo) * 100);
    const seg = Math.floor((Date.now() - e.inicio) / 1000);
    $('#mv-lecturas').innerHTML = `
      <div class="readout"><div class="readout-label">${EJERCICIOS[e.tipo].corto} — ángulo actual</div><div class="readout-value">${fmt(actual, 0)}°</div></div>
      <div class="readout"><div class="readout-label">Máximo alcanzado</div><div class="readout-value">${fmt(max, 0)}° <small>${fmt((max / EJERCICIOS[e.tipo].ref) * 100)} % ref.</small></div></div>
      <div class="readout"><div class="readout-label">Repeticiones</div><div class="readout-value">${e.picos.length} <small>/ ${e.objetivo}</small></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(${EJERCICIOS[e.tipo].color})"></div></div></div>
      <div class="readout"><div class="readout-label">Tiempo</div><div class="readout-value">${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}</div></div>`;
  } else {
    $('#mv-lecturas').innerHTML = Object.entries(CANALES).map(([k, c]) =>
      `<div class="readout"><div class="readout-label"><span class="swatch" style="background:var(${c.color})"></span>${c.nombre}</div><div class="readout-value">${ult ? fmt(ult[k], 0) + '°' : '—'}</div></div>`).join('');
  }

  actualizarChartVivo();
}

function crearChartVivo() {
  const base = { borderWidth: 2, pointRadius: 0, tension: 0, data: [] };
  mv.chart = nuevoChart('chart-vivo', {
    type: 'line',
    data: {
      datasets: [
        ...Object.values(CANALES).map((c) => ({ ...base, label: c.nombre, borderColor: css(c.color), backgroundColor: css(c.color) })),
        { label: 'Repeticiones detectadas', type: 'scatter', data: [], pointRadius: 5, borderWidth: 2, borderColor: css('--surface') },
        { label: 'Umbral de repetición', data: [], borderColor: css('--muted'), backgroundColor: css('--muted'), borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 },
      ],
    },
    options: {
      parsing: false,
      normalized: true,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', onClick: null, labels: { filter: (it, data) => !data.datasets[it.datasetIndex].hidden } },
        tooltip: { callbacks: { title: (it) => `${fmt(it[0].parsed.x, 1)} s`, label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y, 1)}°` } },
      },
      scales: {
        x: ejeX({ type: 'linear', min: -VENTANA_S, max: 0, title: { display: true, text: 'Tiempo (s, 0 = ahora)', color: css('--muted') } }),
        y: ejeY('Ángulo (°)', { suggestedMin: -10, suggestedMax: 60 }),
      },
    },
  });
}

function actualizarChartVivo() {
  if (!$('#det-tecnicos').open) return; // plegado: se dibuja al abrir
  if (!mv.chart) crearChartVivo();
  const ds = mv.chart.data.datasets;
  const b = mv.buffer;
  const tUlt = b.length ? b[b.length - 1].t : 0;
  const e = mv.ej;
  const claves = Object.keys(CANALES);

  if (e) {
    const ex = EJERCICIOS[e.tipo];
    claves.forEach((k, i) => {
      const activo = k === e.canal;
      ds[i].hidden = !activo;
      ds[i].data = activo ? b.map((m) => ({ x: m.t - tUlt, y: e.signo * m[k] })) : [];
      if (activo) { ds[i].label = ex.nombre; ds[i].borderColor = ds[i].backgroundColor = css(ex.color); }
    });
    ds[3].hidden = false;
    ds[3].backgroundColor = css(ex.color);
    ds[3].data = e.picos.map((idx) => ({ x: e.tiempos[idx] - tUlt, y: e.valores[idx] })).filter((p) => p.x >= -VENTANA_S);
    ds[4].hidden = false;
    const y = e.base + umbrales(e).alto;
    ds[4].data = [{ x: -VENTANA_S, y }, { x: 0, y }];
  } else {
    claves.forEach((k, i) => {
      ds[i].hidden = false;
      ds[i].label = CANALES[k].nombre;
      ds[i].borderColor = ds[i].backgroundColor = css(CANALES[k].color);
      ds[i].data = b.map((m) => ({ x: m.t - tUlt, y: m[k] }));
    });
    ds[3].hidden = ds[4].hidden = true;
    ds[3].data = ds[4].data = [];
  }
  mv.chart.update('none');
}

/* ======================= Eventos ======================= */

function initMonitor() {
  $('#mv-origen').value = TransporteSerial.disponible() ? 'usb' : 'simulador';
  $('#mv-origen').addEventListener('change', renderMonitorControles);
  $('#mv-conectar').addEventListener('click', alternarConexion);
  $('#mv-calibrar').addEventListener('click', calibrar);
  $('#det-tecnicos').addEventListener('toggle', (e) => { if (e.target.open) { mv.chart = null; refrescar(); } });
  window.addEventListener('beforeunload', (ev) => {
    if (sesionTieneDatos()) { ev.preventDefault(); ev.returnValue = ''; }
  });
  if (TransporteSerial.disponible()) {
    navigator.serial.addEventListener('disconnect', (ev) => {
      if (mv.origen === 'usb' && mv.transporte?.port === ev.target && mv.conectado) {
        alPerderConexion('El dispositivo USB se desconectó.');
      }
    });
  }
  renderMonitor();
}

document.addEventListener('DOMContentLoaded', initMonitor);
