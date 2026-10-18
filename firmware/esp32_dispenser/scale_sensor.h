#pragma once
#include "config.h"
#include "buzzer_control.h"

// ==============================================================================
// DRIVER SENSOR TIMBANGAN LOAD CELL 5KG + MODUL ADC HX711
// (Non-blocking ADC Sampling, Tare Otomatis, Kalibrasi NVS, & Filter Deadband)
// ==============================================================================

inline bool isAdcReadingValid(long raw) {
  // Rentang ADC 24-bit 2's complement yang masuk akal untuk load cell 5kg
  return (raw > -8300000 && raw < 8300000 && raw != 0 && raw != -1);
}

inline void initScaleSensor() {
  Serial.printf("\n[HX711] Menginisialisasi sensor timbangan (DT: GPIO %d, SCK: GPIO %d)...\n",
                PIN_HX711_DT, PIN_HX711_SCK);
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);

  preferences.begin("wv_scale", false);
  calibrationFactor = preferences.getFloat("cal_factor", -420.0f);
  maxWeightLimit = preferences.getFloat("max_weight", 2500.0f);
  dispenseEarlyOffsetGrams = preferences.getFloat("disp_offset", 15.0f);
  targetSafetyBiasGrams = preferences.getFloat("safe_bias", 1.0f);
  preferences.end();

  if (calibrationFactor == 0.0f) calibrationFactor = -420.0f;
  scale.set_scale(calibrationFactor);

  if (scale.wait_ready_timeout(600)) {
    lastRawAdcReading = scale.read();
    if (isAdcReadingValid(lastRawAdcReading)) {
      isScaleReady = true;
      scale.tare(10);
      containerTareWeight = 0.0f;
      currentLiveWeight = 0.0f;
      dispensedWeightGrams = 0.0f;
      Serial.printf("[HX711 STATUS] Normal! Raw: %ld | Faktor: %.2f | Maks: %.0f g | Offset Cut-Off: %.1f g | Bias: -%.1f g\n", 
                    lastRawAdcReading, calibrationFactor, maxWeightLimit, dispenseEarlyOffsetGrams, targetSafetyBiasGrams);
    } else {
      isScaleReady = false;
      Serial.printf("[HX711 PERINGATAN] Raw ADC di luar batas normal (%ld)! Cek jalur kabel & VCC (Wajib 5V).\n", 
                    lastRawAdcReading);
    }
  } else {
    isScaleReady = false;
    Serial.println("[HX711 STATUS] Load cell belum merespon saat boot. Siaga mendeteksi secara non-blocking...");
  }
}

inline void tareScale() {
  if (!scale.is_ready()) {
    Serial.println("[HX711 TARE] Peringatan: Modul belum siap, mencoba tare cepat...");
  }
  // Ambil beban sebelum tare sebagai berat wadah/tumbler
  long rawBefore = scale.get_value(5);
  containerTareWeight = (float)rawBefore / calibrationFactor;
  if (containerTareWeight < 0.0f) containerTareWeight = 0.0f;

  scale.tare(10);
  currentLiveWeight = 0.0f;
  dispensedWeightGrams = 0.0f;
  beepOnce(60);
  Serial.printf("[HX711 TARE] Timbangan dinolkan (0.0 g). Tara Wadah: %.1f g\n", containerTareWeight);
}

inline void calibrateScale(float knownWeightGrams) {
  if (knownWeightGrams <= 0.0f) return;

  Serial.printf("[HX711 KALIBRASI] Memulai kalibrasi dengan beban acuan %.1f gram...\n", knownWeightGrams);
  scale.set_scale(1.0f); // Reset skala untuk membaca raw net
  long rawValue = scale.get_value(10);

  if (rawValue == 0) {
    Serial.println("[HX711 KALIBRASI] Gagal! Raw ADC bernilai 0. Periksa koneksi modul HX711.");
    scale.set_scale(calibrationFactor);
    return;
  }

  float newFactor = (float)rawValue / knownWeightGrams;
  calibrationFactor = newFactor;
  scale.set_scale(calibrationFactor);

  preferences.begin("wv_scale", false);
  preferences.putFloat("cal_factor", calibrationFactor);
  preferences.end();

  beepPattern(2);
  Serial.println("==================================================");
  Serial.printf(">> [OK] KALIBRASI BERHASIL!\n");
  Serial.printf("   - Beban Acuan     : %.1f gram\n", knownWeightGrams);
  Serial.printf("   - Raw ADC Netto   : %ld\n", rawValue);
  Serial.printf("   - Faktor Baru     : %.2f (Tersimpan ke NVS Flash)\n", calibrationFactor);
  Serial.println("==================================================");
}

