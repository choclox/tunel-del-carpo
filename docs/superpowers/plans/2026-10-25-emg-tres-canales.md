# EMG de 3 canales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir con 3 canales EMG (tenar, flexores, extensores) una prueba de fuerza muscular fija al final de cada sesión de Fase 2 y 3, y mostrar la mejora del músculo en Seguimiento y Reporte.

**Architecture:** Un módulo puro nuevo `emg.js` concentra el formato de la línea `D`, los picos, la línea base y las medidas. `monitoreo.js` lo usa para leer los datos y el simulador genera EMG. Una ventana nueva, `prueba-emg.js`, guía la prueba entre "Terminar rutina" y "Rutina terminada". `app.js` muestra las medidas. En el firmware, un módulo `nucleo/emg` hace el escalado, el RMS y el reposo, y `carpo_esp32.ino` lo conecta detrás de `USAR_EMG`.

**Tech Stack:** HTML/CSS/JS sin compilación, Chart.js 4.4.1, `node --test`, Playwright (`tests/ui/humo.mjs`), C++17 en ESP32-C6 (Arduino core 3.2.0) con pruebas de PC vía `firmware/pruebas/correr.py` (zig c++).

**Spec:** `docs/superpowers/specs/2026-10-25-emg-tres-canales-design.md`

## Global Constraints

- Rama `emg-tres-canales` (ya creada, contiene la spec).
- Músculos y orden fijos: `tenar` (EMG 1), `flexores` (EMG 2), `extensores` (EMG 3). Constante `MUSCULOS = ['tenar', 'flexores', 'extensores']`.
- Línea de datos: `D,<seq>,<t_ms>,<fe>,<rc>,<mcf>` (6 campos) o `D,...,<emg1>,<emg2>,<emg3>` (9 campos, enteros 0–1000). Otro número de campos, o EMG no numérico o fuera de 0–1000 → línea no válida.
- Comando nuevo PC → dispositivo (informativo, como `EJ`): `PR,<musculo>` al empezar cada contracción y `PR,-` al terminarla. El firmware lo acepta sin hacer nada; el simulador lo usa para contraer el músculo pedido.
- La prueba solo se ofrece si `etapa >= 2` **y** la conexión recibió al menos una línea de 9 campos.
- Tiempos de la prueba: prepárese 3 s (cuenta 3, 2, 1), fuerza 3 s, descanso 5 s, 3 contracciones por músculo. Se leen de `TIEMPOS_PRUEBA_EMG` (objeto en `prueba-emg.js`); las pruebas de navegador los acortan con `window.TIEMPOS_PRUEBA_EMG = { prepara: 300, fuerza: 400, descanso: 200 }` antes de cargar.
- Contracción dudosa: pico < 70 % del promedio del bloque.
- Avisos: índice del nervio mediano baja > 15 % frente a la sesión anterior con prueba ("warning"); co-contracción > 30 % ("info").
- Firmware: `USAR_EMG = false` por defecto; `PINES_EMG = {0, 1, 3}`; RMS de 50 ms a 1000 Hz en modo crudo.
- `node --test`, `node tests/ui/humo.mjs` y (si cambia el firmware) `python firmware/pruebas/correr.py` en verde en cada commit. Si falta zig: `python -m pip install ziglang==0.13.0`.

## Review Focus

1. **Se pierde la conexión durante la prueba:** la prueba se detiene con el mensaje "Se perdió la conexión: la prueba no se completó." y pasa a "Rutina terminada"; la sesión se guarda sin prueba (`emg.prueba = null`). → Task 4, `'prueba: desconexión'`.
2. **Esc o cerrar la ventana de la prueba:** cuenta como "Omitir prueba"; nunca se pierde la rutina grabada. → Task 4, `'prueba: Esc omite'`.
3. **Línea de 9 campos con EMG no numérico o fuera de rango** (`D,1,20,0,0,0,12,x,5`, `...,1001`): cuenta como no válida y no activa "con EMG". → Task 1, prueba `parsearMuestra`.
4. **Línea base con un músculo en 0** (electrodo despegado en la primera prueba): las medidas que dividen por él dan `null` ("—"), no `Infinity`. → Task 1, prueba `medidasEmg`.
5. **Pacientes con sesiones antiguas sin `emg`** mezcladas con nuevas: Resumen, gráfica, CSV y avisos funcionan, con huecos o "—". → Task 5, `'emg: sesiones sin prueba'`.

---

### Task 1: `emg.js` (formato, picos, línea base y medidas, sin DOM)

