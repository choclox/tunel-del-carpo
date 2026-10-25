#include "bateria.h"
#include <math.h>

namespace {
struct Punto { float v; float pct; };
const Punto TABLA[] = {
    {3.30f, 0.0f},  {3.60f, 5.0f},  {3.70f, 15.0f},
    {3.75f, 25.0f}, {3.80f, 40.0f}, {3.85f, 55.0f},
    {3.95f, 70.0f}, {4.05f, 85.0f}, {4.20f, 100.0f},
};
const int N = (int)(sizeof(TABLA) / sizeof(TABLA[0]));
}  // namespace

int porcentajeBateria(float voltios) {
  if (!(voltios > TABLA[0].v)) return 0;       // incluye NaN y 0 V (USB sin batería)
  if (voltios >= TABLA[N - 1].v) return 100;
  for (int i = 1; i < N; i++) {
    if (voltios <= TABLA[i].v) {
      float t = (voltios - TABLA[i - 1].v) / (TABLA[i].v - TABLA[i - 1].v);
      float p = TABLA[i - 1].pct + t * (TABLA[i].pct - TABLA[i - 1].pct);
      long r = lroundf(p);
      return r < 0 ? 0 : (r > 100 ? 100 : (int)r);
    }
  }
  return 100;
}
