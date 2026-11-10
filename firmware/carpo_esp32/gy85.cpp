#include "gy85.h"
#include "config.h"

namespace {
constexpr uint8_t DIR_ADXL = 0x53;
constexpr uint8_t DIR_HMC = 0x1E;
constexpr uint8_t DIR_QMC = 0x0D;
// Cada cuántas lecturas (100 Hz -> ~1 s) se relee la configuración: un corte breve de VCC
// devuelve los chips a sus valores por defecto sin que falle el I2C.
constexpr uint8_t LECTURAS_POR_VERIFICACION = 100;
// Lecturas en cero del ADXL345 que se toleran tras configurarlo (aún no tiene una conversión).
// Debe quedar por debajo de las 5 fallas seguidas con que VigilanteSensor da el sensor por perdido.
constexpr uint8_t GRACIA_ADXL = 3;
// Intentos de la comprobación del ITG3205 (configuración y temperatura), 10 ms entre ellos.
constexpr uint8_t INTENTOS_GIRO = 5;
}  // namespace

bool Gy85::escribir(uint8_t dir, uint8_t reg, uint8_t valor) {
  wire_->beginTransmission(dir);
  wire_->write(reg);
  wire_->write(valor);
  return wire_->endTransmission() == 0;
}

bool Gy85::leerBytes(uint8_t dir, uint8_t reg, uint8_t* dest, uint8_t n) {
  wire_->beginTransmission(dir);
  wire_->write(reg);
  if (wire_->endTransmission(false) != 0) return false;
  if (wire_->requestFrom(dir, n) != n) return false;
  for (uint8_t i = 0; i < n; i++) dest[i] = wire_->read();
  return true;
}

bool Gy85::iniciar(TwoWire& wire) {
  wire_ = &wire;
  iniciado_ = false;
  tieneGiro_ = false;   // un inicio fallido no deja un giroscopio de antes
  lecturas_ = 0;
  tipoMag_ = TipoMag::Ninguno;

  // ADXL345
  uint8_t id = 0;
  if (!leerBytes(DIR_ADXL, 0x00, &id, 1) || id != 0xE5) return false;
  if (!escribir(DIR_ADXL, 0x2C, 0x0A)) return false;   // BW_RATE 100 Hz
  if (!escribir(DIR_ADXL, 0x31, 0x0B)) return false;   // resolución completa, ±16 g
  if (!escribir(DIR_ADXL, 0x2D, 0x08)) return false;   // medición

  // ITG3205: 0x68 o 0x69 (se omite con USAR_GIROSCOPIO = false). Un módulo con el chip dañado
  // puede responder al I2C y aun así no funcionar: se comprueba que conserve la configuración
  // y que dé una temperatura distinta de cero. Si no pasa, se sigue sin giroscopio.
  gracia_ = GRACIA_ADXL;
  if (USAR_GIROSCOPIO) {
    uint8_t quien = 0;
    bool responde = true;
    if (leerBytes(0x68, 0x00, &quien, 1)) dirGiro_ = 0x68;
    else if (leerBytes(0x69, 0x00, &quien, 1)) dirGiro_ = 0x69;
    else responde = false;
    if (responde && escribir(dirGiro_, 0x3E, 0x01) &&   // PLL con giro X
        escribir(dirGiro_, 0x15, 0x09) &&               // 100 Hz
        escribir(dirGiro_, 0x16, 0x1B)) {               // ±2000 °/s, DLPF 42 Hz
      // Hasta INTENTOS_GIRO comprobaciones (≤ ~50 ms): la primera conversión puede tardar.
      for (uint8_t i = 0; i < INTENTOS_GIRO && !tieneGiro_; i++) {
        delay(10);
        uint8_t dlpf = 0, temp[2] = {0, 0};
        if (leerBytes(dirGiro_, 0x16, &dlpf, 1) && dlpf == 0x1B &&
            leerBytes(dirGiro_, 0x1B, temp, 2) && (temp[0] != 0 || temp[1] != 0)) {
          tieneGiro_ = true;
        }
      }
    }
  }

  // Magnetómetro: primero HMC5883L, luego QMC5883L
  uint8_t ident[3] = {0, 0, 0};
  if (leerBytes(DIR_HMC, 0x0A, ident, 3) && ident[0] == 'H' && ident[1] == '4' && ident[2] == '3') {
    if (escribir(DIR_HMC, 0x00, 0x18) && escribir(DIR_HMC, 0x01, 0x20) &&
        escribir(DIR_HMC, 0x02, 0x00)) {
      tipoMag_ = TipoMag::Hmc;
    }
  } else {
    uint8_t chip = 0;
    if (leerBytes(DIR_QMC, 0x0D, &chip, 1) && chip == 0xFF) {
      if (escribir(DIR_QMC, 0x0B, 0x01) && escribir(DIR_QMC, 0x09, 0x1D)) {
        tipoMag_ = TipoMag::Qmc;
      }
    }
  }
  iniciado_ = true;
  return true;
}

