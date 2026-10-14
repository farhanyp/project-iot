#pragma once
#include "config.h"
#include "buzzer_control.h"

// ==============================================================================
// DRIVER SENSOR INFRARED PHOTOELECTRIC E18-B03P1
// (Debounce Filter, Dynamic Polarity PNP/NPN, & NVS Target Distance)
// ==============================================================================

inline void initProximitySensor() {
  // Gunakan INPUT_PULLUP agar kompatibel baik tipe NPN Open-Collector maupun PNP
  pinMode(PIN_PROXIMITY_SENSOR, INPUT_PULLUP);

  preferences.begin("wv_prox", false);
  targetDistanceCm = preferences.getFloat("dist_cm", 8.0f);
  sensorActiveHigh = preferences.getBool("act_high", true); // Default E18-B03P1 (PNP NO: HIGH = objek ada)
  preferences.end();

  Serial.printf("[PROX E18] Inisialisasi: Pin GPIO %d | Target: %.1f cm | Mode: %s\n",
                PIN_PROXIMITY_SENSOR, targetDistanceCm, sensorActiveHigh ? "Active HIGH (PNP)" : "Active LOW (NPN)");
}

inline void saveProximityConfig(float distCm, bool activeHigh) {
  targetDistanceCm = distCm;
  sensorActiveHigh = activeHigh;

  preferences.begin("wv_prox", false);
  preferences.putFloat("dist_cm", targetDistanceCm);
  preferences.putBool("act_high", sensorActiveHigh);
  preferences.end();

  Serial.printf("[PROX E18] Konfigurasi Disimpan: Target %.1f cm | Mode: %s\n",
                targetDistanceCm, sensorActiveHigh ? "Active HIGH (PNP)" : "Active LOW (NPN)");
}

// Pembacaan dengan filter debounce 3-sampel untuk kestabilan sinyal optik
inline bool checkTumblerPresent() {
  static int consecutiveMatches = 0;
  static bool lastRawState = false;
  static unsigned long lastCheckTime = 0;
  static int lastLoggedPin = -1;

  unsigned long now = millis();
  if (now - lastCheckTime < 25) {
    return isTumblerPresent; // Update sampling setiap 25ms
  }
  lastCheckTime = now;

  int rawVal = digitalRead(PIN_PROXIMITY_SENSOR);
  bool currentRawMatch = (sensorActiveHigh) ? (rawVal == HIGH) : (rawVal == LOW);

  // Log ke Serial jika nilai pin fisik berubah (memudahkan diagnosa hardware)
  if (rawVal != lastLoggedPin) {
    lastLoggedPin = rawVal;
    Serial.printf("[PROX E18 DIAGNOSTIK] Pin GPIO 26 = %d | Status Objek: %s (Mode: %s)\n",
                  rawVal, currentRawMatch ? "TERDETEKSI" : "KOSONG",
                  sensorActiveHigh ? "PNP Active HIGH" : "NPN Active LOW");
  }

  if (currentRawMatch == lastRawState) {
    consecutiveMatches++;
    if (consecutiveMatches >= 3) {
      // Deteksi transisi: Dari TIDAK ADA menjadi ADA (Wadah baru saja didekatkan)
      if (currentRawMatch && !isTumblerPresent) {
        Serial.println("[PROX E18] Wadah BARU SAJA DIDETEKSI! Membunyikan bip konfirmasi...");
        triggerBuzzerBeep(1, 100); // Bip konfirmasi deteksi wadah
      }

      isTumblerPresent = currentRawMatch;
      consecutiveMatches = 3;
    }
  } else {
    consecutiveMatches = 1;
    lastRawState = currentRawMatch;
  }

  return isTumblerPresent;
}

inline void resetProximitySensor() {
  int rawVal = digitalRead(PIN_PROXIMITY_SENSOR);
  isTumblerPresent = (sensorActiveHigh) ? (rawVal == HIGH) : (rawVal == LOW);
  triggerBuzzerBeep(1, 150); // Bip konfirmasi reset
  Serial.printf("[PROX E18] Sensor di-reset! Status fisik: %s (Raw Pin GPIO 26: %d)\n",
                isTumblerPresent ? "TERDETEKSI" : "KOSONG", rawVal);
}
