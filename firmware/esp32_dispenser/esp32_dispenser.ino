/*
 * Firmware ESP32 Dispenser Air Minum Otomatis Berbayar (WaterVend IoT)
 * Versi Arsitektur FreeRTOS Dual-Core + TFT_eSPI (Zero-Lag, Zero-Glitch, Auto-Calibrated Touch)
 * 
 * Pembagian Core ESP32 (Hardware Multi-Threading):
 * - Core 0 (PRO_CPU) : Dedicated Network Task (WiFiManager, MQTT loop, publish telemetry, inter-core queue)
 * - Core 1 (APP_CPU) : Dedicated UI & Control Task (ST7789 40MHz, touch polling, water animation, pump relay)
 * 
 * Sistem Pemodelan Aliran Presisi Tinggi (Tanpa Sensor Berat Loadcell HX711):
 * - Memanfaatkan kalibrasi debit air berbasis waktu, inersia motor, dan kompensasi ramp-up/coasting
 * - Alur 6 Tahap UI/UX Interaktif dengan Touch Screen
 * 
 * Struktur Modular:
 * - config.h          : Pin hardware, struct antrean FreeRTOS, parameter sistem, dan variabel global
 * - pump_control.h    : Driver relay pompa air BR314 (Tri-state anti-glitch)
 * - flow_calculator.h : Model hidrolik estimasi volume air presisi & kalibrasi NVS Flash
 * - display_ui.h      : Driver LCD TFT ST7789, auto-kalibrasi touch NVS, QRIS, & animasi air
 * - network_mqtt.h    : Driver jaringan WiFi & MQTT protocol yang berjalan di Core 0
 */

#include "config.h"
#include "pump_control.h"
#include "flow_calculator.h"
#include "display_ui.h"
#include "proximity_sensor.h"
#include "buzzer_control.h"
#include "scale_sensor.h"
#include "network_mqtt.h"

// ==============================================================================
// INISIALISASI OBJEK HARDWARE & VARIABEL GLOBAL
// ==============================================================================
TFT_eSPI tft = TFT_eSPI();
// Gunakan mode polling murni tanpa T_IRQ (100% stabil di ESP32, bebas missed interrupt FreeRTOS)
XPT2046_Touchscreen ts(TOUCH_CS);
Preferences preferences;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Handle Antrean FreeRTOS & Task Core 0
QueueHandle_t qNetToUI = NULL;
QueueHandle_t qUIToNet = NULL;
TaskHandle_t netTaskHandle = NULL;

// Batas Nilai Kalibrasi Touch XPT2046 (Profil Hardware Terukur Fisik):
// Sumbu X layar (p.y): 500 (Kiri) -> 3400 (Kanan)
// Sumbu Y layar (p.x): 3400 (Atas) -> 590 (Bawah)
uint16_t touchMinX = 500;
uint16_t touchMaxX = 3400;
uint16_t touchMinY = 3400;
uint16_t touchMaxY = 590;

// Data paket default (akan otomatis diupdate saat tersinkronisasi dengan backend web)
DispenserPackage dispenserPackages[MAX_PACKAGES] = {
  {"pkg-1", "CUP_200ML", "Gelas Kecil", 200, 2000},
  {"pkg-2", "BOTTLE_600ML", "Botol Sedang", 600, 6000},
  {"pkg-3", "GALLON_1500ML", "Teko Besar", 1500, 15000}
};
int totalPackages = 3;

char mqtt_broker[40]                  = "192.168.1.4";
float pumpFlowRateMlPerSec            = 25.0f;
unsigned long requiredDispenseDurationMs = 0;
unsigned long lastTelemetryPublishTime = 0;
unsigned long lastMqttRetryTime       = 0;

bool isDispensing                     = false;
bool isDispensePaused                 = false;
unsigned long targetMilliLitres       = 0;
unsigned long dispensedMilliLitres    = 0;
unsigned long dispenseStartTime       = 0;
unsigned long activePumpDurationMs    = 0;
unsigned long lastPumpIterationMillis = 0;
String currentTransactionId           = "";

ScreenState currentScreen             = SCREEN_BOOT_WIFI;
unsigned long lastMlShown             = 999999;
int lastBarWidth                      = -1;
unsigned long autoResetScreenTime     = 0;

// Variabel Khusus Alur Interaktif
unsigned long qrisStartTime           = 0;
unsigned long qrisDurationSeconds     = 300; // 5 Menit
unsigned long lastCountdownSecond     = 0;
unsigned long qrisIgnoreTouchUntil    = 0;
int activePackageIndex                = -1;
int animationFrame                    = 0;
unsigned long lastAnimationTime       = 0;
char activeOrderId[40]                = "";
char activeNominalStr[16]             = "";
char activeQrPayload[512]             = "";

// Variabel Kontrol Sensor Ultrasonik HC-SR04 & Buzzer
bool isTumblerPresent                 = false;
bool isBuzzerAlarmEnabled             = true;
bool isBuzzerSounding                 = false;
float targetDistanceCm                = 12.0f; // Jarak deteksi tumbler (misal <= 12 cm)
float currentMeasuredDistanceCm       = 0.0f;  // Jarak live terukur oleh HC-SR04
bool sensorActiveHigh                 = true;  // Kompatibilitas config

// State Machine Buzzer Non-Blocking Bebas Konflik Antar-Core
volatile unsigned long buzzerBeepUntil        = 0;
volatile int buzzerBeepCountRemaining         = 0;
volatile unsigned long buzzerNextBeepTime     = 0;

// Variabel Kontrol Sensor Berat Load Cell 5kg + HX711
HX711 scale;
bool isScaleReady                             = false;
float calibrationFactor                       = -420.0f;
float currentLiveWeight                       = 0.0f;
float dispensedWeightGrams                    = 0.0f;
float containerTareWeight                     = 0.0f;
long lastRawAdcReading                        = 0;
float maxWeightLimit                          = 2500.0f;

// Variabel Auto-Tare & Kontrol Pengisian Berbasis Berat
bool isAutoTareDone                           = false;
unsigned long tareStabilityStartTime         = 0;
float lastTareCandidateWeight                 = 0.0f;
unsigned long pauseStartTime                 = 0;
unsigned long dryRunCheckStartTime            = 0;
float dryRunInitialWeight                     = 0.0f;

