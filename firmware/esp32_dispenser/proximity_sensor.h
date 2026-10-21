#pragma once
#include "config.h"
#include "buzzer_control.h"

// ==============================================================================
// DRIVER SENSOR PROXIMITY OPTIK INDUSTRIAL CHE18-30NA-B710
// Tipe: Photoelectric Switch M18 Diffuse Reflective (Infrared)
// Output: NPN Normally Open (NO) / Active LOW
// Jarak: Murni diatur fisik melalui baut sekrup potensiometer di belakang sensor
// ==============================================================================

inline void initProximitySensor() {
  // Aktifkan internal pull-up resistor ESP32 untuk output NPN Open Collector
  pinMode(PIN_PROXIMITY_SENSOR, INPUT_PULLUP);

  preferences.begin("wv_prox_v3", false);
  // Default untuk NPN Normally Open (NO) adalah Active LOW (sensorActiveHigh = false)
  // Ketika botol terdeteksi -> NPN ON menarik pin ke GND (LOW)
  sensorActiveHigh = preferences.getBool("act_high", false);
  proximityDebounceSamples = preferences.getInt("deb_samples", 1); // Default 1 sampel murni sesuai permintaan
  preferences.end();

  // Inisialisasi pembacaan awal
  int rawPin = digitalRead(PIN_PROXIMITY_SENSOR);
  bool initialDetected = sensorActiveHigh ? (rawPin == HIGH) : (rawPin == LOW);
  isTumblerPresent = initialDetected;
  currentMeasuredDistanceCm = isTumblerPresent ? 5.0f : 999.0f;

  Serial.printf("[PROXIMITY CHE18-30NA-B710] Inisialisasi: Pin GPIO %d (INPUT_PULLUP) | Logika: %s (Raw Pin: %s) | Filter: %d sampel -> Status Awal: %s\n",
                PIN_PROXIMITY_SENSOR,
                sensorActiveHigh ? "Active HIGH" : "Active LOW (NPN NO Default)",
                rawPin == HIGH ? "HIGH" : "LOW",
                proximityDebounceSamples,
                isTumblerPresent ? "WADAH TERPASANG" : "KOSONG");
}

// Simpan konfigurasi polaritas ke NVS Flash
inline void saveProximityPolarity(bool activeHigh) {
  sensorActiveHigh = activeHigh;
  preferences.begin("wv_prox_v3", false);
  preferences.putBool("act_high", sensorActiveHigh);
  preferences.end();
  Serial.printf("[PROXIMITY CHE18-30NA-B710] Polaritas Baru Disimpan: %s\n",
                sensorActiveHigh ? "Active HIGH (HIGH = Wadah Ada)" : "Active LOW (LOW = Wadah Ada - NPN NO)");
}

inline void saveProximityConfig(float distCm, bool activeHigh) {
  targetDistanceCm = distCm;
  saveProximityPolarity(activeHigh);
}

