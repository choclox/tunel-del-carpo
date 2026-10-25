// Prueba de humo de la interfaz en Chromium (Playwright).
// Uso: node tests/ui/humo.mjs [--capturas <carpeta>]
// Sin acceso al CDN: npm i --no-save chart.js@4.4.1 (se sirve la copia local).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHART_LOCAL = path.join(RAIZ, 'node_modules', 'chart.js', 'dist', 'chart.umd.js');
const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.json': 'application/json' };

const servidor = http.createServer((req, res) => {
  const ruta = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const archivo = ruta.endsWith(path.sep) ? path.join(ruta, 'index.html') : ruta;
  if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
  fs.createReadStream(archivo).pipe(res);
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const URL_APP = `http://127.0.0.1:${servidor.address().port}/`;

const navegador = await chromium.launch();
let fallas = 0;

const SESION_PRUEBA = { nombre: 'Prueba', profesion: 'Fisioterapeuta', correo: 'prueba@kinemo.co' };

// ruta: '' es el panel. sesion: la que se siembra una sola vez por pestaña (null = sin sesión).
async function nuevaPagina({ viewport = { width: 1366, height: 900 }, init, ruta = '', sesion = SESION_PRUEBA, rutas = {} } = {}) {
  const ctx = await navegador.newContext({ viewport, acceptDownloads: true });
  if (sesion) {
    await ctx.addInitScript((s) => {
      if (sessionStorage.getItem('humo.sembrada')) return;
      localStorage.setItem('kinemo.sesion', JSON.stringify(s));
      sessionStorage.setItem('humo.sembrada', '1');
    }, sesion);
  }
  if (init) await ctx.addInitScript(init);
  await ctx.route('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/**', (r) =>
    fs.existsSync(CHART_LOCAL) ? r.fulfill({ path: CHART_LOCAL, contentType: 'text/javascript' }) : r.continue());
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // rutas: { 'archivo.js': contenido } reemplaza archivos del sitio (p. ej. para simular que no cargó).
  for (const [archivo, cuerpo] of Object.entries(rutas)) {
    await ctx.route(new RegExp(`/${archivo.replace('.', '\\.')}$`), (r) => r.fulfill({ body: cuerpo, contentType: 'text/javascript' }));
  }
  const page = await ctx.newPage();
  page.errores = [];
  page.on('pageerror', (e) => page.errores.push(e.message));
  // Los 404 se revisan por URL: los videos que faltan son esperados ("Video no adjuntado").
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::|Failed to load resource/.test(m.text())) page.errores.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('.mp4')) page.errores.push(`${r.status()} ${r.url()}`); });
  page.dialogos = [];
  page.on('dialog', (d) => { page.dialogos.push(d.message()); d.accept(); });
  page.setDefaultTimeout(10000);
  await page.goto(URL_APP + ruta);
  if (sesion && (!ruta || ruta === 'index.html')) await page.waitForSelector('.patient-item');
  return page;
}

async function verificar(nombre, fn, opciones) {
  const page = await nuevaPagina(opciones);
  try {
    await fn(page);
    if (page.errores.length) throw new Error('errores en la consola: ' + page.errores.join(' | '));
    console.log('✓', nombre);
  } catch (e) {
    fallas++;
    console.log('✗', nombre, '—', process.env.DEPURAR ? e.message : e.message.split('\n')[0]);
  } finally {
    await page.context().close();
  }
}

function afirmar(cond, msg) { if (!cond) throw new Error(msg); }
const seccionActiva = (page) => page.$eval('.nav-seccion[aria-current="page"]', (b) => b.dataset.seccion);

/* ---------- Estructura ---------- */
await verificar('tres secciones', async (page) => {
  const textos = await page.$$eval('.nav-seccion', (bs) => bs.map((b) => b.querySelector('.nav-titulo').textContent.trim()));
  afirmar(JSON.stringify(textos) === JSON.stringify(['Ejercicios', 'Seguimiento', 'Reporte']), `botones: ${textos}`);
});

