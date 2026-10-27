// Firmware del carpo: GY-85 en el dorso de la mano -> ángulos de muñeca por USB serie.
// Protocolo: ver interfaz-medico/monitoreo.js. Toda salida no protocolaria empieza con '#'.
#include <Preferences.h>
#include <Wire.h>
#include <esp_log.h>
#include <string.h>

#include "config.h"
#include "gy85.h"
#include "src/nucleo/angulos.h"
#include "src/nucleo/bateria.h"
#include "src/nucleo/calibracion.h"
#include "src/nucleo/emg.h"
#include "src/nucleo/fusion.h"
#include "src/nucleo/gy85_datos.h"
#include "src/nucleo/protocolo.h"

static Gy85 gy85;
static FiltroMadgwick filtro(BETA_NORMAL);
static Calibrador calibrador;
static CalibradorMag calibradorMag;
static VigilanteSensor vigilante;
static LectorLineas lector;
static RmsVentana rmsEmg[3] = {RmsVentana(EMG_VENTANA_RMS), RmsVentana(EMG_VENTANA_RMS),
                               RmsVentana(EMG_VENTANA_RMS)};
static ReposoEmg reposoEmg;
static uint16_t emgCrudo[3] = {0, 0, 0};  // último valor 0..1000 en modo crudo (RMS)
static uint32_t ultimoMsEmg = 0;

static bool detectado = false;
static bool transmitiendo = TRANSMITIR_AL_ARRANCAR;
static bool enviandoRaw = false;
static bool manoIzquierda = false;
static bool calibrando = false;
static bool midiendoMag = false;
static bool magCalibrado = false;     // hay un MAG guardado para este chip y este MONTAJE_MAG
static bool sembrarPendiente = true;  // sembrar el filtro con la próxima lectura válida

static Vec3 sesgoGiro{0, 0, 0};
static Vec3 desfaseMag{0, 0, 0};
static Cuaternion qCal;

// Calibración del magnetómetro guardada en NVS (indicador, chip y huella del montaje).
static bool magOkGuardado = false;
static char chipGuardado[4] = "";
static uint32_t huellaGuardada = 0;

static uint32_t seq = 0;
static uint8_t ciclo = 0;
static uint32_t proximaFusion = 0;
static uint32_t proximaBateria = 0;
static uint32_t proximoRaw = 0;
static uint32_t finMag = 0;
static uint32_t ultimoMicros = 0;

// Última lectura montada (para RAW).
static Vec3 ultAcel{0, 0, 0}, ultGiro{0, 0, 0}, ultMag{0, 0, 0};

static bool sensorDisponible() { return detectado && !vigilante.perdido(); }

// Fusión de 9 ejes solo con un magnetómetro presente y calibrado (MAG) para este montaje.
static bool usarMag() { return USAR_MAGNETOMETRO && gy85.tieneMagnetometro() && magCalibrado; }

static Vec3 restarDesfaseMag(const Vec3& mag) {
  return Vec3{mag.x - desfaseMag.x, mag.y - desfaseMag.y, mag.z - desfaseMag.z};
}

// Magnetómetro sin desfase para el filtro, o {0,0,0} (6 ejes) si no se usa o no hay lectura.
static Vec3 magParaFiltro(const Vec3& mag) {
  if (!usarMag() || esCero(mag)) return Vec3{0, 0, 0};
  return restarDesfaseMag(mag);
}

static void guardarMano() {
  Preferences pref;
  pref.begin("carpo", false);
  pref.putBool("izq", manoIzquierda);
  pref.end();
}

static void guardarDesfaseMag() {
  Preferences pref;
  pref.begin("carpo", false);
  pref.putFloat("mx", desfaseMag.x);
  pref.putFloat("my", desfaseMag.y);
  pref.putFloat("mz", desfaseMag.z);
  pref.putString("magchip", gy85.codigoMagnetometro());
  pref.putUInt("maghuella", huellaMontaje(MONTAJE_MAG));
  pref.putBool("magok", true);
  pref.end();
  magOkGuardado = true;
  strncpy(chipGuardado, gy85.codigoMagnetometro(), sizeof(chipGuardado) - 1);
  chipGuardado[sizeof(chipGuardado) - 1] = 0;
  huellaGuardada = huellaMontaje(MONTAJE_MAG);
}

