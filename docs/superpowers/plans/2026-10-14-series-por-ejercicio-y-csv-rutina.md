# Series por ejercicio y CSV con la rutina — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Evolución, Comparar, Detalle, KPIs e Historial no mezclen ejercicios distintos que se miden con el mismo canal del sensor (p. ej. "Apretar pelota" y "Puño completo", o "Flexión con peso" y "Flexión"), y que el CSV del paciente incluya todos los pasos de la rutina con sus conteos manuales.

**Architecture:** Un archivo puro nuevo, `series.js`, define las **variantes**: un ejercicio medido comparable consigo mismo, identificado por el `id` del paso de la rutina. Trae también los helpers para ubicar cada ejercicio guardado en su variante y para armar las filas del CSV, y se prueba con `node --test`. `monitoreo.js` guarda el `pasoId` en cada ejercicio medido al grabar la rutina. Las sesiones viejas (sin `pasoId`) caen en la variante base de su `tipo`, así que se ven igual que hoy. `app.js` reemplaza `ejercicioDe(s, tipo)` por búsquedas por variante en todas las vistas.

**Tech Stack:** JS sin compilación (scripts clásicos), Chart.js 4 (ya cargado), Node 24 `node --test`.

**Spec:** pedido del usuario del 2026-10-14: "planifica cómo separar en Evolución los ejercicios distintos que comparten tipo entre etapas, y agregar los pasos de la rutina al CSV". Viene de los hallazgos 4 y 5 de la revisión final del plan [2026-10-14-rutinas-por-etapa.md](2026-10-14-rutinas-por-etapa.md):
- **Hallazgo 4:** en la Fase 3, `pelota` (tipo `puno`) se compara con el puño completo de las fases 1 y 2, y `flexion_carga` con `flexion`. Esto genera falsos "disminuyó" en el cambio de etapa.
- **Hallazgo 5:** el CSV no incluye los pasos sin medición ni los conteos manuales.

## Global Constraints

- Texto visible en español.
- Sin dependencias nuevas. Orden de scripts: `data.js`, `rutinas.js`, `series.js`, `app.js`, `monitoreo.js`, `rutina.js`.
- Variantes (orden de las series), con texto exacto:

| id | tipo | nombre | corto | conCarga |
|---|---|---|---|---|
| `flexion` | flexion | Flexión de muñeca | Flexión | no |
| `flexion_carga` | flexion | Flexión de muñeca con peso ligero | Flexión c/ peso | sí |
| `extension` | extension | Extensión de muñeca | Extensión | no |
| `extension_carga` | extension | Extensión de muñeca con peso ligero | Extensión c/ peso | sí |
| `desv_radial` | desv_radial | Desviación radial | Desv. radial | no |
| `desv_cubital` | desv_cubital | Desviación cubital | Desv. cubital | no |
| `puno_completo` | puno | Puño completo | Puño | no |
| `pelota` | puno | Apretar pelota terapéutica | Pelota | sí |

- Variante base por tipo (para ejercicios sin `pasoId`, como las sesiones de demostración, las importadas y las anteriores a este cambio): `flexion→flexion`, `extension→extension`, `desv_radial→desv_radial`, `desv_cubital→desv_cubital`, `puno→puno_completo`.
- Color de la serie: el de `EJERCICIOS[tipo].color`. Las variantes `conCarga` usan línea punteada (`borderDash: [6, 4]`) y punto `rectRot`. No se agregan tokens de color.
- El % de referencia de cualquier variante usa `EJERCICIOS[tipo].ref`.
- Las sesiones viejas deben verse exactamente igual que hoy: mismas 5 series, mismas observaciones, mismas columnas.
- CSV: separador `;`, coma decimal **solo en números**. Los textos van entre comillas dobles (con las comillas internas duplicadas) cuando contienen `;`, `"` o salto de línea. BOM UTF-8 y `\r\n`, como hoy. Se mantienen las 16 columnas actuales en su orden y se agregan al final: `variante`, `etapa`, `paso_id`, `paso_nombre`, `medido`, `repeticiones_manual`.
- Finales de línea: `app.js`, `monitoreo.js` y `README.md` son CRLF; `index.html`, `rutina.js`, `rutinas.js` y los archivos nuevos son LF. No usar `sed -i` en archivos CRLF.
- No es repositorio git: no hay commits. Pruebas: `node --test` desde `interfaz-medico` (hoy pasan 14).

