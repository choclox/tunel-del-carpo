# Firmware con giroscopio, autocalibración y banco de pruebas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el firmware de la ESP32-C6 use el giroscopio del GY-85 nuevo, se adapte solo al módulo que tenga conectado y se pueda calibrar y comprobar sin recompilar, con una prueba de banco automática.

**Architecture:** Se parte de `origin/main`, que ya trae `ps` y EMG, y se le suma la rama `firmware-sin-giroscopio`. Hay tres piezas puras nuevas en `src/nucleo/`, probadas en la PC:
- `CalibradorAcel`: calibración del acelerómetro en 6 posiciones, dentro de la placa.
- `EstimadorSesgo`: corrige la deriva del giroscopio cuando la mano está quieta.
- Quietud por acelerómetro en `Calibrador`.

Por su parte, el driver detecta en el arranque si el giroscopio funciona. El sketch elige la fusión según eso, guarda la calibración del acelerómetro en NVS y responde `ACEL` y `ESTADO`. `firmware/pruebas/banco.py` comprueba la placa real por el puerto serie.

**Tech Stack:** Arduino core `esp32:esp32` 3.2.0 (ESP32-C6), C++17 en `src/nucleo/` con pruebas en PC (`ziglang`), Python 3.10 + `pyserial` 3.5 para el banco.

**Spec:** pedido del usuario del 2026-11-09: *"se cambió el IMU y ya funciona el giroscopio, vas a crear un código que funcione mejor, lo testearás y cargarás en la ESP"*. Las mejoras salen de lo observado en las pruebas del 2026-10-24 al 26:
- un giroscopio dañado causaba un bucle de reinicios cada segundo;
- `DESFASE_ACEL`/`ESCALA_ACEL` del módulo viejo están fijos en `config.h` y no sirven para el nuevo;
- `CAL` fallaba por el desfase del acelerómetro;
- las primeras lecturas del ADXL345 tras configurarlo valen cero;
- no había forma automática de comprobar la placa.

Protocolo y mediciones: `README.md` de `origin/main` (secciones "Protocolo serie" y "Firmware real").

## Global Constraints

- **Protocolo sin cambios hacia la interfaz:** `D,<seq>,<t_ms>,<fe>,<rc>,<ps>` (y `,<emg1>,<emg2>,<emg3>` con `USAR_EMG`), `CAL,OK,<ms>`, `CAL,ERR,<motivo>`. Todo lo demás empieza con `#`.
- **Comandos nuevos, solo para preparación:** `ACEL` y `ESTADO`, exactos y en mayúsculas, como los demás.
- **Mensajes nuevos, con este texto exacto:**
  - `#ACEL: ponga la placa quieta con cada cara hacia arriba y hacia abajo (6 posiciones)`
  - `#ACEL,<cara>` al capturar una cara, con `<cara>` en `+X -X +Y -Y +Z -Z`.
  - `#ACEL,OK,<dx>,<dy>,<dz>,<sx>,<sy>,<sz>`, con 4 decimales.
  - `#ACEL,ERR,faltan,<caras separadas por espacio>`
  - `#ACEL,ERR,sensor`
  - `#Acelerometro sin calibrar: envie ACEL`
  - `#Giroscopio no responde: modo sin giroscopio`
  - `#ESTADO,giro=<0|1>,mag=<HMC5883L|QMC5883L|ninguno>,magcal=<0|1>,acelcal=<0|1>,mano=<D|I>`
- **NVS** (espacio `"carpo"`): `acelok` (bool), `adx`, `ady`, `adz` (desfase en g), `asx`, `asy`, `asz` (escala). Sin `acelok` se usa desfase `{0,0,0}` y escala `{1,1,1}`, **nunca** los valores del módulo anterior.
- **Placa:** FQBN `esp32:esp32:esp32c6:CDCOnBoot=cdc`, puerto `COM5`. SDA GPIO21, SCL GPIO22, 400 kHz.
- **Archivos de `src/nucleo/`:** sin `Arduino.h`, sin memoria dinámica; finales LF; nombres y comentarios en español.
- **Pruebas de PC:** `python firmware/pruebas/correr.py` (C++) y `python -m unittest firmware/pruebas/test_banco.py` (Python), desde `interfaz-medico`.
- **Compilar y cargar desde PowerShell, no desde Bash** (el entorno aislado de Bash no abre COM5):
  `& "C:\Users\Personal\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" compile --config-file "C:\Users\Personal\.arduinoIDE\arduino-cli.yaml" --fqbn esp32:esp32:esp32c6:CDCOnBoot=cdc --warnings all firmware/carpo_esp32` (en adelante `arduino-cli compile …`; agregar `-u -p COM5` para cargar).
  - Si aparece `cannot execute 'cc1plus.exe'`, repetir con `--jobs 1`.
  - Antes de cargar, Kinemo debe estar desconectado y el monitor serie del IDE cerrado.
