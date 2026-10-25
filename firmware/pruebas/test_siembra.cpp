// Siembra del filtro desde acel/mag (F1) y CAL simulado con asentamiento (F2).
#include <math.h>
#include <stdint.h>
#include "prueba.h"
#include "fusion.h"
#include "angulos.h"
#include "calibracion.h"

const float GRAD = 3.14159265f / 180;
const Vec3 CAMPO{20, 0, -40};   // campo terrestre en el marco de Madgwick (µT)

// Distancia angular entre dos orientaciones (grados).
static float distancia(const Cuaternion& a, const Cuaternion& b) {
  Cuaternion r = multiplicar(conjugado(a), b);
  float w = fabsf(r.w);
  if (w > 1.0f) w = 1.0f;
  return 2.0f * acosf(w) / GRAD;
}
// Rz(guiñada) * Ry(cabeceo) * Rx(alabeo), en grados.
static Cuaternion orientacion(float guinada, float cabeceo, float alabeo) {
  return multiplicar(multiplicar(desdeEjeAngulo({0, 0, 1}, guinada * GRAD),
                                 desdeEjeAngulo({0, 1, 0}, cabeceo * GRAD)),
                     desdeEjeAngulo({1, 0, 0}, alabeo * GRAD));
}
static Vec3 acelDe(const Cuaternion& q) { return rotar(conjugado(q), {0, 0, 1}); }
static Vec3 magDe(const Cuaternion& q, Vec3 campo = CAMPO) { return rotar(conjugado(q), campo); }

const float CASOS[][3] = {{0, 0, 0},     {90, 20, -10},  {170, -40, 25}, {-150, 35, -30},
                          {200, 60, 10}, {-100, -60, 0}, {45, 0, 80},    {180, 50, -20}};

PRUEBA(siembra_reproduce_orientacion) {
  for (auto& c : CASOS) {
    Cuaternion q = orientacion(c[0], c[1], c[2]);
    Cuaternion s = orientacionDesdeAcelMag(acelDe(q), magDe(q));
    CERCA(distancia(q, s), 0, 0.1f);
  }
}
PRUEBA(siembra_rumbo_relativo_con_declinacion) {
  const Vec3 campo{15, 12, -40};          // norte magnético fuera del eje X de la tierra
  const float base[3] = {10, 15, -5};
  Cuaternion q1 = orientacion(base[0], base[1], base[2]);
  Cuaternion s1 = orientacionDesdeAcelMag(acelDe(q1), magDe(q1, campo));
  for (auto& c : CASOS) {
    Cuaternion q2 = orientacion(c[0], c[1] * 0.5f, c[2] * 0.5f);
    Cuaternion s2 = orientacionDesdeAcelMag(acelDe(q2), magDe(q2, campo));
    AngulosMuneca real = angulosRelativos(q1, q2, false), sem = angulosRelativos(s1, s2, false);
    CERCA(sem.fe, real.fe, 0.1f);
    float d = sem.rc - real.rc;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    CERCA(d, 0, 0.1f);
  }
}
PRUEBA(siembra_sin_mag_solo_inclinacion) {
  Cuaternion q = orientacion(130, 25, -15);
  Vec3 a = acelDe(q);
  Cuaternion s = orientacionDesdeAcelMag({a.x * 1.05f, a.y * 1.05f, a.z * 1.05f}, {0, 0, 0});
  Vec3 g = rotar(s, a);
  CERCA(g.x, 0, 1e-4f); CERCA(g.y, 0, 1e-4f); CERCA(g.z, 1, 1e-4f);
  AngulosMuneca an = angulosRelativos({}, s, false);
  CERCA(an.fe, 25, 0.1f); CERCA(an.rc, 0, 0.1f);    // rumbo 0
}
PRUEBA(siembra_entradas_degeneradas_finitas) {
  Cuaternion s1 = orientacionDesdeAcelMag({0, 0, 0}, {0, 0, 0});
  Cuaternion s2 = orientacionDesdeAcelMag({1, 0, 0}, {5, 0, 0});    // mag paralelo a la gravedad
  for (const Cuaternion& s : {s1, s2}) {
    VERIFICAR(isfinite(s.w) && isfinite(s.x) && isfinite(s.y) && isfinite(s.z));
    CERCA(s.w * s.w + s.x * s.x + s.y * s.y + s.z * s.z, 1, 1e-4f);
  }
}
// Mayor distancia a la orientación real durante 'pasos' ciclos de 10 ms con datos coherentes.
static float peorTrasSiembra(const Cuaternion& q, float beta, bool nueveEjes, int pasos) {
  Vec3 a = acelDe(q), m = magDe(q);
  FiltroMadgwick f(beta);
  f.reiniciar(orientacionDesdeAcelMag(a, nueveEjes ? m : Vec3{0, 0, 0}));
  Cuaternion ref = nueveEjes ? q : f.orientacion();   // en 6 ejes el rumbo sembrado es 0
  float peor = 0;
  for (int i = 0; i < pasos; i++) {
    if (nueveEjes) f.actualizar({0, 0, 0}, a, m, 0.01f);
    else f.actualizar({0, 0, 0}, a, 0.01f);
    float d = distancia(ref, f.orientacion());
    if (d > peor) peor = d;
  }
  return peor;
}
PRUEBA(madgwick_no_mueve_la_siembra) {
  float p01 = 0, p25 = 0;
  for (auto& c : CASOS) {
    Cuaternion q = orientacion(c[0], c[1], c[2]);
    for (bool nueve : {true, false}) {
      float d = peorTrasSiembra(q, 0.1f, nueve, 3000);   // operación: 30 s a beta 0,1
      if (d > p01) p01 = d;
      CERCA(d, 0, 0.5f);
      d = peorTrasSiembra(q, 2.5f, nueve, 300);          // convergencia: no deriva, solo vibra
      if (d > p25) p25 = d;
      CERCA(d, 0, 2.9f);   // paso fijo de Madgwick: |dq| <= beta*dt -> <= 2*2,5*0,01 rad = 2,86 grados
    }
  }
  printf("  siembra: peor desvio a beta 0,1 %.3f grados; a beta 2,5 %.2f grados\n", p01, p25);
}
PRUEBA(angulo_entre_vectores) {
  CERCA(anguloEntreGrados({0, 0, 1}, {20, 0, -40}), 153.4f, 0.1f);
  CERCA(anguloEntreGrados({1, 0, 0}, {0, 3, 0}), 90.0f, 0.01f);
  CERCA(anguloEntreGrados({1, 1, 0}, {2, 2, 0}), 0.0f, 0.05f);
  CERCA(anguloEntreGrados({0, 0, 0}, {1, 0, 0}), 0.0f, 0.0f);
  CERCA(anguloEntreGrados({1, 0, 0}, {0, 0, 0}), 0.0f, 0.0f);
}

