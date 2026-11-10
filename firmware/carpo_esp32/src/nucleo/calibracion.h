#pragma once
#include <stdint.h>
#include "gy85_datos.h"

enum class EstadoCal { Inactivo, Midiendo, Convergiendo, Listo, Error };

// La quietud se juzga con promedios de bloques de MUESTRAS_BLOQUE muestras consecutivas
// (100 ms a 100 Hz), no con muestras sueltas: el ruido real del GY-85 (σ ≈ 0,015 g y
// ≈ 0,007 rad/s) vence umbrales por muestra. Los tiempos se siguen midiendo por muestra.
const uint8_t MUESTRAS_BLOQUE = 10;

// Acumula muestras de a una y entrega el promedio cuando el bloque se completa.
struct Bloque {
  Vec3 suma{0, 0, 0};
  uint8_t n = 0;
  void vaciar() { suma = {0, 0, 0}; n = 0; }
  // true si esta muestra completó el bloque; deja el promedio en 'media' y vacía.
  bool agregar(const Vec3& v, Vec3& media);
};

// Calibración del cero del giroscopio: exige quietud sostenida. Por muestra: módulo del
// acelerómetro razonable y giroscopio a < 0,35 rad/s de la primera muestra (descarta golpes
// al instante, tolera el temblor de la mano). Por bloque: promedios de acel (< 0,05 g) y
// giro (< 0,07 rad/s) cerca del primer bloque de la ventana.
class Calibrador {
 public:
  void iniciar(uint32_t tMs);
  EstadoCal agregar(const Vec3& giroCrudo, const Vec3& acel, uint32_t tMs);
  EstadoCal estado() const { return estado_; }
  Vec3 sesgoGiro() const { return sesgo_; }
  uint32_t duracionMs() const { return duracion_; }
  const char* motivo() const { return motivo_; }
  // true en los últimos ASENTAMIENTO_MS de Convergiendo: el filtro vuelve a beta normal
  // para que qCal no se tome con el filtro vibrando a beta alta.
  bool asentando(uint32_t tMs) const;

 private:
  void nuevaVentana();
  EstadoCal estado_ = EstadoCal::Inactivo;
  uint32_t inicio_ = 0, inicioVentana_ = 0, duracion_ = 0;
  bool hayReferencia_ = false, hayBloqueRef_ = false;
  Vec3 referencia_{0, 0, 0}, suma_{0, 0, 0}, sesgo_{0, 0, 0};
  Vec3 acelRef_{0, 0, 0}, giroRef_{0, 0, 0};   // promedios del primer bloque de la ventana
  Bloque bloqueAcel_, bloqueGiro_;
  uint32_t n_ = 0;
  const char* motivo_ = "";
};

// Calibración hard-iron del magnetómetro: desfase = (máx + mín) / 2.
class CalibradorMag {
 public:
  void iniciar();
  void agregar(const Vec3& mag);
  bool valido() const;
  Vec3 desfase() const;

 private:
  bool hay_ = false;
  Vec3 min_{0, 0, 0}, max_{0, 0, 0};
};

// Detecta la pérdida del sensor por lecturas I2C fallidas seguidas.
class VigilanteSensor {
 public:
  void registrar(bool lecturaOk, uint32_t tMs);
  bool perdido() const { return perdido_; }
  bool debeReintentar(uint32_t tMs);

 private:
  uint8_t fallas_ = 0;
  bool perdido_ = false, huboReintento_ = false;
  uint32_t ultimoReintento_ = 0;
};

// Calibración del acelerómetro en 6 posiciones quietas: desfase y escala por eje.
// Quieta = rango por eje de los promedios de bloque de la ventana < 0,05 g; la cara se
// captura al completar un bloque con la ventana de al menos 1 s (promedio de todas sus muestras).
// Caras como bits: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z.
class CalibradorAcel {
 public:
  void iniciar(uint32_t tMs);
  // true si esta muestra completó la captura de una cara nueva.
  bool agregar(const Vec3& acelSinCorregir, uint32_t tMs);
  uint8_t caras() const { return caras_; }
  bool completo() const { return caras_ == 0x3F; }
  bool vencido(uint32_t tMs) const;
  Vec3 desfase() const;   // válido solo si completo()
  Vec3 escala() const;    // válido solo si completo()
  static const char* nombreCara(uint8_t i);

