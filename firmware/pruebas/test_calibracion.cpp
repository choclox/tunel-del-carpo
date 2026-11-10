#include <math.h>
#include "prueba.h"
#include "gy85_datos.h"
#include "calibracion.h"

const float GRAD = 3.14159265f / 180;

// Llama a agregar cada 10 ms desde 'desde' hasta 'hasta' (ambos incluidos) y devuelve el último estado.
EstadoCal alimentar(Calibrador& c, uint32_t desde, uint32_t hasta, Vec3 giro, Vec3 acel) {
  EstadoCal e = c.estado();
  for (uint32_t t = desde; t <= hasta; t += 10) e = c.agregar(giro, acel, t);
  return e;
}

const Vec3 SESGO{0.02f, -0.01f, 0.03f}, G{0, 0, 1};
PRUEBA(cal_quieto_estima_sesgo) {
  Calibrador c; c.iniciar(0);
  VERIFICAR(alimentar(c, 0, 1000, SESGO, G) == EstadoCal::Convergiendo);
  CERCA(c.sesgoGiro().x, 0.02f, 1e-4f); CERCA(c.sesgoGiro().z, 0.03f, 1e-4f);
  VERIFICAR(alimentar(c, 1010, 2500, SESGO, G) == EstadoCal::Listo);
  VERIFICAR(c.duracionMs() >= 2500 && c.duracionMs() <= 2520);
}
PRUEBA(cal_asentamiento_ultimos_500_ms) {
  Calibrador c; c.iniciar(0);
  VERIFICAR(!c.asentando(0));
  VERIFICAR(alimentar(c, 0, 1000, SESGO, G) == EstadoCal::Convergiendo);   // converge desde 1000
  VERIFICAR(!c.asentando(1000));
  VERIFICAR(alimentar(c, 1010, 1990, SESGO, G) == EstadoCal::Convergiendo);
  VERIFICAR(!c.asentando(1990));
  VERIFICAR(alimentar(c, 2000, 2000, SESGO, G) == EstadoCal::Convergiendo);
  VERIFICAR(c.asentando(2000));
  VERIFICAR(alimentar(c, 2010, 2500, SESGO, G) == EstadoCal::Listo);
  VERIFICAR(!c.asentando(2500));
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
// --- CalibradorAcel ---
static void quieta(CalibradorAcel& c, uint32_t& t, Vec3 a, uint32_t ms) {
  uint32_t ini = t;
  while (t - ini < ms) { c.agregar(a, t); t += 10; }
}
const Vec3 DESF{0.07f, -0.02f, 0.05f}, GAN{0.98f, 1.03f, 1.01f};
static Vec3 medida(Vec3 g) { return {g.x / GAN.x + DESF.x, g.y / GAN.y + DESF.y, g.z / GAN.z + DESF.z}; }
PRUEBA(acel_seis_caras_recupera_desfase_y_escala) {
  CalibradorAcel c; uint32_t t = 0; c.iniciar(t);
  const Vec3 caras[6] = {{1,0,0},{-1,0,0},{0,1,0},{0,-1,0},{0,0,1},{0,0,-1}};
  for (auto& g : caras) { quieta(c, t, medida(g), 1500); quieta(c, t, medida({0.5f,0.5f,0.5f}), 300); }
  VERIFICAR(c.completo());
  CERCA(c.desfase().x, 0.07f, 1e-3f); CERCA(c.desfase().y, -0.02f, 1e-3f); CERCA(c.desfase().z, 0.05f, 1e-3f);
  CERCA(c.escala().x, 0.98f, 1e-3f); CERCA(c.escala().y, 1.03f, 1e-3f); CERCA(c.escala().z, 1.01f, 1e-3f);
}
PRUEBA(acel_falta_una_cara) {
  CalibradorAcel c; uint32_t t = 0; c.iniciar(t);
  quieta(c, t, {0,0,1}, 1500); quieta(c, t, {0,0,-1}, 1500);
  VERIFICAR(!c.completo()); VERIFICAR(c.caras() == 0x30);
}
PRUEBA(acel_movimiento_no_captura) {   // sostenida en la mano: ±0,04 g alternando
  CalibradorAcel c; uint32_t t = 0; c.iniciar(t);
  for (int i = 0; i < 300; i++, t += 10) c.agregar({0, 0, i % 2 ? 1.04f : 0.96f}, t);
  VERIFICAR(c.caras() == 0);
}
PRUEBA(acel_inclinada_no_captura) {
  CalibradorAcel c; uint32_t t = 0; c.iniciar(t);
  quieta(c, t, {0.5f, 0, 0.85f}, 2000);
  VERIFICAR(c.caras() == 0);
}
PRUEBA(acel_nombres_y_vencimiento) {
  TEXTO_IGUAL(CalibradorAcel::nombreCara(0), "+X"); TEXTO_IGUAL(CalibradorAcel::nombreCara(5), "-Z");
  CalibradorAcel c; c.iniciar(1000);
  VERIFICAR(!c.vencido(180999)); VERIFICAR(c.vencido(181000));
}
int main() { return correrPruebas(); }
