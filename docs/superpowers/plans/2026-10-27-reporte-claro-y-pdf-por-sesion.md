# Reporte claro y PDF por sesión — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la sección **Reporte** le diga al profesional, en palabras y con colores, cómo va el paciente (no solo números), muestre las sesiones como una línea de tiempo fácil de leer y permita **descargar un PDF de cada sesión**.

**Architecture:** Dos módulos nuevos con funciones puras probadas en Node: `reporte.js` (lecturas en lenguaje simple con semáforo, más el pintado de la sección) y `reporte-pdf.js` (datos del informe de una sesión, limpieza de texto para el PDF y generación con jsPDF). jsPDF 2.5.1 se carga desde el CDN **solo al pulsar "Descargar PDF"**, como Chart.js. La tabla del historial se reemplaza por una línea de tiempo de tarjetas; notas y archivos se mantienen.

**Tech Stack:** HTML/CSS/JS sin compilación, Chart.js 4.4.1, jsPDF 2.5.1 (`https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js`), `node --test`, Playwright (`tests/ui/humo.mjs`).

**Spec:** Pedido del usuario (2026-10-27): "mejorar la tab de reporte, no solo ver números sino algo más fácil de entender para el profesional, y que también pueda descargar el reporte de cada sesión"; respuesta: **PDF directo**. La sección siguiente lo concreta y hace de spec.

## Decisiones de diseño (hacen de spec)

**Reporte, de arriba abajo:**

1. **"Lectura rápida"** (tarjeta nueva): una frase general y 4 áreas con semáforo (círculo de color + palabra + una frase):

   | Área | 🟢 Bien | 🟡 Atención | 🔴 Revisar | ⚪ Sin datos |
   |---|---|---|---|---|
   | **Movimiento** | % de lo normal (promedio de la última sesión) subió ≥ 5 puntos desde la primera | ni bien ni revisar | algún ejercicio bajó > 8 % frente a la sesión anterior | sin ejercicios medidos |
   | **Dolor** (EVA de la última sesión) | ≤ 3 | 4–6 | ≥ 7 o subió ≥ 2 frente a la anterior | sin dolor registrado |
   | **Músculo** (índice del nervio mediano) | ≥ 105 % | ni bien ni revisar | bajó > 15 % frente a la prueba anterior | sin prueba EMG |
   | **Constancia** | última sesión hace ≤ 10 días y sin cita vencida | hace 11–21 días o cita vencida | hace > 21 días | sin sesiones |

   Frases (exactas, con los valores reales):
   - Movimiento: "Mueve la muñeca al {pct} % de lo normal ({±x} puntos desde la primera sesión)." / sin datos: "Aún no hay ejercicios medidos."
   - Dolor: "Dolor {d}/10 en la última sesión (al inicio: {d0}/10)." / sin datos: "Aún no hay dolor registrado."
   - Músculo: "Índice del nervio mediano: {i} % de la primera prueba." / sin datos: "Sin prueba EMG (empieza en la Fase 2)."
   - Constancia: "{n} sesiones; la última hace {d} días." + " Próxima cita: {fecha}." si hay / sin sesiones: "Aún no hay sesiones."
   - Frase general: todas 🟢/⚪ → "Va bien."; alguna 🔴 → "Revisar: {áreas en rojo, en minúscula, separadas por coma}."; si no → "Va avanzando; atención en {áreas en amarillo}."
   - Pie: "Lectura orientativa calculada con los datos registrados. No es un diagnóstico."
2. **"Sesiones"** (reemplaza la tabla): una tarjeta por sesión, la más reciente arriba: fecha y "Sesión N · Fase F" (o "Sin rutina" si no la tiene); 3 chips de semáforo de **esa sesión frente a la anterior** — Movimiento (sube/igual/baja), Dolor (antes → después si hay chequeo; si no, el EVA), Músculo (si hay prueba) —; la primera frase de `comparacionConAnterior`; marcas pequeñas "⚠ datos" (pérdida ≥ 1 % o calibración fallida) y "Simulador"; botones **"Ver detalle"** (Seguimiento › Una sesión), **"Notas"** (selecciona la sesión para la tarjeta de notas, que queda igual) y **"Descargar PDF"**.
3. **Notas de la sesión** (igual que hoy, para la sesión seleccionada).
4. **Archivos** (igual que hoy).

