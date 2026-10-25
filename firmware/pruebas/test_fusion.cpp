#include <math.h>
#include "prueba.h"
#include "fusion.h"
#include "angulos.h"

const float GRAD = 3.14159265f / 180;
PRUEBA(quieto_se_mantiene) {
  FiltroMadgwick f;
  for (int i = 0; i < 2000; i++) f.actualizar({0,0,0}, {0,0,1}, {20,0,-40}, 0.01f);
  AngulosMuneca a = angulosRelativos({}, f.orientacion(), false);
  CERCA(a.fe, 0, 0.5f); CERCA(a.rc, 0, 0.5f);
}
PRUEBA(converge_a_inclinacion_real) {
  // Orientación real: 30° en Y. Se generan acel y mag del sensor con rotar(conjugado(qReal), …).
  Cuaternion qReal = desdeEjeAngulo({0,1,0}, 30 * GRAD);
  Vec3 acel = rotar(conjugado(qReal), {0,0,1}), mag = rotar(conjugado(qReal), {20,0,-40});
  FiltroMadgwick f(2.5f);
  for (int i = 0; i < 300; i++) f.actualizar({0,0,0}, acel, mag, 0.01f);
  CERCA(angulosRelativos({}, f.orientacion(), false).fe, 30, 1.0f);
}
PRUEBA(integra_giro_en_z) {
  FiltroMadgwick f;
  for (int i = 0; i < 50; i++) f.actualizar({0,0,1}, {0,0,1}, 0.01f);   // 1 rad/s durante 0,5 s, 6 ejes
  CERCA(angulosRelativos({}, f.orientacion(), false).rc, 28.65f, 0.5f);
}
PRUEBA(dt_grande_se_limita) {
  FiltroMadgwick f;
  f.actualizar({0,0,1}, {0,0,1}, 1.0f);
  CERCA(angulosRelativos({}, f.orientacion(), false).rc, 2.865f, 0.1f);
}
PRUEBA(acel_cero_sin_nan) {
  FiltroMadgwick f;
  f.actualizar({0.1f,0,0}, {0,0,0}, {0,0,0}, 0.01f);
  Cuaternion q = f.orientacion();
  VERIFICAR(isfinite(q.w) && isfinite(q.x) && isfinite(q.y) && isfinite(q.z));
}

int main() { return correrPruebas(); }