inline void saveCalibrationFactor(float factor) {
  if (factor == 0.0f) return;
  calibrationFactor = factor;
  scale.set_scale(calibrationFactor);

  preferences.begin("wv_scale", false);
  preferences.putFloat("cal_factor", calibrationFactor);
  preferences.end();

  beepOnce(80);
  Serial.printf(">> [OK] Faktor kalibrasi diatur manual: %.2f (Tersimpan ke NVS Flash)\n", calibrationFactor);
}

inline void saveMaxWeight(float maxW) {
  if (maxW < 100.0f) maxW = 100.0f;
  maxWeightLimit = maxW;

  preferences.begin("wv_scale", false);
  preferences.putFloat("max_weight", maxWeightLimit);
  preferences.end();

  Serial.printf(">> [OK] Batas beban platform: %.0f gram (Tersimpan ke NVS Flash)\n", maxWeightLimit);
}

inline void saveDispenseOffset(float offset) {
  if (offset < 0.0f) offset = 0.0f;
  if (offset > 50.0f) offset = 50.0f;
  dispenseEarlyOffsetGrams = offset;

  preferences.begin("wv_scale", false);
  preferences.putFloat("disp_offset", dispenseEarlyOffsetGrams);
  preferences.end();

  beepOnce(80);
  Serial.printf(">> [OK] Early Cut-Off Offset diperbarui: %.1f gram (Tersimpan ke NVS Flash)\n", dispenseEarlyOffsetGrams);
}

inline void saveSafetyBias(float bias) {
  if (bias < 0.0f) bias = 0.0f;
  if (bias > 20.0f) bias = 20.0f;
  targetSafetyBiasGrams = bias;

  preferences.begin("wv_scale", false);
  preferences.putFloat("safe_bias", targetSafetyBiasGrams);
  preferences.end();

  beepOnce(80);
  Serial.printf(">> [OK] Safety Margin Bias diperbarui: %.1f gram (Target 200mL -> %.1f g)\n",
                targetSafetyBiasGrams, 200.0f - targetSafetyBiasGrams);
}

inline void updateAdaptiveOffset(float finalWeight, float nominalTarget) {
  float effectiveTarget = max(0.0f, nominalTarget - targetSafetyBiasGrams); // Misal 200 - 1 = 199.0g
  float error = finalWeight - effectiveTarget;

  // Koreksi adaptif jika error dalam rentang wajar (+- 15g) untuk menghindari sentuhan/goncangan eksternal
  if (abs(error) > 0.3f && abs(error) <= 15.0f) {
    float correction = 0.35f * error;
    float newOffset = dispenseEarlyOffsetGrams + correction;
    if (newOffset < 5.0f) newOffset = 5.0f;
    if (newOffset > 35.0f) newOffset = 35.0f;

    Serial.printf("[AUTO-TUNE] Target: %.1f g | Riil: %.1f g | Error: %+.2f g | Offset: %.2f g -> %.2f g\n",
                  effectiveTarget, finalWeight, error, dispenseEarlyOffsetGrams, newOffset);
    saveDispenseOffset(newOffset);
  } else {
    Serial.printf("[AUTO-TUNE] Target: %.1f g | Riil: %.1f g | Error: %+.2f g (Presisi OK!)\n",
                  effectiveTarget, finalWeight, error);
  }
}