Sin sesiones: la lectura muestra las 4 áreas ⚪ y la lista "Aún no hay sesiones." sin botones.

**PDF de una sesión** (`<id paciente>_sesion_<fecha>.pdf`; si hay dos sesiones el mismo día, `_2`, `_3` según el orden): A4 vertical, márgenes 15 mm, Helvetica.
- Encabezado: "Kinemo · Reporte de sesión", paciente (nombre, ID, mano, fecha de cirugía), sesión (fecha, número, fase, días post-op, duración, origen USB/simulador), profesional de la sesión de demostración y fecha de generación.
- **Lectura de la sesión**: los 3 chips de esa sesión como líneas "Movimiento: sube" etc. y las frases de `comparacionConAnterior`.
- **Chequeo de seguridad** (si hay): dolor antes, hormigueo, herida, recomendación y "continuó bajo criterio" si aplica.
- **Ejercicios medidos**: tabla Ejercicio · Repeticiones (detectadas/manual/objetivo) · Ángulo máx. · Cambio vs. anterior · % de lo normal.
- **Gráfica**: ángulo máximo por sesión hasta esta (Chart.js en un canvas fuera de pantalla → PNG → `addImage`).
- **Rutina grabada** (si hay): paso · objetivo · detectadas · manual.
- **Prueba de fuerza muscular** (si hay): 3 músculos con picos, promedio, % de la primera prueba, índice del nervio mediano y co-contracción.
- **Avisos** de esa sesión (los de `calcularObservaciones` calculados con las sesiones hasta esa).
- **Notas** del profesional (texto completo, con salto de página si hace falta) y **Próxima cita** del paciente.
- Pie en cada página: "Kinemo · Prototipo académico. No es un dispositivo médico certificado. — Página X de N".
- El texto pasa por `textoPdf` (Helvetica solo tiene Latin-1): `→`→`->`, `≥`→`>=`, `≤`→`<=`, `–`/`—`→`-`, `…`→`...`, `✓`→`OK`, `⚠`→`!`; las tildes y la ñ se conservan.
- Si jsPDF no carga (sin internet): toast "No se pudo generar el PDF: revise la conexión a internet." y nada más.

Fuera de alcance: PDF de todo el historial, enviar el PDF por correo, firmas.

## Global Constraints

- Rama `reporte-claro` desde `main`.
- Umbrales iguales a los existentes (ROM > 8 %, dolor sube ≥ 2, índice > 15 %, 10 días) más los nuevos de la tabla (5 puntos, EVA ≤ 3 / 4–6 / ≥ 7, índice ≥ 105 %, 21 días).
- Las funciones puras reciben `hoy` (ISO) cuando dependen de la fecha.
- jsPDF solo se pide al descargar (`cargarJsPdf()` cachea la promesa); las pruebas de navegador sirven una copia local `node_modules/jspdf/dist/jspdf.umd.min.js` (descargada del registro npm, como Chart.js).
- Todo texto de datos va con `esc()` en HTML.
- `node --test` y `node tests/ui/humo.mjs` en verde en cada commit.

## Review Focus

1. **Paciente sin sesiones:** Reporte muestra la lectura ⚪ y "Aún no hay sesiones." sin botones ni errores. → Task 2 `'reporte: sin sesiones'`.
2. **Sesión sin ejercicios medidos, sin EMG, sin chequeo ni rutina** (importada o antigua): las lecturas y el PDF salen con "—" o sin esa sección, sin errores. → Task 1 prueba `datos mínimos`, Task 3 prueba `datosReporteSesion mínima` y `'pdf: sesión importada'`.
3. **Sin internet al descargar:** mensaje claro, sin errores en consola más allá del recurso que no cargó. → Task 3 `'pdf: sin conexión'`.
4. **Notas largas y nombres con tildes:** el PDF parte el texto en varias páginas y conserva "Andrés", "ñ". → Task 3 `textoPdf` y `'pdf: notas largas'` (páginas ≥ 2).
5. **Dos sesiones el mismo día:** nombres de archivo distintos. → Task 3 `nombreArchivoPdf`.

---

### Task 1: `reporte.js` — lecturas en lenguaje simple (sin DOM)

