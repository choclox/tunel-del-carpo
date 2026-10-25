/* Inicio de sesión y registro de demostración (maqueta, sin cuentas reales). Funciones sin DOM.
 *
 * Cualquier correo y contraseña con formato válido dejan entrar. Se guardan la sesión
 * (nombre, profesión y correo) y las cuentas registradas en este navegador, nunca la contraseña.
 */

const CLAVE_SESION = 'kinemo.sesion';
const CLAVE_CUENTAS = 'kinemo.cuentas';
const PROFESIONES = ['Fisioterapeuta', 'Terapeuta ocupacional', 'Médico', 'Otro'];

// Si el almacenamiento está bloqueado, la sesión vive en memoria durante la visita.
let sesionEnMemoria = null;

const almacenPorDefecto = () => (typeof localStorage !== 'undefined' ? localStorage : null);

function leerJSON(almacen, clave) {
  try { return JSON.parse(almacen?.getItem(clave) ?? 'null'); } catch (e) { return undefined; }
}
function escribirJSON(almacen, clave, valor) {
  try { almacen?.setItem(clave, JSON.stringify(valor)); return true; } catch (e) { return false; }
}

function normalizarCorreo(texto) {
  return String(texto ?? '').trim().toLowerCase();
}

const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarCorreo(c));

function validarLogin({ correo, clave }) {
  const err = {};
  if (!correoValido(correo)) err.correo = 'Escriba un correo válido.';
  if (!clave) err.clave = 'Escriba su contraseña.';
  return err;
}

function validarRegistro({ nombre, profesion, correo, clave, clave2 }) {
  const err = {};
  if (!String(nombre ?? '').trim()) err.nombre = 'Escriba su nombre.';
  if (!PROFESIONES.includes(profesion)) err.profesion = 'Elija su profesión.';
  if (!correoValido(correo)) err.correo = 'Escriba un correo válido.';
  if (String(clave ?? '').length < 8) err.clave = 'La contraseña debe tener al menos 8 caracteres.';
  if (clave2 !== clave) err.clave2 = 'Las contraseñas no coinciden.';
  return err;
}

function abrirSesion(sesion, almacen) {
  sesionEnMemoria = sesion;
  escribirJSON(almacen, CLAVE_SESION, sesion);
  return sesion;
}

// Solo se guardan nombre, profesión y correo, aunque llegue la contraseña.
function registrar({ nombre, profesion, correo }, almacen = almacenPorDefecto()) {
  const cuenta = { nombre: String(nombre).trim(), profesion, correo: normalizarCorreo(correo) };
  const cuentas = (leerJSON(almacen, CLAVE_CUENTAS) || []).filter((c) => c.correo !== cuenta.correo);
  escribirJSON(almacen, CLAVE_CUENTAS, [...cuentas, cuenta]);
  return abrirSesion(cuenta, almacen);
}

function iniciarSesion(correo, almacen = almacenPorDefecto()) {
  const c = normalizarCorreo(correo);
  const cuenta = (leerJSON(almacen, CLAVE_CUENTAS) || []).find((x) => x.correo === c);
  return abrirSesion(cuenta ? { ...cuenta } : { nombre: c.split('@')[0], profesion: null, correo: c }, almacen);
}

function leerSesion(almacen = almacenPorDefecto()) {
  const s = leerJSON(almacen, CLAVE_SESION);
  if (s === undefined) return sesionEnMemoria; // almacenamiento bloqueado o dañado
  return s && typeof s === 'object' && s.correo ? s : null;
}

function cerrarSesion(almacen = almacenPorDefecto()) {
  sesionEnMemoria = null;
  try { almacen?.removeItem(CLAVE_SESION); } catch (e) { /* bloqueado: basta con la memoria */ }
}

if (typeof module !== 'undefined') module.exports = { PROFESIONES, normalizarCorreo, validarLogin, validarRegistro, registrar, iniciarSesion, leerSesion, cerrarSesion };
