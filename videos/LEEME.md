# Videos de la rutina de ejercicios

Esta carpeta guarda un video por ejercicio. La interfaz los muestra en bucle en la ventana de la rutina, que se abre desde la sección **Ejercicios** (botones **Ver videos**, dentro de "Ver los ejercicios de esta fase", y **Empezar rutina**).

El video de cada ejercicio es `videos/<id>.mp4`, donde `<id>` es el identificador del paso en la rutina. Si el archivo no existe, la ventana muestra "Video no adjuntado". Un mismo ejercicio puede aparecer en varias etapas y usa el mismo video.

| Archivo | Ejercicio | Fase | Video |
|---|---|---|---|
| `tendon_recto.mp4` | Deslizamiento tendinoso: mano recta | 1 | Adjunto |
| `puno_gancho.mp4` | Deslizamiento tendinoso: puño en gancho | 1 | Adjunto |
| `puno_completo.mp4` | Deslizamiento tendinoso: puño completo (Fase 2: Puño completo) | 1, 2 | Adjunto |
| `mesa.mp4` | Deslizamiento tendinoso: posición de mesa | 1 | Adjunto |
| `puno_recto.mp4` | Deslizamiento tendinoso: puño recto | 1 | Adjunto |
| `pulgar_oposicion.mp4` | Oposición del pulgar | 1 | Adjunto |
| `nervio_mediano.mp4` | Deslizamiento del nervio mediano | 1 | Adjunto |
| `flexion.mp4` | Flexión de muñeca | 2 | Adjunto |
| `extension.mp4` | Extensión de muñeca | 2 | Adjunto |
| `desv_radial.mp4` | Desviación radial | 2 | Adjunto (grabado con el antebrazo vertical y el dorso de la mano a la cámara; la rutina pide la mano de canto) |
| `desv_cubital.mp4` | Desviación cubital | 2 | Adjunto (grabado con el antebrazo vertical y el dorso de la mano a la cámara; la rutina pide la mano de canto) |
| `pronacion.mp4` | Pronación de antebrazo | 2 | Adjunto |
| `supinacion.mp4` | Supinación de antebrazo | 2 | Adjunto |
| `pulgar_abduccion.mp4` | Abducción del pulgar | 2 | Adjunto |
| `pelota.mp4` | Apretar pelota terapéutica | 3 | Adjunto |
| `pinza.mp4` | Pinza pulgar-índice | 3 | Adjunto |
| `extension_carga.mp4` | Extensión de muñeca con peso ligero | 3 | Adjunto |
| `flexion_carga.mp4` | Flexión de muñeca con peso ligero | 3 | Adjunto |
| `pronosup_martillo.mp4` | Prono-supinación con martillo | 3 | Adjunto |

**Formato:** `.mp4` (H.264), sin audio. Conviene que empiece y termine en la misma posición para que el bucle no se note. Cualquier proporción sirve: el video se ajusta a la ventana sin recortarse.

**Dónde está el contenido de las rutinas:** las etapas, sus ejercicios, repeticiones, tiempos de sostén, indicaciones y mensajes de cuidado están en `ETAPAS`, en [rutinas.js](../rutinas.js). Para adjuntar un video basta con copiarlo aquí con el nombre `<id>.mp4` de la tabla. Para agregar un ejercicio, añada un paso a la etapa en `rutinas.js` con un `id` sin espacios ni tildes y, si existe, copie su video aquí. El campo `medicion` de cada paso dice cómo se cuenta: con el sensor de movimiento (`{ fuente: 'imu', tipo }`, una clave de `EJERCICIOS` en `data.js`), con EMG (`{ fuente: 'emg', musculo }`) o a mano (`null`); dentro de una misma etapa cada `tipo` IMU aparece como máximo una vez.

**Videos por rehacer o grabar con postura nueva:** `desv_radial.mp4` y `desv_cubital.mp4` se graban con la mano de canto (pulgar hacia arriba, antebrazo apoyado), que es la postura que usa la rutina para medirlas. Los prompts están en [prompts-videos-ejercicios.md](../prompts-videos-ejercicios.md).

Cómo generar videos nuevos con el mismo estilo: [prompts-videos-ejercicios.md](../prompts-videos-ejercicios.md).