await verificar('arranca en seguimiento', async (page) => {
  afirmar(await seccionActiva(page) === 'seguimiento', 'sección activa no es seguimiento');
  const visibles = await page.$$eval('section.seccion', (ss) => ss.filter((s) => !s.hidden).map((s) => s.dataset.seccion));
  afirmar(JSON.stringify(visibles) === '["seguimiento"]', `secciones visibles: ${visibles}`);
});

await verificar('cambiar a reporte', async (page) => {
  await page.click('.nav-seccion[data-seccion="reporte"]');
  afirmar(await page.isVisible('#tabla-historial'), '#tabla-historial no visible');
});

await verificar('barra superior limpia', async (page) => {
  const ids = await page.$$eval('.topbar button', (bs) => bs.map((b) => b.id));
  afirmar(JSON.stringify(ids) === '["btn-salir"]', `botones en la barra superior: ${ids}`);
});

await verificar('marca Kinemo', async (page) => {
  afirmar((await page.textContent('.brand-title')).trim() === 'Kinemo', 'la marca no es Kinemo');
  afirmar((await page.title()).startsWith('Kinemo'), `título: ${await page.title()}`);
  const logo = await page.$eval('.brand-mark img', (i) => ({ src: i.getAttribute('src'), ancho: i.naturalWidth }));
  afirmar(logo.src === 'img/kinemo-simbolo.png' && logo.ancho > 0, `logo: ${JSON.stringify(logo)}`);
  afirmar(await page.$eval('link[rel=icon]', (l) => l.getAttribute('href')) === 'img/favicon.png', 'sin icono de pestaña');
  const brand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim());
  afirmar(brand === '#1e6895', `--brand: ${brand} (debe ser el azul del logo)`);
});

/* ---------- Login y registro ---------- */
const sesionGuardada = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kinemo.sesion')));
const SIN_SESION = { ruta: 'login.html', sesion: null };

await verificar('login: validación', async (page) => {
  await page.click('#form-login button[type=submit]');
  afirmar((await page.textContent('[data-error=correo]')).trim() === 'Escriba un correo válido.', 'sin error de correo');
}, SIN_SESION);

await verificar('login: entrar', async (page) => {
  await page.fill('#form-login [name=correo]', 'ana.perez@x.com');
  await page.fill('#form-login [name=clave]', 'x');
  await Promise.all([page.waitForURL(/index\.html$/), page.click('#form-login button[type=submit]')]);
  afirmar((await sesionGuardada(page)).nombre === 'ana.perez', 'nombre de sesión');
}, SIN_SESION);

await verificar('registro: contraseñas distintas', async (page) => {
  await page.click('#tab-registro');
  await page.fill('#form-registro [name=nombre]', 'Ana Pérez');
  await page.fill('#form-registro [name=correo]', 'ana@x.com');
  await page.fill('#form-registro [name=clave]', '12345678');
  await page.fill('#form-registro [name=clave2]', '87654321');
  await page.click('#form-registro button[type=submit]');
  afirmar((await page.textContent('[data-error=clave2]')).trim() === 'Las contraseñas no coinciden.', 'sin error de claves');
  afirmar(page.url().endsWith('login.html'), `salió del login: ${page.url()}`);
}, SIN_SESION);

await verificar('registro: crear cuenta', async (page) => {
  await page.click('#tab-registro');
  await page.fill('#form-registro [name=nombre]', 'Ana Pérez');
  await page.selectOption('#form-registro [name=profesion]', 'Médico');
  await page.fill('#form-registro [name=correo]', 'ana@x.com');
  await page.fill('#form-registro [name=clave]', 'clave-secreta-9');
  await page.fill('#form-registro [name=clave2]', 'clave-secreta-9');
  await Promise.all([page.waitForURL(/index\.html$/), page.click('#form-registro button[type=submit]')]);
  const s = await sesionGuardada(page);
  afirmar(s.nombre === 'Ana Pérez' && s.profesion === 'Médico', JSON.stringify(s));
  const todo = await page.evaluate(() => Object.values(localStorage).join('|'));
  afirmar(!todo.includes('clave-secreta-9'), 'la contraseña quedó guardada');
}, SIN_SESION);