## Review Focus

1. **Sesiones de demostración, sin `pasoId`**: Evolución, KPIs, Observaciones, Comparar, Detalle e Historial se ven idénticos a antes. → `test('varianteDe sin pasoId usa la variante base')` + comparación en el navegador (Tarea 2, paso 5).
2. **Cambio de Fase 2 a Fase 3**: "Apretar pelota" no se compara con "Puño completo" ni aparece "disminuyó". En su lugar sale una observación informativa de ejercicio nuevo. → `test('anteriorConVariante no cruza variantes')` + paso 5.
3. **`pasoId` desconocido o con `tipo` que no coincide** (archivo importado o editado): cae en la variante base de su `tipo`, sin errores. → `test('varianteDe con pasoId inválido')`.
4. **Ejercicio medido sin paso que le corresponda** (un registro huérfano dentro de una sesión de rutina): igual sale en el CSV y no se pierde. → `test('filasRutina incluye ejercicios huérfanos')`.
5. **Nombres con `;` o comillas en el CSV**: no rompen las columnas. → `test('celdaCSV')`.

---

### Task 1: `series.js`, variantes y helpers puros

**Files:**
- Create: `interfaz-medico/series.js`
- Test: `interfaz-medico/tests/series.test.js`

**Interfaces:**
- Consumes: `ETAPAS`, `etapaPorNumero` (de `rutinas.js`). En Node se obtienen con `require('../rutinas.js')` dentro de la prueba. `series.js` las usa como globales y, cuando existe `module`, las toma de `require('./rutinas.js')`.
- Produces:
  - `const VARIANTES: { [id]: { tipo, nombre, corto, conCarga: boolean } }` y `const ORDEN_VARIANTES: string[]`, con la tabla de Global Constraints.
  - `const VARIANTE_BASE: { [tipo]: id }`.
  - `varianteDe(ejercicio) -> string|undefined`: devuelve `ejercicio.pasoId` si existe en `VARIANTES` y su `tipo` coincide con `ejercicio.tipo`. Si no, devuelve `VARIANTE_BASE[ejercicio.tipo]`.
  - `ejercicioDeVariante(sesion, v) -> ejercicio|undefined`.
  - `variantesPresentes(sesiones) -> string[]`: las variantes que aparecen en al menos una sesión, en el orden de `ORDEN_VARIANTES`.
  - `anteriorConVariante(sesiones, idx, v) -> { sesion, ejercicio } | null`: la sesión más reciente con índice `< idx` que tiene esa variante.
  - `filasRutina(sesion) -> Array<{ variante, etapa, pasoId, pasoNombre, medido, ejercicio, repeticionesObjetivo, repeticionesManual, duracionS }>`. Algoritmo:
    - **Sesión con `rutina`**: una fila por paso, en el orden de `etapaPorNumero(etapa).pasos`; los ids que no están en la etapa van al final, en su orden guardado.
      - `ejercicio` = el de `sesion.ejercicios` cuya `varianteDe` es `paso.id` o, si no hay, el de mismo `tipo`. Si el paso no tiene `tipo`, queda `null`.
      - `medido` = `!!paso.tipo`.
      - `repeticionesObjetivo`, `repeticionesManual` y `duracionS` salen del paso.
      - Al final, una fila más por cada ejercicio medido que no quedó asociado a ningún paso (huérfano), con `pasoId: null`, `pasoNombre: null`, `medido: true` y `etapa` de la sesión.
    - **Sesión sin `rutina`**: una fila por ejercicio, con `etapa`, `pasoId` y `pasoNombre` en `null`, `medido: true`, `repeticionesObjetivo` del ejercicio y `repeticionesManual: ejercicio.repeticionesManual ?? null`.
    - **Sesión sin `rutina` ni ejercicios**: una fila con todo en `null` salvo `medido: false`.
    - `variante` = `varianteDe(ejercicio)` si hay ejercicio; si no, `null`.
  - `celdaCSV(v) -> string`:
    - `null`/`undefined` → `''`.
    - Número finito → `String(v).replace('.', ',')`.
    - Booleano → `'sí'`/`'no'`.
    - Texto → el mismo texto, entre comillas dobles (con las comillas internas duplicadas) si contiene `;`, `"`, `\r` o `\n`.
  - `module.exports = { VARIANTES, ORDEN_VARIANTES, VARIANTE_BASE, varianteDe, ejercicioDeVariante, variantesPresentes, anteriorConVariante, filasRutina, celdaCSV }` con la guarda de siempre.

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/series.test.js`:
  - `test('cada paso medido de las rutinas tiene variante con el mismo tipo')`: para todo paso de `ETAPAS` con `tipo`, `VARIANTES[paso.id]` existe y `VARIANTES[paso.id].tipo === paso.tipo`.
  - `test('varianteDe sin pasoId usa la variante base')`: `varianteDe({tipo:'puno'}) === 'puno_completo'`; `varianteDe({tipo:'flexion'}) === 'flexion'`.
  - `test('varianteDe con pasoId')`: `varianteDe({tipo:'puno', pasoId:'pelota'}) === 'pelota'`; `varianteDe({tipo:'flexion', pasoId:'flexion_carga'}) === 'flexion_carga'`.
  - `test('varianteDe con pasoId inválido')`: `{tipo:'puno', pasoId:'xx'}` → `'puno_completo'`; `{tipo:'puno', pasoId:'flexion_carga'}` → `'puno_completo'`.
  - `test('anteriorConVariante no cruza variantes')`: `S = [s0 {ejercicios:[{tipo:'puno', anguloMax:60}]}, s1 {ejercicios:[{tipo:'flexion', anguloMax:50}]}, s2 {ejercicios:[{tipo:'puno', pasoId:'pelota', anguloMax:40}]}]` → `anteriorConVariante(S, 2, 'pelota') === null`; `anteriorConVariante(S, 2, 'puno_completo').sesion === S[0]`.
  - `test('variantesPresentes respeta el orden')`: con `S` de arriba da `['flexion', 'puno_completo', 'pelota']`.
  - `test('filasRutina sigue el orden de la etapa')`: sesión `{ rutina: { etapa: 2, pasos: [pronacion(sin tipo), flexion(tipo flexion)] }, ejercicios: [{tipo:'flexion', pasoId:'flexion', anguloMax: 50}] }` → 2 filas; la primera es `pasoId 'flexion'` con `ejercicio.anguloMax === 50` y `medido: true`; la segunda es `'pronacion'` con `ejercicio === null` y `medido: false`.
  - `test('filasRutina incluye ejercicios huérfanos')`: rutina de etapa 2 con solo `pronacion` y `ejercicios: [{tipo:'extension', anguloMax: 40}]` → 2 filas; la última tiene `pasoId: null`, `variante: 'extension'` y `medido: true`.
  - `test('filasRutina sin rutina')`: 2 ejercicios → 2 filas con `etapa: null`; `{ejercicios: []}` → 1 fila con `medido: false`.
  - `test('celdaCSV')`: `celdaCSV(1.5) === '1,5'`; `celdaCSV(null) === ''`; `celdaCSV(true) === 'sí'`; `celdaCSV('a;b') === '"a;b"'`; `celdaCSV('di "x"') === '"di ""x"""'`; `celdaCSV('Flexión 0.5 kg') === 'Flexión 0.5 kg'`.

- [ ] **Step 2: Correr y verificar que fallan.** Run: `node --test` → FAIL con `Cannot find module '../series.js'`; las 14 anteriores siguen pasando.

- [ ] **Step 3: Implementar `series.js`** con las firmas de arriba. Lleva un comentario de encabezado que explique qué es una variante y por qué existe, y no accede al DOM. Agregar `<script src="series.js"></script>` en `index.html` después de `rutinas.js`.

- [ ] **Step 4: Correr y verificar que pasan.** Run: `node --test` → `# pass 24`, `# fail 0`.

