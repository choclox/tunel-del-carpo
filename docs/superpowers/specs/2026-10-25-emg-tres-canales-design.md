# EMG de 3 canales: qué se mide y cómo se ve la mejora del músculo — Diseño

**Fecha:** 2026-10-25 · **Estado:** aprobado por partes en la conversación; pendiente de revisión del documento.

## Objetivo

Relacionar la rehabilitación con la **mejora del músculo**, usando un sensor EMG de 3 canales junto al GY-85 que ya mide el ángulo. La medida principal debe poder compararse entre sesiones y entre fases.

## Decisiones (tomadas con el usuario)

| Tema | Decisión |
|---|---|
| Canales y músculos | **EMG 1: eminencia tenar** (abductor corto y oponente del pulgar, inervados por el mediano). **EMG 2: flexores del antebrazo** (flexor radial del carpo y flexores de los dedos, cara anterior). **EMG 3: extensores del antebrazo** (extensor radial del carpo, cara posterior; no dependen del mediano: son el control). |
| Qué se mide | **Prueba de fuerza muscular fija** al final de cada sesión (opción A). Los 3 canales también se graban de fondo durante la rutina, pero la medida de mejora sale solo de la prueba. |
| Desde cuándo | **Desde la Fase 2** (semana 2). En la Fase 1 no hay prueba ni electrodos por la herida de la palma junto al tenar. La primera prueba de la Fase 2 es la línea base del paciente. |
| Sensor | Aún no elegido. El diseño acepta envolvente o señal cruda. Sugerencia: 3 × MyoWare 2.0 con salida ENV. |

## 1. Datos del dispositivo

**Protocolo serie** (compatible hacia atrás): la línea de datos admite 3 campos opcionales al final.

```
D,<seq>,<t_ms>,<fe>,<rc>,<mcf>,<emg1>,<emg2>,<emg3>
```

- `emg1` tenar, `emg2` flexores, `emg3` extensores. Enteros de **0 a 1000** ("unidades EMG"), ya sin la línea base de reposo.
- Una línea con 6 campos (firmware actual, plantilla) se procesa igual que hoy y la interfaz no ofrece la prueba EMG. Una línea con 9 campos marca la conexión como "con EMG".
- Campos EMG no numéricos o fuera de 0–1000: la línea cuenta como no válida (igual que hoy con los ángulos).
- No se convierte a µV: la mejora siempre es relativa a la línea base del mismo paciente.

**Firmware** (`firmware/carpo_esp32/`):

- `config.h`: `USAR_EMG` (por defecto `false`: comportamiento actual), `EMG_MODO` (`EMG_MODO_ENVOLVENTE` | `EMG_MODO_CRUDO`), `PINES_EMG = {0, 1, 3}` (ADC del ESP32-C6; evita GPIO 4 y 5 de arranque y GPIO 2 de la batería).
- `leerEMG()`: en envolvente, lee los 3 ADC y escala a 0–1000. En crudo, muestrea a 1000 Hz y entrega el RMS de los últimos 50 ms, escalado a 0–1000.
- `CAL` mide también el reposo de cada canal durante la calibración y lo resta en adelante (mínimo 0).
- La lógica de escalado, RMS y resta de reposo vive en `src/nucleo/` y se prueba en el PC como el resto del núcleo.

**Simulador** (`monitoreo.js`): genera los 3 canales (reposo ~20 ± 5). Cuando la prueba pide una contracción, el canal del músculo pedido sube a ~400–500, los otros a ~60–100 (co-contracción simulada). Durante la rutina, los ejercicios de flexión/puño/pelota activan flexores y los de extensión activan extensores, de forma moderada.

## 2. Prueba de fuerza muscular

- **Cuándo:** solo en rutinas de **Fase 2 y 3**, y solo si la conexión llega "con EMG". Al pulsar "Terminar rutina" se abre la ventana **"Prueba de fuerza muscular"** antes de "Rutina terminada". Botón **"Omitir prueba"** siempre visible: la sesión se guarda sin prueba.
- **Tres bloques, en este orden fijo:**
  1. **Pulgar (tenar):** "Separe el pulgar de la mano con fuerza contra la resistencia."
  2. **Flexores:** "Apriete la pelota (o el puño) con toda su fuerza."
  3. **Extensores:** "Lleve la muñeca hacia arriba con fuerza contra la resistencia."
