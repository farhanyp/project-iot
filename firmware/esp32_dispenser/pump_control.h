#pragma once
#include "config.h"

// ==============================================================================
// MODUL KONTROL POMPA AIR BR314 & RELAY (GPIO 32)
// Mendukung Relay Active LOW (Default) maupun Active HIGH
// ==============================================================================

inline void initPump() {
  pinMode(PIN_RELAY_PUMP_CH1, OUTPUT);
  digitalWrite(PIN_RELAY_PUMP_CH1, (relayActiveState == LOW) ? HIGH : LOW);
  Serial.printf("[POMPA BR314] Inisialisasi: GPIO %d | Status Awal: MATI (Relay Idle: %s)\n",
                PIN_RELAY_PUMP_CH1, (relayActiveState == LOW) ? "HIGH" : "LOW");
}

inline void startPump() {
  pinMode(PIN_RELAY_PUMP_CH1, OUTPUT);
  digitalWrite(PIN_RELAY_PUMP_CH1, relayActiveState);
  Serial.printf("[POMPA BR314] STATUS: HIDUP (ON) -> GPIO %d diset %s\n",
                PIN_RELAY_PUMP_CH1, (relayActiveState == LOW) ? "LOW (0V)" : "HIGH (3.3V)");
}

inline void stopPump() {
  pinMode(PIN_RELAY_PUMP_CH1, OUTPUT);
  digitalWrite(PIN_RELAY_PUMP_CH1, (relayActiveState == LOW) ? HIGH : LOW);
  Serial.printf("[POMPA BR314] STATUS: MATI (OFF) -> GPIO %d diset %s\n",
                PIN_RELAY_PUMP_CH1, (relayActiveState == LOW) ? "HIGH (3.3V)" : "LOW (0V)");
}
