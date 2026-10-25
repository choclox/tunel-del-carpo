# Firmware ESP32 con GY-85 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firmware para ESP32 que lee un GY-85 (ADXL345 + ITG3205 + HMC5883L/QMC5883L) en el dorso de la mano, estima la flexo-extensión y la desviación radio-cubital de la muñeca y las envía a la interfaz con el protocolo serie que ya existe.

**Architecture:** Un sketch de Arduino nuevo, `firmware/carpo_esp32/`. La lógica que no toca hardware va en C++ puro en `src/nucleo/` (protocolo, decodificación de registros, batería, fusión Madgwick, ángulos relativos, calibración y vigilancia del sensor). Se prueba en la PC con un compilador portable (`ziglang`) y un mini marco de pruebas propio. El driver I2C del GY-85 y el `.ino` solo unen piezas: leen el sensor a 100 Hz, fusionan, y envían `D,...` a 50 Hz con ángulos relativos a la orientación capturada en `CAL`.

**Tech Stack:** Arduino IDE / arduino-cli con core `esp32:esp32` 3.2.0 (ya instalado), librerías del core (`Wire`, `Preferences`), C++17. Pruebas de PC: `ziglang` 0.13.0 (pip) + `firmware/pruebas/correr.py`.

**Spec:** pedido del usuario del 2026-10-24: "Vamos a desarrollar el código que se va a usar en ESP32 para la lectura de los datos. […] se cambió el módulo IMU a la referencia GY-85". Decisiones tomadas ese mismo día con el usuario:
- **1 GY-85 en el dorso de la mano.** El antebrazo debe quedar apoyado y quieto durante los ejercicios.
- **`mcf` no se mide por ahora.** Se envía `0.0` y el puño se cuenta solo de forma manual.
- **Conexión por USB serie**, como la interfaz actual (sin cambios en el navegador).
- **Batería LiPo 1S con divisor resistivo al ADC.**

Protocolo y criterios: [README.md](../../../README.md) (sección "Protocolo serie") y brief DMR103-PBL-001, secciones 6 y 8.

## Global Constraints

- El protocolo serie no cambia: 115200 baudios, texto, una línea por mensaje terminada en `\n`. Dispositivo → PC: `D,<seq>,<t_ms>,<fe>,<rc>,<mcf>` a ~50 Hz con 1 decimal, `CAL,OK,<ms>`, `CAL,ERR,<motivo>`, `BAT,<pct>`. Cualquier otra salida empieza con `#` (la interfaz cuenta como malformada toda línea desconocida). PC → Dispositivo: `START`, `STOP`, `CAL`, `EJ,<tipo>,<objetivo>`, `EJ,-`.
- Comandos nuevos solo para puesta en marcha desde el monitor serie: `MAG` (calibración del magnetómetro), `RAW` (alterna el envío de datos crudos a 5 Hz como `#RAW,...`) y `MANO,D` / `MANO,I` (lado de la mano). `MAG` y `MANO` se guardan en NVS (`Preferences`, espacio `"carpo"`). Responden solo con líneas `#`.
- Signos: `fe` positivo = flexión (los dedos van hacia la palma), `rc` positivo = desviación radial. `mcf` siempre `0.0`.
- Marco de la mano (después de aplicar el montaje): X distal (hacia los dedos), Z dorsal (sale del dorso), Y = Z × X (radial en mano derecha). En mano izquierda se invierte el signo de `rc`.
- Criterios del brief que el firmware debe permitir cumplir: error ≤ 3°, calibración ≤ 30 s, pérdida de datos < 1 %, ≥ 60 min sin reinicios.
- Placa: ESP32 DevKit (ESP32-WROOM-32), FQBN `esp32:esp32:esp32`. I2C en SDA = GPIO21, SCL = GPIO22, 400 kHz. Batería en GPIO34 (ADC1) con divisor 100 kΩ / 100 kΩ (factor 2,0).
- Los archivos de `src/nucleo/` no incluyen `Arduino.h`: solo `<stdint.h>`, `<stddef.h>`, `<math.h>`, `<stdio.h>` y `<string.h>`.
- Sin librerías externas de Arduino. Sin memoria dinámica en el ciclo (`String` solo se permite fuera de `loop`; el lector de comandos usa un búfer fijo).
- Registros del GY-85 (direcciones de 7 bits):
  - ADXL345 `0x53`: `DEVID` 0x00 = 0xE5; `BW_RATE` 0x2C ← 0x0A (100 Hz); `DATA_FORMAT` 0x31 ← 0x0B (resolución completa, ±16 g, 3,9 mg/LSB); `POWER_CTL` 0x2D ← 0x08; datos 0x32–0x37 X0,X1,Y0,Y1,Z0,Z1 (little-endian).
  - ITG3205 `0x68` (probar también `0x69`): `WHO_AM_I` 0x00; `PWR_MGM` 0x3E ← 0x01 (PLL con giro X); `SMPLRT_DIV` 0x15 ← 0x09 (100 Hz); `DLPF_FS` 0x16 ← 0x1B (±2000 °/s, DLPF 42 Hz); datos 0x1D–0x22 XH,XL,YH,YL,ZH,ZL (big-endian), 14,375 LSB/(°/s).
  - HMC5883L `0x1E`: identificación 0x0A–0x0C = `'H','4','3'`; CRA 0x00 ← 0x18 (75 Hz); CRB 0x01 ← 0x20 (1090 LSB/G); MODE 0x02 ← 0x00 (continuo); datos 0x03–0x08 en orden **X, Z, Y** (big-endian). −4096 = saturado.
  - QMC5883L `0x0D` (clones del GY-85): CHIP_ID 0x0D = 0xFF; SET/RESET 0x0B ← 0x01; CONTROL1 0x09 ← 0x1D (continuo, 200 Hz, 8 G, OSR 512); datos 0x00–0x05 X, Y, Z (little-endian), 3000 LSB/G.
  - 1 G = 100 µT.
