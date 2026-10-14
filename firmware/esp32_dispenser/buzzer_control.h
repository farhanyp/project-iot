#pragma once
#include "config.h"

// ==============================================================================
// DRIVER BUZZER & ALARM DETEKSI JANGKAUAN SENSOR E18-B03P1
// (Thread-Safe Non-blocking State Machine, Audio Feedback, & Alarm)
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

  preferences.begin("wv_buzzer", false);
  isBuzzerAlarmEnabled = preferences.getBool("alarm_on", true); // Default alarm aktif
  preferences.end();

  Serial.printf("[BUZZER] Inisialisasi: Pin GPIO %d | Alarm Sensor: %s\n",
                PIN_BUZZER, isBuzzerAlarmEnabled ? "ON (AKTIF)" : "OFF (SENYAP)");
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

// Memicu bip non-blocking (Thread-safe, dapat dipanggil dari Core 0 maupun Core 1)
inline void triggerBuzzerBeep(int count = 1, int durationMs = 120) {
  buzzerBeepCountRemaining = count;
  buzzerBeepUntil = millis() + durationMs;
  buzzerNextBeepTime = millis() + durationMs + 80;
  digitalWrite(PIN_BUZZER, HIGH);
  isBuzzerSounding = true;
}

// Bip pendek sekali
inline void beepOnce(int durationMs = 80) {
  triggerBuzzerBeep(1, durationMs);
}

// Pola bip berganda (Test Web)
inline void beepPattern(int count) {
  triggerBuzzerBeep(count, 120);
}

// Single-Owner Update Function: Hanya dipanggil di Core 1 loop()
inline void updateSensorBuzzerAlarm(bool tumblerDetected) {
  unsigned long now = millis();

  // 1. Prioritas Utama: Bip Manual (Perintah Web / Feedback Sentuhan Layar / Bip Deteksi)
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
          buzzerBeepUntil = now + 120;
          buzzerNextBeepTime = now + 200;
          digitalWrite(PIN_BUZZER, HIGH);
          isBuzzerSounding = true;
          return;
        }
      } else {
        return; // Jeda antar bip
      }
    }
  }

  // 2. Mode Alarm Jangkauan: Berbunyi saat wadah TIDAK ADA (Di luar jangkauan)
  if (isBuzzerAlarmEnabled) {
    if (!tumblerDetected) {
      // Wadah di luar jangkauan: alarm bip berdenyut 150ms ON / 150ms OFF
      unsigned long phase = now % 300;
      if (phase < 150) {
        digitalWrite(PIN_BUZZER, HIGH);
        isBuzzerSounding = true;
      } else {
        digitalWrite(PIN_BUZZER, LOW);
        isBuzzerSounding = false;
      }
      return;
    }
  }

  // 3. Jika tumbler terdeteksi atau alarm nonaktif: Pastikan buzzer MATI
  if (isBuzzerSounding) {
    digitalWrite(PIN_BUZZER, LOW);
    isBuzzerSounding = false;
  }
}