await verificar('login.html#registro abre Crear cuenta', async (page) => {
  afirmar(await page.getAttribute('#tab-registro', 'aria-selected') === 'true', 'no abrió Crear cuenta');
  afirmar(await page.isVisible('#form-registro') && !(await page.isVisible('#form-login')), 'formulario equivocado');
}, { ruta: 'login.html#registro', sesion: null });

await verificar('con sesión salta el login', async (page) => {
  await page.waitForURL(/index\.html$/);
}, { ruta: 'login.html' });

await verificar('aviso de demostración', async (page) => {
  afirmar(await page.isVisible('.aviso-demo'), 'sin aviso en Iniciar sesión');
  await page.click('#tab-registro');
  afirmar(await page.isVisible('.aviso-demo'), 'sin aviso en Crear cuenta');
}, SIN_SESION);

async function entrarCon(page) {
  await page.fill('#form-login [name=correo]', 'ana@x.com');
  await page.fill('#form-login [name=clave]', 'x');
  await Promise.all([page.waitForURL(/index\.html$/), page.click('#form-login button[type=submit]')]);
  await page.waitForSelector('.patient-item');
  afirmar((await page.textContent('.usuario-nombre')).trim() === 'ana', 'no muestra al profesional');
}

await verificar('almacenamiento que no deja escribir: igual entra', entrarCon, {
  ...SIN_SESION, init: () => { Storage.prototype.setItem = () => { throw new Error('bloqueado'); }; },
});

await verificar('almacenamiento bloqueado del todo: igual entra', entrarCon, {
  ...SIN_SESION, init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denegado', 'SecurityError'); } }); },
});

await verificar('sin login.js la contraseña no va a la URL', async (page) => {
  await page.fill('#form-login [name=correo]', 'ana@x.com');
  await page.fill('#form-login [name=clave]', 'secreta-123');
  await page.click('#form-login button[type=submit]');
  await page.waitForTimeout(500);
  afirmar(!page.url().includes('secreta-123'), `la contraseña quedó en la URL: ${page.url()}`);
}, { ...SIN_SESION, rutas: { 'login.js': '' } });

/* ---------- Panel protegido ---------- */
await verificar('sin sesión va al login', async (page) => {
  await page.waitForURL(/login\.html$/);
  afirmar(await page.evaluate(() => sessionStorage.getItem('humo.panel')) === null, 'se pintó el panel antes de redirigir');
}, {
  ruta: 'index.html', sesion: null,
  init: () => new MutationObserver(() => {
    if (document.querySelector('.patient-item')) sessionStorage.setItem('humo.panel', '1');
  }).observe(document, { childList: true, subtree: true }),
});

await verificar('barra muestra al profesional', async (page) => {
  afirmar((await page.textContent('.usuario-nombre')).trim() === 'Ana Pérez', 'nombre');
  afirmar((await page.textContent('.usuario-profesion')).trim() === 'Médico', 'profesión');
}, { sesion: { nombre: 'Ana Pérez', profesion: 'Médico', correo: 'ana@x.com' } });

await verificar('nombre se muestra como texto', async (page) => {
  afirmar((await page.textContent('.usuario-nombre')) === '<b>Ana</b>', 'texto distinto');
  afirmar(await page.locator('.usuario-nombre b').count() === 0, 'se interpretó como HTML');
}, { sesion: { nombre: '<b>Ana</b>', profesion: null, correo: 'ana@x.com' } });

await verificar('cerrar sesión', async (page) => {
  await Promise.all([page.waitForURL(/login\.html$/), page.click('#btn-salir')]);
  afirmar(await page.evaluate(() => localStorage.getItem('kinemo.sesion')) === null, 'la sesión sigue guardada');
});

