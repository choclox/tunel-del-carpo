# Calibración única por sesión — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la calibración de "¿Listos para empezar?" sirva para todos los ejercicios de la sesión y que ningún paso vuelva a pedir `CAL` en medio de la rutina.

**Architecture:** El firmware gana un "cero de postura" instantáneo (`CERO` / `CERO,-`): toma la orientación del momento como referencia de los ángulos, sin esperar quietud, sin medir sesgo y sin tocar el reposo EMG. La interfaz lo pide al terminar la cuenta regresiva de los pasos que empiezan en otra postura (desviaciones, prono-supinación) y lo quita al cerrar el paso. Todo lo que mide `CAL` (sesgo del giroscopio, convergencia del filtro, reposo EMG) se mide una sola vez al empezar.

**Tech Stack:** Firmware C++ (ESP32-C6, pruebas con `python3 firmware/pruebas/correr.py`); interfaz JS clásica sin build (`node --test`, humo `node tests/ui/humo.mjs`).

**Spec:** este documento (sección "Problema" y "Decisiones").

## Problema

Hoy los pasos con `recalibrar: true` envían `CAL` en medio de la rutina: desviación radial y cubital, pronación, supinación y martillo. Ese `CAL` falla en la práctica, y cuando falla el paso deja de contar.

1. **Se pide en el peor momento.** `iniciarPasoRutina` (monitoreo.js) envía `CAL` al entrar al paso, antes de "Empezar paso" y de la cuenta regresiva. En ese momento el paciente todavía mira el video y acomoda el brazo en la postura nueva.
2. **`CAL` exige quietud y tarda.** Pide 1 s de quietud y 1,5 s de convergencia, y cualquier movimiento reinicia la ventana. A los 10 s se rinde con `CAL,ERR,movimiento`. Además se rechaza si el sesgo medido no coincide con el aprendido en reposo (`sesgoCalCoherente`), y un giro lento al acomodar el brazo basta para eso.
3. **Al fallar, el paso pasa a conteo manual.** El handler `CAL` pone `mv.paso.medicion = null` y no se cuentan repeticiones.
4. **Además ensucia la sesión.** Cada `CAL`:
   - vuelve a medir el reposo EMG en la postura del paso, que se resta a los pasos EMG y a la prueba de fuerza;
   - reancla el estimador de sesgo;
   - sobrescribe `sesion.calibracion`, así que un fallo marca toda la sesión con "⚠ datos".

**Por qué existía:** los ángulos se calculan como conjugado(qCal)·q descompuesto en Z‑Y‑X.
- **Desviaciones** (antebrazo vertical, partiendo de una calibración con la palma abajo): la postura queda a ~90° en `fe`, en el bloqueo de cardán, donde `rc` y `ps` dejan de estar definidos.
- **Prono-supinación** con el pulgar arriba: arranca en `ps` ≈ 90°, así que una supinación normal pasa de ±180°.

Hace falta un cero propio de la postura del paso, pero no una calibración: el sesgo, la convergencia y el reposo EMG siguen valiendo.

## Decisiones (hacen de spec)

1. **Una sola calibración por sesión:** la de "¿Listos para empezar?". Ningún paso envía `CAL`. El botón Calibrar y el aviso "el dispositivo pide recalibrar" (avisos.js) siguen como están.
2. **Comando `CERO`** (PC → dispositivo):
   - Fija la referencia de los ángulos en la orientación actual y responde `CERO,OK` en el mismo ciclo.
   - Sin calibración previa responde `CERO,ERR,sin calibrar`.
   - No cambia el sesgo, el filtro, el reposo EMG ni `qCal`.
