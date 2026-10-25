# Rutinas por etapa de tratamiento — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La rutina de ejercicios depende de la etapa del tratamiento. El profesional puede revisar la rutina de cada etapa. La sesión en vivo solo se graba desde la rutina: primero se muestra "¿Listos para empezar?" y luego un ejercicio a la vez, con repeticiones, mensajes de cuidado y video (o "Video no adjuntado"). Los datos del dispositivo se guardan asociados al ejercicio de la rutina en curso.

**Architecture:** `rutinas.js` (nuevo) guarda el contenido clínico de las 3 etapas y funciones puras probadas con `node --test`. `monitoreo.js` expone una API de grabación por pasos de rutina y pierde los controles manuales de "Iniciar ejercicio" y la tarjeta "Paso 3". `rutina.js` maneja las tres ventanas emergentes (rutina en modo revisión o grabación, "¿Listos para empezar?" y "Rutina terminada"). `app.js` muestra la rutina grabada en "Detalle de sesión".

**Tech Stack:** HTML/CSS/JS sin compilación (scripts clásicos), `<dialog>` nativo, Node 24 `node --test` para las pruebas.

**Spec:** el pedido del usuario del 2026-10-14, con sus decisiones:
- Las rutinas dependen de la etapa del tratamiento; cada etapa tiene los movimientos que necesita (se pueden repetir entre etapas). Diseñarlas sin tener en cuenta los videos existentes; si ya hay un video del movimiento se usa, si no aparece "Video no adjuntado".
- Se puede revisar la rutina de cada etapa.
- La ventana de la rutina muestra la cantidad de repeticiones y mensajes de cuidado (no sobreesforzarse, etc.).
- La grabación se inicia desde la rutina. Antes del primer ejercicio aparece una ventana "¿Listos para empezar?".
- El paciente hace las repeticiones de cada ejercicio y los datos del dispositivo se guardan asociados al ejercicio en curso.
- No hace falta que el dispositivo esté conectado. **Decisión:** si no está conectado, se usa el simulador y la sesión queda marcada como simulada.
- El único lugar donde se graba la sesión o se toman datos es al iniciar la rutina.
- **Decisión:** la etapa se sugiere según las semanas desde la cirugía y el profesional puede cambiarla.
- **Decisión:** se pasa al ejercicio siguiente con un botón.
- **Decisión:** al terminar aparece una ventana "Rutina terminada" con dolor EVA, notas y conteos manuales, y desde ahí se guarda.

Plan anterior (base de lo que ya existe): [2026-10-14-rutina-videos-ejercicios.md](2026-10-14-rutina-videos-ejercicios.md).

## Global Constraints

- Todo el texto visible en español. Los mensajes clínicos son orientativos: la tarjeta de rutina lleva la línea fija "Rutina orientativa. El profesional debe ajustarla a cada paciente."
- Sin dependencias nuevas ni compilación. Orden de scripts en `index.html`: `data.js`, `rutinas.js`, `app.js`, `monitoreo.js`, `rutina.js`.
- Video de cada ejercicio: `videos/<id>.mp4`. Videos que ya existen y se reutilizan: `pronacion`, `supinacion`, `pulgar_abduccion`, `puno_gancho`, `pelota`. Si el archivo falta, el recuadro muestra exactamente "Video no adjuntado".
- Etapa sugerida por días desde `paciente.fechaCirugia` hasta hoy: `< 14` → Fase 1; `14–41` → Fase 2; `≥ 42` → Fase 3. Fecha futura, vacía o inválida → Fase 1.
- Un ejercicio de rutina con `tipo` (clave de `EJERCICIOS`: `flexion`, `extension`, `desv_radial`, `desv_cubital`, `puno`) se mide y cuenta repeticiones con el detector actual y además entra en `sesion.ejercicios`, como hoy. Un ejercicio sin `tipo` guarda la señal cruda de los 3 canales y su conteo es solo manual.
- Dentro de una misma etapa, cada `tipo` aparece como máximo una vez.
- La sesión guardada lleva `rutina: { etapa, pasos: [...] }` y `origen` (`'usb'` o `'simulador'`). Las sesiones viejas sin `rutina` deben seguir mostrándose igual.
- Ninguna otra parte de la interfaz puede iniciar una grabación: se eliminan `#mv-ejercicio`, `#mv-objetivo`, `#mv-iniciar`, el botón `#mv-rutina` y la tarjeta "Paso 3" (`#mv-tabla`, `#mv-dolor`, `#mv-notas`, `#mv-guardar`, `#mv-descartar`).
- Usar los tokens de color de `styles.css`, con modo claro y oscuro.
- No es repositorio git: no hay pasos de commit. Pruebas: `node --test` desde `interfaz-medico`.

