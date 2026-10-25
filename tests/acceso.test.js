// interfaz-medico/tests/acceso.test.js
const test = require('node:test');
const assert = require('node:assert');
const { PROFESIONES, normalizarCorreo, validarLogin, validarRegistro, registrar, iniciarSesion, leerSesion, cerrarSesion } = require('../acceso.js');

class Mem {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

test('profesiones', () => {
  assert.deepStrictEqual(PROFESIONES, ['Fisioterapeuta', 'Terapeuta ocupacional', 'Médico', 'Otro']);
});

test('validarLogin', () => {
  assert.deepStrictEqual(validarLogin({ correo: 'x', clave: '' }), { correo: 'Escriba un correo válido.', clave: 'Escriba su contraseña.' });
  assert.deepStrictEqual(validarLogin({ correo: 'a@b.co', clave: '1' }), {});
});

test('validarRegistro', () => {
  assert.deepStrictEqual(
    validarRegistro({ nombre: '', profesion: 'Médico', correo: 'a@b.co', clave: '1234567', clave2: 'x' }),
    { nombre: 'Escriba su nombre.', clave: 'La contraseña debe tener al menos 8 caracteres.', clave2: 'Las contraseñas no coinciden.' });
  assert.deepStrictEqual(validarRegistro({ nombre: 'Ana', profesion: 'Médico', correo: 'a@b.co', clave: '12345678', clave2: '12345678' }), {});
});

test('normalizarCorreo recorta y pasa a minúsculas', () => {
  assert.strictEqual(normalizarCorreo('  Ana@X.com '), 'ana@x.com');
});

test('registrar guarda la cuenta sin la contraseña y la usa al iniciar sesión', () => {
  const m = new Mem();
  registrar({ nombre: 'Ana Pérez', profesion: 'Fisioterapeuta', correo: ' Ana@X.com', clave: 'secreta-123' }, m);
  cerrarSesion(m);
  assert.deepStrictEqual(iniciarSesion('ANA@x.com', m), { nombre: 'Ana Pérez', profesion: 'Fisioterapeuta', correo: 'ana@x.com' });
  for (const v of m.m.values()) assert.ok(!v.includes('secreta-123'), 'la contraseña quedó guardada');
});

test('iniciarSesion sin registro usa la parte antes de @', () => {
  assert.deepStrictEqual(iniciarSesion('luis.gomez@x.com', new Mem()), { nombre: 'luis.gomez', profesion: null, correo: 'luis.gomez@x.com' });
});

test('cerrarSesion', () => {
  const m = new Mem();
  iniciarSesion('a@b.co', m);
  assert.ok(leerSesion(m));
  cerrarSesion(m);
  assert.strictEqual(leerSesion(m), null);
});

test('con almacenamiento bloqueado la sesión vive en memoria', () => {
  const roto = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  const s = iniciarSesion('a@b.co', roto);
  assert.deepStrictEqual(s, { nombre: 'a', profesion: null, correo: 'a@b.co' });
  assert.deepStrictEqual(leerSesion(roto), s);
  cerrarSesion(roto);
  assert.strictEqual(leerSesion(roto), null);
});
