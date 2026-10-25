#pragma once
#include "fusion.h"

struct AngulosMuneca { float fe, rc; };   // grados

// Descompone conjugado(qCal) (x) qAhora en Z-Y-X intrínseco: rc = giro en Z, fe = giro en Y.
AngulosMuneca angulosRelativos(const Cuaternion& qCal, const Cuaternion& qAhora, bool manoIzquierda);
