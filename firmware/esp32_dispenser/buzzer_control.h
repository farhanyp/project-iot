#pragma once
#include "config.h"

// ==============================================================================
// DEFINISI NADA MUSIK STANDAR (FREKUENSI HZ)
// ==============================================================================
#ifndef NOTE_B0
#define NOTE_B0  31
#define NOTE_C1  33
#define NOTE_CS1 35
#define NOTE_D1  37
#define NOTE_DS1 39
#define NOTE_E1  41
#define NOTE_F1  44
#define NOTE_FS1 46
#define NOTE_G1  49
#define NOTE_GS1 52
#define NOTE_A1  55
#define NOTE_AS1 58
#define NOTE_B1  62
#define NOTE_C2  65
#define NOTE_CS2 69
#define NOTE_D2  73
#define NOTE_DS2 78
#define NOTE_E2  82
#define NOTE_F2  87
#define NOTE_FS2 93
#define NOTE_G2  98
#define NOTE_GS2 104
#define NOTE_A2  110
#define NOTE_AS2 117
#define NOTE_B2  123
#define NOTE_C3  131
#define NOTE_CS3 139
#define NOTE_D3  147
#define NOTE_DS3 156
#define NOTE_E3  165
#define NOTE_F3  175
#define NOTE_FS3 185
#define NOTE_G3  196
#define NOTE_GS3 208
#define NOTE_A3  220
#define NOTE_AS3 233
#define NOTE_B3  247
#define NOTE_C4  262
#define NOTE_CS4 277
#define NOTE_D4  294
#define NOTE_DS4 311
#define NOTE_E4  330
#define NOTE_F4  349
#define NOTE_FS4 370
#define NOTE_G4  392
#define NOTE_GS4 415
#define NOTE_A4  440
#define NOTE_AS4 466
#define NOTE_B4  494
#define NOTE_C5  523
#define NOTE_CS5 554
#define NOTE_D5  587
#define NOTE_DS5 622
#define NOTE_E5  659
#define NOTE_F5  698
#define NOTE_FS5 740
#define NOTE_G5  784
#define NOTE_GS5 831
#define NOTE_A5  880
#define NOTE_AS5 932
#define NOTE_B5  988
#define NOTE_C6  1047
#define NOTE_CS6 1109
#define NOTE_D6  1175
#define NOTE_DS6 1245
#define NOTE_E6  1319
#define NOTE_F6  1397
#define NOTE_FS6 1480
#define NOTE_G6  1568
#define NOTE_GS6 1661
#define NOTE_A6  1760
#define NOTE_AS6 1865
#define NOTE_B6  1976
#define NOTE_C7  2093
#define NOTE_CS7 2217
#define NOTE_D7  2349
#define NOTE_DS7 2489
#define NOTE_E7  2637
#define NOTE_F7  2794
#define NOTE_FS7 2960
#define NOTE_G7  3136
#define NOTE_GS7 3322
#define NOTE_A7  3520
#define NOTE_AS7 3729
#define NOTE_B7  3951
#define NOTE_C8  4186
#define NOTE_CS8 4435
#define NOTE_D8  4699
#define NOTE_DS8 4978
#define REST      0
#endif

// ==============================================================================
// MELODI LAGU: "Take on Me" (A-ha)
// ==============================================================================
const int TAKE_ON_ME_TEMPO = 140;

const int s_takeOnMeMelody[] = {
  // Bar 1 - 4
  NOTE_FS5,8, NOTE_FS5,8, NOTE_D5,8, NOTE_B4,8, REST,8, NOTE_B4,8, REST,8, NOTE_E5,8, 
  REST,8, NOTE_E5,8, REST,8, NOTE_E5,8, NOTE_GS5,8, NOTE_GS5,8, NOTE_A5,8, NOTE_B5,8,
  NOTE_A5,8, NOTE_A5,8, NOTE_A5,8, NOTE_E5,8, REST,8, NOTE_D5,8, REST,8, NOTE_FS5,8, 
  REST,8, NOTE_FS5,8, REST,8, NOTE_FS5,8, NOTE_E5,8, NOTE_E5,8, NOTE_FS5,8, NOTE_E5,8,

  // Bar 5 - 8
  NOTE_FS5,8, NOTE_FS5,8, NOTE_D5,8, NOTE_B4,8, REST,8, NOTE_B4,8, REST,8, NOTE_E5,8, 
  REST,8, NOTE_E5,8, REST,8, NOTE_E5,8, NOTE_GS5,8, NOTE_GS5,8, NOTE_A5,8, NOTE_B5,8,
  NOTE_A5,8, NOTE_A5,8, NOTE_A5,8, NOTE_E5,8, REST,8, NOTE_D5,8, REST,8, NOTE_FS5,8, 
  REST,8, NOTE_FS5,8, REST,8, NOTE_FS5,8, NOTE_E5,8, NOTE_E5,8, NOTE_FS5,8, NOTE_E5,8,

  // Bar 9 - 12
  NOTE_FS5,8, NOTE_FS5,8, NOTE_D5,8, NOTE_B4,8, REST,8, NOTE_B4,8, REST,8, NOTE_E5,8, 
  REST,8, NOTE_E5,8, REST,8, NOTE_E5,8, NOTE_GS5,8, NOTE_GS5,8, NOTE_A5,8, NOTE_B5,8,
  NOTE_A5,8, NOTE_A5,8, NOTE_A5,8, NOTE_E5,8, REST,8, NOTE_D5,8, REST,8, NOTE_FS5,8, 
  REST,8, NOTE_FS5,8, REST,8, NOTE_FS5,8, NOTE_E5,8, NOTE_E5,8, NOTE_FS5,8, NOTE_E5,8
};