await verificar('paciente nuevo con profesional', async (page) => {
  await page.click('#btn-nuevo');
  afirmar(await page.inputValue('#form-paciente [name=profesional]') === 'Prueba', 'profesional vacío');
});

/* ---------- Seguimiento ---------- */
await verificar('encabezado compacto', async (page) => {
  const txt = await page.textContent('#encabezado');
  afirmar(txt.includes('días desde la cirugía') && /Fase \d/.test(txt), `encabezado: ${txt.trim().slice(0, 80)}`);
  afirmar((await page.textContent('#encabezado details summary')).trim() === 'Ver ficha', 'sin "Ver ficha"');
  afirmar(await page.locator('.ring').count() === 0, 'sigue el anillo');
});

await verificar('cuatro tarjetas', async (page) => {
  const titulos = await page.$$eval('#resumen-tarjetas > *', (ts) => ts.map((t) => t.querySelector('.kpi-label').textContent.trim()));
  afirmar(JSON.stringify(titulos) === JSON.stringify(['Avance', 'Dolor', 'Última sesión', 'Músculo']), `tarjetas: ${titulos}`);
});

await verificar('máximo 3 observaciones', async (page) => {
  const n = await page.locator('#observaciones > li.obs:visible').count();
  afirmar(n >= 1 && n <= 3, `observaciones visibles: ${n}`);
});

await verificar('paciente sin sesiones', async (page) => {
  await page.click('#btn-nuevo');
  await page.fill('#form-paciente [name=nombre]', 'Paciente Prueba');
  await page.fill('#form-paciente [name=documento]', '123');
  await page.fill('#form-paciente [name=edad]', '40');
  await page.fill('#form-paciente [name=fechaCirugia]', '2026-10-01');
  await page.click('#form-paciente button[value=ok]');
  await page.click('.nav-seccion[data-seccion="seguimiento"]');
  const vacio = page.locator('section.seccion[data-seccion="seguimiento"] .vacio-seguimiento:visible');
  afirmar((await vacio.textContent()).includes('Aún no hay sesiones'), 'sin mensaje de vacío');
  await vacio.getByRole('button', { name: 'Ir a Ejercicios' }).click();
  afirmar(await seccionActiva(page) === 'ejercicios', 'no fue a Ejercicios');
});

await verificar('gráfica plegada con tamaño', async (page) => {
  await page.click('#mas-indicadores summary');
  await page.waitForTimeout(300);
  const alto = await page.$eval('#chart-ind', (c) => c.getBoundingClientRect().height);
  afirmar(alto > 100, `alto de la gráfica: ${alto}`);
});

await verificar('tabla de sesión corta', async (page) => {
  await page.click('#seg-vistas [data-vista="sesion"]');
  const n = await page.locator('#tabla-ejercicios thead th:not(.col-extra)').count();
  afirmar(n === 4, `columnas visibles: ${n}`);
  afirmar(!(await page.locator('#tabla-ejercicios thead th.col-extra').first().isVisible()), 'columnas extra visibles');
  await page.click('#btn-columnas');
  afirmar(await page.locator('#tabla-ejercicios thead th.col-extra').first().isVisible(), 'no se muestran las columnas extra');
});

/* ---------- Ejercicios ---------- */
const irEjercicios = (page) => page.click('.nav-seccion[data-seccion="ejercicios"]');

await verificar('tres pasos', async (page) => {
  await irEjercicios(page);
  const titulos = await page.$$eval('.paso-guia', (ps) => ps.map((p) => p.querySelector('.paso-titulo').textContent.trim()));
  afirmar(JSON.stringify(titulos) === JSON.stringify(['Conecte el dispositivo', 'Elija la fase', 'Empiece la rutina']), `pasos: ${titulos}`);
  const primarios = page.locator('section.seccion[data-seccion="ejercicios"] .btn-primary:visible');
  afirmar(await primarios.count() === 1 && await primarios.getAttribute('id') === 'rt-iniciar', 'el único primario no es #rt-iniciar');
});

