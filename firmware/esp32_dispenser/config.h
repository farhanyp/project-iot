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

// Catatan Pin Layar ST7789 & Touch XPT2046 (Sesuai Dokumentasi_Dispenser_DIY_Terbaru.pdf):
// Jalur Bus SPI Bersama (Layar & Touchscreen):
#define TFT_MOSI       2  // GPIO 2  (T_DIN & SDI / MOSI sesuai Dokumen Hal. 2)
#define TFT_SCLK       4  // GPIO 4  (T_CLK & SCK / Clock sesuai Dokumen Hal. 2)
#define TFT_MISO      15  // GPIO 15 (T_DO & SDI/SDO / MISO sesuai Dokumen Hal. 2)

// Jalur Kontrol Mandiri Layar LCD ST7789:
#define TFT_CS        18  // GPIO 18 (Chip Select Layar sesuai Dokumen Hal. 2)
#define TFT_DC        21  // GPIO 21 (Data / Command Layar sesuai Dokumen Hal. 2)
#define TFT_RST       19  // GPIO 19 (Reset Layar sesuai Dokumen Hal. 2)

// Jalur Kontrol Mandiri Touch Screen XPT2046:
#define TOUCH_CS      22  // GPIO 22 (Chip Select Touchscreen sesuai Dokumen Hal. 2)
#define TOUCH_IRQ_PIN 23  // GPIO 23 (T_IRQ - Interupsi Sentuhan sesuai Dokumen Hal. 2)

// Pin Modul Relay Pompa Air (Sinyal IN1 baris pin 32 pada expansion board):
const int PIN_RELAY_PUMP_CH1     = 32; // GPIO 32 (Pompa Air, Active LOW)
const int PIN_TRIGGER_RESET_WIFI = 0;  // GPIO 0 (Tombol BOOT ESP32)

// Pin Sensor Proximity Optik CHE18-30NA-B710 & Buzzer:
const int PIN_PROXIMITY_SENSOR   = 16; // GPIO 16 (Sinyal Hitam CHE18-30NA-B710, NPN NO / Active LOW)
const int PIN_BUZZER             = 27; // GPIO 27 (Wajib dipindah dari GPIO 15 agar TIDAK bentrok dengan MISO/T_DO Touch Screen!)

#define RELAY_ACTIVE_STATE LOW
extern uint8_t relayActiveState;
extern bool isDirectProximityMode;

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

// Konfigurasi Sumbu Sentuh XPT2046:
// Data fisik ADC: p.y mengontrol sumbu X layar (500=Kiri, 3400=Kanan),
// sedangkan p.x mengontrol sumbu Y layar (3400=Atas, 590=Bawah).
#define TS_SWAP_XY            true   // Tukar sumbu (p.y -> X layar, p.x -> Y layar)
#define TS_FLIP_X             false  // Tidak perlu flip X karena p.y sudah meningkat dari kiri ke kanan
#define TS_FLIP_Y             false  // Pemetaan sumbu Y diatur langsung dari 3400 ke 590

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
  NET_MSG_CMD_RESET,
  NET_MSG_CMD_RESET_WIFI
};

struct NetToUIMessage {
  NetToUIMsgType type;
  unsigned long volumeMl;
  char orderId[40];
  char nominal[16];
  char qrPayload[512];
  unsigned long timeoutSeconds;
};

// Pesan dari UI Task (Core 1) ke Network Task (Core 0)
enum UIToNetMsgType {
  UI_MSG_NONE = 0,
  UI_MSG_ORDER_REQUEST,
  UI_MSG_ORDER_CANCEL,
  UI_MSG_TELEMETRY,
  UI_MSG_COMPLETE,
  UI_MSG_STATUS_READY,
  UI_MSG_GET_PACKAGES
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
  SCREEN_LOADING,        // 2. Loading menu paket dari server/cloud
  SCREEN_STANDBY,        // 3. Daftar Menu Paket dinamis dari database
  SCREEN_QRIS,           // 4. Tampilan QRIS & countdown 5 menit
  SCREEN_PLACE_TUMBLER,  // 5. Instruksi letakkan tumbler + tombol NEXT
  SCREEN_DISPENSING,     // 6. Animasi air mengalir & pompa aktif
  SCREEN_COMPLETE,       // 7. Ucapan terima kasih & kembali ke menu
  SCREEN_FAILED          // 8. Layar kegagalan pengisian air (Air Habis / Dry-Run)
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
extern bool isDispensePaused;
extern unsigned long targetMilliLitres;
extern unsigned long dispensedMilliLitres;
extern unsigned long dispenseStartTime;
extern unsigned long activePumpDurationMs;
extern unsigned long lastPumpIterationMillis;
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
extern char activeQrPayload[512];

// Variabel Kontrol Sensor Proximity Optik CHE18-30NA-B710 & Buzzer
extern bool isTumblerPresent;
extern bool isBuzzerAlarmEnabled;
extern bool isBuzzerSounding;
extern float targetDistanceCm;
extern float currentMeasuredDistanceCm;
extern bool sensorActiveHigh;

// State Machine Buzzer Non-Blocking Bebas Konflik Antar-Core
extern volatile unsigned long buzzerBeepUntil;
extern volatile int buzzerBeepCountRemaining;
extern volatile unsigned long buzzerNextBeepTime;

// Variabel Jeda Pengisian (Wadah Terlepas)
extern unsigned long pauseStartTime;

// Variabel Pengisian Multi-Botol (Ganti Botol di Tengah Jalan)
extern unsigned long totalAccumulatedMl;
extern bool isSwitchingBottle;

// Variabel Safety Hold Button & Smart Complete Reset
extern unsigned long holdButtonStartTime;
extern bool completeBottleWasRemoved;
extern bool completeScreenReminderBeeped;
extern unsigned long completeScreenEnterTime;




