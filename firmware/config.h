#pragma once

#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiManager.h>      // Library WiFiManager oleh tzapu
#include <Preferences.h>      // Simpan IP MQTT, Kalibrasi & Batas Berat ke NVS Flash
#include "HX711.h"            // Library HX711 oleh bogde
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
#include <qrcode.h>

// ==============================================================================
// 1. DEFINISI PIN PERANGKAT KERAS (HARDWARE PINOUT)
// ==============================================================================

// Pin Layar LCD TFT SPI ST7789 (240x320)
#define TFT_CS    17   // GPIO 17 (Ubah ke -1 jika modul LCD 7-pin tanpa CS)
#define TFT_DC     2   // GPIO 2  (Data / Command)
#define TFT_RST   15   // GPIO 15 (Reset)
// Catatan: SCL/SCK = GPIO 18, SDA/MOSI = GPIO 23 (Hardware VSPI default ESP32)

// Pin Sensor Berat HX711 (Load Cell 5kg)
const int PIN_HX711_DT        = 16; // GPIO 16 (DT / Data)
const int PIN_HX711_SCK       = 4;  // GPIO 4  (SCK / Clock)

// Pin Modul Relay 2 Channel
const int PIN_RELAY_PUMP_CH1  = 5;  // GPIO 5  (Pompa BR314, Active LOW)
const int PIN_RELAY_SPARE_CH2 = 19; // GPIO 19 (Cadangan / Spare)

// Pin Tombol BOOT Onboard untuk Reset Pengaturan WiFi
const int PIN_TRIGGER_RESET_WIFI = 0; // GPIO 0 (Tombol BOOT ESP32)

#define RELAY_ACTIVE_STATE LOW

// ==============================================================================
// 2. KONFIGURASI PARAMETER SISTEM
// ==============================================================================
const float PUMP_FLOW_RATE_ML_PER_SEC = 25.0f; // Estimasi debit pompa: 25 mL/detik (~1.5 L/menit)
const int   MQTT_PORT                 = 1883;
const char* DEVICE_ID                 = "DISPENSER-01";

// ==============================================================================
// 3. ENUM STATUS TAMPILAN LAYAR
// ==============================================================================
enum ScreenState {
  SCREEN_BOOT,
  SCREEN_STANDBY,
  SCREEN_QRIS,
  SCREEN_DISPENSING,
  SCREEN_COMPLETE
};

// ==============================================================================
// 4. DEKLARASI INSTANCE OBJEK & VARIABEL GLOBAL (EXTERN)
// ==============================================================================
extern Adafruit_ST7789 tft;
extern HX711 scale;
extern Preferences preferences;
extern WiFiClient espClient;
extern PubSubClient mqttClient;

extern char mqtt_broker[40];
extern float calibrationFactor;
extern float maxWeightLimitGrams;
extern bool isScaleReady;
extern long lastRawAdcReading;
extern long lastRawValueNet;
extern float initialContainerWeight;
extern float dispensedWeightGrams;
extern float currentLiveWeight;
extern unsigned long lastTelemetryPublishTime;

extern bool isDispensing;
extern unsigned long targetMilliLitres;
extern unsigned long dispensedMilliLitres;
extern unsigned long dispenseStartTime;
extern String currentTransactionId;

extern ScreenState currentScreen;
extern float lastWeightShown;
extern unsigned long lastMlShown;
extern int lastBarWidth;
extern unsigned long autoResetScreenTime;
