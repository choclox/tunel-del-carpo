// Driver I2C del GY-85 (ADXL345 + ITG3205 + HMC5883L o clon QMC5883L).
#pragma once
#include <Wire.h>
#include <stdint.h>
#include "src/nucleo/gy85_datos.h"

class Gy85 {
 public:
  // true si responde el acelerómetro. El giroscopio no hace fallar el inicio: si no responde
  // o no funciona de verdad, tieneGiroscopio() queda en false y se sigue sin él.
  // Puede llamarse de nuevo para recuperar.
  bool iniciar(TwoWire& wire);
  // Lectura montada (g, rad/s, µT). false si falla el acelerómetro o, con giroscopio, el giroscopio.
  // Sin giroscopio, giro = {0,0,0}.
  // Si el magnetómetro falla o satura, mag = {0,0,0}.
  // Las primeras lecturas del ADXL345 en cero tras iniciar devuelven false sin perder el inicio.
  bool leer(Vec3& acel, Vec3& giro, Vec3& mag);
  // true si el ITG3205 respondió y pasó la comprobación (configuración y temperatura).
  bool tieneGiroscopio() const { return tieneGiro_; }
  // Corrección del acelerómetro (desfase en g y escala); se conserva entre llamadas a iniciar().
  void fijarCorreccionAcel(const Vec3& desfase, const Vec3& escala) {
    desfase_ = desfase;
    escala_ = escala;
  }
  bool tieneMagnetometro() const { return tipoMag_ != TipoMag::Ninguno; }
  const char* nombreMagnetometro() const;
  // Código corto del chip para guardar con la calibración: "HMC", "QMC" o "" (ninguno).
  const char* codigoMagnetometro() const;

 private:
  enum class TipoMag : uint8_t { Ninguno, Hmc, Qmc };
  bool escribir(uint8_t dir, uint8_t reg, uint8_t valor);
  bool leerBytes(uint8_t dir, uint8_t reg, uint8_t* dest, uint8_t n);
  bool configuracionIntacta();

  TwoWire* wire_ = nullptr;
  uint8_t dirGiro_ = 0x68;
  TipoMag tipoMag_ = TipoMag::Ninguno;
  bool iniciado_ = false;   // true solo tras un iniciar() completo; se limpia al fallar una lectura
  uint8_t lecturas_ = 0;    // lecturas desde la última verificación de la configuración
  bool tieneGiro_ = false;  // el ITG3205 pasó la comprobación en el último iniciar()
  uint8_t gracia_ = 0;      // lecturas en cero del ADXL345 que aún se toleran tras iniciar()
  Vec3 desfase_{0, 0, 0};   // corrección del acelerómetro fijada desde fuera
  Vec3 escala_{1, 1, 1};
};