- **Git:** trabajar en la rama `firmware-giroscopio` creada desde `origin/main`. Un commit por tarea, terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push y PR solo cuando el usuario lo pida.

## Review Focus

1. **Se vuelve a conectar un GY-85 con el giroscopio dañado:** el firmware avisa una vez y sigue sin giroscopio, sin el bucle `#Error de lectura`/`#GY-85 recuperado`. → Tarea 4, paso 3; `banco.py` falla si ve más de 0 líneas `#Error de lectura` en la prueba.
2. **`ACEL` con la placa sostenida en la mano o inclinada:** no se captura una cara falsa. → `PRUEBA(acel_movimiento_no_captura)` y `PRUEBA(acel_inclinada_no_captura)` en la Tarea 2.
3. **El paciente gira la mano despacio durante una sesión larga:** el estimador de sesgo no "aprende" ese giro como deriva. → `PRUEBA(sesgo_giro_lento_no_se_aprende)` en la Tarea 3.
4. **Módulo nuevo sin `ACEL`:** se usa la corrección neutra y se avisa; no se aplican los valores del módulo viejo. → Tarea 5, paso 4 (`#ESTADO,...,acelcal=0` y aviso al arrancar), y `banco.py` lo informa.
5. **Primeras lecturas en cero del ADXL345 tras arrancar o recuperar:** no cuentan como sensor perdido. → Tarea 4; `banco.py` cuenta 0 líneas `#Error de lectura` en 60 s.

---

## Estructura de archivos

```
firmware/carpo_esp32/
  carpo_esp32.ino          integra ACEL, ESTADO, NVS, fusión según giroscopio, estimador de sesgo (T5)
  config.h                 USAR_GIROSCOPIO pasa a "permitir"; se quitan DESFASE_ACEL/ESCALA_ACEL (T5)
  gy85.h / gy85.cpp        detección del giroscopio, gracia del ADXL, corrección de acel en tiempo de ejecución (T4)
  src/nucleo/
    calibracion.h/.cpp     + CalibradorAcel (T2), + EstimadorSesgo y quietud por acel en Calibrador (T3)
    protocolo.h/.cpp       + TipoComando::Acel, ::Estado (T5)
firmware/pruebas/
  test_calibracion.cpp     pruebas nuevas (T2, T3)
  test_protocolo.cpp       pruebas nuevas (T5)
  banco.py                 prueba de banco en la placa real (T6)
  test_banco.py            pruebas de las funciones de análisis de banco.py (T6)
```

---

### Task 1: Rama nueva desde main con el firmware sin giroscopio

**Files:**
- Modify: los archivos que entren en conflicto al combinar `firmware-sin-giroscopio` con `origin/main`. Se espera conflicto en `firmware/carpo_esp32/carpo_esp32.ino` (`enviarMuestra`) y en el `README.md`.

**Interfaces:**
- Produces: la rama `firmware-giroscopio` con `ps` y EMG de `main`, más `FiltroSinGiro`, `USAR_GIROSCOPIO`, `MEDIR_BATERIA`, `#RAW,sin sensor` y el silencio de los NACK I2C.

- [ ] **Step 1: Crear la rama y combinar**

Run: `git switch -c firmware-giroscopio origin/main` y `git merge --no-ff firmware-sin-giroscopio`.
Al resolver `enviarMuestra`, usar `angulosRelativos(qCal, orientacionActual(), manoIzquierda)` y pasar `a.ps` en el tercer campo, tanto en la rama EMG como en la normal. En el README conservar las dos secciones nuevas.

- [ ] **Step 2: Comprobar**

