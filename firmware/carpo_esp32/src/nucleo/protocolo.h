// Protocolo serie (texto, una linea por mensaje). Modulo puro: sin Arduino.h.
#pragma once
#include <stddef.h>
#include <stdint.h>

enum class TipoComando { Start, Stop, Cal, Ej, Mag, Raw, Mano, Prueba, Desconocido };

// Comparacion exacta y sensible a mayusculas. "EJ,", "MANO," y "PR," se reconocen por prefijo.
// "PR,<musculo>" / "PR,-" marca la prueba de fuerza EMG: es informativo (no hace nada).
TipoComando parsearComando(const char* linea);

// "MANO,I" -> izquierda = true; "MANO,D" -> izquierda = false; otro valor -> false.
bool parsearMano(const char* linea, bool& izquierda);

// Acumula caracteres hasta '\n'. Bufer fijo de 64 caracteres, ignora '\r'.
// Una linea de mas de 64 caracteres se descarta entera.
class LectorLineas {
 public:
  static const size_t CAPACIDAD = 64;
  // Devuelve true al cerrar una linea (recortada) no vacia; entonces linea() es valida.
  bool agregar(char c);
  const char* linea() const { return buf_; }

 private:
  char buf_[CAPACIDAD + 1] = {0};
  size_t largo_ = 0;
  bool desborde_ = false;
};

// "D,<seq>,<t>,<fe>,<rc>,<mcf>" con %.1f, sin '\n'. Devuelve la longitud (como snprintf).
int formatearMuestra(char* buf, size_t tam, uint32_t seq, uint32_t tMs, float fe, float rc,
                     float mcf);
// Igual que formatearMuestra con ",<emg1>,<emg2>,<emg3>" (tenar, flexores, extensores; 0..1000).
int formatearMuestraEmg(char* buf, size_t tam, uint32_t seq, uint32_t tMs, float fe, float rc,
                        float mcf, const uint16_t emg[3]);
int formatearCalOk(char* buf, size_t tam, uint32_t ms);
int formatearCalErr(char* buf, size_t tam, const char* motivo);
int formatearBateria(char* buf, size_t tam, int pct);
