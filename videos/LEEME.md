# Videos de la rutina de ejercicios

Esta carpeta guarda un video por ejercicio. La interfaz los muestra en bucle en la ventana de la rutina, que se abre desde la tarjeta **Rutina de rehabilitación** de la pestaña "Monitoreo en vivo" (botones **Revisar rutina** e **Iniciar rutina**).

El video de cada ejercicio es `videos/<id>.mp4`, donde `<id>` es el identificador del paso en la rutina. Si el archivo no existe, la ventana muestra "Video no adjuntado". Un mismo ejercicio puede aparecer en varias etapas y usa el mismo video.

| Archivo | Ejercicio | Fase | Video |
|---|---|---|---|
| `tendon_recto.mp4` | Deslizamiento tendinoso: mano recta | 1 | No adjuntado |
| `puno_gancho.mp4` | Deslizamiento tendinoso: puño en gancho | 1 | Adjunto |
| `puno_completo.mp4` | Deslizamiento tendinoso: puño completo (Fase 2: Puño completo) | 1, 2 | No adjuntado |
| `mesa.mp4` | Deslizamiento tendinoso: posición de mesa | 1 | No adjuntado |
| `puno_recto.mp4` | Deslizamiento tendinoso: puño recto | 1 | No adjuntado |
| `pulgar_oposicion.mp4` | Oposición del pulgar | 1 | No adjuntado |
| `nervio_mediano.mp4` | Deslizamiento del nervio mediano | 1 | No adjuntado |
| `flexion.mp4` | Flexión de muñeca | 2 | No adjuntado |
| `extension.mp4` | Extensión de muñeca | 2 | No adjuntado |
| `desv_radial.mp4` | Desviación radial | 2 | No adjuntado |
| `desv_cubital.mp4` | Desviación cubital | 2 | No adjuntado |
| `pronacion.mp4` | Pronación de antebrazo | 2 | Adjunto |
| `supinacion.mp4` | Supinación de antebrazo | 2 | Adjunto |
| `pulgar_abduccion.mp4` | Abducción del pulgar | 2 | Adjunto |
| `pelota.mp4` | Apretar pelota terapéutica | 3 | Adjunto |
| `pinza.mp4` | Pinza pulgar-índice | 3 | No adjuntado |
| `extension_carga.mp4` | Extensión de muñeca con peso ligero | 3 | No adjuntado |
| `flexion_carga.mp4` | Flexión de muñeca con peso ligero | 3 | No adjuntado |
| `pronosup_martillo.mp4` | Prono-supinación con martillo | 3 | No adjuntado |

**Formato:** `.mp4` (H.264), sin audio. Conviene que empiece y termine en la misma posición para que el bucle no se note. Cualquier proporción sirve: el video se ajusta a la ventana sin recortarse.

**Dónde está el contenido de las rutinas:** las etapas, sus ejercicios, repeticiones, tiempos de sostén, indicaciones y mensajes de cuidado están en `ETAPAS`, en [rutinas.js](../rutinas.js). Para adjuntar un video basta con copiarlo aquí con el nombre `<id>.mp4` de la tabla. Para agregar un ejercicio, añada un paso a la etapa en `rutinas.js` con un `id` sin espacios ni tildes y, si existe, copie su video aquí. Los pasos con `tipo` (una clave de `EJERCICIOS` en `data.js`) se miden con el dispositivo; dentro de una misma etapa cada `tipo` aparece como máximo una vez.

Cómo generar videos nuevos con el mismo estilo: [prompts-videos-ejercicios.md](../prompts-videos-ejercicios.md).
