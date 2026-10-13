#pragma once
#include "config.h"

// ==============================================================================
// MODUL SENSOR TIMBANGAN LOAD CELL 5KG + HX711
// ==============================================================================

inline bool isAdcReadingValid(long raw) {
  return (raw > -8300000 && raw < 8300000 && raw != 0 && raw != -1);
}

inline void setupLoadCell() {
  Serial.println("\n[HX711] Menginisialisasi sensor timbangan (DT: D16, SCK: D4)...");
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);

  if (scale.wait_ready_timeout(1000)) {
    lastRawAdcReading = scale.read();
    if (isAdcReadingValid(lastRawAdcReading)) {
      isScaleReady = true;
      scale.set_scale(calibrationFactor);
      scale.tare(10);
      lastRawValueNet = scale.get_value(1);
      Serial.printf("[HX711 STATUS] Normal! Raw: %ld | Faktor: %.2f\n", lastRawAdcReading, calibrationFactor);
    } else {
      isScaleReady = false;
      Serial.printf("[HX711 PERINGATAN] Raw ADC Jenuh (%ld)! Cek VCC wajib ke 5V.\n", lastRawAdcReading);
    }
  } else {
    isScaleReady = false;
    Serial.println("[HX711 STATUS] Load cell belum merespon. Menggunakan fallback waktu.");
  }
}

inline void updateScaleReading() {
  if (!scale.is_ready()) return;

  long raw = scale.read();
  lastRawAdcReading = raw;

  if (isAdcReadingValid(raw)) {
    isScaleReady = true;
    lastRawValueNet = raw - scale.get_offset();

    float calculatedWeight = (float)lastRawValueNet / calibrationFactor;
    if (abs(calculatedWeight) < 0.5) calculatedWeight = 0.0;

    if (isDispensing) {
      dispensedWeightGrams = max(0.0f, calculatedWeight);
      dispensedMilliLitres = (unsigned long)dispensedWeightGrams;
    } else {
      currentLiveWeight = calculatedWeight;
    }
  } else {
    isScaleReady = false;
    currentLiveWeight = 0.0;
  }
}
