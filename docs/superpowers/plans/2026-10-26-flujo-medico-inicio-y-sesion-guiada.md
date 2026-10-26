# Flujo del médico: inicio, sesión guiada y cierre — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el profesional, desde el login, llegue a un **Inicio** que le dice qué hacer hoy, haga cada sesión como un **paso a paso** (chequeo de seguridad → dispositivo → rutina → prueba EMG → cierre → resumen) y termine con una **hoja para el paciente**, la **próxima cita** y la ficha del paciente al día.

**Architecture:** Se mantiene la página única `index.html` con la barra lateral de pacientes. Se añade una pantalla **Inicio** (en lugar de abrir el primer paciente) y tres ventanas nuevas que se insertan en el flujo existente de la rutina: `#dlg-chequeo` (antes de "¿Listos para empezar?"), la próxima cita dentro de "Rutina terminada" y `#dlg-resumen` (después de guardar). Una barra de pasos común indica en qué parte de la sesión se está. La lógica sin DOM vive en módulos puros con pruebas: `inicio.js`, `chequeo.js`, `resumen-sesion.js`, y `navegacion.js` crece con los pasos.

**Tech Stack:** HTML/CSS/JS sin compilación, Chart.js 4.4.1, `node --test`, Playwright (`tests/ui/humo.mjs`).

**Spec:** Pedido del usuario (2026-10-26) y sus respuestas: flujo **A. Tablero + sesión guiada**, con los extras **Chequeo de seguridad**, **Resumen para el paciente**, **Próxima cita** y **Editar ficha del paciente**. La sección siguiente concreta ese pedido y hace de spec.

## Decisiones de diseño (hacen de spec)

**Flujo completo:** Login → **Inicio** → "Nueva sesión" (elegir paciente) o un paciente de la lista → **1 Chequeo** → **2 Dispositivo** ("¿Listos para empezar?", ya existe) → **3 Rutina** (ya existe) → **4 Prueba EMG** (ya existe; "omitida" en Fase 1 o sin EMG) → **5 Cierre** ("Rutina terminada" + próxima cita) → **6 Resumen** (qué mejoró, hoja para el paciente) → Inicio o Seguimiento.

**Inicio (pantalla nueva, la primera tras el login):**
- Saludo con el nombre de la sesión: "Buenos días, <nombre>" (antes de las 12), "Buenas tardes" (12–18:59), "Buenas noches" (desde las 19), y la fecha de hoy.
- Botón primario grande **"Nueva sesión"** → ventana "¿Con qué paciente?" (buscador + lista; al elegir, abre al paciente en Ejercicios y empieza el **Chequeo**).
- 4 cifras: **Pacientes activos** (no archivados), **Sesiones esta semana** (lunes a hoy), **Citas de hoy**, **Requieren atención**.
- **Requieren atención:** lista de pacientes activos con al menos un motivo, el más grave primero; clic → abre al paciente en Seguimiento. Motivos (umbrales iguales a los avisos que ya existen):
  - "Cita vencida (<fecha>)" si `proximaCita` < hoy y no hubo sesión desde esa fecha — nivel `warning`.
  - "Sin sesión hace N días" si la última sesión fue hace > 10 días — `info`.
  - "Aún sin sesiones" si el paciente no tiene ninguna — `info`.
  - "El dolor subió (a → b)" si EVA subió ≥ 2 frente a la sesión anterior — `warning`.
  - "Bajó el movimiento en <ejercicio>" si algún `anguloMax` bajó > 8 % frente a la anterior — `warning`.
  - "Bajó el índice del nervio mediano" si bajó > 15 % frente a la prueba EMG anterior — `warning`.
  - "Se perdieron datos en la última sesión" si `perdidaDatosPct` ≥ 1 — `critical`.
  - "El chequeo pidió no hacer la sesión" si la última sesión tiene `chequeo.nivel === 'detener'` — `critical`.
- **Citas de hoy** (nombre + "Empezar" que abre el Chequeo) y **Sesiones recientes** (las 5 últimas de todos los pacientes: paciente, fecha, dolor).
- Sin pacientes: un bloque vacío "Aún no tiene pacientes" con "Nuevo paciente".
- Se vuelve al Inicio con la marca de la barra superior y con un ítem **Inicio** arriba en la barra lateral.

