# Interfaz del profesional — Seguimiento de rehabilitación (túnel del carpo)

Panel web local en el que el fisioterapeuta, terapeuta o médico revisa y analiza la evolución del paciente entre sesiones (brief DMR103-PBL-001, objetivo específico 4).

## Cómo abrirla

Desde esta carpeta:

```bash
python -m http.server 8765
```

Luego abra `http://localhost:8765` en **Google Chrome o Microsoft Edge**. Son los navegadores que permiten conectar el dispositivo USB. Necesita internet la primera vez para cargar Chart.js desde el CDN.

> Si inicia el servidor desde la carpeta superior, la dirección es `http://localhost:8765/interfaz-medico/`.

## Qué incluye

| Pestaña | Contenido |
|---|---|
| **Evolución** | Rango de movimiento máximo por sesión para 5 ejercicios, en grados o como % del valor de referencia. Indicador seleccionable: cumplimiento, dolor EVA, velocidad, variabilidad o duración. Observaciones automáticas informativas. |
| **Detalle de sesión** | Tabla por ejercicio (repeticiones, ángulo máximo, cambio frente a la sesión anterior, velocidad, variabilidad). Calidad de la sesión (calibración ≤ 30 s, pérdida de datos < 1 %) y señal angular con las repeticiones detectadas. Si la sesión se grabó desde la rutina, muestra la tarjeta **Rutina: Fase N** con cada ejercicio grabado (objetivo, repeticiones detectadas, conteo manual, duración y la marca *Medido*). |
| **Comparar sesiones** | Dos sesiones cualesquiera lado a lado, con gráfica y tabla de diferencias. |
| **Historial y notas** | Todas las sesiones, notas clínicas por sesión y exportación a CSV. |
| **Monitoreo en vivo** | Rutina de ejercicios por etapa del tratamiento (Fase 1, 2 o 3), sugerida según las semanas desde la cirugía y modificable por el profesional. **Revisar rutina** muestra cada ejercicio con su video (o "Video no adjuntado"), repeticiones y mensajes de cuidado. **Iniciar rutina** abre "¿Listos para empezar?" (conexión y calibración) y luego graba ejercicio por ejercicio, con los datos del dispositivo asociados al ejercicio en curso. Si no hay dispositivo conectado se usa el simulador y la sesión queda marcada como simulada. Al terminar, la ventana "Rutina terminada" pide dolor EVA, notas y conteos manuales, y guarda la sesión en el historial. También muestra la conexión, la calibración y la señal en tiempo real. |

Los datos se guardan en el navegador (`localStorage`). Use **Exportar datos** para respaldarlos.

## Formato de archivo de sesión (lo que debe generar el dispositivo o el software de adquisición)

**Importar sesión** acepta un `.json` con esta estructura:

```json
{
  "pacienteId": "P-001",
  "sesion": {
    "fecha": "2026-10-01",
    "duracionMin": 22,
    "calibracion": { "tiempoS": 14.2, "ok": true },
    "perdidaDatosPct": 0.3,
    "dolorEVA": 3,
    "ejercicios": [
      {
        "tipo": "flexion",
        "repeticionesObjetivo": 10,
        "repeticiones": 10,
        "anguloMax": 62.4,
        "anguloMin": 1.2,
        "velocidadMedia": 41.0,
        "variabilidadPct": 3.1,
        "duracionS": 48,
        "senal": { "fs": 50, "angulos": [1.2, 1.5, 2.1] }
      }
    ]
  }
}
```

- Campos obligatorios por ejercicio: `tipo`, `repeticiones`, `repeticionesObjetivo`, `anguloMax`. Los demás son opcionales; si faltan, se muestran como "—" y no entran en los promedios.
- Valores de `tipo`: `flexion`, `extension`, `desv_radial`, `desv_cubital`, `puno`. Se configuran en `EJERCICIOS` dentro de [data.js](data.js).
- `senal` (opcional): la señal angular cruda en grados a `fs` Hz. Si no viene, la gráfica muestra una señal representativa reconstruida a partir de los indicadores, y lo indica en pantalla.
- `origen` (lo agrega el panel al guardar desde la rutina): `"usb"` o `"simulador"`. Las sesiones del simulador se marcan en el detalle.
- `rutina` (opcional, lo agrega el panel al guardar desde la rutina): `{ "etapa": 1, "pasos": [ ... ] }`. `etapa` es 1, 2 o 3 y `pasos` debe ser una lista (al importar se rechaza si no). Cada paso grabado tiene `id`, `nombre`, `tipo` (clave de `EJERCICIOS` o `null` si no se mide), `repeticionesObjetivo`, `repeticiones` (detectadas; `null` si no se midió), `repeticionesManual` (o `null`) y `duracionS`. Los pasos sin medición incluyen `senal: { fs, fe, rc, mcf }` con la señal cruda de los 3 canales reducida a ~10 Hz (`fs` indica la frecuencia efectiva). Los pasos medidos aparecen además en `ejercicios`. Las sesiones sin `rutina` se muestran igual que antes.
- También se aceptan `"sesiones": [ ... ]` para importar varias sesiones a la vez, o un respaldo completo con `"pacientes": [ ... ]`.

