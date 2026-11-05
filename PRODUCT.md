# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Profesionales de la rehabilitación (fisioterapeuta, terapeuta ocupacional, médico) que siguen la recuperación de pacientes operados de túnel del carpo. Su trabajo durante la sesión es guiar los ejercicios mirando al paciente; entre sesiones, revisar cómo evoluciona y decidir el siguiente paso.

## Product Purpose

Kinemo mide el movimiento de la muñeca y la actividad muscular durante la rehabilitación posquirúrgica, y le da al profesional un panel para seguir el avance del paciente entre sesiones. Nació como prototipo académico de Diseño Mecatrónico II (ITM, Medellín, 2026, brief DMR103-PBL-001).

Etapa actual: **validación en banco** con el dispositivo real y voluntarios. No se usa para tomar decisiones clínicas. Las metas de esta etapa, según el README, son error de ángulo ≤ 3° frente a goniómetro, conteo de repeticiones ≥ 95 % y 60 minutos de transmisión continua con menos de 1 % de datos perdidos.

## Positioning

Une en una sola sesión guiada lo que mide un wearable propio (ángulos de muñeca y EMG de tres canales) con los ejercicios en video de cada fase de rehabilitación, y lo convierte en un seguimiento legible por sesión.

## Operating Context

- **Durante la sesión:** el profesional está junto al paciente, con un portátil en la mesa y el dispositivo conectado por USB. Su atención está en la mano del paciente, no en la pantalla.
- **Flujo guiado:** Inicio → Chequeo → Dispositivo → Rutina → Prueba EMG → Cierre → Resumen.
- **Entre sesiones:** Seguimiento y Reporte; PDF por sesión y hoja imprimible para el paciente.
- **Navegador:** Chrome o Edge, necesarios para Web Serial.

## Capabilities and Constraints

- Panel web estático en JavaScript sin framework, publicado en GitHub Pages. Sin backend: los datos viven en `localStorage` del navegador.
- El login es una maqueta, sin cuentas reales.
- Hardware: ESP32, GY-85 y tres canales EMG (tenar, flexores, extensores), por protocolo serie de texto a 115200 baudios.
- Incluye un simulador para demostraciones. Sus datos nunca deben confundirse con mediciones reales.
- Los criterios clínicos (fases, umbrales de dolor y nombres de indicadores) los valida un profesional asesor. Cualquier cambio en ellos queda pendiente de su revisión.

**Sin decidir:** qué profesional actúa como asesor y si habrá un piloto clínico después de la validación en banco.

## Brand Commitments

Nombre: Kinemo. Logo en `img/kinemo-logo.jpg`. El producto se dirige al profesional en español, tratándolo de usted.

## Evidence on Hand

- Videos reales de los ejercicios en `videos/`.
- Datos de demostración en `data.js`: son pacientes ficticios y deben presentarse como tales.
- **No existen todavía** resultados de validación en banco. No se debe afirmar precisión medida, ni uso clínico, ni certificación: Kinemo no es un dispositivo médico certificado.

## Product Principles

1. **Lo real nunca se confunde con lo simulado.** Un dato inventado no puede pasar por medición ni influir en una lectura.
2. **Decide el profesional.** El sistema orienta, explica su motivo y deja constancia; no diagnostica.
3. **Nombrar lo que se mide, no lo que se quisiera medir.** Un indicador debe poder defenderse frente a un clínico.
4. **La sesión ocurre con los ojos en el paciente.** Lo importante debe captarse de un vistazo y a distancia de mesa.
5. **Decir lo que no se sabe.** Sin datos suficientes, el producto lo dice en lugar de tranquilizar.