inline void updateScaleReading() {
  static unsigned long lastScaleCheck = 0;
  static unsigned long lastLogScale = 0;
  unsigned long now = millis();

  // Sampling setiap 80 ms (~12.5 Hz, selaras dengan rate ADC HX711 10Hz/80Hz)
  if (now - lastScaleCheck < 80) return;
  lastScaleCheck = now;

  // Cek kesiapan pin DT secara instan tanpa blocking CPU
  if (!scale.is_ready()) {
    return;
  }

  long raw = scale.read();
  lastRawAdcReading = raw;

  if (isAdcReadingValid(raw)) {
    isScaleReady = true;
    long rawNet = raw - scale.get_offset();
    float calc = (float)rawNet / calibrationFactor;

    // Filter deadband noise kecil (+- 0.5 gram)
    if (abs(calc) < 0.5f) calc = 0.0f;

    currentLiveWeight = calc;

    if (isDispensing) {
      // Filter Kenaikan Laju Maksimal (Anti-Interferensi Tangan / Es Batu Menekan)
      // Debit normal pompa ~25 mL/detik. Dalam 80ms, kenaikan wajar maksimum ~4 gram.
      // Jika mendadak naik > 35 gram dalam 80ms, tandai sebagai lonjakan gaya eksternal!
      if (calc > dispensedWeightGrams + 35.0f && dispensedWeightGrams > 5.0f) {
        Serial.printf("[SPIKE REJECT] Lonjakan beban abnormal (%.1f g -> %.1f g) diabaikan!\n", 
                      dispensedWeightGrams, calc);
        // Naikkan secara halus saja agar tidak cut-off prematur
        dispensedWeightGrams += 2.0f;
      } else {
        dispensedWeightGrams = max(0.0f, calc);
      }
    }
  } else {
    isScaleReady = false;
  }

  // Log Serial periodik setiap 1 detik jika timbangan aktif
  if (now - lastLogScale >= 1000) {
    lastLogScale = now;
    if (isScaleReady && abs(currentLiveWeight) >= 1.0f) {
      Serial.printf("[HX711 LIVE] Berat: %.1f g | Tara: %.1f g | Bruto: %.1f g (Raw: %ld)\n",
                    currentLiveWeight, containerTareWeight, currentLiveWeight + containerTareWeight, lastRawAdcReading);
    }
  }
}

inline void resetAutoTareState() {
  isAutoTareDone = false;
  tareStabilityStartTime = 0;
  lastTareCandidateWeight = 0.0f;
}

// Logika Evaluasi Auto-Tare Otomatis dengan Filter Kestabilan 500 ms
inline void checkAutoTareStability() {
  if (currentScreen != SCREEN_PLACE_TUMBLER) return;

  unsigned long now = millis();

  // KASUS 1: Jika sudah berhasil di-tare, cek apakah wadah terangkat/ditarik kembali sebelum mulai
  if (isAutoTareDone) {
    // Wadah terangkat jika sensor ultrasonik kosong atau berat netto turun drastis ke negatif (< -15g)
    if (!isTumblerPresent || currentLiveWeight < -15.0f) {
      Serial.printf("[AUTO-TARE CANCEL] Wadah terangkat kembali sebelum air mengalir! (Berat: %.1f g)\n", currentLiveWeight);
      resetAutoTareState();
      containerTareWeight = 0.0f;
      beepOnce(100);
    }
    return;
  }

  // KASUS 2: Belum di-tare -> Deteksi apakah wadah kosong diletakkan
  // Syarat: Sensor ultrasonik terdeteksi DAN ada beban fisik minimal (> 15 gram)
  if (isTumblerPresent && currentLiveWeight >= 15.0f) {
    // Cek kestabilan: Apakah beban tidak berfluktuasi lebih dari +- 2.0 gram
    if (abs(currentLiveWeight - lastTareCandidateWeight) <= 2.0f) {
      if (tareStabilityStartTime == 0) {
        tareStabilityStartTime = now;
      } else if (now - tareStabilityStartTime >= 500) {
        // Beban sudah stabil selama 500 ms penuh (tangan customer sudah lepas!)
        Serial.printf("[AUTO-TARE TRIGGER] Beban stabil %.1f gram selama 500ms. Menolkan timbangan...\n", currentLiveWeight);
        tareScale();
        isAutoTareDone = true;
        tareStabilityStartTime = 0;
      }
    } else {
      // Masih goyang / tangan customer masih memegang botol
      lastTareCandidateWeight = currentLiveWeight;
      tareStabilityStartTime = now;
    }
  } else {
    // Wadah belum diletakkan atau beban < 15 gram
    tareStabilityStartTime = 0;
    lastTareCandidateWeight = currentLiveWeight;
  }
}

