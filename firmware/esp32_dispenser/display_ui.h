#pragma once
#include "config.h"

// ==============================================================================
// MODUL TAMPILAN LAYAR LCD TFT SPI ST7789 (240x320 / 240x240) & UI/UX INTERAKTIF
// (Versi Tanpa Sensor Berat HX711 - Tampilan Bersih & Estimasi Presisi)
// ==============================================================================

// Inisialisasi driver layar, rotasi, dan un-mirroring
inline void initDisplayDriver() {
  tft.init(TFT_WIDTH, TFT_HEIGHT);
  tft.setRotation(TFT_ROTATION);

  #if TFT_FORCE_UNMIRROR_X
    tft.startWrite();
    tft.writeCommand(0x36);
    tft.spiWrite(0x80); // MY=1, MX=0, MV=0, ML=0, BGR=0
    tft.endWrite();
  #endif

  #if TFT_INVERT_COLORS
    tft.invertDisplay(true);
  #else
    tft.invertDisplay(false);
  #endif

  tft.fillScreen(ST77XX_BLACK);
}

// Variabel internal koordinat QR Code
static int s_qr_x = 0;
static int s_qr_y = 0;
static int s_qr_scale = 3;

static void renderQRToTFT(esp_qrcode_handle_t qrh) {
  int size = esp_qrcode_get_size(qrh);
  int qrSize = size * s_qr_scale;
  int actualX = (240 - qrSize) / 2;
  if (actualX < 4) actualX = 4;
  s_qr_x = actualX;

  // Background putih (Quiet Zone)
  tft.fillRect(s_qr_x - 4, s_qr_y - 4, qrSize + 8, qrSize + 8, ST77XX_WHITE);

  // Gambar modul hitam
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
  cfg.display_func = renderQRToTFT;
  cfg.max_qrcode_version = 10;
  cfg.qrcode_ecc_level = ESP_QRCODE_ECC_MED;

  esp_err_t res = esp_qrcode_generate(&cfg, text);
  if (res != ESP_OK) {
    Serial.printf("[QR] Gagal men-generate QR Code! (Error: %d)\n", res);
  }
}

// ==============================================================================
// 1. TAMPILAN BOOT & STATUS WI-FI (SIMPEL & BERSIH)
// ==============================================================================
inline void showBootWifiScreen(const char* ssid, const char* ip, const char* statusMsg) {
  currentScreen = SCREEN_BOOT_WIFI;
  tft.fillScreen(ST77XX_BLACK);

  // Header Banner
  tft.fillRect(0, 0, 240, 32, ST77XX_BLUE);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(35, 8);
  tft.print("WATERVEND IoT");

  tft.setTextColor(ST77XX_CYAN);
  tft.setTextSize(1);
  tft.setCursor(30, 42);
  tft.print("Smart Water Refill Station");

  // Kotak Info Wi-Fi
  tft.drawRoundRect(10, 62, 220, 78, 6, ST77XX_WHITE);
  tft.fillRect(15, 54, 95, 14, ST77XX_BLACK);
  tft.setTextColor(ST77XX_YELLOW);
  tft.setCursor(20, 56);
  tft.print("[ STATUS WI-FI ]");

  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(20, 74);
  tft.printf("SSID : %s", ssid && strlen(ssid) > 0 ? ssid : "Mencari Wi-Fi...");

  tft.setCursor(20, 94);
  tft.printf("IP   : %s", ip && strlen(ip) > 0 ? ip : "Menunggu IP...");

  tft.setTextColor(ST77XX_GREEN);
  tft.setCursor(20, 114);
  tft.printf("Info : %s", statusMsg);

  // Kotak Info MQTT Broker
  tft.drawRoundRect(10, 148, 220, 52, 6, ST77XX_CYAN);
  tft.fillRect(15, 140, 90, 14, ST77XX_BLACK);
  tft.setTextColor(ST77XX_CYAN);
  tft.setCursor(20, 142);
  tft.print("[ IOT SERVER ]");

  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(20, 162);
  tft.printf("Broker : %s:%d", mqtt_broker, MQTT_PORT);

  tft.setTextColor(ST77XX_YELLOW);
  tft.setCursor(20, 180);
  tft.print("Menghubungkan ke Cloud Web...");
}

inline void showBootScreen(const char* msg) {
  showBootWifiScreen(WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), msg);
}