static void cargarPreferencias() {
  Preferences pref;
  pref.begin("carpo", true);
  desfaseMag = Vec3{pref.getFloat("mx", 0.0f), pref.getFloat("my", 0.0f), pref.getFloat("mz", 0.0f)};
  manoIzquierda = pref.getBool("izq", false);
  magOkGuardado = pref.getBool("magok", false);
  if (pref.isKey("magchip")) pref.getString("magchip", chipGuardado, sizeof(chipGuardado));
  huellaGuardada = pref.getUInt("maghuella", 0);
  pref.end();
}

// Tras detectar o recuperar el GY-85: el MAG guardado vale solo para el mismo chip y montaje.
static void evaluarMag() {
  magCalibrado = magOkGuardado && strcmp(chipGuardado, gy85.codigoMagnetometro()) == 0 &&
                 huellaGuardada == huellaMontaje(MONTAJE_MAG);
  if (USAR_MAGNETOMETRO && gy85.tieneMagnetometro() && !magCalibrado) {
    Serial.println("#Magnetometro sin calibrar: envie MAG");
  }
}

static void enviarBateria() {
  if (!MEDIR_BATERIA) return;
  uint32_t suma = 0;
  for (int i = 0; i < 16; i++) suma += analogReadMilliVolts(PIN_BATERIA);
  float voltios = (suma / 16.0f) / 1000.0f * FACTOR_DIVISOR;
  char buf[32];
  formatearBateria(buf, sizeof(buf), porcentajeBateria(voltios));
  Serial.println(buf);
}

static void iniciarCalibracion(uint32_t ahora) {
  if (!sensorDisponible()) {
    Serial.println("CAL,ERR,sensor");
    return;
  }
  calibrando = true;  // un CAL en curso se reinicia
  filtro.fijarBeta(BETA_NORMAL);
  calibrador.iniciar(ahora);
  if (USAR_EMG) reposoEmg.iniciar();  // el reposo EMG se mide durante la calibración
}

static void iniciarMag(uint32_t ahora) {
  if (!sensorDisponible()) {
    Serial.println("#MAG,ERR,sensor");
    return;
  }
  if (!gy85.tieneMagnetometro()) {
    Serial.println("#MAG,ERR,sin magnetometro");
    return;
  }
  calibradorMag.iniciar();
  midiendoMag = true;
  finMag = ahora + DURACION_MAG_MS;
  Serial.println("#MAG: gire la mano en todas las direcciones durante 20 s");
}

static void procesarComando(const char* linea, uint32_t ahora) {
  switch (parsearComando(linea)) {
    case TipoComando::Start:
      transmitiendo = true;
      enviarBateria();  // la interfaz recibe la batería sin esperar al próximo envío
      proximaBateria = ahora + PERIODO_BAT_MS;
      break;
    case TipoComando::Stop: transmitiendo = false; break;  // no cancela la calibración
    case TipoComando::Cal: iniciarCalibracion(ahora); break;
    case TipoComando::Ej: break;
    case TipoComando::Prueba: break;  // informativo: la prueba EMG la guía la interfaz
    case TipoComando::Mag: iniciarMag(ahora); break;
    case TipoComando::Raw: enviandoRaw = !enviandoRaw; break;
    case TipoComando::Mano: {
      bool izq = false;
      if (parsearMano(linea, izq)) {
        manoIzquierda = izq;
        guardarMano();
        Serial.println(manoIzquierda ? "#MANO,I" : "#MANO,D");
      } else {
        Serial.print("#Comando desconocido: ");
        Serial.println(linea);
      }
      break;
    }
    default:
      Serial.print("#Comando desconocido: ");
      Serial.println(linea);
      break;
  }
}

static void leerComandos(uint32_t ahora) {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (lector.agregar(c)) procesarComando(lector.linea(), ahora);
  }
}

// Calibración del cero del giroscopio y avance de su máquina de estados.
// Al entrar en Convergiendo se siembra el filtro desde acel/mag (orientación absoluta); el
// filtro converge a beta alta y los últimos 500 ms se asienta a beta normal antes de tomar qCal.
static void gestionarCalibracion(const Vec3& giroCrudo, const Vec3& acel, bool ok,
                                 uint32_t ahora) {
  if (!calibrando) return;
  if (vigilante.perdido()) {
    calibrando = false;
    filtro.fijarBeta(BETA_NORMAL);
    Serial.println("CAL,ERR,sensor");
    return;
  }
  if (!ok) return;
  EstadoCal antes = calibrador.estado();
  EstadoCal despues = calibrador.agregar(giroCrudo, acel, ahora);
  char buf[64];
  if (antes == EstadoCal::Convergiendo && despues == EstadoCal::Midiendo) {
    filtro.fijarBeta(BETA_NORMAL);  // la quietud se perdió: vuelve a medir
  } else if (despues == EstadoCal::Convergiendo) {
    if (antes != EstadoCal::Convergiendo) {
      sesgoGiro = calibrador.sesgoGiro();
      sembrarPendiente = true;  // se siembra con la lectura del próximo ciclo
    }
    filtro.fijarBeta(calibrador.asentando(ahora) ? BETA_NORMAL : BETA_CONVERGENCIA);
  } else if (despues == EstadoCal::Listo) {
    qCal = filtro.orientacion();
    filtro.fijarBeta(BETA_NORMAL);
    calibrando = false;
    if (USAR_EMG) reposoEmg.terminar();
    formatearCalOk(buf, sizeof(buf), calibrador.duracionMs());
    Serial.println(buf);
  } else if (despues == EstadoCal::Error) {
    filtro.fijarBeta(BETA_NORMAL);
    calibrando = false;
    formatearCalErr(buf, sizeof(buf), calibrador.motivo());
    Serial.println(buf);
  }
}

