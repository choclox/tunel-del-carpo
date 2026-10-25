#include "prueba.h"
#include "gy85_datos.h"

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

PRUEBA(vector_cero) {
  VERIFICAR(esCero({0, 0, 0}));
  VERIFICAR(!esCero({0, 0, 0.0039f}));
  VERIFICAR(!esCero({-0.1f, 0, 0}));
}
PRUEBA(corregir_acel_desfase_y_escala) {
  Vec3 a = corregirAcel({1.10f, -0.95f, 0.02f}, {0.05f, 0.03f, -0.10f}, {0.95f, 1.02f, 1.0f});
  CERCA(a.x, 0.9975f, 1e-5f); CERCA(a.y, -0.9996f, 1e-5f); CERCA(a.z, 0.12f, 1e-5f);
  Vec3 b = corregirAcel({0.3f, 0.4f, 0.5f}, {0, 0, 0}, {1, 1, 1});
  CERCA(b.x, 0.3f, 1e-6f); CERCA(b.y, 0.4f, 1e-6f); CERCA(b.z, 0.5f, 1e-6f);
}
PRUEBA(huella_montaje_distingue) {
  Montaje a{{1,0,2},{-1,1,1}}, b{{1,0,2},{1,1,1}}, c{{0,2,1},{1,1,1}};
  VERIFICAR(huellaMontaje(MONTAJE_IDENTIDAD) == huellaMontaje(Montaje{{0,1,2},{1,1,1}}));
  VERIFICAR(huellaMontaje(a) != huellaMontaje(b));
  VERIFICAR(huellaMontaje(b) != huellaMontaje(MONTAJE_IDENTIDAD));
  VERIFICAR(huellaMontaje(c) != huellaMontaje(MONTAJE_IDENTIDAD));
  VERIFICAR(huellaMontaje(MONTAJE_IDENTIDAD) != 0);   // 0 = "sin huella guardada"
}

int main() { return correrPruebas(); }