---

### Task 2: Vistas por variante y `pasoId` al grabar

**Files:**
- Modify: `interfaz-medico/monitoreo.js` (`guardarSesionRutina`, ~línea 420)
- Modify: `interfaz-medico/app.js` (`renderKPIs` ~222, `renderEvolucion` ~280, `renderObservaciones` ~378, `renderSesion` ~441, `renderComparar` ~548, `renderHistorial` ~605, `validarSesion`)

**Interfaces:**
- Consumes: todo lo de la Tarea 1.
- Produces: ejercicios guardados con `pasoId`. Se elimina `ejercicioDe(s, tipo)` de `app.js`; ninguna vista lo usa.

- [ ] **Step 1: `monitoreo.js`.** En `guardarSesionRutina`, al copiar `ejercicios`, cada ejercicio que tenga un paso del mismo `tipo` en la rutina recibe `pasoId: <id del paso>` (además del manual, como hoy).

- [ ] **Step 2: `app.js`, Evolución y KPIs.**
  - **Gráfico de ROM:** una serie por cada `variantesPresentes(ses)`. Etiqueta `VARIANTES[v].corto`; color, punteado y punto según Global Constraints. Valor: `ejercicioDeVariante(s, v)?.anguloMax`; en modo % se divide por `EJERCICIOS[tipo].ref`. El tooltip usa el nombre de la variante.
  - **KPIs:** las tarjetas de Flexión y Extensión usan la variante del tipo presente en la última sesión (la base si no hay ninguna). La etiqueta es `VARIANTES[v].nombre + ' (último)'`. El delta se calcula contra la **primera sesión que tiene esa misma variante**.