## Monitoreo en vivo

Flujo: **Elegir etapa → Iniciar rutina → ¿Listos para empezar? (conexión y calibración) → ejercicio por ejercicio → Rutina terminada → Guardar sesión**.

La rutina es el único lugar donde se graba una sesión. Se pasa al ejercicio siguiente con un botón; con "Anterior" se puede volver a grabar un ejercicio, y el nuevo registro reemplaza al anterior. Si se cierra la ventana durante la grabación, se pregunta si terminar la rutina; lo ya grabado se puede guardar.

- **Origen.** Elija *Dispositivo USB* para el prototipo real: el navegador pedirá elegir el puerto COM. Elija *Simulador* para probar sin hardware. Las sesiones del simulador quedan marcadas como tales.
- **Indicadores de comunicación.** Muestran la frecuencia de muestreo, la pérdida de datos (criterio < 1 %, calculada con el número de secuencia) y el tiempo desde el último dato (criterio ≤ 0,5 s). La pantalla se actualiza cada 100 ms.
- **Calibración.** Se mide desde que la PC envía `CAL` hasta que el dispositivo responde `CAL,OK`. Si pasa de 30 s, se marca como fallida. No se puede iniciar un ejercicio sin calibración válida.
- **Conteo automático.** Detecta cada repetición con umbrales con histéresis, relativos a la posición de reposo al iniciar el ejercicio. Los umbrales se adaptan a la amplitud de las repeticiones anteriores. La línea punteada de la gráfica muestra el umbral.
- **Conteo manual.** Escríbalo en la ventana "Rutina terminada" para calcular la exactitud del conteo automático (criterio ≥ 95 %). Sirve como evidencia para las pruebas FAT y SAT.
- **Ejercicios medidos y sin medir.** Los ejercicios de la rutina con `tipo` (flexión, extensión, desviaciones, puño) se miden y cuentan repeticiones con el detector. Los demás guardan la señal cruda de los 3 canales y su conteo es solo manual.
- **Al guardar,** la sesión incluye la señal cruda, los picos detectados y el registro de la rutina (campo `rutina`), y aparece en Evolución, Detalle, Comparar e Historial. Una sesión puede guardarse aunque ningún ejercicio grabado sea medido; en ese caso sus indicadores de movimiento se muestran como "—".

### Protocolo serie (115200 baudios, texto, una línea por mensaje)

| Sentido | Mensaje | Significado |
|---|---|---|
| Dispositivo → PC | `D,<seq>,<t_ms>,<fe>,<rc>,<mcf>` | Muestra (~50 Hz). `seq` es un contador creciente, `t_ms` el tiempo del dispositivo. Los ángulos van en grados: `fe` flexo-extensión (+flexión/−extensión), `rc` desviación (+radial/−cubital), `mcf` flexión de dedos. |
| Dispositivo → PC | `CAL,OK,<ms>` / `CAL,ERR,<motivo>` | Resultado de la calibración. |
| Dispositivo → PC | `BAT,<pct>` | Batería (opcional). |
| Dispositivo → PC | `#texto` | Depuración (se ignora). |
| PC → Dispositivo | `START` / `STOP` | Iniciar o detener la transmisión. |
| PC → Dispositivo | `CAL` | Calibrar (posición neutra = 0°). |
| PC → Dispositivo | `EJ,<tipo>,<objetivo>` / `EJ,-` | Ejercicio en curso (informativo). |

[firmware/plantilla_protocolo/plantilla_protocolo.ino](firmware/plantilla_protocolo/plantilla_protocolo.ino) implementa este protocolo para Arduino y ESP32. Solo hay que reemplazar `leerAngulosCrudos()` por la lectura real de los sensores. Mientras tanto envía una señal de prueba. Cierre el monitor serie del IDE de Arduino antes de conectar desde la interfaz, porque el puerto solo admite un programa a la vez.

Si sus sensores miden otros ejes, ajuste `canal` y `signo` de cada ejercicio en `EJERCICIOS` ([data.js](data.js)).

### Firmware real (ESP32 + GY-85)

[firmware/carpo_esp32/](firmware/carpo_esp32/) implementa el protocolo con un ESP32 y un solo GY-85 sujeto al dorso de la mano, con el antebrazo apoyado e inmóvil. `mcf` se envía siempre como 0, porque todavía no se mide.