// ==============================================================================
// PEMROSESAN PESAN MASUK DARI NETWORK TASK CORE 0 KE UI CORE 1
// ==============================================================================
void handleIncomingNetworkMessages() {
  if (qNetToUI == NULL) return;

  NetToUIMessage netMsg;
  while (xQueueReceive(qNetToUI, &netMsg, 0) == pdTRUE) {
    Serial.printf("[UI Core 1] Menerima pesan dari Core 0 (Tipe: %d)\n", netMsg.type);

    if (netMsg.type == NET_MSG_PAYMENT_SUCCESS) {
      targetMilliLitres = (netMsg.volumeMl > 0) ? netMsg.volumeMl : 600;
      currentTransactionId = String(netMsg.orderId);
      resetAutoTareState();
      containerTareWeight = 0.0f;
      Serial.printf("[UI Core 1] Pembayaran Lunas! Target: %lu mL (Order: %s)\n", targetMilliLitres, netMsg.orderId);
      showPlaceTumblerScreen(targetMilliLitres, netMsg.orderId);
    }
    else if (netMsg.type == NET_MSG_SHOW_QRIS) {
      unsigned long durSec = (netMsg.timeoutSeconds >= 60) ? netMsg.timeoutSeconds : 300;
      if (strlen(netMsg.orderId) > 0) {
        strncpy(activeOrderId, netMsg.orderId, sizeof(activeOrderId) - 1);
        currentTransactionId = String(netMsg.orderId);
      }
      // Jika saat ini sudah di layar QRIS, jangan potong countdown yang sedang berjalan!
      if (currentScreen == SCREEN_QRIS && qrisStartTime > 0 && millis() >= qrisStartTime) {
        unsigned long elapsed = (millis() - qrisStartTime) / 1000;
        if (elapsed < qrisDurationSeconds) {
          durSec = qrisDurationSeconds - elapsed;
        }
      }
      showQRISScreen(netMsg.nominal, netMsg.qrPayload, durSec);
      qrisIgnoreTouchUntil = millis() + 2500;
    }
    else if (netMsg.type == NET_MSG_PACKAGES_UPDATED) {
      if (currentScreen == SCREEN_STANDBY) {
        showStandbyScreen();
      }
    }
    else if (netMsg.type == NET_MSG_CMD_START) {
      targetMilliLitres = (netMsg.volumeMl > 0) ? netMsg.volumeMl : 600;
      currentTransactionId = String(netMsg.orderId);
      requiredDispenseDurationMs = calculateDispenseDurationMs(targetMilliLitres);
      dispensedMilliLitres = 0;
      dispensedWeightGrams = 0.0f;
      activePumpDurationMs = 0;
      lastPumpIterationMillis = millis();
      dispenseStartTime = millis();
      dryRunCheckStartTime = millis();
      dryRunInitialWeight = currentLiveWeight;
      isDispensing = true;
      isDispensePaused = false;

      startPump();
      showDispensingScreen(targetMilliLitres);
    }
    else if (netMsg.type == NET_MSG_CMD_STOP) {
      isDispensing = false;
      isDispensePaused = false;
      stopPump();
      showCompleteScreen("EMERGENCY_STOPPED", dispensedMilliLitres, "Tombol Stop Darurat Ditekan");
    }
    else if (netMsg.type == NET_MSG_CMD_RESET) {
      // HANYA reset jika bukan sedang di SCREEN_QRIS atau SCREEN_DISPENSING
      if (currentScreen != SCREEN_QRIS && currentScreen != SCREEN_DISPENSING) {
        isDispensing = false;
        stopPump();
        dispensedMilliLitres = 0;
        targetMilliLitres = 0;
        currentTransactionId = "";
        showStandbyScreen();
      }
    }
    else if (netMsg.type == NET_MSG_CMD_TARE) {
      tareScale();
    }
    else if (netMsg.type == NET_MSG_CMD_CALIBRATE) {
      calibrateScale(netMsg.floatVal);
    }
    else if (netMsg.type == NET_MSG_CMD_SET_CAL_FACTOR) {
      saveCalibrationFactor(netMsg.floatVal);
    }
    else if (netMsg.type == NET_MSG_CMD_SET_MAX_WEIGHT) {
      saveMaxWeight(netMsg.floatVal);
    }
  }
}