- Tiempos: fusión cada 10 ms (100 Hz). Se envía `D` cada 2 ciclos (50 Hz). `BAT` cada 10 s. `RAW` cada 200 ms.
- Filtro: Madgwick, `beta` = 0,1 en operación y 2,5 durante la convergencia de `CAL`. `dt` se mide con `micros()` y se limita a (0; 0,05] s.
- Archivos nuevos con finales de línea LF. `README.md` es CRLF: editarlo con la herramienta Edit, nunca con `sed -i`.
- No es repositorio git: no hay commits. Al terminar cada tarea se guarda y se sigue.
- Pruebas de PC: `python firmware/pruebas/correr.py` desde `interfaz-medico`. Compilación del sketch:
  `"/c/Users/Personal/AppData/Local/Programs/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe" compile --fqbn esp32:esp32:esp32 firmware/carpo_esp32` (en adelante, `arduino-cli compile …`).
- `firmware/plantilla_protocolo/` no se modifica.

## Review Focus

1. **El ESP32 se reinicia al abrir el puerto desde el navegador** (el circuito de autorreset del DevKit responde a DTR/RTS) y el `START` que la interfaz envía enseguida se pierde: la interfaz queda conectada sin datos. → El firmware imprime `#Carpo ESP32 listo` al arrancar y tiene la constante `TRANSMITIR_AL_ARRANCAR` (por defecto `false`). Verificación en la Tarea 6, paso 3. Si hay reinicio, se pone en `true`.
2. **GY-85 clon con QMC5883L o sin magnetómetro**: se detecta el chip, se decodifica con su orden de bytes y, si no hay magnetómetro, se usa fusión de 6 ejes con el aviso `#Sin magnetometro: rc puede derivar`. → `PRUEBA(qmc_little_endian_xyz)` y `PRUEBA(hmc_orden_xzy)` en la Tarea 2. Detección verificada en la Tarea 6, paso 2.
3. **El cable I2C se suelta durante la sesión** (el cable se dobla con la muñeca): no se envían ángulos congelados. `seq` sigue aumentando para que la interfaz vea la pérdida, un `CAL` en curso responde `CAL,ERR,sensor` y el driver se reintenta cada 1 s hasta recuperar la lectura. → `PRUEBA(vigilante_*)` en la Tarea 4. Verificación desconectando SDA en la Tarea 6, paso 5.
4. **El paciente se mueve durante `CAL`**: no se toma un cero equivocado. La ventana de quietud se reinicia y, si no hay quietud en 10 s, se responde `CAL,ERR,movimiento`. → `PRUEBA(cal_movimiento_reinicia)` y `PRUEBA(cal_error_si_no_hay_quietud)` en la Tarea 4.
5. **Flexión o extensión cerca de ±90°** (bloqueo de cardán, redondeo fuera de [−1, 1] en `asin`): nunca se envía `nan`, que la interfaz contaría como línea malformada. → `PRUEBA(angulos_finitos_en_90)` en la Tarea 3.

---

## Estructura de archivos

```
interfaz-medico/firmware/
  carpo_esp32/
    carpo_esp32.ino          ciclo principal: comandos, muestreo, fusión, envío (Tarea 5)
    config.h                 pines, tiempos, montaje, banderas (Tarea 5)
    gy85.h / gy85.cpp        driver I2C: detección, configuración y lectura (Tarea 5)
    src/nucleo/
      protocolo.h/.cpp       lector de líneas, comandos y formato de mensajes (Tarea 1)
      gy85_datos.h/.cpp      Vec3, decodificación de registros, montaje de ejes (Tarea 2)
      bateria.h/.cpp         voltaje → % de LiPo 1S (Tarea 2)
      fusion.h/.cpp          cuaterniones y filtro Madgwick (Tarea 3)
      angulos.h/.cpp         fe/rc relativos a la orientación de calibración (Tarea 3)
      calibracion.h/.cpp     Calibrador, CalibradorMag, VigilanteSensor (Tarea 4)
  pruebas/
    prueba.h                 mini marco de pruebas (Tarea 1)
    correr.py                compila y corre test_*.cpp (Tarea 1)
    test_protocolo.cpp  test_gy85_datos.cpp  test_bateria.cpp
    test_fusion.cpp     test_angulos.cpp     test_calibracion.cpp
```

---

### Task 1: Banco de pruebas en PC y protocolo

**Files:**
- Create: `firmware/pruebas/prueba.h`, `firmware/pruebas/correr.py`
- Create: `firmware/carpo_esp32/src/nucleo/protocolo.h`, `protocolo.cpp`
- Test: `firmware/pruebas/test_protocolo.cpp`

