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
  preferences.end();

  // Inisialisasi pembacaan awal
  int rawPin = digitalRead(PIN_PROXIMITY_SENSOR);
  bool initialDetected = sensorActiveHigh ? (rawPin == HIGH) : (rawPin == LOW);
  isTumblerPresent = initialDetected;
  currentMeasuredDistanceCm = isTumblerPresent ? 5.0f : 999.0f;

  Serial.printf("[PROXIMITY CHE18-30NA-B710] Inisialisasi: Pin GPIO %d (INPUT_PULLUP) | Logika: %s (Raw Pin: %s) -> Status Awal: %s\n",
                PIN_PROXIMITY_SENSOR,
                sensorActiveHigh ? "Active HIGH" : "Active LOW (NPN NO Default)",
                rawPin == HIGH ? "HIGH" : "LOW",
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

// Pembacaan digital ultra-cepat dengan Debounce Filter Asimetris (Non-blocking & Zero CPU Overhead)
inline bool checkTumblerPresent() {
  static unsigned long lastCheckTime = 0;
  static unsigned long lastLogTime = 0;
  static int consecutivePresentCount = 0;
  static int consecutiveRemovedCount = 0;
  static int lastLoggedPin = -1;

  unsigned long now = millis();

  // Sampling setiap 10ms (100 Hz) - Sangat cepat & responsif
  if (now - lastCheckTime < 10) {
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

  // 3. Debounce Asimetris Berkecepatan Tinggi:
  // - Deteksi Wadah Diletakkan: 2 sampel konsisten (~20 ms respon super cepat)
  // - Deteksi Wadah Terangkat: 3 sampel konsisten (~30 ms respon stabil)
  if (rawDetected) {
    consecutivePresentCount++;
    consecutiveRemovedCount = 0;

    if (consecutivePresentCount >= 2 && !isTumblerPresent) {
      isTumblerPresent = true;
      currentMeasuredDistanceCm = 5.0f; // Status terpasang stabil
      Serial.printf("[CHE18-30NA-B710] Wadah TERDETEKSI CEPAT! Pin GPIO %d = %s. Memberikan bip konfirmasi...\n",
                    PIN_PROXIMITY_SENSOR, rawPinState == HIGH ? "HIGH" : "LOW");
      triggerBuzzerBeep(1, 80); // 1 Bip konfirmasi deteksi wadah
    }
  } else {
    consecutiveRemovedCount++;
    consecutivePresentCount = 0;

    if (consecutiveRemovedCount >= 3 && isTumblerPresent) {
      isTumblerPresent = false;
      currentMeasuredDistanceCm = 999.0f; // Status wadah terlepas
      Serial.printf("[CHE18-30NA-B710] Wadah TERLEPAS! Pin GPIO %d = %s\n",
                    PIN_PROXIMITY_SENSOR, rawPinState == HIGH ? "HIGH" : "LOW");
    }
  }

  // 4. Log Diagnostik Periodik (Setiap 2 Detik ke Serial Monitor)
  if (now - lastLogTime >= 2000) {
    lastLogTime = now;
    Serial.printf("[CHE18-30NA-B710 DIAGNOSTIK] Pin GPIO %d: %s | Logika: %s | Status: %s\n",
                  PIN_PROXIMITY_SENSOR,
                  rawPinState == HIGH ? "HIGH" : "LOW",
                  sensorActiveHigh ? "Active HIGH" : "Active LOW (NPN NO)",
                  isTumblerPresent ? "WADAH TERDETEKSI [OK]" : "KOSONG");
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