// ==============================================================================
// HANDLER SENTUHAN LAYAR TOUCH SCREEN TERPADU (TFT_eSPI Zero-Lag & Filtered)
// ==============================================================================
bool handleTouchScreen() {
  int touchX = 0, touchY = 0;

  // Baca sentuhan melalui fungsi terisolasi SPI XPT2046 dengan filter noise
  bool isTouched = getDisplayTouch(touchX, touchY);
  if (!isTouched) return false;

  beepOnce(25); // Feedback audio sentuhan ringan (tactile tick)
  Serial.printf("[TOUCH] X=%d, Y=%d (Screen: %d)\n", touchX, touchY, currentScreen);

  // ----------------------------------------------------------------------------
  // KASUS 1: Di Layar Standby (Memilih Menu Paket Air)
  // ----------------------------------------------------------------------------
  if (currentScreen == SCREEN_STANDBY) {
    static unsigned long lastMenuTapTime = 0;
    if (millis() - lastMenuTapTime < 400) return false; // Debounce sentuhan antar-menu

    int maxCards = (totalPackages > 3) ? 3 : totalPackages;

    // Pembagian zona sentuh diskrit tanpa overlap (34..117, 118..199, 200..282)
    // Sesuai dengan geometri kartu vertikal baru (Tinggi 76px + Gap 6px):
    // Card 0: Y=38..114  -> Zona Sentuh: 34..117
    // Card 1: Y=120..196 -> Zona Sentuh: 118..199
    // Card 2: Y=202..278 -> Zona Sentuh: 200..282
    const int zoneYStart[3] = {34, 118, 200};
    const int zoneYEnd[3]   = {117, 199, 282};

    for (int i = 0; i < maxCards; i++) {
      int yStart = zoneYStart[i];
      int yEnd   = zoneYEnd[i];

      // Deteksi sentuhan presisi pada seluruh area kartu (X: 6..234)
      if (touchY >= yStart && touchY <= yEnd && touchX >= 6 && touchX <= 234) {
        lastMenuTapTime = millis();
        Serial.printf("[TOUCH PRECISE] Menu %d terpilih: %s (%d mL - Rp %ld) [Y=%d in %d..%d]\n",
                      i + 1, dispenserPackages[i].name, dispenserPackages[i].volumeMl, dispenserPackages[i].price,
                      touchY, yStart, yEnd);

        beepOnce(70);

        // Feedback visual tombol terpilih seketika (menyorot pill button di bawah teks)
        int cardDrawY = 38 + i * 82;
        tft.drawRoundRect(8, cardDrawY, 224, 76, 6, WV_SUCCESS_GREEN);
        tft.fillRoundRect(18, cardDrawY + 44, 202, 24, 4, WV_SUCCESS_GREEN);
        tft.setTextColor(WV_TEXT_WHITE, WV_SUCCESS_GREEN);
        tft.setTextSize(1);
        tft.setCursor(65, cardDrawY + 52);
        tft.print("[ OK! PAKET TERPILIH ]");

        activePackageIndex = i;
        targetMilliLitres = dispenserPackages[i].volumeMl;

        // Kirim request transaksi baru ke Core 0 (Network MQTT)
        UIToNetMessage uiMsg;
        memset(&uiMsg, 0, sizeof(uiMsg));
        uiMsg.type = UI_MSG_ORDER_REQUEST;
        uiMsg.volumeMl = dispenserPackages[i].volumeMl;
        uiMsg.price = dispenserPackages[i].price;
        strncpy(uiMsg.packageId, dispenserPackages[i].id, sizeof(uiMsg.packageId) - 1);
        strncpy(uiMsg.packageName, dispenserPackages[i].name, sizeof(uiMsg.packageName) - 1);

        if (qUIToNet != NULL) {
          xQueueSend(qUIToNet, &uiMsg, 0);
        }

        char nomStr[16];
        snprintf(nomStr, sizeof(nomStr), "%ld", dispenserPackages[i].price);
        showQRISScreen(nomStr, "00020101021226600016ID.WATERVEND.WWW520458125303360540660005802ID5913WATERVEND IOT6007BANDUNG6304ABCD", 300);

        qrisIgnoreTouchUntil = millis() + 3000;
        return true;
      }
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 2: Di Layar QRIS (Tombol Batalkan Pesanan - Anti False Trigger & Hold Debounce)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_QRIS) {
    if (millis() < qrisIgnoreTouchUntil) return false;

    static unsigned long cancelPressStart = 0;

    // Batasi koordinat sentuh tombol dengan toleransi empuk (X: 10-230, Y: 275-320)
    if (touchX >= 10 && touchX <= 230 && touchY >= 275 && touchY <= 320) {
      if (cancelPressStart == 0) {
        cancelPressStart = millis();
        // Beri feedback visual tombol ditekan
        tft.fillRoundRect(8, 290, 224, 26, 4, WV_TEXT_BLACK);
        tft.setTextColor(WV_TEXT_WHITE, WV_TEXT_BLACK);
        tft.setTextSize(1);
        tft.setCursor(62, 298);
        tft.print("[ MEMBATALKAN... ]");
        return false;
      }

      // Ditahan minimal 200ms untuk memastikan sentuhan disengaja
      if (millis() - cancelPressStart >= 200) {
        Serial.println("[TOUCH] Customer mengonfirmasi pembatalan pesanan QRIS.");
        cancelPressStart = 0;
        beepOnce(80);
        
        // Kirim pesan pembatalan ke Core 0
        UIToNetMessage uiMsg;
        memset(&uiMsg, 0, sizeof(uiMsg));
        uiMsg.type = UI_MSG_ORDER_CANCEL;
        strncpy(uiMsg.orderId, activeOrderId, sizeof(uiMsg.orderId) - 1);
        if (qUIToNet != NULL) {
          xQueueSend(qUIToNet, &uiMsg, 0);
        }
        
        showStandbyScreen();
        return true;
      }
    } else {
      if (cancelPressStart != 0) {
        cancelPressStart = 0;
        // Kembalikan tampilan tombol normal jika jari terlepas sebelum 200ms
        tft.fillRoundRect(8, 290, 224, 26, 4, WV_DANGER_RED);
        tft.setTextColor(WV_TEXT_WHITE, WV_DANGER_RED);
        tft.setTextSize(1);
        tft.setCursor(68, 298);
        tft.print("[ X  BATALKAN PESANAN ]");
      }
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 3: Di Layar Letakkan Tumbler (Tombol LANJUT / NEXT)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_PLACE_TUMBLER) {
    // Area sentuh tombol NEXT luas (Y: 150-224, X: 4-236)
    if (touchY >= 150 && touchY <= 224 && touchX >= 4 && touchX <= 236) {
      // Proteksi Keamanan 1: Cegah air tumpah jika tumbler belum diletakkan di bawah corong
      if (!isTumblerPresent) {
        Serial.println("[SAFETY] Tombol NEXT ditekan tapi tumbler belum terdeteksi di sensor!");
        tft.fillRoundRect(8, 160, 224, 54, 8, WV_DANGER_RED);
        tft.setTextColor(WV_TEXT_WHITE, WV_DANGER_RED);
        tft.setTextSize(2);
        tft.setCursor(24, 176);
        tft.print("PASANG TUMBLER!");
        beepPattern(2);
        delay(600);
        tft.fillRoundRect(8, 160, 224, 54, 8, WV_SUCCESS_GREEN);
        tft.drawRoundRect(8, 160, 224, 54, 8, WV_HEADER_BG);
        tft.setTextColor(WV_TEXT_WHITE, WV_SUCCESS_GREEN);
        tft.setTextSize(2);
        tft.setCursor(24, 172);
        tft.print("MULAI ISI AIR >");
        tft.setTextSize(1);
        tft.setCursor(28, 196);
        tft.print("Sentuh di sini untuk mengalirkan air");
        return false;
      }

      // Proteksi Keamanan 2: Pastikan proses auto-tare wadah kosong sudah stabil & selesai
      if (!isAutoTareDone) {
        Serial.println("[SAFETY] Tombol NEXT ditekan tapi auto-tare belum stabil/selesai!");
        tft.fillRoundRect(8, 160, 224, 54, 8, WV_WARNING_AMBER);
        tft.setTextColor(WV_TEXT_WHITE, WV_WARNING_AMBER);
        tft.setTextSize(2);
        tft.setCursor(24, 176);
        tft.print("TUNGGU TARA...");
        beepPattern(2);
        delay(600);
        return false;
      }

      Serial.println("[TOUCH] Tombol NEXT ditekan! Wadah terdeteksi dan auto-tare selesai.");
      beepOnce(80);

      // Feedback visual seketika
      tft.fillRoundRect(8, 160, 224, 54, 8, WV_PRIMARY_BLUE);
      tft.setTextColor(WV_TEXT_WHITE, WV_PRIMARY_BLUE);
      tft.setTextSize(2);
      tft.setCursor(45, 176);
      tft.print("MEMULAI...");

      requiredDispenseDurationMs = calculateDispenseDurationMs(targetMilliLitres);
      dispensedMilliLitres = 0;
      dispensedWeightGrams = 0.0f;
      activePumpDurationMs = 0;
      lastPumpIterationMillis = millis();
      dispenseStartTime = millis();
      dryRunCheckStartTime = millis();
      dryRunInitialWeight = currentLiveWeight;
      isDispensing = true;
      isDispensePaused = false;

      // Nyalakan Pompa & Pindah ke Animasi Dispensing
      startPump();
      showDispensingScreen(targetMilliLitres);
      return true;
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 4: Di Layar Pengisian Air (Tombol STOP Darurat & Tombol Interaktif saat Jeda)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_DISPENSING) {
    if (isDispensePaused) {
      // A. Tombol SELESAI (CUKUP) saat Jeda -> Y: 130-180, X: 6-234
      if (touchY >= 130 && touchY <= 180 && touchX >= 6 && touchX <= 234) {
        Serial.println("[TOUCH] SELESAI (CUKUP) ditekan saat jeda pengisian.");
        beepOnce(80);
        isDispensing = false;
        isDispensePaused = false;
        stopPump();
        showCompleteScreen("COMPLETED", dispensedMilliLitres, "Pengisian Diakhiri Pelanggan");

        UIToNetMessage uiMsg;
        memset(&uiMsg, 0, sizeof(uiMsg));
        uiMsg.type = UI_MSG_COMPLETE;
        uiMsg.dispensedMl = dispensedMilliLitres;
        strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
        strncpy(uiMsg.statusStr, "COMPLETED", sizeof(uiMsg.statusStr) - 1);

        if (qUIToNet != NULL) {
          xQueueSend(qUIToNet, &uiMsg, 0);
        }
        return true;
      }

      // B. Tombol STOP / BATAL saat Jeda -> Y: 184-236, X: 6-234
      if (touchY >= 184 && touchY <= 236 && touchX >= 6 && touchX <= 234) {
        Serial.println("[TOUCH] STOP/BATAL ditekan saat jeda pengisian!");
        beepOnce(120);
        isDispensing = false;
        isDispensePaused = false;
        stopPump();
        showCompleteScreen("EMERGENCY_STOPPED", dispensedMilliLitres, "Pengisian Dibatalkan");

        UIToNetMessage uiMsg;
        memset(&uiMsg, 0, sizeof(uiMsg));
        uiMsg.type = UI_MSG_COMPLETE;
        uiMsg.dispensedMl = dispensedMilliLitres;
        strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
        strncpy(uiMsg.statusStr, "EMERGENCY_STOPPED", sizeof(uiMsg.statusStr) - 1);

        if (qUIToNet != NULL) {
          xQueueSend(qUIToNet, &uiMsg, 0);
        }
        return true;
      }
    } else {
      // Area sentuh STOP darurat normal (Y: 180-255, X: 4-236)
      if (touchY >= 180 && touchY <= 255 && touchX >= 4 && touchX <= 236) {
        Serial.println("[TOUCH] STOP DARURAT DITEKAN!");
        beepOnce(120);
        isDispensing = false;
        isDispensePaused = false;
        stopPump();
        showCompleteScreen("EMERGENCY_STOPPED", dispensedMilliLitres, "Tombol Stop Darurat Ditekan");

        // Kirim event complete emergency stop ke Core 0
        UIToNetMessage uiMsg;
        memset(&uiMsg, 0, sizeof(uiMsg));
        uiMsg.type = UI_MSG_COMPLETE;
        uiMsg.dispensedMl = dispensedMilliLitres;
        strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
        strncpy(uiMsg.statusStr, "EMERGENCY_STOPPED", sizeof(uiMsg.statusStr) - 1);

        if (qUIToNet != NULL) {
          xQueueSend(qUIToNet, &uiMsg, 0);
        }
        return true;
      }
    }
  }

  return false;
}

// ==============================================================================
// SETUP UTAMA
// ==============================================================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_TRIGGER_RESET_WIFI, INPUT_PULLUP);
  initPump();

  // Inisialisasi Antrean Pesan Antar-Core (FreeRTOS)
  qNetToUI = xQueueCreate(10, sizeof(NetToUIMessage));
  qUIToNet = xQueueCreate(10, sizeof(UIToNetMessage));

  // Inisialisasi Layar LCD ST7789 & Touch Screen via TFT_eSPI (Termasuk Auto-Kalibrasi NVS)
  initDisplayDriver();

  // Inisialisasi Tampilan Boot WiFi Awal
  showBootWifiScreen("", "", "Memulai Perangkat...");

  // Inisialisasi Model Debit Pompa Presisi (NVS Flash)
  initFlowCalculator();

  // Inisialisasi Sensor Timbangan Load Cell 5kg + HX711
  initScaleSensor();

  // Inisialisasi Sensor Infrared Photoelectric E18-B03P1 & Buzzer
  initProximitySensor();
  initBuzzer();
  beepOnce(100);

  // Inisialisasi WiFiManager Captive Portal (Sinkron saat boot)
  setupWiFiManager();

  // Konfigurasi Klien MQTT Broker (Buffer 1024 bytes untuk payload QRIS EMVCo)
  mqttClient.setServer(mqtt_broker, MQTT_PORT);
  mqttClient.setBufferSize(1024);
  mqttClient.setCallback(mqttCallback);

  // Buat FreeRTOS Dedicated Task untuk Network & MQTT pada Core 0 (PRO_CPU)
  xTaskCreatePinnedToCore(
    networkTask,      // Fungsi task
    "netTask",        // Nama task
    8192,             // Ukuran Stack (8 KB)
    NULL,             // Parameter
    1,                // Prioritas
    &netTaskHandle,   // Task Handle
    0                 // Core ID 0
  );

  // Tampilkan layar menu utama (Standby)
  showStandbyScreen();
}

// ==============================================================================
// HANDLER PERINTAH SERIAL MONITOR (KONTROL CEPAT & KALIBRASI JARAK DINAMIS)
// ==============================================================================
void handleSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  // 1. Perintah DIST:<angka> (Contoh: DIST:10 atau DIST:12.5)
  if (cmd.startsWith("DIST:") || cmd.startsWith("dist:")) {
    String valStr = cmd.substring(5);
    valStr.trim();
    float newDist = valStr.toFloat();
    if (newDist >= 2.0f && newDist <= 50.0f) {
      saveUltrasonicTargetDistance(newDist);
      Serial.printf(">> [OK] Target jarak deteksi diperbarui: <= %.1f cm (Tersimpan ke NVS Flash)\n", targetDistanceCm);
      beepOnce(80);
    } else {
      Serial.println(">> [ERROR] Nilai jarak tidak valid! Masukkan antara 2.0 s/d 50.0 cm (Contoh: DIST:12.0)");
    }
  }
  // 2. Perintah DIST? (Cek Jarak Live)
  else if (cmd.equalsIgnoreCase("DIST?") || cmd.equalsIgnoreCase("STATUS?")) {
    float liveDist = readUltrasonicDistanceCm();
    Serial.println("==================================================");
    Serial.printf(">> STATUS SENSOR ULTRASONIK HC-SR04:\n");
    Serial.printf("   - Jarak Terukur Live  : %.1f cm\n", liveDist);
    Serial.printf("   - Target Jarak Acuan  : <= %.1f cm\n", targetDistanceCm);
    Serial.printf("   - Status Tumbler      : %s\n", (liveDist >= 1.5f && liveDist <= targetDistanceCm) ? "TERPASANG (OK)" : "TIDAK ADA / KOSONG");
    Serial.printf("   - Alarm Buzzer        : %s\n", isBuzzerAlarmEnabled ? "AKTIF (ON)" : "MATI (OFF)");
    Serial.println("==================================================");
  }
  // 3. Perintah ALARM:1 / ALARM:0
  else if (cmd.equalsIgnoreCase("ALARM:1") || cmd.equalsIgnoreCase("ALARM:ON")) {
    setBuzzerAlarmEnabled(true);
    Serial.println(">> [OK] Alarm Bunyi Wadah Kosong DIAKTIFKAN (ON)");
    beepOnce(100);
  }
  else if (cmd.equalsIgnoreCase("ALARM:0") || cmd.equalsIgnoreCase("ALARM:OFF")) {
    setBuzzerAlarmEnabled(false);
    Serial.println(">> [OK] Alarm Bunyi Wadah Kosong DIMATIKAN (OFF)");
  }
  // 4. Perintah BEEP
  else if (cmd.startsWith("BEEP") || cmd.startsWith("beep")) {
    beepPattern(2);
    Serial.println(">> [OK] Uji coba buzzer dipicu (2 bip)");
  }
  // 5. Perintah TOUCH:RESET (Hapus Kalibrasi Korup di NVS)
  else if (cmd.equalsIgnoreCase("TOUCH:RESET") || cmd.equalsIgnoreCase("CAL:RESET")) {
    resetTouchCalibrationToDefault();
    beepOnce(100);
  }
  // 6. Perintah TOUCH? (Cek Parameter Kalibrasi Touch)
  else if (cmd.equalsIgnoreCase("TOUCH?") || cmd.equalsIgnoreCase("CAL?")) {
    Serial.println("==================================================");
    Serial.println(">> STATUS KALIBRASI SENTUH XPT2046:");
    Serial.printf("   - Sumbu X Layar (p.y) : %d -> %d (Min -> Max)\n", touchMinX, touchMaxX);
    Serial.printf("   - Sumbu Y Layar (p.x) : %d -> %d (Min -> Max)\n", touchMinY, touchMaxY);
    Serial.printf("   - Swap XY             : %s\n", TS_SWAP_XY ? "TRUE" : "FALSE");
    Serial.println("==================================================");
  }
  // 7. Perintah TOUCH:CAL (Mulai Kalibrasi Interaktif Crosshair di Layar)
  else if (cmd.equalsIgnoreCase("TOUCH:CAL") || cmd.equalsIgnoreCase("CAL:START")) {
    Serial.println(">> [OK] Memulai kalibrasi interaktif layar...");
    initTouchCalibration(true);
    showStandbyScreen();
  }
  // 8. Perintah WIFI:RESET (Hapus Kredensial Wi-Fi & Buka Hotspot Setup)
  else if (cmd.equalsIgnoreCase("WIFI:RESET") || cmd.equalsIgnoreCase("RESET:WIFI")) {
    Serial.println(">> [OK] Perintah reset Wi-Fi diterima. Menghapus Wi-Fi dan restart...");
    beepPattern(3);
    resetWiFiSettings();
  }
  // 9. Perintah FLOW:<angka> (Contoh: FLOW:25.0 atau FLOW:30.0)
  else if (cmd.startsWith("FLOW:") || cmd.startsWith("flow:")) {
    String valStr = cmd.substring(5);
    valStr.trim();
    float newRate = valStr.toFloat();
    if (newRate >= 5.0f && newRate <= 100.0f) {
      savePumpFlowRate(newRate);
      beepOnce(80);
      float lpm = (pumpFlowRateMlPerSec * 60.0f) / 1000.0f;
      Serial.println("==================================================");
      Serial.printf(">> [OK] Debit Pompa Diperbarui: %.1f mL/detik (~%.2f Liter/menit)\n", pumpFlowRateMlPerSec, lpm);
      Serial.println("   Artinya:");
      Serial.printf("   - Untuk 100 mL   : butuh waktu sekitar %.1f detik\n", 100.0f / pumpFlowRateMlPerSec);
      Serial.printf("   - Untuk 250 mL   : butuh waktu sekitar %.1f detik\n", 250.0f / pumpFlowRateMlPerSec);
      Serial.printf("   - Untuk 600 mL   : butuh waktu sekitar %.1f detik\n", 600.0f / pumpFlowRateMlPerSec);
      Serial.printf("   - Untuk 1.500 mL : butuh waktu sekitar %.1f detik\n", 1500.0f / pumpFlowRateMlPerSec);
      Serial.println("==================================================");
    } else {
      Serial.println(">> [ERROR] Nilai debit tidak valid! Masukkan antara 5.0 s/d 100.0 mL/detik (Contoh: FLOW:25.0)");
    }
  }
  // 10. Perintah FLOW? (Cek Debit Live & Estimasi Waktu)
  else if (cmd.equalsIgnoreCase("FLOW?") || cmd.equalsIgnoreCase("DEBIT?")) {
    float lpm = (pumpFlowRateMlPerSec * 60.0f) / 1000.0f;
    Serial.println("==================================================");
    Serial.printf(">> STATUS KALIBRASI DEBIT POMPA AIR:\n");
    Serial.printf("   - Debit Pompa : %.1f mL/detik (~%.2f Liter/menit)\n", pumpFlowRateMlPerSec, lpm);
    Serial.println("   Artinya:");
    Serial.printf("   - Untuk 100 mL   : butuh waktu sekitar %.1f detik\n", 100.0f / pumpFlowRateMlPerSec);
    Serial.printf("   - Untuk 250 mL   : butuh waktu sekitar %.1f detik\n", 250.0f / pumpFlowRateMlPerSec);
    Serial.printf("   - Untuk 600 mL   : butuh waktu sekitar %.1f detik\n", 600.0f / pumpFlowRateMlPerSec);
    Serial.printf("   - Untuk 1.500 mL : butuh waktu sekitar %.1f detik\n", 1500.0f / pumpFlowRateMlPerSec);
    Serial.println("==================================================");
  }
  // 11. Perintah TARE (Nolkan Timbangan Load Cell 5kg)
  else if (cmd.equalsIgnoreCase("TARE") || cmd.equalsIgnoreCase("NOL")) {
    tareScale();
  }
  // 12. Perintah WEIGHT? / SCALE? (Cek Berat Live Timbangan)
  else if (cmd.equalsIgnoreCase("WEIGHT?") || cmd.equalsIgnoreCase("SCALE?") || cmd.equalsIgnoreCase("BERAT?")) {
    Serial.println("==================================================");
    Serial.println(">> STATUS SENSOR TIMBANGAN LOAD CELL 5KG + HX711:");
    Serial.printf("   - Status Sensor       : %s\n", isScaleReady ? "TERHUBUNG (OK)" : "TIDAK MERESPON / TERPUTUS");
    Serial.printf("   - Berat Netto Saat Ini: %.1f gram\n", currentLiveWeight);
    Serial.printf("   - Tara Wadah          : %.1f gram\n", containerTareWeight);
    Serial.printf("   - Berat Bruto (Total) : %.1f gram\n", currentLiveWeight + containerTareWeight);
    Serial.printf("   - Raw ADC Saat Ini    : %ld\n", lastRawAdcReading);
    Serial.printf("   - Faktor Kalibrasi    : %.2f\n", calibrationFactor);
    Serial.printf("   - Batas Maksimum Beban: %.0f gram\n", maxWeightLimit);
    Serial.println("==================================================");
  }
  // 13. Perintah CAL:<berat> (Kalibrasi Beban Acuan, contoh CAL:200 atau CAL:500)
  else if (cmd.startsWith("CAL:") || cmd.startsWith("cal:")) {
    String valStr = cmd.substring(4);
    valStr.trim();
    float knownW = valStr.toFloat();
    if (knownW > 0.0f) {
      calibrateScale(knownW);
    } else {
      Serial.println(">> [ERROR] Masukkan berat acuan valid dalam gram (Contoh: CAL:200)");
    }
  }
  // 14. Perintah FACTOR:<faktor> (Set Faktor Kalibrasi Manual)
  else if (cmd.startsWith("FACTOR:") || cmd.startsWith("factor:")) {
    String valStr = cmd.substring(7);
    valStr.trim();
    float newF = valStr.toFloat();
    if (newF != 0.0f) {
      saveCalibrationFactor(newF);
    } else {
      Serial.println(">> [ERROR] Faktor kalibrasi tidak boleh 0!");
    }
  }
  // 15. Perintah MAX:<gram> (Set Batas Beban Platform)
  else if (cmd.startsWith("MAX:") || cmd.startsWith("max:")) {
    String valStr = cmd.substring(4);
    valStr.trim();
    float newMax = valStr.toFloat();
    if (newMax >= 100.0f) {
      saveMaxWeight(newMax);
    } else {
      Serial.println(">> [ERROR] Batas beban minimal 100 gram (Contoh: MAX:2500)");
    }
  }
  // 16. Bantuan Command
  else if (cmd.equalsIgnoreCase("HELP") || cmd.equalsIgnoreCase("?")) {
    Serial.println(">> PERINTAH SERIAL TERSEDIA:");
    Serial.println("   - TARE        : Nolkan timbangan (Tara) saat wadah diletakkan");
    Serial.println("   - WEIGHT?     : Cek status timbangan HX711 & pembacaan berat live");
    Serial.println("   - CAL:<gram>  : Kalibrasi timbangan dengan beban acuan (Contoh: CAL:200)");
    Serial.println("   - FACTOR:<f>  : Atur faktor kalibrasi manual (Contoh: FACTOR:-420.0)");
    Serial.println("   - MAX:<gram>  : Atur batas beban maksimal platform (Contoh: MAX:2500)");
    Serial.println("   - FLOW:<rate> : Atur debit pompa dinamis (Contoh: FLOW:25.0 atau FLOW:30.0)");
    Serial.println("   - FLOW?       : Cek debit saat ini & tabel simulasi waktu pengisian");
    Serial.println("   - WIFI:RESET  : Hapus Wi-Fi tersimpan & buka hotspot WaterVend-Setup");
    Serial.println("   - DIST:<cm>   : Atur target jarak dinamis (Contoh: DIST:12.0)");
    Serial.println("   - DIST?       : Cek jarak live saat ini & status tumbler");
    Serial.println("   - ALARM:1 / 0 : Aktifkan (1) atau Matikan (0) bunyi alarm buzzer");
    Serial.println("   - BEEP        : Uji coba bunyi buzzer");
    Serial.println("   - TOUCH:RESET : Hapus kalibrasi NVS dan kembalikan ke profil hardware");
    Serial.println("   - TOUCH:CAL   : Mulai kalibrasi sentuh interaktif (tanda silang di layar)");
    Serial.println("   - TOUCH?      : Cek nilai kalibrasi XPT2046 saat ini");
  }
}

// ==============================================================================
// LOOP UTAMA: DEDICATED UI & CONTROL TASK (BERJALAN DI CORE 1 APP_CPU)
// ==============================================================================
void loop() {
  // 1. Baca Sensor Timbangan Load Cell 5kg + HX711 (Non-blocking)
  updateScaleReading();

  // 2. Baca Perintah Serial Monitor (Offline Dynamic Distance Config & Kalibrasi)
  handleSerialCommands();

  // 3. Baca Sensor Ultrasonik HC-SR04 HANYA pada 2 kondisi: SCREEN_PLACE_TUMBLER atau SCREEN_DISPENSING
  if (currentScreen == SCREEN_PLACE_TUMBLER || currentScreen == SCREEN_DISPENSING) {
    isTumblerPresent = checkTumblerPresent();
  } else {
    isTumblerPresent = false; // Sensor hibernasi pada Standby, QRIS, Complete, Boot
  }
  updateSensorBuzzerAlarm(isTumblerPresent);

  // Evaluasi Auto-Tare Otomatis & Perbarui UI Letakkan Tumbler
  if (currentScreen == SCREEN_PLACE_TUMBLER) {
    checkAutoTareStability();
    updatePlaceTumblerUI(isTumblerPresent, currentMeasuredDistanceCm);
  }

  // 3. Proses Pesan Masuk dari Core 0 (Event Jaringan & MQTT)
  handleIncomingNetworkMessages();

  // 4. Baca Input Sentuhan Layar Touch Screen (High Priority, Zero-Lag)
  if (handleTouchScreen()) {
    // Layar baru saja berpindah melalui interaksi sentuhan.
    // Segera akhiri iterasi loop ini agar layar baru dievaluasi dengan timer segar di iterasi berikutnya!
    return;
  }

  // Refresh waktu saat ini setelah interaksi sentuhan
  unsigned long currentMillis = millis();

  // 5. Status 1: Proses Pengisian Air Sedang Berlangsung (Dispensing)
  if (isDispensing) {
    // PROTEKSI SENSOR WADAH: DUAL SENSOR SMART PAUSE & RESUME (Ultrasonik + Timbangan)
    // Wadah dianggap terlepas jika sensor ultrasonik kosong ATAU beban timbangan turun tajam ke negatif (< -15g)
    bool isTumblerRemoved = (!isTumblerPresent || currentLiveWeight < -15.0f);

    if (isTumblerRemoved) {
      // WADAH TERLEPAS / DITARIK!
      if (!isDispensePaused) {
        isDispensePaused = true;
        stopPump();
        pauseStartTime = currentMillis;
        beepPattern(2); // Peringatan 2 bip wadah terlepas
        Serial.printf("[SAFETY PAUSE] Wadah terlepas saat dispensing! Pompa DIMATIKAN sementara. Terisi: %lu/%lu mL (%.1f g)\n",
                      dispensedMilliLitres, targetMilliLitres, dispensedWeightGrams);
      }

      // Evaluasi Batas Waktu Jeda (Abandoned Pause Timeout 60 Detik)
      if (currentMillis - pauseStartTime >= 60000) {
        Serial.println("[TIMEOUT PAUSE] Wadah tidak ditaruh kembali selama 60 detik. Menyelesaikan otomatis...");
        isDispensing = false;
        isDispensePaused = false;
        stopPump();
        showCompleteScreen("COMPLETED", dispensedMilliLitres, "Waktu Jeda Habis (Auto Selesai)");

        UIToNetMessage uiMsg;
        memset(&uiMsg, 0, sizeof(uiMsg));
        uiMsg.type = UI_MSG_COMPLETE;
        uiMsg.dispensedMl = dispensedMilliLitres;
        strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
        strncpy(uiMsg.statusStr, "COMPLETED", sizeof(uiMsg.statusStr) - 1);

        if (qUIToNet != NULL) {
          xQueueSend(qUIToNet, &uiMsg, 0);
        }
        return;
      }

      lastPumpIterationMillis = currentMillis;
    } else {
      // WADAH TERPASANG KEMBALI!
      if (isDispensePaused) {
        isDispensePaused = false;
        lastPumpIterationMillis = currentMillis;
        dryRunCheckStartTime = currentMillis;
        dryRunInitialWeight = dispensedWeightGrams;
        startPump();
        beepOnce(80); // Bip konfirmasi resume
        Serial.printf("[SAFETY RESUME] Wadah terpasang kembali! Pompa DINYALAKAN kembali. Melanjutkan dari %lu mL (%.1f g)...\n",
                      dispensedMilliLitres, dispensedWeightGrams);
      }

      // Akumulasikan waktu aktif pompa berputar
      unsigned long deltaMs = (currentMillis >= lastPumpIterationMillis) ? (currentMillis - lastPumpIterationMillis) : 0;
      activePumpDurationMs += deltaMs;
      lastPumpIterationMillis = currentMillis;

      // Hitung volume air keluar secara real-time BERDASARKAN BERAT TIMBANGAN LOAD CELL (1 gram ~ 1 mL)
      dispensedWeightGrams = max(0.0f, currentLiveWeight);
      dispensedMilliLitres = (unsigned long)round(dispensedWeightGrams);

      // PROTEKSI 1: DRY-RUN PROTECTION (Sumber Air Habis)
      // Jika pompa sudah berjalan > 4 detik tetapi pertambahan berat < 5.0 gram
      if (currentMillis - dryRunCheckStartTime >= 4000) {
        if (dispensedWeightGrams - dryRunInitialWeight < 5.0f) {
          Serial.println("[DRY-RUN SAFETY] Pompa berputar > 4 detik tapi berat air tidak naik (< 5g)! Air sumber habis.");
          isDispensing = false;
          isDispensePaused = false;
          stopPump();
          beepPattern(3);
          showCompleteScreen("AIR_HABIS", dispensedMilliLitres, "Air Sumber Habis!");

          UIToNetMessage uiMsg;
          memset(&uiMsg, 0, sizeof(uiMsg));
          uiMsg.type = UI_MSG_COMPLETE;
          uiMsg.dispensedMl = dispensedMilliLitres;
          strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
          strncpy(uiMsg.statusStr, "AIR_HABIS", sizeof(uiMsg.statusStr) - 1);

          if (qUIToNet != NULL) {
            xQueueSend(qUIToNet, &uiMsg, 0);
          }
          return;
        }
      }

      // PROTEKSI 2: OVERFILL / OVERWEIGHT PROTECTION (Mendekati Batas Beban Sensor 5kg)
      float totalGross = currentLiveWeight + containerTareWeight;
      if (totalGross >= maxWeightLimit) {
        Serial.printf("[OVERFILL SAFETY] Beban mendekati batas aman (%.1f g >= %.0f g)! Pompa dihentikan.\n",
                      totalGross, maxWeightLimit);
        isDispensing = false;
        isDispensePaused = false;
        stopPump();
        beepPattern(3);
        showCompleteScreen("OVERWEIGHT", dispensedMilliLitres, "Batas Maksimal Beban!");

        UIToNetMessage uiMsg;
        memset(&uiMsg, 0, sizeof(uiMsg));
        uiMsg.type = UI_MSG_COMPLETE;
        uiMsg.dispensedMl = dispensedMilliLitres;
        strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
        strncpy(uiMsg.statusStr, "OVERWEIGHT", sizeof(uiMsg.statusStr) - 1);

        if (qUIToNet != NULL) {
          xQueueSend(qUIToNet, &uiMsg, 0);
        }
        return;
      }
    }

    // Perbarui Animasi Aliran Air & Angka Live di Layar LCD
    updateDispensingAnimation(dispensedMilliLitres, targetMilliLitres);

    // Kirim Telemetri Pengisian ke Core 0 setiap 300 ms
    if (currentMillis - lastTelemetryPublishTime >= 300) {
      lastTelemetryPublishTime = currentMillis;

      float flowRateLpm = isDispensePaused ? 0.0f : ((pumpFlowRateMlPerSec * 60.0f) / 1000.0f);
      UIToNetMessage uiMsg;
      memset(&uiMsg, 0, sizeof(uiMsg));
      uiMsg.type = UI_MSG_TELEMETRY;
      uiMsg.dispensedMl = dispensedMilliLitres;
      uiMsg.targetMl = targetMilliLitres;
      uiMsg.flowRateLpm = flowRateLpm;
      uiMsg.flowRateMlPerSec = isDispensePaused ? 0.0f : pumpFlowRateMlPerSec;
      strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
      // Data Timbangan Load Cell 5kg
      uiMsg.currentWeight = currentLiveWeight;
      uiMsg.dispensedWeightGrams = dispensedWeightGrams;
      uiMsg.containerTareWeight = containerTareWeight;
      uiMsg.grossWeight = currentLiveWeight + containerTareWeight;
      uiMsg.calFactor = calibrationFactor;
      uiMsg.isScaleReady = isScaleReady;

      if (qUIToNet != NULL) {
        xQueueSend(qUIToNet, &uiMsg, 0);
      }
    }

    // Evaluasi Syarat Otomatis Cut-Off Pompa Murni Berbasis Berat Target (1 gram ~ 1 mL)
    bool targetReached = (dispensedWeightGrams >= (float)targetMilliLitres);

    if (targetReached) {
      isDispensing = false;
      isDispensePaused = false;
      stopPump();
      beepPattern(2);
      Serial.printf("[DISPENSE TARGET REACHED] Target tercapai: %.1f g (Target: %lu mL). Pompa dimatikan.\n",
                    dispensedWeightGrams, targetMilliLitres);

      showCompleteScreen("COMPLETED", dispensedMilliLitres, "Pengisian Selesai");

      // Kirim event selesai ke Core 0
      UIToNetMessage uiMsg;
      memset(&uiMsg, 0, sizeof(uiMsg));
      uiMsg.type = UI_MSG_COMPLETE;
      uiMsg.dispensedMl = dispensedMilliLitres;
      String txIdToSend = currentTransactionId;
      if (txIdToSend.length() == 0 && strlen(activeOrderId) > 0) {
        txIdToSend = String(activeOrderId);
      }
      strncpy(uiMsg.orderId, txIdToSend.c_str(), sizeof(uiMsg.orderId) - 1);
      strncpy(uiMsg.statusStr, "COMPLETED", sizeof(uiMsg.statusStr) - 1);

      if (qUIToNet != NULL) {
        xQueueSend(qUIToNet, &uiMsg, 0);
      }
    }
  }

  // 4. Status 2: Sedang Menampilkan QRIS (Evaluasi Countdown 5 Menit = 300 Detik Penuh)
  else if (currentScreen == SCREEN_QRIS) {
    if (qrisStartTime == 0 || currentMillis < qrisStartTime) {
      qrisStartTime = currentMillis;
    }
    if (qrisDurationSeconds < 60) qrisDurationSeconds = 300;

    unsigned long elapsedSec = (currentMillis >= qrisStartTime) ? ((currentMillis - qrisStartTime) / 1000) : 0;
    if (elapsedSec >= qrisDurationSeconds) {
      Serial.printf("[QRIS] Batas waktu %lu detik tercapai! Membatalkan otomatis...\n", qrisDurationSeconds);
      
      UIToNetMessage uiMsg;
      memset(&uiMsg, 0, sizeof(uiMsg));
      uiMsg.type = UI_MSG_ORDER_CANCEL;
      strncpy(uiMsg.orderId, activeOrderId, sizeof(uiMsg.orderId) - 1);
      if (qUIToNet != NULL) {
        xQueueSend(qUIToNet, &uiMsg, 0);
      }

      showCompleteScreen("WAKTU_HABIS", 0, "Batas Waktu Pembayaran Habis");
    } else {
      updateQRISCountdown(qrisDurationSeconds - elapsedSec);
    }
  }

  // 5. Status 3: Layar Place Tumbler, Selesai, atau Siaga (Standby)
  else {
    checkAutoResetScreen();

    // Kirim Heartbeat Status READY ke Core 0 setiap 1000 ms
    if (currentMillis - lastTelemetryPublishTime >= 1000) {
      lastTelemetryPublishTime = currentMillis;

      UIToNetMessage uiMsg;
      memset(&uiMsg, 0, sizeof(uiMsg));
      uiMsg.type = UI_MSG_STATUS_READY;
      // Data Timbangan Load Cell 5kg (Heartbeat Siaga)
      uiMsg.currentWeight = currentLiveWeight;
      uiMsg.dispensedWeightGrams = 0.0f;
      uiMsg.containerTareWeight = containerTareWeight;
      uiMsg.grossWeight = currentLiveWeight + containerTareWeight;
      uiMsg.calFactor = calibrationFactor;
      uiMsg.isScaleReady = isScaleReady;

      if (qUIToNet != NULL) {
        xQueueSend(qUIToNet, &uiMsg, 0);
      }
    }
  }
}
