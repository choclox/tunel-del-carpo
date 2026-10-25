#include "prueba.h"
#include "bateria.h"

PRUEBA(bateria_tabla) {
  VERIFICAR(porcentajeBateria(4.25f) == 100);
  VERIFICAR(porcentajeBateria(4.20f) == 100);
  VERIFICAR(porcentajeBateria(3.80f) == 40);
  VERIFICAR(porcentajeBateria(3.65f) == 10);
  VERIFICAR(porcentajeBateria(3.20f) == 0);
  VERIFICAR(porcentajeBateria(0.0f) == 0);    // alimentado por USB sin batería
}

int main() { return correrPruebas(); }
