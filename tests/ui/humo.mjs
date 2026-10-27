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
const JSPDF_LOCAL = path.join(RAIZ, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js');
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
// abrirPaciente: tras cargar el panel (que empieza en el Inicio) abre el primer paciente de la lista.
async function nuevaPagina({ viewport = { width: 1366, height: 900 }, init, ruta = '', sesion = SESION_PRUEBA, rutas = {}, abrirPaciente = true, sinJsPdf = false } = {}) {
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
  // jsPDF: copia local si existe; sinJsPdf simula que no hay internet.
  await ctx.route('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/**', (r) =>
    sinJsPdf ? r.abort() : fs.existsSync(JSPDF_LOCAL) ? r.fulfill({ path: JSPDF_LOCAL, contentType: 'text/javascript' }) : r.continue());
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
  if (sesion && (!ruta || ruta === 'index.html')) {
    await page.waitForSelector('.patient-item');
    if (abrirPaciente) { await page.click('.patient-item >> nth=0'); await page.waitForSelector('#vista-paciente:not([hidden])'); }
  }
  return page;
}

// HUMO_SOLO=<texto>: corre solo las comprobaciones cuyo nombre lo contiene (para depurar).
async function verificar(nombre, fn, opciones) {
  if (process.env.HUMO_SOLO && !nombre.includes(process.env.HUMO_SOLO)) return;
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
  afirmar(await page.isVisible('#lista-sesiones'), '#lista-sesiones no visible');
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

/* ---------- Inicio ---------- */
const SIN_ABRIR = { abrirPaciente: false };

await verificar('inicio: tras el login', async (page) => {
  afirmar(await page.isVisible('#inicio') && await page.isHidden('#vista-paciente'), 'no arranca en el Inicio');
  afirmar((await page.textContent('#inicio-saludo')).includes('Prueba'), 'el saludo no tiene el nombre');
  afirmar(await page.locator('#inicio-cifras .kpi').count() === 4, 'no hay 4 cifras');
  const primarios = await page.$$eval('main .btn-primary', (bs) => bs.filter((b) => b.offsetParent).map((b) => b.id));
  afirmar(JSON.stringify(primarios) === '["btn-nueva-sesion"]', `primarios: ${primarios}`);
}, SIN_ABRIR);

await verificar('inicio: atención abre seguimiento', async (page) => {
  await page.click('#inicio-atencion [data-accion] >> nth=0');
  afirmar(await page.isVisible('#vista-paciente') && await seccionActiva(page) === 'seguimiento', 'no abrió Seguimiento');
}, SIN_ABRIR);

await verificar('inicio: nueva sesión', async (page) => {
  await page.click('#btn-nueva-sesion');
  await page.fill('#buscar-sesion', 'Luz');
  await page.click('#elegir-lista [data-id] >> nth=0');
  afirmar(await page.evaluate(() => estado.pacienteId) === 'P-003', 'no eligió a Luz Dary');
  afirmar(await seccionActiva(page) === 'ejercicios', 'no abrió Ejercicios');
}, SIN_ABRIR);

await verificar('inicio: volver', async (page) => {
  await page.click('#nav-inicio');
  afirmar(await page.isVisible('#inicio') && await page.isHidden('#vista-paciente'), 'no volvió al Inicio');
  await page.click('.patient-item >> nth=0');
  await page.click('#marca-inicio');
  afirmar(await page.isVisible('#inicio'), 'la marca no lleva al Inicio');
});

await verificar('inicio: archivados fuera', async (page) => {
  afirmar((await page.textContent('#inicio-citas')).includes('Carlos'), 'Carlos debería tener cita hoy');
  await page.evaluate(() => { estado.db.pacientes.find((p) => p.id === 'P-002').archivado = true; renderPaciente(); });
  const txt = (await page.textContent('#inicio-citas')) + (await page.textContent('#inicio-atencion'));
  afirmar(!txt.includes('Carlos'), 'un archivado sigue en el Inicio');
  await page.click('#btn-nueva-sesion');
  afirmar(!(await page.textContent('#elegir-lista')).includes('Carlos'), 'un archivado se puede elegir');
}, SIN_ABRIR);

await verificar('inicio: datos antiguos', async (page) => {
  afirmar(await page.isVisible('#inicio-cifras'), 'no se ve el Inicio');
}, { ...SIN_ABRIR, init: () => {
  if (sessionStorage.getItem('humo.antiguos')) return;
  sessionStorage.setItem('humo.antiguos', '1');
  localStorage.setItem('rehabcarpo.db.v1', JSON.stringify({ version: 1, pacientes: [
    { id: 'P-001', nombre: 'Antigua', documento: '1', edad: 50, sexo: 'F', mano: 'Derecha', fechaCirugia: '2026-08-01',
      sesiones: [{ id: 'S1', fecha: '2026-08-20', duracionMin: 20, perdidaDatosPct: 0, dolorEVA: 4, notas: '', ejercicios: [{ tipo: 'flexion', repeticiones: 10, repeticionesObjetivo: 10, anguloMax: 40 }] }] },
  ] }));
} });

/* ---------- Ficha del paciente ---------- */
const abrirFicha = (page) => page.click('#encabezado details summary');

await verificar('ficha: editar', async (page) => {
  const id = await page.evaluate(() => estado.pacienteId);
  await abrirFicha(page);
  await page.click('#btn-editar-ficha');
  await page.fill('#form-paciente [name=ocupacion]', 'Docente');
  await page.click('#form-paciente button[value=ok]');
  // El evento 'close' del diálogo llega en una tarea aparte: esperar a que se repinte.
  await page.waitForFunction(() => document.querySelector('#encabezado').textContent.includes('Docente'));
  afirmar(await page.evaluate(() => estado.pacienteId) === id, 'cambió el paciente');
  afirmar(await page.evaluate((id) => estado.db.pacientes.filter((p) => p.id === id).length, id) === 1, 'se duplicó el paciente');
});

await verificar('ficha: archivar y reactivar', async (page) => {
  const id = await page.evaluate(() => estado.pacienteId);
  await abrirFicha(page);
  await page.click('#btn-archivar');
  afirmar(await page.locator(`.patient-item[data-id="${id}"]`).count() === 0, 'sigue en la lista');
  await page.check('#ver-archivados');
  const item = page.locator(`.patient-item[data-id="${id}"]`);
  afirmar((await item.textContent()).includes('Dado de alta'), 'no dice Dado de alta');
  await item.click();
  await abrirFicha(page);
  afirmar((await page.textContent('#btn-archivar')).trim() === 'Reactivar', 'el botón no dice Reactivar');
  await page.click('#btn-archivar');
  await page.uncheck('#ver-archivados');
  afirmar(await page.locator(`.patient-item[data-id="${id}"]`).count() === 1, 'no volvió a la lista');
});

await verificar('ficha: próxima cita', async (page) => {
  await abrirFicha(page);
  await page.click('#btn-editar-ficha');
  await page.fill('#form-paciente [name=proximaCita]', '2026-12-01');
  await page.click('#form-paciente button[value=ok]');
  const esperado = await page.evaluate(() => fmtFecha('2026-12-01'));
  await page.waitForFunction((t) => document.querySelector('#encabezado').textContent.includes(t), esperado);
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

// Chequeo de seguridad (paso 1): dolor ahora, sin hormigueo, herida bien → Continuar.
async function completarChequeo(page, { dolor = 2, bajar = false } = {}) {
  await page.waitForSelector('#dlg-chequeo[open]');
  await page.fill('#ch-dolor', String(dolor));
  if (bajar) await page.click('#ch-bajar');
  await page.click('#ch-continuar');
}

// Graba una rutina con el simulador hasta pulsar "Terminar rutina" (etapa: 1–3 o null = la sugerida).
async function grabarRutina(page, etapa = null, chequeo = {}) {
  await irEjercicios(page);
  if (etapa) await page.click(`#rt-etapas [data-etapa="${etapa}"]`);
  await page.click('#rt-iniciar');
  await completarChequeo(page, chequeo);
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
  const t0 = Date.now();
  await grabarRutina(page, 2);
  const segundos = (Date.now() - t0) / 1000;
  if (await page.isVisible('#pr-omitir')) await page.click('#pr-omitir');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  const s = await ultimaSesion(page);
  afirmar(s.emg && s.emg.senal.tenar.length > 0 && s.emg.prueba === null, JSON.stringify(s.emg ?? null).slice(0, 120));
  // Señal reducida a 2 Hz (máximo de cada medio segundo) para no llenar el almacenamiento.
  afirmar(s.emg.senal.fs === 2 && s.emg.senal.tenar.length <= segundos * 2 + 2, `fs ${s.emg.senal.fs}, ${s.emg.senal.tenar.length} valores para ${segundos} s`);
});

await verificar('rutina completa con simulador', async (page) => {
  await irEjercicios(page);
  await page.click('#rt-etapas [data-etapa="1"]');
  await page.click('#rt-iniciar');
  await completarChequeo(page);
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
  await page.click('#rs-seguimiento');
  await page.waitForTimeout(300);
  afirmar(await seccionActiva(page) === 'seguimiento', 'no volvió a Seguimiento');
  const r = await page.evaluate(() => {
    const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
    return { vista: estado.vista, nueva: p.sesiones[p.sesiones.length - 1].id, sel: document.querySelector('#sesion-select').value };
  });
  afirmar(r.vista === 'sesion' && r.sel === r.nueva, JSON.stringify(r));
});

// Empieza una rutina con el simulador y avanza hasta el paso `id` (sin terminar la rutina).
async function rutinaHastaPaso(page, etapa, id, { herida } = {}) {
  await irEjercicios(page);
  await page.click(`#rt-etapas [data-etapa="${etapa}"]`);
  await page.click('#rt-iniciar');
  await page.waitForSelector('#dlg-chequeo[open]');
  await page.fill('#ch-dolor', '2');
  if (herida) {
    await page.selectOption('#ch-herida', herida);
    await page.check('#ch-criterio');
    await page.click('#ch-continuar-criterio');
  } else {
    await page.click('#ch-continuar');
  }
  await page.waitForSelector('#ls-empezar:not([disabled])', { timeout: 35000 });
  await page.click('#ls-empezar');
  await page.waitForSelector('#dlg-rutina[open]');
  await page.evaluate(() => {
    window.comandos = [];
    const t = mv.transporte, enviar = t.enviar.bind(t);
    t.enviar = (c) => { window.comandos.push(c); return enviar(c); };
  });
  const nombre = await page.evaluate(({ etapa, id }) => etapaPorNumero(etapa).pasos.find((x) => x.id === id).nombre, { etapa, id });
  for (let i = 0; i < 20 && (await page.textContent('#rt-nombre')).trim() !== nombre; i++) {
    await page.click('#rt-siguiente');
    await page.waitForTimeout(450);
  }
}
// Desde el paso actual: pasa por el resto, termina y guarda (omitiendo la prueba de fuerza).
async function terminarYGuardar(page) {
  for (let i = 0; i < 20 && (await page.textContent('#rt-siguiente-txt')).trim() !== 'Terminar rutina'; i++) {
    await page.click('#rt-siguiente');
    await page.waitForTimeout(450);
  }
  await page.click('#rt-siguiente');
  if (await page.isVisible('#pr-omitir')) await page.click('#pr-omitir');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  return ultimaSesion(page);
}
const pasoGuardado = (s, id) => s.rutina.pasos.find((x) => x.id === id);
const esperarDetectadas = (page) => page.waitForFunction(() => /^Detectadas: [1-9]/.test(document.querySelector('#rt-contador').textContent), null, { timeout: 15000 });

await verificar('fase 1 con EMG', async (page) => {
  await rutinaHastaPaso(page, 1, 'tendon_recto');
  await esperarDetectadas(page);
  afirmar(await page.evaluate(() => mv.ej?.musculo) === 'flexores', 'el paso no mide los flexores');
  afirmar(await page.evaluate(() => { terminarRutina(); return document.querySelector('#fin-tabla td:nth-child(3)').textContent; }) !== '—', 'la tabla final no muestra las detectadas por EMG');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  const s = await ultimaSesion(page);
  const r = pasoGuardado(s, 'tendon_recto');
  afirmar(r.medicion?.fuente === 'emg' && r.emg?.musculo === 'flexores' && r.emg.repeticiones > 0 && r.repeticiones === r.emg.repeticiones, JSON.stringify(r).slice(0, 200));
  afirmar(!s.ejercicios.length, 'un paso EMG no debe entrar en los ejercicios con ángulo');
});

await verificar('fase 1 herida → oposición manual', async (page) => {
  await rutinaHastaPaso(page, 1, 'pulgar_oposicion', { herida: 'enrojecida' });
  await page.waitForTimeout(600);
  afirmar((await page.textContent('#rt-contador')).startsWith('Cuente las repeticiones'), await page.textContent('#rt-contador'));
  afirmar(await page.evaluate(() => mv.ej) === null, 'se está midiendo la oposición');
  const s = await terminarYGuardar(page);
  const r = pasoGuardado(s, 'pulgar_oposicion');
  afirmar(r.medicion === null && r.repeticiones === null && s.chequeo.herida === 'enrojecida', JSON.stringify(r).slice(0, 200));
});

await verificar('pronación con IMU', async (page) => {
  await rutinaHastaPaso(page, 2, 'pronacion');
  await esperarDetectadas(page);
  const s = await terminarYGuardar(page);
  const r = pasoGuardado(s, 'pronacion');
  afirmar(r.medicion?.fuente === 'imu' && r.tipo === 'pronacion' && r.repeticiones > 0, JSON.stringify(r).slice(0, 200));
  afirmar(s.ejercicios.some((e) => e.tipo === 'pronacion' && e.anguloMax > 20), 'sin ángulo de pronación');
});

await verificar('desviación pide recalibrar', async (page) => {
  await rutinaHastaPaso(page, 2, 'desv_radial');
  afirmar(await page.evaluate(() => window.comandos.includes('CAL')), 'no envió CAL');
  afirmar((await page.textContent('#rt-contador')).startsWith('Calibrando…'), await page.textContent('#rt-contador'));
  await esperarDetectadas(page);
});

await verificar('calibración de canto no vale para flexión', async (page) => {
  await rutinaHastaPaso(page, 2, 'desv_radial');
  await page.waitForFunction(() => mv.ej?.tipo === 'desv_radial', null, { timeout: 15000 });
  afirmar(await page.evaluate(() => !estadoDispositivo().calOk), 'la calibración de canto cuenta como válida para la sesión');
  const cal0 = await page.evaluate(() => window.comandos.filter((c) => c === 'CAL').length);
  await page.click('#rt-anterior');
  await page.waitForTimeout(450);
  await page.click('#rt-anterior');
  await page.waitForTimeout(450);
  afirmar((await page.textContent('#rt-nombre')).trim() === 'Flexión de muñeca', await page.textContent('#rt-nombre'));
  // Si la flexión ya quedó grabada se vuelve a grabar; si no, empieza sola al volver.
  if (await page.isVisible('#rt-regrabar')) await page.click('#rt-regrabar');
  await page.waitForTimeout(200);
  afirmar(await page.evaluate((n) => window.comandos.filter((c) => c === 'CAL').length > n, cal0), 'no recalibró en la postura neutra');
  afirmar((await page.textContent('#rt-contador')).startsWith('Calibrando…'), await page.textContent('#rt-contador'));
  await page.waitForFunction(() => mv.ej?.tipo === 'flexion', null, { timeout: 15000 });
  afirmar(await page.evaluate(() => estadoDispositivo().calOk), 'tras calibrar en neutro la calibración no vuelve a ser válida');
});

await verificar('reposo tomado después de recalibrar', async (page) => {
  await rutinaHastaPaso(page, 2, 'desv_radial');
  afirmar((await page.textContent('#rt-contador')).startsWith('Calibrando…'), 'no está calibrando');
  // Muestras con el cero anterior (mano de canto con la muñeca algo flexionada): rc ≈ 30.
  // Se meten justo antes de que llegue CAL,OK, como las que el dispositivo sigue enviando mientras calibra.
  await page.evaluate(() => {
    const t = mv.transporte, onLinea = t.onLinea;
    t.onLinea = (l) => {
      if (l.startsWith('CAL,OK')) { const u = mv.buffer[mv.buffer.length - 1]; for (let i = 0; i < 25; i++) mv.buffer.push({ ...u, rc: 30 }); }
      onLinea(l);
    };
  });
  await page.waitForFunction(() => mv.ej?.tipo === 'desv_radial', null, { timeout: 15000 });
  const base = await page.evaluate(() => mv.ej.base);
  afirmar(Math.abs(base) < 3, `reposo ${base}: usa muestras de antes de la calibración`);
});

await verificar('paso EMG sin electrodos', async (page) => {
  await rutinaHastaPaso(page, 1, 'tendon_recto');
  await page.waitForTimeout(1500); // un paso necesita ≥ 1 s para guardarse
  afirmar((await page.textContent('#rt-contador')).trim() === 'Este ejercicio se mide con EMG: conecte los electrodos o cuente a mano.', await page.textContent('#rt-contador'));
  const s = await terminarYGuardar(page);
  const r = pasoGuardado(s, 'tendon_recto');
  afirmar(r.medicion === null && r.repeticiones === null && r.senal, JSON.stringify(r).slice(0, 200));
}, { init: () => { window.SIMULADOR_SIN_EMG = true; } });

const PRUEBA_RAPIDA = () => { window.TIEMPOS_PRUEBA_EMG = { prepara: 300, fuerza: 400, descanso: 200 }; };

/* ---------- Chequeo de seguridad y pasos ---------- */
await verificar('chequeo: aparece antes', async (page) => {
  await irEjercicios(page);
  await page.click('#rt-iniciar');
  await page.waitForSelector('#dlg-chequeo[open]');
  afirmar(!(await page.isVisible('#dlg-listos')), 'se abrió "¿Listos?" antes del chequeo');
});

await verificar('chequeo: dolor obligatorio', async (page) => {
  await irEjercicios(page);
  await page.click('#rt-iniciar');
  await page.click('#ch-continuar');
  afirmar((await page.textContent('#ch-error')).includes('Indique el dolor de 0 a 10.'), 'sin aviso de dolor');
  afirmar(!(await page.isVisible('#dlg-listos')), 'continuó sin dolor');
});

await verificar('chequeo: detener', async (page) => {
  await irEjercicios(page);
  await page.click('#rt-iniciar');
  await page.fill('#ch-dolor', '1');
  await page.selectOption('#ch-herida', 'abierta');
  afirmar((await page.textContent('#ch-no-hacer')).trim() === 'No hacer la sesión hoy', 'sin "No hacer la sesión hoy"');
  afirmar(await page.isHidden('#ch-continuar'), '"Continuar" sigue visible');
  afirmar(await page.isDisabled('#ch-continuar-criterio'), 'se puede continuar sin marcar la casilla');
  await page.check('#ch-criterio');
  afirmar(await page.isEnabled('#ch-continuar-criterio'), 'no se habilita al marcar la casilla');
  await page.click('#ch-no-hacer');
  afirmar(!(await page.isVisible('#dlg-chequeo')) && !(await page.isVisible('#dlg-listos')), 'no se cerró sin empezar');
});

await verificar('chequeo: bajar de fase', async (page) => {
  await grabarRutina(page, 2, { dolor: 5, bajar: true });
  await page.waitForSelector('#dlg-fin[open]');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  const s = await ultimaSesion(page);
  afirmar(s.rutina.etapa === 1 && s.chequeo.nivel === 'precaucion', `etapa ${s.rutina.etapa}, nivel ${s.chequeo?.nivel}`);
}, { init: PRUEBA_RAPIDA });

await verificar('chequeo: bajar una sola vez y cancelar restaura', async (page) => {
  await irEjercicios(page);
  await page.click('#rt-etapas [data-etapa="3"]');
  await page.click('#rt-iniciar');
  await page.fill('#ch-dolor', '5');
  await page.click('#ch-bajar');
  afirmar(await page.isHidden('#ch-bajar'), 'se puede seguir bajando de fase');
  afirmar(await page.evaluate(() => etapaElegida) === 2, 'no bajó a la Fase 2');
  await page.click('#ch-cancelar');
  // 'close' llega en una tarea aparte: esperar a que se restaure la fase.
  await page.waitForFunction(() => etapaElegida === 3, null, { timeout: 3000 });
});

await verificar('buscar paciente sin documento', async (page) => {
  await page.fill('#buscar', 'xx');
  await page.click('#btn-nueva-sesion');
  await page.fill('#buscar-sesion', 'an');
  afirmar(await page.locator('#elegir-lista [data-id]').count() === 1, 'no lista al paciente');
}, { ...SIN_ABRIR, init: () => {
  if (sessionStorage.getItem('humo.sindoc')) return;
  sessionStorage.setItem('humo.sindoc', '1');
  localStorage.setItem('rehabcarpo.db.v1', JSON.stringify({ version: 1, pacientes: [
    { id: 'P-001', nombre: 'Ana Antigua', edad: 50, sexo: 'F', mano: 'Derecha', fechaCirugia: '2026-08-01', sesiones: [] },
  ] }));
} });

await verificar('chequeo: Esc no empieza', async (page) => {
  await irEjercicios(page);
  await page.click('#rt-iniciar');
  await page.waitForSelector('#dlg-chequeo[open]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  afirmar(!(await page.isVisible('#dlg-chequeo')) && !(await page.isVisible('#dlg-listos')), 'Esc empezó la sesión');
});

await verificar('chequeo: se guarda', async (page) => {
  await grabarRutina(page, 1);
  await page.waitForSelector('#dlg-fin[open]');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  const c = (await ultimaSesion(page)).chequeo;
  afirmar(c && c.dolorAntes === 2 && c.nivel === 'ok' && c.hormigueo === 'no' && c.herida === 'bien' && c.continuoBajoCriterio === false, JSON.stringify(c));
});

await verificar('pasos: visibles', async (page) => {
  await irEjercicios(page);
  await page.click('#rt-iniciar');
  afirmar((await page.textContent('#dlg-chequeo [aria-current=step]')).includes('Chequeo'), 'el chequeo no es el paso actual');
  await completarChequeo(page);
  await page.waitForSelector('#dlg-listos[open]');
  afirmar((await page.textContent('#dlg-listos [aria-current=step]')).includes('Dispositivo'), 'Dispositivo no es el paso actual');
});

/* ---------- Cierre, resumen y hoja para el paciente ---------- */
async function rutinaHastaCierre(page) {
  await grabarRutina(page, 1);
  await page.waitForSelector('#dlg-fin[open]');
}
const pacienteActual = (page) => page.evaluate(() => estado.db.pacientes.find((p) => p.id === estado.pacienteId));

await verificar('cierre: próxima cita', async (page) => {
  await rutinaHastaCierre(page);
  const esperada = await page.evaluate(() => sumarDiasISO(hoyISO(), 7));
  afirmar(await page.inputValue('#fin-cita') === esperada, `cita por defecto: ${await page.inputValue('#fin-cita')}`);
  afirmar((await page.textContent('#dlg-fin')).includes('Dolor después (0–10)'), 'no dice "Dolor después"');
  await page.fill('#fin-cita', '2026-12-15');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  afirmar((await pacienteActual(page)).proximaCita === '2026-12-15', 'no guardó la próxima cita');
});

await verificar('cierre: sin próxima cita', async (page) => {
  await rutinaHastaCierre(page);
  await page.check('#fin-sin-cita');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  afirmar((await pacienteActual(page)).proximaCita === null, 'la próxima cita no es null');
});

await verificar('resumen: tras guardar', async (page) => {
  await rutinaHastaCierre(page);
  await page.click('#fin-guardar');
  await page.waitForSelector('#dlg-resumen[open]');
  afirmar(await page.locator('#rs-comparacion li').count() >= 1, 'sin frases de comparación');
  afirmar((await page.textContent('#dlg-resumen .btn-primary')).trim() === 'Volver al inicio', 'el primario no es "Volver al inicio"');
  await page.click('#rs-inicio');
  await page.waitForSelector('#inicio:not([hidden])');
});

await verificar('resumen: ver seguimiento', async (page) => {
  await rutinaHastaCierre(page);
  await page.click('#fin-guardar');
  await page.click('#rs-seguimiento');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
    return { vista: estado.vista, sel: document.querySelector('#sesion-select').value, nueva: p.sesiones[p.sesiones.length - 1].id };
  });
  afirmar(await seccionActiva(page) === 'seguimiento' && r.vista === 'sesion' && r.sel === r.nueva, JSON.stringify(r));
});

await verificar('resumen: Esc vuelve al inicio', async (page) => {
  await rutinaHastaCierre(page);
  await page.click('#fin-guardar');
  await page.waitForSelector('#dlg-resumen[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#inicio:not([hidden])');
});

await verificar('hoja: imprime una página', async (page) => {
  await rutinaHastaCierre(page);
  await page.click('#fin-guardar');
  await page.click('#rs-hoja');
  afirmar(await page.evaluate(() => window.__impreso) === 1, 'no llamó a imprimir');
  const txt = await page.textContent('#hoja-paciente');
  const nombre = (await pacienteActual(page)).nombre;
  for (const t of [nombre, 'Ejercicios para casa', 'Próxima cita', 'Hoy hizo']) afirmar(txt.includes(t), `la hoja no tiene "${t}"`);
  await page.emulateMedia({ media: 'print' });
  const pdf = (await page.pdf({ format: 'A4' })).toString('latin1');
  const paginas = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  afirmar(paginas === 1, `la hoja ocupa ${paginas} páginas`);
}, { init: () => { window.print = () => { window.__impreso = (window.__impreso || 0) + 1; }; } });

/* ---------- Prueba de fuerza muscular ---------- */

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
  const clase = await page.getAttribute('#dlg-resumen .pasos-sesion-lista li:nth-child(4)', 'class');
  afirmar(clase === 'hecho', `en el Resumen, la Prueba EMG figura como "${clase}"`);
  afirmar(p.tenar.media > 300 && p.extensores.media > 300, `medias: ${p.tenar.media}, ${p.extensores.media}`);
}, { init: PRUEBA_RAPIDA });

