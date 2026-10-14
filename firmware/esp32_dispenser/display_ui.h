#pragma once
#include "config.h"

// ==============================================================================
// MODUL TAMPILAN LAYAR LCD TFT ST7789 & TOUCH XPT2046 DENGAN TFT_eSPI
// (Akselerasi Hardware SPI 40MHz, NVS Touch Auto-Calibration, & Zero-Glitch)
// ==============================================================================

// Inisialisasi kalibrasi layar sentuh dengan penyimpanan NVS Flash permanen
inline void initTouchCalibration(bool forceRecalibrate = false) {
  preferences.begin("wv_touch_cal", false);
  bool hasCal = preferences.isKey("cal_done");

  // Kalibrasi hanya berjalan jika tombol BOOT ditekan saat boot (forceRecalibrate == true)
  if (forceRecalibrate) {
    Serial.println("\n[TOUCH CAL] Memulai proses kalibrasi sentuh 2-titik interaktif...");
    tft.fillScreen(TFT_BLACK);
    
    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(15, 60);
    tft.print("KALIBRASI SENTUH");

    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.setTextSize(1);
    tft.setCursor(15, 95);
    tft.print("Sentuh titik merah yang muncul");
    tft.setCursor(15, 110);
    tft.print("di sudut layar satu per satu...");

    // Titik 1: Sudut Kiri-Atas (25, 25)
    tft.fillCircle(25, 25, 8, TFT_RED);
    tft.drawCircle(25, 25, 10, TFT_WHITE);
    unsigned long waitStart = millis();
    TS_Point p1;
    while (millis() - waitStart < 8000) {
      if (ts.touched()) {
        p1 = ts.getPoint();
        if (p1.z > 150) break;
      }
      delay(20);
    }
    tft.fillCircle(25, 25, 12, TFT_BLACK);
    delay(400);

    // Titik 2: Sudut Kanan-Bawah (215, 295)
    tft.fillCircle(215, 295, 8, TFT_RED);
    tft.drawCircle(215, 295, 10, TFT_WHITE);
    waitStart = millis();
    TS_Point p2;
    while (millis() - waitStart < 8000) {
      if (ts.touched()) {
        p2 = ts.getPoint();
        if (p2.z > 150) break;
      }
      delay(20);
    }
    tft.fillCircle(215, 295, 12, TFT_BLACK);

    if (p1.z > 0 && p2.z > 0) {
      touchMinX = min(p1.x, p2.x);
      touchMaxX = max(p1.x, p2.x);
      touchMinY = min(p1.y, p2.y);
      touchMaxY = max(p1.y, p2.y);

      preferences.putUShort("minX", touchMinX);
      preferences.putUShort("maxX", touchMaxX);
      preferences.putUShort("minY", touchMinY);
      preferences.putUShort("maxY", touchMaxY);
      preferences.putBool("cal_done", true);
      Serial.printf("[TOUCH CAL] Kalibrasi baru tersimpan: X(%d-%d), Y(%d-%d)\n",
                    touchMinX, touchMaxX, touchMinY, touchMaxY);
    } else {
      // Fallback ke nilai standar jika timeout tidak disentuh
      touchMinX = 260;
      touchMaxX = 3700;
      touchMinY = 260;
      touchMaxY = 3700;
      Serial.println("[TOUCH CAL] Timeout! Menggunakan nilai kalibrasi default.");
    }

    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(30, 140);
    tft.print("KALIBRASI SELESAI!");
    delay(500);
  } else if (hasCal) {
    touchMinX = preferences.getUShort("minX", 260);
    touchMaxX = preferences.getUShort("maxX", 3700);
    touchMinY = preferences.getUShort("minY", 260);
    touchMaxY = preferences.getUShort("maxY", 3700);
    Serial.printf("[TOUCH CAL] Kalibrasi dimuat dari NVS: X(%d-%d), Y(%d-%d)\n",
                  touchMinX, touchMaxX, touchMinY, touchMaxY);
  } else {
    // Nilai standar default ADC XPT2046 240x320
    touchMinX = 260;
    touchMaxX = 3700;
    touchMinY = 260;
    touchMaxY = 3700;
  }
  preferences.end();
}

