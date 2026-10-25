// Driver I2C del GY-85 (ADXL345 + ITG3205 + HMC5883L o clon QMC5883L).
#pragma once
#include <Wire.h>
#include <stdint.h>
#include "src/nucleo/gy85_datos.h"

class Gy85 {
 public:
  // true si responden el acelerómetro y el giroscopio. Puede llamarse de nuevo para recuperar.
  bool iniciar(TwoWire& wire);
  // Lectura montada (g, rad/s, µT). false si falla el acelerómetro o el giroscopio.
  // Si el magnetómetro falla o satura, mag = {0,0,0}.
  bool leer(Vec3& acel, Vec3& giro, Vec3& mag);
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
};
