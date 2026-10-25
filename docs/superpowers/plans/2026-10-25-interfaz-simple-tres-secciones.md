# Interfaz simple en tres secciones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el panel sea agradable a la vista, muestre poca información a la vez, lo pueda usar alguien sin experiencia ("anti dummies") y separe el trabajo en tres secciones: **Ejercicios**, **Seguimiento** y **Reporte**.

**Architecture:** Se mantiene la app estática (HTML + JS sin módulos + Chart.js por CDN). Las 5 pestañas actuales se reemplazan por 3 secciones; Seguimiento tiene 3 vistas internas (Resumen, Una sesión, Comparar). Lo técnico o secundario queda plegado en `<details>` cerrados. Un módulo puro nuevo, `navegacion.js`, decide la ruta y el recorte de observaciones y se prueba con `node --test`. Una prueba de humo con Playwright (`tests/ui/humo.mjs`) comprueba la página real.

**Tech Stack:** HTML, CSS, JavaScript (navegador + Node 22 para pruebas), Chart.js 4.4.1, Playwright (preinstalado en el entorno de la nube).

**Spec:** No hay documento de diseño aparte. El pedido del usuario (2026-10-25): *"en este momento se siente muy saturada. Debemos hacer que sea más agradable a la vista y que no sature al usuario con tanta información. Debe ser anti dummies, además de separar procesos entre ejercicios, seguimiento y reporte."* Las decisiones de abajo concretan ese pedido.

## Decisiones de diseño (hacen de spec)

| Hoy | Después |
|---|---|
| 5 pestañas: Evolución, Detalle de sesión, Comparar, Historial y notas, Monitoreo en vivo | 3 secciones grandes con icono y subtítulo: **Ejercicios** ("Hacer la rutina con el paciente"), **Seguimiento** ("Ver cómo avanza"), **Reporte** ("Historial, notas y archivos") |
| Evolución + Detalle + Comparar | Seguimiento, con un selector pequeño: **Resumen · Una sesión · Comparar** |
| Historial y notas + botones Importar/Exportar/Restablecer de la barra superior | Reporte |
| Monitoreo en vivo (4 tarjetas: conexión, calibración, rutina, señal) | Ejercicios: 3 pasos numerados (1 Conectar, 2 Elegir fase, 3 Empezar). La calibración la hace "¿Listos para empezar?", que ya existe. Estadísticas, velocidad en baudios, botón Calibrar, lecturas y gráfica en vivo van dentro de `<details>` **"Datos técnicos del dispositivo"** |
| Encabezado grande (hero con degradado, 6 chips, anillo de progreso) + 5 KPIs encima de todo | Encabezado de una línea: nombre, "Mano derecha · 34 días desde la cirugía · Fase 2 sugerida" y `<details>` **"Ver ficha"** con el resto. Los KPIs pasan a Seguimiento › Resumen y son 3: **Avance**, **Dolor**, **Última sesión** |
| Observaciones: todas | Las 3 más importantes y un botón "Ver N más" |
| Gráfica de indicador con selector | Plegada en `<details>` **"Más indicadores"** |
| Tabla de sesión con 8 columnas | 4 columnas (Ejercicio, Repeticiones, Ángulo máx., Cambio) + botón "Mostrar todas las columnas" |
| 4–5 insignias de calidad siempre visibles | Una sola: "✓ Datos confiables" o los avisos que fallen (calibración, pérdida, simulador) |
| Pie con 4 "valores" e iconos | Solo el aviso legal, en una línea |

Reglas visuales: un solo botón primario por pantalla; texto base 15 px; sin degradados ni círculos decorativos; sombras suaves (solo `--shadow`); quitar `eyebrow` donde repite el título; textos en frases cortas y verbos ("Conecte el dispositivo", no "Conexión con el dispositivo").

Fuera de alcance: imprimir reporte, cambios en el firmware, el plan pendiente `2026-10-14-series-por-ejercicio-y-csv-rutina.md` y los videos que faltan.

## Global Constraints

