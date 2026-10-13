#pragma once
#include "config.h"

// ==============================================================================
// MODUL TAMPILAN LAYAR LCD TFT SPI ST7789 (240x320) & QR CODE
// ==============================================================================

// Variabel internal untuk koordinat dan skala callback rendering QR Code
static int s_qr_x = 0;
static int s_qr_y = 0;
static int s_qr_scale = 3;

// Callback fungsi yang dipanggil otomatis oleh ESP-IDF saat QR Code selesai dibuat
static void renderQRToTFT(esp_qrcode_handle_t qrh) {
  int size = esp_qrcode_get_size(qrh);
  int qrSize = size * s_qr_scale;

  // Background putih (Quiet Zone)
  tft.fillRect(s_qr_x - 6, s_qr_y - 6, qrSize + 12, qrSize + 12, ST77XX_WHITE);

  // Gambar modul hitam (digabung horizontal agar cepat)
  for (int y = 0; y < size; y++) {
    int x = 0;
    while (x < size) {
      if (esp_qrcode_get_module(qrh, x, y)) {
        int startX = x;
        while (x < size && esp_qrcode_get_module(qrh, x, y)) {
          x++;
        }
        tft.fillRect(s_qr_x + startX * s_qr_scale, s_qr_y + y * s_qr_scale, (x - startX) * s_qr_scale, s_qr_scale, ST77XX_BLACK);
      } else {
        x++;
      }
    }
  }
}

inline void drawQR(const char* text, int xOffset, int yOffset, int scale) {
  s_qr_x = xOffset;
  s_qr_y = yOffset;
  s_qr_scale = scale;

  esp_qrcode_config_t cfg = ESP_QRCODE_CONFIG_DEFAULT();
  cfg.display_func = renderQRToTFT; // Hubungkan callback ke driver layar LCD ST7789
  cfg.max_qrcode_version = 10;      // Mendukung payload hingga versi 10 (~174 karakter untuk QRIS)
  cfg.qrcode_ecc_level = ESP_QRCODE_ECC_MED;

  esp_err_t res = esp_qrcode_generate(&cfg, text);
  if (res != ESP_OK) {
    Serial.printf("[QR] Gagal men-generate QR Code! (Error: %d)\n", res);
  }
}

inline void showBootScreen(const char* msg) {
  currentScreen = SCREEN_BOOT;
  tft.fillScreen(ST77XX_BLACK);

  tft.fillRect(0, 0, 240, 40, ST77XX_BLUE);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(35, 12);
  tft.print("WATERVEND IoT");

  tft.setTextColor(ST77XX_CYAN);
  tft.setTextSize(1);
  tft.setCursor(25, 70);
  tft.print("Dispenser Air Minum Mandiri");

  tft.setTextColor(ST77XX_YELLOW);
  tft.setTextSize(1);
  tft.setCursor(15, 130);
  tft.print(msg);

  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(15, 260);
  tft.print("Menghubungkan Jaringan...");
}

inline void showStandbyScreen() {
  currentScreen = SCREEN_STANDBY;
  lastWeightShown = -999.0;
  tft.fillScreen(ST77XX_BLACK);

  // Header Banner
  tft.fillRect(0, 0, 240, 36, ST77XX_BLUE);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(35, 10);
  tft.print("WATERVEND IoT");

  // Kotak Menu 1
  tft.drawRoundRect(10, 44, 220, 52, 6, ST77XX_CYAN);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(20, 50);
  tft.print("1. Gelas (250 mL)");
  tft.setTextColor(ST77XX_GREEN);
  tft.setTextSize(1);
  tft.setCursor(20, 74);
  tft.print("Tarif: Rp 2.500");

  // Kotak Menu 2
  tft.drawRoundRect(10, 102, 220, 52, 6, ST77XX_CYAN);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(20, 108);
  tft.print("2. Botol (600 mL)");
  tft.setTextColor(ST77XX_GREEN);
  tft.setTextSize(1);
  tft.setCursor(20, 132);
  tft.print("Tarif: Rp 6.000");

  // Kotak Menu 3
  tft.drawRoundRect(10, 160, 220, 52, 6, ST77XX_CYAN);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(20, 166);
  tft.print("3. Teko (1500 mL)");
  tft.setTextColor(ST77XX_GREEN);
  tft.setTextSize(1);
  tft.setCursor(20, 190);
  tft.print("Tarif: Rp 15.000");

  // Footer Status Timbangan
  tft.fillRect(0, 220, 240, 100, 0x10E8); // Dark Slate Blue
  tft.drawFastHLine(0, 220, 240, ST77XX_CYAN);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(20, 272);
  tft.print("Pilih Menu di Layar / Web");
  tft.setTextColor(ST77XX_CYAN);
  tft.setCursor(20, 296);
  tft.print("WiFi: AKTIF | MQTT: TERHUBUNG");
}

inline void updateStandbyWeight(float weightGrams, bool isReady, bool force = false) {
  if (currentScreen != SCREEN_STANDBY) return;
  if (!force && abs(weightGrams - lastWeightShown) < 0.5) return;
  
  lastWeightShown = weightGrams;
  tft.fillRect(10, 230, 220, 34, 0x10E8);

  tft.setCursor(20, 236);
  if (isReady) {
    tft.setTextColor(ST77XX_YELLOW);
    tft.setTextSize(2);
    tft.printf("Beban: %.1f g", weightGrams);
    tft.setTextColor(ST77XX_GREEN);
    tft.setTextSize(1);
    tft.setCursor(185, 240);
    tft.print("[SIAP]");
  } else {
    tft.setTextColor(ST77XX_RED);
    tft.setTextSize(2);
    tft.print("Beban: -- g");
    tft.setTextSize(1);
    tft.setCursor(170, 240);
    tft.print("[CEK HX]");
  }
}