## Contenido de las rutinas (fuente de verdad para `rutinas.js`)

Basado en protocolos habituales de rehabilitación tras la liberación del túnel carpiano: deslizamientos tendinosos (Wehbé), deslizamiento del nervio mediano (Totten y Hunter), movilidad activa desde la 2.ª semana y fortalecimiento progresivo desde la 6.ª. El profesional debe validar el contenido.

**Fase 1 — Protección y movilidad temprana** (`semanas: '0–2 semanas'`)
Descripción: "Movilidad suave de dedos y pulgar y deslizamientos de tendones y nervio, sin carga."
Cuidado general:
- "Movimientos lentos y suaves, sin fuerza ni peso."
- "Una leve tensión es normal; si aparece dolor fuerte, hormigueo o adormecimiento, deténgase."
- "Mantenga la herida limpia y seca."
- "Entre ejercicios, mantenga la mano elevada para reducir la hinchazón."

| id | nombre | tipo | reps | sostenerS | indicación | cuidado propio |
|---|---|---|---|---|---|---|
| `tendon_recto` | Deslizamiento tendinoso: mano recta | — | 10 | 5 | Dedos extendidos y juntos, muñeca neutra. | — |
| `puno_gancho` | Deslizamiento tendinoso: puño en gancho | — | 10 | 5 | Doble las articulaciones medias y finales; los nudillos quedan rectos. | — |
| `puno_completo` | Deslizamiento tendinoso: puño completo | `puno` | 10 | 5 | Cierre la mano por completo sin apretar. | No apriete el puño. |
| `mesa` | Deslizamiento tendinoso: posición de mesa | — | 10 | 5 | Doble solo los nudillos con los dedos rectos. | — |
| `puno_recto` | Deslizamiento tendinoso: puño recto | — | 10 | 5 | Doble nudillos y articulaciones medias; las puntas tocan la palma. | — |
| `pulgar_oposicion` | Oposición del pulgar | — | 10 | 2 | Toque con el pulgar la punta de cada dedo. | — |
| `nervio_mediano` | Deslizamiento del nervio mediano | — | 5 | 3 | Siga la secuencia indicada por el profesional, sin forzar. | Si siente hormigueo, haga el movimiento más corto. |

**Fase 2 — Movilidad activa** (`semanas: '2–6 semanas'`)
Descripción: "Recuperar el rango de movimiento de muñeca y antebrazo."
Cuidado general:
- "Llegue hasta una tensión cómoda, no hasta el dolor."
- "No haga rebotes ni movimientos bruscos."
- "Si el dolor pasa de 4/10 o dura más de una hora después, reduzca las repeticiones y avise al profesional."
- "Aún no levante objetos pesados."

| id | nombre | tipo | reps | sostenerS | indicación | cuidado propio |
|---|---|---|---|---|---|---|
| `flexion` | Flexión de muñeca | `flexion` | 10 | 5 | Antebrazo apoyado, palma hacia abajo; baje la mano. | — |
| `extension` | Extensión de muñeca | `extension` | 10 | 5 | Antebrazo apoyado, palma hacia abajo; suba la mano. | — |
| `desv_radial` | Desviación radial | `desv_radial` | 10 | 3 | Palma apoyada; lleve la mano hacia el pulgar. | — |
| `desv_cubital` | Desviación cubital | `desv_cubital` | 10 | 3 | Palma apoyada; lleve la mano hacia el meñique. | — |
| `pronacion` | Pronación de antebrazo | — | 10 | 3 | Codo pegado al cuerpo a 90°; gire la palma hacia abajo. | — |
| `supinacion` | Supinación de antebrazo | — | 10 | 3 | Codo pegado al cuerpo a 90°; gire la palma hacia arriba. | — |
| `puno_completo` | Puño completo | `puno` | 10 | 3 | Cierre la mano por completo y ábrala del todo. | No apriete el puño. |
| `pulgar_abduccion` | Abducción del pulgar | — | 10 | 3 | Separe el pulgar de la palma hacia arriba. | — |

