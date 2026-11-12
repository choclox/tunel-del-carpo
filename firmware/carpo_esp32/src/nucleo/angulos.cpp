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
  a.ps = atan2f(2.0f * (r.w * r.x + r.y * r.z), 1.0f - 2.0f * (r.x * r.x + r.y * r.y)) * aGrados;
  if (manoIzquierda) { a.rc = -a.rc; a.ps = -a.ps; }
  return a;
}

void ReferenciaAngulos::calibrar(const Cuaternion& q) {
  qCal_ = q;
  calibrada_ = true;
  hayCero_ = false;
}

bool ReferenciaAngulos::fijarCero(const Cuaternion& q) {
  if (!calibrada_) return false;
  qCero_ = q;
  hayCero_ = true;
  return true;
}

AngulosMuneca ReferenciaAngulos::angulos(const Cuaternion& qAhora, bool manoIzquierda) const {
  return angulosRelativos(hayCero_ ? qCero_ : qCal_, qAhora, manoIzquierda);
}