**Files:**
- Create: `reporte.js`, `tests/reporte.test.js`

**Interfaces:**
- Consumes: `EJERCICIOS` (data.js), `lineaBase`, `medidasEmg` (emg.js), `comparacionConAnterior` (resumen-sesion.js) — globales en el navegador, `require` en Node (mismo patrón que `resumen-sesion.js`).
- Produces:
  - `ESTADOS = ['bien', 'atencion', 'revisar', 'sin-datos']`
  - `lecturaPaciente(p, hoy) -> { general: string, areas: { id: 'movimiento'|'dolor'|'musculo'|'constancia', titulo, estado, frase }[] }` (orden fijo de las 4 áreas; títulos "Movimiento", "Dolor", "Músculo", "Constancia").
  - `lecturaSesion(p, s) -> { chips: { id, titulo, estado, texto }[], frase: string }` — chips: movimiento (`'Sube'`/`'Igual'`/`'Baja'`, bien/atencion/revisar; sin anterior o sin medidos → sin-datos `'—'`), dolor (`'5 → 3'` si hay chequeo, si no `'3/10'`; estado por el EVA final con los umbrales de la tabla), músculo (solo si la sesión tiene prueba: `'124 %'`, estado por la tabla). `frase` = primera frase de `comparacionConAnterior(p, s)`.
  - `porcentajeNormal(s) -> number | null` — promedio de `min(100, anguloMax / ref × 100)` de los ejercicios medidos.

- [ ] **Step 1: Pruebas que fallan** (`tests/reporte.test.js`), con un paciente armado en la prueba (flexión 40° → 56°, ref 80 = 50 % → 70 %; dolor 7 → 3; EMG índice 100 → 124; última sesión hace 3 días; próxima cita futura):
  - `lecturaPaciente(p, hoy).areas.map((a) => a.estado)` → `['bien', 'bien', 'bien', 'bien']` y `general === 'Va bien.'`; frase de movimiento `'Mueve la muñeca al 70 % de lo normal (+20 puntos desde la primera sesión).'`; de dolor `'Dolor 3/10 en la última sesión (al inicio: 7/10).'`.
  - Dolor final 5 → dolor `atencion` y `general === 'Va avanzando; atención en dolor.'`.
  - Flexión 56 → 50 en la última (baja 10,7 %) → movimiento `revisar`, `general` empieza por `'Revisar: movimiento'`.
  - Última sesión hace 15 días → constancia `atencion`; hace 25 → `revisar`; cita vencida con última hace 3 días → `atencion`.
  - Sin sesiones → 4 × `sin-datos`, constancia `'Aún no hay sesiones.'`, `general === 'Va bien.'`.
  - **Datos mínimos** (sesión importada `{ fecha, ejercicios: [] }` sin `dolorEVA`, `emg`, `chequeo`) → no lanza; movimiento, dolor y músculo `sin-datos`.
  - `lecturaSesion` de la segunda sesión → chips `[{ id: 'movimiento', estado: 'bien', texto: 'Sube' }, { id: 'dolor', estado: 'bien', texto: '7 → 3' }…]` (con chequeo `dolorAntes: 7`) y `musculo` `'124 %'`; de la primera → movimiento `sin-datos`; sin prueba EMG → no hay chip `musculo`.
- [ ] **Step 2: Correr** `node --test` → FAIL `Cannot find module '../reporte.js'`.
- [ ] **Step 3: Implementar** las funciones de arriba en `reporte.js` (con `module.exports` condicional).
- [ ] **Step 4: Correr** `node --test` → verde.
- [ ] **Step 5: Commit** `git commit -m "Agrega reporte.js: lectura rápida del paciente y de cada sesión"`

---

### Task 2: Sección Reporte: lectura rápida y línea de tiempo de sesiones

**Files:**
- Modify: `index.html` (sección Reporte: tarjeta `#lectura-rapida`, `#lista-sesiones` en lugar de `#tabla-historial`; `<script src="reporte.js">` después de `resumen-sesion.js`), `app.js` (`renderHistorial` → pinta con `renderReporte(p)`; eventos de la tabla → de la lista; la nota se actualiza en la tarjeta), `styles.css`
- Test: `tests/ui/humo.mjs` (adaptar `'historial corto'`, `'ver detalle'`, `'nota tras importar…'` a la lista)

