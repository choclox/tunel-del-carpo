// Banco de pruebas minimo para PC (sin librerias externas).
// Uso: PRUEBA(nombre) { VERIFICAR(...); } y al final: int main() { return correrPruebas(); }
#pragma once
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <vector>

struct PruebaRegistrada {
  const char* nombre;
  const char* archivo;
  void (*funcion)();
};

inline std::vector<PruebaRegistrada>& listaPruebas() {
  static std::vector<PruebaRegistrada> lista;
  return lista;
}
inline int& fallasPrueba() {
  static int fallas = 0;
  return fallas;
}
struct RegistradorPrueba {
  RegistradorPrueba(const char* nombre, const char* archivo, void (*f)()) {
    listaPruebas().push_back({nombre, archivo, f});
  }
};

#define PRUEBA(nombre)                                                  \
  static void prueba_##nombre();                                        \
  static RegistradorPrueba registrar_##nombre(#nombre, __FILE__,        \
                                              prueba_##nombre);         \
  static void prueba_##nombre()

#define VERIFICAR(cond)                                                 \
  do {                                                                  \
    if (!(cond)) {                                                      \
      printf("%s:%d: FALLA VERIFICAR(%s)\n", __FILE__, __LINE__, #cond); \
      fallasPrueba()++;                                                 \
    }                                                                   \
  } while (0)

#define CERCA(a, b, tol)                                                \
  do {                                                                  \
    double va_ = (a), vb_ = (b), vt_ = (tol);                           \
    if (!(fabs(va_ - vb_) <= vt_)) {                                    \
      printf("%s:%d: FALLA CERCA(%s, %s, %s): %g vs %g (tol %g)\n",     \
             __FILE__, __LINE__, #a, #b, #tol, va_, vb_, vt_);          \
      fallasPrueba()++;                                                 \
    }                                                                   \
  } while (0)

#define TEXTO_IGUAL(a, b)                                               \
  do {                                                                  \
    const char* ta_ = (a);                                              \
    const char* tb_ = (b);                                              \
    if (strcmp(ta_, tb_) != 0) {                                        \
      printf("%s:%d: FALLA TEXTO_IGUAL(%s, %s): \"%s\" vs \"%s\"\n",    \
             __FILE__, __LINE__, #a, #b, ta_, tb_);                     \
      fallasPrueba()++;                                                 \
    }                                                                   \
  } while (0)

// Corre todas las pruebas; imprime "<archivo>: N pruebas, M fallas"; devuelve M != 0.
inline int correrPruebas() {
  auto& lista = listaPruebas();
  for (auto& p : lista) p.funcion();
  char nombre[128] = "pruebas";
  if (!lista.empty()) {
    const char* f = lista[0].archivo;
    const char* b = strrchr(f, '/');
    const char* b2 = strrchr(f, '\\');
    if (b2 && (!b || b2 > b)) b = b2;
    snprintf(nombre, sizeof nombre, "%s", b ? b + 1 : f);
    char* punto = strrchr(nombre, '.');
    if (punto) *punto = 0;
  }
  printf("%s: %d pruebas, %d fallas\n", nombre, (int)lista.size(), fallasPrueba());
  return fallasPrueba() != 0;
}
