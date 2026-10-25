#include "fusion.h"
#include <math.h>

Cuaternion multiplicar(const Cuaternion& a, const Cuaternion& b) {
  Cuaternion r;
  r.w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  r.x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  r.y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  r.z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  return r;
}

Cuaternion conjugado(const Cuaternion& q) {
  Cuaternion r;
  r.w = q.w; r.x = -q.x; r.y = -q.y; r.z = -q.z;
  return r;
}

Cuaternion desdeEjeAngulo(Vec3 eje, float rad) {
  float n = sqrtf(eje.x * eje.x + eje.y * eje.y + eje.z * eje.z);
  Cuaternion r;
  if (n == 0.0f) return r;
  float s = sinf(rad * 0.5f) / n;
  r.w = cosf(rad * 0.5f);
  r.x = eje.x * s; r.y = eje.y * s; r.z = eje.z * s;
  return r;
}

Vec3 rotar(const Cuaternion& q, const Vec3& v) {
  Cuaternion p; p.w = 0; p.x = v.x; p.y = v.y; p.z = v.z;
  Cuaternion r = multiplicar(multiplicar(q, p), conjugado(q));
  return Vec3{r.x, r.y, r.z};
}

Cuaternion orientacionDesdeAcelMag(const Vec3& acel, const Vec3& mag) {
  if (esCero(acel)) return Cuaternion{};
  // Inclinación: acel = R^T (0,0,1) con R = Ry(cabeceo) Rx(alabeo) (rumbo 0).
  float alabeo = atan2f(acel.y, acel.z);
  float cabeceo = atan2f(-acel.x, sqrtf(acel.y * acel.y + acel.z * acel.z));
  Cuaternion q = multiplicar(desdeEjeAngulo({0, 1, 0}, cabeceo), desdeEjeAngulo({1, 0, 0}, alabeo));
  // Campo en el marco nivelado: el rumbo lleva su parte horizontal a +X.
  Vec3 h = rotar(q, mag);
  float h2 = h.x * h.x + h.y * h.y;
  float m2 = mag.x * mag.x + mag.y * mag.y + mag.z * mag.z;
  if (h2 > 1e-6f * m2 && h2 > 0.0f) {
    q = multiplicar(desdeEjeAngulo({0, 0, 1}, -atan2f(h.y, h.x)), q);
  }
  return q;
}

float anguloEntreGrados(const Vec3& a, const Vec3& b) {
  float na = sqrtf(a.x * a.x + a.y * a.y + a.z * a.z);
  float nb = sqrtf(b.x * b.x + b.y * b.y + b.z * b.z);
  if (!(na > 0.0f) || !(nb > 0.0f)) return 0.0f;
  float c = (a.x * b.x + a.y * b.y + a.z * b.z) / (na * nb);
  if (c > 1.0f) c = 1.0f;
  if (c < -1.0f) c = -1.0f;
  return acosf(c) * (180.0f / 3.14159265f);
}

FiltroMadgwick::FiltroMadgwick(float beta) : beta_(beta) {}
void FiltroMadgwick::fijarBeta(float b) { beta_ = b; }
void FiltroMadgwick::reiniciar(const Cuaternion& q) { q_ = q; }
Cuaternion FiltroMadgwick::orientacion() const { return q_; }

void FiltroMadgwick::actualizar(const Vec3& giro, const Vec3& acel, const Vec3& mag, float dt) {
  if (mag.x == 0.0f && mag.y == 0.0f && mag.z == 0.0f) paso(giro, acel, nullptr, dt);
  else paso(giro, acel, &mag, dt);
}

void FiltroMadgwick::actualizar(const Vec3& giro, const Vec3& acel, float dt) {
  paso(giro, acel, nullptr, dt);
}