**Files:**
- Create: `emg.js`, `tests/emg.test.js`

**Interfaces:**
- Produces:
  - `MUSCULOS: ['tenar', 'flexores', 'extensores']`, `NOMBRES_MUSCULO: { tenar: 'Pulgar (tenar)', flexores: 'Flexores', extensores: 'Extensores' }`
  - `parsearMuestra(partes: string[]) -> { seq, t, fe, rc, mcf, emg: {tenar, flexores, extensores} | null } | null` — `partes` es `linea.split(',')` con `partes[0] === 'D'`; `t` en segundos; `null` si la línea no es válida.
  - `picoContraccion(valores: number[]) -> number | null` — máximo; `null` si está vacío.
  - `resumenBloque(picos: number[]) -> { picos, media, dudosa: boolean }` — `media` redondeada a entero; `dudosa` si algún pico < 0,7 × media.
  - `lineaBase(sesiones) -> prueba | null` — `emg.prueba` de la primera sesión por fecha que la tenga.
  - `medidasEmg(prueba, base) -> { tenarPct, flexoresPct, extensoresPct, indiceMediano, cocontraccion }` — todo en %, redondeado a 1 decimal, `null` si falta un dato o se divide por 0. `cocontraccion` no necesita base.
  - `validarEmg(emg) -> void` — lanza `Error` con mensaje en español si `emg` existe y no cumple la forma de la spec (`prueba` null u objeto con los 3 músculos y `picos` lista de 3 números finitos).

- [ ] **Step 1: Pruebas que fallan** (`tests/emg.test.js`, mismo estilo que `tests/acceso.test.js`):
  - `parsearMuestra('D,7,140,1.5,-2,8'.split(','))` → `{ seq: 7, t: 0.14, fe: 1.5, rc: -2, mcf: 8, emg: null }`.
  - `parsearMuestra('D,7,140,1.5,-2,8,410,96,30'.split(','))` → `emg: { tenar: 410, flexores: 96, extensores: 30 }`.
  - `null` para: `'D,7,140,1,2'`, `'D,7,140,1,2,3,4,5'` (8 campos), `'D,1,20,0,0,0,12,x,5'`, `'D,1,20,0,0,0,12,1001,5'`, `'D,1,20,0,0,0,-1,0,0'`.
  - `resumenBloque([410, 425, 401])` → `{ picos: [410, 425, 401], media: 412, dudosa: false }`; `resumenBloque([400, 420, 250]).dudosa === true`.
  - `lineaBase` con sesiones desordenadas por fecha y una sin `emg` → la prueba de la sesión más antigua que tiene `emg.prueba`.
  - `medidasEmg(prueba, base)` con base `tenar 400, flexores 500, extensores 200` y prueba `tenar 480, flexores 500, extensores 200, extensoresDuranteFlexores 100` → `{ tenarPct: 120, flexoresPct: 100, extensoresPct: 100, indiceMediano: 120, cocontraccion: 20 }`.
  - Base con `extensores.media = 0` → `extensoresPct: null, indiceMediano: null` (el resto calculado).
  - `validarEmg({ prueba: null })` no lanza; `validarEmg({ prueba: { tenar: { picos: [1, 2] } } })` lanza `/tres músculos|picos/`.
- [ ] **Step 2: Correr** `node --test` → FAIL `Cannot find module '../emg.js'`.
- [ ] **Step 3: Implementar `emg.js`** con las firmas de arriba y `module.exports` condicional.
- [ ] **Step 4: Correr** `node --test` → todo verde.
- [ ] **Step 5: Commit** `git commit -m "Agrega emg.js: formato de la línea D, picos, línea base y medidas EMG"`

---

### Task 2: Firmware: módulo EMG, protocolo y `PR`

**Files:**
- Create: `firmware/carpo_esp32/src/nucleo/emg.h`, `emg.cpp`, `firmware/pruebas/test_emg.cpp`
- Modify: `firmware/carpo_esp32/src/nucleo/protocolo.h/.cpp` (+ `firmware/pruebas/test_protocolo.cpp`), `firmware/carpo_esp32/config.h`, `firmware/carpo_esp32/carpo_esp32.ino`