**Barra de pasos de la sesión:** 6 pasos (`Chequeo`, `Dispositivo`, `Rutina`, `Prueba EMG`, `Cierre`, `Resumen`) arriba de cada ventana de la sesión; hechos con ✓, el actual resaltado, "Prueba EMG" como "omitida" si no aplica.

**1 Chequeo de seguridad** (ventana `#dlg-chequeo`, antes de "¿Listos para empezar?"; se abre con "Empezar rutina" y desde Inicio):
- Preguntas: **Dolor ahora** (0–10, obligatorio), **Hormigueo o adormecimiento** (No / Leve / Fuerte), **Herida** (Bien / Enrojecida o con secreción / Abierta). Por defecto: vacío, No, Bien.
- Resultado (texto orientativo; decide el profesional):
  - **detener** si herida abierta o enrojecida/con secreción, hormigueo fuerte o dolor ≥ 7: "Se recomienda no hacer la rutina hoy y consultar al médico tratante." Botón primario **"No hacer la sesión hoy"** (cierra). Secundario **"Continuar bajo mi criterio"** solo tras marcar la casilla "Revisé al paciente y decido continuar".
  - **precaución** si dolor 4–6 o hormigueo leve: "Haga la rutina con cuidado; considere bajar a la Fase N−1" (si la fase es > 1) con botón "Bajar a la Fase N−1" que cambia la fase elegida. Primario **"Continuar"**.
  - **ok**: "Todo bien para empezar." Primario **"Continuar"**.
- Se guarda en la sesión: `chequeo: { dolorAntes, hormigueo: 'no'|'leve'|'fuerte', herida: 'bien'|'enrojecida'|'abierta', nivel: 'ok'|'precaucion'|'detener', continuoBajoCriterio: boolean }`.

**5 Cierre ("Rutina terminada", existente) gana:** "Dolor ahora" pasa a llamarse **"Dolor después (0–10)"**, y un campo **"Próxima cita"** (fecha; por defecto hoy + 7 días; casilla "Sin próxima cita"). Al guardar, `paciente.proximaCita` = esa fecha o `null`.

**6 Resumen de la sesión (ventana `#dlg-resumen`, se abre tras guardar, en lugar de saltar a Seguimiento):**
- Título "Sesión guardada" + paciente y fecha.
- Hasta 3 frases de comparación con la sesión anterior, en lenguaje simple, la mejor primero: "Flexión de muñeca: 52° (+6° que la sesión anterior)", "Dolor: 5 → 3 durante la sesión" (antes → después, si hay chequeo), "Índice del nervio mediano: 124 % (+8 puntos)". Primera sesión: "Primera sesión: será la referencia para comparar."
- Los avisos nuevos de esta sesión (los mismos de Seguimiento › Resumen, máximo 3).
- Botones: **"Hoja para el paciente"** (imprime), **"Ver seguimiento"** (Seguimiento › Una sesión), primario **"Volver al inicio"**.

**Hoja para el paciente (impresión, una página A4, sin la interfaz):** logo, nombre, fecha; **"Hoy hizo"** (ejercicios grabados con repeticiones); **"Cómo va"** (las mismas frases del Resumen); **"Ejercicios para casa"** (los pasos de la fase de la sesión con repeticiones y sostén); **"Cuidados"** (los cuidados generales de la fase); **"Próxima cita"** (fecha o "Por definir"); pie "Kinemo · Prototipo académico. Siga las indicaciones de su profesional." Se imprime con `window.print()` desde un bloque `#hoja-paciente` que solo se ve en `@media print`.

**Editar ficha:** en el encabezado del paciente, dentro de "Ver ficha", botones **"Editar ficha"** (abre el mismo formulario de "Nuevo paciente", con los datos y con el campo **Próxima cita**) y **"Dar de alta (archivar)"** (confirma; `paciente.archivado = true`; deja de verse en la lista y en el Inicio). La lista lateral gana el interruptor **"Mostrar dados de alta"**; un paciente archivado muestra "Dado de alta" y el botón **"Reactivar"**.

**Datos nuevos (compatibles con lo guardado):** `paciente.proximaCita` (ISO o `null`), `paciente.archivado` (boolean), `sesion.chequeo` (objeto o ausente). La demo gana `proximaCita` para cada paciente: uno hoy, uno vencido, dos futuros.

