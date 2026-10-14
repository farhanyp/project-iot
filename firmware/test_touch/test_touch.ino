/*
 * Skrip Diagnostik Mandiri Touch Screen XPT2046 + LCD ST7789 ESP32
 * Gunakan sketch ini untuk menguji secara instan apakah hardware touch screen
 * dan jalur perkabelan breadboard merespons dengan benar.
 *
 * Buka Serial Monitor pada baud rate 115200 setelah upload.
 */

#include <SPI.h>
#include <XPT2046_Touchscreen.h>
#include <TFT_eSPI.h>

// Definisi Pin Hardware
#define TFT_CS    17
#define TOUCH_CS  21
#define PIN_MOSI  23  // T_DIN & LCD MOSI
#define PIN_MISO  19  // T_DO
#define PIN_SCLK  18  // T_CLK & LCD SCK

TFT_eSPI tft = TFT_eSPI();
XPT2046_Touchscreen ts(TOUCH_CS);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=======================================================");
  Serial.println("   DIAGNOSTIK HARDWARE TOUCH SCREEN XPT2046 ESP32      ");
  Serial.println("=======================================================");

  // 1. Matikan Chip Select LCD agar bus SPI terisolasi khusus untuk touch
  pinMode(TFT_CS, OUTPUT);
  digitalWrite(TFT_CS, HIGH);

  // 2. Inisialisasi SPI ESP32 dengan pin hardware yang tepat
  SPI.begin(PIN_SCLK, PIN_MISO, PIN_MOSI, TOUCH_CS);

  // 3. Inisialisasi LCD ST7789 untuk visualisasi
  tft.init();
  tft.setRotation(0);
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 40);
  tft.println("TES TOUCH SCREEN");
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(1);
  tft.setCursor(20, 80);
  tft.println("Tekan/sentuh layar LCD ini...");
  tft.setCursor(20, 100);
  tft.println("Perhatikan titik koordinatnya.");

  // 4. Inisialisasi Driver Touch Screen
  ts.begin(SPI);
  ts.setRotation(0);

  Serial.println("[INFO] Driver XPT2046 siap!");
  Serial.println("[INFO] Silakan sentuh layar dengan kuku / stylus.");
  Serial.println("-------------------------------------------------------");
}

void loop() {
  // Pastikan Chip Select LCD tidak aktif
  digitalWrite(TFT_CS, HIGH);

  if (ts.touched()) {
    TS_Point p = ts.getPoint();

    // Analisa nilai ADC
    if (p.x == 0 && p.y == 0) {
      Serial.println("[ERROR] Terbaca X=0, Y=0 (MISO/T_DO membaca 0). Kabel T_DO/T_CLK belum tersambung fisik!");
      tft.fillRect(20, 140, 200, 30, TFT_RED);
      tft.setTextColor(TFT_WHITE, TFT_RED);
      tft.setCursor(25, 150);
      tft.println("KABEL T_DO/T_CLK PUTUS!");
    } else {
      // Sentuhan valid berhasil!
      Serial.printf("[SUKSES] Sentuhan Valid! Raw: X=%d, Y=%d, Z=%d\n", p.x, p.y, p.z);
      
      // Gambar lingkaran kecil di layar tepat di titik sentuh
      int screenX = map(p.x, 260, 3700, 0, 240);
      int screenY = map(p.y, 260, 3700, 0, 320);
      screenX = constrain(screenX, 0, 240);
      screenY = constrain(screenY, 0, 320);

      tft.fillCircle(screenX, screenY, 4, TFT_YELLOW);

      // Tampilkan info koordinat di layar
      tft.fillRect(20, 200, 200, 40, TFT_NAVY);
      tft.setTextColor(TFT_CYAN, TFT_NAVY);
      tft.setTextSize(1);
      tft.setCursor(25, 210);
      tft.printf("Raw: X=%d Y=%d Z=%d", p.x, p.y, p.z);
      tft.setCursor(25, 225);
      tft.printf("Pixel: (%d, %d)", screenX, screenY);
    }
    delay(80);
  }
}
