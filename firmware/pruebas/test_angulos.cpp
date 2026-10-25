#include <math.h>
#include "prueba.h"
#include "fusion.h"
#include "angulos.h"

const float GRAD = 3.14159265f / 180;
PRUEBA(angulos_cero_en_calibracion) {
  Cuaternion q = desdeEjeAngulo({1,1,0}, 40 * GRAD);
  AngulosMuneca a = angulosRelativos(q, q, false);
  CERCA(a.fe, 0, 0.05f); CERCA(a.rc, 0, 0.05f);
}
PRUEBA(flexion_positiva_en_y) {
  Cuaternion qCal = desdeEjeAngulo({1,1,0}, 40 * GRAD);    // no depende de la orientación absoluta
  Cuaternion q = multiplicar(qCal, desdeEjeAngulo({0,1,0}, 30 * GRAD));
  AngulosMuneca a = angulosRelativos(qCal, q, false);
  CERCA(a.fe, 30, 0.1f); CERCA(a.rc, 0, 0.1f);
}
PRUEBA(radial_positiva_en_z_y_mano_izquierda) {
  Cuaternion q = desdeEjeAngulo({0,0,1}, 15 * GRAD);
  CERCA(angulosRelativos({}, q, false).rc, 15, 0.1f);
  CERCA(angulosRelativos({}, q, true).rc, -15, 0.1f);
}
PRUEBA(cuaternion_negado_mismos_angulos) {
  Cuaternion q = desdeEjeAngulo({0,1,0}, 50 * GRAD), n{-q.w, -q.x, -q.y, -q.z};
  CERCA(angulosRelativos({}, n, false).fe, 50, 0.1f);
}
PRUEBA(angulos_finitos_en_90) {
  Cuaternion q = desdeEjeAngulo({0,1,0}, 90.0001f * GRAD);
  AngulosMuneca a = angulosRelativos({}, q, false);
  VERIFICAR(isfinite(a.fe) && isfinite(a.rc)); CERCA(a.fe, 90, 0.1f);
}

int main() { return correrPruebas(); }