- [ ] **Step 3: `app.js`, Observaciones.** Se recorren las variantes de `variantesPresentes(ses)`:
  - **"Disminuyó":** se compara con `anteriorConVariante(ses, n-1, v)`. Si esa sesión no es la inmediatamente anterior, el texto dice "respecto a su registro anterior (<fecha corta>)" en lugar de "respecto a la sesión anterior".
  - **"Sin cambios":** usa las últimas 3 sesiones **que tienen la variante**.
  - **"Mayor ganancia":** compara la primera y la última sesión que tienen la variante.
  - **Observación nueva (nivel `info`):** si la variante aparece por primera vez en la última sesión y es `conCarga`, se dice: `"<b>{nombre}:</b> ejercicio nuevo desde esta sesión; se muestra como serie aparte y no se compara con {nombre de la variante base}."`.
  - Los nombres en minúscula se toman de `VARIANTES[v].nombre`.

- [ ] **Step 4: `app.js`, Detalle, Comparar e Historial.**
  - **Detalle:**
    - Filas por variante presente en la sesión, en orden de `ORDEN_VARIANTES`, con `VARIANTES[v].nombre` y el swatch de su tipo.
    - "Δ vs. anterior" se calcula contra `anteriorConVariante`; si no hay, "—".
    - `#ejercicio-select` lista las variantes con su nombre. `estado.ejercicio` guarda un id de variante: si el valor guardado no está en la sesión, toma la primera.
  - **Comparar:** filas y barras por variante presente en A o en B, con etiquetas `corto`. Cada fila compara la misma variante, y si falta en una de las dos sesiones va "—".
  - **Historial:** las columnas Flexión y Extensión muestran la variante del tipo que tenga la sesión. Si es `conCarga`, el valor lleva ` <small class="muted">c/ peso</small>`.
  - **`validarSesion`:** acepta `pasoId` opcional en los ejercicios (sin validarlo: `varianteDe` ya resuelve los inválidos).