void FiltroMadgwick::paso(const Vec3& giro, const Vec3& acel, const Vec3* mag, float dt) {
  if (!(dt > 0.0f)) return;
  if (dt > 0.05f) dt = 0.05f;

  float q0 = q_.w, q1 = q_.x, q2 = q_.y, q3 = q_.z;
  float gx = giro.x, gy = giro.y, gz = giro.z;

  // Tasa de cambio del cuaternión por el giroscopio
  float qDot1 = 0.5f * (-q1 * gx - q2 * gy - q3 * gz);
  float qDot2 = 0.5f * (q0 * gx + q2 * gz - q3 * gy);
  float qDot3 = 0.5f * (q0 * gy - q1 * gz + q3 * gx);
  float qDot4 = 0.5f * (q0 * gz + q1 * gy - q2 * gx);

  float na = sqrtf(acel.x * acel.x + acel.y * acel.y + acel.z * acel.z);
  if (na > 0.0f) {
    float ax = acel.x / na, ay = acel.y / na, az = acel.z / na;
    float s0, s1, s2, s3;

    float q0q0 = q0 * q0, q0q1 = q0 * q1, q0q2 = q0 * q2, q0q3 = q0 * q3;
    float q1q1 = q1 * q1, q1q2 = q1 * q2, q1q3 = q1 * q3;
    float q2q2 = q2 * q2, q2q3 = q2 * q3, q3q3 = q3 * q3;
    float _2q0 = 2.0f * q0, _2q1 = 2.0f * q1, _2q2 = 2.0f * q2, _2q3 = 2.0f * q3;
    float _4q0 = 4.0f * q0, _4q1 = 4.0f * q1, _4q2 = 4.0f * q2;
    float _8q1 = 8.0f * q1, _8q2 = 8.0f * q2;

    float nm = 0.0f;
    if (mag) nm = sqrtf(mag->x * mag->x + mag->y * mag->y + mag->z * mag->z);

    if (mag && nm > 0.0f) {
      float mx = mag->x / nm, my = mag->y / nm, mz = mag->z / nm;
      float _2q0mx = 2.0f * q0 * mx, _2q0my = 2.0f * q0 * my, _2q0mz = 2.0f * q0 * mz;
      float _2q1mx = 2.0f * q1 * mx;
      // Dirección de referencia del campo terrestre
      float hx = mx * q0q0 - _2q0my * q3 + _2q0mz * q2 + mx * q1q1 + _2q1 * my * q2 +
                 _2q1 * mz * q3 - mx * q2q2 - mx * q3q3;
      float hy = _2q0mx * q3 + my * q0q0 - _2q0mz * q1 + _2q1mx * q2 - my * q1q1 +
                 my * q2q2 + _2q2 * mz * q3 - my * q3q3;
      float _2bx = sqrtf(hx * hx + hy * hy);
      float _2bz = -_2q0mx * q2 + _2q0my * q1 + mz * q0q0 + _2q1mx * q3 - mz * q1q1 +
                   _2q2 * my * q3 - mz * q2q2 + mz * q3q3;
      float _4bx = 2.0f * _2bx, _4bz = 2.0f * _2bz;

      float ea = 2.0f * q1q3 - _2q0 * q2 - ax;
      float eb = 2.0f * q0q1 + _2q2 * q3 - ay;
      float ex = _2bx * (0.5f - q2q2 - q3q3) + _2bz * (q1q3 - q0q2) - mx;
      float ey = _2bx * (q1q2 - q0q3) + _2bz * (q0q1 + q2q3) - my;
      float ez = _2bx * (q0q2 + q1q3) + _2bz * (0.5f - q1q1 - q2q2) - mz;

      s0 = -_2q2 * ea + _2q1 * eb - _2bz * q2 * ex + (-_2bx * q3 + _2bz * q1) * ey + _2bx * q2 * ez;
      s1 = _2q3 * ea + _2q0 * eb - 4.0f * q1 * (1.0f - 2.0f * q1q1 - 2.0f * q2q2 - az) +
           _2bz * q3 * ex + (_2bx * q2 + _2bz * q0) * ey + (_2bx * q3 - _4bz * q1) * ez;
      s2 = -_2q0 * ea + _2q3 * eb - 4.0f * q2 * (1.0f - 2.0f * q1q1 - 2.0f * q2q2 - az) +
           (-_4bx * q2 - _2bz * q0) * ex + (_2bx * q1 + _2bz * q3) * ey + (_2bx * q0 - _4bz * q2) * ez;
      s3 = _2q1 * ea + _2q2 * eb + (-_4bx * q3 + _2bz * q1) * ex +
           (-_2bx * q0 + _2bz * q2) * ey + _2bx * q1 * ez;
    } else {
      // IMU de 6 ejes
      s0 = _4q0 * q2q2 + _2q2 * ax + _4q0 * q1q1 - _2q1 * ay;
      s1 = _4q1 * q3q3 - _2q3 * ax + 4.0f * q0q0 * q1 - _2q0 * ay - _4q1 +
           _8q1 * q1q1 + _8q1 * q2q2 + _4q1 * az;
      s2 = 4.0f * q0q0 * q2 + _2q0 * ax + _4q2 * q3q3 - _2q3 * ay - _4q2 +
           _8q2 * q1q1 + _8q2 * q2q2 + _4q2 * az;
      s3 = 4.0f * q1q1 * q3 - _2q1 * ax + 4.0f * q2q2 * q3 - _2q2 * ay;
    }

    float ns = sqrtf(s0 * s0 + s1 * s1 + s2 * s2 + s3 * s3);
    if (ns > 0.0f) {
      float k = beta_ / ns;
      qDot1 -= k * s0; qDot2 -= k * s1; qDot3 -= k * s2; qDot4 -= k * s3;
    }
  }

  q0 += qDot1 * dt; q1 += qDot2 * dt; q2 += qDot3 * dt; q3 += qDot4 * dt;
  float n = sqrtf(q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3);
  if (n > 0.0f && isfinite(n)) {
    q_.w = q0 / n; q_.x = q1 / n; q_.y = q2 / n; q_.z = q3 / n;
  }
}