// ==============================================================================
// 2. TAMPILAN MENU STANDBY (DINAMIS DARI DATABASE WEB)
// ==============================================================================
inline void showStandbyScreen() {
  currentScreen = SCREEN_STANDBY;
  tft.fillScreen(ST77XX_BLACK);

  // Header Banner
  tft.fillRect(0, 0, 240, 32, ST77XX_BLUE);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(30, 8);
  tft.print("PILIH AIR MINUM");

  // Gambar kartu menu paket secara dinamis
  int cardY = 38;
  int cardH = 46;
  int cardGap = 4;
  int maxDraw = (totalPackages > 3) ? 3 : totalPackages;

  for (int i = 0; i < maxDraw; i++) {
    int y = cardY + i * (cardH + cardGap);
    
    // Frame Kotak Menu Touch
    tft.drawRoundRect(10, y, 220, cardH, 6, ST77XX_CYAN);
    tft.fillRect(12, y + 2, 4, cardH - 4, ST77XX_CYAN); // Aksen garis kiri

    // Nomor & Nama Paket
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(2);
    tft.setCursor(20, y + 6);
    tft.printf("%d. %s", i + 1, dispenserPackages[i].name);

    // Keterangan Volume & Harga
    tft.setTextColor(ST77XX_YELLOW);
    tft.setTextSize(1);
    tft.setCursor(20, y + 28);
    tft.printf("Vol: %d mL | Rp %ld", dispenserPackages[i].volumeMl, dispenserPackages[i].price);

    // Badge Tombol PILIH
    tft.fillRoundRect(172, y + 10, 50, 26, 4, ST77XX_BLUE);
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(1);
    tft.setCursor(182, y + 19);
    tft.print("PILIH");
  }

  // Footer Status Sistem & Debit Pompa
  int footerY = 192;
  tft.fillRect(0, footerY, 240, TFT_HEIGHT - footerY, 0x10E8);
  tft.drawFastHLine(0, footerY, 240, ST77XX_CYAN);

  tft.setTextColor(ST77XX_GREEN);
  tft.setTextSize(1);
  tft.setCursor(15, footerY + 8);
  tft.printf("Status Dispenser: SIAP MELAYANI [READY]");

  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(15, footerY + 24);
  tft.print("Sentuh Menu di Layar untuk Membeli");

  #if TFT_HEIGHT > 240
  tft.setTextColor(ST77XX_CYAN);
  tft.setCursor(15, 290);
  tft.printf("Kalibrasi Debit: %.1f mL/dtk | WiFi: OK", pumpFlowRateMlPerSec);
  #endif
}

// ==============================================================================
// 3. TAMPILAN QRIS DENGAN COUNTDOWN 5 MENIT (300 DETIK) & BATALKAN
// ==============================================================================
inline void showQRISScreen(const char* nominal, const char* qrPayload, unsigned long durationSec = 300) {
  currentScreen = SCREEN_QRIS;
  qrisStartTime = millis();
  qrisDurationSeconds = durationSec;
  lastCountdownSecond = durationSec + 1;
  strncpy(activeNominalStr, nominal, sizeof(activeNominalStr) - 1);
  strncpy(activeQrPayload, qrPayload, sizeof(activeQrPayload) - 1);
  tft.fillScreen(ST77XX_BLACK);

  // Header QRIS
  tft.fillRect(0, 0, 240, 30, 0xD800); // Merah QRIS
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(35, 7);
  tft.print("BAYAR VIA QRIS");

  // Render QR Code di tengah (scale 3 = 87px)
  int qrScale = 3;
  int qrY = 34;
  drawQR(qrPayload, 0, qrY, qrScale);

  // Nominal Harga
  int bottomY = 142;
  tft.setTextColor(ST77XX_YELLOW);
  tft.setTextSize(2);
  tft.setCursor(20, bottomY);
  tft.printf("Rp %s", nominal);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(15, bottomY + 20);
  tft.print("Scan dg Gopay/OVO/Dana/BCA/Shopee");

  // Countdown Waktu
  tft.setTextColor(ST77XX_CYAN);
  tft.setCursor(15, bottomY + 36);
  tft.printf("Sisa Waktu: %02lu:%02lu", durationSec / 60, durationSec % 60);

  // Tombol Sentuh: BATALKAN PESANAN
  tft.fillRoundRect(15, 198, 210, 32, 6, 0x4208);
  tft.drawRoundRect(15, 198, 210, 32, 6, ST77XX_RED);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(45, 209);
  tft.print("[ BATALKAN PESANAN ]");
}

inline void updateQRISCountdown(unsigned long remainingSeconds) {
  if (currentScreen != SCREEN_QRIS) return;
  if (remainingSeconds == lastCountdownSecond) return;
  lastCountdownSecond = remainingSeconds;

  unsigned long mins = remainingSeconds / 60;
  unsigned long secs = remainingSeconds % 60;

  tft.fillRect(15, 176, 210, 16, ST77XX_BLACK);
  tft.setCursor(15, 178);
  tft.setTextSize(1);

  if (remainingSeconds <= 30) {
    tft.setTextColor(ST77XX_RED);
    tft.printf("Sisa Waktu: %02lu:%02lu (Segera Habis!)", mins, secs);
  } else {
    tft.setTextColor(ST77XX_CYAN);
    tft.printf("Sisa Waktu: %02lu:%02lu", mins, secs);
  }
}