Fuera de alcance: agenda con varias citas, recordatorios por correo/WhatsApp, cuentas de pacientes, exportar la hoja a PDF por código (se usa "Guardar como PDF" del diálogo de impresión).

## Global Constraints

- Rama `flujo-medico` creada desde `main`.
- Textos en español sencillo; los resultados del chequeo son orientativos y lo dicen ("Recomendación orientativa: decide el profesional.").
- Umbrales: dolor detener ≥ 7, precaución 4–6; ROM baja > 8 %; dolor sube ≥ 2; índice EMG baja > 15 %; pérdida de datos ≥ 1 %; sin sesión > 10 días; próxima cita por defecto hoy + 7 días.
- Un solo botón primario por pantalla o ventana.
- Toda fecha "hoy" sale de `hoyISO()` (app.js); los módulos puros la reciben como parámetro `hoy` (ISO) para poder probarlos.
- `node --test` y `node tests/ui/humo.mjs` en verde en cada commit.

## Review Focus

1. **Cerrar con Esc o cancelar cualquier paso intermedio** (chequeo, resumen): nunca se pierde una rutina grabada; cerrar el Resumen equivale a "Volver al inicio" (la sesión ya está guardada). → Task 3 `'chequeo: Esc no empieza'`, Task 4 `'resumen: Esc vuelve al inicio'`.
2. **Paciente archivado con cita de hoy o con avisos:** no aparece en Inicio ni en "Nueva sesión". → Task 2 `'inicio: archivados fuera'`.
3. **Datos guardados antes de este cambio** (sin `proximaCita`, `archivado`, `chequeo`): Inicio, lista, resumen y hoja funcionan sin errores. → Task 2 `'inicio: datos antiguos'`.
4. **Cambiar de paciente o de fase durante el chequeo:** el chequeo y la fase quedan del paciente correcto; "Bajar a la Fase N−1" cambia la rutina que se graba. → Task 3 `'chequeo: bajar de fase'`.
5. **Imprimir la hoja con textos largos** (nombre largo, notas): cabe en una página A4 sin cortar la tabla de ejercicios. → Task 4, revisión con `page.pdf({ format: 'A4' })` y número de páginas = 1.

---

### Task 1: Ficha editable, archivar pacientes y próxima cita en los datos

**Files:**
- Modify: `index.html` (`#dlg-paciente`: campo `proximaCita`; lista lateral: interruptor "Mostrar dados de alta"), `app.js` (`renderEncabezado`, `renderLista`, eventos de `#btn-nuevo` y del cierre de `#dlg-paciente`, `estado.verArchivados`), `data.js` (`generarDemo`: `proximaCita`), `styles.css`
- Test: `tests/ui/humo.mjs`

**Interfaces:**
- Produces: `abrirFormPaciente(p | null)` (null = nuevo; con `p` = editar, mismo `id`, conserva `sesiones`); `archivarPaciente(id, archivado: boolean)`; `estado.verArchivados: boolean`; `#btn-editar-ficha`, `#btn-archivar` ("Dar de alta (archivar)" / "Reactivar"), `#ver-archivados` (checkbox).
- Demo `proximaCita` (relativas a `hoyISO()` al generar): P-002 = hoy, P-004 = hoy − 3 días, P-001 = hoy + 2, P-003 = hoy + 5.

- [ ] **Step 1: Comprobaciones de humo que fallan:** `'ficha: editar'` (abrir ficha → Editar → cambiar ocupación a "Docente" → Guardar → `Ver ficha` muestra "Docente" y el id no cambia); `'ficha: archivar y reactivar'` (Dar de alta → el paciente desaparece de `.patient-item`; marcar `#ver-archivados` → aparece con "Dado de alta"; Reactivar → vuelve); `'ficha: próxima cita'` (Editar → próxima cita 2026-12-01 → `Ver ficha` muestra "1 de dic. de 2026" o el formato de `fmtFecha`).
- [ ] **Step 2: Correr** `node tests/ui/humo.mjs` → fallan las 3.
- [ ] **Step 3: Implementar** según Interfaces y "Editar ficha" de la spec. El título del diálogo cambia a "Editar paciente"; `confirm` antes de archivar: "¿Dar de alta a <nombre>? Dejará de aparecer en la lista y en el Inicio; puede reactivarlo cuando quiera."
- [ ] **Step 4: Correr** `node --test && node tests/ui/humo.mjs` → verde.
- [ ] **Step 5: Commit** `git commit -m "Ficha del paciente editable, dar de alta y próxima cita"`