Run: `python firmware/pruebas/correr.py`, `node --test` y `arduino-cli compile …`.
Expected: todo con `0 fallas`, `node --test` con `fail 0`, y la compilación con `Sketch uses …` y sin advertencias de archivos del proyecto.

- [ ] **Step 3: Commit del merge** (mensaje: `Combina firmware sin giroscopio con main (ps y EMG)`).

---

### Task 2: Calibración del acelerómetro en 6 posiciones (CalibradorAcel)

**Files:**
- Modify: `firmware/carpo_esp32/src/nucleo/calibracion.h`, `calibracion.cpp`
- Test: `firmware/pruebas/test_calibracion.cpp`

**Interfaces:**
- Produces (`calibracion.h`):
  - `class CalibradorAcel { public: void iniciar(uint32_t tMs); bool agregar(const Vec3& acelSinCorregir, uint32_t tMs); uint8_t caras() const; bool completo() const; bool vencido(uint32_t tMs) const; Vec3 desfase() const; Vec3 escala() const; static const char* nombreCara(uint8_t i); };`
  - Caras como bits: `0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z`. `nombreCara(i)` devuelve `"+X"`…`"-Z"`. `completo()` equivale a `caras() == 0x3F`.
  - **Quietud:** desde el inicio de la ventana, el rango (máx − mín) de cada eje es menor de 0,05 g. Si se supera, la ventana empieza de nuevo en esa muestra.
  - **Captura:** con la ventana quieta durante ≥ 1000 ms, se toma el promedio. Si un eje tiene |promedio| > 0,7 y los otros dos < 0,35, se captura esa cara (solo la primera vez) con el promedio de ese eje, `agregar` devuelve `true` y la ventana se reinicia. En cualquier otro caso devuelve `false`.
  - `desfase()[e] = (más + menos) / 2` y `escala()[e] = 2 / (más − menos)`. Solo son válidos si `completo()`.
  - `vencido(t)` es `true` cuando `t − inicio ≥ 180000` ms.

- [ ] **Step 1: Escribir las pruebas que fallan**

Ayudante: `void quieta(CalibradorAcel&, uint32_t& t, Vec3 a, uint32_t ms)` llama a `agregar` cada 10 ms durante `ms`.

```cpp
const Vec3 DESF{0.07f, -0.02f, 0.05f}, GAN{0.98f, 1.03f, 1.01f};
static Vec3 medida(Vec3 g) { return {g.x / GAN.x + DESF.x, g.y / GAN.y + DESF.y, g.z / GAN.z + DESF.z}; }
PRUEBA(acel_seis_caras_recupera_desfase_y_escala) {
  CalibradorAcel c; uint32_t t = 0; c.iniciar(t);
  const Vec3 caras[6] = {{1,0,0},{-1,0,0},{0,1,0},{0,-1,0},{0,0,1},{0,0,-1}};
  for (auto& g : caras) { quieta(c, t, medida(g), 1500); quieta(c, t, medida({0.5f,0.5f,0.5f}), 300); }
  VERIFICAR(c.completo());
  CERCA(c.desfase().x, 0.07f, 1e-3f); CERCA(c.desfase().y, -0.02f, 1e-3f); CERCA(c.desfase().z, 0.05f, 1e-3f);
  CERCA(c.escala().x, 0.98f, 1e-3f); CERCA(c.escala().y, 1.03f, 1e-3f); CERCA(c.escala().z, 1.01f, 1e-3f);
}
PRUEBA(acel_falta_una_cara) {
  CalibradorAcel c; uint32_t t = 0; c.iniciar(t);
  quieta(c, t, {0,0,1}, 1500); quieta(c, t, {0,0,-1}, 1500);
  VERIFICAR(!c.completo()); VERIFICAR(c.caras() == 0x30);
}
PRUEBA(acel_movimiento_no_captura) {   // sostenida en la mano: ±0,04 g alternando
  CalibradorAcel c; uint32_t t = 0; c.iniciar(t);
  for (int i = 0; i < 300; i++, t += 10) c.agregar({0, 0, i % 2 ? 1.04f : 0.96f}, t);
  VERIFICAR(c.caras() == 0);
}
PRUEBA(acel_inclinada_no_captura) {
  CalibradorAcel c; uint32_t t = 0; c.iniciar(t);
  quieta(c, t, {0.5f, 0, 0.85f}, 2000);
  VERIFICAR(c.caras() == 0);
}
PRUEBA(acel_nombres_y_vencimiento) {
  TEXTO_IGUAL(CalibradorAcel::nombreCara(0), "+X"); TEXTO_IGUAL(CalibradorAcel::nombreCara(5), "-Z");
  CalibradorAcel c; c.iniciar(1000);
  VERIFICAR(!c.vencido(180999)); VERIFICAR(c.vencido(181000));
}
```