// ==============================================================================
// 4. TAMPILAN INSTRUKSI LETAKKAN TUMBLER & TOMBOL NEXT
// ==============================================================================
inline void showPlaceTumblerScreen(unsigned long targetMl, const char* orderId = "") {
  currentScreen = SCREEN_PLACE_TUMBLER;
  tft.fillScreen(ST77XX_BLACK);

  // Header Hijau Sukses
  tft.fillRect(0, 0, 240, 32, ST77XX_GREEN);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(15, 8);
  tft.print("PEMBAYARAN LUNAS!");

  // Box Panduan Customer
  tft.drawRoundRect(10, 40, 220, 124, 6, ST77XX_WHITE);

  tft.setTextColor(ST77XX_YELLOW);
  tft.setTextSize(2);
  tft.setCursor(20, 50);
  tft.printf("Target: %lu mL", targetMl);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(20, 78);
  tft.print("INSTRUKSI PENGISIAN:");

  tft.setTextColor(ST77XX_CYAN);
  tft.setCursor(20, 96);
  tft.print("1. Letakkan Tumbler / Botol Anda");
  tft.setCursor(20, 110);
  tft.print("   tepat di bawah corong air.");

  tft.setTextColor(ST77XX_GREEN);
  tft.setCursor(20, 132);
  tft.print("2. Tekan tombol [NEXT] di bawah:");

  // Tombol Sentuh Besar [NEXT / LANJUT]
  int btnY = 174;
  int btnH = 54;
  tft.fillRoundRect(10, btnY, 220, btnH, 8, ST77XX_GREEN);
  tft.drawRoundRect(10, btnY, 220, btnH, 8, ST77XX_WHITE);

  tft.setTextColor(ST77XX_BLACK);
  tft.setTextSize(2);
  tft.setCursor(32, btnY + 12);
  tft.print("LANJUT (NEXT) >");

  tft.setTextSize(1);
  tft.setCursor(25, btnY + 36);
  tft.print("Sentuh di sini untuk isi air");
}

// ==============================================================================
// 5. TAMPILAN ANIMASI AIR MENGALIR & POMPA AKTIF (ESTIMASI DEBIT HIDROLIK)
// ==============================================================================
inline void showDispensingScreen(unsigned long targetMl) {
  currentScreen = SCREEN_DISPENSING;
  lastMlShown = 999999;
  lastBarWidth = -1;
  animationFrame = 0;
  lastAnimationTime = millis();
  tft.fillScreen(ST77XX_BLACK);

  // Header Banner
  tft.fillRect(0, 0, 240, 30, ST77XX_BLUE);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(35, 7);
  tft.print("PENGISIAN AIR");

  tft.setTextColor(ST77XX_YELLOW);
  tft.setTextSize(1);
  tft.setCursor(20, 36);
  tft.print("Mohon Tunggu, Air Sedang Mengalir...");

  tft.setTextColor(ST77XX_CYAN);
  tft.setTextSize(2);
  tft.setCursor(20, 52);
  tft.printf("Target: %lu mL", targetMl);

  // Outline Wadah Animasi di sebelah kanan (X: 170, Y: 76, W: 50, H: 80)
  tft.drawRect(170, 76, 50, 80, ST77XX_WHITE);
  tft.fillRect(185, 70, 20, 6, ST77XX_CYAN); // Corong dispenser di atas

  // Info Volume Terisi
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(20, 80);
  tft.print("Volume Terisi:");

  tft.setCursor(20, 122);
  tft.print("Kecepatan Aliran:");

  // Frame Progress Bar
  tft.drawRect(15, 168, 210, 20, ST77XX_WHITE);

  // Tombol Sentuh STOP DARURAT
  tft.fillRoundRect(15, 196, 210, 34, 6, ST77XX_RED);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(45, 208);
  tft.print("[ STOP DARURAT / BATAL ]");
}

