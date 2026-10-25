# Rutina de videos de ejercicios — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durante el monitoreo en vivo, el profesional abre una ventana emergente con la rutina de ejercicios: un video en bucle por ejercicio, con su nombre y botones Anterior / Siguiente, sobre la interfaz desenfocada.

**Architecture:** Un módulo puro `rutina.js` maneja la navegación (índice actual, límites) y es probado con `node --test`. La ventana es un `<dialog>` modal nuevo en `index.html` cuyo `::backdrop` desenfoca la interfaz; `rutina.js` también conecta el diálogo con el DOM. Los videos viven en `videos/<tipo>.mp4`, con `<tipo>` igual a las claves de `EJERCICIOS` en `data.js`.

**Tech Stack:** HTML/CSS/JS sin compilación (scripts clásicos con `<script src>`, igual que `app.js` y `monitoreo.js`), `<dialog>` nativo, Node 24 (`node --test`) solo para las pruebas.

**Spec:** El pedido del usuario (no hay documento aparte):
- Carpeta con videos de los ejercicios que se ven durante la conexión en vivo.
- Funciona como una rutina.
- El video es infinito (bucle).
- El cambio de ejercicio se hace con un botón; también hay botón para volver al ejercicio anterior.
- El ejercicio aparece nombrado.
- La rutina es un pop-up que cubre gran parte de la interfaz; la interfaz de atrás se pone borrosa.

Contexto: [prompts-videos-ejercicios.md](../../../prompts-videos-ejercicios.md) define cómo generar los videos (1:1, 1080×1080, 6–8 s, sin audio, `.mp4` H.264, `<video autoplay muted loop playsinline>`).

## Global Constraints

- Todo el texto visible en español, con el mismo tono que el resto de la interfaz.
- Sin dependencias nuevas ni paso de compilación. Los archivos se cargan con `<script src>` en `index.html`.
- Orden de la rutina = `ORDEN_EJERCICIOS` de `data.js`: `flexion`, `extension`, `desv_radial`, `desv_cubital`, `puno`. Nombre mostrado = `EJERCICIOS[tipo].nombre`.
- Ruta de cada video: `videos/<tipo>.mp4` (ej. `videos/flexion.mp4`).
- Video: `autoplay muted loop playsinline`, sin controles nativos.
- La rutina no se envuelve: en el primer ejercicio "Anterior" está deshabilitado; en el último, "Siguiente" está deshabilitado.
- La ventana ocupa `min(1100px, 94vw)` × `min(88vh, 860px)`; el fondo usa `backdrop-filter: blur(8px)`.
- Usar las variables de color existentes de `styles.css` (`--surface`, `--ink`, `--brand`, etc.) para que funcione en modo claro y oscuro.
- El proyecto **no es un repositorio git**: no hay pasos de commit. Al terminar cada tarea, guardar y seguir.
- Abrir la rutina no detiene ni modifica el monitoreo: la lectura del dispositivo y el ejercicio en curso siguen corriendo detrás.

## Review Focus

1. **Falta el archivo de video** (los videos todavía no están generados): la ventana muestra el nombre y un aviso "Video no disponible: videos/<tipo>.mp4", y los botones siguen funcionando. → prueba manual en la Tarea 2, paso 6.
2. **Clics rápidos o flechas del teclado en los extremos**: el índice nunca sale de 0…4. → `test('no pasa del último ni del primero')` en la Tarea 1.
3. **Cerrar con Esc, con el botón ✕ o con clic fuera**: el video se pausa (no sigue reproduciéndose oculto); al volver a abrir, arranca en el ejercicio seleccionado en "Ejercicio" del monitoreo. → Tarea 1 `indiceDe` + Tarea 2, paso 6.
4. **Pantalla de portátil 1366×768 y modo oscuro**: el video cabe sin barra de desplazamiento (`object-fit: contain`) y los colores siguen el tema. → Tarea 2, paso 7.
5. **Abrir la rutina con un ejercicio grabando**: el conteo sigue; al cerrar, la gráfica en vivo está al día. → Tarea 2, paso 6.