- [ ] **Step 2: Run:** `python firmware/pruebas/correr.py calibracion`. **Expected:** falla la compilación (`CalibradorAcel` no existe).
- [ ] **Step 3: Implementar `CalibradorAcel`** según la interfaz de arriba.
- [ ] **Step 4: Run:** `python firmware/pruebas/correr.py`. **Expected:** todo con `0 fallas`.
- [ ] **Step 5: Commit** (`Firmware: calibración del acelerómetro en 6 posiciones (CalibradorAcel)`).

---

### Task 3: Quietud por acelerómetro en CAL y estimador de sesgo del giroscopio

**Files:**
- Modify: `firmware/carpo_esp32/src/nucleo/calibracion.h`, `calibracion.cpp`
- Test: `firmware/pruebas/test_calibracion.cpp`

**Interfaces:**
- **`Calibrador` (cambio):** una muestra solo es quieta si cumple lo que ya exige y, además, cada eje del acelerómetro difiere menos de 0,05 g del acelerómetro de la primera muestra de la ventana. Las pruebas actuales deben seguir pasando.
- Produces (`calibracion.h`):
  - `class EstimadorSesgo { public: explicit EstimadorSesgo(float alfa = 0.002f); void fijar(const Vec3& sesgo); void agregar(const Vec3& giroCrudo, const Vec3& acel, uint32_t tMs); Vec3 sesgo() const; bool quieto() const; };`
  - **Ventana de quietud:** cada eje cumple |giroCrudo − sesgo| < 0,05 rad/s, y el rango de cada eje del acelerómetro desde el inicio de la ventana es menor de 0,03 g. Si no se cumple, la ventana empieza de nuevo en esa muestra y `quieto()` pasa a `false`.
  - Con la ventana quieta durante ≥ 2000 ms, `quieto()` es `true` y cada muestra hace `sesgo += alfa · (giroCrudo − sesgo)`.
  - `fijar()` reemplaza el sesgo y reinicia la ventana.

- [ ] **Step 1: Escribir las pruebas que fallan**

```cpp
PRUEBA(cal_acel_que_cambia_no_es_quietud) {   // giro constante, acel deriva 0,1 g
  Calibrador c; c.iniciar(0);
  for (uint32_t t = 0; t <= 2600; t += 10) c.agregar({0.01f, 0, 0}, {0, 0.1f * t / 2600, 1}, t);
  VERIFICAR(c.estado() != EstadoCal::Listo);
}
PRUEBA(sesgo_converge_en_reposo) {
  EstimadorSesgo e; e.fijar({0, 0, 0});
  for (uint32_t t = 0; t <= 30000; t += 10) e.agregar({0.02f, -0.01f, 0.015f}, {0, 0, 1}, t);
  VERIFICAR(e.quieto());
  CERCA(e.sesgo().x, 0.02f, 5e-4f); CERCA(e.sesgo().y, -0.01f, 5e-4f); CERCA(e.sesgo().z, 0.015f, 5e-4f);
}
PRUEBA(sesgo_no_cambia_en_los_primeros_2_s) {
  EstimadorSesgo e; e.fijar({0, 0, 0});
  for (uint32_t t = 0; t < 1990; t += 10) e.agregar({0.02f, 0, 0}, {0, 0, 1}, t);
  VERIFICAR(!e.quieto()); CERCA(e.sesgo().x, 0, 1e-6f);
}
PRUEBA(sesgo_giro_lento_no_se_aprende) {   // 0,04 rad/s en Z durante 20 s: el acel (gravedad en el marco del sensor) cambia
  EstimadorSesgo e; e.fijar({0, 0, 0});
  for (uint32_t t = 0; t <= 20000; t += 10) {
    float ang = 0.04f * t / 1000;   // gira sobre Y para que cambie la gravedad
    e.agregar({0, 0.04f, 0}, {sinf(ang), 0, cosf(ang)}, t);
  }
  CERCA(e.sesgo().y, 0, 1e-3f);
}
PRUEBA(sesgo_movimiento_reinicia_la_ventana) {
  EstimadorSesgo e; e.fijar({0, 0, 0});
  for (uint32_t t = 0; t <= 3000; t += 10) e.agregar({0.02f, 0, 0}, {0, 0, 1}, t);
  e.agregar({0.5f, 0, 0}, {0, 0, 1}, 3010);
  VERIFICAR(!e.quieto());
}
```