// Pembacaan sentuhan layar yang stabil, presisi, dan bebas konflik bus SPI
inline bool getDisplayTouch(int &touchX, int &touchY) {
  // 1. Pastikan Chip Select LCD tidak aktif saat membaca Touch Screen
  digitalWrite(TFT_CS, HIGH);

  // 2. Baca hardware touch via SPI polling
  if (!ts.touched()) return false;

  TS_Point p = ts.getPoint();
  if (p.z < 150) return false; // Filter sentuhan melayang / noise (ambang batas lebih responsif)

  // Validasi fisik: Jika X=0 dan Y=0 dengan Z>0, ini indikator jalur MISO/T_DO membaca 0 bit (kabel belum tersambung / floating)
  if (p.x == 0 && p.y == 0) {
    static unsigned long lastZeroWarn = 0;
    if (millis() - lastZeroWarn > 2000) {
      lastZeroWarn = millis();
      Serial.println("[TOUCH HARDWARE ERROR] MISO membaca 0! Periksa T_DO -> GPIO 19, T_CLK -> GPIO 18, T_CS -> GPIO 21, dan VCC 5V!");
    }
    return false;
  }

  // 3. Mapping koordinat ADC ke resolusi layar
  touchX = map(p.x, touchMinX, touchMaxX, 0, DISP_WIDTH);
  touchY = map(p.y, touchMinY, touchMaxY, 0, DISP_HEIGHT);

  #if defined(TS_FLIP_X) && TS_FLIP_X
  touchX = DISP_WIDTH - touchX;
  #endif
  #if defined(TS_FLIP_Y) && TS_FLIP_Y
  touchY = DISP_HEIGHT - touchY;
  #endif

  touchX = constrain(touchX, 0, DISP_WIDTH);
  touchY = constrain(touchY, 0, DISP_HEIGHT);

  // Log Serial otomatis untuk diagnosa dan kalibrasi langsung di Serial Monitor
  static unsigned long lastTouchLog = 0;
  if (millis() - lastTouchLog > 200) {
    lastTouchLog = millis();
    Serial.printf("[TOUCH] Raw ADC: x=%d, y=%d, z=%d -> Posisi Layar: (%d, %d)\n",
                  p.x, p.y, p.z, touchX, touchY);
  }

  return true;
}

// Inisialisasi driver layar dan touch screen
inline void initDisplayDriver() {
  pinMode(TFT_CS, OUTPUT);
  digitalWrite(TFT_CS, HIGH);
  pinMode(TOUCH_CS, OUTPUT);
  digitalWrite(TOUCH_CS, HIGH);
  pinMode(TOUCH_IRQ_PIN, INPUT_PULLUP);

  // Pulsa hardware reset yang stabil (100ms) persis seperti Adafruit_ST7789
  pinMode(TFT_RST, OUTPUT);
  digitalWrite(TFT_RST, HIGH);
  delay(50);
  digitalWrite(TFT_RST, LOW);
  delay(100);
  digitalWrite(TFT_RST, HIGH);
  delay(150);

  tft.init();
  tft.setRotation(DISP_ROTATION);
  tft.invertDisplay(false);

  // Perbaiki orientasi register MADCTL ST7789 agar teks tidak cermin (kiri-ke-kanan)
  tft.startWrite();
  tft.writecommand(0x36); // 0x36 = ST7789 MADCTL register
  tft.writedata(TFT_MADCTL_VAL);
  tft.endWrite();

  // Inisialisasi SPI hardware untuk XPT2046 dengan pin eksplisit
  SPI.begin(18, 19, 23, TOUCH_CS);
  ts.begin(SPI);
  ts.setRotation(DISP_ROTATION);

  // Jika tombol BOOT (GPIO 0) ditekan saat menyala, paksa masuk mode kalibrasi
  bool forceRecal = (digitalRead(PIN_TRIGGER_RESET_WIFI) == LOW);
  initTouchCalibration(forceRecal);

  tft.fillScreen(TFT_BLACK);
  Serial.println("[TFT_eSPI] Display ST7789 & Touch XPT2046 siap di 40MHz!");
}

