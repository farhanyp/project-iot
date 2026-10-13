#pragma once

#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiManager.h>      // Library WiFiManager oleh tzapu
#include <Preferences.h>      // Simpan IP MQTT & Kalibrasi Debit Pompa ke NVS Flash
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <XPT2046_Touchscreen.h> // Library Touch Screen XPT2046 oleh Paul Stoffregen
#include <SPI.h>
#include <qrcode.h>

// ==============================================================================
// 1. DEFINISI PIN PERANGKAT KERAS (HARDWARE PINOUT)
// ==============================================================================

// Pin Layar LCD TFT SPI ST7789
#define TFT_CS    17   // GPIO 17 (Chip Select LCD)
#define TFT_DC     2   // GPIO 2  (Data / Command)
#define TFT_RST   15   // GPIO 15 (Reset LCD)
// Catatan SPI Layar: SCL/SCK = GPIO 18, SDA/MOSI = GPIO 23 (Hardware VSPI default ESP32)

// Pin Touch Screen SPI XPT2046 (Berbagi jalur Hardware VSPI dengan Layar LCD)
#define TOUCH_CS   21  // GPIO 21 (T_CS)
#define TOUCH_IRQ  22  // GPIO 22 (T_IRQ - Interrupt deteksi sentuhan)
// Catatan SPI Touch:
// T_CLK = GPIO 18 (Digabung dengan SCK Layar)
// T_DIN = GPIO 23 (Digabung dengan MOSI Layar)
// T_DO  = GPIO 19 (MISO khusus touch)

// Pin Modul Relay Pompa Air BR314
const int PIN_RELAY_PUMP_CH1  = 5;  // GPIO 5 (Pompa Air, Active LOW)

// Pin Tombol BOOT Onboard untuk Reset Pengaturan WiFi
const int PIN_TRIGGER_RESET_WIFI = 0; // GPIO 0 (Tombol BOOT ESP32)

#define RELAY_ACTIVE_STATE LOW

// ==============================================================================
// 2. KONFIGURASI RESOLUSI, ORIENTASI & KALIBRASI TOUCH
// ==============================================================================
#define TFT_WIDTH             240
#define TFT_HEIGHT            320 // 320 untuk ST7789 240x320, 240 jika panel 1.3" 240x240 murni

// ORIENTASI LAYAR:
// 2 = Portrait Normal (Default ST7789 generik: teks terbaca normal kiri-ke-kanan)
// 0 = Portrait (Jika casing butuh rotasi 180, aktifkan TFT_FORCE_UNMIRROR_X agar tidak mirror)
#define TFT_ROTATION          2
#define TFT_FORCE_UNMIRROR_X  false
#define TFT_INVERT_COLORS     false

// Kalibrasi Koordinat ADC Touch XPT2046 ke Pixel (0 - 4095 -> 0 - 240 / 320)
#define TS_MINX 200
#define TS_MAXX 3800
#define TS_MINY 200
#define TS_MAXY 3800

// ==============================================================================
// 3. KONFIGURASI PARAMETER SISTEM & DATA PAKET
// ==============================================================================
const int   MQTT_PORT                 = 1883;
const char* DEVICE_ID                 = "DISPENSER-01";

// Struktur data paket menu dinamis dari database web
struct DispenserPackage {
  char id[38];
  char code[24];
  char name[32];
  int volumeMl;
  long price;
};

#define MAX_PACKAGES 6
extern DispenserPackage dispenserPackages[MAX_PACKAGES];
extern int totalPackages;

// ==============================================================================
// 4. ENUM STATUS TAMPILAN LAYAR (SESUAI ALUR BARU)
// ==============================================================================
enum ScreenState {
  SCREEN_BOOT_WIFI,      // 1. Tampilan WiFi & status koneksi simpel
  SCREEN_STANDBY,        // 2. Daftar Menu Paket dinamis dari database
  SCREEN_QRIS,           // 3. Tampilan QRIS & countdown 5 menit
  SCREEN_PLACE_TUMBLER,  // 4. Instruksi letakkan tumbler + tombol NEXT
  SCREEN_DISPENSING,     // 5. Animasi air mengalir & pompa aktif
  SCREEN_COMPLETE        // 6. Ucapan terima kasih & kembali ke menu
};

// ==============================================================================
// 5. DEKLARASI INSTANCE OBJEK & VARIABEL GLOBAL (EXTERN)
// ==============================================================================
extern Adafruit_ST7789 tft;
extern XPT2046_Touchscreen ts;
extern Preferences preferences;
extern WiFiClient espClient;
extern PubSubClient mqttClient;

extern char mqtt_broker[40];
extern float pumpFlowRateMlPerSec;
extern unsigned long requiredDispenseDurationMs;
extern unsigned long lastTelemetryPublishTime;

extern bool isDispensing;
extern unsigned long targetMilliLitres;
extern unsigned long dispensedMilliLitres;
extern unsigned long dispenseStartTime;
extern String currentTransactionId;

extern ScreenState currentScreen;
extern unsigned long lastMlShown;
extern int lastBarWidth;
extern unsigned long autoResetScreenTime;

// Variabel Khusus Alur Baru
extern unsigned long qrisStartTime;
extern unsigned long qrisDurationSeconds;
extern unsigned long lastCountdownSecond;
extern int activePackageIndex;
extern int animationFrame;
extern unsigned long lastAnimationTime;
extern char activeOrderId[40];
extern char activeNominalStr[16];
extern char activeQrPayload[256];