// POWER_CTL del ADXL345 en medición y DLPF_FS del ITG3205 como se configuraron.
bool Gy85::configuracionIntacta() {
  uint8_t potencia = 0, dlpf = 0;
  if (!leerBytes(DIR_ADXL, 0x2D, &potencia, 1) || potencia != 0x08) return false;
  return !tieneGiro_ || (leerBytes(dirGiro_, 0x16, &dlpf, 1) && dlpf == 0x1B);
}

bool Gy85::leer(Vec3& acel, Vec3& giro, Vec3& mag) {
  if (!wire_ || !iniciado_) return false;
  if (++lecturas_ >= LECTURAS_POR_VERIFICACION) {
    lecturas_ = 0;
    if (!configuracionIntacta()) { iniciado_ = false; return false; }
  }
  uint8_t r[7];
  if (!leerBytes(DIR_ADXL, 0x32, r, 6)) { iniciado_ = false; return false; }
  Vec3 a = decodificarAdxl345(r);
  if (esCero(a)) {
    // Las primeras lecturas tras configurar pueden ser cero: no cuentan como sensor perdido.
    if (gracia_ > 0) { gracia_--; return false; }
    iniciado_ = false;   // ADXL345 en reposo tras un corte
    return false;
  }
  gracia_ = 0;
  acel = corregirAcel(aplicarMontaje(a, MONTAJE_ACEL), desfase_, escala_);
  giro = Vec3{0, 0, 0};
  if (tieneGiro_) {
    if (!leerBytes(dirGiro_, 0x1D, r, 6)) { iniciado_ = false; return false; }
    giro = aplicarMontaje(decodificarItg3205(r), MONTAJE_GIRO);
  }

  mag = Vec3{0, 0, 0};
  if (tipoMag_ == TipoMag::Hmc) {
    if (leerBytes(DIR_HMC, 0x03, r, 6) && !hmcSaturado(r)) {
      mag = aplicarMontaje(decodificarHmc5883l(r), MONTAJE_MAG);
    }
  } else if (tipoMag_ == TipoMag::Qmc) {
    // Datos 0x00-0x05 y STATUS 0x06 (bit 1 = OVL, desbordamiento)
    if (leerBytes(DIR_QMC, 0x00, r, 7) && (r[6] & 0x02) == 0) {
      mag = aplicarMontaje(decodificarQmc5883l(r), MONTAJE_MAG);
    }
  }
  return true;
}

const char* Gy85::nombreMagnetometro() const {
  switch (tipoMag_) {
    case TipoMag::Hmc: return "HMC5883L";
    case TipoMag::Qmc: return "QMC5883L";
    default: return "ninguno";
  }
}

const char* Gy85::codigoMagnetometro() const {
  switch (tipoMag_) {
    case TipoMag::Hmc: return "HMC";
    case TipoMag::Qmc: return "QMC";
    default: return "";
  }
}
