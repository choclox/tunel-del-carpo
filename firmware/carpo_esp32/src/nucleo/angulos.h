#pragma once
#include "fusion.h"

struct AngulosMuneca { float fe, rc, ps; };   // grados

// Descompone conjugado(qCal) (x) qAhora en Z-Y-X intrínseco: rc = giro en Z, fe = giro en Y,
// ps = giro en X (prono-supinación).
AngulosMuneca angulosRelativos(const Cuaternion& qCal, const Cuaternion& qAhora, bool manoIzquierda);
