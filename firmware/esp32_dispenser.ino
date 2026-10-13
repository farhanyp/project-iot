/*
 * Firmware ESP32 Dispenser Air Minum Otomatis Berbayar (WaterVend IoT)
 * Versi Refaktor Modular (TFT ST7789 240x320, Load Cell HX711, Pompa BR314, MQTT & QRIS)
 * 
 * Struktur Modular:
 * - config.h        : Definisi pin hardware, parameter sistem, dan variabel global
 * - pump_control.h  : Driver kontrol relay pompa air BR314
 * - scale_sensor.h  : Driver sensor berat Load Cell 5kg + modul HX711
 * - display_ui.h    : Tampilan LCD TFT SPI ST7789 & generator QR Code QRIS
 * - network_mqtt.h  : Jaringan WiFiManager captive portal & protokol MQTT IoT
 */

#include "config.h"
#include "pump_control.h"
#include "scale_sensor.h"
#include "display_ui.h"
#include "network_mqtt.h"

// ==============================================================================
// INISIALISASI OBJEK HARDWARE & VARIABEL GLOBAL
// ==============================================================================
Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);
HX711 scale;
Preferences preferences;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

char mqtt_broker[40]                  = "192.168.1.4"; // Default broker
float calibrationFactor               = -420.0f;
float maxWeightLimitGrams             = 2500.0f;
bool isScaleReady                     = false;
long lastRawAdcReading                = 0;
long lastRawValueNet                  = 0;
float initialContainerWeight          = 0.0f;
float dispensedWeightGrams            = 0.0f;
float currentLiveWeight               = 0.0f;
unsigned long lastTelemetryPublishTime = 0;

bool isDispensing                     = false;
unsigned long targetMilliLitres       = 0;
unsigned long dispensedMilliLitres    = 0;
unsigned long dispenseStartTime       = 0;
String currentTransactionId           = "";

ScreenState currentScreen             = SCREEN_BOOT;
float lastWeightShown                 = -999.0f;
unsigned long lastMlShown             = 999999;
int lastBarWidth                      = -1;
unsigned long autoResetScreenTime     = 0;

