/*
 * Firmware ESP32 Dispenser Air Minum Otomatis Berbayar (WaterVend IoT)
 * Versi Interaktif Full Flow (Touch Screen XPT2046, Dynamic Menu Web, Countdown QRIS 5 Menit, Animasi Air)
 * 
 * Sistem Pemodelan Aliran Presisi Tinggi (Tanpa Sensor Berat Loadcell HX711):
 * - Memanfaatkan kalibrasi debit air berbasis waktu, inersia motor, dan kompensasi ramp-up/coasting
 * - Alur 6 Tahap UI/UX Interaktif dengan Touch Screen
 * 
 * Struktur Modular:
 * - config.h          : Definisi pin hardware, parameter sistem, paket, dan variabel global
 * - pump_control.h    : Driver kontrol relay pompa air BR314
 * - flow_calculator.h : Model hidrolik estimasi volume air presisi & kalibrasi NVS Flash
 * - display_ui.h      : Tampilan LCD TFT SPI ST7789, QRIS, Animasi Air, dan UI Touch
 * - network_mqtt.h    : Jaringan WiFiManager captive portal & protokol MQTT IoT
 */

#include "config.h"
#include "pump_control.h"
#include "flow_calculator.h"
#include "display_ui.h"
#include "network_mqtt.h"

// ==============================================================================
// INISIALISASI OBJEK HARDWARE & VARIABEL GLOBAL
// ==============================================================================
Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);
XPT2046_Touchscreen ts(TOUCH_CS, TOUCH_IRQ);
Preferences preferences;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Data paket default (akan otomatis diupdate saat terkoneksi ke backend web)
DispenserPackage dispenserPackages[MAX_PACKAGES] = {
  {"pkg-1", "CUP_250ML", "Gelas Mini", 250, 2500},
  {"pkg-2", "BOTTLE_600ML", "Botol Sedang", 600, 6000},
  {"pkg-3", "GALLON_1500ML", "Teko Besar", 1500, 15000}
};
int totalPackages = 3;

char mqtt_broker[40]                  = "192.168.1.4";
float pumpFlowRateMlPerSec            = 25.0f;
unsigned long requiredDispenseDurationMs = 0;
unsigned long lastTelemetryPublishTime = 0;

bool isDispensing                     = false;
unsigned long targetMilliLitres       = 0;
unsigned long dispensedMilliLitres    = 0;
unsigned long dispenseStartTime       = 0;
String currentTransactionId           = "";

ScreenState currentScreen             = SCREEN_BOOT_WIFI;
unsigned long lastMlShown             = 999999;
int lastBarWidth                      = -1;
unsigned long autoResetScreenTime     = 0;

// Variabel Khusus Alur Baru
unsigned long qrisStartTime           = 0;
unsigned long qrisDurationSeconds     = 300; // 5 Menit
unsigned long lastCountdownSecond     = 0;
int activePackageIndex                = -1;
int animationFrame                    = 0;
unsigned long lastAnimationTime       = 0;
char activeOrderId[40]                = "";
char activeNominalStr[16]             = "";
char activeQrPayload[256]             = "";

