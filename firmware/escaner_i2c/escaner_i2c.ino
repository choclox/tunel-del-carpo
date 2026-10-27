// Diagnóstico: escanea el bus I2C (SDA=GPIO21, SCL=GPIO22) y revisa el ITG3205.
// Sin '#' a propósito: es solo para el monitor serie, no para la interfaz.
#include <Wire.h>
#include <esp_log.h>

static bool leer(uint8_t dir, uint8_t reg, uint8_t* dest, uint8_t n) {
  Wire.beginTransmission(dir);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(dir, n) != n) return false;
  for (uint8_t i = 0; i < n; i++) dest[i] = Wire.read();
  return true;
}

static int escribir(uint8_t dir, uint8_t reg, uint8_t valor) {
  Wire.beginTransmission(dir);
  Wire.write(reg);
  Wire.write(valor);
  return Wire.endTransmission();
}

static void revisarGiro(uint8_t dir) {
  uint8_t who = 0, pwr = 0, div = 0, dlpf = 0, d[8];
  if (!leer(dir, 0x00, &who, 1)) { Serial.printf("ITG 0x%02X: no responde\n", dir); return; }
  leer(dir, 0x3E, &pwr, 1); leer(dir, 0x15, &div, 1); leer(dir, 0x16, &dlpf, 1);
  Serial.printf("ITG 0x%02X antes: WHO=0x%02X PWR=0x%02X DIV=0x%02X DLPF=0x%02X\n", dir, who, pwr, div, dlpf);
  int e0 = escribir(dir, 0x3E, 0x80);  // H_RESET
  delay(100);
  Serial.printf("ITG 0x%02X reset (err %d)\n", dir, e0);
  int e1 = escribir(dir, 0x3E, 0x01), e2 = escribir(dir, 0x15, 0x09), e3 = escribir(dir, 0x16, 0x1B);
  delay(60);
  leer(dir, 0x3E, &pwr, 1); leer(dir, 0x15, &div, 1); leer(dir, 0x16, &dlpf, 1);
  Serial.printf("ITG 0x%02X despues (err %d %d %d): PWR=0x%02X DIV=0x%02X DLPF=0x%02X\n", dir, e1, e2, e3, pwr, div, dlpf);
  if (leer(dir, 0x1B, d, 8)) {
    int16_t t = (d[0] << 8) | d[1], gx = (d[2] << 8) | d[3], gy = (d[4] << 8) | d[5], gz = (d[6] << 8) | d[7];
    Serial.printf("ITG 0x%02X datos crudos: temp=%d gx=%d gy=%d gz=%d\n", dir, t, gx, gy, gz);
  }
}

void setup() {
  Serial.begin(115200);
  esp_log_level_set("*", ESP_LOG_NONE);
  Wire.begin(21, 22, 100000);
}

void loop() {
  Serial.println("---");
  Serial.print("Dispositivos:");
  for (uint8_t dir = 1; dir < 127; dir++) {
    Wire.beginTransmission(dir);
    if (Wire.endTransmission() == 0) Serial.printf(" 0x%02X", dir);
  }
  Serial.println();
  revisarGiro(0x68);
  revisarGiro(0x69);
  uint8_t v = 0, id3[3] = {0, 0, 0};
  if (leer(0x68, 0x75, &v, 1)) Serial.printf("0x68 reg 0x75 (WHO_AM_I MPU-6050/6500=0x68/0x70): 0x%02X\n", v);
  if (leer(0x68, 0x6B, &v, 1)) Serial.printf("0x68 reg 0x6B (PWR_MGMT_1 MPU): 0x%02X\n", v);
  if (leer(0x0E, 0x07, &v, 1)) Serial.printf("0x0E reg 0x07 (WHO_AM_I MAG3110=0xC4): 0x%02X\n", v);
  if (leer(0x0D, 0x0D, &v, 1)) Serial.printf("0x0D reg 0x0D (QMC5883L=0xFF): 0x%02X\n", v);
  if (leer(0x1E, 0x0A, id3, 3)) Serial.printf("0x1E reg 0x0A (HMC5883L='H43'): %c%c%c\n", id3[0], id3[1], id3[2]);
  delay(4000);
}