- Trabajar en la rama `interfaz-simple` creada desde `main`; no hacer commits en `main`.
- Sin paso de compilación ni frameworks nuevos: los archivos se cargan con `<script src>` como hoy; los módulos puros exportan con `if (typeof module !== 'undefined') module.exports = {...}`.
- Todo texto visible en español, sin tecnicismos fuera de "Datos técnicos del dispositivo".
- Se conservan todos los `id` que usan `monitoreo.js` y `rutina.js` (`#mv-*`, `#rt-*`, `#ls-*`, `#fin-*`, `#dlg-*`), salvo `#tab-vivo-dot`, que pasa a llamarse `#nav-ejercicios-dot`.
- Modo claro y oscuro siguen funcionando (tokens de `:root` en `styles.css`).
- Ancho móvil (≤ 760 px): sin desplazamiento horizontal de la página.
- `node --test` debe seguir pasando (hoy 14 pruebas) en cada commit.
- Los datos guardados (`localStorage`, clave `rehabcarpo.db.v1`) no cambian de formato.

## Review Focus

1. **Paciente sin sesiones** (p. ej. recién creado): Seguimiento muestra "Aún no hay sesiones" con un botón "Ir a Ejercicios", sin gráficas vacías ni errores en consola. → prueba de humo en Task 3.
2. **Guardar una rutina** lleva a Seguimiento › Una sesión con esa sesión seleccionada (antes iba a la pestaña `sesion`). → prueba de humo en Task 4.
3. **Rutina en curso y cambio de sección:** con una grabación activa, el punto rojo aparece en el botón Ejercicios y `refrescar()` no actualiza la vista si la sección no es Ejercicios. → prueba de humo en Task 4.
4. **`<details>` con gráfica:** al abrir "Más indicadores" o "Ver señal del sensor" la gráfica se ve con tamaño correcto (no 0 px). → prueba de humo en Task 3.
5. **Navegador sin Web Serial (Firefox/Safari):** el paso 1 dice que se usará el simulador y el botón primario sigue siendo "Empezar rutina". → prueba de humo en Task 4 (Chromium sin `navigator.serial` simulado borrándolo con `addInitScript`).

---

### Task 1: `navegacion.js` (ruta y observaciones, sin DOM)

**Files:**
- Create: `navegacion.js`
- Create: `tests/navegacion.test.js`

**Interfaces:**
- Produces:
  - `SECCIONES: ['ejercicios', 'seguimiento', 'reporte']`
  - `VISTAS_SEGUIMIENTO: ['resumen', 'sesion', 'comparar']`
  - `normalizarRuta(ruta: {seccion?: string, vista?: string} | null) -> {seccion: string, vista: string}`: sección no válida → `'seguimiento'`; vista no válida → `'resumen'`. La vista se conserva aunque la sección no sea Seguimiento.
  - `seccionInicial(numSesiones: number) -> 'ejercicios' | 'seguimiento'`: `0` (o no numérico) → `'ejercicios'`.
  - `recortarObservaciones(obs: {nivel: 'critical'|'warning'|'info'|'good', texto: string}[], max = 3) -> {visibles: obs[], ocultas: obs[]}`: ordena por `critical, warning, info, good` (estable dentro del mismo nivel) y corta en `max`.

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/navegacion.test.js` (mismo estilo que `tests/rutinas.test.js`):

```js
const { SECCIONES, VISTAS_SEGUIMIENTO, normalizarRuta, seccionInicial, recortarObservaciones } = require('../navegacion.js');

