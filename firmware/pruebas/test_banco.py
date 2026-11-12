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

    def test_malformadas(self):
        # Como la interfaz: cuenta lo que no es D, CAL, BAT ni empieza con '#' (sin las vacías).
        lineas = ["D,1,20,0,0,0", "CAL,OK,2500", "BAT,87", "#Recalibre",
                  "ets Jul 29 2019", "rst:0x1", "DATOS,1", "  ", "D,2,40,1,2"]
        r = banco.analizar_muestras(lineas, 1.0)
        self.assertEqual(r["malformadas"], 3)
        self.assertEqual(r["invalidas"], 1)
        self.assertEqual(banco.contar_malformadas(["D,1,20,0,0,0", "#x"]), 0)

    def test_lineas_cero_validas(self):
        self.assertEqual(banco.contar_malformadas(["CERO,OK", "CERO,ERR,sin calibrar"]), 0)

    def test_parsear_estado(self):
        e = banco.parsear_estado("#ESTADO,giro=1,mag=QMC5883L,magcal=0,acelcal=1,mano=D")
        self.assertEqual(e, {"giro": 1, "mag": "QMC5883L", "magcal": 0,
                             "acelcal": 1, "mano": "D"})


class TestRobustez(unittest.TestCase):
    def test_hay_raw(self):
        self.assertTrue(banco.hay_raw(["ok", "#RAW,1,2,3,4,5,6,7,8,9,10"]))
        self.assertFalse(banco.hay_raw(["#ESTADO,giro=1", "D,1,20,0,0,0"]))
        self.assertFalse(banco.hay_raw([]))

    def test_deriva_valida(self):
        self.assertFalse(banco.deriva_valida(5))
        self.assertFalse(banco.deriva_valida(9.9))
        self.assertTrue(banco.deriva_valida(10))
        self.assertTrue(banco.deriva_valida(60))

    def test_estado_malformado(self):
        e = banco.parsear_estado("#ESTADO,giro=x,mag=QMC5883L,magcal=0,acelcal=,mano=D")
        self.assertIsNone(e["giro"])
        self.assertIsNone(e["acelcal"])
        self.assertEqual(e["magcal"], 0)
        self.assertEqual(e["mano"], "D")


if __name__ == "__main__":
    unittest.main()