**Interfaces:**
- Consumes: `lecturaPaciente`, `lecturaSesion` (Task 1).
- Produces: `renderReporte(p)` (en `reporte.js`, parte DOM); marcado `#lectura-general`, `#lectura-areas .area[data-estado]`, `#lista-sesiones li[data-id]` con `.chip[data-estado]`, `.btn-ver`, `.btn-notas`, `.btn-pdf` (el clic de `.btn-pdf` lo implementa Task 3; aquí solo se pinta).

- [ ] **Step 1: Comprobaciones de humo que fallan:**
  - `'reporte: lectura rápida'`: Reporte del paciente demo → `#lectura-general` no vacío; 4 `.area` con títulos Movimiento, Dolor, Músculo, Constancia y `data-estado` válido; texto "Lectura orientativa".
  - `'reporte: línea de tiempo'`: `#lista-sesiones li[data-id]` tantas como sesiones; la primera es la más reciente; cada una tiene `.btn-ver`, `.btn-notas`, `.btn-pdf` y al menos un `.chip`.
  - `'reporte: notas desde la lista'`: `.btn-notas` de la segunda sesión → `#nota-sesion-label` cambia a esa sesión; escribir guarda en esa sesión.
  - `'reporte: sin sesiones'`: paciente nuevo → 4 áreas `sin-datos`, texto "Aún no hay sesiones." y 0 `.btn-pdf`.
  - Adaptar: `'historial corto'` → borrar (lo cubre la línea de tiempo); `'ver detalle'` usa `#lista-sesiones .btn-ver`; `'nota tras importar…'` sin cambios de fondo.
- [ ] **Step 2: Correr** `node tests/ui/humo.mjs` → fallan las nuevas.
- [ ] **Step 3: Implementar.** Colores del semáforo con los tokens `--st-good`, `--st-warning`, `--st-critical` y `--muted` (sin-datos), siempre con la palabra ("Bien", "Atención", "Revisar", "Sin datos") además del color. La sesión seleccionada para notas lleva clase `seleccionada`. En móvil las áreas van de a dos y las tarjetas de sesión en una columna con los botones debajo.
- [ ] **Step 4: Correr** `node --test && node tests/ui/humo.mjs` → verde; capturas de Reporte en escritorio y móvil revisadas.
- [ ] **Step 5: Commit** `git commit -m "Reporte: lectura rápida con semáforo y línea de tiempo de sesiones"`

---

### Task 3: PDF de cada sesión

**Files:**
- Create: `reporte-pdf.js`, `tests/reporte-pdf.test.js`
- Modify: `index.html` (`<script src="reporte-pdf.js">`; botón "Descargar PDF" también en Seguimiento › Una sesión, `#btn-pdf-sesion`), `reporte.js` (clic en `.btn-pdf`), `app.js` (`#btn-pdf-sesion`), `README.md` (Reporte y PDF), `tests/ui/humo.mjs` (`nuevaPagina` redirige `https://cdn.jsdelivr.net/npm/jspdf@2.5.1/**` a la copia local si existe)

**Interfaces:**
- Consumes: `lecturaSesion` (Task 1), `comparacionConAnterior` (resumen-sesion.js), `calcularObservaciones` (app.js), `lineaBase`, `medidasEmg`, `EJERCICIOS`, `etapaPorNumero`.
- Produces:
  - `textoPdf(texto) -> string` (pura; reemplazos de la spec).
  - `nombreArchivoPdf(p, s) -> string` (pura; `P-002_sesion_2026-10-27.pdf`, `_2` para la segunda del mismo día por orden en `p.sesiones`).
  - `datosReporteSesion(p, s, hoy) -> { encabezado: {...}, lectura: { chips, frases }, chequeo | null, ejercicios: fila[], rutina: fila[] | null, emg | null, avisos: string[], notas: string, proximaCita: string }` (pura; `avisos` = textos sin HTML de `calcularObservaciones` con las sesiones hasta `s`, recibida como parámetro opcional `avisosDe` para poder probarla en Node).
  - `cargarJsPdf() -> Promise<jsPDF>` (inyecta el `<script>` una vez).
  - `descargarPdfSesion(p, s) -> Promise<void>`.