---

### Task 2: Inicio del profesional

**Files:**
- Create: `inicio.js`, `tests/inicio.test.js`
- Modify: `index.html` (`<section id="inicio">` dentro de `<main>`, ítem `#nav-inicio` en la barra lateral, `#dlg-elegir-paciente`, `<script src="inicio.js">` después de `emg.js`), `app.js` (`estado.pantalla: 'inicio'|'paciente'`, `irInicio()`, `init` arranca en Inicio, `seleccionarPaciente` pone `pantalla = 'paciente'` y `seccion = seccionInicial(...)`), `styles.css`
- Test: `tests/ui/humo.mjs` (`nuevaPagina` gana `abrirPaciente = true`: tras cargar el panel hace clic en el primer `.patient-item`; los tests de Inicio pasan `abrirPaciente: false`)

**Interfaces:**
- Consumes: `lineaBase`, `medidasEmg` (emg.js).
- Produces (puras, exportadas):
  - `saludo(hora: number) -> 'Buenos días' | 'Buenas tardes' | 'Buenas noches'`
  - `pacientesActivos(db) -> paciente[]`
  - `sesionesDeLaSemana(db, hoy) -> number` (lunes de la semana de `hoy` hasta `hoy`, inclusive)
  - `citasDeHoy(db, hoy) -> paciente[]`
  - `motivosAtencion(p, hoy) -> { nivel: 'critical'|'warning'|'info', texto }[]` (motivos de la spec, más grave primero)
  - `pacientesConAtencion(db, hoy) -> { paciente, motivos }[]` (activos con ≥ 1 motivo; ordenados por el motivo más grave y luego por nombre)
  - `sesionesRecientes(db, n = 5) -> { paciente, sesion }[]` (por fecha descendente)
- DOM: `renderInicio()`, `irInicio()`; `#btn-nueva-sesion`, `#inicio-atencion li[data-id]`, `#inicio-citas li[data-id] .btn` ("Empezar"), `#dlg-elegir-paciente` con `#buscar-sesion` y `li[data-id]`.

- [ ] **Step 1: Pruebas unitarias que fallan** (`tests/inicio.test.js`): `saludo(9)`/`saludo(12)`/`saludo(19)`; `sesionesDeLaSemana` con hoy = `2026-10-28` (miércoles) cuenta sesiones del 26 al 28 y no la del 25; `citasDeHoy` ignora archivados; `motivosAtencion` con: cita vencida (`proximaCita: '2026-10-20'`, última sesión `2026-10-18`, hoy `2026-10-26`) → `warning` "Cita vencida"; misma cita con sesión el `2026-10-21` → sin ese motivo; dolor 3 → 6 → `warning`; `perdidaDatosPct: 1.2` → `critical` primero; sin sesiones → `info` "Aún sin sesiones"; última sesión hace 11 días → `info` "Sin sesión hace 11 días"; paciente sin `proximaCita`, `archivado` ni `emg` → no lanza.
- [ ] **Step 2: Comprobaciones de humo que fallan:** `'inicio: tras el login'` (sin `abrirPaciente`: se ve `#inicio`, saludo contiene el nombre `Prueba`, 4 cifras, `#btn-nueva-sesion` es el único primario visible en `main`); `'inicio: atención abre seguimiento'` (clic en el primer `#inicio-atencion li` → pantalla paciente, sección Seguimiento); `'inicio: nueva sesión'` (clic → `#dlg-elegir-paciente` → escribir "Luz" → elegir → paciente P-003 en Ejercicios); `'inicio: volver'` (desde un paciente, clic en `#nav-inicio` → `#inicio` visible); `'inicio: archivados fuera'` (archivar P-002 → no está en citas de hoy ni en atención); `'inicio: datos antiguos'` (sembrar en `localStorage` la demo sin `proximaCita`/`archivado` → Inicio sin errores).
- [ ] **Step 3: Correr** `node --test && node tests/ui/humo.mjs` → fallan las nuevas; ajustar `nuevaPagina` (abrirPaciente) para que las anteriores sigan pasando.
- [ ] **Step 4: Implementar** `inicio.js` y la pantalla según la spec (tarjetas de cifras con el mismo estilo `.kpi`; listas en tarjetas; en móvil una columna). La pantalla paciente y el Inicio se alternan con `hidden`; el bloque `#vacio` ("Seleccione un paciente") desaparece: sin paciente se ve el Inicio.
- [ ] **Step 5: Correr** → verde.
- [ ] **Step 6: Commit** `git commit -m "Agrega el Inicio del profesional: atención, citas de hoy y nueva sesión"`