**Fase 3 — Fortalecimiento** (`semanas: '6–12 semanas'`)
Descripción: "Fuerza de agarre y de muñeca con carga ligera y progresiva."
Cuidado general:
- "Empiece con poco peso (0,5 kg) o resistencia suave."
- "Durante el ejercicio el dolor no debe pasar de 3/10."
- "Descanse 30 a 60 segundos entre ejercicios."
- "Deténgase si aparece hormigueo o adormecimiento en los dedos."

| id | nombre | tipo | reps | sostenerS | indicación | cuidado propio |
|---|---|---|---|---|---|---|
| `pelota` | Apretar pelota terapéutica | `puno` | 10 | 3 | Apriete la pelota con toda la mano y suelte despacio. | Apriete sin llegar al dolor. |
| `pinza` | Pinza pulgar-índice | — | 10 | 3 | Apriete masilla o una pinza de ropa entre pulgar e índice. | — |
| `extension_carga` | Extensión de muñeca con peso ligero | `extension` | 10 | 2 | Antebrazo apoyado, palma hacia abajo; suba el peso despacio. | Use 0,5 kg al principio. |
| `flexion_carga` | Flexión de muñeca con peso ligero | `flexion` | 10 | 2 | Antebrazo apoyado, palma hacia arriba; suba el peso despacio. | Use 0,5 kg al principio. |
| `pronosup_martillo` | Prono-supinación con martillo | — | 10 | 2 | Sujete un martillo por el mango y gírelo despacio a cada lado. | Agarre más cerca de la cabeza si cuesta. |

## Review Focus

1. **Esc, ✕ o clic fuera durante la grabación**: no debe perderse nada en silencio. Se pregunta "¿Terminar la rutina ahora? Podrá guardar los ejercicios ya grabados." Si se acepta, se pasa a "Rutina terminada"; si no, la rutina sigue. → Tarea 3, paso 6.
2. **Volver con "Anterior" a un ejercicio ya grabado**: al grabarlo de nuevo reemplaza su registro y no lo duplica. → `test('guardarRegistroPaso reemplaza por id')` en la Tarea 1.
3. **La calibración falla o tarda más de 30 s en "¿Listos para empezar?"**: "Empezar" sigue deshabilitado, se muestra el motivo y un botón "Reintentar". → Tarea 3, paso 6.
4. **El dispositivo se desconecta a mitad de la rutina**: aviso, la rutina sigue, los pasos siguientes quedan sin datos y lo ya grabado se puede guardar. → Tarea 2, paso 5.
5. **Fecha de cirugía futura o vacía**: se sugiere Fase 1 sin errores. → `test('etapaSugerida con fecha futura o inválida')` en la Tarea 1.

---

### Task 1: Contenido de rutinas y funciones puras

**Files:**
- Create: `interfaz-medico/rutinas.js`
- Test: `interfaz-medico/tests/rutinas.test.js`

