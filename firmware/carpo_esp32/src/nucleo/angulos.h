#pragma once
#include "fusion.h"

struct AngulosMuneca { float fe, rc, ps; };   // grados

// Descompone conjugado(qCal) (x) qAhora en Z-Y-X intrínseco: rc = giro en Z, fe = giro en Y,
// ps = giro en X (prono-supinación).
AngulosMuneca angulosRelativos(const Cuaternion& qCal, const Cuaternion& qAhora, bool manoIzquierda);

// Referencia de los ángulos: la orientación de la calibración (qCal) o, si hay, un cero de
// postura (comando CERO) que toma la orientación del momento sin recalibrar nada más.
class ReferenciaAngulos {
 public:
  void calibrar(const Cuaternion& q);   // nueva qCal; borra el cero de postura
  bool fijarCero(const Cuaternion& q);  // false si nunca se calibró
  void quitarCero() { hayCero_ = false; }
  bool calibrada() const { return calibrada_; }
  bool hayCero() const { return hayCero_; }
  AngulosMuneca angulos(const Cuaternion& qAhora, bool manoIzquierda) const;

 private:
  Cuaternion qCal_, qCero_;
  bool calibrada_ = false, hayCero_ = false;
};