await verificar('prueba: sin actividad no se guarda', async (page) => {
  await grabarRutina(page, 2);
  await page.waitForSelector('#dlg-prueba[open]');
  await page.waitForSelector('#pr-repetir:visible', { timeout: 15000 });
  afirmar((await page.textContent('#pr-dudosa')).includes('No se detectó actividad'), 'sin aviso de actividad');
  afirmar(await page.isDisabled('#pr-siguiente'), 'deja seguir sin actividad');
  await page.click('#pr-omitir');
  await page.click('#fin-guardar');
  await page.waitForTimeout(300);
  afirmar((await ultimaSesion(page)).emg?.prueba === null, 'se guardó una prueba sin actividad');
}, { init: () => { window.SIMULADOR_EMG_PLANO = true; window.TIEMPOS_PRUEBA_EMG = { prepara: 300, fuerza: 400, descanso: 200 }; } });

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

await verificar('reporte: lectura rápida', async (page) => {
  await irReporte(page);
  afirmar((await page.textContent('#lectura-general')).trim().length > 0, 'sin frase general');
  const areas = await page.$$eval('#lectura-areas .area', (as) => as.map((a) => [a.querySelector('.area-titulo').textContent.trim(), a.dataset.estado]));
  afirmar(JSON.stringify(areas.map((a) => a[0])) === JSON.stringify(['Movimiento', 'Dolor', 'Músculo', 'Constancia']), `áreas: ${areas}`);
  afirmar(areas.every((a) => ['bien', 'atencion', 'revisar', 'sin-datos'].includes(a[1])), `estados: ${areas}`);
  afirmar((await page.textContent('section.seccion[data-seccion="reporte"]')).includes('Lectura orientativa'), 'sin aviso de lectura orientativa');
});

