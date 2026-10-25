# Login y registro (maqueta) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a Kinemo una página de **Iniciar sesión / Crear cuenta** para profesionales que se vea y se comporte como una real (validación, mensajes, sesión, cerrar sesión), sin cuentas reales: cualquier correo y contraseña válidos dejan entrar.

**Architecture:** Página nueva `login.html` con dos pestañas (Iniciar sesión, Crear cuenta). Un módulo puro `acceso.js` valida los formularios y guarda una "sesión" de demostración (nombre y correo, nunca la contraseña) en `localStorage`. `index.html` revisa esa sesión al cargar: si no hay, redirige a `login.html`; si hay, muestra el nombre del profesional y un botón **Cerrar sesión**.

**Tech Stack:** HTML, CSS y JavaScript sin compilación (igual que el resto), `node --test` para `acceso.js`, Playwright (`tests/ui/humo.mjs`) para las páginas.

**Spec:** Pedido del usuario (2026-10-25): "Define cómo vamos a integrar una página de login y sign up". Respuestas: **solo la pantalla (maqueta)** — diseño de login y registro sin cuentas reales, para presentar el proyecto; cualquier usuario y contraseña deja entrar — y **solo profesionales** se registran (cada uno ve sus pacientes; los pacientes no tienen cuenta).

## Decisiones de diseño (hacen de spec)

- **Una página, dos pestañas:** "Iniciar sesión" (correo, contraseña) y "Crear cuenta" (nombre completo, profesión, correo, contraseña, repetir contraseña). Se puede abrir directo en Crear cuenta con `login.html#registro`.
- **Diseño:** en escritorio, dos columnas: a la izquierda el logo completo (`img/kinemo-logo.jpg`) sobre fondo blanco con la frase "Monitoreo y rehabilitación del túnel del carpo"; a la derecha el formulario. En móvil (≤ 760 px), una columna: logo pequeño arriba y formulario debajo.
- **Validación (en español, junto a cada campo):**
  - Correo: obligatorio y con forma `algo@algo.algo` → "Escriba un correo válido."
  - Contraseña: obligatoria; al crear cuenta, mínimo 8 caracteres → "La contraseña debe tener al menos 8 caracteres."
  - Repetir contraseña distinta → "Las contraseñas no coinciden."
  - Nombre vacío → "Escriba su nombre." Profesión: lista con Fisioterapeuta, Terapeuta ocupacional, Médico, Otro (por defecto Fisioterapeuta).
- **Al iniciar sesión** sin haberse registrado antes, el nombre que se muestra es la parte del correo antes de la `@` (p. ej. `ana.perez@x.com` → "ana.perez"). Si ese correo se registró antes en este navegador, se usa el nombre registrado.
- **Aviso visible y permanente** bajo el formulario: "Versión de demostración: no se crean cuentas reales y cualquier contraseña funciona."
- **En el panel:** a la derecha de la barra superior, el nombre del profesional y el botón **Cerrar sesión** (vuelve a `login.html`). Al crear un paciente nuevo, el campo "Profesional responsable" viene lleno con ese nombre.
- **Los datos de pacientes no cambian:** siguen en el navegador con la misma clave; la "cuenta" no los separa (es una maqueta).

Fuera de alcance: recuperar contraseña, cuentas de pacientes, cuentas reales o servidor, separar pacientes por profesional.

## Global Constraints

- Trabajar en la rama `login-maqueta` creada desde `main`.
- La contraseña **nunca** se guarda (ni en `localStorage` ni en ningún otro lado).
- Clave de sesión: `kinemo.sesion`. Clave de cuentas registradas (solo nombre, profesión y correo): `kinemo.cuentas`. La clave de datos `rehabcarpo.db.v1` no se toca.
- Todo acceso a `localStorage` va en `try/catch`; si el almacenamiento falla, el login igual deja entrar durante esa visita (la sesión vive en memoria).
- Mismos colores y tipografía que `styles.css` (tokens de `:root`, modo claro y oscuro); sin librerías nuevas.
- `node --test` y `node tests/ui/humo.mjs` en verde en cada commit.

## Review Focus

1. **Entrar directo a `index.html` sin sesión** (enlace guardado, recarga): debe ir a `login.html` sin mostrar antes el panel con datos. → Task 3, comprobación `'sin sesión va al login'`.
2. **Abrir `login.html` con sesión activa:** debe ir directo al panel, no pedir login otra vez. → Task 2, `'con sesión salta el login'`.
3. **Correo con espacios o mayúsculas** (`  Ana@X.com `): se acepta y se guarda recortado y en minúsculas. → Task 1, prueba `normalizarCorreo`.
4. **Nombre o profesión con caracteres HTML** (`<b>Ana</b>`): se muestra como texto, no como HTML. → Task 3, `'nombre se muestra como texto'`.
5. **`localStorage` bloqueado** (modo privado estricto): el login no se rompe y deja entrar. → Task 1, prueba con un almacén que lanza error.