**Interfaces:**
- Produces:
  - `const ETAPAS: Array<{ numero: 1|2|3, nombre: string, semanas: string, descripcion: string, cuidado: string[], pasos: Paso[] }>`, donde `Paso = { id: string, nombre: string, tipo: string|null, reps: number, sostenerS: number, indicacion: string, cuidado: string[] }`. Usar el texto exacto de "Contenido de las rutinas" (`cuidado: []` cuando la columna dice —).
  - `etapaPorNumero(n: number) -> Etapa` (si `n` no existe, devuelve la Fase 1).
  - `etapaSugerida(fechaCirugiaISO: string, hoyISO: string) -> 1|2|3`, con los cortes de Global Constraints. Calcular los días con fechas a mediodía (`'T12:00:00'`), igual que `sumarDias` en `data.js`.
  - `guardarRegistroPaso(pasos: Registro[], registro: Registro) -> Registro[]`: devuelve un arreglo nuevo con el registro reemplazado si ya existía uno con el mismo `id` (en su posición) o agregado al final.
  - `resumenSenal(muestras: Array<{t, fe, rc, mcf}>) -> { duracionS: number, senal: { fs, fe: number[], rc: number[], mcf: number[] } } | null`: `null` si hay menos de 25 muestras o duran menos de 1 s (el mismo criterio que `finalizarEjercicio`). Valores redondeados a 1 decimal; `fs = (n-1)/duración`; `t` en segundos.
  - `if (typeof module !== 'undefined') module.exports = { ETAPAS, etapaPorNumero, etapaSugerida, guardarRegistroPaso, resumenSenal };`

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/rutinas.test.js`:
  - `test('hay 3 etapas con pasos')`: `ETAPAS.map(e => e.numero)` es `[1,2,3]`; cada etapa tiene `pasos.length >= 5` y `cuidado.length >= 3`.
  - `test('tipos válidos y sin repetir por etapa')`: con `const TIPOS = ['flexion','extension','desv_radial','desv_cubital','puno']`, cada `tipo` no nulo está en `TIPOS`, no hay dos pasos con el mismo `tipo` en una etapa y cada etapa tiene al menos un paso con `tipo`.
  - `test('ids únicos por etapa y reps positivas')`: los `id` no se repiten dentro de una etapa; `reps > 0` y `sostenerS >= 0`.
  - `test('etapaSugerida por días')`: con cirugía `'2026-10-01'`: hoy `'2026-10-14'` → 1; `'2026-10-15'` → 2; `'2026-11-11'` → 2; `'2026-11-12'` → 3; `'2027-03-01'` → 3.
  - `test('etapaSugerida con fecha futura o inválida')`: `('2026-12-01','2026-10-14')` → 1; `('', '2026-10-14')` → 1; `('xx','2026-10-14')` → 1.
  - `test('etapaPorNumero')`: `etapaPorNumero(2).numero === 2`; `etapaPorNumero(9).numero === 1`.
  - `test('guardarRegistroPaso reemplaza por id')`: `a=[{id:'x',r:1},{id:'y',r:1}]`; `guardarRegistroPaso(a,{id:'x',r:2})` da `[{id:'x',r:2},{id:'y',r:1}]` y `a` queda igual; con `{id:'z'}` el largo es 3 y `z` queda al final.
  - `test('resumenSenal')`: 51 muestras (`i = 0…50`) con `t = i*0.02`, `fe = i`, `rc = 0`, `mcf = 1.26` → `duracionS === 1`, `senal.fe.length === 51`, `senal.mcf[0] === 1.3`, `senal.fs === 50`; 24 muestras → `null`; 30 muestras en 0,5 s → `null`.

- [ ] **Step 2: Correr y verificar que fallan**
Run: `node --test` → FAIL con `Cannot find module '../rutinas.js'` (las 5 pruebas de `rutina.test.js` siguen pasando).

- [ ] **Step 3: Implementar `rutinas.js`** con las firmas de arriba. Comentario de encabezado en español que cite las fuentes de "Contenido de las rutinas" y la línea "Rutina orientativa. El profesional debe ajustarla a cada paciente." Sin acceso al DOM.

- [ ] **Step 4: Correr y verificar que pasan**
Run: `node --test` → `# pass 13`, `# fail 0`.

---

### Task 2: Grabación por pasos de rutina en `monitoreo.js`

