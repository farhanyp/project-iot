#pragma once
#include "config.h"

// ==============================================================================
// DRIVER BUZZER & FEEDBACK AUDIO SISTEM
// (Thread-Safe Non-blocking State Machine, Audio Feedback, & Touch Tick)
// ==============================================================================

inline void stopBuzzer() {
  buzzerBeepCountRemaining = 0;
  buzzerBeepUntil = 0;
  digitalWrite(PIN_BUZZER, LOW);
  isBuzzerSounding = false;
}

inline void initBuzzer() {
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  isBuzzerSounding = false;

  preferences.begin("wv_buzzer", false);
  isBuzzerAlarmEnabled = preferences.getBool("alarm_on", true);
  preferences.end();

  Serial.printf("[BUZZER] Inisialisasi: Pin GPIO %d | Status Awal: SENYAP (LOW)\n", PIN_BUZZER);
}

inline void setBuzzerAlarmEnabled(bool enabled) {
  isBuzzerAlarmEnabled = enabled;

  preferences.begin("wv_buzzer", false);
  preferences.putBool("alarm_on", isBuzzerAlarmEnabled);
  preferences.end();

  if (!isBuzzerAlarmEnabled) {
    stopBuzzer();
  }

  Serial.printf("[BUZZER] Status Alarm Diubah: %s\n", isBuzzerAlarmEnabled ? "ON (AKTIF)" : "OFF (SENYAP)");
}

// Memicu bip non-blocking (Thread-safe)
inline void triggerBuzzerBeep(int count = 1, int durationMs = 40) {
  buzzerBeepCountRemaining = count;
  buzzerBeepUntil = millis() + durationMs;
  buzzerNextBeepTime = millis() + durationMs + 70;
  digitalWrite(PIN_BUZZER, HIGH);
  isBuzzerSounding = true;
}

// Bip pendek sekali (Tactile Click saat sentuh layar)
inline void beepOnce(int durationMs = 35) {
  triggerBuzzerBeep(1, durationMs);
}

// Pola bip berganda (Notifikasi Sukses / Peringatan)
inline void beepPattern(int count) {
  triggerBuzzerBeep(count, 90);
}

// Bip alarm panjang (Kondisi Kritis / Emergency Stop / Air Habis / Overload)
inline void beepAlertLong(int durationMs = 500) {
  triggerBuzzerBeep(1, durationMs);
}

// Bunyikan buzzer secara kontinu (misal saat belum terkoneksi WiFi)
inline void startContinuousBuzzer() {
  buzzerBeepCountRemaining = 0;
  buzzerBeepUntil = 0;
  digitalWrite(PIN_BUZZER, HIGH);
  isBuzzerSounding = true;
}

// Matikan buzzer kontinu
inline void stopContinuousBuzzer() {
  stopBuzzer();
}

// State Machine Buzzer: Wajib dipanggil di SETIAP iterasi loop() di Core 1
inline void updateBuzzer() {
  unsigned long now = millis();

  // 1. Prioritas Utama: Evaluasi antrean bip
  if (buzzerBeepCountRemaining > 0) {
    if (now < buzzerBeepUntil) {
      digitalWrite(PIN_BUZZER, HIGH);
      isBuzzerSounding = true;
      return;
    } else {
      digitalWrite(PIN_BUZZER, LOW);
      isBuzzerSounding = false;
      if (now >= buzzerNextBeepTime) {
        buzzerBeepCountRemaining--;
        if (buzzerBeepCountRemaining > 0) {
          buzzerBeepUntil = now + 90;
          buzzerNextBeepTime = now + 160;
          digitalWrite(PIN_BUZZER, HIGH);
          isBuzzerSounding = true;
          return;
        }
      } else {
        return; // Jeda antar bip
      }
    }
  }

  // 2. Jika tidak ada antrean bip & bukan mode kontinu, pastikan buzzer MATI (LOW)
  if (isBuzzerSounding && buzzerBeepUntil > 0) {
    digitalWrite(PIN_BUZZER, LOW);
    isBuzzerSounding = false;
  }
}

// Kompatibilitas mundur
inline void updateSensorBuzzerAlarm(bool tumblerDetected = true) {
  updateBuzzer();
}
