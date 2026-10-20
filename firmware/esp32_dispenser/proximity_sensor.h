#pragma once
#include "config.h"
#include "buzzer_control.h"

// ==============================================================================
// DRIVER SENSOR ULTRASONIK HC-SR04 PRESISI TINGGI
// (Filter Median 5-Sampel, Histeresis Schmitt-Trigger, & Debounce Asimetris)
// Solusi: Mengatasi sensor "ngeblink-blink", pantulan meleset, dan kurang sensitif
// ==============================================================================

// Parameter Histeresis (Mencegah osilasi status / blinking di ambang batas)
const float HYSTERESIS_MARGIN_CM   = 3.0f; // Toleransi margin lepas (+3.0 cm)
const float MIN_DETECT_DISTANCE_CM = 1.0f; // Batas minimal agar tidak buta pada wadah sangat dekat

inline void initProximitySensor() {
  pinMode(PIN_ULTRASONIC_TRIG, OUTPUT);
  pinMode(PIN_ULTRASONIC_ECHO, INPUT);
  digitalWrite(PIN_ULTRASONIC_TRIG, LOW);

  preferences.begin("wv_prox", false);
  targetDistanceCm = preferences.getFloat("dist_cm", 12.0f); // Default jangkauan deteksi <= 12 cm
  sensorActiveHigh = preferences.getBool("act_high", true);
  preferences.end();

  Serial.printf("[ULTRASONIC HC-SR04] Inisialisasi: TRIG=GPIO %d | ECHO=GPIO %d | Target Acuan: <= %.1f cm (Histeresis Lepas: > %.1f cm)\n",
                PIN_ULTRASONIC_TRIG, PIN_ULTRASONIC_ECHO, targetDistanceCm, targetDistanceCm + HYSTERESIS_MARGIN_CM);
}

inline void saveUltrasonicTargetDistance(float distCm) {
  if (distCm < 2.0f) distCm = 2.0f;
  if (distCm > 50.0f) distCm = 50.0f;
  targetDistanceCm = distCm;

  preferences.begin("wv_prox", false);
  preferences.putFloat("dist_cm", targetDistanceCm);
  preferences.end();

  Serial.printf("[ULTRASONIC HC-SR04] Target Jarak Baru Disimpan ke NVS: <= %.1f cm (Lepas: > %.1f cm)\n",
                targetDistanceCm, targetDistanceCm + HYSTERESIS_MARGIN_CM);
}

inline void saveProximityConfig(float distCm, bool activeHigh) {
  saveUltrasonicTargetDistance(distCm);
}

// Fungsi pengukuran jarak ultrasonik tunggal dengan timeout pendek (~15ms / max ~250cm) agar UI tidak freeze
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
    return 999.0f; // Di luar jangkauan / pantulan meleset
  }

  // Jarak (cm) = (durasi mikrodetik * kecepatan suara 0.0343 cm/us) / 2
  float dist = (float)durationUs * 0.0343f / 2.0f;
  return dist;
}

