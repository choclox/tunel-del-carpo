// Orientación sin giroscopio: acel y mag suavizados -> orientacionDesdeAcelMag.
#include <math.h>
#include "prueba.h"
#include "fusion.h"
#include "angulos.h"

const float GRAD = 3.14159265f / 180;
const Vec3 CAMPO{20, 0, -40};   // campo terrestre en el marco de Madgwick (µT)

static Vec3 acelDe(const Cuaternion& q) { return rotar(conjugado(q), {0, 0, 1}); }
static Vec3 magDe(const Cuaternion& q) { return rotar(conjugado(q), CAMPO); }

PRUEBA(sin_giro_entrada_fija_reproduce_orientacion) {
  Cuaternion q = multiplicar(desdeEjeAngulo({0, 0, 1}, 20 * GRAD), desdeEjeAngulo({0, 1, 0}, 35 * GRAD));
  FiltroSinGiro f;
  for (int i = 0; i < 50; i++) f.actualizar(acelDe(q), magDe(q));
  AngulosMuneca a = angulosRelativos({}, f.orientacion(), false);
  CERCA(a.fe, 35, 0.2f);
  CERCA(a.rc, 20, 0.2f);
}
PRUEBA(sin_giro_primera_muestra_sin_rampa) {
  Cuaternion q = desdeEjeAngulo({0, 1, 0}, 40 * GRAD);
  FiltroSinGiro f;
  f.actualizar(acelDe(q), magDe(q));
  CERCA(angulosRelativos({}, f.orientacion(), false).fe, 40, 0.2f);
}
PRUEBA(sin_giro_suaviza_un_escalon) {
  Cuaternion q = desdeEjeAngulo({0, 1, 0}, 30 * GRAD);
  FiltroSinGiro f(0.2f);
  f.actualizar({0, 0, 1}, CAMPO);
  f.actualizar(acelDe(q), magDe(q));
  float uno = angulosRelativos({}, f.orientacion(), false).fe;
  VERIFICAR(uno > 1 && uno < 15);   // no salta de golpe al nuevo ángulo
  for (int i = 0; i < 60; i++) f.actualizar(acelDe(q), magDe(q));
  CERCA(angulosRelativos({}, f.orientacion(), false).fe, 30, 0.5f);
}
PRUEBA(sin_giro_sin_mag_rumbo_cero) {
  // Sin magnetómetro el giro en Z no es observable: rc queda en 0 y fe sigue la inclinación.
  Cuaternion q = multiplicar(desdeEjeAngulo({0, 0, 1}, 50 * GRAD), desdeEjeAngulo({0, 1, 0}, 25 * GRAD));
  FiltroSinGiro f;
  for (int i = 0; i < 50; i++) f.actualizar(acelDe(q), {0, 0, 0});
  AngulosMuneca a = angulosRelativos({}, f.orientacion(), false);
  CERCA(a.fe, 25, 0.2f);
  CERCA(a.rc, 0, 0.2f);
}
PRUEBA(sin_giro_reiniciar_toma_la_siguiente_muestra) {
  FiltroSinGiro f(0.05f);
  for (int i = 0; i < 20; i++) f.actualizar({0, 0, 1}, CAMPO);
  f.reiniciar();
  Cuaternion q = desdeEjeAngulo({0, 1, 0}, -45 * GRAD);
  f.actualizar(acelDe(q), magDe(q));
  CERCA(angulosRelativos({}, f.orientacion(), false).fe, -45, 0.2f);
}
PRUEBA(sin_giro_acel_cero_no_da_nan) {
  FiltroSinGiro f;
  f.actualizar({0, 0, 0}, {0, 0, 0});
  Cuaternion q = f.orientacion();
  VERIFICAR(isfinite(q.w) && isfinite(q.x) && isfinite(q.y) && isfinite(q.z));
}

int main() { return correrPruebas(); }
