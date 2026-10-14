#include <SPI.h>
#include <TFT_eSPI.h>

TFT_eSPI tft = TFT_eSPI();

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n[TEST] Memulai pengujian mandiri LCD TFT ST7789...");

  // Reset fisik pin RST
  pinMode(15, OUTPUT);
  digitalWrite(15, HIGH);
  delay(50);
  digitalWrite(15, LOW);
  delay(100);
  digitalWrite(15, HIGH);
  delay(150);

  // Inisialisasi layar
  tft.init();
  tft.setRotation(0);

  Serial.println("[TEST] Mengisi layar dengan warna MERAH...");
  tft.fillScreen(TFT_RED);
  delay(1000);

  Serial.println("[TEST] Mengisi layar dengan warna HIJAU...");
  tft.fillScreen(TFT_GREEN);
  delay(1000);

  Serial.println("[TEST] Mengisi layar dengan warna BIRU...");
  tft.fillScreen(TFT_BLUE);
  delay(1000);

  Serial.println("[TEST] Mengisi layar dengan warna HITAM & menampilkan teks...");
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 100);
  tft.println("TFT_eSPI OK!");

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(1);
  tft.setCursor(20, 140);
  tft.println("Dispenser System Ready");
}

void loop() {
  // Berkedip titik indikator status hidup
  static unsigned long lastBlink = 0;
  static bool dotState = false;
  if (millis() - lastBlink > 500) {
    lastBlink = millis();
    dotState = !dotState;
    tft.fillCircle(120, 200, 10, dotState ? TFT_CYAN : TFT_BLACK);
  }
}