// Calibración del magnetómetro: acumula mientras la fusión sigue funcionando.
static void gestionarMag(const Vec3& mag, bool ok, uint32_t ahora) {
  if (!midiendoMag) return;
  if (ok && !esCero(mag)) calibradorMag.agregar(mag);
  if ((int32_t)(ahora - finMag) < 0) return;
  midiendoMag = false;
  if (calibradorMag.valido()) {
    desfaseMag = calibradorMag.desfase();
    guardarDesfaseMag();
    magCalibrado = true;
    sembrarPendiente = true;  // el rumbo pasa a ser magnético: el cero anterior ya no vale
    char buf[96];
    snprintf(buf, sizeof(buf), "#MAG,OK,%.2f,%.2f,%.2f", desfaseMag.x, desfaseMag.y, desfaseMag.z);
    Serial.println(buf);
    Serial.println("#Recalibre");
  } else {
    Serial.println("#MAG,ERR,giro insuficiente");
  }
}

// EMG actual de los 3 canales en 0..1000, sin restar el reposo.
static void leerEmg(uint16_t v[3]) {
  for (int i = 0; i < 3; i++) {
    v[i] = EMG_MODO == ModoEmg::Envolvente
               ? escalarEmg((float)analogReadMilliVolts(PINES_EMG[i]), EMG_MAX_MV)
               : emgCrudo[i];
  }
}

// Modo crudo: una muestra por canal cada 1 ms y RMS de la ventana (amplitud máxima = mitad del rango).
static void muestrearEmgCrudo(uint32_t ahora) {
  if (!USAR_EMG || EMG_MODO != ModoEmg::Crudo || ahora == ultimoMsEmg) return;
  ultimoMsEmg = ahora;
  for (int i = 0; i < 3; i++) {
    float rms = rmsEmg[i].agregar((float)analogReadMilliVolts(PINES_EMG[i]) - EMG_CENTRO_MV);
    emgCrudo[i] = escalarEmg(rms, EMG_MAX_MV / 2.0f);
  }
}

static void enviarMuestra(uint32_t ahora) {
  AngulosMuneca a = angulosRelativos(qCal, filtro.orientacion(), manoIzquierda);
  char buf[80];
  if (USAR_EMG) {
    uint16_t emg[3];
    leerEmg(emg);
    reposoEmg.restar(emg);
    formatearMuestraEmg(buf, sizeof(buf), seq, ahora, a.fe, a.rc, a.ps, emg);
  } else {
    formatearMuestra(buf, sizeof(buf), seq, ahora, a.fe, a.rc, a.ps);
  }
  Serial.println(buf);
}

// #RAW: acel (g), giro (rad/s), mag montado (µT) y el ángulo acel-mag (grados) con el desfase
// de MAG restado. Tras MAG ese ángulo debe mantenerse constante al girar la mano.
static void enviarRaw() {
  if (!sensorDisponible()) {  // no repetir la última lectura como si fuera nueva
    Serial.println("#RAW,sin sensor");
    return;
  }
  Vec3 m = esCero(ultMag) ? ultMag : restarDesfaseMag(ultMag);
  char buf[176];
  snprintf(buf, sizeof(buf), "#RAW,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.1f", ultAcel.x,
           ultAcel.y, ultAcel.z, ultGiro.x, ultGiro.y, ultGiro.z, ultMag.x, ultMag.y, ultMag.z,
           anguloEntreGrados(ultAcel, m));
  Serial.println(buf);
}