**Interfaces:**
- Produces (C++):
  - `uint16_t escalarEmg(float milivoltios, float maxMilivoltios)` → 0–1000, recortado.
  - `class RmsVentana { explicit RmsVentana(size_t n = 50); float agregar(float x); }` — RMS de las últimas `n` muestras (con menos de `n`, de las que haya).
  - `class ReposoEmg { void iniciar(); void agregar(const uint16_t v[3]); void terminar(); void restar(uint16_t v[3]) const; }` — promedio de reposo por canal; `restar` deja mínimo 0.
  - `formatearMuestraEmg(buf, tam, seq, tMs, fe, rc, mcf, const uint16_t emg[3])` → `"D,<seq>,<t>,<fe>,<rc>,<mcf>,<e1>,<e2>,<e3>"`.
  - `TipoComando::Prueba` para `"PR,"` (prefijo).
- `config.h`: `USAR_EMG = false`, `enum class ModoEmg { Envolvente, Crudo }`, `EMG_MODO = ModoEmg::Envolvente`, `PINES_EMG[3] = {0, 1, 3}`, `EMG_MAX_MV = 3300.0f`.

- [ ] **Step 1: Pruebas que fallan** en `test_emg.cpp`: `escalarEmg(1650, 3300) == 500`, `escalarEmg(-5, 3300) == 0`, `escalarEmg(4000, 3300) == 1000`; `RmsVentana(4)` con `3, -3, 3, -3` → `3.0`; `ReposoEmg` con reposo `{20, 30, 10}` y lectura `{420, 25, 110}` → `{400, 0, 100}`. En `test_protocolo.cpp`: `formatearMuestraEmg(..., 7, 140, 12.345f, -3.26f, 0.0f, {410, 96, 30})` → `"D,7,140,12.3,-3.3,0.0,410,96,30"`; `parsearComando("PR,tenar") == TipoComando::Prueba`, `parsearComando("PR,-") == TipoComando::Prueba`.
- [ ] **Step 2: Correr** `python firmware/pruebas/correr.py` → fallo de compilación por símbolos que faltan.
- [ ] **Step 3: Implementar** `emg.h/.cpp` y los cambios del protocolo.
- [ ] **Step 4: Integrar en el `.ino`** (sin pruebas de PC; se verifica compilando): con `USAR_EMG`, leer `analogReadMilliVolts` de `PINES_EMG` en cada envío (envolvente) o cada 1 ms con `RmsVentana` por canal (crudo); `CAL` alimenta `ReposoEmg` durante la calibración y `terminar()` al `CAL,OK`; enviar con `formatearMuestraEmg`. `PR` no hace nada. Sin `USAR_EMG`, nada cambia.
- [ ] **Step 5: Correr** `python firmware/pruebas/correr.py` → todas pasan. Si `arduino-cli` está disponible: `arduino-cli compile --fqbn esp32:esp32:esp32c6 firmware/carpo_esp32` con `USAR_EMG` en `false` y en `true` (si no está, anotar en el ledger que no se compiló el `.ino`).
- [ ] **Step 6: Commit** `git commit -m "Firmware: lectura EMG de 3 canales (envolvente o RMS) y comando PR"`

---

### Task 3: Recepción EMG en la interfaz y simulador

