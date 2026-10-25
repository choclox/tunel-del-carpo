#pragma once
#include <stdint.h>
#include "gy85_datos.h"

enum class EstadoCal { Inactivo, Midiendo, Convergiendo, Listo, Error };

// Calibración del cero del giroscopio: exige quietud sostenida.
class Calibrador {
 public:
  void iniciar(uint32_t tMs);
  EstadoCal agregar(const Vec3& giroCrudo, const Vec3& acel, uint32_t tMs);
  EstadoCal estado() const { return estado_; }
  Vec3 sesgoGiro() const { return sesgo_; }
  uint32_t duracionMs() const { return duracion_; }
  const char* motivo() const { return motivo_; }
  // true en los últimos ASENTAMIENTO_MS de Convergiendo: el filtro vuelve a beta normal
  // para que qCal no se tome con el filtro vibrando a beta alta.
  bool asentando(uint32_t tMs) const;

 private:
  void nuevaVentana();
  EstadoCal estado_ = EstadoCal::Inactivo;
  uint32_t inicio_ = 0, inicioVentana_ = 0, duracion_ = 0;
  bool hayReferencia_ = false;
  Vec3 referencia_{0, 0, 0}, suma_{0, 0, 0}, sesgo_{0, 0, 0};
  uint32_t n_ = 0;
  const char* motivo_ = "";
};

// Calibración hard-iron del magnetómetro: desfase = (máx + mín) / 2.
class CalibradorMag {
 public:
  void iniciar();
  void agregar(const Vec3& mag);
  bool valido() const;
  Vec3 desfase() const;

 private:
  bool hay_ = false;
  Vec3 min_{0, 0, 0}, max_{0, 0, 0};
};

// Detecta la pérdida del sensor por lecturas I2C fallidas seguidas.
class VigilanteSensor {
 public:
  void registrar(bool lecturaOk, uint32_t tMs);
  bool perdido() const { return perdido_; }
  bool debeReintentar(uint32_t tMs);

 private:
  uint8_t fallas_ = 0;
  bool perdido_ = false, huboReintento_ = false;
  uint32_t ultimoReintento_ = 0;
};