- [ ] **Step 2: Run:** `python firmware/pruebas/correr.py calibracion`. **Expected:** falla la compilación (`EstimadorSesgo` no existe).
- [ ] **Step 3: Implementar** la quietud por acelerómetro en `Calibrador` y la clase `EstimadorSesgo`.
- [ ] **Step 4: Run:** `python firmware/pruebas/correr.py`. **Expected:** todo con `0 fallas`, incluidas las pruebas anteriores de `Calibrador`.
- [ ] **Step 5: Commit** (`Firmware: quietud por acelerómetro en CAL y estimador del sesgo del giroscopio`).

---

### Task 4: Driver — detección del giroscopio, gracia del ADXL345 y corrección en tiempo de ejecución

**Files:**
- Modify: `firmware/carpo_esp32/gy85.h`, `gy85.cpp`

**Interfaces:**
- Produces (`gy85.h`):
  - `bool tieneGiroscopio() const;`
  - `void fijarCorreccionAcel(const Vec3& desfase, const Vec3& escala);` (por defecto `{0,0,0}` y `{1,1,1}`).
- **`iniciar`:**
  - Con `USAR_GIROSCOPIO`, se prueba el ITG3205 en 0x68 y 0x69 y se configura como ahora. Después se relee `DLPF_FS` (0x16); el giroscopio cuenta como disponible solo si vale `0x1B` y la temperatura cruda (0x1B–0x1C, big-endian) es distinta de 0.
  - Si el giroscopio no está disponible, `tieneGiroscopio()` es `false` y `iniciar` **no falla por eso**: devuelve `true` si responde el ADXL345.
  - Pone la gracia del ADXL en 5 lecturas.
- **`leer`:**
  - Si el acelerómetro da exactamente cero mientras quedan lecturas de gracia, descuenta una y devuelve `false` **sin** limpiar `iniciado_`. La primera lectura distinta de cero deja la gracia en 0. Sin gracia, el cero se trata como ahora.
  - Con `tieneGiroscopio() == false`, `giro = {0,0,0}` y no se lee el ITG.
  - El acelerómetro se corrige con los valores de `fijarCorreccionAcel`, no con constantes de `config.h`.
- **`configuracionIntacta`:** solo relee el ITG si `tieneGiroscopio()`.

- [ ] **Step 1: Implementar** lo anterior. `corregirAcel(aplicarMontaje(a, MONTAJE_ACEL), desfase_, escala_)`.
- [ ] **Step 2: Compilar.** Run: `arduino-cli compile …`. `DESFASE_ACEL` sigue en `config.h` hasta la Tarea 5, pero el driver ya no la usa. Expected: compila sin advertencias del proyecto. La verificación en la placa queda en la Tarea 6.
- [ ] **Step 3: Verificación diferida a la Tarea 6:**
  - Con el módulo nuevo, `ESTADO` responde `giro=1`.
  - Con `USAR_GIROSCOPIO = false` compilado a mano, `giro=0`, sin bucle de errores.
- [ ] **Step 4: Commit** (`Firmware: detecta si el giroscopio funciona y tolera las primeras lecturas en cero del ADXL345`).

---

### Task 5: Sketch — ACEL, ESTADO, fusión según el giroscopio y estimador de sesgo

**Files:**
- Modify: `firmware/carpo_esp32/carpo_esp32.ino`, `config.h`, `src/nucleo/protocolo.h`, `protocolo.cpp`, `README.md` (CRLF: editar con Edit)
- Test: `firmware/pruebas/test_protocolo.cpp`