await verificar('técnicos plegados', async (page) => {
  await irEjercicios(page);
  const det = await page.$eval('#det-tecnicos', (d) => ({ open: d.open, chart: !!d.querySelector('#chart-vivo'), stats: !!d.querySelector('#mv-stats') }));
  afirmar(!det.open && det.chart && det.stats, JSON.stringify(det));
});

await verificar('sin web serial', async (page) => {
  await irEjercicios(page);
  const txt = await page.textContent('.paso-guia[data-paso="1"]');
  afirmar(txt.includes('se usará el simulador'), `paso 1: ${txt.trim().slice(0, 120)}`);
}, { init: () => { delete Navigator.prototype.serial; } });

// Graba una rutina con el simulador hasta pulsar "Terminar rutina" (etapa: 1–3 o null = la sugerida).
async function grabarRutina(page, etapa = null) {
  await irEjercicios(page);
  if (etapa) await page.click(`#rt-etapas [data-etapa="${etapa}"]`);
  await page.click('#rt-iniciar');
  await page.waitForSelector('#ls-empezar:not([disabled])', { timeout: 35000 });
  await page.click('#ls-empezar');
  await page.waitForSelector('#dlg-rutina[open]');
  await page.waitForTimeout(2500); // un paso necesita ≥ 1 s y ≥ 25 muestras para guardarse
  for (let i = 0; i < 20 && (await page.textContent('#rt-siguiente-txt')).trim() !== 'Terminar rutina'; i++) {
    await page.click('#rt-siguiente');
    await page.waitForTimeout(700);
  }
  await page.click('#rt-siguiente');
}
const ultimaSesion = (page) => page.evaluate(() => {
  const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
  return p.sesiones[p.sesiones.length - 1];
});
async function conectarSimulador(page) {
  await irEjercicios(page);
  await page.click('#det-tecnicos summary');
  await page.selectOption('#mv-origen', 'simulador');
  await page.click('#mv-conectar');
  await page.waitForTimeout(600);
}

await verificar('simulador con EMG', async (page) => {
  await conectarSimulador(page);
  const r = await page.evaluate(() => ({ con: mv.conEmg, emg: mv.buffer[mv.buffer.length - 1]?.emg }));
  afirmar(r.con === true && r.emg && r.emg.tenar >= 0 && r.emg.tenar <= 1000, JSON.stringify(r));
});

await verificar('simulador sin EMG', async (page) => {
  await conectarSimulador(page);
  afirmar(await page.evaluate(() => mv.conEmg) === false, 'conEmg debería ser false');
}, { init: () => { window.SIMULADOR_SIN_EMG = true; } });

await verificar('rutina guarda señal EMG', async (page) => {
  await grabarRutina(page, 2);
  if (await page.isVisible('#pr-omitir')) await page.click('#pr-omitir');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  const s = await ultimaSesion(page);
  afirmar(s.emg && s.emg.senal.tenar.length > 0 && s.emg.prueba === null, JSON.stringify(s.emg ?? null).slice(0, 120));
});

await verificar('rutina completa con simulador', async (page) => {
  await irEjercicios(page);
  await page.click('#rt-etapas [data-etapa="1"]');
  await page.click('#rt-iniciar');
  await page.waitForSelector('#ls-empezar:not([disabled])', { timeout: 35000 });
  await page.click('#ls-empezar');
  await page.waitForSelector('#dlg-rutina[open]');
  await page.waitForTimeout(2500); // un paso necesita ≥ 1 s y ≥ 25 muestras para guardarse
  afirmar(await page.isVisible('#nav-ejercicios-dot'), 'sin punto de grabación en Ejercicios');
  for (let i = 0; i < 20 && (await page.textContent('#rt-siguiente-txt')).trim() !== 'Terminar rutina'; i++) {
    await page.click('#rt-siguiente');
    await page.waitForTimeout(700);
  }
  await page.click('#rt-siguiente');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  afirmar(await seccionActiva(page) === 'seguimiento', 'no volvió a Seguimiento');
  const r = await page.evaluate(() => {
    const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
    return { vista: estado.vista, nueva: p.sesiones[p.sesiones.length - 1].id, sel: document.querySelector('#sesion-select').value };
  });
  afirmar(r.vista === 'sesion' && r.sel === r.nueva, JSON.stringify(r));
});