**Interfaces:**
- Produces (`prueba.h`): `PRUEBA(nombre) { … }` registra una prueba. Aserciones: `VERIFICAR(cond)`, `CERCA(a, b, tol)` y `TEXTO_IGUAL(a, b)`. Al fallar, imprimen archivo, línea y valores, y siguen con la prueba siguiente. `int correrPruebas()` corre todas, imprime `<archivo>: N pruebas, M fallas` y devuelve `M != 0`. Cada `test_*.cpp` termina con `int main() { return correrPruebas(); }`.
- Produces (`correr.py`): `python firmware/pruebas/correr.py [nombre]` compila cada `test_*.cpp` (o solo `test_<nombre>.cpp`) junto con todos los `.cpp` de `carpo_esp32/src/nucleo/`, con `python -m ziglang c++ -std=c++17 -Wall -Wextra -Werror -I <nucleo>`, en `firmware/pruebas/build/`. Corre cada ejecutable y sale con código 1 si alguna compilación o prueba falla.
- Produces (`protocolo.h`):
  - `enum class TipoComando { Start, Stop, Cal, Ej, Mag, Raw, Mano, Desconocido };`
  - `TipoComando parsearComando(const char* linea);`: compara de forma exacta y distingue mayúsculas, como la plantilla. `Ej` si empieza con `"EJ,"`; `Mano` si empieza con `"MANO,"`.
  - `bool parsearMano(const char* linea, bool& izquierda);`: `"MANO,I"` → izquierda; `"MANO,D"` → derecha; con cualquier otro valor devuelve `false`.
  - `class LectorLineas { public: bool agregar(char c); const char* linea() const; };`: búfer fijo de 64 caracteres. Ignora `\r`. Al recibir `\n` devuelve `true` si la línea recortada no está vacía. Una línea de más de 64 caracteres se descarta entera.
  - `int formatearMuestra(char* buf, size_t tam, uint32_t seq, uint32_t tMs, float fe, float rc, float mcf);` → `"D,<seq>,<t>,<fe>,<rc>,<mcf>"` con `%.1f` y sin `\n`. Devuelve la longitud, como `snprintf`.
  - `int formatearCalOk(char* buf, size_t tam, uint32_t ms);`, `int formatearCalErr(char* buf, size_t tam, const char* motivo);`, `int formatearBateria(char* buf, size_t tam, int pct);`

- [ ] **Step 1: Instalar el compilador portable**

Run: `python -m pip install ziglang==0.13.0` y luego `python -m ziglang c++ --version`
Expected: imprime una versión de clang.

- [ ] **Step 2: Escribir `prueba.h`, `correr.py` y la prueba que falla**

```cpp
#include "prueba.h"
#include "protocolo.h"

PRUEBA(muestra_con_un_decimal) {
  char b[64];
  formatearMuestra(b, sizeof b, 7, 140, 12.345f, -3.26f, 0.0f);
  TEXTO_IGUAL(b, "D,7,140,12.3,-3.3,0.0");
}
PRUEBA(mensajes_cal_y_bateria) {
  char b[64];
  formatearCalOk(b, sizeof b, 2510);              TEXTO_IGUAL(b, "CAL,OK,2510");
  formatearCalErr(b, sizeof b, "movimiento");     TEXTO_IGUAL(b, "CAL,ERR,movimiento");
  formatearBateria(b, sizeof b, 87);              TEXTO_IGUAL(b, "BAT,87");
}
PRUEBA(comandos_conocidos) {
  VERIFICAR(parsearComando("START") == TipoComando::Start);
  VERIFICAR(parsearComando("STOP") == TipoComando::Stop);
  VERIFICAR(parsearComando("CAL") == TipoComando::Cal);
  VERIFICAR(parsearComando("EJ,flexion,10") == TipoComando::Ej);
  VERIFICAR(parsearComando("EJ,-") == TipoComando::Ej);
  VERIFICAR(parsearComando("MAG") == TipoComando::Mag);
  VERIFICAR(parsearComando("RAW") == TipoComando::Raw);
  VERIFICAR(parsearComando("MANO,I") == TipoComando::Mano);
  VERIFICAR(parsearComando("CALX") == TipoComando::Desconocido);
  VERIFICAR(parsearComando("start") == TipoComando::Desconocido);
}
PRUEBA(mano) {
  bool izq = false;
  VERIFICAR(parsearMano("MANO,I", izq) && izq);
  VERIFICAR(parsearMano("MANO,D", izq) && !izq);
  VERIFICAR(!parsearMano("MANO,X", izq));
}
PRUEBA(lector_crlf_y_espacios) {   // el monitor serie de Arduino envía \r\n
  LectorLineas l; bool listo = false;
  for (char c : "CAL\r\n") if (c) listo = l.agregar(c);
  VERIFICAR(listo); TEXTO_IGUAL(l.linea(), "CAL");
  for (char c : "  START \n") if (c) listo = l.agregar(c);
  VERIFICAR(listo); TEXTO_IGUAL(l.linea(), "START");
  VERIFICAR(!l.agregar('\n'));
}
PRUEBA(lector_descarta_linea_larga) {
  LectorLineas l;
  for (int i = 0; i < 70; i++) l.agregar('A');
  VERIFICAR(!l.agregar('\n'));
  bool listo = false;
  for (char c : "STOP\n") if (c) listo = l.agregar(c);
  VERIFICAR(listo); TEXTO_IGUAL(l.linea(), "STOP");
}

int main() { return correrPruebas(); }
```

- [ ] **Step 3: Correr y ver que falla**

Run: `python firmware/pruebas/correr.py protocolo`
Expected: FAIL de compilación (`protocolo.h` no existe).

- [ ] **Step 4: Implementar `protocolo.h` / `protocolo.cpp` con las firmas de arriba**

`formatear*` con `snprintf`. `LectorLineas` recorta espacios con `isspace` al cerrar la línea y usa una bandera de desborde que se limpia en cada `\n`.

- [ ] **Step 5: Correr y ver que pasa**

Run: `python firmware/pruebas/correr.py protocolo`
Expected: `test_protocolo: 6 pruebas, 0 fallas` y código de salida 0.

---

### Task 2: Decodificación del GY-85, montaje de ejes y batería

**Files:**
- Create: `firmware/carpo_esp32/src/nucleo/gy85_datos.h`, `gy85_datos.cpp`, `bateria.h`, `bateria.cpp`
- Test: `firmware/pruebas/test_gy85_datos.cpp`, `firmware/pruebas/test_bateria.cpp`

