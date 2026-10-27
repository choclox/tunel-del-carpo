// Configuración del firmware del carpo (ESP32-C6 DevKit + GY-85).
#pragma once
#include <stdint.h>
#include "src/nucleo/gy85_datos.h"

// Pines (ESP32-C6: el ADC solo existe en GPIO0–GPIO6; GPIO4, 5, 8, 9 y 15 son de arranque)
constexpr int PIN_SDA = 21;
constexpr int PIN_SCL = 22;
constexpr uint32_t I2C_HZ = 400000;
// Alimentación por el USB del PC, sin batería: no se envía BAT. Poner en true solo si se
// conecta una LiPo 1S a PIN_BATERIA con el divisor 100 k / 100 k.
constexpr bool MEDIR_BATERIA = false;
constexpr int PIN_BATERIA = 2;           // ADC1_CH2
constexpr float FACTOR_DIVISOR = 2.0f;

// Tiempos
constexpr uint32_t PERIODO_FUSION_MS = 10;   // 100 Hz
constexpr uint8_t CICLOS_POR_ENVIO = 2;      // D a 50 Hz
constexpr uint32_t PERIODO_BAT_MS = 10000;
constexpr uint32_t PERIODO_RAW_MS = 200;
constexpr uint32_t DURACION_MAG_MS = 20000;

// Giroscopio: el ITG3205 del módulo actual no mide (no guarda la configuración y da ceros).
// Con false no se usa: la orientación sale solo de acel y mag (FiltroSinGiro). Volver a true
// con un GY-85 cuyo giroscopio funcione.
constexpr bool USAR_GIROSCOPIO = false;
constexpr float ALFA_SIN_GIRO = 0.2f;   // paso bajo de acel/mag a 100 Hz (~50 ms)

// Filtro
constexpr float BETA_NORMAL = 0.1f;
constexpr float BETA_CONVERGENCIA = 2.5f;
constexpr bool USAR_MAGNETOMETRO = true;

// Si el ESP32 se reinicia al abrir el puerto (autorreset DTR/RTS), el START se pierde:
// poner en true para transmitir desde el arranque.
constexpr bool TRANSMITIR_AL_ARRANCAR = false;

// EMG de 3 canales: EMG 1 tenar, EMG 2 flexores, EMG 3 extensores. Con USAR_EMG = false el
// firmware envía la línea D de 6 campos, como siempre. Con true agrega ",emg1,emg2,emg3" (0–1000).
constexpr bool USAR_EMG = false;
enum class ModoEmg { Envolvente, Crudo };
// Envolvente: el sensor ya entrega la envolvente (p. ej. MyoWare 2.0, salida ENV).
// Crudo: señal centrada en EMG_CENTRO_MV; se muestrea a 1000 Hz y se envía el RMS de 50 ms.
constexpr ModoEmg EMG_MODO = ModoEmg::Envolvente;
constexpr int PINES_EMG[3] = {0, 1, 3};  // ADC del ESP32-C6, sin pines de arranque ni la batería
constexpr float EMG_MAX_MV = 3300.0f;    // lectura que equivale a 1000
constexpr float EMG_CENTRO_MV = 1650.0f; // solo en modo crudo
constexpr size_t EMG_VENTANA_RMS = 50;   // muestras de 1 ms

// Montaje de ejes: placa con los chips hacia arriba sobre el dorso y la flecha X hacia los dedos.
constexpr Montaje MONTAJE_ACEL = MONTAJE_IDENTIDAD;
constexpr Montaje MONTAJE_GIRO = MONTAJE_IDENTIDAD;
constexpr Montaje MONTAJE_MAG = MONTAJE_IDENTIDAD;  // al cambiarlo hay que repetir MAG

// Corrección del acelerómetro, en el marco ya montado: a = (a_montado - DESFASE_ACEL) * ESCALA_ACEL.
// Medir con RAW cada eje hacia arriba y hacia abajo: desfase = (max + min) / 2, escala = 2 / (max - min).
// Medido el 2026-10-26 con el GY-85 actual (6 posiciones, RAW): X +1,069/−0,920 g,
// Y +0,987/−0,959 g, Z +0,909/−1,049 g. Repetir la medición si se cambia el módulo.
constexpr Vec3 DESFASE_ACEL{0.0745f, 0.0140f, -0.0700f};   // g
constexpr Vec3 ESCALA_ACEL{1.0055f, 1.0277f, 1.0215f};