 private:
  void reiniciarVentana();
  uint8_t caras_ = 0;
  uint32_t inicio_ = 0, inicioVentana_ = 0, n_ = 0;
  bool hayVentana_ = false;
  float suma_[3] = {0, 0, 0}, min_[3] = {0, 0, 0}, max_[3] = {0, 0, 0};   // min/max de bloques
  Bloque bloque_;
  float valor_[6] = {0, 0, 0, 0, 0, 0};   // promedio del eje dominante por cara
};

// Sesgo del giroscopio en reposo: se aprende solo con la mano quieta (giroscopio y
// acelerómetro estables) durante al menos 2 s. La quietud se juzga por bloque (rango de
// promedios de acel < 0,03 g y promedio de giro a < 0,025 rad/s del sesgo); un golpe grande
// de giroscopio (≥ 0,35 rad/s) corta la ventana al instante. Con la ventana quieta, el rango
// de acel se vuelve a sembrar cada 2 s para que el ruido no corte un reposo largo.
// El sesgo se actualiza muestra a muestra. Un hueco de más de 50 ms entre muestras (CAL en
// curso, sensor perdido) también reinicia la ventana: la quietud de antes ya no vale.
// Ancla: el sesgo medido por el último CAL (fijar con esAncla = true). Con ancla, el sesgo no
// se aparta más de 0,015 rad/s por eje de ella, para que un giro lento sostenido no se aprenda
// sin límite; sin ancla (antes del primer CAL o tras reiniciar()) no hay límite.
class EstimadorSesgo {
 public:
  explicit EstimadorSesgo(float alfa = 0.002f) : alfa_(alfa) {}
  // Fija el sesgo y reinicia la ventana. esAncla = true: el sesgo viene de un CAL y pasa a ser
  // el ancla (y el estimador deja de ser confiable hasta volver a estar quieto); false: conserva
  // el ancla, p. ej. fijar(sesgo()) solo reinicia la ventana.
  void fijar(const Vec3& sesgo, bool esAncla = false);
  // Sesgo {0,0,0}, sin ancla y sin confianza (p. ej. al cambiar el modo del giroscopio).
  void reiniciar();
  void agregar(const Vec3& giroCrudo, const Vec3& acel, uint32_t tMs);
  Vec3 sesgo() const { return sesgo_; }
  bool quieto() const { return quieto_; }
  // true si hay ancla y desde que se fijó el estimador estuvo quieto al menos una vez.
  bool confiable() const { return confiable_; }

 private:
  void limitarAlAncla();
  float alfa_;
  Vec3 sesgo_{0, 0, 0}, ancla_{0, 0, 0};
  bool hayAncla_ = false, confiable_ = false;
  bool hayUltima_ = false;
  uint32_t ultimaMs_ = 0;   // tiempo de la muestra anterior, para detectar huecos
  bool hayVentana_ = false, quieto_ = false;
  uint32_t inicioVentana_ = 0;
  float min_[3] = {0, 0, 0}, max_[3] = {0, 0, 0};   // min/max de promedios de bloque
  Bloque bloqueAcel_, bloqueGiro_;
  bool hayBloque_ = false;
  uint8_t bloques_ = 0;   // bloques completos desde la última siembra del rango de acel
};

// CAL puede aprender como sesgo un giro lento y constante. Si el estimador tiene un sesgo
// confiable (aprendido en reposo desde el último CAL), el sesgo del CAL nuevo debe estar a
// ≤ 0,05 rad/s de él en cada eje; sin sesgo confiable siempre es coherente.
bool sesgoCalCoherente(const Vec3& sesgoCal, const Vec3& sesgoEstimador, bool estimadorConfiable);

// Corrección del acelerómetro leída de NVS: finita, escala en [0,8, 1,2] y |desfase| < 0,3 g por eje.
bool correccionAcelValida(const Vec3& desfase, const Vec3& escala);
