#pragma once

#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiManager.h>      // Library WiFiManager oleh tzapu
#include <Preferences.h>      // Simpan IP MQTT, Kalibrasi Debit, & Kalibrasi Touch ke NVS Flash
#include <TFT_eSPI.h>         // Library TFT performa tinggi dengan akselerasi hardware
#include <XPT2046_Touchscreen.h> // Library Touch Screen XPT2046
#include <SPI.h>
#include <qrcode.h>

// ==============================================================================
// 1. DEFINISI PIN PERANGKAT KERAS (HARDWARE PINOUT)
// ==============================================================================

// Catatan Pin Layar ST7789 & Touch XPT2046 (Jalur Hardware VSPI ESP32):
// TFT_MOSI / T_DIN = GPIO 23
// TFT_SCLK / T_CLK = GPIO 18
// TFT_MISO / T_DO  = GPIO 19
// TFT_CS           = GPIO 17 (Chip Select LCD)
// TFT_DC           = GPIO 2  (Data / Command LCD)
// TFT_RST          = GPIO 15 (Reset LCD)
// TOUCH_CS         = GPIO 21 (Chip Select Touch Screen XPT2046)
// TOUCH_IRQ        = GPIO 22 (T_IRQ - Deteksi interrupt sentuhan)

#define TFT_CS         17
#define TFT_DC          2
#define TFT_RST        15
#define TOUCH_CS       21
#define TOUCH_IRQ_PIN  22 // GPIO 22 untuk deteksi hardware interrupt sentuhan

// Pin Modul Relay Pompa Air BR314
const int PIN_RELAY_PUMP_CH1     = 5;  // GPIO 5 (Pompa Air, Active LOW)
const int PIN_TRIGGER_RESET_WIFI = 0;  // GPIO 0 (Tombol BOOT ESP32)

// Pin Sensor Infrared Photoelectric E18-B03P1 & Buzzer
const int PIN_PROXIMITY_SENSOR   = 26; // GPIO 26 (Kabel Hitam E18 via divider 1k/2k)
const int PIN_BUZZER             = 27; // GPIO 27 (Kaki Positif Buzzer)

#define RELAY_ACTIVE_STATE LOW

// ==============================================================================
// 2. KONFIGURASI RESOLUSI, ORIENTASI & KALIBRASI TOUCH
// ==============================================================================
#define DISP_WIDTH            240
#define DISP_HEIGHT           320 // 320 untuk ST7789 240x320
#define DISP_ROTATION         0   // Portrait

// Konfigurasi Nilai Register MADCTL ST7789 (Mengatasi Masalah Tampilan Tulisan Cermin):
// 0x40 = Portrait Kiri-ke-Kanan (MX=1, MY=0) -> Memperbaiki teks terbalik kanan-ke-kiri
// 0x00 = Default TFT_eSPI (jika panel tidak cermin)
// 0x80 = Portrait Terbalik 180 Derajat (MY=1, MX=0) -> Jika teks normal tapi kepala di bawah
// Tambahkan 0x08 jika warna Merah dan Biru tertukar (BGR) -> contoh: 0x48 atau 0x88
#define TFT_MADCTL_VAL        0x40

// Pembalik sumbu sentuh (Ubah ke true jika titik sentuh berlawanan dengan posisi tombol)
#define TS_FLIP_X             false
#define TS_FLIP_Y             false

// Alias Warna Kompatibilitas (TFT_eSPI 16-bit 565 Color)
#define ST77XX_BLACK   TFT_BLACK
#define ST77XX_WHITE   TFT_WHITE
#define ST77XX_RED     TFT_RED
#define ST77XX_GREEN   TFT_GREEN
#define ST77XX_BLUE    TFT_BLUE
#define ST77XX_CYAN    TFT_CYAN
#define ST77XX_YELLOW  TFT_YELLOW