- **Comandos de preparación (además de los del protocolo).** Se envían desde el monitor serie del IDE de Arduino (115200 baudios, con salto de línea) y hay que cerrarlo antes de conectar la interfaz, porque el puerto solo admite un programa a la vez. `MAG`: gire la mano en todas las direcciones durante unos 20 s para calibrar el magnetómetro; responde `#MAG,OK,...` o `#MAG,ERR,...` (`#MAG,ERR,sensor` si el GY-85 no responde) y el resultado queda guardado junto con el chip y el montaje. Repita `MAG` si cambia `MONTAJE_MAG` o la placa: mientras no haya un `MAG` válido para ese chip y montaje, el firmware usa fusión de 6 ejes (sin magnetómetro) y lo avisa al arrancar con `#Magnetometro sin calibrar: envie MAG`. `RAW`: activa o desactiva la salida `#RAW,...` a 5 Hz para comprobar los ejes. `MANO,D` / `MANO,I`: mano derecha o izquierda (queda guardado).
- **Comprobar los ejes con `RAW`.** Cada línea es `#RAW,ax,ay,az,gx,gy,gz,mx,my,mz,incl`: aceleración (g), giro (rad/s), campo magnético montado (µT) e `incl`, el ángulo entre la aceleración y el campo con el desfase de `MAG` restado (grados). Gire la mano alrededor de X (hacia los dedos) en sentido antihorario visto desde los dedos: `gx` debe ser positivo; si es negativo, corrija el signo en `MONTAJE_GIRO`. Después de `MAG`, `incl` debe mantenerse constante (± unos grados) en cualquier posición de la mano; si cambia al girarla, `MONTAJE_MAG` no coincide con `MONTAJE_ACEL`.
- **Desfase del acelerómetro.** El ADXL345 puede tener hasta ±0,15 g de desfase en Z (0,1 g da casi 5° de error a 60°). Con `RAW`, ponga cada eje hacia arriba y hacia abajo, quieto, y anote su valor máximo y mínimo: `desfase = (max + min) / 2` y `escala = 2 / (max − min)`. Escríbalos en `DESFASE_ACEL` y `ESCALA_ACEL` de `config.h` (por defecto `{0, 0, 0}` y `{1, 1, 1}`) y vuelva a cargar el firmware.
- **Mensajes al conectar.** Si la placa se reinicia al abrir el puerto, el texto de arranque de la ROM del ESP32 puede llegar como unas pocas líneas no válidas; es normal. Tras recuperar el sensor sin magnetómetro calibrado, o tras un `MAG`, el firmware envía `#Recalibre`: repita `CAL`.
- **Conexiones.** GY-85 VCC_IN a 3V3, GND a GND, SDA a GPIO21 y SCL a GPIO22, con una resistencia de 10 kΩ de SDA a 3V3 y otra de SCL a 3V3 (el GY-85 usado no trae pull-up en SDA). Todo se alimenta por el USB del PC: no hay batería y `MEDIR_BATERIA` está en `false`, así que el dispositivo no envía `BAT`. En la ESP32-C6 no use GPIO4, 5, 8, 9 ni 15 (pines de arranque).
- **Compilar.** Placa `esp32:esp32:esp32c6` (ESP32C6 Dev Module) con el core esp32 3.2.0, desde el IDE de Arduino o con `arduino-cli`. Conecte el cable al puerto USB marcado **UART**; si usa el puerto **USB** nativo, active *USB CDC On Boot: Enabled* en el menú Herramientas.
- **Opciones en `config.h`.** `TRANSMITIR_AL_ARRANCAR`: póngala en `true` si la placa se reinicia cuando el navegador abre el puerto y no llegan datos. `USAR_MAGNETOMETRO`: desactiva el magnetómetro en el filtro. `MONTAJE_*` define la orientación de los ejes de cada sensor.
- **Pruebas en el PC.** Una sola vez `python -m pip install ziglang==0.13.0`; luego `python firmware/pruebas/correr.py`.
- **Pendiente.** La validación en banco todavía no se ha hecho. Son dos criterios separados: exactitud, con error ≤ 3° frente a un goniómetro; y estabilidad, 60 min seguidos sin reinicios con pérdida de datos < 1 %.

## Archivos

- `index.html`: estructura de la interfaz.
- `styles.css`: estilos, con modo claro y oscuro.
- `data.js`: catálogo de ejercicios, datos de demostración y señal.
- `app.js`: lógica, gráficas, importación y exportación.
- `monitoreo.js`: monitoreo en vivo (puerto serie, simulador, conteo de repeticiones).
- `rutinas.js`: contenido de las rutinas por etapa (ejercicios, repeticiones, cuidados) y funciones puras con pruebas.
- `rutina.js`: ventanas de la rutina (revisión y grabación), "¿Listos para empezar?" y "Rutina terminada".
- `videos/`: un `.mp4` por ejercicio de la rutina (ver [videos/LEEME.md](videos/LEEME.md)).
- `firmware/plantilla_protocolo/`: plantilla de firmware con el protocolo.
- `firmware/carpo_esp32/`: firmware real para ESP32 + GY-85 (`carpo_esp32.ino`, `config.h`, `gy85.*` y `src/nucleo/`).
- `firmware/pruebas/`: pruebas del núcleo del firmware en el PC (`correr.py`, `test_*.cpp`).

Pruebas (necesita Node): desde esta carpeta, `node --test`.

> Prototipo académico. No es un dispositivo médico certificado. Complementa, pero no sustituye, el criterio clínico del profesional.
