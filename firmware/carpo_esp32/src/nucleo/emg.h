// EMG de 3 canales (tenar, flexores, extensores). Modulo puro: sin Arduino.h.
#pragma once
#include <stddef.h>
#include <stdint.h>

// Milivoltios -> 0..1000, recortado. Con maxMilivoltios <= 0 devuelve 0.
uint16_t escalarEmg(float milivoltios, float maxMilivoltios);

// RMS de las ultimas n muestras (con menos de n, de las que haya). Bufer fijo de hasta 64.
class RmsVentana {
 public:
  static const size_t MAXIMO = 64;
  explicit RmsVentana(size_t n = 50);
  // Agrega una muestra y devuelve el RMS actual.
  float agregar(float x);

 private:
  float cuadrados_[MAXIMO] = {0};
  size_t n_;
  size_t pos_ = 0;
  size_t cuenta_ = 0;
  double suma_ = 0;
};

// Promedio de reposo por canal, medido durante la calibracion y restado despues.
class ReposoEmg {
 public:
  void iniciar();
  void agregar(const uint16_t v[3]);
  void terminar();
  // Resta el reposo de cada canal (minimo 0).
  void restar(uint16_t v[3]) const;

 private:
  uint32_t suma_[3] = {0, 0, 0};
  uint32_t cuenta_ = 0;
  uint16_t reposo_[3] = {0, 0, 0};
};