test('secciones y vistas', () => {
  assert.deepStrictEqual(SECCIONES, ['ejercicios', 'seguimiento', 'reporte']);
  assert.deepStrictEqual(VISTAS_SEGUIMIENTO, ['resumen', 'sesion', 'comparar']);
});
test('normalizarRuta corrige valores no válidos', () => {
  assert.deepStrictEqual(normalizarRuta(null), { seccion: 'seguimiento', vista: 'resumen' });
  assert.deepStrictEqual(normalizarRuta({ seccion: 'vivo' }), { seccion: 'seguimiento', vista: 'resumen' });
  assert.deepStrictEqual(normalizarRuta({ seccion: 'reporte', vista: 'x' }), { seccion: 'reporte', vista: 'resumen' });
  assert.deepStrictEqual(normalizarRuta({ seccion: 'seguimiento', vista: 'comparar' }), { seccion: 'seguimiento', vista: 'comparar' });
});
test('seccionInicial', () => {
  assert.strictEqual(seccionInicial(0), 'ejercicios');
  assert.strictEqual(seccionInicial(undefined), 'ejercicios');
  assert.strictEqual(seccionInicial(4), 'seguimiento');
});
test('recortarObservaciones ordena por gravedad y corta', () => {
  const o = (nivel, texto) => ({ nivel, texto });
  const r = recortarObservaciones([o('good', 'g'), o('info', 'i1'), o('critical', 'c'), o('warning', 'w'), o('info', 'i2')]);
  assert.deepStrictEqual(r.visibles.map((x) => x.texto), ['c', 'w', 'i1']);
  assert.deepStrictEqual(r.ocultas.map((x) => x.texto), ['i2', 'g']);
  assert.deepStrictEqual(recortarObservaciones([], 3), { visibles: [], ocultas: [] });
});
```

- [ ] **Step 2: Correr y ver que falla.** `node --test` → FAIL con `Cannot find module '../navegacion.js'`.
- [ ] **Step 3: Implementar `navegacion.js`** con las firmas de arriba y el `module.exports` condicional.
- [ ] **Step 4: Correr.** `node --test` → 18 pruebas, 0 fallas.
- [ ] **Step 5: Commit.** `git add navegacion.js tests/navegacion.test.js && git commit -m "Agrega navegacion.js: rutas de tres secciones y recorte de observaciones"`

---

### Task 2: Estructura en tres secciones y prueba de humo

**Files:**
- Modify: `index.html` (barra superior 52-70, encabezado/KPIs/pestañas 94-107, envolver paneles 109-324, pie 327-338; añadir `<script src="navegacion.js">` antes de `app.js`)
- Modify: `app.js` (`estado` 5-16, `renderTab` 268-278, eventos 730 y 742-747, `init` 799-801)
- Modify: `monitoreo.js:451` (`estado.tab = 'sesion'`), `monitoreo.js:575` (`#tab-vivo-dot`), `monitoreo.js:605` (`estado.tab !== 'vivo'`)
- Modify: `styles.css` (`.tabs/.tab` 215-228 → `.nav-secciones`, `.footer/.values` 300-308)
- Modify: `.gitignore` (añadir `node_modules/`)
- Create: `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: `normalizarRuta`, `seccionInicial` (Task 1).
- Produces:
  - `estado.seccion` y `estado.vista` reemplazan a `estado.tab`.
  - `irA(seccion: string, vista?: string) -> void` en `app.js`: normaliza, guarda en `estado` y llama `renderSeccion()`. Todo cambio de sección pasa por aquí.
  - `renderSeccion() -> void` reemplaza a `renderTab()` (mismo papel). Dentro de Seguimiento llama a `renderEvolucion` / `renderSesion` / `renderComparar` según `estado.vista`; Reporte llama a `renderHistorial`; Ejercicios a `renderMonitor`.
  - Marcado: `<nav class="nav-secciones">` con 3 `<button class="nav-seccion" data-seccion="...">` (icono, título, subtítulo `<small>`); `<section class="seccion" data-seccion="...">`; dentro de Seguimiento, `<div class="seg" id="seg-vistas">` con `<button class="seg-btn" data-vista="...">` y `<div class="vista" data-vista="...">` que envuelven los paneles actuales `evolucion`, `sesion`, `comparar`.
  - `tests/ui/humo.mjs`: sirve la carpeta con `node:http` en un puerto libre, abre Chromium, redirige `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/**` a `node_modules/chart.js/dist/chart.umd.min.js` si existe (si no, deja pasar la petición) y aborta `fonts.googleapis.com`/`fonts.gstatic.com`. Cada comprobación es `await verificar('nombre', async (page) => {...})`; imprime `✓`/`✗` por comprobación, falla con código 1 si alguna falla o si hubo un error en la consola de la página. Las tareas siguientes solo añaden llamadas a `verificar`.

- [ ] **Step 1: Escribir la prueba de humo que falla** (`tests/ui/humo.mjs`) con estas comprobaciones:
  - `'tres secciones'`: `.nav-seccion` tiene 3 botones con textos `Ejercicios`, `Seguimiento`, `Reporte`.
  - `'arranca en seguimiento'`: el primer paciente de la demo tiene sesiones → `.nav-seccion[data-seccion="seguimiento"]` tiene `aria-current="page"` y solo `section.seccion[data-seccion="seguimiento"]` es visible.
  - `'cambiar a reporte'`: clic en Reporte → `#tabla-historial` visible.
  - `'barra superior limpia'`: `.topbar button` cuenta 0.
- [ ] **Step 2: Preparar y correr.** `npm i --no-save chart.js@4.4.1 && node tests/ui/humo.mjs` → falla `'tres secciones'`.
- [ ] **Step 3: Cambiar el HTML.** Barra superior: solo la marca (sin `.topbar-note` ni `.topbar-actions`). Los botones `#btn-importar`, `#btn-exportar`, `#btn-reset` y `#file-input` se mueven tal cual al final de la sección Reporte (mismos `id`, así sus eventos siguen funcionando; Task 5 los ordena y les cambia el texto). Quitar `#kpis` y `.tabs`. Añadir la navegación y las 3 secciones envolviendo los paneles existentes: Ejercicios ← panel `vivo`; Seguimiento ← `evolucion` (vista `resumen`), `sesion`, `comparar`; Reporte ← `historial`. Pie: solo `<p class="disclaimer">`. El punto en vivo pasa a `<span class="live-dot" id="nav-ejercicios-dot" hidden>` dentro del botón Ejercicios.
- [ ] **Step 4: Cambiar `app.js` y `monitoreo.js`.** `estado.seccion`/`estado.vista` en lugar de `tab`; `irA` y `renderSeccion`; el botón "Ver detalle" del historial llama `irA('seguimiento', 'sesion')`; `init` usa `seccionInicial(sesiones del primer paciente)`. En `monitoreo.js`: línea 451 → `estado.seccion = 'seguimiento'; estado.vista = 'sesion';`, línea 575 → `#nav-ejercicios-dot`, línea 605 → `estado.seccion !== 'ejercicios'`. `renderKPIs` deja de llamarse (se rehace en Task 3).
- [ ] **Step 5: Estilos.** `.nav-secciones`: rejilla de 3 columnas iguales (1 columna < 760 px), botones grandes (padding 14 px 18 px) con icono, título 15 px peso 700 y `<small>` en `--muted`; el activo con borde y fondo `--brand-soft` (no relleno sólido). Borrar `.tabs`, `.tab`, `.values`, `.value`, `.topbar-note`, `.topbar-actions`.
- [ ] **Step 6: Correr.** `node --test` → 18 pass; `node tests/ui/humo.mjs` → 4 ✓, 0 ✗.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "Reorganiza la interfaz en Ejercicios, Seguimiento y Reporte"`

---

### Task 3: Seguimiento simple (encabezado, 3 tarjetas, observaciones, plegables)

**Files:**
- Modify: `index.html` (`#encabezado`, vista `resumen`, vista `sesion`)
- Modify: `app.js` (`renderEncabezado` 179-213, `renderKPIs` 223-265, `renderEvolucion` 281-378, `renderObservaciones` 380-434, `renderSesion` 441-520)
- Modify: `styles.css` (`.hero*`, `.ring*`, `.chip*`, `.kpis/.kpi*`)
- Test: `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: `recortarObservaciones` (Task 1), `irA`, `renderSeccion` (Task 2), `etapaSugerida(fechaCirugiaISO, hoyISO)` (`rutinas.js`).
- Produces: `renderResumen(p)` (sustituye a `renderKPIs`, pinta `#resumen-tarjetas` dentro de la vista `resumen`); `renderObservaciones` sigue con la misma firma pero muestra `visibles` y un botón `#obs-mas` "Ver N más" que despliega `ocultas`.

- [ ] **Step 1: Añadir comprobaciones de humo que fallan:**
  - `'encabezado compacto'`: `#encabezado` contiene el texto `días desde la cirugía` y `Fase`; `#encabezado details summary` dice `Ver ficha`; no existe `.ring`.
  - `'tres tarjetas'`: `#resumen-tarjetas > *` cuenta 3 y sus títulos son `Avance`, `Dolor`, `Última sesión`.
  - `'máximo 3 observaciones'`: `#observaciones > li.obs` cuenta ≤ 3.
  - `'paciente sin sesiones'`: crear paciente desde `#btn-nuevo` (llenar nombre, documento, edad, fecha de cirugía, Guardar), ir a Seguimiento → se ve el texto `Aún no hay sesiones` y un botón `Ir a Ejercicios`; al pulsarlo, la sección Ejercicios queda activa; no hay errores en consola.
  - `'gráfica plegada con tamaño'`: abrir `details#mas-indicadores` → el `canvas#chart-ind` mide > 100 px de alto.
  - `'tabla de sesión corta'`: vista Una sesión → `#tabla-ejercicios thead th:not(.col-extra)` cuenta 4; tras clic en `#btn-columnas` las columnas `.col-extra` se ven.
- [ ] **Step 2: Correr** `node tests/ui/humo.mjs` → fallan las 6 nuevas.
- [ ] **Step 3: Encabezado.** `renderEncabezado(p)` pinta: nombre (24 px, 700), línea `Mano <mano> · <N> días desde la cirugía · Fase <etapaSugerida> sugerida`, y `<details><summary>Ver ficha</summary>` con documento, edad, sexo, fecha de cirugía, ocupación y profesional como lista simple `dl`. Sin degradado ni anillo.
- [ ] **Step 4: Resumen.** `renderResumen(p)`: tres tarjetas — **Avance**: `progresoGlobal(última)` en % con "+X puntos desde la primera sesión"; **Dolor**: EVA de la última sesión `/10` con cambio vs. anterior (bajar es bueno); **Última sesión**: fecha corta y "hace N días". Si el paciente no tiene sesiones, la vista Resumen (y Una sesión/Comparar) muestran un único bloque vacío: "Aún no hay sesiones. Haga la primera rutina en Ejercicios." + botón primario "Ir a Ejercicios" (`irA('ejercicios')`), y no se crean gráficas.
- [ ] **Step 5: Plegables de Resumen.** Texto de la gráfica principal: título "¿Cuánto mueve la muñeca?" y una línea "Ángulo máximo de cada ejercicio en cada sesión". El selector de indicador y `#chart-ind` van en `<details id="mas-indicadores"><summary>Más indicadores</summary>`; la gráfica se crea en el evento `toggle` cuando `open` es verdadero (no al pintar la sección). Observaciones con `recortarObservaciones(obs, 3)` y botón `#obs-mas`; quitar el párrafo largo bajo el título y dejar: "Avisos automáticos. No son un diagnóstico."
- [ ] **Step 6: Una sesión.** Tabla con 4 columnas visibles; % referencia, velocidad, variabilidad y duración llevan `class="col-extra"` (ocultas por CSS salvo con `.tabla-completa` en la tabla), botón `#btn-columnas` "Mostrar todas las columnas" / "Mostrar menos". Insignias: una sola `✓ Datos confiables` si calibración OK y pérdida < 1 % y origen no simulador; si no, solo las que fallan (`Calibración lenta (X s)`, `Se perdieron datos (X %)`, `Datos del simulador`). Dolor y cumplimiento salen de las insignias (ya están en Resumen). La tarjeta de señal (`#sesion-senal`) pasa a `<details><summary>Ver señal del sensor</summary>`, con la gráfica creada en `toggle`.
- [ ] **Step 7: Estilos.** Borrar `.hero*`, `.ring*`, `.hero-card*`, `.chip*`, `.kpi .icon-bubble`; tarjetas del resumen en rejilla `repeat(3, 1fr)` (1 columna < 760 px), valor 30 px peso 800, sin `transform` en hover. `body` a 15 px; `.muted` a 14 px.
- [ ] **Step 8: Correr.** `node --test` → 18 pass; `node tests/ui/humo.mjs` → 10 ✓.
- [ ] **Step 9: Commit.** `git add -A && git commit -m "Simplifica Seguimiento: encabezado compacto, tres tarjetas y detalles plegados"`

---

### Task 4: Ejercicios en 3 pasos

**Files:**
- Modify: `index.html` (sección Ejercicios, hoy líneas 243-324)
- Modify: `rutina.js` (`renderTarjetaRutina` 69-89)
- Modify: `monitoreo.js` (`renderMonitorControles` 559-590: textos del paso 1)
- Modify: `styles.css` (`.live-top`, `.card-mint`, `.rt-tarjeta-grid`, `.rt-pasos`)
- Test: `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: `irA` (Task 2); `abrirListos`, `abrirRevision`, `etapaElegida` (`rutina.js`); `alternarConexion`, `estadoDispositivo()` (`monitoreo.js`).
- Produces: marcado `<ol class="pasos-guia">` con 3 `<li class="paso-guia" data-paso="1|2|3">`; `#det-tecnicos` (`<details>`) contiene `#mv-baud-wrap`, `#mv-origen`, `#mv-calibrar`, `#mv-cal`, `#mv-stats`, `#mv-lecturas` y `#chart-vivo`.

- [ ] **Step 1: Añadir comprobaciones de humo que fallan:**
  - `'tres pasos'`: `.paso-guia` cuenta 3 con títulos `Conecte el dispositivo`, `Elija la fase`, `Empiece la rutina`; `#rt-iniciar` es el único `.btn-primary` visible en la sección.
  - `'técnicos plegados'`: `#det-tecnicos` existe, sin atributo `open`, y contiene `#chart-vivo` y `#mv-stats`.
  - `'sin web serial'`: con `addInitScript(() => { delete Navigator.prototype.serial; })`, el paso 1 muestra `se usará el simulador`.
  - `'rutina completa con simulador'`: Ejercicios → `#rt-iniciar` → esperar `#ls-empezar` habilitado (≤ 35 s) → clic → durante la grabación `#nav-ejercicios-dot` visible → pulsar `#rt-siguiente` hasta "Terminar rutina" y aceptarlo (`page.on('dialog', d => d.accept())`) → `#fin-guardar` → la sección activa es Seguimiento y la vista es `sesion`, y `#sesion-select` tiene seleccionada la sesión nueva (la de fecha de hoy).
- [ ] **Step 2: Correr** → fallan las 4 nuevas.
- [ ] **Step 3: HTML.** Paso 1 "Conecte el dispositivo": estado (`#mv-estado`) y botón `#mv-conectar` (no primario, `.btn`); texto de ayuda "Si no hay dispositivo, la rutina usa el simulador." Paso 2 "Elija la fase": `#rt-etapas` y una línea con `#rt-etapa-titulo` + `#rt-etapa-sug`; el detalle (`#rt-pasos`, `#rt-cuidado-gral`, `#rt-etapa-desc`) va en `<details><summary>Ver los ejercicios de esta fase</summary>` junto a `#rt-revisar` ("Ver videos"). Paso 3 "Empiece la rutina": `#rt-iniciar` (primario, grande) y la frase "Antes de empezar se calibra solo: mano quieta y en posición neutra." Al final, `<details id="det-tecnicos"><summary>Datos técnicos del dispositivo</summary>` con origen, velocidad, calibrar, estadísticas, lecturas y gráfica en vivo. Quitar las tarjetas "Calibración inicial" y "Señal en vivo" como tarjetas sueltas y el texto `#mv-ej-ayuda`.
- [ ] **Step 4: JS.** `renderMonitorControles`: cuando no hay Web Serial, el texto del paso 1 es "Este navegador no puede conectar el dispositivo: se usará el simulador." (reemplaza a `#mv-soporte`). La gráfica en vivo se crea en el `toggle` de `#det-tecnicos` si no existe (`mv.chart` nulo) y `actualizarChartVivo` no hace nada mientras el `<details>` está cerrado.
- [ ] **Step 5: Estilos.** `.pasos-guia`: lista vertical, cada paso con círculo numerado 32 px (`--brand-soft`, número en `--brand-text`), título 16 px 700 y cuerpo debajo; separación 20 px. Borrar `.live-top`, `.card-mint`, `.rt-tarjeta-grid` si quedan sin uso.
- [ ] **Step 6: Correr.** `node --test` → 18 pass; `node tests/ui/humo.mjs` → 14 ✓.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "Ejercicios en tres pasos y datos técnicos plegados"`

---

### Task 5: Reporte (historial, notas y archivos)

**Files:**
- Modify: `index.html` (sección Reporte)
- Modify: `app.js` (`renderHistorial` 605-635, eventos de archivos 763-780)
- Modify: `README.md` (tabla "Qué incluye" y sección "Monitoreo en vivo": nombres de secciones y ubicación de botones)
- Test: `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: `irA` (Task 2), `exportarCSV`, `importarJSON`, `descargar`, `generarDemo` (sin cambios).
- Produces: botones `#btn-csv` "Tabla para Excel (este paciente)", `#btn-exportar` "Copia de seguridad (todos los pacientes)", `#btn-importar` "Cargar archivo de sesión", `#btn-reset` "Restablecer datos de demostración" (este último dentro de `<details><summary>Opciones de prueba</summary>`).

- [ ] **Step 1: Añadir comprobaciones de humo que fallan:**
  - `'historial corto'`: `#tabla-historial thead th` cuenta 7 con textos `#`, `Fecha`, `Días desde la cirugía`, `Cumplimiento`, `Dolor`, `Nota`, `` (vacío, para "Ver").
  - `'archivos en reporte'`: `#btn-csv`, `#btn-exportar`, `#btn-importar` visibles en la sección Reporte; `#btn-reset` existe dentro de un `<details>` cerrado.
  - `'ver detalle'`: clic en el primer `.btn-ver` → sección Seguimiento, vista `sesion`.
  - `'csv descarga'`: clic en `#btn-csv` produce una descarga cuyo nombre termina en `_sesiones.csv`.
- [ ] **Step 2: Correr** → fallan las nuevas.
- [ ] **Step 3: HTML y JS.** Reporte en este orden: tarjeta **Historial** (tabla de 7 columnas; la columna Nota muestra "Sí" en vez del emoji; una sesión con pérdida ≥ 1 % o calibración fallida lleva `⚠` junto a la fecha con `title` explicándolo), tarjeta **Notas de la sesión** (igual que hoy), tarjeta **Archivos** con los cuatro botones de arriba y una línea de ayuda debajo de cada uno. Ajustar `renderHistorial` (la nota se actualiza en la celda 6, no en la 10, en el temporizador de `#nota`).
- [ ] **Step 4: README.** Cambiar los nombres de pestañas por las tres secciones y la ubicación de Importar/Exportar; mencionar `node tests/ui/humo.mjs` (requiere `npm i --no-save chart.js@4.4.1` sin internet al CDN).
- [ ] **Step 5: Correr.** `node --test` → 18 pass; `node tests/ui/humo.mjs` → 18 ✓.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Reporte: historial simple, notas y archivos en un solo lugar"`

---

### Task 6: Pulido visual y revisión en móvil y modo oscuro

**Files:**
- Modify: `styles.css`
- Test: `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: todo el marcado de Tasks 2–5.

- [ ] **Step 1: Añadir comprobaciones de humo que fallan:**
  - `'móvil sin scroll horizontal'`: viewport 390×844, en cada sección `document.documentElement.scrollWidth <= 390`.
  - `'un primario por sección'`: en cada sección visible, `.btn-primary:visible` cuenta ≤ 1 (excluye diálogos).
  - `'modo oscuro'`: `emulateMedia({ colorScheme: 'dark' })` → el color de fondo de `body` no es blanco (`rgb(255, 255, 255)`).
- [ ] **Step 2: Correr** → anotar cuáles fallan.
- [ ] **Step 3: CSS.** Quitar reglas sin uso (buscar cada clase con `grep` en `index.html`, `app.js`, `monitoreo.js`, `rutina.js` antes de borrarla); `--shadow-lg` solo en diálogos; `.btn-primary` sin `transform` ni sombra de color; `.eyebrow` solo en diálogos; espaciado vertical entre tarjetas 20 px; ajustar lo que haga fallar las comprobaciones del Step 1.
- [ ] **Step 4: Capturas.** Añadir a `humo.mjs` la opción `--capturas <carpeta>` que guarda una captura de cada sección en escritorio (1366×900) y móvil (390×844); revisarlas a ojo.
- [ ] **Step 5: Correr.** `node --test` → 18 pass; `node tests/ui/humo.mjs` → 21 ✓.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Pulido visual: menos sombras, un primario por pantalla, móvil y modo oscuro"`