**Interfaces:**
- Consumes: `CalibradorAcel` (T2), `EstimadorSesgo` (T3), `Gy85::tieneGiroscopio`, `Gy85::fijarCorreccionAcel` (T4).
- **`protocolo.h`:** `TipoComando` agrega `Acel` (`"ACEL"`) y `Estado` (`"ESTADO"`).
- **`config.h`:**
  - Se quitan `DESFASE_ACEL` y `ESCALA_ACEL`.
  - `USAR_GIROSCOPIO = true`, con el comentario "permite usarlo si el driver lo detecta".
  - `ALFA_SESGO = 0.002f`.
- **`carpo_esp32.ino`:**
  - `usaGiro()` = `USAR_GIROSCOPIO && gy85.tieneGiroscopio()`. Reemplaza a `USAR_GIROSCOPIO` en `orientacionActual` y en `actualizarFiltro`.
  - **Al arrancar y tras recuperar el sensor:** si `!gy85.tieneGiroscopio()` y `USAR_GIROSCOPIO`, imprime `#Giroscopio no responde: modo sin giroscopio` una sola vez por arranque. Aplica la corrección guardada con `gy85.fijarCorreccionAcel(...)`. Si no hay `acelok`, imprime `#Acelerometro sin calibrar: envie ACEL`.
  - **`ACEL`:**
    - Si el sensor no está disponible, responde `#ACEL,ERR,sensor`.
    - Si lo está, imprime el mensaje de inicio, pone la corrección neutra, `calibradorAcel.iniciar(ahora)` y en cada ciclo con lectura válida llama a `agregar(acel)`. En cada captura imprime `#ACEL,<cara>`.
    - Al completar las 6 caras: guarda en NVS, aplica la corrección, imprime `#ACEL,OK,...` y `#Recalibre`.
    - Si vence: restaura la corrección anterior e imprime `#ACEL,ERR,faltan,...`.
    - `CAL` y `MAG` siguen funcionando durante `ACEL`.
  - **`ESTADO`:** responde la línea `#ESTADO,...` de Global Constraints.
  - **Estimador de sesgo:**
    - Con `CAL` en `Listo`, `estimadorSesgo.fijar(sesgoGiro)`.
    - En cada lectura válida con `usaGiro()`, `estimadorSesgo.agregar(giro, acel, ahora)`, salvo durante `CAL`.
    - El filtro usa `giro − estimadorSesgo.sesgo()`.
  - **`RAW`:** muestra el acelerómetro ya corregido.
- **`README.md`**, sección "Firmware real":
  - `ACEL` y `ESTADO`.
  - Que la calibración del acelerómetro queda guardada en la placa y hay que repetirla al cambiar de módulo.
  - La detección automática del giroscopio.
  - Quitar las instrucciones de escribir `DESFASE_ACEL` en `config.h`.

- [ ] **Step 1: Pruebas que fallan en `test_protocolo.cpp`**

```cpp
PRUEBA(comandos_acel_y_estado) {
  VERIFICAR(parsearComando("ACEL") == TipoComando::Acel);
  VERIFICAR(parsearComando("ESTADO") == TipoComando::Estado);
  VERIFICAR(parsearComando("acel") == TipoComando::Desconocido);
}
```

- [ ] **Step 2: Run:** `python firmware/pruebas/correr.py protocolo`. **Expected:** falla la compilación.
- [ ] **Step 3: Implementar** `protocolo`, `config.h`, el sketch y el README según lo de arriba.
- [ ] **Step 4: Comprobar.**
  Run: `python firmware/pruebas/correr.py`, `node --test` y `arduino-cli compile …`.
  Expected: todo pasa y compila sin advertencias del proyecto. Revisar en el código que, sin `acelok` en NVS, la corrección sea `{0,0,0}`/`{1,1,1}` y se imprima el aviso (Review Focus 4).
- [ ] **Step 5: Commit** (`Firmware: comandos ACEL y ESTADO, fusión según el giroscopio detectado y corrección de la deriva`).

---

### Task 6: Banco de pruebas en la placa, carga y calibración con el usuario

**Files:**
- Create: `firmware/pruebas/banco.py`, `firmware/pruebas/test_banco.py`

