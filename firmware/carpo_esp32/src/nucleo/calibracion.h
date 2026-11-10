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
  Vec3 acelRef_{0, 0, 0}, referencia_{0, 0, 0}, suma_{0, 0, 0}, sesgo_{0, 0, 0};
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

// Calibración del acelerómetro en 6 posiciones quietas: desfase y escala por eje.
// Caras como bits: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z.
class CalibradorAcel {
 public:
  void iniciar(uint32_t tMs);
  // true si esta muestra completó la captura de una cara nueva.
  bool agregar(const Vec3& acelSinCorregir, uint32_t tMs);
  uint8_t caras() const { return caras_; }
  bool completo() const { return caras_ == 0x3F; }
  bool vencido(uint32_t tMs) const;
  Vec3 desfase() const;   // válido solo si completo()
  Vec3 escala() const;    // válido solo si completo()
  static const char* nombreCara(uint8_t i);

 private:
  void reiniciarVentana();
  uint8_t caras_ = 0;
  uint32_t inicio_ = 0, inicioVentana_ = 0, n_ = 0;
  bool hayVentana_ = false;
  float suma_[3] = {0, 0, 0}, min_[3] = {0, 0, 0}, max_[3] = {0, 0, 0};
  float valor_[6] = {0, 0, 0, 0, 0, 0};   // promedio del eje dominante por cara
};

// Sesgo del giroscopio en reposo: se aprende solo con la mano quieta (giroscopio y
// acelerómetro estables) durante al menos 2 s.
class EstimadorSesgo {
 public:
  explicit EstimadorSesgo(float alfa = 0.002f) : alfa_(alfa) {}
  void fijar(const Vec3& sesgo);
  void agregar(const Vec3& giroCrudo, const Vec3& acel, uint32_t tMs);
  Vec3 sesgo() const { return sesgo_; }
  bool quieto() const { return quieto_; }

 private:
  float alfa_;
  Vec3 sesgo_{0, 0, 0};
  bool hayVentana_ = false, quieto_ = false;
  uint32_t inicioVentana_ = 0;
  float min_[3] = {0, 0, 0}, max_[3] = {0, 0, 0};
};