// Variabel internal koordinat QR Code
static int s_qr_x = 0;
static int s_qr_y = 0;
static int s_qr_scale = 4;

static void renderQRToTFT(esp_qrcode_handle_t qrh) {
  int size = esp_qrcode_get_size(qrh);
  if (size <= 0) return;

  // Hitung skala otomatis agar QR Code tampil maksimal & mudah dibaca kamera HP
  int optimalScale = (DISP_WIDTH - 12) / size;
  if (optimalScale < 1) optimalScale = 1;
  s_qr_scale = optimalScale;

  int qrSize = size * s_qr_scale;
  int actualX = (DISP_WIDTH - qrSize) / 2;
  if (actualX < 4) actualX = 4;
  s_qr_x = actualX;

  // Kunci transaksi SPI untuk transfer super cepat (< 5 milidetik)
  tft.startWrite();

  // Background putih penuh (Quiet Zone)
  tft.fillRect(s_qr_x - 4, s_qr_y - 4, qrSize + 8, qrSize + 8, TFT_WHITE);

  // Gambar modul hitam baris horizontal (run-length compression)
  for (int y = 0; y < size; y++) {
    int x = 0;
    while (x < size) {
      if (esp_qrcode_get_module(qrh, x, y)) {
        int startX = x;
        while (x < size && esp_qrcode_get_module(qrh, x, y)) {
          x++;
        }
        tft.fillRect(s_qr_x + startX * s_qr_scale, s_qr_y + y * s_qr_scale, (x - startX) * s_qr_scale, s_qr_scale, TFT_BLACK);
      } else {
        x++;
      }
    }
  }

  tft.endWrite();
}

inline void drawQR(const char* text, int xOffset, int yOffset) {
  s_qr_x = xOffset;
  s_qr_y = yOffset;

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
// 1. TAMPILAN BOOT & STATUS WI-FI
// ==============================================================================
inline void showBootWifiScreen(const char* ssid, const char* ip, const char* statusMsg) {
  currentScreen = SCREEN_BOOT_WIFI;
  tft.fillScreen(TFT_BLACK);

  // Header Banner
  tft.fillRect(0, 0, DISP_WIDTH, 32, TFT_BLUE);
  tft.setTextColor(TFT_WHITE, TFT_BLUE);
  tft.setTextSize(2);
  tft.setCursor(35, 8);
  tft.print("WATERVEND IoT");

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setTextSize(1);
  tft.setCursor(30, 42);
  tft.print("Smart Water Refill Station");

  // Kotak Info Wi-Fi
  tft.drawRoundRect(10, 62, 220, 78, 6, TFT_WHITE);
  tft.fillRect(15, 54, 95, 14, TFT_BLACK);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setCursor(20, 56);
  tft.print("[ STATUS WI-FI ]");

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 74);
  tft.printf("SSID : %s", ssid && strlen(ssid) > 0 ? ssid : "Mencari Wi-Fi...");

  tft.setCursor(20, 94);
  tft.printf("IP   : %s", ip && strlen(ip) > 0 ? ip : "Menunggu IP...");

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setCursor(20, 114);
  tft.printf("Info : %s", statusMsg);

  // Kotak Info MQTT Broker
  tft.drawRoundRect(10, 148, 220, 52, 6, TFT_CYAN);
  tft.fillRect(15, 140, 90, 14, TFT_BLACK);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(20, 142);
  tft.print("[ IOT SERVER ]");

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 162);
  tft.printf("Broker : %s:%d", mqtt_broker, MQTT_PORT);

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setCursor(20, 180);
  tft.print("Menghubungkan ke Cloud Web...");
}