inline void updateDispensingAnimation(unsigned long dispensedMl, unsigned long targetMl) {
  if (currentScreen != SCREEN_DISPENSING) return;

  unsigned long now = millis();
  float pct = (targetMl > 0) ? ((float)dispensedMl / (float)targetMl) : 0.0f;
  if (pct > 1.0f) pct = 1.0f;

  // 1. Update Angka Volume jika bertambah
  if (dispensedMl != lastMlShown) {
    lastMlShown = dispensedMl;

    tft.fillRect(20, 94, 140, 24, ST77XX_BLACK);
    tft.setTextColor(ST77XX_YELLOW);
    tft.setTextSize(2);
    tft.setCursor(20, 96);
    tft.printf("%lu mL", dispensedMl);

    tft.fillRect(20, 136, 140, 24, ST77XX_BLACK);
    tft.setTextColor(ST77XX_GREEN);
    tft.setTextSize(2);
    tft.setCursor(20, 138);
    tft.printf("%.1f mL/s", pumpFlowRateMlPerSec);

    // Progress Bar Horizontal
    int targetW = (int)(pct * 206.0f);
    if (targetW > lastBarWidth) {
      int startX = 17 + max(0, lastBarWidth);
      int drawW = targetW - max(0, lastBarWidth);
      tft.fillRect(startX, 170, drawW, 16, ST77XX_CYAN);
      lastBarWidth = targetW;
    }
  }

  // 2. Animasi Air Mengalir & Level Wadah setiap 150 ms
  if (now - lastAnimationTime >= 150) {
    lastAnimationTime = now;
    animationFrame = (animationFrame + 1) % 4;

    // Bersihkan area tetesan air antara corong (Y: 76) ke dasar (Y: 154)
    tft.fillRect(193, 76, 4, 76, ST77XX_BLACK);

    // Gambar tetesan air jatuh berurutan
    int dropY1 = 80 + (animationFrame * 8);
    int dropY2 = 110 + (animationFrame * 8);
    tft.fillCircle(195, dropY1, 2, ST77XX_CYAN);
    tft.fillCircle(195, dropY2, 2, ST77XX_CYAN);

    // Animasi ketinggian air di dalam wadah
    int maxWaterH = 74;
    int curWaterH = (int)(pct * maxWaterH);
    if (curWaterH > 0) {
      tft.fillRect(172, 154 - curWaterH, 46, curWaterH, ST77XX_BLUE);
      tft.drawFastHLine(172, 154 - curWaterH, 46, ST77XX_CYAN);
    }
  }
}

// ==============================================================================
// 6. TAMPILAN PENGISIAN SELESAI & UCAPAN TERIMA KASIH (AUTO RESET KE MENU)
// ==============================================================================
inline void showCompleteScreen(const char* status, unsigned long dispensedMl, const char* message) {
  currentScreen = SCREEN_COMPLETE;
  autoResetScreenTime = millis() + 5000; // Otomatis kembali ke menu setelah 5 detik
  tft.fillScreen(ST77XX_BLACK);

  if (strcmp(status, "COMPLETED") == 0) {
    // Header Hijau
    tft.fillRect(0, 0, 240, 36, ST77XX_GREEN);
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(2);
    tft.setCursor(15, 10);
    tft.print("PENGISIAN SELESAI!");

    tft.setTextColor(ST77XX_YELLOW);
    tft.setTextSize(2);
    tft.setCursor(20, 52);
    tft.printf("Total: %lu mL", dispensedMl);

    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(1);
    tft.setCursor(20, 80);
    tft.printf("Debit Aliran: %.1f mL/detik", pumpFlowRateMlPerSec);

    tft.setTextColor(ST77XX_GREEN);
    tft.setTextSize(1);
    tft.setCursor(15, 112);
    tft.print("Silakan ambil tumbler / botol Anda.");

    // Kotak Ucapan Terima Kasih
    tft.drawRoundRect(10, 138, 220, 64, 8, ST77XX_CYAN);
    tft.setTextColor(ST77XX_CYAN);
    tft.setTextSize(2);
    tft.setCursor(35, 152);
    tft.print("TERIMA KASIH!");

    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(1);
    tft.setCursor(40, 180);
    tft.print("Selamat Menikmati Air Segar");

    tft.setTextColor(ST77XX_YELLOW);
    tft.setCursor(25, 216);
    tft.print("Kembali ke menu dalam 5 detik...");
  } else {
    // Header Merah Peringatan / Batal
    tft.fillRect(0, 0, 240, 36, ST77XX_RED);
    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(2);
    tft.setCursor(25, 10);
    tft.print("PENGISIAN BERHENTI");

    tft.setTextColor(ST77XX_YELLOW);
    tft.setTextSize(2);
    tft.setCursor(20, 52);
    tft.printf("Terisi: %lu mL", dispensedMl);

    tft.setTextColor(ST77XX_RED);
    tft.setTextSize(1);
    tft.setCursor(15, 90);
    tft.print(message);

    tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(15, 120);
    tft.print("Pompa telah dimatikan seketika.");

    tft.setTextColor(ST77XX_YELLOW);
    tft.setCursor(25, 200);
    tft.print("Kembali ke menu dalam 5 detik...");
  }
}

inline void checkAutoResetScreen() {
  if (currentScreen == SCREEN_COMPLETE && millis() >= autoResetScreenTime) {
    showStandbyScreen();
  }
}
