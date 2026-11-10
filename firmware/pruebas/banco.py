"""Banco de pruebas automático de la placa ESP32-C6 por el puerto serie.

Uso: python firmware/pruebas/banco.py COM5 [--segundos 60] [--sin-giro]
La placa debe estar quieta sobre la mesa. Sale con código 1 si algún criterio falla.
"""
import argparse
import math
import sys
import time

EJES = ("fe", "rc", "ps")
VENTANA_MS = 5000


def parsear_estado(linea):
    """Convierte '#ESTADO,giro=1,mag=...,magcal=0,acelcal=1,mano=D' en un dict."""
    estado = {}
    for campo in linea.strip().split(",")[1:]:
        if "=" not in campo:
            continue
        clave, valor = campo.split("=", 1)
        if clave in ("giro", "magcal", "acelcal"):
            try:
                estado[clave] = int(valor)
            except ValueError:
                estado[clave] = None
        else:
            estado[clave] = valor
    return estado


def hay_raw(lineas):
    """True si entre las líneas hay alguna '#RAW,' (el modo RAW está activo)."""
    return any(l.startswith("#RAW,") for l in lineas)


def deriva_valida(duracion_s):
    """La deriva compara dos ventanas de 5 s; necesita al menos 10 s sin solaparlas."""
    return duracion_s >= 2 * VENTANA_MS / 1000.0


def _parsear_d(linea):
    """Devuelve (seq, t_ms, fe, rc, ps) o None si la línea D no es válida."""
    campos = linea.strip().split(",")
    if len(campos) not in (6, 9):
        return None
    try:
        valores = [float(c) for c in campos[1:]]
    except ValueError:
        return None
    if not all(math.isfinite(v) for v in valores):
        return None
    return valores[0], valores[1], valores[2], valores[3], valores[4]


def _media(xs):
    return sum(xs) / len(xs)


def analizar_muestras(lineas, duracion_s):
    """Analiza las líneas recibidas durante el START."""
    muestras = []
    invalidas = 0
    errores_sensor = 0
    for linea in lineas:
        if linea.startswith("#Error de lectura"):
            errores_sensor += 1
        elif linea.startswith("D,"):
            m = _parsear_d(linea)
            if m is None:
                invalidas += 1
            else:
                muestras.append(m)

    n = len(muestras)
    huecos = 0
    for anterior, actual in zip(muestras, muestras[1:]):
        huecos += max(0, int(actual[0] - anterior[0]) - 1)
    total = huecos + n
    resultado = {
        "n": n,
        "hz": n / duracion_s if duracion_s > 0 else 0.0,
        "perdida_pct": 100.0 * huecos / total if total else 0.0,
        "invalidas": invalidas,
        "errores_sensor": errores_sensor,
        "media": None,
        "deriva": None,
    }
    if n < 2:
        return resultado

    t0 = muestras[0][1]
    t_fin = muestras[-1][1]
    primeros = [m for m in muestras if m[1] - t0 < VENTANA_MS]
    ultimos = [m for m in muestras if t_fin - m[1] < VENTANA_MS]
    media = {}
    deriva = {}
    for i, eje in enumerate(EJES):
        mp = _media([m[2 + i] for m in primeros])
        mu = _media([m[2 + i] for m in ultimos])
        media[eje] = mp
        deriva[eje] = mu - mp
    resultado["media"] = media
    resultado["deriva"] = deriva
    return resultado


# ---------------------------------------------------------------- CLI

def _leer_lineas(puerto, segundos, hasta_prefijos=None):
    """Lee líneas durante 'segundos'; corta antes si aparece una con alguno de los prefijos."""
    lineas = []
    fin = time.monotonic() + segundos
    while time.monotonic() < fin:
        crudo = puerto.readline()
        if not crudo:
            continue
        linea = crudo.decode("utf-8", errors="replace").strip()
        if not linea:
            continue
        lineas.append(linea)
        if hasta_prefijos and linea.startswith(tuple(hasta_prefijos)):
            break
    return lineas


def _enviar(puerto, comando):
    puerto.write((comando + "\n").encode("ascii"))
    puerto.flush()


def _estado(ok):
    return "OK" if ok else "FALLA"


def _imprimir_tabla(filas):
    filas_t = [("prueba", "valor", "criterio", "estado")] + filas
    anchos = [max(len(str(f[i])) for f in filas_t) for i in range(4)]
    for f in filas_t:
        print(" | ".join(str(f[i]).ljust(anchos[i]) for i in range(4)).rstrip())


def _fase_raw(puerto):
    """RAW 3 s con la placa quieta: |a| medio y desviación estándar de gx/gy/gz."""
    _enviar(puerto, "RAW")
    lineas = _leer_lineas(puerto, 3.0)
    _enviar(puerto, "RAW")
    if hay_raw(_leer_lineas(puerto, 0.5)):
        # el cierre se perdió: un segundo toggle apaga RAW
        _enviar(puerto, "RAW")
        _leer_lineas(puerto, 0.5)
    acel, giro = [], [[], [], []]
    for linea in lineas:
        if not linea.startswith("#RAW,"):
            continue
        campos = linea.split(",")
        if len(campos) < 11:
            continue
        try:
            v = [float(c) for c in campos[1:]]
        except ValueError:
            continue
        if not all(math.isfinite(x) for x in v):
            continue
        acel.append(math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2))
        for i in range(3):
            giro[i].append(v[3 + i])
    if not acel:
        return None, None
    desv = []
    for g in giro:
        m = _media(g)
        desv.append(math.sqrt(_media([(x - m) ** 2 for x in g])))
    return _media(acel), desv