// Handle background task FreeRTOS pemutar musik
static TaskHandle_t s_songTaskHandle = NULL;
static volatile bool s_isSongPlaying = false;

// Task pemutar musik non-blocking (Berjalan di Core 0 agar Core 1 UI 100% bebas lag)
inline void songPlayerTask(void* pvParameters) {
  int totalNotes = sizeof(s_takeOnMeMelody) / sizeof(s_takeOnMeMelody[0]) / 2;
  int wholenote = (60000 * 4) / TAKE_ON_ME_TEMPO;

  Serial.println("[BUZZER SONG] Background task melodi 'Take on Me' dimulai!");

  while (s_isSongPlaying) {
    for (int thisNote = 0; thisNote < totalNotes * 2; thisNote += 2) {
      if (!s_isSongPlaying) break;

      int divider = s_takeOnMeMelody[thisNote + 1];
      int noteDuration = 0;
      if (divider > 0) {
        noteDuration = wholenote / divider;
      } else if (divider < 0) {
        noteDuration = (int)((wholenote / abs(divider)) * 1.5);
      }

      int pitch = s_takeOnMeMelody[thisNote];
      if (pitch > 0 && isBuzzerAlarmEnabled) {
        tone(PIN_BUZZER, pitch, (unsigned long)(noteDuration * 0.9));
      } else {
        noTone(PIN_BUZZER);
      }

      // vTaskDelay dipecah bertahap agar begitu stop diminta, respon seketika (<20ms)
      int elapsed = 0;
      while (elapsed < noteDuration && s_isSongPlaying) {
        int slice = (noteDuration - elapsed > 20) ? 20 : (noteDuration - elapsed);
        vTaskDelay(pdMS_TO_TICKS(slice));
        elapsed += slice;
      }
      noTone(PIN_BUZZER);

      if (!s_isSongPlaying) break;
    }

    // Jeda sejenak sebelum mengulang melodi jika Wi-Fi belum juga tersambung
    int pauseElapsed = 0;
    while (pauseElapsed < 800 && s_isSongPlaying) {
      vTaskDelay(pdMS_TO_TICKS(50));
      pauseElapsed += 50;
    }
  }

  noTone(PIN_BUZZER);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  s_songTaskHandle = NULL;
  Serial.println("[BUZZER SONG] Background task melodi dihentikan.");
  vTaskDelete(NULL);
}

// Mulai putar melodi di FreeRTOS background task (Core 0)
inline void startBootSong() {
  if (s_songTaskHandle != NULL || s_isSongPlaying) return;
  s_isSongPlaying = true;
  xTaskCreatePinnedToCore(
    songPlayerTask,
    "songTask",
    3072,
    NULL,
    1,
    &s_songTaskHandle,
    0 // Core 0 (PRO_CPU)
  );
}

// Hentikan putaran melodi seketika
inline void stopBootSong() {
  if (!s_isSongPlaying && s_songTaskHandle == NULL) return;
  s_isSongPlaying = false;
  int waitCount = 0;
  while (s_songTaskHandle != NULL && waitCount < 15) {
    vTaskDelay(pdMS_TO_TICKS(20));
    waitCount++;
  }
  noTone(PIN_BUZZER);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  isBuzzerSounding = false;
}

// ==============================================================================
// DRIVER BUZZER & FEEDBACK AUDIO SISTEM
// (Thread-Safe Non-blocking State Machine, Audio Feedback, & Touch Tick)
// ==============================================================================

inline void stopBuzzer() {
  stopBootSong();
  buzzerBeepCountRemaining = 0;
  buzzerBeepUntil = 0;
  noTone(PIN_BUZZER);
  pinMode(PIN_BUZZER, OUTPUT);
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
  stopBootSong();
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

// Bunyikan melodi lagu Take on Me saat belum terkoneksi WiFi
inline void startContinuousBuzzer() {
  startBootSong();
}

// Matikan melodi lagu saat WiFi sudah tersambung
inline void stopContinuousBuzzer() {
  stopBootSong();
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

  // 2. Jika tidak ada antrean bip & bukan mode kontinu/lagu, pastikan buzzer MATI (LOW)
  if (isBuzzerSounding && buzzerBeepUntil > 0) {
    digitalWrite(PIN_BUZZER, LOW);
    isBuzzerSounding = false;
  }
}

// Kompatibilitas mundur
inline void updateSensorBuzzerAlarm(bool tumblerDetected = true) {
  updateBuzzer();
}
