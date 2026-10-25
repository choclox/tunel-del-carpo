#include "emg.h"

#include <math.h>

uint16_t escalarEmg(float milivoltios, float maxMilivoltios) {
  if (!(maxMilivoltios > 0) || !(milivoltios > 0)) return 0;
  float v = milivoltios / maxMilivoltios * 1000.0f;
  return v >= 1000.0f ? 1000 : (uint16_t)lroundf(v);
}

RmsVentana::RmsVentana(size_t n) : n_(n == 0 ? 1 : (n > MAXIMO ? MAXIMO : n)) {}

float RmsVentana::agregar(float x) {
  float c = x * x;
  if (cuenta_ == n_) suma_ -= cuadrados_[pos_];
  else cuenta_++;
  cuadrados_[pos_] = c;
  suma_ += c;
  pos_ = (pos_ + 1) % n_;
  if (suma_ < 0) suma_ = 0;  // redondeo acumulado
  return (float)sqrt(suma_ / cuenta_);
}

void ReposoEmg::iniciar() {
  for (int i = 0; i < 3; i++) suma_[i] = 0;
  cuenta_ = 0;
}

void ReposoEmg::agregar(const uint16_t v[3]) {
  for (int i = 0; i < 3; i++) suma_[i] += v[i];
  cuenta_++;
}

void ReposoEmg::terminar() {
  for (int i = 0; i < 3; i++) reposo_[i] = cuenta_ ? (uint16_t)((suma_[i] + cuenta_ / 2) / cuenta_) : 0;
}

void ReposoEmg::restar(uint16_t v[3]) const {
  for (int i = 0; i < 3; i++) v[i] = v[i] > reposo_[i] ? v[i] - reposo_[i] : 0;
}