- [ ] **Step 1: Pruebas unitarias que fallan** (`tests/reporte-pdf.test.js`): `textoPdf('Dolor 5 → 3 · ≥ 7 – Andrés ñ ✓ …')` → `'Dolor 5 -> 3 · >= 7 - Andrés ñ OK ...'`; `nombreArchivoPdf` con dos sesiones el `2026-10-27` → `..._2026-10-27.pdf` y `..._2026-10-27_2.pdf`; `datosReporteSesion` de una sesión completa (ejercicios, rutina, chequeo, EMG, notas) llena todas las secciones; **mínima** (`{ fecha, ejercicios: [] }`) → `chequeo: null`, `rutina: null`, `emg: null`, `ejercicios: []` y no lanza.
- [ ] **Step 2: Comprobaciones de humo que fallan:**
  - `'pdf: descarga'`: Reporte → `.btn-pdf` de la sesión más reciente → descarga con nombre `P-002_sesion_<fecha>.pdf`; el archivo empieza por `%PDF`; contiene "Reporte de sesi" y el apellido del paciente.
  - `'pdf: desde una sesión'`: Seguimiento › Una sesión → `#btn-pdf-sesion` descarga el de la sesión elegida.
  - `'pdf: notas largas'`: nota de 6000 caracteres → el PDF tiene ≥ 2 páginas (`/Type /Page` ≥ 2) y no hay errores.
  - `'pdf: sesión importada'`: importar una sesión mínima y descargar su PDF → sin errores.
  - `'pdf: sin conexión'`: abortar la URL de jsPDF → aparece el toast "No se pudo generar el PDF: revise la conexión a internet." y no hay descarga (esta comprobación ignora el error de red de jsPDF).
- [ ] **Step 3: Correr** → fallan.
- [ ] **Step 4: Implementar.** Para la gráfica: canvas de 800 × 360 fuera del documento visible, `animation: false`, `devicePixelRatio: 2`, tema claro fijo; `toDataURL('image/png')`; destruir el chart después. Tablas con `doc.text` y líneas (sin plugins de jsPDF). Salto de página cuando `y` pase de 280 mm. Título en el color de marca `#1e6895`.
- [ ] **Step 5: Correr** `node --test && node tests/ui/humo.mjs` → verde; abrir un PDF generado (leerlo como documento) y revisar que se lea bien.
- [ ] **Step 6: Commit** `git commit -m "Descarga en PDF del reporte de cada sesión"`

---

# Parte B — Qué mide cada ejercicio (pedido del 2026-10-27)

**Pedido del usuario:** Fase 1: toda la fase con EMG (mano recta, puño en gancho, puño completo). Fase 2: desviación radial y cubital "no midió bien" (analizar si se mejora con código o umbrales en el ESP); pronación y supinación las mide el IMU; rehacer el video de supinación; puño completo con EMG; abducción del pulgar → EMG del tenar (respuesta). Fase 3: pelota y pinza con EMG. Resto: propuesta aceptada.

## Decisiones (hacen de spec)

| Fase | Paso | Hoy | Después |
|---|---|---|---|
| 1 | Mano recta, puño en gancho, puño completo, mesa, puño recto | sin medir / IMU (puño) | **EMG flexores** |
| 1 | Oposición del pulgar | sin medir | **EMG tenar**, salvo si el chequeo marcó la herida distinta de "Bien": entonces conteo manual (el electrodo del tenar queda junto a la incisión) |
| 1 | Deslizamiento del nervio mediano | sin medir | sin medir (no hay contracción) |
| 2 | Flexión, extensión | IMU | IMU |
| 2 | Desviación radial y cubital | IMU (yaw, mal medido) | **IMU con postura nueva** (ver análisis) |
| 2 | Pronación, supinación | sin medir | **IMU, ángulo nuevo `ps`** |
| 2 | Puño completo | IMU (`mcf`, nunca medido de verdad) | **EMG flexores** |
| 2 | Abducción del pulgar | sin medir | **EMG tenar** |
| 3 | Pelota | IMU (`mcf`) | **EMG flexores** |
| 3 | Pinza | sin medir | **EMG tenar** |
| 3 | Flexión / extensión con peso | IMU | IMU |
| 3 | Prono-supinación con martillo | sin medir | **IMU `ps`** |