// ==============================================================================
// 3. STRUKTUR PESAN FREERTOS ANTAR-CORE (THREAD-SAFE INTER-CORE QUEUE)
// ==============================================================================

// Pesan dari Network Task (Core 0) ke UI Task (Core 1)
enum NetToUIMsgType {
  NET_MSG_NONE = 0,
  NET_MSG_PAYMENT_SUCCESS,
  NET_MSG_SHOW_QRIS,
  NET_MSG_PACKAGES_UPDATED,
  NET_MSG_CMD_START,
  NET_MSG_CMD_STOP,
  NET_MSG_CMD_RESET
};

struct NetToUIMessage {
  NetToUIMsgType type;
  unsigned long volumeMl;
  char orderId[40];
  char nominal[16];
  char qrPayload[256];
  unsigned long timeoutSeconds;
};

// Pesan dari UI Task (Core 1) ke Network Task (Core 0)
enum UIToNetMsgType {
  UI_MSG_NONE = 0,
  UI_MSG_ORDER_REQUEST,
  UI_MSG_ORDER_CANCEL,
  UI_MSG_TELEMETRY,
  UI_MSG_COMPLETE,
  UI_MSG_STATUS_READY
};

struct UIToNetMessage {
  UIToNetMsgType type;
  unsigned long volumeMl;
  long price;
  char packageId[38];
  char packageName[32];
  char orderId[40];
  char statusStr[24];
  unsigned long dispensedMl;
  unsigned long targetMl;
  float flowRateLpm;
  float flowRateMlPerSec;
};

// Handle Antrean FreeRTOS
extern QueueHandle_t qNetToUI;
extern QueueHandle_t qUIToNet;

// ==============================================================================
// 4. KONFIGURASI PARAMETER SISTEM & DATA PAKET
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
// 5. ENUM STATUS TAMPILAN LAYAR (SESUAI ALUR 6-TAHAP)
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
// 6. DEKLARASI INSTANCE OBJEK & VARIABEL GLOBAL (EXTERN)
// ==============================================================================
extern TFT_eSPI tft;
extern XPT2046_Touchscreen ts;
extern Preferences preferences;
extern WiFiClient espClient;
extern PubSubClient mqttClient;

// Data Kalibrasi Touch XPT2046
extern uint16_t touchMinX;
extern uint16_t touchMaxX;
extern uint16_t touchMinY;
extern uint16_t touchMaxY;

extern char mqtt_broker[40];
extern float pumpFlowRateMlPerSec;
extern unsigned long requiredDispenseDurationMs;
extern unsigned long lastTelemetryPublishTime;
extern unsigned long lastMqttRetryTime;

extern bool isDispensing;
extern unsigned long targetMilliLitres;
extern unsigned long dispensedMilliLitres;
extern unsigned long dispenseStartTime;
extern String currentTransactionId;

extern ScreenState currentScreen;
extern unsigned long lastMlShown;
extern int lastBarWidth;
extern unsigned long autoResetScreenTime;

// Variabel Khusus Alur Interaktif
extern unsigned long qrisStartTime;
extern unsigned long qrisDurationSeconds;
extern unsigned long lastCountdownSecond;
extern unsigned long qrisIgnoreTouchUntil;
extern int activePackageIndex;
extern int animationFrame;
extern unsigned long lastAnimationTime;
extern char activeOrderId[40];
extern char activeNominalStr[16];
extern char activeQrPayload[256];

// Variabel Kontrol Sensor E18-B03P1 & Buzzer
extern bool isTumblerPresent;
extern bool isBuzzerAlarmEnabled;
extern bool isBuzzerSounding;
extern float targetDistanceCm;
extern bool sensorActiveHigh;

// State Machine Buzzer Non-Blocking Bebas Konflik Antar-Core
extern volatile unsigned long buzzerBeepUntil;
extern volatile int buzzerBeepCountRemaining;
extern volatile unsigned long buzzerNextBeepTime;
