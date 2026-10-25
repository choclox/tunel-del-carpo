// Diagnóstico: escanea el bus I2C con SDA/SCL en GPIO21/22 y también invertidos.
// Sin '#' a propósito: es solo para el monitor serie, no para la interfaz.
#include <Wire.h>
#include <esp_log.h>

static void nivelesReposo() {
  // Con pull-down interno (~45 k): solo leen 1 si hay un pull-up externo (el del GY-85, 4,7 k).
  pinMode(21, INPUT_PULLDOWN);
  pinMode(22, INPUT_PULLDOWN);
  delay(5);
  Serial.printf("Nivel con pull-down interno: GPIO21=%d GPIO22=%d  (1 = el GY-85 esta conectado y alimentado en ese pin)\n",
                digitalRead(21), digitalRead(22));
}

static void escanear(int sda, int scl) {
  Wire.begin(sda, scl, 100000);
  Serial.printf("SDA=GPIO%d SCL=GPIO%d:", sda, scl);
  int n = 0;
  for (uint8_t dir = 1; dir < 127; dir++) {
    Wire.beginTransmission(dir);
    if (Wire.endTransmission() == 0) { Serial.printf(" 0x%02X", dir); n++; }
  }
  Serial.println(n ? "" : " ningun dispositivo");
  Wire.end();
}

void setup() {
  Serial.begin(115200);
  esp_log_level_set("*", ESP_LOG_NONE);
}

void loop() {
  Serial.println("---");
  nivelesReposo();
  escanear(21, 22);
  escanear(22, 21);
  Serial.println("Esperado: 0x53 (ADXL345), 0x68 (ITG3205), 0x1E (HMC5883L) o 0x0D (QMC5883L)");
  delay(3000);
}