**Files:**
- Modify: `interfaz-medico/monitoreo.js` (`iniciarEjercicio` ~235, `finalizarEjercicio` ~295, `sesionTieneDatos`/`descartarSesion`/`guardarSesion` ~338–388, `alternarConexion` ~400, `alPerderConexion` ~432, `renderMonitor*` ~464–556, `procesarLinea`, `initMonitor` ~678)
- Modify: `interfaz-medico/index.html` (tarjetas "Paso 2" y "Paso 3" del panel `vivo`; orden de scripts)

**Interfaces:**
- Consumes: `resumenSenal`, `guardarRegistroPaso` (Tarea 1).
- Produces (funciones globales que usa la Tarea 3):
  - `async asegurarConexion() -> void`: si `mv.conectado` no hace nada. Si no, conecta un `TransporteSimulado` con el mismo código que `alternarConexion` (sacar a `conectarCon(transporte, origen)` lo que comparten) y pone `#mv-origen` en `simulador`.
  - `calibrar()` (existe; sin cambios de firma).
  - `estadoDispositivo() -> { conectado: bool, origen: 'usb'|'simulador'|null, calibrando: bool, calOk: bool, calMotivo: string|null, calTiempoS: number|null }`.
  - `iniciarSesionRutina(etapa: number) -> void`: crea `mv.sesion` igual que hoy dentro de `iniciarEjercicio` y le agrega `rutina: { etapa, pasos: [] }`.
  - `iniciarPasoRutina(paso: Paso) -> void`: `mv.paso = { paso, muestras: [] }`; si `paso.tipo` y hay conexión, llama `iniciarEjercicio(paso.tipo, paso.reps)`; si no, envía `EJ,-`.
  - `finalizarPasoRutina() -> void`: si hay ejercicio en curso, lo finaliza y toma su registro. Arma `{ id, nombre, tipo, repeticionesObjetivo: paso.reps, repeticiones: registro?.repeticiones ?? null, repeticionesManual: null, duracionS }`; si no hay `tipo`, agrega `senal` de `resumenSenal`. Si `resumenSenal` es `null` y no hay registro, no guarda nada y avisa con `toast('<nombre>: sin datos suficientes, no se registró.')`. Guarda con `guardarRegistroPaso`. Deja `mv.paso = null`.
  - `repeticionesEnCurso() -> number|null`: `mv.ej.picos.length` si hay ejercicio medido en curso; si no, `null`.
  - `guardarSesionRutina({ dolor: number|null, notas: string, manuales: { [id]: number|null } }) -> boolean`: igual que `guardarSesion` pero con los valores recibidos (no lee el DOM), copia cada manual a `rutina.pasos[i].repeticionesManual` y al `sesion.ejercicios` del mismo `tipo`, y guarda `rutina` en la sesión. Exige al menos un elemento en `sesion.ejercicios`; si no hay, `toast('No se registró ningún ejercicio medido; no se puede guardar.')` y devuelve `false`.
  - `descartarSesion(preguntar)` (existe): además pone `mv.paso = null`.
- Cambios internos:
  - `iniciarEjercicio(tipo, objetivo)` recibe parámetros en vez de leer `#mv-ejercicio`/`#mv-objetivo`, y quita el `confirm` de repetido (lo reemplaza `guardarRegistroPaso`, y `finalizarEjercicio` ya reemplaza por `tipo`). `finalizarEjercicio()` devuelve el registro o `null`.
  - En `procesarLinea`, cada muestra `D` válida se agrega también a `mv.paso.muestras` si hay `mv.paso`.
  - `alPerderConexion`: si hay `mv.paso`, `toast('Se perdió la conexión: los ejercicios siguientes quedarán sin datos.')`; la rutina no se cancela.
  - `estadoConexion()` muestra "Registrando" cuando hay `mv.paso`.
  - Se eliminan `guardarSesion` (lo reemplaza `guardarSesionRutina`), `renderMonitorTabla` y los listeners de los controles borrados.

- [ ] **Step 1: Quitar los controles manuales del HTML.** En la tarjeta "Paso 2" queda solo el título "Señal en vivo", el texto `#mv-ej-ayuda` ("La grabación se inicia desde la rutina de rehabilitación."), `#mv-lecturas` y el gráfico. Se borra toda la tarjeta "Paso 3" y el botón `#mv-rutina`. Se agrega `<script src="rutinas.js"></script>` después de `data.js`.