3. **`CERO,-` y `CAL`:** `CERO,-` vuelve la referencia a `qCal` y no responde. Un `CAL` correcto también borra el cero de postura.
4. **Pasos con cero de postura:** desviación radial, desviación cubital, pronación, supinación y prono-supinación con martillo. El campo `recalibrar: true` de `rutinas.js` se renombra `ceroDePostura: true`. Flexión, extensión y las de peso usan el cero de la calibración (posición neutra, palma abajo).
5. **Cuándo se pide:** al terminar la cuenta regresiva, justo antes de medir. En ese momento el paciente ya está en la postura de inicio. La interfaz envía `CERO`, espera `CERO,OK` como máximo **1000 ms**, vacía `mv.buffer` y empieza a contar. El reposo sale de las muestras nuevas.
   - **Sin respuesta en 1000 ms** (firmware antiguo): igual empieza a contar, con el reposo tomado de las muestras de ese momento. Nunca pasa a conteo manual por esto.
   - **`CERO,ERR`:** igual que sin respuesta, y además muestra un aviso.
6. **Al cerrar el paso:** si el paso usó cero de postura, se envía `CERO,-`.
7. **Qué no cambia:** `sesion.calibracion` es solo la del inicio. El contador nunca muestra "Calibrando…" dentro de un paso. Desaparecen `mv.cal.postura`, `mv.calEnPostura` y `pedirCalibracion(enPostura)`.
8. **Protocolo en la interfaz:** `CERO,OK` y `CERO,ERR,...` son líneas válidas, no se cuentan como malformadas. Lo mismo en `firmware/pruebas/banco.py`.

## Global Constraints

- Protocolo de texto, una línea por mensaje y 115200 baudios. Comandos nuevos: exactamente `CERO` y `CERO,-`. Respuestas: `CERO,OK` y `CERO,ERR,<motivo>`.
- Espera máxima de `CERO,OK` en la interfaz: `ESPERA_CERO_MS = 1000`.
- Los textos visibles van en español. Ningún texto nuevo dice "calibrando" dentro de un paso.
- No se agregan dependencias.

## Review Focus

1. **Firmware sin `CERO`** (placa sin actualizar): responde `#Comando desconocido: CERO`. El paso debe contar igual tras 1 s, sin pasar a manual y sin toasts repetidos en cada paso. → Task 2, humo `'cero sin respuesta'`.
2. **Dos pasos con cero seguidos** (radial → cubital): cada uno toma su propio cero; un `CERO,OK` tardío del paso anterior no arranca el siguiente. → Task 2, humo `'cero por paso'`.
3. **Volver a grabar un paso con cero, o cancelar durante la cuenta:** no queda un cero de postura activo en el paso siguiente (flexión). → Task 2, humo `'cero se quita al salir'`.
4. **Conexión perdida mientras se espera `CERO,OK`:** el paso no queda colgado esperando. Se cierra igual que hoy, con lo grabado. → Task 2, humo `'cero y desconexión'`.
5. **`CAL` con un cero activo** (botón Calibrar en Datos técnicos): el cero se borra y los ángulos vuelven a `qCal`. → Task 1, prueba `cal_borra_cero`.

---

### Task 1: Firmware — referencia de ángulos con cero de postura y comando `CERO`

**Files:**
- Modify: `firmware/carpo_esp32/src/nucleo/angulos.h`, `angulos.cpp` (clase `ReferenciaAngulos`)
- Modify: `firmware/carpo_esp32/src/nucleo/protocolo.h`, `protocolo.cpp` (`TipoComando::Cero`, `TipoComando::QuitarCero`, `formatearCeroOk`, `formatearCeroErr`)
- Modify: `firmware/carpo_esp32/carpo_esp32.ino`:
  - usa `ReferenciaAngulos` en lugar de `qCal` suelto en `enviarMuestra` y en `gestionarCalibracion`;
  - maneja los dos comandos nuevos.
- Modify: `firmware/plantilla_protocolo/*.ino` (responde `CERO,OK`), `firmware/pruebas/banco.py` (`CERO` es línea válida, en la lista de la línea 65)
- Test: `firmware/pruebas/test_angulos.cpp`, `firmware/pruebas/test_protocolo.cpp`, `firmware/pruebas/test_banco.py`