await verificar('reporte: línea de tiempo', async (page) => {
  await irReporte(page);
  const r = await page.evaluate(() => {
    const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
    const ses = [...p.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const lis = [...document.querySelectorAll('#lista-sesiones li[data-id]')];
    return {
      n: ses.length, lis: lis.length, primera: lis[0]?.dataset.id, ultima: ses[ses.length - 1].id,
      completas: lis.every((li) => li.querySelector('.btn-ver') && li.querySelector('.btn-notas') && li.querySelector('.btn-pdf') && li.querySelector('.chip')),
    };
  });
  afirmar(r.n === r.lis && r.primera === r.ultima && r.completas, JSON.stringify(r));
});

await verificar('reporte: notas desde la lista', async (page) => {
  await irReporte(page);
  const id = await page.getAttribute('#lista-sesiones li[data-id] >> nth=1', 'data-id');
  await page.click('#lista-sesiones li[data-id] >> nth=1 >> .btn-notas');
  afirmar(await page.getAttribute(`#lista-sesiones li[data-id="${id}"]`, 'class') === 'seleccionada', 'no quedó seleccionada');
  await page.fill('#nota', 'Nota de prueba');
  await page.waitForTimeout(700);
  const nota = await page.evaluate((id) => estado.db.pacientes.find((x) => x.id === estado.pacienteId).sesiones.find((s) => s.id === id).notas, id);
  afirmar(nota === 'Nota de prueba', `nota: ${nota}`);
});

await verificar('reporte: sin sesiones', async (page) => {
  await page.click('#btn-nuevo');
  await page.fill('#form-paciente [name=nombre]', 'Paciente Nuevo');
  await page.fill('#form-paciente [name=documento]', '77');
  await page.fill('#form-paciente [name=edad]', '40');
  await page.fill('#form-paciente [name=fechaCirugia]', '2026-10-20');
  await page.click('#form-paciente button[value=ok]');
  await page.waitForFunction(() => estado.db.pacientes.some((p) => p.nombre === 'Paciente Nuevo' && p.id === estado.pacienteId));
  await irReporte(page);
  const estados = await page.$$eval('#lectura-areas .area', (as) => as.map((a) => a.dataset.estado));
  afirmar(JSON.stringify(estados) === JSON.stringify(['sin-datos', 'sin-datos', 'sin-datos', 'sin-datos']), `estados: ${estados}`);
  afirmar((await page.textContent('#lista-sesiones')).includes('Aún no hay sesiones.'), 'sin mensaje de vacío');
  afirmar(await page.locator('.btn-pdf').count() === 0, 'hay botones de PDF');
});

await verificar('archivos en reporte', async (page) => {
  await irReporte(page);
  for (const id of ['#btn-csv', '#btn-exportar', '#btn-importar']) afirmar(await page.isVisible(id), `${id} no visible`);
  const reset = await page.$eval('#btn-reset', (b) => { const d = b.closest('details'); return !!d && !d.open; });
  afirmar(reset, '#btn-reset no está en un <details> cerrado');
});

await verificar('ver detalle', async (page) => {
  await irReporte(page);
  await page.click('#lista-sesiones .btn-ver >> nth=0');
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

/* ---------- PDF de cada sesión ---------- */
async function descargarPdf(page, selector) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click(selector)]);
  const buf = fs.readFileSync(await d.path());
  return { nombre: d.suggestedFilename(), bytes: buf.length, texto: buf.toString('latin1'), paginas: (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length };
}

await verificar('pdf: descarga', async (page) => {
  await irReporte(page);
  const r0 = await page.evaluate(() => {
    const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
    const s = [...p.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
    return { id: p.id, fecha: s.fecha, apellido: p.nombre.split(' ').pop() };
  });
  const pdf = await descargarPdf(page, '#lista-sesiones .btn-pdf >> nth=0');
  afirmar(pdf.nombre === `${r0.id}_sesion_${r0.fecha}.pdf`, `nombre: ${pdf.nombre}`);
  afirmar(pdf.texto.startsWith('%PDF'), 'no es un PDF');
  afirmar(pdf.texto.includes('Reporte de sesi') && pdf.texto.includes(r0.apellido), 'el PDF no tiene el título o el paciente');
  afirmar(pdf.bytes < 1024 * 1024, `el PDF pesa ${Math.round(pdf.bytes / 1024)} KB`);
});

await verificar('pdf: desde una sesión', async (page) => {
  await page.click('#seg-vistas [data-vista="sesion"]');
  const fecha = await page.evaluate(() => estado.db.pacientes.find((x) => x.id === estado.pacienteId).sesiones.find((s) => s.id === estado.sesionId).fecha);
  const pdf = await descargarPdf(page, '#btn-pdf-sesion');
  afirmar(pdf.nombre.includes(fecha), `nombre: ${pdf.nombre}`);
});

await verificar('pdf: notas largas', async (page) => {
  await page.evaluate(() => {
    const p = estado.db.pacientes.find((x) => x.id === estado.pacienteId);
    [...p.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha)).pop().notas = 'Nota larga de seguimiento con tildes y eñes. '.repeat(140);
  });
  await irReporte(page);
  const pdf = await descargarPdf(page, '#lista-sesiones .btn-pdf >> nth=0');
  afirmar(pdf.paginas >= 2, `páginas: ${pdf.paginas}`);
});

await verificar('pdf: sin conexión', async (page) => {
  await irReporte(page);
  let descargas = 0;
  page.on('download', () => descargas++);
  await page.click('#lista-sesiones .btn-pdf >> nth=0');
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('No se pudo generar el PDF: revise la conexión a internet.'));
  await page.waitForTimeout(500);
  afirmar(descargas === 0, 'hubo una descarga');
}, { sinJsPdf: true });

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