- [ ] **Step 2: Implementar los cambios de `monitoreo.js`** listados arriba.

- [ ] **Step 3: Correr las pruebas**
Run: `node --test` → `# pass 13`, `# fail 0`.

- [ ] **Step 4: Verificar el flujo en el navegador por consola** (`preview_start {name: "interfaz-medico"}`, seleccionar paciente, pestaña "Monitoreo en vivo"). Con `javascript_tool`:
  1. `await asegurarConexion()` → `estadoDispositivo().origen === 'simulador'` y `conectado`.
  2. `calibrar()` y esperar a `estadoDispositivo().calOk === true` (≤ 10 s con el simulador).
  3. `iniciarSesionRutina(2)`; para `etapaPorNumero(2).pasos[0]` (flexión) y `[4]` (pronación): `iniciarPasoRutina(p)`, esperar 8 s, `finalizarPasoRutina()`.
  4. `mv.sesion.rutina.pasos` tiene 2 registros; el de flexión tiene `repeticiones > 0` y no tiene `senal`; el de pronación tiene `repeticiones === null` y `senal.fe.length > 0`; `mv.sesion.ejercicios` tiene 1 elemento con `tipo === 'flexion'`.
  5. Repetir el paso de flexión → sigue habiendo 2 registros.
  6. `guardarSesionRutina({ dolor: 2, notas: 'prueba', manuales: { flexion: 9 } })` → `true`. La nueva sesión del paciente tiene `origen: 'simulador'`, `rutina.etapa === 2` y `ejercicios[0].repeticionesManual === 9`.
  7. Sin errores en `read_console_messages`. Borrar la sesión de prueba del paciente (quitarla de `p.sesiones` y `guardarDB()`).

- [ ] **Step 5: Desconexión a mitad de paso.** `iniciarSesionRutina(2)`, `iniciarPasoRutina(flexión)`, esperar 4 s, `await desconectar()` → aparece el toast de conexión perdida; `finalizarPasoRutina()` guarda lo grabado; un `iniciarPasoRutina` + `finalizarPasoRutina` posterior no lanza errores y muestra el toast de "sin datos suficientes". Llamar `descartarSesion(false)`.

---

### Task 3: Tarjeta de etapa y ventanas de la rutina

**Files:**
- Modify: `interfaz-medico/index.html` (nueva tarjeta en el panel `vivo` antes de "Señal en vivo"; ampliar `#dlg-rutina`; nuevos `#dlg-listos` y `#dlg-fin`)
- Modify: `interfaz-medico/rutina.js` (quitar `RUTINA` y `nombreRutina`; mantener `crearRutina` y `rutaVideo`)
- Modify: `interfaz-medico/styles.css`
- Modify: `interfaz-medico/videos/LEEME.md`

**Interfaces:**
- Consumes: `ETAPAS`, `etapaPorNumero`, `etapaSugerida` (Tarea 1); `asegurarConexion`, `calibrar`, `estadoDispositivo`, `iniciarSesionRutina`, `iniciarPasoRutina`, `finalizarPasoRutina`, `repeticionesEnCurso`, `guardarSesionRutina`, `descartarSesion`, `mv.sesion` (Tarea 2); `estado`, `hoyISO`, `$`, `toast`, `esc` (`app.js`).
- Produces: `renderTarjetaRutina()` (la llama `renderMonitor` en `monitoreo.js`, para que se actualice al cambiar de paciente), `abrirRevision()`, `abrirListos()`, `empezarGrabacion()`, `terminarRutina()`.