/* ---------- Prueba de fuerza muscular ---------- */
const PRUEBA_RAPIDA = () => { window.TIEMPOS_PRUEBA_EMG = { prepara: 300, fuerza: 400, descanso: 200 }; };

await verificar('prueba: fase 2 completa', async (page) => {
  await grabarRutina(page, 2);
  await page.waitForSelector('#dlg-prueba[open]');
  for (let i = 0; i < 3; i++) {
    await page.waitForSelector('#pr-siguiente:not([disabled])', { timeout: 15000 });
    await page.click('#pr-siguiente');
  }
  await page.waitForSelector('#dlg-fin[open]');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  const p = (await ultimaSesion(page)).emg?.prueba;
  afirmar(p && p.tenar.picos.length === 3 && p.flexores.extensoresDuranteFlexores > 0, JSON.stringify(p));
  afirmar(p.tenar.media > 300 && p.extensores.media > 300, `medias: ${p.tenar.media}, ${p.extensores.media}`);
}, { init: PRUEBA_RAPIDA });

await verificar('prueba: fase 1 no aparece', async (page) => {
  await grabarRutina(page, 1);
  await page.waitForSelector('#dlg-fin[open]');
  afirmar(!(await page.isVisible('#dlg-prueba')), 'apareció la prueba en Fase 1');
}, { init: PRUEBA_RAPIDA });

await verificar('prueba: sin EMG no aparece', async (page) => {
  await grabarRutina(page, 2);
  await page.waitForSelector('#dlg-fin[open]');
  afirmar(!(await page.isVisible('#dlg-prueba')), 'apareció la prueba sin EMG');
}, { init: () => { window.SIMULADOR_SIN_EMG = true; window.TIEMPOS_PRUEBA_EMG = { prepara: 300, fuerza: 400, descanso: 200 }; } });

await verificar('prueba: omitir', async (page) => {
  await grabarRutina(page, 2);
  await page.click('#pr-omitir');
  await page.waitForSelector('#dlg-fin[open]');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  afirmar((await ultimaSesion(page)).emg?.prueba === null, 'la prueba no es null');
}, { init: PRUEBA_RAPIDA });

await verificar('prueba: Esc omite', async (page) => {
  await grabarRutina(page, 2);
  await page.waitForSelector('#dlg-prueba[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#dlg-fin[open]');
  afirmar(await page.isVisible('#fin-guardar'), 'no se puede guardar la rutina');
}, { init: PRUEBA_RAPIDA });

await verificar('prueba: desconexión', async (page) => {
  await grabarRutina(page, 2);
  await page.waitForSelector('#dlg-prueba[open]');
  await page.evaluate(() => desconectar());
  await page.waitForFunction(() => document.body.innerText.includes('Se perdió la conexión: la prueba no se completó.'));
  await page.waitForSelector('#dlg-fin[open]', { timeout: 15000 });
}, { init: PRUEBA_RAPIDA });

await verificar('videos nuevos de la fase 1', async (page) => {
  await irEjercicios(page);
  await page.click('#rt-etapas [data-etapa="1"]');
  await page.click('.rt-detalle summary');
  await page.click('#rt-revisar');
  for (const id of ['tendon_recto', 'puno_gancho', 'puno_completo', 'mesa', 'puno_recto']) {
    await page.waitForFunction((id) => document.querySelector('#rt-video').getAttribute('src') === `videos/${id}.mp4`, id);
    await page.waitForFunction(() => document.querySelector('#rt-video').readyState >= 2 || !document.querySelector('#rt-falta').hidden);
    afirmar(await page.isHidden('#rt-falta'), `${id}: "Video no adjuntado"`);
    await page.click('#rt-siguiente');
    await page.waitForTimeout(700);
  }
});

