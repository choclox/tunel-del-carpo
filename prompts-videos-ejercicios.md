# Prompts para los videos guía de ejercicios

Videos cortos en bucle que se muestran en un recuadro junto al monitoreo en vivo.
Hay uno por cada ejercicio de `EJERCICIOS` en `data.js`.

## Cómo lograr que todos se vean iguales

1. **Primero genera una imagen de referencia** con el *prompt base* (mano en posición neutra).
   Usa esa misma imagen como primer y último fotograma (image‑to‑video) en **todos** los videos.
   Es lo que más ayuda a que la mano, la luz y el fondo no cambien de un video a otro.
2. Usa siempre el mismo modelo, semilla, relación de aspecto y duración.
3. Pega el **bloque de estilo** sin cambios y modifica solo el **bloque de movimiento**.
4. Los prompts van en inglés porque los modelos de video (Veo, Sora, Kling, Runway, Luma)
   los siguen con más precisión.

**Especificaciones de salida:** 1:1 (1080×1080), 24 fps, 6–8 s, sin audio, que empiece y termine
en posición neutra para que el bucle no se note. Expórtalo como `.mp4` (H.264) o `.webm`, y en la interfaz
usa `<video autoplay muted loop playsinline>`.

---

## 1. Bloque de estilo (va igual en todos)

```
Photorealistic medical instructional video, close-up of a single adult right hand and
distal forearm only. Neutral, medium skin tone, clean short nails, no jewelry, no tattoos,
sleeve of a plain light-grey long-sleeve shirt ending mid-forearm. The forearm rests on a
matte white padded table surface, wrist free just past the table edge.
Background: seamless soft light-grey studio backdrop, no objects, no text, no logos.
Lighting: soft, diffused, even key light from upper front-left, gentle fill, low contrast,
no harsh shadows, no specular highlights, consistent color temperature 5000K.
Camera: locked-off tripod, no camera movement, no zoom, 50mm lens look, shallow but
sufficient depth of field so the whole hand and wrist stay in sharp focus. Framing shows
from mid-forearm to fingertips with comfortable margin around the full range of motion;
the hand never leaves the frame.
Motion: slow, smooth, controlled, anatomically correct, constant speed, about 2 seconds
to reach the end position, 1 second hold, 2 seconds to return. Starts and ends in the
exact same neutral pose for a seamless loop. Only the joint being exercised moves; the
forearm stays still on the table.
Calm clinical physiotherapy aesthetic, natural skin texture, realistic tendons and
knuckle creases, 4K detail.
```

## 2. Prompt base (imagen de referencia, posición neutra)

```
[STYLE BLOCK]
Still pose: forearm pronated (palm facing down), wrist in neutral alignment (0°, straight
line with the forearm), fingers relaxed and gently extended, thumb relaxed beside the
index finger. Camera at a 3/4 side view, slightly above wrist height.
```

## 3. Bloque de movimiento por ejercicio

Escribe `[STYLE BLOCK]` y después el bloque del ejercicio. Los ángulos coinciden con los valores
de referencia de `data.js`.

### Flexión de muñeca (`flexion`, ref. 80°)
```
[STYLE BLOCK]
Camera: pure lateral side view (looking at the thumb side), wrist centered.
Forearm pronated, palm facing down, fingers relaxed. The wrist slowly bends downward,
palm moving toward the inner forearm, reaching about 80 degrees of wrist flexion.
Fingers stay relaxed and loosely together, they do not curl into a fist. Hold briefly,
then slowly return to neutral straight alignment.
```

### Extensión de muñeca (`extension`, ref. 70°)
```
[STYLE BLOCK]
Camera: pure lateral side view (looking at the thumb side), wrist centered.
Forearm pronated, palm facing down, fingers relaxed. The wrist slowly bends upward,
back of the hand moving toward the back of the forearm, reaching about 70 degrees of
wrist extension. Fingers stay relaxed and straight, not spread. Hold briefly, then
slowly return to neutral straight alignment.
```

Las desviaciones se hacen con el **antebrazo vertical** (codo apoyado, dedos hacia arriba, palma hacia el paciente; la cámara ve el dorso de la mano): así el sensor mide el giro con ayuda de la gravedad. La rutina recalibra en esta postura al empezar el paso.

### Desviación radial (`desv_radial`, ref. 20°)
```
[STYLE BLOCK]
Camera: front view facing the back of the hand, wrist centered.
Elbow resting on the table, forearm vertical, fingers pointing up and together, palm facing
the person (back of the hand toward the camera). The hand slowly tilts sideways at the wrist toward
the thumb side, reaching about 20 degrees of radial deviation. No wrist flexion or extension,
no forearm rotation. Hold briefly, then slowly return to neutral straight alignment.
```

### Desviación cubital (`desv_cubital`, ref. 30°)
```
[STYLE BLOCK]
Camera: front view facing the back of the hand, wrist centered.
Elbow resting on the table, forearm vertical, fingers pointing up and together, palm facing
the person (back of the hand toward the camera). The hand slowly tilts sideways at the wrist toward
the little-finger side, reaching about 30 degrees of ulnar deviation. No wrist flexion or
extension, no forearm rotation. Hold briefly, then slowly return to neutral straight alignment.
```

### Pronación de antebrazo (`pronacion`, ref. 80°)
```
[STYLE BLOCK]
Camera: front view, forearm pointing toward the camera, wrist centered.
Elbow bent at 90 degrees and tucked against the side of the body, forearm horizontal,
starting with the thumb pointing up and fingers relaxed together. The forearm slowly
rotates so the palm turns to face down, reaching about 80 degrees of pronation. The elbow
stays against the body and does not move; no wrist bending. Hold briefly, then slowly
return to thumb-up.
```

### Cierre de puño (`puno`, ref. 90° en MCF)
```
[STYLE BLOCK]
Camera: 3/4 side view from the thumb side, focused on the knuckles and fingers.
Forearm in mid-position (thumb facing up), wrist neutral and still. Starting with fingers
fully straight, the fingers slowly curl in sequence: knuckles (MCP joints) bend to about
90 degrees, then middle and end joints close into a gentle full fist with the thumb
wrapping over the middle phalanges of the index and middle fingers. No squeezing, no
whitening of knuckles. Hold briefly, then slowly open back to fully straight fingers.
```

---

## 4. Prompt negativo (si el modelo lo admite)

```
extra fingers, missing fingers, fused fingers, deformed hand, distorted joints, unnatural
bending, rubbery skin, blurry, motion blur, camera shake, zoom, pan, cut, text, captions,
watermark, logo, second hand, face, body, jewelry, rings, nail polish, tattoos, dramatic
lighting, high contrast, colored lights, busy background, fast motion, jerky motion,
forearm moving, hand leaving frame
```

## 5. Revisión antes de usar un video

- Tiene 5 dedos y ninguna articulación se dobla en un sentido imposible.
- Solo se mueve la articulación indicada (el antebrazo no rota ni se desplaza).
- La amplitud se acerca al ángulo de referencia (no exagera de más).
- El primer y el último fotograma coinciden (bucle sin salto).
- Brillo, fondo y tono de piel coinciden con los otros cuatro videos. Si no, corrígelo con la
  misma LUT o ajuste de color para todos.