- [ ] **Step 5: Verificar en el navegador** (`preview_start {name: "interfaz-medico"}`, `resize_window` 1366×768, recarga forzada):
  - **Sin cambios en la demostración:** en un paciente de demostración, antes y después del cambio el texto de `#observaciones`, `#kpis` y `#tabla-historial` es idéntico. Capturarlo con `get_page_text` o `innerText` antes de editar `app.js`, y comparar. El gráfico ROM tiene las mismas 5 series.
  - **Cambio de etapa:** a un paciente de demostración se le agregan por consola 2 sesiones nuevas con `guardarDB()`:
    - **Fase 2:** `{tipo:'puno', pasoId:'puno_completo', anguloMax:70}` y `{tipo:'flexion', pasoId:'flexion', anguloMax:55}`.
    - **Fase 3:** `{tipo:'puno', pasoId:'pelota', anguloMax:35}` y `{tipo:'flexion', pasoId:'flexion_carga', anguloMax:40}`.

    Con todos los campos obligatorios y una `rutina` coherente.

    Comprobar:
    - Evolución muestra las series "Pelota" y "Flexión c/ peso" punteadas.
    - No hay "disminuyó" para Puño ni Flexión, y sí aparecen las 2 observaciones de "ejercicio nuevo".
    - El KPI dice "Flexión de muñeca con peso ligero (último)".
    - Comparar muestra filas separadas para Puño y Pelota.
    - Detalle de la sesión de Fase 3 lista "Apretar pelota terapéutica".
    - Historial muestra "40,0° c/ peso".
  - **Grabación real:** grabar una rutina de Fase 3 con el simulador y guardarla. Los ejercicios guardados tienen `pasoId` (`pelota`, `extension_carga`, `flexion_carga`).
  - Sin errores de consola. Borrar las sesiones de prueba; viewport en `desktop`.

---

### Task 3: CSV con los pasos de la rutina

**Files:**
- Modify: `interfaz-medico/app.js` (`exportarCSV`, ~línea 702)
- Modify: `interfaz-medico/README.md`

**Interfaces:**
- Consumes: `filasRutina`, `celdaCSV`, `VARIANTES` (Tarea 1).

- [ ] **Step 1: Reescribir `exportarCSV(p)`.**
  - **Encabezado:** las 16 columnas actuales, en el mismo orden, y luego `variante`, `etapa`, `paso_id`, `paso_nombre`, `medido`, `repeticiones_manual`.
  - **Filas:** una por cada elemento de `filasRutina(s)`, recorriendo las sesiones de `sesionesOrdenadas(p)`.
    - Columnas de sesión: como hoy.
    - `ejercicio`: `fila.ejercicio?.tipo`.
    - `repeticiones`: `fila.ejercicio?.repeticiones`.
    - `repeticiones_objetivo`: `fila.repeticionesObjetivo ?? fila.ejercicio?.repeticionesObjetivo`.
    - `angulo_max`, `angulo_min`, `velocidad_media` y `variabilidad_pct`: los del ejercicio.
    - `duracion_s`: `fila.ejercicio?.duracionS ?? fila.duracionS`.
    - `variante`: el `nombre` de `VARIANTES[fila.variante]`, o vacío.
    - `etapa`, `paso_id`, `paso_nombre`, `medido` y `repeticiones_manual`: de la fila.
  - Cada celda pasa por `celdaCSV`. El nombre del archivo no cambia.

- [ ] **Step 2: Verificar en el navegador.**
  - **Demostración:** exportar el CSV de un paciente de demostración, interceptando `descargar` desde la consola para leer el contenido.
    - Hay tantas filas de datos como ejercicios.
    - Las primeras 16 columnas son iguales a las de antes para la misma sesión: comparar con una exportación hecha antes de editar, usando `exportarCSV` original guardado en una variable.
    - Las 6 columnas nuevas tienen `variante` llena, `medido = sí` y el resto vacío.
  - **Rutina de Fase 1:** grabar una rutina de Fase 1 con el simulador y guardarla.
    - El CSV tiene una fila por paso grabado, en el orden de la etapa, con `paso_nombre`.
    - Los pasos sin medición tienen las columnas de ángulo vacías y `medido = no`.
    - Los conteos manuales que se ingresaron aparecen en `repeticiones_manual`.
    - Ninguna fila tiene una cantidad de columnas distinta del encabezado: contar los `;` fuera de comillas.
  - Borrar la sesión de prueba.

- [ ] **Step 3: README.**
  - En "Historial y notas", explicar que el CSV incluye una fila por paso de la rutina y describir las 6 columnas nuevas.
  - En "Evolución", explicar que los ejercicios distintos que usan el mismo sensor (con peso, pelota) se grafican como series aparte, punteadas.
  - Agregar `series.js` a "Archivos".
  - Mantener CRLF.

- [ ] **Step 4: Correr las pruebas.** Run: `node --test` → `# pass 24`, `# fail 0`.