**Interfaces:**
- Consumes: `prueba.h`, `correr.py` (Tarea 1).
- Produces (`gy85_datos.h`):
  - `struct Vec3 { float x, y, z; };`
  - `Vec3 decodificarAdxl345(const uint8_t r[6]);` → g
  - `Vec3 decodificarItg3205(const uint8_t r[6]);` → rad/s
  - `Vec3 decodificarHmc5883l(const uint8_t r[6]);` → µT (bytes en orden X, Z, Y)
  - `Vec3 decodificarQmc5883l(const uint8_t r[6]);` → µT
  - `bool hmcSaturado(const uint8_t r[6]);`: `true` si algún eje vale −4096.
  - `struct Montaje { uint8_t eje[3]; int8_t signo[3]; };`: el eje de salida `i` vale `signo[i] * entrada[eje[i]]`, con 0 = x, 1 = y y 2 = z. `constexpr Montaje MONTAJE_IDENTIDAD{{0,1,2},{1,1,1}};`
  - `Vec3 aplicarMontaje(const Vec3& v, const Montaje& m);`
- Produces (`bateria.h`): `int porcentajeBateria(float voltios);`. Interpolación lineal en la tabla LiPo 1S (V → %): 3,30→0 · 3,60→5 · 3,70→15 · 3,75→25 · 3,80→40 · 3,85→55 · 3,95→70 · 4,05→85 · 4,20→100. Se limita a 0–100 y se redondea con `lroundf`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```cpp
// test_gy85_datos.cpp
PRUEBA(adxl_little_endian) {
  const uint8_t r[6] = {0x00,0x01, 0x00,0xFF, 0x00,0x00};   // +256, -256, 0
  Vec3 a = decodificarAdxl345(r);
  CERCA(a.x, 0.9984f, 1e-4f); CERCA(a.y, -0.9984f, 1e-4f); CERCA(a.z, 0.0f, 1e-6f);
}
PRUEBA(itg_big_endian_a_rad_s) {
  const uint8_t r[6] = {0x05,0x9E, 0xFA,0x62, 0x00,0x00};   // +1438, -1438, 0
  Vec3 g = decodificarItg3205(r);
  CERCA(g.x, 1.74594f, 1e-3f); CERCA(g.y, -1.74594f, 1e-3f);
}
PRUEBA(hmc_orden_xzy) {
  const uint8_t r[6] = {0x01,0x11, 0x00,0x00, 0xFE,0xEF};   // X=273, Z=0, Y=-273
  Vec3 m = decodificarHmc5883l(r);
  CERCA(m.x, 25.046f, 1e-2f); CERCA(m.y, -25.046f, 1e-2f); CERCA(m.z, 0.0f, 1e-6f);
}
PRUEBA(hmc_saturado) {
  const uint8_t r[6] = {0x00,0x10, 0xF0,0x00, 0x00,0x00};
  VERIFICAR(hmcSaturado(r));
}
PRUEBA(qmc_little_endian_xyz) {
  const uint8_t r[6] = {0xB8,0x0B, 0x48,0xF4, 0x00,0x00};   // +3000, -3000, 0
  Vec3 m = decodificarQmc5883l(r);
  CERCA(m.x, 100.0f, 1e-3f); CERCA(m.y, -100.0f, 1e-3f);
}
PRUEBA(montaje_permuta_y_signo) {
  Montaje m{{1,0,2},{-1,1,1}};                // salida x = -entrada y; salida y = entrada x
  Vec3 v = aplicarMontaje({1,2,3}, m);
  CERCA(v.x, -2, 1e-6f); CERCA(v.y, 1, 1e-6f); CERCA(v.z, 3, 1e-6f);
}

// test_bateria.cpp
PRUEBA(bateria_tabla) {
  VERIFICAR(porcentajeBateria(4.25f) == 100);
  VERIFICAR(porcentajeBateria(4.20f) == 100);
  VERIFICAR(porcentajeBateria(3.80f) == 40);
  VERIFICAR(porcentajeBateria(3.65f) == 10);
  VERIFICAR(porcentajeBateria(3.20f) == 0);
  VERIFICAR(porcentajeBateria(0.0f) == 0);    // alimentado por USB sin batería
}
```

- [ ] **Step 2: Correr y ver que falla**

Run: `python firmware/pruebas/correr.py gy85_datos` y `python firmware/pruebas/correr.py bateria`
Expected: FAIL de compilación (los encabezados no existen).

- [ ] **Step 3: Implementar `gy85_datos` y `bateria` con las firmas y escalas de Global Constraints**

- [ ] **Step 4: Correr todo y ver que pasa**

Run: `python firmware/pruebas/correr.py`
Expected: `test_bateria: 1 pruebas, 0 fallas`, `test_gy85_datos: 6 pruebas, 0 fallas` y `test_protocolo: 6 pruebas, 0 fallas`.

---

### Task 3: Fusión Madgwick y ángulos de muñeca

**Files:**
- Create: `firmware/carpo_esp32/src/nucleo/fusion.h`, `fusion.cpp`, `angulos.h`, `angulos.cpp`
- Test: `firmware/pruebas/test_fusion.cpp`, `firmware/pruebas/test_angulos.cpp`

**Interfaces:**
- Consumes: `Vec3` (Tarea 2).
- Produces (`fusion.h`):
  - `struct Cuaternion { float w = 1, x = 0, y = 0, z = 0; };`: representa la rotación sensor → tierra (`v_tierra = q ⊗ v_sensor ⊗ q*`), la misma convención que Madgwick.
  - `Cuaternion multiplicar(const Cuaternion& a, const Cuaternion& b);`, `Cuaternion conjugado(const Cuaternion& q);`
  - `Cuaternion desdeEjeAngulo(Vec3 eje, float rad);`: normaliza el eje.
  - `Vec3 rotar(const Cuaternion& q, const Vec3& v);`
  - `class FiltroMadgwick { public: explicit FiltroMadgwick(float beta = 0.1f); void fijarBeta(float b); void reiniciar(const Cuaternion& q = Cuaternion{}); void actualizar(const Vec3& giro, const Vec3& acel, const Vec3& mag, float dt); void actualizar(const Vec3& giro, const Vec3& acel, float dt); Cuaternion orientacion() const; };`. Usa el algoritmo AHRS (9 ejes) e IMU (6 ejes) de la implementación de referencia de Madgwick (2010). Reglas propias: `dt ≤ 0` no hace nada; `dt > 0,05` se toma como 0,05. Si `|mag| = 0`, usa la versión de 6 ejes. Si `|acel| = 0`, solo integra el giro. El cuaternión se normaliza en cada paso.