**Análisis de la desviación radial/cubital.** Con la palma sobre la mesa la desviación es un giro alrededor del eje vertical (`rc`, guiñada): la gravedad no cambia, el acelerómetro no lo corrige y queda en manos del giroscopio (deriva) y del magnetómetro (perturbado por metal y el propio ESP32). Mejoras:
1. **Postura:** desviaciones con la mano de canto, pulgar hacia arriba, antebrazo apoyado; **recalibrar (`CAL`) en esa postura al empezar el paso**. Así el giro cambia la gravedad en el marco del sensor y la fusión lo corrige con el acelerómetro. Nueva indicación: "Mano de canto, pulgar hacia arriba y antebrazo apoyado. Desvíe la mano hacia el pulgar (radial) o hacia el meñique (cubital)." El firmware no cambia de cálculo.
2. **Detector (interfaz):** media móvil de 5 muestras (~100 ms) antes de contar, para todos los ejercicios IMU; para rangos pequeños (`ref` ≤ 30°) umbral de subida mínimo **5°** (hoy 8°) y de bajada mínimo **2°** (hoy 3°).
3. **Validación en banco (equipo, con el sensor real):** goniómetro, 10 repeticiones por lado en la postura nueva; criterio error ≤ 3° y conteo ≥ 95 %. Si no se cumple, las desviaciones pasan a conteo manual (opción que queda documentada).

**Modelo de medición por paso** (en `rutinas.js`): cada paso tiene `medicion`: `{ fuente: 'imu', tipo }` (tipo de `EJERCICIOS`), `{ fuente: 'emg', musculo }` (`tenar`|`flexores`|`extensores`) o `null`; `tipo` se mantiene solo para compatibilidad con sesiones guardadas. Pasos IMU con `recalibrar: true` (las desviaciones) piden `CAL` al empezar.

**Ángulo de prono-supinación:** el firmware ya descompone la orientación en Z-Y-X; el giro X (alrededor del antebrazo) se envía en el **tercer campo** de la línea `D`, que hasta hoy era `mcf` y siempre valía 0. Se renombra `ps` (positivo = supinación). `EJERCICIOS` gana `pronacion` (`canal: 'ps', signo: -1, ref: 80`) y `supinacion` (`canal: 'ps', signo: 1, ref: 80`); `puno` queda solo para leer sesiones antiguas.

**Medición con EMG en un paso:** el detector de repeticiones trabaja sobre la activación del músculo del paso (umbral de subida = reposo + máx(60, 50 % de la mediana de los picos previos), bajada = reposo + máx(25, 25 % de la mediana de los picos previos); antes de tener picos, la mediana se toma como 300); el registro del paso guarda `emg: { musculo, repeticiones, activacionMedia, activacionMax }`. El PC envía `EJ,emg-<musculo>,<objetivo>` (informativo; el simulador contrae ese músculo a ritmo de repeticiones). Sin EMG en la conexión, el paso cae a conteo manual con el aviso "Este ejercicio se mide con EMG: conecte los electrodos o cuente a mano.".

**Videos:** `videos/LEEME.md` marca `supinacion.mp4` como **"Rehacer"** (lo graba el equipo; mismo estilo, `prompts-videos-ejercicios.md`), y `desv_radial.mp4` / `desv_cubital.mp4` deben grabarse ya con la postura nueva.

**Reporte (Parte A):** el PDF y la línea de tiempo muestran en la rutina grabada la columna/etiqueta **"Medido con"**: IMU, EMG (músculo) o Manual; la lectura de Movimiento usa solo pasos IMU.

## Tareas de la Parte B (después de las Tareas 1–3)

### Task 4: Firmware: ángulo de prono-supinación en el tercer campo
- Modify: `firmware/carpo_esp32/src/nucleo/angulos.{h,cpp}` (`AngulosMuneca` gana `ps`), `carpo_esp32.ino` (envía `ps` donde iba `0.0f`), `README.md`/`monitoreo.js` (protocolo: `mcf` → `ps`).
- [ ] Prueba que falla en `test_angulos.cpp`: rotación pura de +30° alrededor de X → `ps ≈ 30` (±0,5), `fe ≈ 0`, `rc ≈ 0`; con `manoIzquierda`, `ps ≈ -30`; rotaciones puras en Y y Z dejan `ps ≈ 0`.
- [ ] Correr `python3 firmware/pruebas/correr.py angulos` → falla; implementar `ps = atan2(2(wx + yz), 1 − 2(x² + y²))`; correr → verde; compilar el `.ino` con los sustitutos (como en la tarea EMG). Commit.