**Files:**
- Modify: `monitoreo.js` (`TransporteSimulado` 109-178, `procesarLinea` 181-230, `nuevaSesion`, `guardarSesionRutina` 412-446), `index.html` (`<script src="emg.js">` antes de `monitoreo.js`)
- Test: `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: `parsearMuestra`, `MUSCULOS` (Task 1).
- Produces:
  - `mv.conEmg: boolean` — `true` desde la primera línea de 9 campos; vuelve a `false` al conectar.
  - Cada muestra del buffer gana `m.emg` (`{tenar, flexores, extensores}` o `null`).
  - `mv.sesion.emgSenal: { fs: 10, tenar: [], flexores: [], extensores: [] }` — 1 de cada 5 muestras durante los pasos de la rutina.
  - `mv.sesion.emgPrueba: prueba | null` (lo llena Task 4) y `guardarSesionRutina` escribe `s.emg = { prueba, senal }` si `mv.conEmg` fue `true` en la sesión.
  - Simulador: `new TransporteSimulado()` envía 9 campos salvo que `window.SIMULADOR_SIN_EMG === true`. Reposo ~20 ± 5; con `PR,<musculo>`: ese canal ~400–500 y los otros ~60–100; durante `EJ` de `flexion`/`puno` flexores ~150, de `extension` extensores ~150.
  - `estadoDispositivo()` gana `conEmg`.

- [ ] **Step 1: Comprobaciones de humo que fallan:**
  - `'simulador con EMG'`: Ejercicios → Conectar (simulador) → tras 500 ms, `mv.conEmg === true` y la última muestra tiene `emg.tenar` entre 0 y 1000.
  - `'simulador sin EMG'` (init `window.SIMULADOR_SIN_EMG = true`): `mv.conEmg === false`.
  - `'rutina guarda señal EMG'`: rutina de Fase 2 con el simulador (como `'rutina completa con simulador'`), "Omitir prueba" si aparece (Task 4 aún no existe: no aparecerá), guardar → la sesión nueva tiene `emg.senal.tenar.length > 0` y `emg.prueba === null`.
- [ ] **Step 2: Correr** → fallan las 3.
- [ ] **Step 3: Implementar** según Interfaces; `procesarLinea` delega el caso `D` en `parsearMuestra`.
- [ ] **Step 4: Correr** `node --test && node tests/ui/humo.mjs` → todo verde.
- [ ] **Step 5: Commit** `git commit -m "Interfaz: recibe EMG de 3 canales y el simulador lo genera"`

---

### Task 4: Ventana "Prueba de fuerza muscular"

**Files:**
- Create: `prueba-emg.js`
- Modify: `index.html` (`<dialog id="dlg-prueba">` y `<script src="prueba-emg.js">` después de `rutina.js`), `rutina.js` (`terminarRutina` 280-288), `monitoreo.js` (`alPerderConexion`: avisar a la prueba), `styles.css`
- Test: `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: `resumenBloque`, `picoContraccion`, `lineaBase`, `medidasEmg`, `NOMBRES_MUSCULO` (Task 1); `mv.conEmg`, `mv.buffer[].emg`, `mv.sesion.emgPrueba`, `mv.transporte.enviar` (Task 3); `abrirFin()` (`rutina.js`).
- Produces:
  - `TIEMPOS_PRUEBA_EMG = window.TIEMPOS_PRUEBA_EMG ?? { prepara: 3000, fuerza: 3000, descanso: 5000 }`.
  - `debeHacerPrueba(etapa: number, conEmg: boolean) -> boolean` (pura, exportada: `etapa >= 2 && conEmg`).
  - `abrirPrueba(alTerminar: () => void)` — `terminarRutina` llama `abrirPrueba(abrirFin)` cuando `debeHacerPrueba` y `abrirFin()` si no.
  - `pruebaPerdioConexion()` — la llama `alPerderConexion`.
  - Marcado: `#dlg-prueba` con `#pr-musculo` (nombre del bloque), `#pr-indicacion`, `#pr-cuenta` (texto grande: "3", "2", "1", "¡Fuerza!", "Descanse"), `#pr-barra` (`<div>` cuyo `style.width` es la activación en %), `#pr-resultado`, `#pr-repetir` ("Repetir este músculo"), `#pr-siguiente` ("Siguiente músculo" / "Terminar prueba"), `#pr-omitir` ("Omitir prueba").
- Textos exactos (spec): indicaciones de los 3 bloques; resultado `"<Nombre>: <media> unidades (<+x %> desde la primera prueba)"` o `"<Nombre>: <media> unidades (primera prueba: será la referencia)"`; aviso dudosa `"Una contracción salió más débil que las otras."`.

- [ ] **Step 1: Prueba unitaria** de `debeHacerPrueba` en `tests/prueba-emg.test.js` (`(1, true) → false`, `(2, true) → true`, `(3, false) → false`) y **comprobaciones de humo que fallan** (todas con `window.TIEMPOS_PRUEBA_EMG` corto):
  - `'prueba: fase 2 completa'`: rutina Fase 2 → "Terminar rutina" → `#dlg-prueba[open]` → para cada músculo esperar `#pr-siguiente` habilitado y pulsarlo → `#dlg-fin[open]` → Guardar → la sesión tiene `emg.prueba.tenar.picos.length === 3` y `emg.prueba.flexores.extensoresDuranteFlexores > 0`.
  - `'prueba: fase 1 no aparece'`: rutina Fase 1 → al terminar se abre `#dlg-fin` directamente.
  - `'prueba: sin EMG no aparece'`: Fase 2 con `SIMULADOR_SIN_EMG` → `#dlg-fin` directamente.
  - `'prueba: omitir'`: `#pr-omitir` → `#dlg-fin[open]`; al guardar, `emg.prueba === null`.
  - `'prueba: Esc omite'`: Esc en `#dlg-prueba` → `#dlg-fin[open]`; la rutina sigue disponible para guardar.
  - `'prueba: desconexión'`: durante el primer bloque, `desconectar()` → aparece el texto "Se perdió la conexión: la prueba no se completó." y luego `#dlg-fin[open]`.
