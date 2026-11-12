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
PRUEBA(pronosupinacion_en_x_y_mano_izquierda) {
  Cuaternion qCal = desdeEjeAngulo({1,1,0}, 40 * GRAD);
  Cuaternion q = multiplicar(qCal, desdeEjeAngulo({1,0,0}, 30 * GRAD));
  AngulosMuneca a = angulosRelativos(qCal, q, false);
  CERCA(a.ps, 30, 0.5f); CERCA(a.fe, 0, 0.5f); CERCA(a.rc, 0, 0.5f);
  CERCA(angulosRelativos(qCal, q, true).ps, -30, 0.5f);
}
PRUEBA(pronosupinacion_cero_en_y_y_z) {
  CERCA(angulosRelativos({}, desdeEjeAngulo({0,1,0}, 30 * GRAD), false).ps, 0, 0.5f);
  CERCA(angulosRelativos({}, desdeEjeAngulo({0,0,1}, 30 * GRAD), false).ps, 0, 0.5f);
}
// Cero de postura (CERO): referencia de los ángulos en la postura del paso, sin recalibrar.
const Cuaternion I{};
const Cuaternion ANTEBRAZO_VERTICAL = desdeEjeAngulo({0,1,0}, -90 * GRAD);
PRUEBA(cero_de_postura_mide_desviacion_con_antebrazo_vertical) {
  ReferenciaAngulos r;
  r.calibrar(I);
  VERIFICAR(r.fijarCero(ANTEBRAZO_VERTICAL));
  AngulosMuneca a = r.angulos(multiplicar(ANTEBRAZO_VERTICAL, desdeEjeAngulo({0,0,1}, 20 * GRAD)), false);
  CERCA(a.rc, 20, 0.5f); CERCA(a.fe, 0, 0.5f); CERCA(a.ps, 0, 0.5f);
}
PRUEBA(sin_cero_usa_calibracion) {
  ReferenciaAngulos r;
  r.calibrar(I);
  VERIFICAR(r.calibrada() && !r.hayCero());
  CERCA(r.angulos(desdeEjeAngulo({0,1,0}, 30 * GRAD), false).fe, 30, 0.1f);
}
PRUEBA(quitar_cero_vuelve_a_calibracion) {
  ReferenciaAngulos r;
  r.calibrar(I);
  r.fijarCero(ANTEBRAZO_VERTICAL);
  r.quitarCero();
  VERIFICAR(!r.hayCero());
  CERCA(r.angulos(ANTEBRAZO_VERTICAL, false).fe, -90, 0.5f);
}
PRUEBA(cal_borra_cero) {
  ReferenciaAngulos r;
  r.calibrar(I);
  r.fijarCero(ANTEBRAZO_VERTICAL);
  r.calibrar(I);
  VERIFICAR(!r.hayCero());
}
PRUEBA(cero_sin_calibrar_falla) {
  ReferenciaAngulos r;
  VERIFICAR(!r.fijarCero(ANTEBRAZO_VERTICAL));
  VERIFICAR(!r.hayCero() && !r.calibrada());
}
PRUEBA(cero_supinacion_no_da_la_vuelta) {
  const Cuaternion pulgarArriba = desdeEjeAngulo({1,0,0}, 90 * GRAD);
  Cuaternion q = multiplicar(pulgarArriba, desdeEjeAngulo({1,0,0}, 85 * GRAD));
  ReferenciaAngulos r;
  r.calibrar(I);
  VERIFICAR(fabsf(r.angulos(q, false).ps) > 170);   // sin cero: al borde de ±180°
  r.fijarCero(pulgarArriba);
  CERCA(r.angulos(q, false).ps, 85, 0.5f);
}

int main() { return correrPruebas(); }
