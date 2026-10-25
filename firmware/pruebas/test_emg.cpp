#include "prueba.h"
#include "emg.h"

PRUEBA(escalar_a_0_1000) {
  VERIFICAR(escalarEmg(1650.0f, 3300.0f) == 500);
  VERIFICAR(escalarEmg(-5.0f, 3300.0f) == 0);
  VERIFICAR(escalarEmg(4000.0f, 3300.0f) == 1000);
  VERIFICAR(escalarEmg(10.0f, 0.0f) == 0);  // máximo no válido
}
PRUEBA(rms_de_la_ventana) {
  RmsVentana r(4);
  r.agregar(3); r.agregar(-3); r.agregar(3);
  CERCA(r.agregar(-3), 3.0, 1e-6);
  CERCA(r.agregar(0), sqrtf(27.0f / 4.0f), 1e-5);  // la muestra más vieja sale
}
PRUEBA(rms_con_menos_muestras) {
  RmsVentana r(50);
  CERCA(r.agregar(4), 4.0, 1e-6);
}
PRUEBA(reposo_se_resta_sin_bajar_de_cero) {
  ReposoEmg rep;
  rep.iniciar();
  const uint16_t a[3] = {18, 30, 8}, b[3] = {22, 30, 12};
  rep.agregar(a); rep.agregar(b);
  rep.terminar();
  uint16_t v[3] = {420, 25, 110};
  rep.restar(v);
  VERIFICAR(v[0] == 400 && v[1] == 0 && v[2] == 100);
}
PRUEBA(reposo_sin_muestras_no_resta) {
  ReposoEmg rep;
  rep.iniciar(); rep.terminar();
  uint16_t v[3] = {5, 6, 7};
  rep.restar(v);
  VERIFICAR(v[0] == 5 && v[1] == 6 && v[2] == 7);
}

int main() { return correrPruebas(); }