---

### Task 1: `acceso.js` (validación y sesión, sin DOM)

**Files:**
- Create: `acceso.js`
- Create: `tests/acceso.test.js`

**Interfaces:**
- Produces (todas reciben un `almacen` con `getItem/setItem/removeItem`, por defecto `localStorage` si existe):
  - `PROFESIONES: ['Fisioterapeuta', 'Terapeuta ocupacional', 'Médico', 'Otro']`
  - `normalizarCorreo(texto: string) -> string` — recorta y pasa a minúsculas.
  - `validarLogin({correo, clave}) -> {[campo]: mensaje}` — objeto vacío si es válido.
  - `validarRegistro({nombre, profesion, correo, clave, clave2}) -> {[campo]: mensaje}`
  - `registrar({nombre, profesion, correo}, almacen) -> sesion` — guarda la cuenta en `kinemo.cuentas` (sin clave) y abre sesión.
  - `iniciarSesion(correo, almacen) -> sesion` — nombre registrado o parte antes de `@`.
  - `leerSesion(almacen) -> {nombre, profesion, correo} | null`
  - `cerrarSesion(almacen) -> void`
  - Sesión = `{ nombre, profesion, correo }` (profesión `null` si solo inició sesión sin registro).

- [ ] **Step 1: Pruebas que fallan** en `tests/acceso.test.js` con un almacén falso `class Mem { getItem/setItem/removeItem sobre un Map }`:
  - `validarLogin({ correo: 'x', clave: '' })` → `{ correo: 'Escriba un correo válido.', clave: 'Escriba su contraseña.' }`; `validarLogin({ correo: 'a@b.co', clave: '1' })` → `{}`.
  - `validarRegistro({ nombre: '', profesion: 'Médico', correo: 'a@b.co', clave: '1234567', clave2: 'x' })` → `{ nombre: 'Escriba su nombre.', clave: 'La contraseña debe tener al menos 8 caracteres.', clave2: 'Las contraseñas no coinciden.' }`.
  - `normalizarCorreo('  Ana@X.com ')` → `'ana@x.com'`.
  - `registrar(...)` y luego `iniciarSesion('ANA@x.com', m)` → `{ nombre: 'Ana Pérez', profesion: 'Fisioterapeuta', correo: 'ana@x.com' }`; el JSON guardado en `m` no contiene la palabra de la contraseña usada en la prueba (se pasa `clave` a `registrar` a propósito y se verifica que no aparece).
  - `iniciarSesion('luis.gomez@x.com', new Mem())` → `{ nombre: 'luis.gomez', profesion: null, correo: 'luis.gomez@x.com' }`.
  - `cerrarSesion(m)` → `leerSesion(m) === null`.
  - Almacén que lanza en todos los métodos: `iniciarSesion('a@b.co', roto)` devuelve la sesión y `leerSesion(roto)` devuelve esa misma sesión (memoria) sin lanzar.
- [ ] **Step 2: Correr** `node --test` → FAIL `Cannot find module '../acceso.js'`.
- [ ] **Step 3: Implementar `acceso.js`** con las firmas de arriba; `registrar` ignora cualquier campo que no sea nombre, profesión o correo; respaldo en memoria (`let sesionEnMemoria`) cuando el almacén lanza. Exporta con `if (typeof module !== 'undefined') module.exports = {...}`.
- [ ] **Step 4: Correr** `node --test` → todas pasan (18 + 7 = 25).
- [ ] **Step 5: Commit** `git commit -m "Agrega acceso.js: validación y sesión de demostración"`

---

### Task 2: Página `login.html`

**Files:**
- Create: `login.html`, `login.js`
- Modify: `styles.css` (sección nueva `/* ===== Login ===== */`)
- Modify: `tests/ui/humo.mjs` (`nuevaPagina` acepta `ruta` y `sesion`)

**Interfaces:**
- Consumes: todo lo de Task 1.
- Produces: `login.html` con `#tab-login`, `#tab-registro` (botones de pestaña, `aria-selected`), `#form-login` (`[name=correo]`, `[name=clave]`), `#form-registro` (`[name=nombre]`, `[name=profesion]`, `[name=correo]`, `[name=clave]`, `[name=clave2]`), un `<p class="campo-error" data-error="<campo>">` por campo y `.aviso-demo`. Al enviar un formulario válido: guarda la sesión y `location.replace('index.html')`.
- `humo.mjs`: `nuevaPagina({ ruta = '', sesion = { nombre: 'Prueba', profesion: 'Fisioterapeuta', correo: 'prueba@kinemo.co' } })`; con `sesion: null` no se crea sesión. La sesión se siembra con `addInitScript` en `localStorage['kinemo.sesion']`. `waitForSelector('.patient-item')` solo si la ruta es el panel.

