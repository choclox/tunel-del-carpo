#pragma once
#include "gy85_datos.h"

// Rotación sensor -> tierra: v_tierra = q (x) v_sensor (x) q*  (convención de Madgwick).
struct Cuaternion { float w = 1, x = 0, y = 0, z = 0; };

Cuaternion multiplicar(const Cuaternion& a, const Cuaternion& b);
Cuaternion conjugado(const Cuaternion& q);
Cuaternion desdeEjeAngulo(Vec3 eje, float rad);   // normaliza el eje
Vec3 rotar(const Cuaternion& q, const Vec3& v);

// Orientación absoluta (misma convención y marco que FiltroMadgwick: gravedad en +Z, norte
// magnético horizontal en +X) para sembrar el filtro: inclinación desde acel y rumbo desde mag
// compensado por inclinación. Con mag = {0,0,0} devuelve solo la inclinación (rumbo 0).
Cuaternion orientacionDesdeAcelMag(const Vec3& acel, const Vec3& mag);

// Ángulo entre dos vectores en grados [0; 180]; 0 si alguno es cero.
float anguloEntreGrados(const Vec3& a, const Vec3& b);

// Orientación sin giroscopio: acel y mag suavizados con un paso bajo exponencial
// (x = x + alfa * (nuevo - x)) y convertidos con orientacionDesdeAcelMag. La primera muestra
// tras construir o reiniciar se toma tal cual. Con mag = {0,0,0} solo hay inclinación (rumbo 0).
class FiltroSinGiro {
 public:
  explicit FiltroSinGiro(float alfa = 0.2f);
  void reiniciar();
  void actualizar(const Vec3& acel, const Vec3& mag);
  Cuaternion orientacion() const;

 private:
  float alfa_;
  bool vacio_ = true;
  Vec3 acel_{0, 0, 0};
  Vec3 mag_{0, 0, 0};
};

// Filtro de Madgwick (2010): AHRS de 9 ejes e IMU de 6 ejes.
class FiltroMadgwick {
 public:
  explicit FiltroMadgwick(float beta = 0.1f);
  void fijarBeta(float b);
  void reiniciar(const Cuaternion& q = Cuaternion{});
  void actualizar(const Vec3& giro, const Vec3& acel, const Vec3& mag, float dt);
  void actualizar(const Vec3& giro, const Vec3& acel, float dt);
  Cuaternion orientacion() const;

 private:
  void paso(const Vec3& giro, const Vec3& acel, const Vec3* mag, float dt);
  float beta_;
  Cuaternion q_;
};
