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
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.json': 'application/json' };

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

async function nuevaPagina({ viewport = { width: 1366, height: 900 }, init } = {}) {
  const ctx = await navegador.newContext({ viewport, acceptDownloads: true });
  if (init) await ctx.addInitScript(init);
  await ctx.route('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/**', (r) =>
    fs.existsSync(CHART_LOCAL) ? r.fulfill({ path: CHART_LOCAL, contentType: 'text/javascript' }) : r.continue());
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.errores = [];
  page.on('pageerror', (e) => page.errores.push(e.message));
  // Los 404 se revisan por URL: los videos que faltan son esperados ("Video no adjuntado").
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::|Failed to load resource/.test(m.text())) page.errores.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('.mp4')) page.errores.push(`${r.status()} ${r.url()}`); });
  page.on('dialog', (d) => d.accept());
  page.setDefaultTimeout(10000);
  await page.goto(URL_APP);
  await page.waitForSelector('.patient-item');
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
  afirmar(await page.locator('.topbar button').count() === 0, 'hay botones en la barra superior');
});

/* ---------- Seguimiento ---------- */
await verificar('encabezado compacto', async (page) => {
  const txt = await page.textContent('#encabezado');
  afirmar(txt.includes('días desde la cirugía') && /Fase \d/.test(txt), `encabezado: ${txt.trim().slice(0, 80)}`);
  afirmar((await page.textContent('#encabezado details summary')).trim() === 'Ver ficha', 'sin "Ver ficha"');
  afirmar(await page.locator('.ring').count() === 0, 'sigue el anillo');
});

await verificar('tres tarjetas', async (page) => {
  const titulos = await page.$$eval('#resumen-tarjetas > *', (ts) => ts.map((t) => t.querySelector('.kpi-label').textContent.trim()));
  afirmar(JSON.stringify(titulos) === JSON.stringify(['Avance', 'Dolor', 'Última sesión']), `tarjetas: ${titulos}`);
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

await verificar('rutina completa con simulador', async (page) => {
  await irEjercicios(page);
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

await navegador.close();
servidor.close();
console.log(fallas ? `\n${fallas} comprobación(es) fallida(s)` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