- Produces (`angulos.h`):
  - `struct AngulosMuneca { float fe, rc; };` (grados)
  - `AngulosMuneca angulosRelativos(const Cuaternion& qCal, const Cuaternion& qAhora, bool manoIzquierda);`: calcula `q_rel = conjugado(qCal) ⊗ qAhora` y lo descompone en Z-Y-X intrínseco: `rc` = giro en Z, `fe` = giro en Y y el giro en X se descarta. `fe = asin(clamp(2(w·y − x·z), −1, 1))` y `rc = atan2(2(w·z + x·y), 1 − 2(y² + z²))`, en grados. En mano izquierda se invierte el signo de `rc`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```cpp
// test_angulos.cpp
const float GRAD = 3.14159265f / 180;
PRUEBA(angulos_cero_en_calibracion) {
  Cuaternion q = desdeEjeAngulo({1,1,0}, 40 * GRAD);
  AngulosMuneca a = angulosRelativos(q, q, false);
  CERCA(a.fe, 0, 0.05f); CERCA(a.rc, 0, 0.05f);
}
PRUEBA(flexion_positiva_en_y) {
  Cuaternion qCal = desdeEjeAngulo({1,1,0}, 40 * GRAD);    // no depende de la orientación absoluta
  Cuaternion q = multiplicar(qCal, desdeEjeAngulo({0,1,0}, 30 * GRAD));
  AngulosMuneca a = angulosRelativos(qCal, q, false);
  CERCA(a.fe, 30, 0.1f); CERCA(a.rc, 0, 0.1f);
}
PRUEBA(radial_positiva_en_z_y_mano_izquierda) {
  Cuaternion q = desdeEjeAngulo({0,0,1}, 15 * GRAD);
  CERCA(angulosRelativos({}, q, false).rc, 15, 0.1f);
  CERCA(angulosRelativos({}, q, true).rc, -15, 0.1f);
}
PRUEBA(cuaternion_negado_mismos_angulos) {
  Cuaternion q = desdeEjeAngulo({0,1,0}, 50 * GRAD), n{-q.w, -q.x, -q.y, -q.z};
  CERCA(angulosRelativos({}, n, false).fe, 50, 0.1f);
}
PRUEBA(angulos_finitos_en_90) {
  Cuaternion q = desdeEjeAngulo({0,1,0}, 90.0001f * GRAD);
  AngulosMuneca a = angulosRelativos({}, q, false);
  VERIFICAR(isfinite(a.fe) && isfinite(a.rc)); CERCA(a.fe, 90, 0.1f);
}

// test_fusion.cpp  (100 Hz, dt = 0.01; misma constante GRAD)
PRUEBA(quieto_se_mantiene) {
  FiltroMadgwick f;
  for (int i = 0; i < 2000; i++) f.actualizar({0,0,0}, {0,0,1}, {20,0,-40}, 0.01f);
  AngulosMuneca a = angulosRelativos({}, f.orientacion(), false);
  CERCA(a.fe, 0, 0.5f); CERCA(a.rc, 0, 0.5f);
}
PRUEBA(converge_a_inclinacion_real) {
  // Orientación real: 30° en Y. Se generan acel y mag del sensor con rotar(conjugado(qReal), …).
  Cuaternion qReal = desdeEjeAngulo({0,1,0}, 30 * GRAD);
  Vec3 acel = rotar(conjugado(qReal), {0,0,1}), mag = rotar(conjugado(qReal), {20,0,-40});
  FiltroMadgwick f(2.5f);
  for (int i = 0; i < 300; i++) f.actualizar({0,0,0}, acel, mag, 0.01f);
  CERCA(angulosRelativos({}, f.orientacion(), false).fe, 30, 1.0f);
}
PRUEBA(integra_giro_en_z) {
  FiltroMadgwick f;
  for (int i = 0; i < 50; i++) f.actualizar({0,0,1}, {0,0,1}, 0.01f);   // 1 rad/s durante 0,5 s, 6 ejes
  CERCA(angulosRelativos({}, f.orientacion(), false).rc, 28.65f, 0.5f);
}
PRUEBA(dt_grande_se_limita) {
  FiltroMadgwick f;
  f.actualizar({0,0,1}, {0,0,1}, 1.0f);
  CERCA(angulosRelativos({}, f.orientacion(), false).rc, 2.865f, 0.1f);
}
PRUEBA(acel_cero_sin_nan) {
  FiltroMadgwick f;
  f.actualizar({0.1f,0,0}, {0,0,0}, {0,0,0}, 0.01f);
  Cuaternion q = f.orientacion();
  VERIFICAR(isfinite(q.w) && isfinite(q.x) && isfinite(q.y) && isfinite(q.z));
}
```

- [ ] **Step 2: Correr y ver que falla**

Run: `python firmware/pruebas/correr.py angulos` y `python firmware/pruebas/correr.py fusion`
Expected: FAIL de compilación.

- [ ] **Step 3: Implementar `fusion` y `angulos` con las firmas y reglas de arriba**

- [ ] **Step 4: Correr todo y ver que pasa**