- **Cada bloque, guiado por tiempo:** "Prepárese 3, 2, 1" → **"¡Fuerza!" 3 s** → **"Descanse" 5 s**, × 3 contracciones (unos 25 s por bloque, ~75 s en total). Barra de activación en vivo del canal del bloque.
- **Pico de una contracción:** el máximo del canal del bloque durante sus 3 s de "¡Fuerza!".
- **Resultado del bloque:** promedio de los 3 picos, y su cambio frente a la línea base ("Pulgar: 412 unidades (+18 % desde la primera prueba)"; en la primera prueba: "Primera prueba: será la referencia").
- **Contracción dudosa:** si un pico es < 70 % del promedio del bloque, aviso "Una contracción salió más débil que las otras" y botón **"Repetir este músculo"** (repite el bloque completo).
- **Se guarda en la sesión** (campo `emg`):

```json
"emg": {
  "prueba": {
    "tenar":      { "picos": [410, 425, 401], "media": 412 },
    "flexores":   { "picos": [...], "media": ..., "extensoresDuranteFlexores": 96 },
    "extensores": { "picos": [...], "media": ... }
  },
  "senal": { "fs": 10, "tenar": [...], "flexores": [...], "extensores": [...] }
}
```

  `extensoresDuranteFlexores` = promedio de los picos del canal de extensores durante las 3 contracciones del bloque de flexores (para la co-contracción). `senal` = los 3 canales durante la rutina, reducidos a ~10 Hz (como la señal cruda de los pasos sin medición). Sin prueba (Fase 1, omitida o sin EMG): `prueba` es `null`.

## 3. Medidas y dónde se ven

**Línea base:** la primera sesión del paciente (por fecha) con `emg.prueba` no nulo.

| Medida | Cálculo | Lectura |
|---|---|---|
| **Fuerza por músculo** | `media` de la sesión ÷ `media` de la línea base × 100 | % de la primera prueba (línea base = 100 %) |
| **Índice del nervio mediano** | (tenar ÷ extensores de la sesión) ÷ (tenar ÷ extensores de la línea base) × 100 | Medida principal. Sube si mejora el músculo del mediano más que el control. |
| **Co-contracción** | `extensoresDuranteFlexores` ÷ `flexores.media` × 100 | % ; si baja, menos compensación. |

Cualquier división por 0 o dato faltante da `null` y se muestra "—".

**Interfaz:**

- **Seguimiento › Resumen:** cuarta tarjeta **"Músculo"**: índice del nervio mediano de la última sesión con prueba y su cambio desde la línea base. Sin pruebas: "Sin prueba EMG (empieza en la Fase 2)". Nuevo plegable **"Fuerza muscular (EMG)"**: gráfica con 3 líneas (tenar, flexores, extensores) en % de la línea base por sesión; las sesiones sin prueba quedan como hueco.
- **Seguimiento › Una sesión:** tarjeta **"Prueba de fuerza muscular"** (3 músculos con sus 3 picos, promedio, % de la línea base y co-contracción); plegable **"Ver señal EMG"** con los 3 canales durante la rutina. Sin prueba: la tarjeta no aparece.
- **Avisos automáticos:** índice del nervio mediano baja más del **15 %** frente a la sesión anterior con prueba → "Atención". Co-contracción **> 30 %** → "Información". Ambos informativos, no diagnóstico.
- **Reporte › CSV:** columnas nuevas por sesión: `emg_tenar`, `emg_flexores`, `emg_extensores` (medias), `emg_tenar_pct`, `emg_flexores_pct`, `emg_extensores_pct`, `indice_mediano_pct`, `cocontraccion_pct`. Vacías si la sesión no tiene prueba.
- **Importar:** el campo `emg` es opcional; si viene, se valida (`prueba` null u objeto con los 3 músculos y `picos` como lista de 3 números). Documentado en el README.

## 4. Pruebas

- **Unidades (`node --test`):** módulo puro nuevo `emg.js` con: lectura de la línea `D` de 6 y 9 campos, pico de cada contracción, promedio, contracción dudosa (< 70 %), línea base, los 3 cálculos de la sección 3 (incluidos ceros y faltantes) y la validación del campo `emg` al importar.
- **Firmware (`firmware/pruebas/`):** escalado 0–1000, RMS de 50 ms y resta de reposo.
- **Navegador (`tests/ui/humo.mjs`), con el simulador:** rutina de Fase 2 → aparece la prueba → los 3 bloques → la sesión guardada tiene `emg.prueba`; "Omitir prueba" guarda sin prueba; rutina de Fase 1 no muestra la prueba; un simulador sin EMG (6 campos) no la muestra; la tarjeta "Músculo" y su gráfica aparecen en Resumen; las columnas EMG salen en el CSV.

## Fuera de alcance

- Elegir y comprar el sensor, y la colocación exacta de electrodos (la define el equipo con el profesional; el README describirá la sugerida).
- Convertir a µV o comparar entre pacientes.
- Calcular fatiga muscular (frecuencia media) u otras medidas espectrales.
- Usar el EMG para contar repeticiones (sigue siendo el ángulo).
- La validación en banco del EMG.