---

### Task 3: Barra de pasos y chequeo de seguridad

**Files:**
- Create: `chequeo.js`, `tests/chequeo.test.js`
- Modify: `navegacion.js` (+ `tests/navegacion.test.js`), `index.html` (`#dlg-chequeo`; `<div class="pasos-sesion" data-paso="...">` en `#dlg-listos`, `#dlg-rutina`, `#dlg-prueba`, `#dlg-fin`), `rutina.js` (`#rt-iniciar` abre el chequeo; `abrirListos` se llama al continuar), `inicio.js` ("Nueva sesión" y "Empezar" terminan en `abrirChequeo`), `monitoreo.js` (`guardarSesionRutina` escribe `s.chequeo` con `tomarChequeo()`), `styles.css`
- Test: `tests/ui/humo.mjs` (`grabarRutina` completa el chequeo con dolor 2, No, Bien → Continuar)

**Interfaces:**
- Produces:
  - `PASOS_SESION: ['Chequeo', 'Dispositivo', 'Rutina', 'Prueba EMG', 'Cierre', 'Resumen']` y `htmlPasosSesion(actual: number, { pruebaOmitida = false } = {}) -> string` (navegacion.js, pura).
  - `evaluarChequeo({ dolorAntes, hormigueo, herida }, etapa) -> { nivel, mensaje, etapaSugerida | null }` (chequeo.js, pura). `etapaSugerida = etapa − 1` solo en `precaucion` con `etapa > 1`.
  - `abrirChequeo(alContinuar: () => void)`, `tomarChequeo() -> chequeo | null` (devuelve el chequeo pendiente y lo borra).
- Mensajes exactos: ok "Todo bien para empezar."; precaución "Haga la rutina con cuidado; considere bajar a la Fase N." / sin fase menor "Haga la rutina con cuidado y reduzca las repeticiones si hay dolor."; detener "Se recomienda no hacer la rutina hoy y consultar al médico tratante.". Debajo, siempre: "Recomendación orientativa: decide el profesional."

- [ ] **Step 1: Pruebas unitarias que fallan:** `evaluarChequeo` → ok (dolor 2, no, bien, fase 2); precaución (dolor 5, fase 2 → `etapaSugerida: 1`); precaución con fase 1 (`etapaSugerida: null`); precaución por hormigueo leve con dolor 0; detener por dolor 7, por hormigueo fuerte, por herida `enrojecida`, por herida `abierta`; `htmlPasosSesion(2)` contiene 6 elementos, los dos primeros con clase `hecho` y el tercero `actual`; con `{ pruebaOmitida: true }` el cuarto tiene `omitido`.
- [ ] **Step 2: Comprobaciones de humo que fallan:** `'chequeo: aparece antes'` ("Empezar rutina" → `#dlg-chequeo[open]`, no `#dlg-listos`); `'chequeo: dolor obligatorio'` (Continuar sin dolor → mensaje "Indique el dolor de 0 a 10."); `'chequeo: detener'` (herida abierta → primario "No hacer la sesión hoy"; "Continuar bajo mi criterio" deshabilitado hasta marcar la casilla); `'chequeo: bajar de fase'` (Fase 2, dolor 5 → "Bajar a la Fase 1" → continuar → la rutina grabada tiene `rutina.etapa === 1`); `'chequeo: Esc no empieza'` (Esc → no se abre `#dlg-listos`); `'chequeo: se guarda'` (rutina completa → `sesion.chequeo.dolorAntes === 2`, `nivel === 'ok'`); `'pasos: visibles'` (en `#dlg-listos` la barra marca "Dispositivo" como actual).
- [ ] **Step 3: Correr** → fallan.
- [ ] **Step 4: Implementar.** La barra de pasos se pinta al abrir cada ventana con `htmlPasosSesion`; en `#dlg-fin`, "Prueba EMG" aparece "omitida" si `mv.sesion.emgPrueba` es null.
- [ ] **Step 5: Correr** `node --test && node tests/ui/humo.mjs` → verde.
- [ ] **Step 6: Commit** `git commit -m "Sesión guiada: barra de pasos y chequeo de seguridad antes de la rutina"`