---

### Task 1: Módulo de navegación de la rutina

**Files:**
- Create: `interfaz-medico/rutina.js`
- Test: `interfaz-medico/tests/rutina.test.js`

**Interfaces:**
- Consumes: nada (recibe la lista de tipos como argumento; no lee globales en esta parte).
- Produces (usado por la Tarea 2, en el mismo archivo):
  - `crearRutina(tipos: string[], inicial = 0) -> { actual(): string, indice(): number, total(): number, siguiente(): string, anterior(): string, ir(i: number): string, hayAnterior(): boolean, haySiguiente(): boolean }` — `siguiente/anterior/ir` acotan el índice a `[0, total-1]` y devuelven el tipo actual; `inicial` fuera de rango se acota.
  - `rutaVideo(tipo: string) -> string` — `'videos/' + tipo + '.mp4'`.
  - `indiceDe(tipos: string[], tipo: string) -> number` — posición de `tipo`, o `0` si no está.
  - Al final del archivo: `if (typeof module !== 'undefined') module.exports = { crearRutina, rutaVideo, indiceDe };` (el navegador lo ignora).

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
// interfaz-medico/tests/rutina.test.js
const test = require('node:test');
const assert = require('node:assert');
const { crearRutina, rutaVideo, indiceDe } = require('../rutina.js');

const TIPOS = ['flexion', 'extension', 'desv_radial', 'desv_cubital', 'puno'];

test('empieza en el índice inicial', () => {
  const r = crearRutina(TIPOS, 2);
  assert.strictEqual(r.actual(), 'desv_radial');
  assert.strictEqual(r.indice(), 2);
  assert.strictEqual(r.total(), 5);
});

test('siguiente y anterior avanzan y retroceden', () => {
  const r = crearRutina(TIPOS);
  assert.strictEqual(r.siguiente(), 'extension');
  assert.strictEqual(r.siguiente(), 'desv_radial');
  assert.strictEqual(r.anterior(), 'extension');
});

test('no pasa del último ni del primero', () => {
  const r = crearRutina(TIPOS);
  assert.strictEqual(r.anterior(), 'flexion');
  assert.strictEqual(r.hayAnterior(), false);
  for (let i = 0; i < 10; i++) r.siguiente();
  assert.strictEqual(r.actual(), 'puno');
  assert.strictEqual(r.haySiguiente(), false);
  assert.strictEqual(r.hayAnterior(), true);
});

test('inicial e ir() fuera de rango se acotan', () => {
  assert.strictEqual(crearRutina(TIPOS, 99).actual(), 'puno');
  assert.strictEqual(crearRutina(TIPOS, -3).actual(), 'flexion');
  assert.strictEqual(crearRutina(TIPOS).ir(3), 'desv_cubital');
});

test('rutaVideo usa la carpeta videos', () => {
  assert.strictEqual(rutaVideo('flexion'), 'videos/flexion.mp4');
});

