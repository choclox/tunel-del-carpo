#include "angulos.h"
#include <math.h>

AngulosMuneca angulosRelativos(const Cuaternion& qCal, const Cuaternion& qAhora, bool manoIzquierda) {
  const float aGrados = 180.0f / 3.14159265f;
  Cuaternion r = multiplicar(conjugado(qCal), qAhora);
  float s = 2.0f * (r.w * r.y - r.x * r.z);
  if (s > 1.0f) s = 1.0f;
  if (s < -1.0f) s = -1.0f;
  AngulosMuneca a;
  a.fe = asinf(s) * aGrados;
  a.rc = atan2f(2.0f * (r.w * r.z + r.x * r.y), 1.0f - 2.0f * (r.y * r.y + r.z * r.z)) * aGrados;
  if (manoIzquierda) a.rc = -a.rc;
  return a;
}
