#include "calibracion.h"
#include <math.h>

namespace {
const float ACEL_MIN = 0.90f, ACEL_MAX = 1.10f;
// Por muestra solo se descartan golpes: el temblor fisiológico de la mano apoyada (8-12 Hz,
// ±0,1 rad/s, < 0,2° de movimiento) no debe impedir la calibración.
const float GIRO_GOLPE = 0.35f;        // rad/s, por muestra respecto a la primera muestra
// rad/s, promedio de bloque respecto al primer bloque. Un temblor de 8 Hz no se anula en
// 100 ms: con 0,14 rad/s dos bloques difieren hasta 0,063 rad/s según la fase.
const float GIRO_TOL_BLOQUE = 0.07f;
const uint32_t MIDIENDO_MS = 1000, CONVERGIENDO_MS = 1500, LIMITE_MS = 10000;
const uint32_t ASENTAMIENTO_MS = 500;   // parte final de CONVERGIENDO_MS a beta normal
const float RANGO_MAG_MIN = 30.0f;
const float ACEL_TOL_CAL = 0.05f;   // g, promedio de bloque respecto al primer bloque
const uint8_t FALLAS_PERDIDO = 5;
const uint32_t REINTENTO_MS = 1000;
}

bool Bloque::agregar(const Vec3& v, Vec3& media) {
  suma.x += v.x; suma.y += v.y; suma.z += v.z;
  if (++n < MUESTRAS_BLOQUE) return false;
  media = {suma.x / n, suma.y / n, suma.z / n};
  vaciar();
  return true;
}