test('indiceDe devuelve 0 si el tipo no existe', () => {
  assert.strictEqual(indiceDe(TIPOS, 'puno'), 4);
  assert.strictEqual(indiceDe(TIPOS, 'otro'), 0);
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run (desde `interfaz-medico/`): `node --test tests/`
Expected: FAIL con `Cannot find module '../rutina.js'`

- [ ] **Step 3: Implementar `crearRutina`, `rutaVideo` e `indiceDe` en `interfaz-medico/rutina.js`**

Encabezado de comentario como en `monitoreo.js` (`/* Rutina de ejercicios en video … */`). Clausura con un índice entero acotado con `Math.min/Math.max`. Sin acceso al DOM en estas tres funciones.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `node --test tests/`
Expected: `# pass 6`, `# fail 0`

---

### Task 2: Ventana emergente de la rutina y carpeta de videos

**Files:**
- Create: `interfaz-medico/videos/LEEME.md`
- Modify: `interfaz-medico/rutina.js` (agregar la parte de interfaz)
- Modify: `interfaz-medico/index.html` (botón en la tarjeta "Paso 2 · En vivo", líneas ~519–531; nuevo `<dialog>` después de `#dlg-paciente`, línea ~596; nuevo `<script>` y símbolos de icono)
- Modify: `interfaz-medico/styles.css` (después del bloque `/* ===== Diálogo ===== */`, línea ~313)
- Modify: `interfaz-medico/README.md` (tabla "Qué incluye" y lista "Archivos")

**Interfaces:**
- Consumes: `crearRutina`, `rutaVideo`, `indiceDe` (Tarea 1); globales `EJERCICIOS`, `ORDEN_EJERCICIOS` (`data.js`); `$` (`app.js`); el `<select id="mv-ejercicio">` de `monitoreo.js`.
- Produces: `abrirRutina()`, `cerrarRutina()`, `initRutina()` en `rutina.js`; ids del DOM `#mv-rutina` (botón), `#dlg-rutina`, `#rt-video`, `#rt-nombre`, `#rt-paso`, `#rt-falta`, `#rt-anterior`, `#rt-siguiente`, `#rt-cerrar`.

- [ ] **Step 1: Crear la carpeta `videos/` con `LEEME.md`**

Contenido: lista de los 5 nombres de archivo esperados (`flexion.mp4`, `extension.mp4`, `desv_radial.mp4`, `desv_cubital.mp4`, `puno.mp4`), cada uno con su nombre en español; especificación (1:1, 1080×1080, 6–8 s, sin audio, H.264, empieza y termina en posición neutra); enlace a `../prompts-videos-ejercicios.md`. Una oración: para cambiar el orden de la rutina se cambia el orden de `EJERCICIOS` en `data.js`.

- [ ] **Step 2: Agregar el marcado en `index.html`**

- Símbolos nuevos en `<defs>`: `i-play` (triángulo), `i-chevron-left`, `i-chevron-right`, `i-x`, mismo trazo que los existentes.
- En la tarjeta "Paso 2", dentro de `.live-controls`, antes de `#mv-iniciar`: `<button class="btn" id="mv-rutina"><svg class="ic"><use href="#i-play"/></svg>Ver rutina</button>`. Siempre habilitado (no requiere conexión).
- Diálogo:

```html
<dialog id="dlg-rutina" class="dlg-rutina" aria-labelledby="rt-nombre">
  <div class="rt-head">
    <div>
      <div class="eyebrow" id="rt-paso">Ejercicio 1 de 5</div>
      <h2 id="rt-nombre"></h2>
    </div>
    <button class="btn btn-ghost rt-cerrar" id="rt-cerrar" aria-label="Cerrar rutina"><svg class="ic"><use href="#i-x"/></svg></button>
  </div>
  <div class="rt-media">
    <video id="rt-video" autoplay muted loop playsinline></video>
    <p class="rt-falta muted" id="rt-falta" hidden></p>
  </div>
  <div class="rt-nav">
    <button class="btn" id="rt-anterior"><svg class="ic"><use href="#i-chevron-left"/></svg>Anterior</button>
    <button class="btn btn-primary" id="rt-siguiente">Siguiente<svg class="ic"><use href="#i-chevron-right"/></svg></button>
  </div>
</dialog>
```

- `<script src="rutina.js"></script>` después de `monitoreo.js`.

- [ ] **Step 3: Agregar estilos en `styles.css`**

- `.dlg-rutina`: `width: min(1100px, 94vw); height: min(88vh, 860px); max-width: none; max-height: none; padding: 20px 24px;` y, cuando está abierto (`.dlg-rutina[open]`), `display: grid; grid-template-rows: auto 1fr auto; gap: 14px;`.
- `.dlg-rutina::backdrop`: `background: rgba(8, 40, 36, 0.45); backdrop-filter: blur(8px);`.
- `.rt-media`: `min-height: 0; border-radius: var(--radius); background: var(--surface-2); display: grid; place-items: center; overflow: hidden;` — `#rt-video`: `width: 100%; height: 100%; object-fit: contain;`.
- `#rt-nombre`: fuente `var(--font-serif)`, ~28px.
- `.rt-nav`: `display: flex; justify-content: space-between;`.
- En `@media (max-width: 640px)`: `padding: 14px`, `#rt-nombre` ~22px.

- [ ] **Step 4: Implementar la parte de interfaz en `rutina.js`**

- Variable de módulo `let rt = null;` con la rutina activa.
- `mostrarEjercicio()`: pone `EJERCICIOS[tipo].nombre` en `#rt-nombre`, `Ejercicio ${i+1} de ${n}` en `#rt-paso`, `#rt-video.src = rutaVideo(tipo)` y llama `play()` (ignorando el rechazo de la promesa); oculta `#rt-falta` y muestra el video; deshabilita `#rt-anterior` con `!rt.hayAnterior()` y `#rt-siguiente` con `!rt.haySiguiente()`.
- En el evento `error` de `#rt-video`: oculta el video y muestra `#rt-falta` con `Video no disponible: ${rutaVideo(tipo)}`.
- `abrirRutina()`: `rt = crearRutina(ORDEN_EJERCICIOS, indiceDe(ORDEN_EJERCICIOS, $('#mv-ejercicio').value))`, `mostrarEjercicio()`, `$('#dlg-rutina').showModal()`.
- `cerrarRutina()`: `$('#dlg-rutina').close()`.
- `initRutina()` en `DOMContentLoaded` (igual que `initMonitor`): botones `#mv-rutina`, `#rt-anterior`, `#rt-siguiente`, `#rt-cerrar`; teclas `ArrowLeft`/`ArrowRight` dentro del diálogo; clic sobre el propio `<dialog>` (fuera del contenido, `ev.target === dialog`) cierra; en el evento `close` del diálogo: `video.pause()`, `video.removeAttribute('src')`, `video.load()`.
- Envolver la parte de DOM con `if (typeof document !== 'undefined')` para que `node --test` siga cargando el archivo.

- [ ] **Step 5: Correr las pruebas de la Tarea 1**

Run: `node --test tests/`
Expected: `# pass 6`, `# fail 0`

- [ ] **Step 6: Verificar en el navegador**

`preview_start` con `{name: "interfaz-medico"}`, seleccionar un paciente, pestaña "Monitoreo en vivo". Copiar temporalmente cualquier `.mp4` corto a `videos/flexion.mp4` para la prueba (y borrarlo al final si no es un video real).
Expected:
- "Ver rutina" abre la ventana; la interfaz de atrás se ve borrosa; la ventana cubre la mayor parte de la pantalla.
- Con `#mv-ejercicio` en "Flexión de muñeca": título "Flexión de muñeca", "Ejercicio 1 de 5", el video se repite solo, "Anterior" deshabilitado.
- "Siguiente" ×4 → "Cierre de puño (MCF)", "Ejercicio 5 de 5", "Siguiente" deshabilitado; "Anterior" vuelve atrás. Las flechas del teclado hacen lo mismo.
- En los ejercicios sin archivo aparece "Video no disponible: videos/extension.mp4" y los botones siguen funcionando.
- Esc, ✕ y clic fuera cierran; tras cerrar, `document.querySelector('#rt-video').paused === true`.
- Con el simulador conectado, calibrado y un ejercicio iniciado: abrir y cerrar la rutina no detiene el conteo de repeticiones.
- `read_console_messages` sin errores.

- [ ] **Step 7: Verificar tamaño y tema**

`resize_window` a 1366×768 y a `mobile`: el video cabe sin desplazamiento dentro de la ventana. `colorScheme: "dark"`: fondo y texto siguen el tema. Volver a `preset: "desktop"`. Captura de pantalla como evidencia.

- [ ] **Step 8: Actualizar `README.md`**

En la fila "Monitoreo en vivo" de "Qué incluye", agregar: "Botón **Ver rutina**: ventana con el video en bucle de cada ejercicio, su nombre y botones Anterior / Siguiente." En "Archivos", agregar `rutina.js` (rutina de videos de ejercicios) y `videos/` (un `.mp4` por ejercicio, ver `videos/LEEME.md`). Agregar cómo correr las pruebas: `node --test tests/`.