// Pembacaan digital presisi sensor CHE18-30NA-B710
// Mendukung Mode 1 Sampel Murni (Instan 0/1) maupun Mode Multi-Sampel Filter
inline bool checkTumblerPresent() {
  static unsigned long lastCheckTime = 0;
  static unsigned long lastLogTime = 0;
  static int consecutivePresentCount = 0;
  static int consecutiveRemovedCount = 0;
  static int lastLoggedPin = -1;

  unsigned long now = millis();

  // Sampling interval: 10ms jika mode filter > 1 sampel
  if (proximityDebounceSamples > 1 && (now - lastCheckTime < 10)) {
    return isTumblerPresent;
  }
  lastCheckTime = now;

  // 1. Baca level logika pin digital sensor CHE18-30NA-B710
  int rawPinState = digitalRead(PIN_PROXIMITY_SENSOR);

  // 2. Evaluasi deteksi berdasarkan polaritas NPN
  // Default NPN NO: Pin tertarik ke LOW saat botol memantulkan cahaya inframerah
  bool rawDetected = sensorActiveHigh ? (rawPinState == HIGH) : (rawPinState == LOW);

  // Log seketika saat level pin fisik berubah
  if (rawPinState != lastLoggedPin) {
    lastLoggedPin = rawPinState;
    Serial.printf("[SENSOR CHE18-30NA-B710] Level Pin Fisik GPIO %d: %s -> Logika: %s\n",
                  PIN_PROXIMITY_SENSOR,
                  rawPinState == HIGH ? "HIGH (3.3V)" : "LOW (GND / 0V)",
                  rawDetected ? "WADAH TERDETEKSI" : "KOSONG");
  }

  // --------------------------------------------------------------------------
  // OPSI A: MODE 1 SAMPEL MURNI (DIRECT 0 & 1 / TRUE & FALSE INSTAN)
  // Sesuai permintaan: Respon seketika tanpa delay/debounce software
  // --------------------------------------------------------------------------
  if (proximityDebounceSamples <= 1) {
    if (rawDetected != isTumblerPresent) {
      isTumblerPresent = rawDetected;
      currentMeasuredDistanceCm = isTumblerPresent ? 5.0f : 999.0f;
      Serial.printf("[CHE18 1-SAMPEL INSTAN] Wadah %s! (Pin GPIO %d = %s)\n",
                    isTumblerPresent ? "TERDETEKSI" : "DIANGKAT/KOSONG",
                    PIN_PROXIMITY_SENSOR, rawPinState == HIGH ? "HIGH" : "LOW");
      if (isTumblerPresent && !isDispensing && !isDirectProximityMode) {
        triggerBuzzerBeep(1, 80);
      }
    }
    return isTumblerPresent;
  }

  // --------------------------------------------------------------------------
  // OPSI B: MODE FILTER DINAMIS (Jika diset > 1 sampel, misal 3 atau 5)
  // --------------------------------------------------------------------------
  int requiredRemovedSamples = proximityDebounceSamples;
  int requiredPresentSamples = min(proximityDebounceSamples, 3);

  if (rawDetected) {
    consecutivePresentCount++;
    consecutiveRemovedCount = 0;

    if (consecutivePresentCount >= requiredPresentSamples && !isTumblerPresent) {
      isTumblerPresent = true;
      currentMeasuredDistanceCm = 5.0f;
      Serial.printf("[CHE18 FILTER %d-SAMPEL] Wadah TERDETEKSI! Pin GPIO %d = %s\n",
                    requiredPresentSamples, PIN_PROXIMITY_SENSOR, rawPinState == HIGH ? "HIGH" : "LOW");
      if (!isDispensing && !isDirectProximityMode) {
        triggerBuzzerBeep(1, 80);
      }
    }
  } else {
    consecutiveRemovedCount++;
    consecutivePresentCount = 0;

    if (consecutiveRemovedCount >= requiredRemovedSamples && isTumblerPresent) {
      isTumblerPresent = false;
      currentMeasuredDistanceCm = 999.0f;
      Serial.printf("[CHE18 FILTER %d-SAMPEL] Wadah DIANGKAT! Pin GPIO %d = %s\n",
                    requiredRemovedSamples, PIN_PROXIMITY_SENSOR, rawPinState == HIGH ? "HIGH" : "LOW");
    }
  }

  // Log Diagnostik Periodik (Setiap 2 Detik ke Serial Monitor)
  if (now - lastLogTime >= 2000) {
    lastLogTime = now;
    bool pumpIsRunning = (isDispensing && !isDispensePaused) || (isDirectProximityMode && (digitalRead(PIN_RELAY_PUMP_CH1) == relayActiveState));
    Serial.printf("[CHE18-30NA-B710 DIAGNOSTIK] Pin GPIO %d: %s | Mode: %d Sampel | Status: %s | Pompa: %s\n",
                  PIN_PROXIMITY_SENSOR,
                  rawPinState == HIGH ? "HIGH" : "LOW",
                  proximityDebounceSamples,
                  isTumblerPresent ? "WADAH TERDETEKSI [OK]" : "KOSONG",
                  pumpIsRunning ? "AKTIF" : "IDLE");
  }

  return isTumblerPresent;
}

inline void resetProximitySensor() {
  int rawPinState = digitalRead(PIN_PROXIMITY_SENSOR);
  bool rawDetected = sensorActiveHigh ? (rawPinState == HIGH) : (rawPinState == LOW);
  isTumblerPresent = rawDetected;
  currentMeasuredDistanceCm = isTumblerPresent ? 5.0f : 999.0f;
  triggerBuzzerBeep(1, 150);
  Serial.printf("[CHE18-30NA-B710] Sensor di-reset! Pin GPIO %d: %s -> Status: %s\n",
                PIN_PROXIMITY_SENSOR, rawPinState == HIGH ? "HIGH" : "LOW",
                isTumblerPresent ? "TERDETEKSI" : "KOSONG");
}
