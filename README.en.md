# Kinemo — Wearable monitoring for carpal tunnel rehabilitation

<p align="center"><img src="img/kinemo-logo.jpg" alt="Kinemo" width="360"></p>

Kinemo is an academic prototype (Mechatronic Design II, ITM, Medellín, 2026) that measures wrist motion and muscle activity during post-surgery carpal tunnel rehabilitation, and gives the clinician a dashboard to follow the patient's progress between sessions.

**Live demo:** https://choclox.github.io/tunel-del-carpo/ (runs with a built-in simulator; no hardware needed).
Full documentation in Spanish: [README.md](README.md).

## System overview

| Layer | What it does |
|---|---|
| **Hardware** | ESP32 + GY-85 9-axis IMU (ADXL345 accelerometer, gyroscope, magnetometer) and three surface-EMG channels: thenar eminence, forearm flexors, forearm extensors. 3D-printed (FDM, PLA) snap-fit enclosure mounted with a disposable skin patch. |
| **Firmware** (C++, [`firmware/carpo_esp32`](firmware/carpo_esp32)) | Madgwick quaternion AHRS (9-axis, with 6-axis fallback when the magnetometer is uncalibrated) to estimate flexion-extension, radial-ulnar deviation and pronation-supination at ~50 Hz. Magnetometer and accelerometer calibration, battery reporting and a line-based serial protocol (115200 baud). |
| **Clinician dashboard** (JavaScript, Web Serial, Chart.js) | Guided three-phase rehabilitation routines with exercise videos, a pre-session safety check, live signal view, session history, comparisons, automatic alerts and per-session PDF reports. |

## Signal processing

- **Repetition counting:** hysteresis thresholds relative to the rest position, on a 5-sample moving average (~100 ms). Thresholds adapt to the amplitude of previous repetitions (IMU: rise = max(8°, 50% of typical amplitude), fall = max(3°, 25%); EMG: rise = max(60, 50% of median peak), fall = max(25, 25%)).
- **EMG strength test:** per-muscle strength relative to the patient's first test, a **median-nerve index** (thenar ÷ extensors, normalized) and a **co-contraction** ratio (extensor activity during flexor contraction).
- **Data quality:** sample-rate monitoring, packet-loss detection from sequence numbers (target < 1%) and calibration-time checks.

## Testing

- Web logic: unit tests with `node --test` and a Playwright smoke test of the full UI flow.
- Firmware core: host-side unit tests (`python firmware/pruebas/correr.py`) for sensor fusion, angle computation, calibration, EMG and protocol parsing.

## Status

Functional prototype. Bench validation is pending: angle error ≤ 3° against a goniometer, repetition-count accuracy ≥ 95%, and 60 minutes of continuous streaming with < 1% data loss.

> Academic prototype. Not a certified medical device.