// ---- CAL simulado (mismos pasos que gestionarCalibracion en carpo_esp32.ino) ----
static uint32_t semilla = 12345;
static float uniforme() {
  semilla = semilla * 1664525u + 1013904223u;
  return (semilla >> 8) / 16777216.0f;
}
static float normal() {
  float s = 0;
  for (int i = 0; i < 12; i++) s += uniforme();
  return s - 6.0f;
}
// Ruido del GY-85: ADXL345 ~4 mg, ITG3205 ~0,38 °/s, magnetómetro ~0,3 µT (1 sigma).
struct Lectura { Vec3 giro, acel, mag; };
static Lectura leerSimulado(const Cuaternion& q, const Vec3& sesgo) {
  Vec3 a = acelDe(q), m = magDe(q);
  return {{sesgo.x + 0.0067f * normal(), sesgo.y + 0.0067f * normal(), sesgo.z + 0.0067f * normal()},
          {a.x + 0.004f * normal(), a.y + 0.004f * normal(), a.z + 0.004f * normal()},
          {m.x + 0.3f * normal(), m.y + 0.3f * normal(), m.z + 0.3f * normal()}};
}
static Vec3 restar(const Vec3& a, const Vec3& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }

struct ResultadoCal { bool ok; Cuaternion qCal; Vec3 sesgo; uint32_t t; };
static ResultadoCal simularCal(FiltroMadgwick& f, const Cuaternion& qReal, const Vec3& sesgoReal) {
  Calibrador c; c.iniciar(0);
  Vec3 sesgo{0, 0, 0};
  f.fijarBeta(0.1f);
  for (uint32_t t = 0; t <= 10000; t += 10) {
    Lectura l = leerSimulado(qReal, sesgoReal);
    f.actualizar(restar(l.giro, sesgo), l.acel, l.mag, 0.01f);
    EstadoCal antes = c.estado(), despues = c.agregar(l.giro, l.acel, t);
    if (despues == EstadoCal::Convergiendo) {
      if (antes != EstadoCal::Convergiendo) {
        sesgo = c.sesgoGiro();
        f.reiniciar(orientacionDesdeAcelMag(l.acel, l.mag));
      }
      f.fijarBeta(c.asentando(t) ? 0.1f : 2.5f);
    } else if (despues == EstadoCal::Listo) {
      f.fijarBeta(0.1f);
      return {true, f.orientacion(), sesgo, t};
    } else if (despues == EstadoCal::Error) {
      break;
    }
  }
  return {false, {}, sesgo, 0};
}

PRUEBA(cal_simulado_desde_orientacion_lejana) {
  const Vec3 sesgoReal{0.02f, -0.015f, 0.01f};
  float peor = 0;
  for (auto& c : CASOS) {
    Cuaternion qReal = orientacion(c[0], c[1], c[2]);
    FiltroMadgwick f(0.1f);                       // arranque en frío: identidad
    ResultadoCal r = simularCal(f, qReal, sesgoReal);
    VERIFICAR(r.ok);
    float d = distancia(qReal, r.qCal);
    if (d > peor) peor = d;
    CERCA(d, 0, 1.0f);
  }
  printf("  cal simulado: peor error de qCal %.2f grados\n", peor);
}
PRUEBA(cal_simulado_estable_30_s) {
  const Vec3 sesgoReal{0.02f, -0.015f, 0.01f};
  float peor = 0;
  for (int k = 0; k < 4; k++) {
    auto& c = CASOS[k * 2 + 1];
    Cuaternion qReal = orientacion(c[0], c[1], c[2]);
    FiltroMadgwick f(0.1f);
    ResultadoCal r = simularCal(f, qReal, sesgoReal);
    VERIFICAR(r.ok);
    for (int i = 0; i < 3000; i++) {             // 30 s quieto a beta 0,1
      Lectura l = leerSimulado(qReal, sesgoReal);
      f.actualizar(restar(l.giro, r.sesgo), l.acel, l.mag, 0.01f);
      AngulosMuneca a = angulosRelativos(r.qCal, f.orientacion(), false);
      if (fabsf(a.fe) > peor) peor = fabsf(a.fe);
      if (fabsf(a.rc) > peor) peor = fabsf(a.rc);
    }
  }
  printf("  30 s quieto tras CAL: peor |fe|,|rc| %.2f grados\n", peor);
  CERCA(peor, 0, 0.5f);
}

int main() { return correrPruebas(); }