// ==============================================================================
// 2. TAMPILAN MENU STANDBY (DINAMIS DARI DATABASE WEB)
// ==============================================================================
inline void showStandbyScreen() {
  currentScreen = SCREEN_STANDBY;
  tft.fillScreen(TFT_BLACK);

  // Header Banner
  tft.fillRect(0, 0, DISP_WIDTH, 32, TFT_BLUE);
  tft.setTextColor(TFT_WHITE, TFT_BLUE);
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
    tft.drawRoundRect(10, y, 220, cardH, 6, TFT_CYAN);
    tft.fillRect(12, y + 2, 4, cardH - 4, TFT_CYAN); // Aksen garis kiri

    // Nomor & Nama Paket
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(20, y + 6);
    tft.printf("%d. %s", i + 1, dispenserPackages[i].name);

    // Keterangan Volume & Harga
    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setTextSize(1);
    tft.setCursor(20, y + 28);
    tft.printf("Vol: %d mL | Rp %ld", dispenserPackages[i].volumeMl, dispenserPackages[i].price);

    // Badge Tombol PILIH
    tft.fillRoundRect(172, y + 10, 50, 26, 4, TFT_BLUE);
    tft.setTextColor(TFT_WHITE, TFT_BLUE);
    tft.setTextSize(1);
    tft.setCursor(182, y + 19);
    tft.print("PILIH");
  }

  // Footer Status Sistem & Debit Pompa
  int footerY = 192;
  tft.fillRect(0, footerY, DISP_WIDTH, DISP_HEIGHT - footerY, 0x10E8);
  tft.drawFastHLine(0, footerY, DISP_WIDTH, TFT_CYAN);

  tft.setTextColor(TFT_GREEN, 0x10E8);
  tft.setTextSize(1);
  tft.setCursor(15, footerY + 8);
  tft.printf("Status Dispenser: SIAP MELAYANI [READY]");

  tft.setTextColor(TFT_WHITE, 0x10E8);
  tft.setCursor(15, footerY + 24);
  tft.print("Sentuh Menu di Layar untuk Membeli");

  #if DISP_HEIGHT > 240
  tft.setTextColor(TFT_CYAN, 0x10E8);
  tft.setCursor(15, 290);
  tft.printf("Kalibrasi Debit: %.1f mL/dtk | WiFi: OK", pumpFlowRateMlPerSec);
  #endif
}