// Pembacaan dengan Moving-Window Median Filter 5-Titik, Histeresis, & Debounce Asimetris
inline bool checkTumblerPresent() {
  const int WINDOW_SIZE = 5;
  static float distanceHistory[WINDOW_SIZE] = {999.0f, 999.0f, 999.0f, 999.0f, 999.0f};
  static int historyIndex = 0;
  static unsigned long lastCheckTime = 0;
  static unsigned long lastLogTime = 0;
  static int consecutivePresentCount = 0;
  static int consecutiveRemovedCount = 0;

  unsigned long now = millis();

  // Sampling setiap 40ms: responsif, hemat CPU, & tidak membebani bus SPI LCD
  if (now - lastCheckTime < 40) {
    return isTumblerPresent;
  }

  // Jika ada jeda waktu lama (> 400ms, misal baru masuk ke layar deteksi), pre-fill buffer dengan pembacaan segar
  if (lastCheckTime == 0 || (now - lastCheckTime > 400)) {
    float initialDist = readUltrasonicDistanceCm();
    for (int i = 0; i < WINDOW_SIZE; i++) {
      distanceHistory[i] = initialDist;
    }
    historyIndex = 0;
    consecutivePresentCount = 0;
    consecutiveRemovedCount = 0;
  }
  lastCheckTime = now;

  // 1. Ambil 1 sampel baru ke dalam circular buffer
  float rawDist = readUltrasonicDistanceCm();
  distanceHistory[historyIndex] = rawDist;
  historyIndex = (historyIndex + 1) % WINDOW_SIZE;

  // 2. Hitung nilai Median dari 5 sampel (Menolak 1-2 sampel glitch 999.0 atau noise)
  float sortedSamples[WINDOW_SIZE];
  for (int i = 0; i < WINDOW_SIZE; i++) {
    sortedSamples[i] = distanceHistory[i];
  }

  // Bubble sort sederhana untuk 5 elemen
  for (int i = 0; i < WINDOW_SIZE - 1; i++) {
    for (int j = i + 1; j < WINDOW_SIZE; j++) {
      if (sortedSamples[i] > sortedSamples[j]) {
        float tmp = sortedSamples[i];
        sortedSamples[i] = sortedSamples[j];
        sortedSamples[j] = tmp;
      }
    }
  }

  // Nilai median bersih (posisi tengah: index 2 dari 5 elemen)
  float medianDist = sortedSamples[WINDOW_SIZE / 2];
  currentMeasuredDistanceCm = medianDist;

  // 3. Logika Histeresis (Schmitt Trigger)
  // - Jika status saat ini KOSONG: Butuh jarak <= targetDistanceCm untuk dianggap ADA
  // - Jika status saat ini ADA: Wadah baru dianggap LEPAS jika jarak > (targetDistanceCm + HYSTERESIS_MARGIN_CM)
  float releaseThreshold = targetDistanceCm + HYSTERESIS_MARGIN_CM;

  bool rawStateDecision = isTumblerPresent;
  if (!isTumblerPresent) {
    // Menunggu wadah diletakkan
    if (medianDist >= MIN_DETECT_DISTANCE_CM && medianDist <= targetDistanceCm) {
      rawStateDecision = true;
    }
  } else {
    // Wadah sedang terdeteksi: hanya lepas jika benar-benar melewati ambang histeresis
    if (medianDist > releaseThreshold || medianDist < MIN_DETECT_DISTANCE_CM) {
      rawStateDecision = false;
    }
  }

  // 4. Debounce Asimetris:
  // - Deteksi Wadah Diletakkan: Cepat (2 sampel berturut-turut = ~80ms)
  // - Deteksi Wadah Terlepas: Stabil & Aman (4 sampel berturut-turut = ~160ms)
  if (rawStateDecision) {
    consecutivePresentCount++;
    consecutiveRemovedCount = 0;

    if (consecutivePresentCount >= 2 && !isTumblerPresent) {
      isTumblerPresent = true;
      Serial.printf("[HC-SR04] Wadah TERDETEKSI STABIL pada jarak %.1f cm (Target: <= %.1f cm). Membunyikan bip konfirmasi...\n",
                    medianDist, targetDistanceCm);
      triggerBuzzerBeep(1, 100); // 1 Bip konfirmasi deteksi wadah
    }
  } else {
    consecutiveRemovedCount++;
    consecutivePresentCount = 0;

    if (consecutiveRemovedCount >= 4 && isTumblerPresent) {
      isTumblerPresent = false;
      Serial.printf("[HC-SR04] Wadah TERLEPAS STABIL! Jarak Terukur: %.1f cm (Ambang Lepas: > %.1f cm)\n",
                    medianDist, releaseThreshold);
    }
  }

  // 5. Log Diagnostik Periodik (Setiap 1 Detik ke Serial Monitor)
  if (now - lastLogTime >= 1000) {
    lastLogTime = now;
    Serial.printf("[HC-SR04 DIAGNOSTIK] Jarak Live: %.1f cm | Median: %.1f cm | Ambang: <= %.1f cm (Lepas: > %.1f cm) | Status: %s\n",
                  rawDist, medianDist, targetDistanceCm, releaseThreshold,
                  isTumblerPresent ? "WADAH TERDETEKSI [OK]" : "KOSONG");
  }

  return isTumblerPresent;
}

inline void resetProximitySensor() {
  float dist = readUltrasonicDistanceCm();
  currentMeasuredDistanceCm = dist;
  isTumblerPresent = (dist >= MIN_DETECT_DISTANCE_CM && dist <= targetDistanceCm);
  triggerBuzzerBeep(1, 150); // Bip konfirmasi reset
  Serial.printf("[HC-SR04] Sensor di-reset! Jarak saat ini: %.1f cm -> Status: %s\n",
                dist, isTumblerPresent ? "TERDETEKSI" : "KOSONG");
}