### Task 5: Medición por paso en las rutinas
- Modify: `rutinas.js` (`medicion` y `recalibrar` en cada paso según la tabla; nuevas indicaciones de desviaciones), `data.js` (`pronacion`, `supinacion`; `CANALES.mcf` → `ps` "Prono-supinación"), `tests/rutinas.test.js`.
- [ ] Pruebas que fallan: cada paso de las 3 fases tiene la `medicion` de la tabla (comparar contra un objeto esperado por `id`); `desv_radial` y `desv_cubital` con `recalibrar: true` y la indicación nueva exacta; ningún paso usa `tipo: 'puno'`; dentro de una fase cada `medicion` IMU `tipo` aparece como mucho una vez (regla existente).
- [ ] Implementar; `node --test` verde. Commit.

### Task 6: Detector mejorado y pasos medidos con EMG
- Create: `detector.js` (puro) + `tests/detector.test.js`; Modify: `monitoreo.js` (usa `detector.js`; pasos EMG; `EJ,emg-<musculo>,<n>`; recalibración al empezar pasos `recalibrar`), `rutina.js` (contador "Detectadas" también para EMG; aviso sin EMG), simulador (contracciones EMG por paso, `ps` en pronación/supinación).
- Produces: `crearDetector({ tipoUmbral: 'imu'|'emg', refAmp }) -> { agregar(valor) -> boolean /*true = repetición nueva*/, picos, picosRel }`; `suavizar(valores, n = 5)`.
- [ ] Pruebas unitarias que fallan: señal senoidal de 10 repeticiones de 12° con ruido ±1,5° → 10 repeticiones con `ref` 20 (hoy cuenta mal); la misma sin suavizar con ruido en el umbral no cuenta dobles; EMG reposo 20 con 8 contracciones a 300 → 8; EMG sin contracciones (plano 20 ± 5) → 0.
- [ ] Comprobaciones de humo: `'fase 1 con EMG'` (rutina Fase 1 con simulador → los pasos guardan `emg.repeticiones > 0` y `medicion.fuente === 'emg'`); `'fase 1 herida → oposición manual'` (chequeo con herida "Enrojecida" + continuar bajo criterio → el paso de oposición queda sin medir); `'pronación con IMU'` (Fase 2 → paso pronación con `repeticiones > 0`); `'desviación pide recalibrar'` (al llegar a desviación radial se envía `CAL` y el contador espera "Calibrando…"); `'paso EMG sin electrodos'` (`SIMULADOR_SIN_EMG` → aviso y conteo manual).
- [ ] Implementar; `node --test && node tests/ui/humo.mjs` verde. Commit.

### Task 7: Reporte y PDF con la fuente de medición; videos y README
- Modify: `reporte.js`, `reporte-pdf.js` (columna "Medido con"), `videos/LEEME.md` (supinación "Rehacer"; desviaciones con la postura nueva), `README.md` (tabla de qué mide cada ejercicio, análisis de desviaciones y protocolo `ps`), `prompts-videos-ejercicios.md` (prompt de desviación de canto).
- [ ] Pruebas que fallan: `datosReporteSesion` de una sesión Fase 1 → filas de rutina con `medidoCon: 'EMG (flexores)'`; paso sin medir → `'Manual'`; IMU → `'IMU'`. Humo: el PDF de una sesión Fase 1 contiene "EMG (flexores)".
- [ ] Implementar; todo verde. Commit.

### Task 8 (equipo, con el sensor real — no la hace el agente)
- [ ] Validación en banco de desviación radial/cubital en la postura nueva (goniómetro, 10 repeticiones por lado; error ≤ 3°, conteo ≥ 95 %). Anotar resultado en el README. Si falla: cambiar `medicion` de las desviaciones a `null` (conteo manual).
- [ ] Grabar de nuevo `supinacion.mp4` y los videos de desviación con la postura nueva.
