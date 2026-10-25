#include "protocolo.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

static bool empiezaCon(const char* s, const char* prefijo) {
  return strncmp(s, prefijo, strlen(prefijo)) == 0;
}

TipoComando parsearComando(const char* linea) {
  if (!linea) return TipoComando::Desconocido;
  if (strcmp(linea, "START") == 0) return TipoComando::Start;
  if (strcmp(linea, "STOP") == 0) return TipoComando::Stop;
  if (strcmp(linea, "CAL") == 0) return TipoComando::Cal;
  if (strcmp(linea, "MAG") == 0) return TipoComando::Mag;
  if (strcmp(linea, "RAW") == 0) return TipoComando::Raw;
  if (empiezaCon(linea, "EJ,")) return TipoComando::Ej;
  if (empiezaCon(linea, "MANO,")) return TipoComando::Mano;
  return TipoComando::Desconocido;
}

bool parsearMano(const char* linea, bool& izquierda) {
  if (!linea) return false;
  if (strcmp(linea, "MANO,I") == 0) {
    izquierda = true;
    return true;
  }
  if (strcmp(linea, "MANO,D") == 0) {
    izquierda = false;
    return true;
  }
  return false;
}

bool LectorLineas::agregar(char c) {
  if (c == '\r') return false;
  if (c == '\n') {
    bool descartar = desborde_;
    desborde_ = false;
    size_t n = largo_;
    largo_ = 0;
    if (descartar) {
      buf_[0] = 0;
      return false;
    }
    // Recorta espacios al final y al inicio.
    while (n > 0 && isspace((unsigned char)buf_[n - 1])) n--;
    size_t ini = 0;
    while (ini < n && isspace((unsigned char)buf_[ini])) ini++;
    n -= ini;
    memmove(buf_, buf_ + ini, n);
    buf_[n] = 0;
    return n > 0;
  }
  if (largo_ >= CAPACIDAD) {
    desborde_ = true;
    return false;
  }
  buf_[largo_++] = c;
  buf_[largo_] = 0;
  return false;
}

int formatearMuestra(char* buf, size_t tam, uint32_t seq, uint32_t tMs, float fe, float rc,
                     float mcf) {
  return snprintf(buf, tam, "D,%lu,%lu,%.1f,%.1f,%.1f", (unsigned long)seq, (unsigned long)tMs,
                  (double)fe, (double)rc, (double)mcf);
}

int formatearCalOk(char* buf, size_t tam, uint32_t ms) {
  return snprintf(buf, tam, "CAL,OK,%lu", (unsigned long)ms);
}

int formatearCalErr(char* buf, size_t tam, const char* motivo) {
  return snprintf(buf, tam, "CAL,ERR,%s", motivo);
}

int formatearBateria(char* buf, size_t tam, int pct) {
  return snprintf(buf, tam, "BAT,%d", pct);
}
