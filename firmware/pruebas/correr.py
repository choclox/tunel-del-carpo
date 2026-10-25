#!/usr/bin/env python3
"""Compila y corre las pruebas de PC del firmware.

Uso: python firmware/pruebas/correr.py [nombre]
Compila cada test_*.cpp (o solo test_<nombre>.cpp) junto con todos los .cpp de
carpo_esp32/src/nucleo/, y corre el ejecutable. Sale con 1 si algo falla.
"""
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
NUCLEO = AQUI.parent / "carpo_esp32" / "src" / "nucleo"
BUILD = AQUI / "build"


def main(argv):
    if len(argv) > 1:
        pruebas = [AQUI / f"test_{argv[1]}.cpp"]
        if not pruebas[0].exists():
            print(f"No existe {pruebas[0]}")
            return 1
    else:
        pruebas = sorted(AQUI.glob("test_*.cpp"))
        if not pruebas:
            print("No hay pruebas test_*.cpp")
            return 1
    fuentes = sorted(str(p) for p in NUCLEO.glob("*.cpp"))
    BUILD.mkdir(exist_ok=True)
    fallo = False
    for prueba in pruebas:
        exe = BUILD / (prueba.stem + ".exe")
        cmd = [sys.executable, "-m", "ziglang", "c++", "-std=c++17", "-Wall",
               "-Wextra", "-Werror", "-I", str(NUCLEO), "-I", str(AQUI),
               str(prueba), *fuentes, "-o", str(exe)]
        print(f"== Compilando {prueba.name}")
        if subprocess.run(cmd).returncode != 0:
            print(f"{prueba.stem}: FALLO DE COMPILACION")
            fallo = True
            continue
        if subprocess.run([str(exe)]).returncode != 0:
            fallo = True
    return 1 if fallo else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