// ==============================================================================
// 3. TAMPILAN QRIS FULL SCREEN DENGAN COUNTDOWN 5 MENIT (300 DETIK)
// ==============================================================================
inline void showQRISScreen(const char* nominal, const char* qrPayload, unsigned long durationSec = 300) {
  currentScreen = SCREEN_QRIS;
  qrisStartTime = millis();
  qrisDurationSeconds = (durationSec >= 60) ? durationSec : 300;
  lastCountdownSecond = qrisDurationSeconds + 1;
  strncpy(activeNominalStr, nominal, sizeof(activeNominalStr) - 1);
  strncpy(activeQrPayload, qrPayload, sizeof(activeQrPayload) - 1);
  tft.fillScreen(TFT_BLACK);

  // 1. Header Minimalis Ramping di Bagian Paling Atas (Y: 0 - 22)
  tft.fillRect(0, 0, DISP_WIDTH, 22, 0x1084); // Dark Navy Blue
  tft.setTextColor(TFT_CYAN, 0x1084);
  tft.setTextSize(1);
  tft.setCursor(6, 6);
  tft.print("SCAN QRIS:");

  tft.setTextColor(TFT_YELLOW, 0x1084);
  tft.setCursor(72, 6);
  tft.printf("Rp %s", nominal);

  tft.setTextColor(TFT_WHITE, 0x1084);
  tft.setCursor(185, 6);
  tft.print("5 MENIT");

  // 2. Render QR Code (Mulai dari Y: 26)
  int qrY = 26;
  drawQR(qrPayload, 0, qrY);

  // 3. Frame Kotak Countdown Timer (Y: 248 - 286 pada layar 320px)
  int boxY = (DISP_HEIGHT > 240) ? 248 : 208;
  int boxH = (DISP_HEIGHT > 240) ? 36 : 28;

  tft.fillRoundRect(8, boxY, 224, boxH, 6, 0x08A9);
  tft.drawRoundRect(8, boxY, 224, boxH, 6, TFT_CYAN);

  tft.setTextColor(TFT_WHITE, 0x08A9);
  tft.setTextSize(2);
  tft.setCursor(18, boxY + (boxH - 16) / 2);
  tft.printf("WAKTU: %02lu:%02lu", durationSec / 60, durationSec % 60);

  if (DISP_HEIGHT > 240) {
    tft.setTextSize(1);
    tft.setTextColor(TFT_YELLOW, 0x08A9);
    tft.setCursor(170, boxY + 12);
    tft.print("SCAN HP");

    // 4. Tombol Sentuh Batal di Paling Bawah (Y: 292 - 316)
    tft.fillRoundRect(8, 292, 224, 24, 4, 0x3000);
    tft.drawRoundRect(8, 292, 224, 24, 4, TFT_RED);
    tft.setTextColor(TFT_WHITE, 0x3000);
    tft.setTextSize(1);
    tft.setCursor(75, 300);
    tft.print("[ BATALKAN ]");
  }
}

inline void updateQRISCountdown(unsigned long remainingSeconds) {
  if (currentScreen != SCREEN_QRIS) return;
  if (remainingSeconds == lastCountdownSecond) return;
  lastCountdownSecond = remainingSeconds;

  unsigned long mins = remainingSeconds / 60;
  unsigned long secs = remainingSeconds % 60;

  int boxY = (DISP_HEIGHT > 240) ? 248 : 208;
  int boxH = (DISP_HEIGHT > 240) ? 36 : 28;

  uint16_t borderColor = (remainingSeconds <= 30) ? TFT_RED : ((remainingSeconds <= 60) ? TFT_YELLOW : TFT_CYAN);
  uint16_t textColor = (remainingSeconds <= 30) ? TFT_RED : TFT_WHITE;

  // Redraw kotak countdown cepat tanpa kedip
  tft.fillRoundRect(8, boxY, 224, boxH, 6, 0x08A9);
  tft.drawRoundRect(8, boxY, 224, boxH, 6, borderColor);

  tft.setTextColor(textColor, 0x08A9);
  tft.setTextSize(2);
  tft.setCursor(18, boxY + (boxH - 16) / 2);
  tft.printf("WAKTU: %02lu:%02lu", mins, secs);

  if (DISP_HEIGHT > 240) {
    tft.setTextSize(1);
    if (remainingSeconds <= 30) {
      tft.setTextColor(TFT_RED, 0x08A9);
      tft.setCursor(170, boxY + 12);
      tft.print("HABIS!");
    } else {
      tft.setTextColor(TFT_YELLOW, 0x08A9);
      tft.setCursor(170, boxY + 12);
      tft.print("SCAN HP");
    }
  }
}