Run: `python firmware/pruebas/correr.py`
Expected: todos los archivos con `0 fallas` (5 pruebas en `test_angulos` y 5 en `test_fusion`).

---

### Task 4: Calibración y vigilancia del sensor

**Files:**
- Create: `firmware/carpo_esp32/src/nucleo/calibracion.h`, `calibracion.cpp`
- Test: `firmware/pruebas/test_calibracion.cpp`

**Interfaces:**
- Consumes: `Vec3` (Tarea 2).
- Produces:
  - `enum class EstadoCal { Inactivo, Midiendo, Convergiendo, Listo, Error };`
  - `class Calibrador { public: void iniciar(uint32_t tMs); EstadoCal agregar(const Vec3& giroCrudo, const Vec3& acel, uint32_t tMs); EstadoCal estado() const; Vec3 sesgoGiro() const; uint32_t duracionMs() const; const char* motivo() const; };`
    - Una muestra es *quieta* si `|acel|` está en [0,90; 1,10] g y cada eje del giro difiere menos de 0,10 rad/s del giro de la primera muestra de la ventana.
    - `Midiendo`: promedia el giro durante 1000 ms de muestras quietas. Así obtiene `sesgoGiro` y pasa a `Convergiendo`.
    - `Convergiendo`: 1500 ms más de muestras quietas y luego `Listo`. `duracionMs` = tiempo desde `iniciar`.
    - Una muestra no quieta en cualquiera de las dos fases vuelve a `Midiendo` con una ventana nueva.
    - Si pasan 10 000 ms desde `iniciar` sin llegar a `Listo`: `Error` con `motivo() == "movimiento"`.
    - `agregar` en `Inactivo`, `Listo` o `Error` no cambia el estado. `iniciar` siempre empieza de cero.
  - `class CalibradorMag { public: void iniciar(); void agregar(const Vec3& mag); bool valido() const; Vec3 desfase() const; };`: desfase = (máx + mín) / 2 en cada eje. Es válido si el rango de cada eje es ≥ 30 µT.
  - `class VigilanteSensor { public: void registrar(bool lecturaOk, uint32_t tMs); bool perdido() const; bool debeReintentar(uint32_t tMs); };`: queda `perdido` tras 5 lecturas fallidas seguidas y una lectura buena lo restablece. Mientras esté perdido, `debeReintentar` devuelve `true` como máximo una vez cada 1000 ms.

- [ ] **Step 1: Escribir las pruebas que fallan**

Ayudante dentro de la prueba: `EstadoCal alimentar(Calibrador&, uint32_t desde, uint32_t hasta, Vec3 giro, Vec3 acel)` llama a `agregar` cada 10 ms desde `desde` hasta `hasta`, **ambos incluidos**, y devuelve el último estado. `GRAD` es la misma constante de `test_angulos.cpp`. Las fases terminan cuando `tMs − inicioVentana ≥ duración`: con muestras quietas desde t = 0, el estado pasa a `Convergiendo` en t = 1000 y a `Listo` en t = 2500.

```cpp
const Vec3 SESGO{0.02f, -0.01f, 0.03f}, G{0, 0, 1};
PRUEBA(cal_quieto_estima_sesgo) {
  Calibrador c; c.iniciar(0);
  VERIFICAR(alimentar(c, 0, 1000, SESGO, G) == EstadoCal::Convergiendo);
  CERCA(c.sesgoGiro().x, 0.02f, 1e-4f); CERCA(c.sesgoGiro().z, 0.03f, 1e-4f);
  VERIFICAR(alimentar(c, 1010, 2500, SESGO, G) == EstadoCal::Listo);
  VERIFICAR(c.duracionMs() >= 2500 && c.duracionMs() <= 2520);
}
PRUEBA(cal_movimiento_reinicia) {
  Calibrador c; c.iniciar(0);
  alimentar(c, 0, 500, SESGO, G);
  c.agregar({0.5f, 0, 0}, G, 510);                     // golpe a los 0,5 s
  VERIFICAR(c.estado() == EstadoCal::Midiendo);
  VERIFICAR(alimentar(c, 520, 2900, SESGO, G) != EstadoCal::Listo);
  VERIFICAR(alimentar(c, 2910, 3100, SESGO, G) == EstadoCal::Listo);
}
PRUEBA(cal_error_si_no_hay_quietud) {
  Calibrador c; c.iniciar(0);
  for (uint32_t t = 0; t <= 10000; t += 10) c.agregar({(t / 10) % 2 ? 0.5f : 0.0f, 0, 0}, G, t);
  VERIFICAR(c.estado() == EstadoCal::Error); TEXTO_IGUAL(c.motivo(), "movimiento");
}
PRUEBA(cal_inactivo_no_cambia) {
  Calibrador c;
  VERIFICAR(c.agregar(SESGO, G, 0) == EstadoCal::Inactivo);
}
PRUEBA(mag_desfase_esfera) {
  CalibradorMag m; m.iniciar();
  for (int i = 0; i < 360; i += 5) for (int j = -80; j <= 80; j += 10) {   // esfera de 45 µT centrada en (10,-5,3)
    float a = i * GRAD, b = j * GRAD;
    m.agregar({10 + 45 * cosf(b) * cosf(a), -5 + 45 * cosf(b) * sinf(a), 3 + 45 * sinf(b)});
  }
  VERIFICAR(m.valido()); CERCA(m.desfase().x, 10, 0.5f); CERCA(m.desfase().y, -5, 0.5f); CERCA(m.desfase().z, 3, 1.0f);
}
PRUEBA(mag_giro_insuficiente) {
  CalibradorMag m; m.iniciar();
  for (int i = 0; i < 360; i += 5) m.agregar({45 * cosf(i * GRAD), 45 * sinf(i * GRAD), 0});   // solo en Z
  VERIFICAR(!m.valido());
}
PRUEBA(vigilante_pierde_tras_5_fallas) {
  VigilanteSensor v;
  for (int i = 0; i < 4; i++) v.registrar(false, i * 10);
  VERIFICAR(!v.perdido());
  v.registrar(false, 40); VERIFICAR(v.perdido());
  v.registrar(true, 50);  VERIFICAR(!v.perdido());
}
PRUEBA(vigilante_reintenta_cada_segundo) {
  VigilanteSensor v;
  for (int i = 0; i < 5; i++) v.registrar(false, i * 10);
  VERIFICAR(v.debeReintentar(100)); VERIFICAR(!v.debeReintentar(600)); VERIFICAR(v.debeReintentar(1100));
}
```