- [ ] **Step 2: Correr** → fallan.
- [ ] **Step 3: Implementar** `prueba-emg.js`: un bloque por músculo; por contracción envía `PR,<musculo>` al empezar "¡Fuerza!" y `PR,-` al terminar; el pico se toma de las muestras `emg[musculo]` recibidas durante los 3 s; en el bloque de flexores también el pico de `extensores` de cada contracción (su promedio = `extensoresDuranteFlexores`). Al terminar el bloque, `resumenBloque` y el texto de resultado contra `lineaBase(sesiones del paciente)`. `mv.sesion.emgPrueba` se llena solo si se completan los 3 bloques. Diseño: mismo estilo que `#dlg-listos`; cuenta en 64 px peso 800; barra con `--brand`; un solo botón primario.
- [ ] **Step 4: Correr** `node --test && node tests/ui/humo.mjs` → verde.
- [ ] **Step 5: Commit** `git commit -m "Agrega la prueba de fuerza muscular guiada al final de la rutina (Fase 2 y 3)"`

---

### Task 5: Medidas en Seguimiento, avisos, Reporte, importación, demo y README

**Files:**
- Modify: `app.js` (`renderResumen`, `renderEvolucion`, `renderSesion`, `renderObservaciones`, `validarSesion`, `exportarCSV`), `index.html` (tarjeta y plegables), `data.js` (`generarDemo`: pruebas EMG en sesiones con ≥ 14 días post-op), `styles.css` (`.kpis` a 4 columnas, 2 en ≤ 1100 px, 1 en ≤ 760 px), `README.md` (protocolo `D` de 9 campos, `PR`, campo `emg`, colocación sugerida de electrodos, prueba de fuerza)
- Test: `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: `lineaBase`, `medidasEmg`, `validarEmg`, `MUSCULOS`, `NOMBRES_MUSCULO` (Task 1).
- Produces: tarjeta `Músculo` como cuarta en `#resumen-tarjetas`; `<details id="mas-emg">` "Fuerza muscular (EMG)" con `canvas#chart-emg`; en Una sesión `#sesion-emg` (tarjeta "Prueba de fuerza muscular") y `<details id="sesion-emg-senal">` "Ver señal EMG" con `canvas#chart-emg-senal`; columnas CSV `emg_tenar;emg_flexores;emg_extensores;emg_tenar_pct;emg_flexores_pct;emg_extensores_pct;indice_mediano_pct;cocontraccion_pct`.

- [ ] **Step 1: Comprobaciones de humo que fallan** (ajustar `'tres tarjetas'` a cuatro: `Avance`, `Dolor`, `Última sesión`, `Músculo`):
  - `'emg: tarjeta y gráfica'`: paciente demo con pruebas → la tarjeta `Músculo` muestra un `%`; abrir `#mas-emg` → `#chart-emg` mide > 100 px de alto.
  - `'emg: sin prueba'`: paciente nuevo con una sesión importada sin `emg` → la tarjeta dice "Sin prueba EMG (empieza en la Fase 2)" y no hay errores en consola.
  - `'emg: sesiones sin prueba'`: paciente demo + importar una sesión sin `emg` con la fecha más reciente → Resumen, `#mas-emg`, Una sesión y CSV sin errores; en la Una sesión importada `#sesion-emg` está oculto.
  - `'emg: una sesión'`: vista Una sesión de una sesión demo con prueba → `#sesion-emg` muestra los 3 músculos con sus 3 picos.
  - `'emg: csv'`: la cabecera del CSV descargado contiene `indice_mediano_pct`.
  - `'emg: importar inválido'`: importar una sesión con `emg: { prueba: { tenar: { picos: [1] } } }` → aparece el `alert` con "No se pudo importar" (capturar el texto del diálogo).
  - `'emg: avisos'`: paciente demo cuya última prueba baja el índice > 15 % (dejarlo así en `generarDemo` para un paciente) → hay un aviso que contiene "nervio mediano".
- [ ] **Step 2: Correr** → fallan.
- [ ] **Step 3: Implementar** según Interfaces y la sección 3 de la spec; la gráfica EMG se dibuja en el `toggle` de su `<details>` como las demás; textos de la tarjeta: valor `"<índice> %"` y pie `"índice del nervio mediano · <±x> puntos desde la primera prueba"`.
- [ ] **Step 4: Correr** `node --test && node tests/ui/humo.mjs` → verde; revisar capturas (`node tests/ui/humo.mjs --capturas <carpeta>`) de Resumen y Una sesión en escritorio y móvil.
- [ ] **Step 5: Commit** `git commit -m "Muestra la mejora muscular (EMG) en Seguimiento, avisos, CSV e importación"`
