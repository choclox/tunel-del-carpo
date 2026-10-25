/*
 * Plantilla de firmware: protocolo serie con la interfaz del profesional.
 * Compatible con Arduino (UNO, Nano, Mega) y ESP32.
 *
 * Implementa el protocolo descrito en interfaz-medico/monitoreo.js:
 *   Dispositivo -> PC:  D,<seq>,<t_ms>,<fe>,<rc>,<mcf>   |  CAL,OK,<ms>  |  CAL,ERR,<motivo>  |  BAT,<pct>
 *   PC -> Dispositivo:  START | STOP | CAL | EJ,<tipo>,<objetivo> | EJ,-
 *
 * LO ÚNICO QUE DEBE REEMPLAZAR EL EQUIPO: leerAngulosCrudos() con la lectura
 * real de sus sensores (IMU, flexosensores, encoders, etc.). Mientras tanto,
 * genera una señal de prueba para verificar la comunicación con la interfaz.
 */

const unsigned long BAUDIOS = 115200;
const unsigned long PERIODO_MS = 20;      // 50 Hz
const unsigned long PERIODO_BAT_MS = 10000;

bool transmitiendo = false;
unsigned long seq = 0;
unsigned long proximaMuestra = 0;
unsigned long proximaBateria = 0;

// Desfases obtenidos en la calibración (posición neutra = 0°)
float offFe = 0, offRc = 0, offMcf = 0;

String comando = "";

/* ---------- Reemplazar por la lectura real de los sensores ---------- */
void leerAngulosCrudos(float &fe, float &rc, float &mcf) {
  // Señal de prueba: flexo-extensión senoidal de 40° cada 4 s.
  float t = millis() / 1000.0;
  fe = 5.0 + 40.0 * sin(2 * PI * t / 4.0);
  rc = 0.0;
  mcf = 10.0;
}

int leerBateriaPct() {
  return 100;  // Reemplazar por la medición real (divisor resistivo + ADC)
}
/* -------------------------------------------------------------------- */

void calibrar() {
  // Promedia ~1 s en reposo y lo toma como cero.
  unsigned long inicio = millis();
  const int N = 50;
  float sFe = 0, sRc = 0, sMcf = 0;
  for (int i = 0; i < N; i++) {
    float fe, rc, mcf;
    leerAngulosCrudos(fe, rc, mcf);
    sFe += fe; sRc += rc; sMcf += mcf;
    delay(PERIODO_MS);
  }
  offFe = sFe / N;
  offRc = sRc / N;
  offMcf = 0;  // la flexión MCF se reporta como ángulo absoluto
  // Aquí se pueden validar condiciones (p. ej. sensor no responde) y responder CAL,ERR,<motivo>
  Serial.print("CAL,OK,");
  Serial.println(millis() - inicio);
}

void procesarComando(const String &c) {
  if (c == "START") { transmitiendo = true; }
  else if (c == "STOP") { transmitiendo = false; }
  else if (c == "CAL") { calibrar(); }
  else if (c.startsWith("EJ,")) { /* informativo: se puede usar para LEDs o registro local */ }
  else { Serial.print("#Comando desconocido: "); Serial.println(c); }
}

void setup() {
  Serial.begin(BAUDIOS);
  Serial.println("#Dispositivo listo");
}

void loop() {
  // Comandos desde la PC
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n') { comando.trim(); if (comando.length()) procesarComando(comando); comando = ""; }
    else if (ch != '\r' && comando.length() < 64) comando += ch;
  }

  unsigned long ahora = millis();

  // Muestras a 50 Hz
  if (transmitiendo && (long)(ahora - proximaMuestra) >= 0) {
    proximaMuestra = ahora + PERIODO_MS;
    float fe, rc, mcf;
    leerAngulosCrudos(fe, rc, mcf);
    Serial.print("D,");  Serial.print(++seq);
    Serial.print(',');   Serial.print(ahora);
    Serial.print(',');   Serial.print(fe - offFe, 1);
    Serial.print(',');   Serial.print(rc - offRc, 1);
    Serial.print(',');   Serial.println(mcf - offMcf, 1);
  }

  // Batería cada 10 s
  if ((long)(ahora - proximaBateria) >= 0) {
    proximaBateria = ahora + PERIODO_BAT_MS;
    Serial.print("BAT,"); Serial.println(leerBateriaPct());
  }
}
