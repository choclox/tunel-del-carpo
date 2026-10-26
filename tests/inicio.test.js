// interfaz-medico/tests/inicio.test.js
const test = require('node:test');
const assert = require('node:assert');
const { saludo, pacientesActivos, sesionesDeLaSemana, citasDeHoy, motivosAtencion, pacientesConAtencion, sesionesRecientes } = require('../inicio.js');

const ses = (fecha, extra = {}) => ({ fecha, dolorEVA: 3, perdidaDatosPct: 0, ejercicios: [], ...extra });
const pac = (id, extra = {}) => ({ id, nombre: id, sesiones: [], ...extra });
const textos = (m) => m.map((x) => `${x.nivel}:${x.texto}`);

test('saludo según la hora', () => {
  assert.strictEqual(saludo(9), 'Buenos días');
  assert.strictEqual(saludo(12), 'Buenas tardes');
  assert.strictEqual(saludo(18), 'Buenas tardes');
  assert.strictEqual(saludo(19), 'Buenas noches');
});

test('activos, semana y citas de hoy ignoran archivados', () => {
  const db = { pacientes: [
    pac('A', { proximaCita: '2026-10-28', sesiones: [ses('2026-10-25'), ses('2026-10-26'), ses('2026-10-28')] }),
    pac('B', { archivado: true, proximaCita: '2026-10-28', sesiones: [ses('2026-10-27')] }),
    pac('C', { proximaCita: '2026-10-29' }),
  ] };
  assert.deepStrictEqual(pacientesActivos(db).map((p) => p.id), ['A', 'C']);
  assert.strictEqual(sesionesDeLaSemana(db, '2026-10-28'), 2); // miércoles: lunes 26 a miércoles 28
  assert.deepStrictEqual(citasDeHoy(db, '2026-10-28').map((p) => p.id), ['A']);
});

test('cita vencida solo si no hubo sesión desde la cita', () => {
  const vencida = motivosAtencion(pac('A', { proximaCita: '2026-10-20', sesiones: [ses('2026-10-18')] }), '2026-10-26');
  assert.ok(textos(vencida).some((t) => t.startsWith('warning:Cita vencida')));
  const atendida = motivosAtencion(pac('A', { proximaCita: '2026-10-20', sesiones: [ses('2026-10-18'), ses('2026-10-21')] }), '2026-10-26');
  assert.ok(!textos(atendida).some((t) => t.includes('Cita vencida')));
});

test('dolor que sube, datos perdidos y orden por gravedad', () => {
  const m = motivosAtencion(pac('A', { sesiones: [ses('2026-10-20', { dolorEVA: 3 }), ses('2026-10-24', { dolorEVA: 6, perdidaDatosPct: 1.2 })] }), '2026-10-26');
  assert.deepStrictEqual(m.map((x) => x.nivel), ['critical', 'warning']);
  assert.strictEqual(m[0].texto, 'Se perdieron datos en la última sesión');
  assert.strictEqual(m[1].texto, 'El dolor subió (3 → 6)');
});

test('sin sesiones o mucho tiempo sin sesión', () => {
  assert.deepStrictEqual(textos(motivosAtencion(pac('A'), '2026-10-26')), ['info:Aún sin sesiones']);
  assert.deepStrictEqual(textos(motivosAtencion(pac('A', { sesiones: [ses('2026-10-15')] }), '2026-10-26')), ['info:Sin sesión hace 11 días']);
  assert.deepStrictEqual(motivosAtencion(pac('A', { sesiones: [ses('2026-10-16')] }), '2026-10-26'), []);
});

test('movimiento, EMG y chequeo', () => {
  const ej = (a) => [{ tipo: 'flexion', anguloMax: a }];
  const prueba = (t) => ({ tenar: { picos: [t, t, t], media: t }, flexores: { picos: [1, 1, 1], media: 1 }, extensores: { picos: [100, 100, 100], media: 100 } });
  const m = motivosAtencion(pac('A', { sesiones: [
    ses('2026-10-20', { ejercicios: ej(50), emg: { prueba: prueba(400) } }),
    ses('2026-10-24', { ejercicios: ej(45), emg: { prueba: prueba(300) }, chequeo: { nivel: 'detener' } }),
  ] }), '2026-10-26');
  const t = textos(m);
  assert.ok(t.includes('critical:El chequeo pidió no hacer la sesión'), t.join(' | '));
  assert.ok(t.some((x) => x.startsWith('warning:Bajó el movimiento en')), t.join(' | '));
  assert.ok(t.includes('warning:Bajó el índice del nervio mediano'), t.join(' | '));
});

test('pacientesConAtencion ordena por gravedad y nombre; recientes por fecha', () => {
  const db = { pacientes: [
    pac('Zoe', { sesiones: [ses('2026-10-25', { perdidaDatosPct: 2 })] }),
    pac('Ana', { sesiones: [ses('2026-10-25')] }),
    pac('Beto'),
    pac('Caro', { archivado: true }),
  ] };
  assert.deepStrictEqual(pacientesConAtencion(db, '2026-10-26').map((x) => x.paciente.id), ['Zoe', 'Beto']);
  const rec = sesionesRecientes({ pacientes: [pac('A', { sesiones: [ses('2026-10-01'), ses('2026-10-20')] }), pac('B', { sesiones: [ses('2026-10-10')] })] }, 2);
  assert.deepStrictEqual(rec.map((r) => `${r.paciente.id}@${r.sesion.fecha}`), ['A@2026-10-20', 'B@2026-10-10']);
});

test('datos antiguos sin campos nuevos no rompen', () => {
  assert.doesNotThrow(() => motivosAtencion({ id: 'X', nombre: 'X', sesiones: [{ fecha: '2026-10-25', ejercicios: [] }] }, '2026-10-26'));
});