// ==============================================================================
// 4. TAMPILAN INSTRUKSI LETAKKAN TUMBLER & TOMBOL NEXT
// ==============================================================================
inline void showPlaceTumblerScreen(unsigned long targetMl, const char* orderId = "") {
  currentScreen = SCREEN_PLACE_TUMBLER;
  tft.fillScreen(TFT_BLACK);

  // Header Hijau Sukses
  tft.fillRect(0, 0, DISP_WIDTH, 32, TFT_GREEN);
  tft.setTextColor(TFT_WHITE, TFT_GREEN);
  tft.setTextSize(2);
  tft.setCursor(15, 8);
  tft.print("PEMBAYARAN LUNAS!");

  // Box Panduan Customer
  tft.drawRoundRect(10, 40, 220, 124, 6, TFT_WHITE);

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 50);
  tft.printf("Target: %lu mL", targetMl);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(1);
  tft.setCursor(20, 78);
  tft.print("INSTRUKSI PENGISIAN:");

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(20, 96);
  tft.print("1. Letakkan Tumbler / Botol Anda");
  tft.setCursor(20, 110);
  tft.print("   tepat di bawah corong air.");

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setCursor(20, 132);
  tft.print("2. Tekan tombol [NEXT] di bawah:");

  // Tombol Sentuh Besar [NEXT / LANJUT]
  int btnY = 174;
  int btnH = 54;
  tft.fillRoundRect(10, btnY, 220, btnH, 8, TFT_GREEN);
  tft.drawRoundRect(10, btnY, 220, btnH, 8, TFT_WHITE);

  tft.setTextColor(TFT_BLACK, TFT_GREEN);
  tft.setTextSize(2);
  tft.setCursor(32, btnY + 12);
  tft.print("LANJUT (NEXT) >");

  tft.setTextSize(1);
  tft.setCursor(25, btnY + 36);
  tft.print("Sentuh di sini untuk isi air");
}

// ==============================================================================
// 5. TAMPILAN ANIMASI AIR MENGALIR & POMPA AKTIF
// ==============================================================================
inline void showDispensingScreen(unsigned long targetMl) {
  currentScreen = SCREEN_DISPENSING;
  lastMlShown = 999999;
  lastBarWidth = -1;
  animationFrame = 0;
  lastAnimationTime = millis();
  tft.fillScreen(TFT_BLACK);

  // Header Banner
  tft.fillRect(0, 0, DISP_WIDTH, 30, TFT_BLUE);
  tft.setTextColor(TFT_WHITE, TFT_BLUE);
  tft.setTextSize(2);
  tft.setCursor(35, 7);
  tft.print("PENGISIAN AIR");

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextSize(1);
  tft.setCursor(20, 36);
  tft.print("Mohon Tunggu, Air Sedang Mengalir...");

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 52);
  tft.printf("Target: %lu mL", targetMl);

  // Outline Wadah Animasi di sebelah kanan (X: 170, Y: 76, W: 50, H: 80)
  tft.drawRect(170, 76, 50, 80, TFT_WHITE);
  tft.fillRect(185, 70, 20, 6, TFT_CYAN); // Corong dispenser di atas

  // Info Volume Terisi
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(1);
  tft.setCursor(20, 80);
  tft.print("Volume Terisi:");

  tft.setCursor(20, 122);
  tft.print("Kecepatan Aliran:");

  // Frame Progress Bar
  tft.drawRect(15, 168, 210, 20, TFT_WHITE);

  // Tombol Sentuh STOP DARURAT
  tft.fillRoundRect(15, 196, 210, 34, 6, TFT_RED);
  tft.setTextColor(TFT_WHITE, TFT_RED);
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

    tft.fillRect(20, 94, 140, 24, TFT_BLACK);
    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(20, 96);
    tft.printf("%lu mL", dispensedMl);

    tft.fillRect(20, 136, 140, 24, TFT_BLACK);
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(20, 138);
    tft.printf("%.1f mL/s", pumpFlowRateMlPerSec);

    // Progress Bar Horizontal
    int targetW = (int)(pct * 206.0f);
    if (targetW > lastBarWidth) {
      int startX = 17 + max(0, lastBarWidth);
      int drawW = targetW - max(0, lastBarWidth);
      tft.fillRect(startX, 170, drawW, 16, TFT_CYAN);
      lastBarWidth = targetW;
    }
  }

  // 2. Animasi Air Mengalir & Ketinggian Level Wadah setiap 150 ms
  if (now - lastAnimationTime >= 150) {
    lastAnimationTime = now;
    animationFrame = (animationFrame + 1) % 4;

    // Bersihkan jalur tetesan air corong (Y: 76) ke dasar (Y: 154)
    tft.fillRect(193, 76, 4, 76, TFT_BLACK);

    // Tetesan air berurutan
    int dropY1 = 80 + (animationFrame * 8);
    int dropY2 = 110 + (animationFrame * 8);
    tft.fillCircle(195, dropY1, 2, TFT_CYAN);
    tft.fillCircle(195, dropY2, 2, TFT_CYAN);

    // Animasi ketinggian air wadah
    int maxWaterH = 74;
    int curWaterH = (int)(pct * maxWaterH);
    if (curWaterH > 0) {
      tft.fillRect(172, 154 - curWaterH, 46, curWaterH, TFT_BLUE);
      tft.drawFastHLine(172, 154 - curWaterH, 46, TFT_CYAN);
    }
  }
}