- [ ] **Step 1: Comprobaciones de humo que fallan:**
  - `'login: validación'` (ruta `login.html`, sin sesión): enviar vacío → `[data-error=correo]` dice "Escriba un correo válido.".
  - `'login: entrar'`: correo `ana.perez@x.com`, clave `x` → la URL termina en `index.html` y `JSON.parse(localStorage['kinemo.sesion']).nombre` es `ana.perez`.
  - `'registro: contraseñas distintas'`: pestaña Crear cuenta, claves `12345678` y `87654321` → `[data-error=clave2]` dice "Las contraseñas no coinciden."; la URL sigue en `login.html`.
  - `'registro: crear cuenta'`: datos válidos con nombre `Ana Pérez` → URL en `index.html`; la sesión guardada tiene nombre `Ana Pérez` y ningún valor de `localStorage` contiene la contraseña usada.
  - `'login.html#registro abre Crear cuenta'`: `#tab-registro[aria-selected=true]`.
  - `'con sesión salta el login'`: ruta `login.html` con sesión → termina en `index.html`.
  - `'aviso de demostración'`: `.aviso-demo` visible en ambas pestañas.
- [ ] **Step 2: Correr** `node tests/ui/humo.mjs` → fallan las 7 nuevas (las de antes siguen pasando).
- [ ] **Step 3: `login.html` + `login.js` + CSS** según "Decisiones de diseño": cada campo con `<label>`, `autocomplete` correcto (`email`, `current-password`, `new-password`, `name`), botón primario único por pestaña ("Entrar" / "Crear cuenta"), enlace de texto para cambiar de pestaña ("¿No tiene cuenta? Créela aquí" / "¿Ya tiene cuenta? Inicie sesión"). Mismo `favicon` y fuentes que `index.html`. Errores con `aria-live="polite"` y `aria-invalid` en el campo.
- [ ] **Step 4: Correr** → todo verde.
- [ ] **Step 5: Commit** `git commit -m "Agrega la página de inicio de sesión y registro (maqueta)"`

---

### Task 3: Proteger el panel y mostrar al profesional

**Files:**
- Modify: `index.html` (`<head>`: script de guardia antes de los estilos; barra superior: bloque de usuario)
- Modify: `app.js` (`init`: pintar usuario y evento de Cerrar sesión; diálogo de paciente nuevo: valor inicial de `profesional`)
- Modify: `styles.css`, `README.md` (sección "Cómo abrirla": se entra por `login.html`; cualquier contraseña sirve)
- Test: `tests/ui/humo.mjs`

**Interfaces:**
- Consumes: `leerSesion`, `cerrarSesion` (Task 1); `nuevaPagina({ sesion })` (Task 2).
- Produces: `.usuario` en la barra superior con `.usuario-nombre`, `.usuario-profesion` y `#btn-salir` ("Cerrar sesión").

- [ ] **Step 1: Comprobaciones de humo que fallan:**
  - `'sin sesión va al login'`: ruta `index.html`, `sesion: null` → termina en `login.html` y nunca se pintó `.patient-item` (se registra con `page.on('framenavigated')` y un `MutationObserver` sembrado con `addInitScript` que anota si apareció).
  - `'barra muestra al profesional'`: sesión `{ nombre: 'Ana Pérez', profesion: 'Médico' }` → `.usuario-nombre` = `Ana Pérez`, `.usuario-profesion` = `Médico`.
  - `'nombre se muestra como texto'`: sesión con nombre `<b>Ana</b>` → `.usuario-nombre` tiene `textContent` `<b>Ana</b>` y no contiene un elemento `b`.
  - `'cerrar sesión'`: clic en `#btn-salir` → termina en `login.html`; `localStorage['kinemo.sesion']` es `null`.
  - `'paciente nuevo con profesional'`: abrir `#btn-nuevo` → `[name=profesional]` vale `Prueba`.
  - Ajustar `'barra superior limpia'` (Task 2 del plan anterior): ahora admite exactamente un botón, `#btn-salir`.
- [ ] **Step 2: Correr** → fallan las nuevas.
- [ ] **Step 3: Guardia.** En `<head>` de `index.html`, antes de `styles.css`: `<script src="acceso.js"></script>` y un script en línea de una línea: si `leerSesion()` es `null`, `location.replace('login.html')`. Pintar el bloque `.usuario` con `textContent` (nunca `innerHTML`). `#btn-salir` llama `cerrarSesion()` y `location.replace('login.html')`. `.btn-ghost`, no primario.
- [ ] **Step 4: Correr** `node --test && node tests/ui/humo.mjs` → todo verde.
- [ ] **Step 5: Commit** `git commit -m "Protege el panel con la sesión de demostración y muestra al profesional"`