inline void showQRISScreen(const char* nominal, const char* qrPayload) {
  currentScreen = SCREEN_QRIS;
  tft.fillScreen(ST77XX_BLACK);

  // Header QRIS
  tft.fillRect(0, 0, 240, 34, 0xD800); // Merah QRIS
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(35, 9);
  tft.print("BAYAR VIA QRIS");

  // Render QR Code (skala 4 = 116px untuk versi 3)
  int qrScale = 4;
  int qrSize = 29 * qrScale;
  int qrX = (240 - qrSize) / 2;
  int qrY = 46;
  drawQR(qrPayload, qrX, qrY, qrScale);

  // Nominal & Info
  int bottomY = qrY + qrSize + 14;
  tft.setTextColor(ST77XX_YELLOW);
  tft.setTextSize(2);
  tft.setCursor(30, bottomY);
  tft.printf("Rp %s", nominal);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(15, bottomY + 26);
  tft.print("Gopay / OVO / Dana / BCA / LinkAja");

  tft.setTextColor(ST77XX_GREEN);
  tft.setCursor(20, bottomY + 46);
  tft.print("Menunggu Konfirmasi Bayar...");
}

inline void showDispensingScreen(unsigned long targetMl) {
  currentScreen = SCREEN_DISPENSING;
  lastMlShown = 999999;
  lastBarWidth = -1;
  tft.fillScreen(ST77XX_BLACK);

  // Header Banner
  tft.fillRect(0, 0, 240, 36, ST77XX_BLUE);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(35, 10);
  tft.print("PENGISIAN AIR");

  tft.setTextColor(ST77XX_CYAN);
  tft.setTextSize(2);
  tft.setCursor(20, 50);
  tft.printf("Target: %lu mL", targetMl);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(20, 82);
  tft.print("Volume Air Terisi:");

  tft.setCursor(20, 148);
  tft.print("Berat Wadah + Air:");

  tft.drawRect(20, 218, 200, 24, ST77XX_WHITE);
  tft.setTextColor(ST77XX_RED);
  tft.setCursor(20, 260);
  tft.print("Pompa Aktif | [STOP] di Web");
}

inline void updateDispensingProgress(unsigned long dispensedMl, float weightGrams, unsigned long targetMl) {
  if (currentScreen != SCREEN_DISPENSING) return;
  if (dispensedMl == lastMlShown) return;
  lastMlShown = dispensedMl;

  // Angka volume mL
  tft.fillRect(20, 100, 200, 36, ST77XX_BLACK);
  tft.setTextColor(ST77XX_YELLOW);
  tft.setTextSize(2);
  tft.setCursor(20, 104);
  tft.printf("%lu mL", dispensedMl);

  // Angka berat gram
  tft.fillRect(20, 166, 200, 34, ST77XX_BLACK);
  tft.setTextColor(ST77XX_GREEN);
  tft.setTextSize(2);
  tft.setCursor(20, 170);
  tft.printf("%.1f gram", weightGrams);

  // Progress Bar
  float pct = (targetMl > 0) ? ((float)dispensedMl / (float)targetMl) : 0.0;
  if (pct > 1.0) pct = 1.0;
  int targetW = (int)(pct * 196.0);

  if (targetW > lastBarWidth) {
    int startX = 22 + max(0, lastBarWidth);
    int drawW = targetW - max(0, lastBarWidth);
    tft.fillRect(startX, 220, drawW, 20, ST77XX_CYAN);
    lastBarWidth = targetW;
  }
}

inline void showCompleteScreen(const char* status, unsigned long dispensedMl, float weightGrams, const char* message) {
  currentScreen = SCREEN_COMPLETE;
  autoResetScreenTime = millis() + 5000; // Otomatis kembali ke standby setelah 5 detik
  tft.fillScreen(ST77XX_BLACK);

  if (strcmp(status, "COMPLETED") == 0) {
    tft.fillRect(0, 0, 240, 40, ST77XX_GREEN);
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(2);
    tft.setCursor(25, 12);
    tft.print("PENGISIAN SELESAI!");

    tft.setTextColor(ST77XX_YELLOW);
    tft.setCursor(25, 75);
    tft.printf("Total: %lu mL", dispensedMl);

    tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(25, 115);
    tft.printf("Berat: %.1f g", weightGrams);

    tft.setTextColor(ST77XX_GREEN);
    tft.setTextSize(1);
    tft.setCursor(15, 170);
    tft.print("Silakan ambil botol / wadah Anda.");

    tft.setTextColor(ST77XX_CYAN);
    tft.setTextSize(2);
    tft.setCursor(45, 215);
    tft.print("Terima Kasih!");
  } else {
    tft.fillRect(0, 0, 240, 40, ST77XX_RED);
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(2);
    tft.setCursor(35, 12);
    tft.print("STOP DARURAT !");

    tft.setTextColor(ST77XX_YELLOW);
    tft.setCursor(25, 75);
    tft.printf("Terisi: %lu mL", dispensedMl);

    tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(25, 115);
    tft.printf("Berat : %.1f g", weightGrams);

    tft.setTextColor(ST77XX_RED);
    tft.setTextSize(1);
    tft.setCursor(15, 170);
    tft.print(message);

    tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(15, 200);
    tft.print("Pompa telah dimatikan seketika.");
  }
}

inline void checkAutoResetScreen() {
  if (currentScreen == SCREEN_COMPLETE && millis() >= autoResetScreenTime) {
    showStandbyScreen();
  }
}
