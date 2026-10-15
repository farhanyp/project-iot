#pragma once
#include "config.h"
#include "buzzer_control.h"

// ==============================================================================
// DRIVER SENSOR ULTRASONIK HC-SR04
// (Pengukuran Jarak Jangkauan cm, Filter Debounce Cepat, & NVS Target Distance)
// ==============================================================================

inline void initProximitySensor() {
  pinMode(PIN_ULTRASONIC_TRIG, OUTPUT);
  pinMode(PIN_ULTRASONIC_ECHO, INPUT);
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);

  preferences.begin("wv_prox", false);
  targetDistanceCm = preferences.getFloat("dist_cm", 12.0f); // Default jangkauan deteksi <= 12 cm
  sensorActiveHigh = preferences.getBool("act_high", true);
  preferences.end();

  Serial.printf("[ULTRASONIC HC-SR04] Inisialisasi: TRIG=GPIO %d | ECHO=GPIO %d | Target Jarak: <= %.1f cm\n",
                PIN_ULTRASONIC_TRIG, PIN_ULTRASONIC_ECHO, targetDistanceCm);
}

inline void saveUltrasonicTargetDistance(float distCm) {
  if (distCm < 2.0f) distCm = 2.0f;
  if (distCm > 50.0f) distCm = 50.0f;
  targetDistanceCm = distCm;

  preferences.begin("wv_prox", false);
  preferences.putFloat("dist_cm", targetDistanceCm);
  preferences.end();

  Serial.printf("[ULTRASONIC HC-SR04] Target Jarak Baru Disimpan ke NVS: <= %.1f cm\n", targetDistanceCm);
}

inline void saveProximityConfig(float distCm, bool activeHigh) {
  saveUltrasonicTargetDistance(distCm);
}

// Fungsi pengukuran jarak ultrasonik dengan timeout pendek (~15ms / max ~250cm) agar UI tidak freeze
inline float readUltrasonicDistanceCm() {
  // 1. Pastikan pin trigger bersih LOW
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
  delayMicroseconds(2);

  // 2. Berikan pulsa HIGH selama 10 mikrodetik
  digitalWrite(PIN_ULTRASONIC_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);

  // 3. Baca durasi pantulan pulsa ECHO (timeout 15.000 us = 15 ms, ~250 cm max)
  unsigned long durationUs = pulseIn(PIN_ULTRASONIC_ECHO, HIGH, 15000);

  // Jika timeout atau tidak ada pantulan
  if (durationUs == 0) {
    return 999.0f; // Anggap di luar jangkauan
  }

  // Jarak (cm) = (durasi mikrodetik * kecepatan suara 0.0343 cm/us) / 2
  float dist = (float)durationUs * 0.0343f / 2.0f;
  return dist;
}

// Pembacaan dengan sampling periodik dan filter noise agar stabil
inline bool checkTumblerPresent() {
  static int consecutiveMatches = 0;
  static bool lastRawMatch = false;
  static unsigned long lastCheckTime = 0;
  static unsigned long lastLogTime = 0;

  unsigned long now = millis();
  // Sampling setiap 50ms agar hemat CPU dan tidak mengganggu bus SPI LCD
  if (now - lastCheckTime < 50) {
    return isTumblerPresent;
  }
  lastCheckTime = now;

  float dist = readUltrasonicDistanceCm();
  currentMeasuredDistanceCm = dist;

  // Tumbler dianggap terdeteksi jika jarak berada dalam batas wajar (misal: antara 1.5 cm s/d targetDistanceCm)
  bool currentRawMatch = (dist >= 1.5f && dist <= targetDistanceCm);

  // Log diagnosa ke Serial setiap 1 detik
  if (now - lastLogTime >= 1000) {
    lastLogTime = now;
    Serial.printf("[HC-SR04 DIAGNOSTIK] Jarak Terukur: %.1f cm | Target: <= %.1f cm | Status: %s\n",
                  dist, targetDistanceCm, currentRawMatch ? "WADAH TERDETEKSI" : "KOSONG");
  }

  // Filter kestabilan 2 sampel berturut-turut
  if (currentRawMatch == lastRawMatch) {
    consecutiveMatches++;
    if (consecutiveMatches >= 2) {
      // Deteksi transisi: Dari TIDAK ADA menjadi ADA (Wadah baru saja didekatkan)
      if (currentRawMatch && !isTumblerPresent) {
        Serial.printf("[HC-SR04] Wadah BARU SAJA DIDETEKSI pada jarak %.1f cm! Membunyikan bip konfirmasi...\n", dist);
        triggerBuzzerBeep(1, 100); // Bip konfirmasi deteksi wadah
      }

      isTumblerPresent = currentRawMatch;
      consecutiveMatches = 2;
    }
  } else {
    consecutiveMatches = 1;
    lastRawMatch = currentRawMatch;
  }

  return isTumblerPresent;
}

inline void resetProximitySensor() {
  float dist = readUltrasonicDistanceCm();
  currentMeasuredDistanceCm = dist;
  isTumblerPresent = (dist >= 1.5f && dist <= targetDistanceCm);
  triggerBuzzerBeep(1, 150); // Bip konfirmasi reset
  Serial.printf("[HC-SR04] Sensor di-reset! Jarak saat ini: %.1f cm -> Status: %s\n",
                dist, isTumblerPresent ? "TERDETEKSI" : "KOSONG");
}