// Vigila las lecturas y reintenta el driver; al recuperarlo se vuelve a sembrar el filtro.
static void vigilarSensor(bool ok, uint32_t ahora) {
  vigilante.registrar(ok, ahora);
  if (!vigilante.debeReintentar(ahora)) return;
  Serial.println("#Error de lectura del GY-85, reintentando");
  if (!gy85.iniciar(Wire)) return;
  detectado = true;
  Serial.println("#GY-85 recuperado");
  evaluarMag();
  sembrarPendiente = true;
  if (!usarMag()) Serial.println("#Recalibre");  // en 6 ejes el rumbo sembrado es arbitrario
}

// Avanza el filtro con una lectura válida, o lo siembra desde acel/mag si está pendiente.
// En 9 ejes la siembra espera a una lectura con magnetómetro para fijar el rumbo.
static void actualizarFiltro(const Vec3& giro, const Vec3& acel, const Vec3& mag, float dt) {
  Vec3 magC = magParaFiltro(mag);
  if (sembrarPendiente && (!usarMag() || !esCero(magC))) {
    filtro.reiniciar(orientacionDesdeAcelMag(acel, magC));
    sembrarPendiente = false;
    return;
  }
  Vec3 giroC{giro.x - sesgoGiro.x, giro.y - sesgoGiro.y, giro.z - sesgoGiro.z};
  filtro.actualizar(giroC, acel, magC, dt);  // con magC = {0,0,0} usa 6 ejes
}

// Un ciclo de fusión (100 Hz): lectura, vigilancia, filtro, calibraciones y envío.
static void cicloFusion(uint32_t ahora) {
  Vec3 acel{0, 0, 0}, giro{0, 0, 0}, mag{0, 0, 0};
  bool ok = gy85.leer(acel, giro, mag);
  vigilarSensor(ok, ahora);

  uint32_t us = micros();
  float dt = (us - ultimoMicros) * 1e-6f;
  ultimoMicros = us;

  if (ok) {
    ultAcel = acel; ultGiro = giro; ultMag = mag;
    actualizarFiltro(giro, acel, mag, dt);
  }

  if (USAR_EMG && calibrando) {
    uint16_t emg[3];
    leerEmg(emg);
    reposoEmg.agregar(emg);
  }
  gestionarCalibracion(giro, acel, ok, ahora);
  gestionarMag(mag, ok, ahora);

  if (++ciclo >= CICLOS_POR_ENVIO) {
    ciclo = 0;
    if (transmitiendo) {
      ++seq;  // un hueco en seq señala la muestra perdida
      if (ok) enviarMuestra(ahora);
    }
  }
}

void setup() {
  Serial.begin(115200);
  // Los NACK de la detección de chips (direcciones que no existen) los imprime el controlador
  // I2C sin '#', y la interfaz los contaría como líneas malformadas. El firmware ya informa con '#'.
  esp_log_level_set("i2c.master", ESP_LOG_NONE);
  Wire.begin(PIN_SDA, PIN_SCL, I2C_HZ);
  cargarPreferencias();

  detectado = gy85.iniciar(Wire);
  if (detectado) {
    Serial.print("#Carpo ESP32 listo, magnetometro: ");
    Serial.println(gy85.nombreMagnetometro());
    if (!gy85.tieneMagnetometro()) Serial.println("#Sin magnetometro: rc puede derivar");
    evaluarMag();
  } else {
    Serial.println("#GY-85 no detectado");
  }

  uint32_t ahora = millis();
  proximaFusion = ahora + PERIODO_FUSION_MS;
  proximaBateria = ahora;
  proximoRaw = ahora + PERIODO_RAW_MS;
  ultimoMicros = micros();
}

void loop() {
  uint32_t ahora = millis();
  leerComandos(ahora);
  muestrearEmgCrudo(ahora);

  if ((int32_t)(ahora - proximaFusion) >= 0) {
    proximaFusion += PERIODO_FUSION_MS;
    if ((int32_t)(ahora - proximaFusion) > (int32_t)(5 * PERIODO_FUSION_MS)) {
      proximaFusion = ahora + PERIODO_FUSION_MS;  // atraso excesivo: resincroniza
    }
    cicloFusion(ahora);
  }

  if ((int32_t)(ahora - proximaBateria) >= 0) {
    proximaBateria += PERIODO_BAT_MS;
    if ((int32_t)(ahora - proximaBateria) > 0) proximaBateria = ahora + PERIODO_BAT_MS;
    enviarBateria();
  }

  if (enviandoRaw && (int32_t)(ahora - proximoRaw) >= 0) {
    proximoRaw = ahora + PERIODO_RAW_MS;
    enviarRaw();
  }
}