**Interfaces:**
- Produces (C++):
  ```cpp
  class ReferenciaAngulos {
   public:
    void calibrar(const Cuaternion& q);   // nueva qCal; borra el cero de postura
    bool fijarCero(const Cuaternion& q);  // false si nunca se calibró
    void quitarCero();
    bool calibrada() const;
    bool hayCero() const;
    AngulosMuneca angulos(const Cuaternion& qAhora, bool manoIzquierda) const;  // usa el cero si hay, si no qCal
  };
  TipoComando parsearComando(const char*);  // "CERO" -> Cero, "CERO,-" -> QuitarCero
  int formatearCeroOk(char* buf, size_t tam);                      // "CERO,OK"
  int formatearCeroErr(char* buf, size_t tam, const char* motivo); // "CERO,ERR,<motivo>"
  ```
- Produces (protocolo): `CERO` → `CERO,OK` | `CERO,ERR,sin calibrar`; `CERO,-` → sin respuesta.

- [ ] **Step 1: Pruebas que fallan en `test_angulos.cpp`**
  - `cero_de_postura_mide_desviacion_con_antebrazo_vertical`:
    - Datos: `qPost = desdeEjeAngulo({0,1,0}, -90°)`, `q = multiplicar(qPost, desdeEjeAngulo({0,0,1}, 20°))`, `r` calibrada con la identidad.
    - Tras `r.fijarCero(qPost)`, `r.angulos(q, false)` da `rc ≈ 20 (±0,5)`, `fe ≈ 0` y `ps ≈ 0`.
  - `sin_cero_usa_calibracion`: con `r.calibrar(I)`, sin cero, `r.angulos(desdeEjeAngulo({0,1,0}, 30°), false).fe ≈ 30`.
  - `quitar_cero_vuelve_a_calibracion`: tras `fijarCero(qPost)` y `quitarCero()`, `angulos(qPost).fe ≈ -90 (±0,5)`.
  - `cal_borra_cero`: tras `fijarCero` y luego `calibrar(I)`, `hayCero()` es false.
  - `cero_sin_calibrar_falla`: con `ReferenciaAngulos` recién creada, `fijarCero(q)` devuelve false y `hayCero()` es false.
  - `cero_supinacion_no_da_la_vuelta`:
    - Datos: `qPost = desdeEjeAngulo({1,0,0}, 90°)` (pulgar arriba), `q = multiplicar(qPost, desdeEjeAngulo({1,0,0}, 85°))`.
    - Con cero, `ps ≈ 85`; sin cero, `|ps|` > 170 (documenta el salto).
- [ ] **Step 2: Pruebas que fallan en `test_protocolo.cpp`**
  - `comandos_cero`:
    - `parsearComando("CERO") == Cero` y `parsearComando("CERO,-") == QuitarCero`.
    - `"CERO,"` y `"CEROX"` dan `Desconocido`.
    - `formatearCeroOk` da `"CERO,OK"` y `formatearCeroErr(..., "sin calibrar")` da `"CERO,ERR,sin calibrar"`.
- [ ] **Step 3: Verificar el fallo.** Run: `python3 firmware/pruebas/correr.py angulos` y luego `protocolo`. Expected: FALLO DE COMPILACION (no existen `ReferenciaAngulos` ni `TipoComando::Cero`).
- [ ] **Step 4: Implementar.**
  - `ReferenciaAngulos::angulos` llama a `angulosRelativos(hayCero ? qCero : qCal, qAhora, manoIzquierda)`.
  - En el `.ino`: `Listo` de CAL → `ref.calibrar(orientacionActual())`; `Cero` → `ref.fijarCero(orientacionActual())` y responde; `QuitarCero` → `ref.quitarCero()`.
  - Sin calibrar significa que todavía no hubo ningún `CAL,OK` desde el arranque.
  - La plantilla de protocolo responde `CERO,OK` a `CERO`.