- [ ] **Step 1: Tarjeta "Rutina de rehabilitación"** (`#rt-tarjeta`):
  - Selector segmentado `.seg` con "Fase 1", "Fase 2" y "Fase 3" (`data-etapa`). Al cambiar de paciente se selecciona la sugerida, que lleva la etiqueta "Sugerida".
  - Debajo: "Fase N — <nombre> · <semanas>", la descripción y la línea "Sugerida por <d> días desde la cirugía."
  - Lista de pasos: nombre, "10 repeticiones · sostener 5 s" (sin "· sostener" cuando `sostenerS` es 0) y la marca "Medido por el dispositivo" cuando tiene `tipo`.
  - Cuidado general de la etapa como lista, y la línea "Rutina orientativa. El profesional debe ajustarla a cada paciente."
  - Botones "Revisar rutina" (`#rt-revisar`) e "Iniciar rutina" (`#rt-iniciar`, primario).
  - La etapa elegida vive en la variable de módulo `etapaElegida` de `rutina.js`.

- [ ] **Step 2: Ampliar `#dlg-rutina`.** A la izquierda va el video (como hoy). A la derecha, el panel `.rt-info` con:
  - `#rt-modo`: badge "Revisión" o "Grabando" con punto rojo.
  - `#rt-reps`: "10 repeticiones · sostener 5 s", grande.
  - `#rt-indicacion`.
  - `#rt-cuidado`: lista con el cuidado propio del paso y luego el general de la etapa.
  - `#rt-contador`, solo al grabar: para pasos con `tipo`, "Detectadas: 4 / 10", que se actualiza cada 250 ms con `repeticionesEnCurso()`; sin `tipo`, "Cuente las repeticiones; las anotará al final."
  - Debajo de 900 px de ancho el panel queda debajo del video.
  - `#rt-paso` sigue como "Ejercicio N de M · Fase N".
  - El aviso de video faltante cambia a "Video no adjuntado".

- [ ] **Step 3: Modos de `#dlg-rutina` en `rutina.js`.**
  - **Revisión** (`abrirRevision()`): navega los pasos de `etapaElegida` y no graba. Se cierra como hoy.
  - **Grabación** (lo abre `empezarGrabacion()`):
    - Al mostrar cada paso llama `iniciarPasoRutina(paso)`, y antes de cambiar de paso llama `finalizarPasoRutina()`. "Anterior" está permitido y vuelve a grabar ese paso.
    - En el último paso, "Siguiente" pasa a llamarse "Terminar rutina" y llama `terminarRutina()`.
    - El clic en el fondo no cierra. Esc (evento `cancel`, con `preventDefault`) y ✕ preguntan `confirm('¿Terminar la rutina ahora? Podrá guardar los ejercicios ya grabados.')`: si se acepta, `terminarRutina()`.
    - Mientras graba, el contador se refresca con un `setInterval` de 250 ms, que se limpia al cerrar.

- [ ] **Step 4: `#dlg-listos`, "¿Listos para empezar?"** (`abrirListos()`, desde "Iniciar rutina"):
  - Muestra "Fase N — <nombre>", "<M> ejercicios" y el paciente.
  - Estado del dispositivo:
    - USB conectado: "Dispositivo conectado".
    - Si no: llama `asegurarConexion()` y muestra "Sin dispositivo: se usará el simulador y la sesión quedará marcada como simulada."
  - Calibración: si no está `calOk`, llama `calibrar()`. Muestra "Calibrando… mantenga la mano quieta en posición neutra", luego "Calibrado en X s", o "Falló: <motivo>" con el botón "Reintentar". Se consulta cada 200 ms con `estadoDispositivo()`.
  - Recordatorios:
    - "Siéntese cómodo con el antebrazo apoyado."
    - "Haga cada movimiento despacio y sin dolor."
    - "Deténgase si siente dolor intenso, hormigueo o adormecimiento."
  - "Cancelar" cierra la ventana y no graba nada.
  - "Empezar" está deshabilitado hasta `calOk`. Al pulsarlo: `iniciarSesionRutina(etapaElegida)`, cierra esta ventana y llama `empezarGrabacion()`, que abre `#dlg-rutina` en el paso 1.
  - Si `mv.sesion` ya existe con datos, primero `confirm('Hay una sesión sin guardar. ¿Descartarla y empezar una nueva?')` y luego `descartarSesion(false)`.

