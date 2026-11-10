"""Pruebas de las funciones de análisis del banco (sin puerto serie)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import banco  # noqa: E402


class TestBanco(unittest.TestCase):
    def test_perdida_por_huecos(self):
        lineas = [f"D,{s},{s * 20},0,0,0" for s in range(1, 101) if s not in (50, 51, 52)]
        r = banco.analizar_muestras(lineas, 2.0)
        self.assertEqual(r["n"], 97)
        self.assertAlmostEqual(r["perdida_pct"], 3.0, places=1)
        self.assertAlmostEqual(r["hz"], 48.5, places=1)
        self.assertEqual(r["invalidas"], 0)

    def test_linea_invalida(self):
        r = banco.analizar_muestras(["D,1,20,nan,0,0", "D,2,40,1,2"], 1.0)
        self.assertEqual(r["invalidas"], 2)
        self.assertEqual(r["n"], 0)
        self.assertIsNone(r["media"])
        self.assertIsNone(r["deriva"])

    def test_deriva(self):
        lineas = []
        for i in range(1001):
            t = i * 20
            lineas.append(f"D,{i + 1},{t},{2 * t / 20000:.6f},0,0")
        r = banco.analizar_muestras(lineas, 20.0)
        self.assertAlmostEqual(r["media"]["fe"], 0.25, delta=0.05)
        self.assertAlmostEqual(r["deriva"]["fe"], 1.5, delta=0.1)
        self.assertAlmostEqual(r["deriva"]["rc"], 0.0, delta=0.01)

    def test_errores_sensor(self):
        lineas = ["#Error de lectura del GY-85, reintentando"] * 2
        r = banco.analizar_muestras(lineas, 1.0)
        self.assertEqual(r["errores_sensor"], 2)

    def test_nueve_campos_validos(self):
        r = banco.analizar_muestras(["D,1,20,1,2,3,0.1,0.2,0.3"], 1.0)
        self.assertEqual(r["n"], 1)
        self.assertEqual(r["invalidas"], 0)

    def test_parsear_estado(self):
        e = banco.parsear_estado("#ESTADO,giro=1,mag=QMC5883L,magcal=0,acelcal=1,mano=D")
        self.assertEqual(e, {"giro": 1, "mag": "QMC5883L", "magcal": 0,
                             "acelcal": 1, "mano": "D"})


if __name__ == "__main__":
    unittest.main()