// ==============================================================================
// HANDLER SENTUHAN LAYAR TOUCH SCREEN (XPT2046)
// ==============================================================================
void handleTouchScreen() {
  if (!ts.touched()) return;

  TS_Point p = ts.getPoint();

  // Mapping koordinat ADC XPT2046 ke resolusi pixel 240x320
  int touchX = map(p.x, TS_MINX, TS_MAXX, 0, 240);
  int touchY = map(p.y, TS_MINY, TS_MAXY, 0, 320);
  if (TS_FLIP_X) touchX = 240 - touchX;
  if (TS_FLIP_Y) touchY = 320 - touchY;

  touchX = constrain(touchX, 0, 240);
  touchY = constrain(touchY, 0, 320);

  Serial.printf("[TOUCH] Raw(%d,%d) -> X=%d, Y=%d (Layar: %d)\n", p.x, p.y, touchX, touchY, currentScreen);

  // ----------------------------------------------------------------------------
  // KASUS 1: Di Layar Standby (Memilih Menu Paket Air)
  // ----------------------------------------------------------------------------
  if (currentScreen == SCREEN_STANDBY) {
    int cardY = 38;
    int cardH = 46;
    int cardGap = 4;
    int maxCards = (totalPackages > 3) ? 3 : totalPackages;

    for (int i = 0; i < maxCards; i++) {
      int yStart = cardY + i * (cardH + cardGap);
      int yEnd = yStart + cardH;

      if (touchY >= yStart && touchY <= yEnd) {
        Serial.printf("[TOUCH] Menu %d dipilih: %s (%d mL - Rp %ld)\n", 
                      i + 1, dispenserPackages[i].name, dispenserPackages[i].volumeMl, dispenserPackages[i].price);
        
        activePackageIndex = i;
        targetMilliLitres = dispenserPackages[i].volumeMl;

        // Kirim request pembuatan order QRIS ke backend via MQTT
        String topicOrder = String("water/dispenser/") + DEVICE_ID + "/order_request";
        String payload = String("{\"volumeMl\":") + String(dispenserPackages[i].volumeMl) +
                         String(",\"amount\":") + String(dispenserPackages[i].price) +
                         String(",\"packageId\":\"") + String(dispenserPackages[i].id) + "\"" +
                         String(",\"packageName\":\"") + String(dispenserPackages[i].name) + "\"}";
        mqttClient.publish(topicOrder.c_str(), payload.c_str());

        // Tampilkan layar QRIS (sementara tampilkan QR default / menunggu payload web)
        char nomStr[16];
        snprintf(nomStr, sizeof(nomStr), "%ld", dispenserPackages[i].price);
        showQRISScreen(nomStr, "00020101021226600016ID.WATERVEND.WWW520458125303360540660005802ID5913WATERVEND IOT6007BANDUNG6304ABCD", 300);
        delay(400); // Debounce
        return;
      }
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 2: Di Layar QRIS (Tombol Batalkan Pesanan)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_QRIS) {
    if (touchY >= 195 && touchY <= 236) {
      Serial.println("[TOUCH] Customer membatalkan pesanan QRIS.");
      String topicCancel = String("water/dispenser/") + DEVICE_ID + "/cancel";
      mqttClient.publish(topicCancel.c_str(), "{\"status\":\"CANCELLED\"}");
      
      showStandbyScreen();
      delay(400);
      return;
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 3: Di Layar Letakkan Tumbler (Tombol LANJUT / NEXT)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_PLACE_TUMBLER) {
    if (touchY >= 170 && touchY <= 235) {
      Serial.println("[TOUCH] Tombol NEXT ditekan! Wadah sudah diletakkan.");

      requiredDispenseDurationMs = calculateDispenseDurationMs(targetMilliLitres);
      dispensedMilliLitres = 0;
      dispenseStartTime = millis();
      isDispensing = true;

      // Nyalakan Pompa & Pindah ke Animasi Dispensing
      startPump();
      showDispensingScreen(targetMilliLitres);
      delay(400);
      return;
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 4: Di Layar Pengisian Air (Tombol STOP Darurat)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_DISPENSING) {
    if (touchY >= 195 && touchY <= 236) {
      Serial.println("[TOUCH] STOP DARURAT DITEKAN!");
      isDispensing = false;
      stopPump();
      showCompleteScreen("EMERGENCY_STOPPED", dispensedMilliLitres, "Tombol Stop Darurat Ditekan");

      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"message\":\"Emergency Stopped\"}", true);

      String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
      String completePayload = String("{\"status\":\"EMERGENCY_STOPPED\",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                               String(",\"transactionId\":\"") + currentTransactionId + "\"}";
      mqttClient.publish(topicComplete.c_str(), completePayload.c_str());
      delay(400);
      return;
    }
  }
}

// ==============================================================================
// SETUP UTAMA
// ==============================================================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_TRIGGER_RESET_WIFI, INPUT_PULLUP);
  initPump();

  // Inisialisasi Layar LCD TFT SPI ST7789
  initDisplayDriver();

  // Inisialisasi Touch Screen SPI XPT2046
  ts.begin();
  ts.setRotation(TFT_ROTATION); // Samakan rotasi dengan LCD agar koordinat pas

  // Inisialisasi Tampilan Boot WiFi Awal
  showBootWifiScreen("", "", "Memulai Perangkat...");

  // Inisialisasi Model Debit Pompa Presisi (NVS Flash)
  initFlowCalculator();

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

  // 2. Baca Input Sentuhan Layar Touch Screen
  handleTouchScreen();

  // 3. Status 1: Proses Pengisian Air Sedang Berlangsung (Dispensing)
  if (isDispensing) {
    unsigned long elapsedTimeMs = currentMillis - dispenseStartTime;
    dispensedMilliLitres = calculateLiveDispensedMl(elapsedTimeMs, targetMilliLitres);

    // Perbarui Animasi Aliran Air & Angka Live di Layar LCD
    updateDispensingAnimation(dispensedMilliLitres, targetMilliLitres);

    // Kirim Telemetri Pengisian ke Backend setiap 300 ms
    if (currentMillis - lastTelemetryPublishTime >= 300) {
      lastTelemetryPublishTime = currentMillis;

      float flowRateLpm = (pumpFlowRateMlPerSec * 60.0f) / 1000.0f;
      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"flowRate\":") + String(flowRateLpm, 2) + 
                       String(",\"flowRateMlPerSec\":") + String(pumpFlowRateMlPerSec, 2) + 
                       String(",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                       String(",\"targetMl\":") + String(targetMilliLitres) + 
                       String(",\"status\":\"DISPENSING\"") + 
                       String(",\"cutOffMode\":\"CALIBRATED_FLOW_TIMER\"") + 
                       String(",\"transactionId\":\"") + currentTransactionId + "\"}";
      mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
    }

    // Evaluasi Syarat Otomatis Cut-Off Pompa
    bool targetReached = (elapsedTimeMs >= requiredDispenseDurationMs) || (dispensedMilliLitres >= targetMilliLitres);
    unsigned long maxSafetyDuration = requiredDispenseDurationMs + 5000;
    bool timeoutSafety = (elapsedTimeMs > maxSafetyDuration);

    if (targetReached || timeoutSafety) {
      isDispensing = false;
      stopPump();
      dispensedMilliLitres = targetMilliLitres; // Tepat sasaran saat cut-off

      String statusStr = "COMPLETED";
      if (timeoutSafety && !targetReached) {
        statusStr = "TIMEOUT_CUTOFF";
        showCompleteScreen("TIMEOUT_CUTOFF", dispensedMilliLitres, "Batas Waktu Tercapai!");
      } else {
        statusStr = "COMPLETED";
        showCompleteScreen("COMPLETED", dispensedMilliLitres, "Pengisian Selesai");
      }

      String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
      String completePayload = String("{\"status\":\"") + statusStr + "\"" + 
                               String(",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                               String(",\"transactionId\":\"") + currentTransactionId + "\"}";
      mqttClient.publish(topicComplete.c_str(), completePayload.c_str());

      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\"}", true);
    }
  }

  // 4. Status 2: Sedang Menampilkan QRIS (Evaluasi Countdown 5 Menit)
  else if (currentScreen == SCREEN_QRIS) {
    unsigned long elapsedSec = (currentMillis - qrisStartTime) / 1000;
    if (elapsedSec >= qrisDurationSeconds) {
      Serial.println("[QRIS] Batas waktu 5 menit tercapai! Membatalkan otomatis...");
      String topicCancel = String("water/dispenser/") + DEVICE_ID + "/cancel";
      mqttClient.publish(topicCancel.c_str(), "{\"status\":\"EXPIRED\"}");

      showCompleteScreen("WAKTU_HABIS", 0, "Batas Waktu Pembayaran Habis");
    } else {
      updateQRISCountdown(qrisDurationSeconds - elapsedSec);
    }
  }

  // 5. Status 3: Layar Place Tumbler, Selesai, atau Siaga (Standby)
  else {
    checkAutoResetScreen();

    // Kirim Heartbeat Telemetri setiap 1000 ms
    if (currentMillis - lastTelemetryPublishTime >= 1000) {
      lastTelemetryPublishTime = currentMillis;

      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"status\":\"READY\"") + 
                       String(",\"flowRateMlPerSec\":") + String(pumpFlowRateMlPerSec, 2) + 
                       String(",\"cutOffMode\":\"CALIBRATED_FLOW_TIMER\"") + 
                       String(",\"dispensedMl\":0,\"targetMl\":0,\"flowRate\":0.0}");
      mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
    }
  }
}
