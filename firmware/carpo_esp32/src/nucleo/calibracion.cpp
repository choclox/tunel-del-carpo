#include "calibracion.h"
#include <math.h>

namespace {
const float ACEL_MIN = 0.90f, ACEL_MAX = 1.10f, GIRO_TOL = 0.10f;
const uint32_t MIDIENDO_MS = 1000, CONVERGIENDO_MS = 1500, LIMITE_MS = 10000;
const uint32_t ASENTAMIENTO_MS = 500;   // parte final de CONVERGIENDO_MS a beta normal
const float RANGO_MAG_MIN = 30.0f;
const uint8_t FALLAS_PERDIDO = 5;
const uint32_t REINTENTO_MS = 1000;
}

void Calibrador::nuevaVentana() {
  estado_ = EstadoCal::Midiendo;
  hayReferencia_ = false;
  suma_ = {0, 0, 0};
  n_ = 0;
}

void Calibrador::iniciar(uint32_t tMs) {
  inicio_ = tMs;
  inicioVentana_ = tMs;
  duracion_ = 0;
  sesgo_ = {0, 0, 0};
  motivo_ = "";
  nuevaVentana();
}

EstadoCal Calibrador::agregar(const Vec3& g, const Vec3& a, uint32_t tMs) {
  if (estado_ != EstadoCal::Midiendo && estado_ != EstadoCal::Convergiendo) return estado_;
  if (tMs - inicio_ >= LIMITE_MS) {
    estado_ = EstadoCal::Error;
    motivo_ = "movimiento";
    return estado_;
  }
  if (!hayReferencia_) {                      // primera muestra de la ventana: referencia
    referencia_ = g;
    inicioVentana_ = tMs;
    hayReferencia_ = true;
  }
  float m = sqrtf(a.x * a.x + a.y * a.y + a.z * a.z);
  bool quieta = m >= ACEL_MIN && m <= ACEL_MAX &&
                fabsf(g.x - referencia_.x) < GIRO_TOL &&
                fabsf(g.y - referencia_.y) < GIRO_TOL &&
                fabsf(g.z - referencia_.z) < GIRO_TOL;
  if (!quieta) {
    nuevaVentana();                           // la muestra no inicia la ventana nueva
    return estado_;
  }
  if (estado_ == EstadoCal::Midiendo) {
    suma_.x += g.x; suma_.y += g.y; suma_.z += g.z;
    n_++;
    if (tMs - inicioVentana_ >= MIDIENDO_MS) {
      sesgo_ = {suma_.x / n_, suma_.y / n_, suma_.z / n_};
      estado_ = EstadoCal::Convergiendo;
      inicioVentana_ = tMs;
    }
  } else if (tMs - inicioVentana_ >= CONVERGIENDO_MS) {
    estado_ = EstadoCal::Listo;
    duracion_ = tMs - inicio_;
  }
  return estado_;
}

bool Calibrador::asentando(uint32_t tMs) const {
  return estado_ == EstadoCal::Convergiendo &&
         tMs - inicioVentana_ >= CONVERGIENDO_MS - ASENTAMIENTO_MS;
}

void CalibradorMag::iniciar() {
  hay_ = false;
  min_ = max_ = {0, 0, 0};
}

void CalibradorMag::agregar(const Vec3& v) {
  if (!hay_) {
    min_ = max_ = v;
    hay_ = true;
    return;
  }
  if (v.x < min_.x) min_.x = v.x;
  if (v.y < min_.y) min_.y = v.y;
  if (v.z < min_.z) min_.z = v.z;
  if (v.x > max_.x) max_.x = v.x;
  if (v.y > max_.y) max_.y = v.y;
  if (v.z > max_.z) max_.z = v.z;
}

bool CalibradorMag::valido() const {
  return hay_ && max_.x - min_.x >= RANGO_MAG_MIN && max_.y - min_.y >= RANGO_MAG_MIN &&
         max_.z - min_.z >= RANGO_MAG_MIN;
}

Vec3 CalibradorMag::desfase() const {
  if (!hay_) return {0, 0, 0};
  return {(max_.x + min_.x) / 2, (max_.y + min_.y) / 2, (max_.z + min_.z) / 2};
}

void VigilanteSensor::registrar(bool ok, uint32_t) {
  if (ok) {
    fallas_ = 0;
    perdido_ = false;
    huboReintento_ = false;
    return;
  }
  if (fallas_ < 255) fallas_++;
  if (fallas_ >= FALLAS_PERDIDO) perdido_ = true;
}

bool VigilanteSensor::debeReintentar(uint32_t tMs) {
  if (!perdido_) return false;
  if (huboReintento_ && tMs - ultimoReintento_ < REINTENTO_MS) return false;
  huboReintento_ = true;
  ultimoReintento_ = tMs;
  return true;
}