/* ---------- Reporte ---------- */
const irReporte = (page) => page.click('.nav-seccion[data-seccion="reporte"]');

await verificar('historial corto', async (page) => {
  await irReporte(page);
  const ths = await page.$$eval('#tabla-historial thead th', (t) => t.map((x) => x.textContent.trim()));
  afirmar(JSON.stringify(ths) === JSON.stringify(['#', 'Fecha', 'Días desde la cirugía', 'Cumplimiento', 'Dolor', 'Nota', '']), `columnas: ${ths}`);
});

await verificar('archivos en reporte', async (page) => {
  await irReporte(page);
  for (const id of ['#btn-csv', '#btn-exportar', '#btn-importar']) afirmar(await page.isVisible(id), `${id} no visible`);
  const reset = await page.$eval('#btn-reset', (b) => { const d = b.closest('details'); return !!d && !d.open; });
  afirmar(reset, '#btn-reset no está en un <details> cerrado');
});

await verificar('ver detalle', async (page) => {
  await irReporte(page);
  await page.click('.btn-ver >> nth=0');
  afirmar(await seccionActiva(page) === 'seguimiento', 'no fue a Seguimiento');
  afirmar(await page.evaluate(() => estado.vista) === 'sesion', 'la vista no es Una sesión');
});

await verificar('csv descarga', async (page) => {
  await irReporte(page);
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('#btn-csv')]);
  afirmar(descarga.suggestedFilename().endsWith('_sesiones.csv'), `archivo: ${descarga.suggestedFilename()}`);
});

await verificar('nota tras importar va a la sesión importada', async (page) => {
  await irReporte(page);
  const sesion = { sesion: { fecha: '2020-01-01', ejercicios: [{ tipo: 'flexion', repeticiones: 10, repeticionesObjetivo: 10, anguloMax: 40 }] } };
  await page.setInputFiles('#file-input', { name: 'sesion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sesion)) });
  await page.waitForTimeout(300);
  afirmar((await page.textContent('#nota-sesion-label')).includes('2020'), `etiqueta: ${await page.textContent('#nota-sesion-label')}`);
  await page.fill('#nota', 'HOLA');
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
    return p.sesiones.filter((x) => x.notas === 'HOLA').map((x) => x.fecha);
  });
  afirmar(JSON.stringify(r) === '["2020-01-01"]', `nota guardada en: ${r}`);
});