// ==============================================================================
// 6. TAMPILAN PENGISIAN SELESAI & UCAPAN TERIMA KASIH (AUTO RESET KE MENU)
// ==============================================================================
inline void showCompleteScreen(const char* status, unsigned long dispensedMl, const char* message) {
  currentScreen = SCREEN_COMPLETE;
  autoResetScreenTime = millis() + 5000; // Otomatis kembali ke menu setelah 5 detik
  tft.fillScreen(TFT_BLACK);

  if (strcmp(status, "COMPLETED") == 0) {
    // Header Hijau
    tft.fillRect(0, 0, DISP_WIDTH, 36, TFT_GREEN);
    tft.setTextColor(TFT_WHITE, TFT_GREEN);
    tft.setTextSize(2);
    tft.setCursor(15, 10);
    tft.print("PENGISIAN SELESAI!");

    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(20, 52);
    tft.printf("Total: %lu mL", dispensedMl);

    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.setTextSize(1);
    tft.setCursor(20, 80);
    tft.printf("Debit Aliran: %.1f mL/detik", pumpFlowRateMlPerSec);

    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.setCursor(15, 112);
    tft.print("Silakan ambil tumbler / botol Anda.");

    // Kotak Ucapan Terima Kasih
    tft.drawRoundRect(10, 138, 220, 64, 8, TFT_CYAN);
    tft.setTextColor(TFT_CYAN, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(35, 152);
    tft.print("TERIMA KASIH!");

    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.setTextSize(1);
    tft.setCursor(40, 180);
    tft.print("Selamat Menikmati Air Segar");

    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setCursor(25, 216);
    tft.print("Kembali ke menu dalam 5 detik...");
  } else {
    // Header Merah Peringatan / Batal
    tft.fillRect(0, 0, DISP_WIDTH, 36, TFT_RED);
    tft.setTextColor(TFT_WHITE, TFT_RED);
    tft.setTextSize(2);
    tft.setCursor(25, 10);
    tft.print("PENGISIAN BERHENTI");

    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setTextSize(2);
    tft.setCursor(20, 52);
    tft.printf("Terisi: %lu mL", dispensedMl);

    tft.setTextColor(TFT_RED, TFT_BLACK);
    tft.setTextSize(1);
    tft.setCursor(15, 90);
    tft.print(message);

    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.setCursor(15, 120);
    tft.print("Pompa telah dimatikan seketika.");

    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setCursor(25, 200);
    tft.print("Kembali ke menu dalam 5 detik...");
  }
}

inline void checkAutoResetScreen() {
  if (currentScreen == SCREEN_COMPLETE && millis() >= autoResetScreenTime) {
    showStandbyScreen();
  }
}
