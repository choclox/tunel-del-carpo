#pragma once
#include <stdint.h>

// Vector de tres componentes (aggregate simple: Vec3{1,2,3}).
struct Vec3 { float x, y, z; };

// Decodifican 6 bytes crudos de cada sensor a unidades físicas.
Vec3 decodificarAdxl345(const uint8_t r[6]);   // g (little-endian, 3,9 mg/LSB)
Vec3 decodificarItg3205(const uint8_t r[6]);   // rad/s (big-endian, 14,375 LSB/(°/s))
Vec3 decodificarHmc5883l(const uint8_t r[6]);  // µT (bytes en orden X, Z, Y; 1090 LSB/G)
Vec3 decodificarQmc5883l(const uint8_t r[6]);  // µT (X, Y, Z little-endian; 3000 LSB/G)

// true si algún eje del HMC5883L vale -4096 (saturado).
bool hmcSaturado(const uint8_t r[6]);

// Montaje de ejes: el eje de salida i vale signo[i] * entrada[eje[i]] (0 = x, 1 = y, 2 = z).
struct Montaje { uint8_t eje[3]; int8_t signo[3]; };
constexpr Montaje MONTAJE_IDENTIDAD{{0, 1, 2}, {1, 1, 1}};

Vec3 aplicarMontaje(const Vec3& v, const Montaje& m);

// true si los tres componentes son exactamente cero (lectura ausente o chip en reposo).
bool esCero(const Vec3& v);

// Corrección del acelerómetro (después del montaje): (a - desfase) * escala, por eje.
Vec3 corregirAcel(const Vec3& a, const Vec3& desfase, const Vec3& escala);

// Huella distinta de cero que identifica un montaje (para invalidar calibraciones guardadas).
uint32_t huellaMontaje(const Montaje& m);
