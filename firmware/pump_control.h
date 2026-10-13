#pragma once
#include "config.h"

// ==============================================================================
// MODUL KONTROL POMPA AIR BR314 & RELAY
// ==============================================================================

inline void initPump() {
  pinMode(PIN_RELAY_PUMP_CH1, INPUT); // Floating OFF saat pertama kali nyala
  pinMode(PIN_RELAY_SPARE_CH2, INPUT);
}

inline void startPump() {
  pinMode(PIN_RELAY_PUMP_CH1, OUTPUT);
  digitalWrite(PIN_RELAY_PUMP_CH1, RELAY_ACTIVE_STATE);
  Serial.println("[POMPA BR314] STATUS: HIDUP (ON) -> Air mulai mengalir.");
}

inline void stopPump() {
  pinMode(PIN_RELAY_PUMP_CH1, INPUT); // Floating OFF (High-Z) untuk memutus relay optocoupler
  Serial.println("[POMPA BR314] STATUS: MATI (OFF) -> Aliran air berhenti seketika.");
}