---

### Task 4: Cierre con próxima cita, resumen de la sesión y hoja para el paciente

**Files:**
- Create: `resumen-sesion.js`, `tests/resumen-sesion.test.js`
- Modify: `index.html` (`#dlg-fin`: "Dolor después (0–10)", `#fin-cita`, `#fin-sin-cita`; `#dlg-resumen`; `<section id="hoja-paciente">`), `rutina.js` (`guardarDesdeFin` pasa la cita y abre el Resumen), `monitoreo.js` (`guardarSesionRutina({ ..., proximaCita })` guarda `p.proximaCita` y ya no navega a Seguimiento: devuelve la sesión guardada), `styles.css` (`@media print`), `README.md` (flujo completo del médico)
- Test: `tests/ui/humo.mjs` (`'rutina completa con simulador'` termina con "Ver seguimiento")

**Interfaces:**
- Consumes: `tomarChequeo` (Task 3), `lineaBase`, `medidasEmg`, `ETAPAS`, `etapaPorNumero`, `EJERCICIOS`.
- Produces:
  - `sumarDiasISO(iso, n) -> iso` (pura; usada para el valor por defecto hoy + 7).
  - `comparacionConAnterior(p, s) -> string[]` (máx. 3 frases; ver spec).
  - `datosHojaPaciente(p, s) -> { nombre, fecha, hizo: {nombre, reps}[], comoVa: string[], ejercicios: {nombre, reps, sostenerS}[], cuidados: string[], proximaCita: string }`.
  - `guardarSesionRutina(...) -> sesion | null` (antes `boolean`).
  - `abrirResumen(p, s)`, `imprimirHojaPaciente(p, s)`.

- [ ] **Step 1: Pruebas unitarias que fallan:** `sumarDiasISO('2026-10-30', 7) === '2026-11-06'`; `comparacionConAnterior` con dos sesiones (flexión 46 → 52, chequeo dolor 5, EVA 3) contiene "Flexión de muñeca: 52° (+6° que la sesión anterior)" y "Dolor: 5 → 3 durante la sesión"; primera sesión → `["Primera sesión: será la referencia para comparar."]`; con EMG en ambas incluye "Índice del nervio mediano"; nunca más de 3 frases; `datosHojaPaciente` de una sesión de Fase 2 lista los 8 pasos de la Fase 2 con `reps` y los cuidados de la fase; sin `proximaCita` → `"Por definir"`.
- [ ] **Step 2: Comprobaciones de humo que fallan:** `'cierre: próxima cita'` (en `#dlg-fin`, `#fin-cita` vale hoy + 7; cambiarla y guardar → `paciente.proximaCita` igual); `'cierre: sin próxima cita'` (marcar `#fin-sin-cita` → `proximaCita === null`); `'resumen: tras guardar'` (`#dlg-resumen[open]` con al menos una frase y el primario "Volver al inicio"; clic → `#inicio` visible); `'resumen: ver seguimiento'` (→ Seguimiento › Una sesión con la sesión nueva); `'resumen: Esc vuelve al inicio'`; `'hoja: imprime una página'` (clic en "Hoja para el paciente" con `window.print` sustituido por una función que anota la llamada; `#hoja-paciente` contiene el nombre, "Ejercicios para casa" y "Próxima cita"; `page.emulateMedia({ media: 'print' })` + `page.pdf({ format: 'A4' })` → 1 página, contando `/Type /Page` en el PDF).
- [ ] **Step 3: Correr** → fallan.
- [ ] **Step 4: Implementar.** En `@media print` solo se ve `#hoja-paciente` (todo lo demás `display: none`), letra 12 pt, sin colores de fondo. Actualizar el README: sección "Flujo del profesional" con los 6 pasos, el chequeo y sus umbrales, la hoja y la próxima cita.
- [ ] **Step 5: Correr** `node --test && node tests/ui/humo.mjs` → verde; capturas del Inicio, el chequeo y el resumen (escritorio y móvil) revisadas.
- [ ] **Step 6: Commit** `git commit -m "Cierre con próxima cita, resumen de la sesión y hoja para el paciente"`