- [ ] **Step 2: Correr y ver que falla**

Run: `python firmware/pruebas/correr.py calibracion`
Expected: FAIL de compilación.

- [ ] **Step 3: Implementar `calibracion.h` / `calibracion.cpp` con las reglas de arriba**

- [ ] **Step 4: Correr todo y ver que pasa**

Run: `python firmware/pruebas/correr.py`
Expected: todos los archivos con `0 fallas` (8 pruebas en `test_calibracion`).

---

### Task 5: Driver del GY-85 y sketch principal

**Files:**
- Create: `firmware/carpo_esp32/config.h`, `gy85.h`, `gy85.cpp`, `carpo_esp32.ino`

**Interfaces:**
- Consumes: todo lo de `src/nucleo/` (Tareas 1–4), incluido con `#include "src/nucleo/<archivo>.h"`.
- Produces (`config.h`, valores de Global Constraints): `PIN_SDA`, `PIN_SCL`, `I2C_HZ`, `PIN_BATERIA`, `FACTOR_DIVISOR`, `PERIODO_FUSION_MS` (10), `CICLOS_POR_ENVIO` (2), `PERIODO_BAT_MS` (10000), `PERIODO_RAW_MS` (200), `DURACION_MAG_MS` (20000), `BETA_NORMAL` (0,1), `BETA_CONVERGENCIA` (2,5), `USAR_MAGNETOMETRO` (`true`), `TRANSMITIR_AL_ARRANCAR` (`false`), y `MONTAJE_ACEL`, `MONTAJE_GIRO`, `MONTAJE_MAG` (los tres en `MONTAJE_IDENTIDAD`: placa con los chips hacia arriba sobre el dorso y la flecha X hacia los dedos).
- Produces (`gy85.h`): `class Gy85 { public: bool iniciar(TwoWire& wire); bool leer(Vec3& acel, Vec3& giro, Vec3& mag); bool tieneMagnetometro() const; const char* nombreMagnetometro() const; };`
  - `iniciar`: verifica `DEVID` del ADXL345, prueba el ITG3205 en 0x68 y 0x69, y busca el HMC5883L (identificación `H43`) y luego el QMC5883L. Escribe los registros de Global Constraints. Devuelve `true` si responden el acelerómetro y el giróscopo.
  - `leer`: lee en ráfaga de 6 bytes, decodifica y aplica `MONTAJE_*`. Devuelve `false` si falla alguna transacción del acelerómetro o del giróscopo. Si el magnetómetro falla o satura, devuelve `mag = {0,0,0}`; así la fusión pasa a 6 ejes en esa muestra.
  - `nombreMagnetometro()`: `"HMC5883L"`, `"QMC5883L"` o `"ninguno"`.

Comportamiento de `carpo_esp32.ino`:
- `setup`: `Serial.begin(115200)`, `Wire.begin(PIN_SDA, PIN_SCL, I2C_HZ)`. Lee de `Preferences("carpo")` el desfase del magnetómetro (`mx`, `my`, `mz`, por defecto 0) y la mano (`izq`, por defecto `false`). Imprime `#Carpo ESP32 listo, magnetometro: <nombre>` o `#GY-85 no detectado`, y `#Sin magnetometro: rc puede derivar` si corresponde. `transmitiendo = TRANSMITIR_AL_ARRANCAR`.
- Comandos (con `LectorLineas`): `START` / `STOP` igual que la plantilla. `CAL`: si el sensor está perdido o no detectado, responde `CAL,ERR,sensor`; si no, `calibrador.iniciar(millis())`. `EJ` se ignora. `MAG`: inicia `CalibradorMag` por `DURACION_MAG_MS` y al terminar guarda y responde `#MAG,OK,<x>,<y>,<z>` o `#MAG,ERR,giro insuficiente`. `RAW` alterna el envío. `MANO`: guarda y responde `#MANO,I` o `#MANO,D`. Otro comando: `#Comando desconocido: <linea>`.
- Cada `PERIODO_FUSION_MS` (programación con `proximo += periodo`; si el atraso supera 5 periodos, `proximo = ahora + periodo`):
  1. `ok = gy85.leer(...)` y `vigilante.registrar(ok, ahora)`. Si `vigilante.debeReintentar(ahora)`: `gy85.iniciar(Wire)` y `#Error de lectura del GY-85, reintentando`.
  2. Si `ok`: calcula `giroC = giro − sesgo` y `magC = mag − desfaseMag` (solo si `mag` no es cero). Si `USAR_MAGNETOMETRO` y hay magnetómetro, llama al `filtro.actualizar` de 9 ejes; si no, al de 6. `dt` sale de `micros()`.
  3. Calibración en curso: `calibrador.agregar(giro crudo, acel, ahora)`. Al entrar en `Convergiendo`: `sesgo = calibrador.sesgoGiro()` y `filtro.fijarBeta(BETA_CONVERGENCIA)`. En `Listo`: `qCal = filtro.orientacion()`, `filtro.fijarBeta(BETA_NORMAL)` y `CAL,OK,<duracionMs>`. En `Error`: `CAL,ERR,<motivo>`. Si `vigilante.perdido()` durante la calibración: `CAL,ERR,sensor` y la calibración se abandona.
  4. Cada `CICLOS_POR_ENVIO` ciclos, si `transmitiendo`: `++seq` siempre. Solo si `ok` envía `formatearMuestra(seq, ahora, fe, rc, 0.0f)` con `angulosRelativos(qCal, filtro.orientacion(), manoIzquierda)`. Una muestra sin lectura deja un hueco en `seq`.
