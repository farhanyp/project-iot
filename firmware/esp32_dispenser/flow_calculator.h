#pragma once
#include "config.h"

// ==============================================================================
// MODUL KALKULATOR VOLUME & ESTIMASI DEBIT POMPA AIR PRESISI TINGGI
// (Menggantikan load cell HX711 dengan pemodelan hidrolik & inersia motor)
// ==============================================================================

// Parameter Fisika Pompa DC BR314:
// 1. Ramp-up delay: Waktu motor mencapai RPM penuh & tekanan air stabil (~150 ms)
const unsigned long PUMP_RAMP_UP_MS = 150;

// 2. Shutoff lag: Aliran sisa akibat inersia rotor saat relay mati (~50 ms)
const unsigned long PUMP_COAST_MS   = 50;

// Menghitung durasi aktif pompa yang dibutuhkan untuk mencapai target volume (mL)
inline unsigned long calculateDispenseDurationMs(unsigned long targetMl) {
  if (pumpFlowRateMlPerSec <= 0.1f) pumpFlowRateMlPerSec = 25.0f;

  // Waktu teoritis berdasarkan debit: (target / flowRate) * 1000
  unsigned long theoreticalMs = (unsigned long)(((float)targetMl / pumpFlowRateMlPerSec) * 1000.0f);

  // Kompensasi ramp-up delay dikurangi coasting lag
  long compensationMs = (long)(PUMP_RAMP_UP_MS / 2) - (long)PUMP_COAST_MS;
  if (compensationMs < 0) compensationMs = 0;

  return theoreticalMs + (unsigned long)compensationMs;
}

// Menghitung estimasi volume air terisi (mL) real-time secara halus & presisi
inline unsigned long calculateLiveDispensedMl(unsigned long elapsedTimeMs, unsigned long targetMl) {
  if (pumpFlowRateMlPerSec <= 0.1f) pumpFlowRateMlPerSec = 25.0f;
  if (elapsedTimeMs == 0) return 0;

  float dispensed = 0.0f;

  // Fase 1: Motor berakselerasi (Ramp-up)
  if (elapsedTimeMs <= PUMP_RAMP_UP_MS) {
    float fraction = (float)elapsedTimeMs / (float)PUMP_RAMP_UP_MS;
    // Integrasi percepatan linear: 0.5 * fraction * flowRate * time
    dispensed = 0.5f * fraction * pumpFlowRateMlPerSec * ((float)elapsedTimeMs / 1000.0f);
  }
  // Fase 2: Aliran debit stabil penuh
  else {
    // Volume dari fase akselerasi
    float rampVolume = 0.5f * pumpFlowRateMlPerSec * ((float)PUMP_RAMP_UP_MS / 1000.0f);
    // Volume fase stabil
    float steadyTimeSec = (float)(elapsedTimeMs - PUMP_RAMP_UP_MS) / 1000.0f;
    dispensed = rampVolume + (pumpFlowRateMlPerSec * steadyTimeSec);
  }

  unsigned long resultMl = (unsigned long)round(dispensed);
  if (resultMl > targetMl) resultMl = targetMl;
  return resultMl;
}

// Inisialisasi parameter debit pompa dari NVS Flash
inline void initFlowCalculator() {
  preferences.begin("watervend", false);
  pumpFlowRateMlPerSec = preferences.getFloat("flow_rate", 25.0f);
  preferences.end();

  if (pumpFlowRateMlPerSec < 5.0f || pumpFlowRateMlPerSec > 100.0f) {
    pumpFlowRateMlPerSec = 25.0f;
  }

  Serial.printf("[FLOW SYSTEM] Model debit pompa aktif: %.2f mL/detik (~%.2f L/menit)\n", 
                pumpFlowRateMlPerSec, (pumpFlowRateMlPerSec * 60.0f) / 1000.0f);
}

// Simpan kalibrasi debit baru ke NVS Flash
inline void savePumpFlowRate(float newFlowRate) {
  if (newFlowRate < 5.0f || newFlowRate > 100.0f) return;
  pumpFlowRateMlPerSec = newFlowRate;

  preferences.begin("watervend", false);
  preferences.putFloat("flow_rate", pumpFlowRateMlPerSec);
  preferences.end();

  Serial.printf("[FLOW SYSTEM] Kalibrasi debit baru tersimpan: %.2f mL/detik\n", pumpFlowRateMlPerSec);
}