- [ ] **Step 5: Verificar.**
  - Run: `python3 firmware/pruebas/correr.py`. Expected: todas con 0 fallas.
  - Compilar el `.ino` contra los sustitutos de Arduino (como en la tarea de prono-supinación) con `USAR_EMG` en `false` y en `true`. Expected: sin errores ni avisos.
- [ ] **Step 6: Banco.**
  - En `test_banco.py`, prueba `lineas_cero_validas`: `CERO,OK` y `CERO,ERR,sin calibrar` no cuentan como malformadas.
  - Agregar `"CERO"` a la tupla de banco.py.
  - Run: `python3 -m pytest firmware/pruebas/test_banco.py -q` (o el runner que use el archivo). Expected: pasa.
- [ ] **Step 7: README.**
  - En la tabla del protocolo (PC → Dispositivo), filas `CERO` / `CERO,-`; en Dispositivo → PC, `CERO,OK` / `CERO,ERR,<motivo>`.
  - En "Firmware real", una frase: la calibración se hace una vez; `CERO` solo cambia la referencia de los ángulos.
- [ ] **Step 8: Commit.** `git commit -m "Firmware: cero de postura instantáneo (CERO) sin repetir la calibración"`

### Task 2: Interfaz — los pasos usan `CERO` en vez de `CAL`

**Files:**
- Modify: `rutinas.js`:
  - `recalibrar: true` → `ceroDePostura: true` en los 5 pasos;
  - el comentario de cabecera.
- Modify: `monitoreo.js`:
  - `case 'CERO'` en `procesarLinea`;
  - `iniciarPasoRutina` sin CAL;
  - `medirPaso` pide el cero;
  - `finalizarPasoRutina` envía `CERO,-`;
  - borrar `pedirCalibracion(enPostura)`, `mv.calEnPostura`, `mv.cal.postura` y `calDeOtraPostura`;
  - `calibrar()` envía `CAL` directamente;
  - `iniciarEjercicio` vuelve a exigir solo `mv.cal?.ok`;
  - `estadoDispositivo().calOk` es `!!cal?.ok`;
  - el simulador responde `CERO,OK`, salvo con `window.SIMULADOR_SIN_CERO === true`.