/* ---------- Mejora muscular (EMG) ---------- */
const sesionImportada = (fecha, extra = {}) => ({ sesion: { fecha, ejercicios: [{ tipo: 'flexion', repeticiones: 10, repeticionesObjetivo: 10, anguloMax: 40 }], ...extra } });
async function importar(page, datos) {
  await page.click('.nav-seccion[data-seccion="reporte"]');
  await page.setInputFiles('#file-input', { name: 'sesion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(datos)) });
  await page.waitForTimeout(300);
}
const tarjetaMusculo = (page) => page.locator('#resumen-tarjetas > *').nth(3);

await verificar('emg: tarjeta y gráfica', async (page) => {
  afirmar((await tarjetaMusculo(page).textContent()).includes('%'), 'la tarjeta Músculo no muestra %');
  await page.click('#mas-emg summary');
  await page.waitForTimeout(300);
  const alto = await page.$eval('#chart-emg', (c) => c.getBoundingClientRect().height);
  afirmar(alto > 100, `alto de la gráfica EMG: ${alto}`);
});

await verificar('emg: sin prueba', async (page) => {
  await page.click('#btn-nuevo');
  await page.fill('#form-paciente [name=nombre]', 'Paciente Sin EMG');
  await page.fill('#form-paciente [name=documento]', '9');
  await page.fill('#form-paciente [name=edad]', '40');
  await page.fill('#form-paciente [name=fechaCirugia]', '2026-09-01');
  await page.click('#form-paciente button[value=ok]');
  await importar(page, sesionImportada('2026-10-01'));
  await page.click('.nav-seccion[data-seccion="seguimiento"]');
  await page.click('#seg-vistas [data-vista="resumen"]');
  afirmar((await tarjetaMusculo(page).textContent()).includes('Sin prueba EMG (empieza en la Fase 2)'), 'texto de la tarjeta sin prueba');
});

await verificar('emg: sesiones sin prueba', async (page) => {
  await importar(page, sesionImportada('2026-10-24'));
  await page.click('.nav-seccion[data-seccion="seguimiento"]');
  await page.click('#seg-vistas [data-vista="sesion"]');
  afirmar(await page.isHidden('#sesion-emg'), 'la tarjeta EMG aparece en una sesión sin prueba');
  await page.click('#seg-vistas [data-vista="resumen"]');
  await page.click('#mas-emg summary');
  await page.waitForTimeout(300);
  afirmar((await tarjetaMusculo(page).textContent()).includes('%'), 'la tarjeta perdió el último índice');
});

await verificar('emg: una sesión', async (page) => {
  await page.click('#seg-vistas [data-vista="sesion"]');
  const txt = await page.textContent('#sesion-emg');
  for (const m of ['Pulgar (tenar)', 'Flexores', 'Extensores', 'Co-contracción']) afirmar(txt.includes(m), `falta ${m}`);
  afirmar(await page.locator('#sesion-emg .emg-pico').count() === 9, 'no muestra los 9 picos');
});

await verificar('emg: csv', async (page) => {
  await page.click('.nav-seccion[data-seccion="reporte"]');
  const [d] = await Promise.all([page.waitForEvent('download'), page.click('#btn-csv')]);
  const texto = fs.readFileSync(await d.path(), 'utf8');
  afirmar(texto.split(/\r?\n/)[0].includes('indice_mediano_pct'), 'el CSV no tiene columnas EMG');
});

await verificar('emg: importar inválido', async (page) => {
  await importar(page, sesionImportada('2026-10-02', { emg: { prueba: { tenar: { picos: [1] } } } }));
  afirmar(page.dialogos.some((m) => m.includes('No se pudo importar')), `diálogos: ${page.dialogos}`);
});

await verificar('emg: avisos', async (page) => {
  afirmar((await page.textContent('#observaciones')).includes('nervio mediano'), 'sin aviso del nervio mediano');
});

/* ---------- Pulido ---------- */
const SECCIONES = ['ejercicios', 'seguimiento', 'reporte'];

await verificar('móvil sin scroll horizontal', async (page) => {
  for (const sec of SECCIONES) {
    await page.click(`.nav-seccion[data-seccion="${sec}"]`);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    afirmar(ancho <= 390, `${sec}: ancho ${ancho}`);
  }
}, { viewport: { width: 390, height: 844 } });

await verificar('un primario por sección', async (page) => {
  for (const sec of SECCIONES) {
    await page.click(`.nav-seccion[data-seccion="${sec}"]`);
    const n = await page.locator('main .btn-primary:visible').count();
    afirmar(n <= 1, `${sec}: ${n} botones primarios`);
  }
});

await verificar('modo oscuro', async (page) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  afirmar(fondo !== 'rgb(255, 255, 255)', `fondo: ${fondo}`);
});

// --capturas <carpeta>: una captura por sección en escritorio y móvil.
const iCap = process.argv.indexOf('--capturas');
if (iCap > 0) {
  const carpeta = path.resolve(process.argv[iCap + 1]);
  fs.mkdirSync(carpeta, { recursive: true });
  for (const [ancho, alto, tag] of [[1366, 900, 'escritorio'], [390, 844, 'movil']]) {
    const page = await nuevaPagina({ viewport: { width: ancho, height: alto } });
    for (const sec of SECCIONES) {
      await page.click(`.nav-seccion[data-seccion="${sec}"]`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(carpeta, `${tag}-${sec}.png`), fullPage: true });
    }
    await page.context().close();
  }
  console.log('Capturas en', carpeta);
}

await navegador.close();
servidor.close();
console.log(fallas ? `\n${fallas} comprobación(es) fallida(s)` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