def ejecutar(puerto_nombre, segundos, sin_giro):
    import serial  # import perezoso: las pruebas unitarias no necesitan puerto

    filas = []
    with serial.Serial(puerto_nombre, 115200, timeout=0.2) as puerto:
        time.sleep(0.5)  # USB CDC nativo: no hay reinicio al abrir
        puerto.reset_input_buffer()

        # 1. ESTADO
        _enviar(puerto, "ESTADO")
        estado = {}
        lineas_estado = _leer_lineas(puerto, 2.0, ("#ESTADO",))
        for linea in lineas_estado:
            if linea.startswith("#ESTADO"):
                estado = parsear_estado(linea)
        lineas_estado += _leer_lineas(puerto, 0.5)  # detectar RAW ya activo
        if hay_raw(lineas_estado):
            # RAW ya estaba activo: un toggle lo apaga antes de la fase RAW
            _enviar(puerto, "RAW")
            _leer_lineas(puerto, 0.5)
        if sin_giro:
            filas.append(("giro", estado.get("giro", "?"), "omitido (--sin-giro)", "INFO"))
        else:
            filas.append(("giro", estado.get("giro", "?"), "giro=1",
                          _estado(estado.get("giro") == 1)))

        # 2. RAW quieta
        a_medio, desv = _fase_raw(puerto)
        if a_medio is None:
            filas.append(("|a| medio", "sin datos", "0.97..1.03 g", "FALLA"))
        elif estado.get("acelcal", 0) == 1:
            filas.append(("|a| medio", f"{a_medio:.3f} g", "0.97..1.03 g",
                          _estado(0.97 <= a_medio <= 1.03)))
        else:
            filas.append(("|a| medio", f"{a_medio:.3f} g (sin calibrar)",
                          "0.97..1.03 g (acelcal=1)", "INFO"))
        if desv is None:
            if not sin_giro:
                filas.append(("desv. giro", "sin datos", "< 0.02 rad/s", "FALLA"))
        else:
            for nombre, d in zip(("gx", "gy", "gz"), desv):
                if sin_giro:
                    filas.append((f"desv. {nombre}", f"{d:.4f}", "omitido", "INFO"))
                else:
                    filas.append((f"desv. {nombre}", f"{d:.4f} rad/s",
                                  "< 0.02 rad/s", _estado(d < 0.02)))

        # 3. CAL (espera hasta 30 s)
        puerto.reset_input_buffer()
        t0 = time.monotonic()
        _enviar(puerto, "CAL")
        resp = [l for l in _leer_lineas(puerto, 30.0, ("CAL,OK", "CAL,ERR"))
                if l.startswith("CAL,")]
        dt = time.monotonic() - t0
        if resp and resp[-1].startswith("CAL,OK"):
            filas.append(("CAL", f"OK en {dt:.1f} s", "CAL,OK en <= 30 s", "OK"))
        else:
            filas.append(("CAL", resp[-1] if resp else "sin respuesta",
                          "CAL,OK en <= 30 s", "FALLA"))

        # 4. START durante N s, luego STOP
        puerto.reset_input_buffer()
        _enviar(puerto, "START")
        lineas = _leer_lineas(puerto, segundos)
        _enviar(puerto, "STOP")
        _leer_lineas(puerto, 0.5)

    r = analizar_muestras(lineas, segundos)
    filas.append(("frecuencia", f"{r['hz']:.1f} Hz", "48..52 Hz", _estado(48 <= r["hz"] <= 52)))
    filas.append(("pérdida", f"{r['perdida_pct']:.2f} %", "< 1 %", _estado(r["perdida_pct"] < 1)))
    filas.append(("líneas inválidas", r["invalidas"], "= 0", _estado(r["invalidas"] == 0)))
    filas.append(("errores de sensor", r["errores_sensor"], "= 0",
                  _estado(r["errores_sensor"] == 0)))
    for eje in EJES:
        if r["deriva"] is None:
            filas.append((f"deriva {eje}", "sin datos", "|d| < 1.0°", "FALLA"))
            filas.append((f"media {eje} tras CAL", "sin datos", "|m| < 1.0°", "FALLA"))
        else:
            d, m = r["deriva"][eje], r["media"][eje]
            if deriva_valida(segundos):
                filas.append((f"deriva {eje}", f"{d:+.2f}°", "|d| < 1.0°", _estado(abs(d) < 1.0)))
            else:
                filas.append((f"deriva {eje}", "duración < 10 s", "|d| < 1.0°", "FALLA"))
            filas.append((f"media {eje} tras CAL", f"{m:+.2f}°", "|m| < 1.0°",
                          _estado(abs(m) < 1.0)))

    _imprimir_tabla(filas)
    return 1 if any(f[3] == "FALLA" for f in filas) else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Banco de pruebas de la placa por serie")
    ap.add_argument("puerto", help="puerto serie, p. ej. COM5")
    ap.add_argument("--segundos", type=float, default=60, help="duración del START")
    ap.add_argument("--sin-giro", action="store_true", help="placa sin giroscopio")
    args = ap.parse_args(argv)
    return ejecutar(args.puerto, args.segundos, args.sin_giro)


if __name__ == "__main__":
    sys.exit(main())