**Interfaces:**
- Produces (`banco.py`, solo stdlib + `pyserial`):
  - `analizar_muestras(lineas: list[str], duracion_s: float) -> dict` devuelve:
    - `n`, `hz`, `perdida_pct` (por huecos en `seq`), `invalidas` (líneas `D` sin 6 o 9 campos, o con valores no finitos);
    - `media`, un dict `fe/rc/ps` con la media de los primeros 5 s;
    - `deriva`, un dict `fe/rc/ps` con la media de los últimos 5 s menos la de los primeros 5 s;
    - `errores_sensor`, la cantidad de líneas que empiezan con `#Error de lectura`.
  - `parsear_estado(linea: str) -> dict`, para `#ESTADO,giro=1,...`, con claves `giro`, `mag`, `magcal`, `acelcal` y `mano`.
  - **CLI:** `python firmware/pruebas/banco.py COM5 [--segundos 60] [--sin-giro]`.
    1. `ESTADO`.
    2. `RAW` durante 3 s con la placa quieta: |a| medio y desviación estándar de `gx/gy/gz`.
    3. `CAL`, con espera de hasta 30 s.
    4. `START` durante N s y luego `STOP`.
    5. Imprime una tabla `prueba | valor | criterio | OK/FALLA` y sale con 1 si alguna falla.
  - **Criterios:**
    - `giro=1`, salvo con `--sin-giro`.
    - |a| entre 0,97 y 1,03 g, solo si `acelcal=1`; si no, se informa como "sin calibrar".
    - Desviación estándar de cada eje del giro < 0,02 rad/s.
    - `CAL,OK` en ≤ 30 s.
    - `hz` entre 48 y 52.
    - `perdida_pct` < 1.
    - `invalidas` = 0 y `errores_sensor` = 0.
    - |deriva| < 1,0° en `fe`, `rc` y `ps`, con la placa quieta.
    - |media| < 1,0° en `fe`, `rc` y `ps` tras `CAL`.

- [ ] **Step 1: Pruebas que fallan en `test_banco.py`** (`unittest`)
  - `test_perdida_por_huecos`: `seq` 1–100 sin el 50, 51 y 52, en 2 s → `perdida_pct` ≈ 3 y `hz` ≈ 48,5.
  - `test_linea_invalida`: `D,1,20,nan,0,0` y `D,2,40,1,2` → `invalidas == 2`.
  - `test_deriva`: `fe` sube de 0 a 2 linealmente en 20 s → `deriva['fe']` ≈ 1,5 (±0,1).
  - `test_errores_sensor`: dos líneas `#Error de lectura del GY-85, reintentando` → 2.
  - `test_parsear_estado`: `#ESTADO,giro=1,mag=QMC5883L,magcal=0,acelcal=1,mano=D` → el dict con esos valores (`giro`, `magcal` y `acelcal` como int).
- [ ] **Step 2: Run:** `python -m unittest firmware/pruebas/test_banco.py`. **Expected:** falla con un ImportError.
- [ ] **Step 3: Implementar `banco.py`.**
- [ ] **Step 4: Run** de nuevo. **Expected:** `OK`.
- [ ] **Step 5: Commit** (`Firmware: banco de pruebas automático por el puerto serie`).
- [ ] **Step 6: Cargar en la placa.** Pedir al usuario que desconecte Kinemo. Luego `arduino-cli compile … -u -p COM5`.
  Expected: `Hard resetting via RTS pin...`.
- [ ] **Step 7: Calibraciones con el usuario.** Desde Python por COM5, empezando **cuando el usuario escriba "empieza"**:
  - `ACEL`, con el usuario poniendo la placa en las 6 posiciones. Expected: 6 líneas `#ACEL,<cara>` y luego `#ACEL,OK,...`.
  - `MAG`, girando en todas las direcciones. Expected: `#MAG,OK,...`.
- [ ] **Step 8: Banco.** Con la placa quieta sobre la mesa, `python firmware/pruebas/banco.py COM5 --segundos 60`.
  Expected: todas las filas `OK` y código de salida 0. Si alguna falla, diagnosticar con `superpowers:systematic-debugging` antes de cambiar código.
- [ ] **Step 9: Prueba de signos con el usuario**, con Kinemo o con `RAW`/`START` desde Python:
  - Flexión → `fe` > 0.
  - Radial con el antebrazo vertical, tras `CAL` en esa posición → `rc` > 0.
  - Supinación con el pulgar arriba, tras `CAL` → `ps` > 0.
  - Anotar los valores. Si un signo sale al revés, corregir `MONTAJE_*` y volver a los pasos 6–8.