await verificar('importar: dolor no numérico rechazado', async (page) => {
  await importar(page, sesionImportada('2026-10-03', { dolorEVA: '<img src=x onerror="window.__xss=1">' }));
  afirmar(page.dialogos.some((m) => m.includes('No se pudo importar')), `diálogos: ${page.dialogos}`);
  await page.click('#nav-inicio');
  afirmar(await page.evaluate(() => window.__xss) === undefined, 'se ejecutó código del archivo importado');
});

await verificar('pdf: sesión importada', async (page) => {
  await importar(page, sesionImportada('2026-10-26'));
  const pdf = await descargarPdf(page, '#lista-sesiones li[data-id] >> nth=0 >> .btn-pdf');
  afirmar(pdf.texto.startsWith('%PDF') && pdf.nombre.endsWith('_sesion_2026-10-26.pdf'), `nombre: ${pdf.nombre}`);
});

await verificar('pdf: medido con EMG', async (page) => {
  const pasos = [
    { id: 'tendon_recto', nombre: 'Deslizamiento tendinoso: mano recta', tipo: null, medicion: { fuente: 'emg', musculo: 'flexores' }, repeticionesObjetivo: 10, repeticiones: 9, repeticionesManual: null, duracionS: 40, emg: { musculo: 'flexores', repeticiones: 9, activacionMedia: 280, activacionMax: 340 } },
    { id: 'nervio_mediano', nombre: 'Deslizamiento del nervio mediano', tipo: null, medicion: null, repeticionesObjetivo: 5, repeticiones: null, repeticionesManual: 5, duracionS: 30 },
  ];
  await importar(page, { sesion: { fecha: '2026-10-26', ejercicios: [], rutina: { etapa: 1, pasos } } });
  const etiqueta = await page.textContent('#lista-sesiones li[data-id] >> nth=0 >> .ses-medicion');
  afirmar(etiqueta.trim() === 'Medido con: EMG 1 · Manual 1', `etiqueta: ${etiqueta}`);
  const pdf = await descargarPdf(page, '#lista-sesiones li[data-id] >> nth=0 >> .btn-pdf');
  const texto = pdf.texto.replace(/\\([()])/g, '$1'); // el PDF escapa los paréntesis
  afirmar(texto.includes('Medido con') && texto.includes('EMG (flexores)') && texto.includes('Manual'), 'el PDF no dice con qué se midió cada paso');
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
