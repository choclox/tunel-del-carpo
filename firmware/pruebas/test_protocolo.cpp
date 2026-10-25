#include "prueba.h"
#include "protocolo.h"

PRUEBA(muestra_con_un_decimal) {
  char b[64];
  formatearMuestra(b, sizeof b, 7, 140, 12.345f, -3.26f, 0.0f);
  TEXTO_IGUAL(b, "D,7,140,12.3,-3.3,0.0");
}
PRUEBA(mensajes_cal_y_bateria) {
  char b[64];
  formatearCalOk(b, sizeof b, 2510);              TEXTO_IGUAL(b, "CAL,OK,2510");
  formatearCalErr(b, sizeof b, "movimiento");     TEXTO_IGUAL(b, "CAL,ERR,movimiento");
  formatearBateria(b, sizeof b, 87);              TEXTO_IGUAL(b, "BAT,87");
}
PRUEBA(comandos_conocidos) {
  VERIFICAR(parsearComando("START") == TipoComando::Start);
  VERIFICAR(parsearComando("STOP") == TipoComando::Stop);
  VERIFICAR(parsearComando("CAL") == TipoComando::Cal);
  VERIFICAR(parsearComando("EJ,flexion,10") == TipoComando::Ej);
  VERIFICAR(parsearComando("EJ,-") == TipoComando::Ej);
  VERIFICAR(parsearComando("MAG") == TipoComando::Mag);
  VERIFICAR(parsearComando("RAW") == TipoComando::Raw);
  VERIFICAR(parsearComando("MANO,I") == TipoComando::Mano);
  VERIFICAR(parsearComando("CALX") == TipoComando::Desconocido);
  VERIFICAR(parsearComando("start") == TipoComando::Desconocido);
}
PRUEBA(mano) {
  bool izq = false;
  VERIFICAR(parsearMano("MANO,I", izq) && izq);
  VERIFICAR(parsearMano("MANO,D", izq) && !izq);
  VERIFICAR(!parsearMano("MANO,X", izq));
}
PRUEBA(lector_crlf_y_espacios) {   // el monitor serie de Arduino envía \r\n
  LectorLineas l; bool listo = false;
  for (char c : "CAL\r\n") if (c) listo = l.agregar(c);
  VERIFICAR(listo); TEXTO_IGUAL(l.linea(), "CAL");
  for (char c : "  START \n") if (c) listo = l.agregar(c);
  VERIFICAR(listo); TEXTO_IGUAL(l.linea(), "START");
  VERIFICAR(!l.agregar('\n'));
}
PRUEBA(lector_descarta_linea_larga) {
  LectorLineas l;
  for (int i = 0; i < 70; i++) l.agregar('A');
  VERIFICAR(!l.agregar('\n'));
  bool listo = false;
  for (char c : "STOP\n") if (c) listo = l.agregar(c);
  VERIFICAR(listo); TEXTO_IGUAL(l.linea(), "STOP");
}

int main() { return correrPruebas(); }