- `BAT` cada `PERIODO_BAT_MS`: promedia 16 lecturas de `analogReadMilliVolts(PIN_BATERIA)` y aplica `porcentajeBateria(mV / 1000 * FACTOR_DIVISOR)`.
- `RAW` activo: cada `PERIODO_RAW_MS` envía `#RAW,ax,ay,az,gx,gy,gz,mx,my,mz` con los valores ya montados (g, rad/s, µT, 3 decimales).

- [ ] **Step 1: Escribir `config.h`, `gy85.h` / `gy85.cpp` y `carpo_esp32.ino` según lo de arriba**

- [ ] **Step 2: Compilar**

Run: `arduino-cli compile …` (comando completo en Global Constraints)
Expected: termina con `Sketch uses … bytes` y sin errores ni advertencias de los archivos del proyecto.

- [ ] **Step 3: Confirmar que el núcleo sigue pasando**

Run: `python firmware/pruebas/correr.py`
Expected: todos los archivos con `0 fallas`.

---

### Task 6: Puesta en marcha en banco y documentación

Requiere el ESP32 con el GY-85 conectado por USB. Cerrar el monitor serie antes de usar la interfaz.

**Files:**
- Modify: `README.md`: sección "Protocolo serie" (párrafo de la plantilla) y lista "Archivos"
- Modify: `firmware/carpo_esp32/config.h` (solo si los pasos 2 o 3 lo piden)

- [ ] **Step 1: Cargar el firmware**

Run: `arduino-cli upload` con `--fqbn esp32:esp32:esp32 -p COMx firmware/carpo_esp32` (puerto según el Administrador de dispositivos).
Expected: `Hard resetting via RTS pin...` y, en el monitor serie a 115200, `#Carpo ESP32 listo, magnetometro: HMC5883L` (o `QMC5883L`).

- [ ] **Step 2: Verificar ejes con `RAW`** (Review Focus 2)

Con la placa en el dorso de la mano y el antebrazo apoyado con la palma hacia abajo:
- En reposo: `az` ≈ +1, `ax` ≈ `ay` ≈ 0.
- Dedos hacia abajo (flexión): `ax` se vuelve negativo y `gy` es positivo durante el giro.
- Desviación radial en mano derecha: `gz` es positivo durante el giro.
- `mx`, `my` y `mz` cambian al girar y ninguno queda fijo en 0.

Si un eje no coincide, corregir `MONTAJE_*` en `config.h`, volver a cargar y repetir.

- [ ] **Step 3: Conexión desde la interfaz** (Review Focus 1)

Abrir la interfaz (`python -m http.server 8765`), ir a *Monitoreo en vivo* → *Dispositivo USB* → conectar.
Expected: llegan muestras a ~50 Hz y la pérdida se mantiene en 0 %. Si no llegan datos (la placa se reinició y perdió el `START`), poner `TRANSMITIR_AL_ARRANCAR = true`, volver a cargar y repetir.

- [ ] **Step 4: Calibración del magnetómetro y de la sesión**

En el monitor serie: `MANO,D` (o `I`) y luego `MAG`, girando la mano en todas las direcciones durante 20 s.
Expected: `#MAG,OK,...`. En la interfaz, *Calibrar* con la mano quieta da `Calibrado en ≈ 2,5 s (✓ ≤ 30 s)`. Si se mueve la mano durante la calibración, debe tardar más o mostrar `Falló: movimiento`.

- [ ] **Step 5: Sensor desconectado** (Review Focus 3)

Con datos llegando, desconectar el cable SDA unos 3 s y volver a conectarlo.
Expected: la pérdida de datos sube durante el corte, la señal no queda plana en el último valor y los datos vuelven solos. Si se pide *Calibrar* con el cable suelto, aparece `Falló: sensor`.

- [ ] **Step 6: Exactitud frente al goniómetro** (criterio 1 del brief)

Con el antebrazo apoyado, poner la muñeca en 0°, ±30° y ±60° de flexo-extensión, y en +15° y −25° de desviación, medidos con goniómetro. Registrar cada valor.
Expected: error ≤ 3° en cada posición. Si `rc` falla, repetir con `USAR_MAGNETOMETRO = false`, comparar y dejar la opción que dé menor error, anotando el resultado en la bitácora FAT.

- [ ] **Step 7: Prueba larga** (criterios 5 y 6)

Transmitir de forma continua durante 60 min desde la interfaz.
Expected: pérdida < 1 %, ningún `#Carpo ESP32 listo` intermedio (no hubo reinicios) y una deriva de `rc` en reposo menor a 3° al final.

- [ ] **Step 8: Actualizar `README.md`**

- En "Protocolo serie", después del párrafo de la plantilla: `firmware/carpo_esp32/` es el firmware real (ESP32 + GY-85 en el dorso de la mano, antebrazo apoyado), `mcf` se envía como 0, y se describen los comandos de puesta en marcha `MAG`, `RAW` y `MANO,D|I`, el cableado (SDA 21, SCL 22, batería en GPIO34 con divisor 100k/100k) y cómo correr las pruebas (`python firmware/pruebas/correr.py`).
- En "Archivos": una línea para `firmware/carpo_esp32/` y otra para `firmware/pruebas/`.
