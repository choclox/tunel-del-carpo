#include "gy85_datos.h"

namespace {
const float G_POR_LSB_ADXL = 0.0039f;
const float LSB_POR_GRADOS_S = 14.375f;
const float RAD_POR_GRADO = 0.017453292519943295f;
const float UT_POR_GAUSS = 100.0f;
const float LSB_POR_GAUSS_HMC = 1090.0f;
const float LSB_POR_GAUSS_QMC = 3000.0f;

int16_t leerLE(const uint8_t* p) { return (int16_t)(uint16_t)(p[0] | (p[1] << 8)); }
int16_t leerBE(const uint8_t* p) { return (int16_t)(uint16_t)((p[0] << 8) | p[1]); }
}  // namespace

Vec3 decodificarAdxl345(const uint8_t r[6]) {
  return {leerLE(r) * G_POR_LSB_ADXL, leerLE(r + 2) * G_POR_LSB_ADXL,
          leerLE(r + 4) * G_POR_LSB_ADXL};
}

Vec3 decodificarItg3205(const uint8_t r[6]) {
  const float k = RAD_POR_GRADO / LSB_POR_GRADOS_S;
  return {leerBE(r) * k, leerBE(r + 2) * k, leerBE(r + 4) * k};
}

Vec3 decodificarHmc5883l(const uint8_t r[6]) {
  const float k = UT_POR_GAUSS / LSB_POR_GAUSS_HMC;
  // Orden de registros: X, Z, Y.
  return {leerBE(r) * k, leerBE(r + 4) * k, leerBE(r + 2) * k};
}

Vec3 decodificarQmc5883l(const uint8_t r[6]) {
  const float k = UT_POR_GAUSS / LSB_POR_GAUSS_QMC;
  return {leerLE(r) * k, leerLE(r + 2) * k, leerLE(r + 4) * k};
}

bool hmcSaturado(const uint8_t r[6]) {
  return leerBE(r) == -4096 || leerBE(r + 2) == -4096 || leerBE(r + 4) == -4096;
}

Vec3 aplicarMontaje(const Vec3& v, const Montaje& m) {
  const float e[3] = {v.x, v.y, v.z};
  return {m.signo[0] * e[m.eje[0] % 3], m.signo[1] * e[m.eje[1] % 3],
          m.signo[2] * e[m.eje[2] % 3]};
}

bool esCero(const Vec3& v) { return v.x == 0.0f && v.y == 0.0f && v.z == 0.0f; }

Vec3 corregirAcel(const Vec3& a, const Vec3& desfase, const Vec3& escala) {
  return {(a.x - desfase.x) * escala.x, (a.y - desfase.y) * escala.y,
          (a.z - desfase.z) * escala.z};
}

uint32_t huellaMontaje(const Montaje& m) {
  uint32_t h = 1;
  for (int i = 0; i < 3; i++) h = h * 8 + (m.eje[i] % 3) * 2 + (m.signo[i] < 0 ? 1 : 0);
  return h;
}