void Calibrador::nuevaVentana() {
  estado_ = EstadoCal::Midiendo;
  hayReferencia_ = false;
  hayBloqueRef_ = false;
  bloqueAcel_.vaciar();
  bloqueGiro_.vaciar();
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
  bool quieta = m >= ACEL_MIN && m <= ACEL_MAX &&           // por muestra: golpes al instante
                fabsf(g.x - referencia_.x) < GIRO_GOLPE &&
                fabsf(g.y - referencia_.y) < GIRO_GOLPE &&
                fabsf(g.z - referencia_.z) < GIRO_GOLPE;
  if (!quieta) {
    nuevaVentana();                           // la muestra no inicia la ventana nueva
    return estado_;
  }
  Vec3 ma, mg;
  bool completo = bloqueAcel_.agregar(a, ma);
  bloqueGiro_.agregar(g, mg);
  if (completo) {                             // por bloque: deriva lenta con el ruido promediado
    if (!hayBloqueRef_) {
      acelRef_ = ma;
      giroRef_ = mg;
      hayBloqueRef_ = true;
    } else if (!(fabsf(ma.x - acelRef_.x) < ACEL_TOL_CAL && fabsf(ma.y - acelRef_.y) < ACEL_TOL_CAL &&
                 fabsf(ma.z - acelRef_.z) < ACEL_TOL_CAL && fabsf(mg.x - giroRef_.x) < GIRO_TOL_BLOQUE &&
                 fabsf(mg.y - giroRef_.y) < GIRO_TOL_BLOQUE && fabsf(mg.z - giroRef_.z) < GIRO_TOL_BLOQUE)) {
      nuevaVentana();                         // la ventana nueva empieza en la muestra siguiente
      return estado_;
    }
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

namespace {
const float ACEL_RANGO_QUIETO = 0.05f, ACEL_DOMINANTE = 0.7f, ACEL_OTROS = 0.35f;
const uint32_t ACEL_VENTANA_MS = 1000, ACEL_VENCE_MS = 180000;
}

void CalibradorAcel::iniciar(uint32_t tMs) {
  caras_ = 0;
  inicio_ = tMs;
  for (int i = 0; i < 6; i++) valor_[i] = 0;
  reiniciarVentana();
}

void CalibradorAcel::reiniciarVentana() {
  hayVentana_ = false;
  n_ = 0;
  bloque_.vaciar();
  for (int e = 0; e < 3; e++) suma_[e] = 0;
}

bool CalibradorAcel::agregar(const Vec3& a, uint32_t tMs) {
  if (n_ == 0) inicioVentana_ = tMs;   // primera muestra del primer bloque de la ventana
  suma_[0] += a.x; suma_[1] += a.y; suma_[2] += a.z;
  n_++;
  Vec3 mb;
  if (!bloque_.agregar(a, mb)) return false;   // la quietud se juzga al completar cada bloque
  const float v[3] = {mb.x, mb.y, mb.z};
  if (!hayVentana_) {
    for (int e = 0; e < 3; e++) min_[e] = max_[e] = v[e];
    hayVentana_ = true;
  } else {
    for (int e = 0; e < 3; e++) {
      if (v[e] < min_[e]) min_[e] = v[e];
      if (v[e] > max_[e]) max_[e] = v[e];
      if (max_[e] - min_[e] >= ACEL_RANGO_QUIETO) {
        reiniciarVentana();   // la ventana nueva empieza en la muestra siguiente
        return false;
      }
    }
  }
  if (tMs - inicioVentana_ < ACEL_VENTANA_MS) return false;

  float m[3];
  for (int e = 0; e < 3; e++) m[e] = suma_[e] / n_;
  reiniciarVentana();   // la ventana vuelve a empezar en la muestra siguiente
  for (int e = 0; e < 3; e++) {
    if (fabsf(m[e]) <= ACEL_DOMINANTE) continue;
    if (fabsf(m[(e + 1) % 3]) >= ACEL_OTROS || fabsf(m[(e + 2) % 3]) >= ACEL_OTROS) return false;
    uint8_t cara = (uint8_t)(2 * e + (m[e] < 0 ? 1 : 0));
    if (caras_ & (1u << cara)) return false;
    caras_ |= (uint8_t)(1u << cara);
    valor_[cara] = m[e];
    return true;
  }
  return false;
}

bool CalibradorAcel::vencido(uint32_t tMs) const { return tMs - inicio_ >= ACEL_VENCE_MS; }

Vec3 CalibradorAcel::desfase() const {
  return {(valor_[0] + valor_[1]) / 2, (valor_[2] + valor_[3]) / 2, (valor_[4] + valor_[5]) / 2};
}

Vec3 CalibradorAcel::escala() const {
  return {2 / (valor_[0] - valor_[1]), 2 / (valor_[2] - valor_[3]), 2 / (valor_[4] - valor_[5])};
}

const char* CalibradorAcel::nombreCara(uint8_t i) {
  static const char* const N[6] = {"+X", "-X", "+Y", "-Y", "+Z", "-Z"};
  return i < 6 ? N[i] : "?";
}

namespace {
const float SESGO_GIRO_TOL = 0.025f, SESGO_ACEL_RANGO = 0.03f;
const float SESGO_GIRO_GOLPE = 0.35f;   // rad/s, por muestra: golpes, no el temblor de la mano
const uint32_t SESGO_VENTANA_MS = 2000;
// Con la ventana ya quieta, el rango de acel se vuelve a sembrar desde el bloque actual cada
// tantos bloques (2 s): si no, el rango de un ruido real crece sin fin y corta el reposo largo.
const uint8_t SESGO_BLOQUES_RESIEMBRA = 20;
const uint32_t SESGO_HUECO_MS = 50;      // más tiempo sin muestras reinicia la ventana
const float SESGO_ANCLA_MAX = 0.015f;    // rad/s, |sesgo - ancla| por eje
const float SESGO_CAL_TOL = 0.05f;       // rad/s, sesgo de CAL frente al del estimador
const float ACEL_DESFASE_MAX = 0.3f, ACEL_ESCALA_MIN = 0.8f, ACEL_ESCALA_MAX = 1.2f;
}

void EstimadorSesgo::fijar(const Vec3& sesgo, bool esAncla) {
  sesgo_ = sesgo;
  if (esAncla) {
    ancla_ = sesgo;
    hayAncla_ = true;
    confiable_ = false;   // hasta volver a estar quieto con este sesgo
  }
  hayVentana_ = false;
  hayBloque_ = false;
  bloques_ = 0;
  bloqueAcel_.vaciar();
  bloqueGiro_.vaciar();
  quieto_ = false;
}

void EstimadorSesgo::agregar(const Vec3& g, const Vec3& a, uint32_t tMs) {
  // Hueco sin muestras: la ventana nueva empieza en esta muestra, con el mismo sesgo y ancla.
  if (hayUltima_ && tMs - ultimaMs_ > SESGO_HUECO_MS) fijar(sesgo_);
  hayUltima_ = true;
  ultimaMs_ = tMs;
  // Por muestra solo se descartan golpes grandes; el resto se juzga por bloque.
  if (!(fabsf(g.x - sesgo_.x) < SESGO_GIRO_GOLPE && fabsf(g.y - sesgo_.y) < SESGO_GIRO_GOLPE &&
        fabsf(g.z - sesgo_.z) < SESGO_GIRO_GOLPE)) {
    fijar(sesgo_);   // la ventana nueva empieza en la muestra siguiente
    return;
  }
  if (!hayVentana_) {   // primera muestra del primer bloque de la ventana
    inicioVentana_ = tMs;
    hayVentana_ = true;
  }
  Vec3 ma, mg;
  bool completo = bloqueAcel_.agregar(a, ma);
  bloqueGiro_.agregar(g, mg);
  if (completo) {
    bool quieta = fabsf(mg.x - sesgo_.x) < SESGO_GIRO_TOL &&
                  fabsf(mg.y - sesgo_.y) < SESGO_GIRO_TOL &&
                  fabsf(mg.z - sesgo_.z) < SESGO_GIRO_TOL;
    const float v[3] = {ma.x, ma.y, ma.z};
    if (!hayBloque_) {
      for (int e = 0; e < 3; e++) min_[e] = max_[e] = v[e];
      hayBloque_ = true;
    } else {
      for (int e = 0; e < 3; e++) {
        if (v[e] < min_[e]) min_[e] = v[e];
        if (v[e] > max_[e]) max_[e] = v[e];
        if (max_[e] - min_[e] >= SESGO_ACEL_RANGO) quieta = false;
      }
    }
    if (!quieta) {
      fijar(sesgo_);   // la ventana nueva empieza en la muestra siguiente
      return;
    }
    if (bloques_ < 255) bloques_++;   // bloques desde la última siembra del rango
    if (quieto_ && bloques_ >= SESGO_BLOQUES_RESIEMBRA) {   // sin perder quieto()
      for (int e = 0; e < 3; e++) min_[e] = max_[e] = v[e];
      bloques_ = 0;
    }
  }
  if (tMs - inicioVentana_ < SESGO_VENTANA_MS) return;
  quieto_ = true;
  if (hayAncla_) confiable_ = true;
  sesgo_.x += alfa_ * (g.x - sesgo_.x);
  sesgo_.y += alfa_ * (g.y - sesgo_.y);
  sesgo_.z += alfa_ * (g.z - sesgo_.z);
  limitarAlAncla();
}

void EstimadorSesgo::reiniciar() {
  hayAncla_ = false;
  confiable_ = false;
  ancla_ = {0, 0, 0};
  fijar({0, 0, 0});
}

static float limitar(float v, float centro, float margen) {
  if (v > centro + margen) return centro + margen;
  if (v < centro - margen) return centro - margen;
  return v;
}

void EstimadorSesgo::limitarAlAncla() {
  if (!hayAncla_) return;
  sesgo_.x = limitar(sesgo_.x, ancla_.x, SESGO_ANCLA_MAX);
  sesgo_.y = limitar(sesgo_.y, ancla_.y, SESGO_ANCLA_MAX);
  sesgo_.z = limitar(sesgo_.z, ancla_.z, SESGO_ANCLA_MAX);
}

bool sesgoCalCoherente(const Vec3& c, const Vec3& e, bool confiable) {
  if (!confiable) return true;
  return fabsf(c.x - e.x) <= SESGO_CAL_TOL && fabsf(c.y - e.y) <= SESGO_CAL_TOL &&
         fabsf(c.z - e.z) <= SESGO_CAL_TOL;
}

bool correccionAcelValida(const Vec3& d, const Vec3& s) {
  const float v[6] = {d.x, d.y, d.z, s.x, s.y, s.z};
  for (int i = 0; i < 6; i++) {
    if (!isfinite(v[i])) return false;
  }
  for (int i = 0; i < 3; i++) {
    if (!(fabsf(v[i]) < ACEL_DESFASE_MAX)) return false;
    if (!(v[3 + i] >= ACEL_ESCALA_MIN && v[3 + i] <= ACEL_ESCALA_MAX)) return false;
  }
  return true;
}