// ==============================================================================
// SETUP UTAMA
// ==============================================================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_TRIGGER_RESET_WIFI, INPUT_PULLUP);
  initPump();

  // Inisialisasi Layar LCD TFT SPI ST7789
  tft.init(240, 320);
  tft.setRotation(0); // 0 = Portrait (240x320)
  tft.fillScreen(ST77XX_BLACK);
  showBootScreen("Memulai Dispenser...");

  // Inisialisasi Sensor Timbangan Load Cell 5kg + HX711
  setupLoadCell();

  // Inisialisasi WiFiManager Captive Portal
  setupWiFiManager();

  // Konfigurasi Klien MQTT Broker
  mqttClient.setServer(mqtt_broker, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

// ==============================================================================
// LOOP UTAMA (NON-BLOCKING STATE MACHINE)
// ==============================================================================
void loop() {
  // 1. Pemeliharaan Koneksi MQTT
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  unsigned long currentMillis = millis();

  // 2. Baca Sensor Timbangan HX711 Real-Time
  updateScaleReading();

  // 3. Status 1: Proses Pengisian Air Sedang Berlangsung (Dispensing)
  if (isDispensing) {
    // Fallback jika Loadcell bermasalah: estimasi volume berbasis debit waktu
    if (!isScaleReady) {
      unsigned long elapsedTimeMs = currentMillis - dispenseStartTime;
      dispensedMilliLitres = (unsigned long)((elapsedTimeMs / 1000.0) * PUMP_FLOW_RATE_ML_PER_SEC);
      dispensedWeightGrams = (float)dispensedMilliLitres;
    }

    float totalGrossWeight = initialContainerWeight + dispensedWeightGrams;

    // Perbarui Progress Bar & Angka di Layar LCD
    updateDispensingProgress(dispensedMilliLitres, dispensedWeightGrams, targetMilliLitres);

    // Kirim Telemetri Pengisian ke Backend setiap 300 ms
    if (currentMillis - lastTelemetryPublishTime >= 300) {
      lastTelemetryPublishTime = currentMillis;

      float flowRateLpm = (PUMP_FLOW_RATE_ML_PER_SEC * 60.0) / 1000.0;
      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"flowRate\":") + String(flowRateLpm, 2) + 
                       String(",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                       String(",\"weightGrams\":") + String(dispensedWeightGrams, 1) + 
                       String(",\"grossWeight\":") + String(totalGrossWeight, 1) + 
                       String(",\"scaleRaw\":") + String(lastRawAdcReading) + 
                       String(",\"maxWeightLimit\":") + String(maxWeightLimitGrams, 1) + 
                       String(",\"isScaleReady\":") + (isScaleReady ? "true" : "false") + 
                       String(",\"targetMl\":") + String(targetMilliLitres) + 
                       String(",\"status\":\"DISPENSING\"") + 
                       String(",\"cutOffMode\":\"") + (isScaleReady ? "WEIGHT_LOADCELL" : "TIME_FALLBACK") + "\"" + 
                       String(",\"transactionId\":\"") + currentTransactionId + "\"}";
      mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
    }

    // Evaluasi Syarat Otomatis Cut-Off Pompa (Target / Keamanan Beban / Timeout)
    bool targetReached = isScaleReady ? (dispensedWeightGrams >= (float)targetMilliLitres) : (dispensedMilliLitres >= targetMilliLitres);
    bool overweightExceeded = (isScaleReady && (totalGrossWeight >= maxWeightLimitGrams) && (totalGrossWeight < 20000.0));
    unsigned long maxSafetyDuration = ((targetMilliLitres / PUMP_FLOW_RATE_ML_PER_SEC) * 1000) + 7000;
    bool timeoutSafety = (currentMillis - dispenseStartTime > maxSafetyDuration);

    if (targetReached || timeoutSafety || overweightExceeded) {
      isDispensing = false;
      stopPump();

      String statusStr = "COMPLETED";
      if (overweightExceeded) {
        statusStr = "STOPPED_OVERWEIGHT";
        showCompleteScreen("STOPPED_OVERWEIGHT", dispensedMilliLitres, dispensedWeightGrams, "Beban Melebihi Batas!");
      } else if (timeoutSafety && !targetReached) {
        statusStr = "TIMEOUT_CUTOFF";
        showCompleteScreen("TIMEOUT_CUTOFF", dispensedMilliLitres, dispensedWeightGrams, "Batas Waktu Tercapai!");
      } else {
        statusStr = "COMPLETED";
        showCompleteScreen("COMPLETED", dispensedMilliLitres, dispensedWeightGrams, "Pengisian Selesai");
      }

      String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
      String completePayload = String("{\"status\":\"") + statusStr + "\"" + 
                               String(",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                               String(",\"weightGrams\":") + String(dispensedWeightGrams, 1) + 
                               String(",\"transactionId\":\"") + currentTransactionId + "\"}";
      mqttClient.publish(topicComplete.c_str(), completePayload.c_str());

      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\"}", true);
    }
  }

  // 4. Status 2: Mode Siaga (Standby)
  else {
    checkAutoResetScreen();
    updateStandbyWeight(currentLiveWeight, isScaleReady, false);

    // Kirim Heartbeat / Telemetri Siaga setiap 400 ms
    if (currentMillis - lastTelemetryPublishTime >= 400) {
      lastTelemetryPublishTime = currentMillis;

      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"status\":\"READY\"") + 
                       String(",\"currentWeight\":") + String(currentLiveWeight, 1) + 
                       String(",\"calFactor\":") + String(calibrationFactor, 2) + 
                       String(",\"maxWeightLimit\":") + String(maxWeightLimitGrams, 1) + 
                       String(",\"isScaleReady\":") + (isScaleReady ? "true" : "false") + 
                       String(",\"scaleRaw\":") + String(lastRawAdcReading) + 
                       String(",\"cutOffMode\":\"") + (isScaleReady ? "WEIGHT_LOADCELL" : "TIME_FALLBACK") + "\"" + 
                       String(",\"dispensedMl\":0,\"targetMl\":0,\"flowRate\":0.0}");
      mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
    }
  }
}