- [ ] **Step 5: `#dlg-fin`, "Rutina terminada"** (`terminarRutina()`): finaliza el paso en curso, cierra `#dlg-rutina` y muestra:
  - Una tabla con los pasos grabados: nombre, objetivo, detectadas ("—" si no se mide) y un `input number` de conteo manual por paso (`data-id`).
  - Dolor EVA 0–10 y notas.
  - "Descartar sesión" (`confirm` → `descartarSesion(false)`) y "Guardar sesión", que llama `guardarSesionRutina({...})` y cierra si devuelve `true`.
  - Esc equivale a Descartar con confirmación.
  - Si no se grabó ningún paso, muestra "No se grabó ningún ejercicio." y solo "Cerrar".

- [ ] **Step 6: Verificar en el navegador** (simulador; paciente con cirugía hace 20 días, o ajustar `fechaCirugia` por consola y recargar):
  - La tarjeta sugiere Fase 2 y cambiar a Fase 1 o Fase 3 actualiza la lista.
  - "Revisar rutina" de Fase 3 recorre 5 pasos. "Apretar pelota terapéutica" reproduce video y "Pinza pulgar-índice" muestra "Video no adjuntado". No aparecen contador ni badge "Grabando".
  - "Iniciar rutina" desconectado: aparece el aviso de simulador, la calibración termina y "Empezar" se habilita. Para el caso de falla: forzar `mv.cal = { ok:false, motivo:'prueba' }` → se ve el motivo y "Reintentar".
  - En grabación, "Detectadas" sube en un paso medido; Esc pide confirmación y "Cancelar" deja la rutina abierta; "Terminar rutina" abre "Rutina terminada" con los pasos.
  - Guardar con EVA 2 → toast de guardado y la sesión aparece en Detalle (Tarea 4). Borrar después la sesión de prueba.
  - Sin errores de consola, salvo los 404 de videos faltantes.
  - A 1366×768 y en `mobile` nada se desborda. En modo oscuro se ve bien. Volver a `preset: "desktop"` y tomar una captura.

- [ ] **Step 7: Actualizar `videos/LEEME.md`** con la tabla de todos los `id` únicos de `ETAPAS` (nombre y si el video está adjunto o no) y la explicación de que el contenido de las rutinas está en `rutinas.js`.

---

### Task 4: Rutina en "Detalle de sesión" y documentación

**Files:**
- Modify: `interfaz-medico/app.js` (`renderSesion` ~436)
- Modify: `interfaz-medico/index.html` (panel `sesion`)
- Modify: `interfaz-medico/README.md` (mantener finales de línea CRLF)

**Interfaces:**
- Consumes: `etapaPorNumero` (Tarea 1); formato `sesion.rutina` (Tarea 2).

- [ ] **Step 1: Tarjeta `#sesion-rutina`** en el panel "Detalle de sesión", después de la tabla de ejercicios. Si la sesión tiene `rutina`, muestra:
  - El título "Rutina: Fase N — <nombre>".
  - Una tabla con ejercicio, objetivo, detectadas, manual y duración (s).
  - La marca "Medido" en los pasos con `tipo`.
  - Si la sesión no tiene `rutina`, la tarjeta queda oculta (`hidden`).

- [ ] **Step 2: Verificar** que una sesión de demostración (sin `rutina`) se ve igual que antes, que una sesión grabada desde la rutina muestra la tarjeta, y que Evolución, Comparar e Historial no tienen errores de consola con ambas.

- [ ] **Step 3: README.**
  - En la fila "Monitoreo en vivo": rutina por etapa, sugerida por semanas, revisión, "¿Listos para empezar?", grabación por ejercicio, simulador si no hay dispositivo y "Rutina terminada".
  - En "Monitoreo en vivo": reemplazar el flujo por **Elegir etapa → Iniciar rutina → ¿Listos para empezar? (conexión y calibración) → ejercicio por ejercicio → Rutina terminada → Guardar sesión**.
  - Documentar el campo `rutina` en "Formato de archivo de sesión".
  - Agregar `rutinas.js` a "Archivos".

- [ ] **Step 4: Correr las pruebas**
Run: `node --test` → `# pass 13`, `# fail 0`.