- Modify: `rutina.js` (`actualizarContador`: el modo `'calibrando'` desaparece; mientras espera el cero muestra el texto de la cuenta ya terminada, "¡Ya!" o el contador en 0).
- Modify: `README.md` (tabla "Qué mide cada ejercicio" y párrafo de desviaciones: "toma un cero de postura al empezar", no "recalibrando").
- Test: `tests/rutinas.test.js`, `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: protocolo de la Task 1 (`CERO`, `CERO,-`, `CERO,OK`, `CERO,ERR,<motivo>`).
- Produces: `medicionEnCurso()` devuelve `'medido' | 'sin-emg' | 'manual' | null`, ya sin `'calibrando'`. `const ESPERA_CERO_MS = 1000` va en monitoreo.js.

- [ ] **Step 1: Prueba unitaria que falla (`tests/rutinas.test.js`).**
  - Renombrar la prueba de desviaciones a `'pasos con cero de postura'`.
  - Los ids con `ceroDePostura === true` son exactamente `['desv_radial', 'desv_cubital', 'pronacion', 'supinacion', 'pronosup_martillo']`.
  - Ningún paso tiene la propiedad `recalibrar`.
- [ ] **Step 2: Verificar el fallo.** Run: `node --test tests/rutinas.test.js`. Expected: 1 falla.
- [ ] **Step 3: Comprobaciones de humo que fallan** (en `tests/ui/humo.mjs`, reemplazando `'desviación pide recalibrar'`, `'calibración de canto no vale para flexión'` y `'reposo tomado después de recalibrar'`). Todas usan `rutinaHastaPaso` y `window.comandos`.
  - `'una sola calibración en la rutina'`:
    - Recorrer la Fase 2 entera con espera en cada paso hasta `Detectadas: ≥1`.
    - `window.comandos` no contiene `'CAL'`.
    - Todos los pasos IMU guardados tienen `repeticiones > 0`.
    - `s.calibracion.ok === true`.
  - `'cero por paso'`:
    - En `desv_radial`, tras la cuenta, `window.comandos` contiene `'CERO'` y el contador nunca empezó por "Calibrando".
    - Al pasar a `desv_cubital` se envía `'CERO,-'` y luego otro `'CERO'`.
    - Cubital llega a `Detectadas: ≥1`.
  - `'cero se quita al salir'`:
    - Desde `desv_radial` volver dos pasos a flexión.
    - El último comando de cero enviado es `'CERO,-'`.
    - Flexión cuenta con `mv.ej.tipo === 'flexion'` sin enviar `CERO`.
  - `'reposo tomado después del cero'`:
    - Como la comprobación actual de recalibrar, pero inyectando 25 muestras con `rc: 30` justo antes de `CERO,OK`.
    - `Math.abs(mv.ej.base) < 3`.
  - `'cero sin respuesta'` (`init: SIMULADOR_SIN_CERO = true`):
    - En `desv_radial` llega a `Detectadas: ≥1` en 15 s.
    - El paso guardado tiene `medicion.fuente === 'imu'`.
  - `'cero y desconexión'`:
    - Con `SIMULADOR_SIN_CERO`, en `desv_radial` desconectar (`desconectar()`) durante la espera.
    - Terminar y guardar no lanza errores de consola.
    - El paso no quedó con `mv.paso` colgado.
- [ ] **Step 4: Verificar el fallo.** Run: `HUMO_SOLO="cero" node tests/ui/humo.mjs` y `HUMO_SOLO="una sola" node tests/ui/humo.mjs`. Expected: las nuevas fallan (hoy se envía `CAL`).
- [ ] **Step 5: Implementar.**
  - `medirPaso`, al terminar la cuenta en un paso IMU con `ceroDePostura`:
    - marca `actual.esperandoCero = true` y envía `CERO`;
    - arranca un temporizador de `ESPERA_CERO_MS`.
  - `CERO,OK` del paso actual:
    - si es el paso actual y `esperandoCero`: `mv.buffer = []`, `esperandoCero = false`, `iniciarEjercicio`;
    - un `CERO,OK` que no es del paso actual se ignora.
  - Vencido el plazo (o con `CERO,ERR`): `iniciarEjercicio` con el buffer tal cual.
    - El primer vencimiento de la sesión muestra el toast "El dispositivo no confirmó el cero de postura: se mide desde la calibración inicial." y no se repite.
    - `CERO,ERR` muestra su motivo.
  - `finalizarPasoRutina` y `alPerderConexion` limpian el temporizador; el primero envía `CERO,-` si el paso usó cero.
- [ ] **Step 6: Verificar.** Run: `node --test && HUMO_SOLO="cero" node tests/ui/humo.mjs && HUMO_SOLO="una sola" node tests/ui/humo.mjs && HUMO_SOLO="pronación" node tests/ui/humo.mjs`. Expected: todo ✓.
- [ ] **Step 7: Suite completa en segundo plano** (supera 10 min). Run: `python3 firmware/pruebas/correr.py && node --test && node tests/ui/humo.mjs`. Expected: "Todo correcto".
- [ ] **Step 8: Commit.** `git commit -m "Rutina: cero de postura al empezar el paso en lugar de recalibrar"`

### Task 3 (equipo, con la placa real — no la hace el agente)

- Cargar el firmware y, con el sensor puesto, hacer una sesión de Fase 2 completa.
  - Criterio: una sola línea `CAL,OK`, un `CERO,OK` por cada paso de desviación y de prono-supinación, y ningún paso a conteo manual.
- Desviación con el antebrazo vertical y goniómetro, 10 repeticiones por lado.
  - Criterio: error ≤ 3° y conteo ≥ 95 %.
- Supinación con el pulgar arriba hasta el tope.
  - Criterio: el ángulo no salta de +180° a −180°.
