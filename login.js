/* Página de inicio de sesión y registro (maqueta): pestañas, errores por campo y envío. */

const $ = (sel) => document.querySelector(sel);

function mostrarPestana(nombre) {
  const registro = nombre === 'registro';
  $('#tab-login').setAttribute('aria-selected', String(!registro));
  $('#tab-registro').setAttribute('aria-selected', String(registro));
  $('#tab-login').classList.toggle('active', !registro);
  $('#tab-registro').classList.toggle('active', registro);
  $('#tab-login').tabIndex = registro ? -1 : 0;
  $('#tab-registro').tabIndex = registro ? 0 : -1;
  $('#form-login').hidden = registro;
  $('#form-registro').hidden = !registro;
  document.title = registro ? 'Kinemo · Crear cuenta' : 'Kinemo · Iniciar sesión';
}

// Pinta los errores junto a cada campo y marca el campo; devuelve true si no hay errores.
function mostrarErrores(form, errores) {
  form.querySelectorAll('[data-error]').forEach((el) => {
    const msg = errores[el.dataset.error] || '';
    el.textContent = msg;
    form.querySelector(`[name="${el.dataset.error}"]`)?.setAttribute('aria-invalid', String(!!msg));
  });
  const primero = Object.keys(errores)[0];
  if (primero) form.querySelector(`[name="${primero}"]`)?.focus();
  return !primero;
}

function init() {
  $('#form-registro [name=profesion]').innerHTML = PROFESIONES.map((p) => `<option>${p}</option>`).join('');
  mostrarPestana(location.hash === '#registro' ? 'registro' : 'login');

  $('#tab-login').addEventListener('click', () => mostrarPestana('login'));
  $('#tab-registro').addEventListener('click', () => mostrarPestana('registro'));
  // Flechas: cambian de pestaña, como en cualquier tablist.
  $('.acceso-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const destino = $('#tab-login').tabIndex === 0 ? 'registro' : 'login';
    mostrarPestana(destino);
    $(destino === 'registro' ? '#tab-registro' : '#tab-login').focus();
  });
  document.querySelectorAll('[data-ir]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    mostrarPestana(a.dataset.ir);
  }));

  $('#form-login').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (!mostrarErrores(e.target, validarLogin(d))) return;
    iniciarSesion(d.correo);
    location.replace('index.html');
  });

  $('#form-registro').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (!mostrarErrores(e.target, validarRegistro(d))) return;
    registrar({ nombre: d.nombre, profesion: d.profesion, correo: d.correo });
    location.replace('index.html');
  });
}

document.addEventListener('DOMContentLoaded', init);
