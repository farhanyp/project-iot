/*
 * Skrip Uji Coba LCD TFT SPI 240x320 + QR Code untuk ESP32
 * WaterVend IoT
 * 
 * Penggunaan:
 * 1. Install library di Arduino IDE:
 *    - "Adafruit GFX Library" oleh Adafruit
 *    - "Adafruit ST7735 and ST7789 Library" oleh Adafruit
 *    - "qrcode" oleh Richard Moore (ricmoo)
 * 2. Sesuaikan TFT_CS:
 *    - Jika LCD Anda ada pin CS: sambungkan ke GPIO 17 (TFT_CS = 17)
 *    - Jika LCD Anda TIDAK ADA pin CS (hanya 7 pin): set TFT_CS = -1
 * 3. Upload sketch ini ke ESP32.
 */

#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
#include <qrcode.h>

// ====== DEFINISI PIN LCD TFT SPI ======
#define TFT_CS    17   // GPIO 17 (Jika tidak ada pin CS di LCD Anda, ubah jadi -1)
#define TFT_DC     2   // GPIO 2
#define TFT_RST   15   // GPIO 15 (Reset)

// SCL / SCK  -> GPIO 18 (VSPI SCK bawaan ESP32)
// SDA / MOSI -> GPIO 23 (VSPI MOSI bawaan ESP32)

// Inisialisasi driver ST7789 via Hardware SPI
Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);

// Objek generator QR Code
QRCode qrcode;

void drawQR(const char* text, int xOffset, int yOffset, int scale) {
  // Versi QR 3 (29x29 modul) - Muat teks pembayaran / URL
  uint8_t qrcodeData[qrcode_getBufferSize(3)];
  qrcode_initText(&qrcode, qrcodeData, 3, 0, text);

  int qrSize = qrcode.size * scale;
  
  // Gambar latar belakang putih (Quiet zone)
  tft.fillRect(xOffset - 8, yOffset - 8, qrSize + 16, qrSize + 16, ST77XX_WHITE);

  // Gambar modul hitam & putih
  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      if (qrcode_getModule(&qrcode, x, y)) {
        tft.fillRect(xOffset + x * scale, yOffset + y * scale, scale, scale, ST77XX_BLACK);
      }
    }
  }
}

void showStandbyScreen() {
  tft.fillScreen(ST77XX_BLACK);

  // Header Banner
  tft.fillRect(0, 0, 240, 40, ST77XX_BLUE);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(35, 12);
  tft.print("WATERVEND IoT");

  // Kotak Menu 1
  tft.drawRoundRect(10, 50, 220, 60, 8, ST77XX_CYAN);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(20, 60);
  tft.print("1. Gelas (250 mL)");
  tft.setTextColor(ST77XX_GREEN);
  tft.setTextSize(1);
  tft.setCursor(20, 88);
  tft.print("Tarif: Rp 2.500");

  // Kotak Menu 2
  tft.drawRoundRect(10, 120, 220, 60, 8, ST77XX_CYAN);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(20, 130);
  tft.print("2. Botol (600 mL)");
  tft.setTextColor(ST77XX_GREEN);
  tft.setTextSize(1);
  tft.setCursor(20, 158);
  tft.print("Tarif: Rp 6.000");

  // Kotak Menu 3
  tft.drawRoundRect(10, 190, 220, 60, 8, ST77XX_CYAN);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(20, 200);
  tft.print("3. Teko (1500 mL)");
  tft.setTextColor(ST77XX_GREEN);
  tft.setTextSize(1);
  tft.setCursor(20, 228);
  tft.print("Tarif: Rp 15.000");

  // Footer Status Timbangan
  tft.fillRect(0, 270, 240, 50, 0x18E3); // Dark slate
  tft.setTextColor(ST77XX_YELLOW);
  tft.setTextSize(1);
  tft.setCursor(15, 278);
  tft.print("Sensor Beban: SIAP (0.0 g)");
  tft.setCursor(15, 298);
  tft.setTextColor(ST77XX_WHITE);
  tft.print("Pilih menu di layar / Web.");
}

void showQRISScreen(const char* nominal, const char* qrPayload) {
  tft.fillScreen(ST77XX_BLACK);

  // Header QRIS
  tft.fillRect(0, 0, 240, 36, 0xD000); // Merah QRIS
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(45, 10);
  tft.print("SCAN QRIS");

  // Tampilkan Kode QR (Ukuran 29 modul x scale 4 = 116px + padding)
  int qrScale = 4;
  int qrWidth = 29 * qrScale;
  int qrX = (240 - qrWidth) / 2;
  int qrY = 55;
  drawQR(qrPayload, qrX, qrY, qrScale);

  // Nominal & Instruksi
  tft.setTextColor(ST77XX_YELLOW);
  tft.setTextSize(2);
  tft.setCursor(30, 195);
  tft.printf("Rp %s", nominal);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(20, 230);
  tft.print("Gopay / OVO / Dana / BCA / LinkAja");

  tft.setCursor(35, 255);
  tft.setTextColor(ST77XX_GREEN);
  tft.print("Menunggu Konfirmasi Bayar...");
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n[TFT] Memulai inisialisasi LCD ST7789 SPI 240x320...");

  // Inisialisasi ST7789 resolusi 240 x 320
  tft.init(240, 320);
  tft.setRotation(0); // 0 = Portrait (240x320), 1 = Landscape (320x240)
  tft.fillScreen(ST77XX_BLACK);

  Serial.println("[TFT] Menampilkan Halaman Menu Standby...");
  showStandbyScreen();
  delay(4000);

  Serial.println("[TFT] Menampilkan Halaman Pembayaran QRIS...");
  // Contoh payload QRIS dummy
  showQRISScreen("6.000", "00020101021226600016ID.WATERVEND.WWW520458125303360540660005802ID5913WATERVEND IOT6007BANDUNG6304ABCD");
}

void loop() {
  // Bergantian demo tampilan setiap 6 detik
  delay(6000);
  showStandbyScreen();
  delay(6000);
  showQRISScreen("6.000", "00020101021226600016ID.WATERVEND.WWW520458125303360540660005802ID5913WATERVEND IOT6007BANDUNG6304ABCD");
}
