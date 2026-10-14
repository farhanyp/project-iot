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

// Batas Nilai Kalibrasi Touch XPT2046 (Diisi dari NVS Flash / Auto-Kalibrasi)
uint16_t touchMinX = 260;
uint16_t touchMaxX = 3700;
uint16_t touchMinY = 260;
uint16_t touchMaxY = 3700;

// Data paket default (akan otomatis diupdate saat tersinkronisasi dengan backend web)
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
unsigned long lastMqttRetryTime       = 0;

bool isDispensing                     = false;
unsigned long targetMilliLitres       = 0;
unsigned long dispensedMilliLitres    = 0;
unsigned long dispenseStartTime       = 0;
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
char activeQrPayload[256]             = "";

// Variabel Kontrol Sensor E18-B03P1 & Buzzer
bool isTumblerPresent                 = false;
bool isBuzzerAlarmEnabled             = true;
bool isBuzzerSounding                 = false;
float targetDistanceCm                = 8.0f;
bool sensorActiveHigh                 = true; // E18-B03P1 PNP NO (HIGH saat objek terdeteksi)

// State Machine Buzzer Non-Blocking Bebas Konflik Antar-Core
volatile unsigned long buzzerBeepUntil        = 0;
volatile int buzzerBeepCountRemaining         = 0;
volatile unsigned long buzzerNextBeepTime     = 0;

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
      Serial.printf("[UI Core 1] Pembayaran Lunas! Target: %lu mL (Order: %s)\n", targetMilliLitres, netMsg.orderId);
      showPlaceTumblerScreen(targetMilliLitres, netMsg.orderId);
    }
    else if (netMsg.type == NET_MSG_SHOW_QRIS) {
      unsigned long durSec = (netMsg.timeoutSeconds >= 60) ? netMsg.timeoutSeconds : 300;
      // Jika saat ini sudah di layar QRIS, jangan potong countdown yang sedang berjalan!
      if (currentScreen == SCREEN_QRIS && qrisStartTime > 0) {
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
      dispenseStartTime = millis();
      isDispensing = true;

      startPump();
      showDispensingScreen(targetMilliLitres);
    }
    else if (netMsg.type == NET_MSG_CMD_STOP) {
      isDispensing = false;
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
  }
}

// ==============================================================================
// HANDLER SENTUHAN LAYAR TOUCH SCREEN TERPADU (TFT_eSPI Zero-Lag & Filtered)
// ==============================================================================
void handleTouchScreen() {
  int touchX = 0, touchY = 0;

  // Baca sentuhan melalui fungsi terisolasi SPI XPT2046 dengan filter noise
  bool isTouched = getDisplayTouch(touchX, touchY);
  if (!isTouched) return;

  beepOnce(40); // Feedback audio sentuhan tombol
  Serial.printf("[TOUCH] X=%d, Y=%d (Screen: %d)\n", touchX, touchY, currentScreen);

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

      // Area toleransi sentuhan kartu
      if (touchY >= (yStart - 4) && touchY <= (yEnd + 4) && touchX >= 8 && touchX <= 232) {
        Serial.printf("[TOUCH] Menu %d dipilih: %s (%d mL - Rp %ld)\n", 
                      i + 1, dispenserPackages[i].name, dispenserPackages[i].volumeMl, dispenserPackages[i].price);

        // 1. FEEDBACK VISUAL INSTAN (<1ms via TFT_eSPI)
        tft.drawRoundRect(10, yStart, 220, cardH, 6, TFT_GREEN);
        tft.fillRoundRect(172, yStart + 10, 50, 26, 4, TFT_GREEN);
        tft.setTextColor(TFT_BLACK, TFT_GREEN);
        tft.setTextSize(1);
        tft.setCursor(182, yStart + 19);
        tft.print("OK!");

        activePackageIndex = i;
        targetMilliLitres = dispenserPackages[i].volumeMl;

        // 2. Kirim pesan request pembuatan QRIS ke Core 0 melalui FreeRTOS Queue
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

        // 3. Tampilkan layar QRIS (countdown 5 menit = 300 detik)
        char nomStr[16];
        snprintf(nomStr, sizeof(nomStr), "%ld", dispenserPackages[i].price);
        showQRISScreen(nomStr, "00020101021226600016ID.WATERVEND.WWW520458125303360540660005802ID5913WATERVEND IOT6007BANDUNG6304ABCD", 300);

        // Kunci sentuhan 3 detik penuh agar jari pembeli tidak memicu tombol batal
        qrisIgnoreTouchUntil = millis() + 3000;
        return;
      }
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 2: Di Layar QRIS (Tombol Batalkan Pesanan - Anti False Trigger & Hold Debounce)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_QRIS) {
    if (millis() < qrisIgnoreTouchUntil) return;

    static unsigned long cancelPressStart = 0;

    // Batasi koordinat sentuh tombol secara ketat (X: 20-220, Y: 288-318)
    if (touchX >= 20 && touchX <= 220 && touchY >= 288 && touchY <= 318) {
      if (cancelPressStart == 0) {
        cancelPressStart = millis();
        // Beri feedback visual tombol ditekan
        tft.fillRoundRect(8, 292, 224, 24, 4, TFT_RED);
        tft.setTextColor(TFT_WHITE, TFT_RED);
        tft.setTextSize(1);
        tft.setCursor(65, 300);
        tft.print("[ MEMBATALKAN... ]");
        return;
      }

      // Wajib ditahan minimal 300ms untuk memastikan ini sentuhan sengaja (bukan noise / sentuhan sesaat)
      if (millis() - cancelPressStart >= 300) {
        Serial.println("[TOUCH] Customer mengonfirmasi pembatalan pesanan QRIS.");
        cancelPressStart = 0;
        
        // Kirim pesan pembatalan ke Core 0
        UIToNetMessage uiMsg;
        memset(&uiMsg, 0, sizeof(uiMsg));
        uiMsg.type = UI_MSG_ORDER_CANCEL;
        if (qUIToNet != NULL) {
          xQueueSend(qUIToNet, &uiMsg, 0);
        }
        
        showStandbyScreen();
        return;
      }
    } else {
      if (cancelPressStart != 0) {
        cancelPressStart = 0;
        // Kembalikan tampilan tombol normal jika jari terlepas sebelum 300ms
        tft.fillRoundRect(8, 292, 224, 24, 4, 0x3000);
        tft.drawRoundRect(8, 292, 224, 24, 4, TFT_RED);
        tft.setTextColor(TFT_WHITE, 0x3000);
        tft.setTextSize(1);
        tft.setCursor(75, 300);
        tft.print("[ BATALKAN ]");
      }
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 3: Di Layar Letakkan Tumbler (Tombol LANJUT / NEXT)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_PLACE_TUMBLER) {
    if (touchY >= 165 && touchY <= 240 && touchX >= 10 && touchX <= 230) {
      // Proteksi Keamanan: Cegah air tumpah jika tumbler belum diletakkan di bawah corong
      if (!isTumblerPresent) {
        Serial.println("[SAFETY] Tombol NEXT ditekan tapi tumbler belum terdeteksi di sensor!");
        tft.fillRoundRect(10, 174, 220, 54, 8, TFT_RED);
        tft.setTextColor(TFT_WHITE, TFT_RED);
        tft.setTextSize(2);
        tft.setCursor(20, 190);
        tft.print("PASANG TUMBLER!");
        beepPattern(2);
        delay(600);
        tft.fillRoundRect(10, 174, 220, 54, 8, TFT_GREEN);
        tft.drawRoundRect(10, 174, 220, 54, 8, TFT_WHITE);
        tft.setTextColor(TFT_BLACK, TFT_GREEN);
        tft.setTextSize(2);
        tft.setCursor(32, 186);
        tft.print("LANJUT (NEXT) >");
        tft.setTextSize(1);
        tft.setCursor(25, 210);
        tft.print("Sentuh di sini untuk isi air");
        return;
      }

      Serial.println("[TOUCH] Tombol NEXT ditekan! Wadah sudah terdeteksi di sensor.");

      // Feedback visual seketika
      tft.fillRoundRect(10, 174, 220, 54, 8, TFT_GREEN);
      tft.setTextColor(TFT_BLACK, TFT_GREEN);
      tft.setTextSize(2);
      tft.setCursor(35, 190);
      tft.print("MEMULAI...");

      requiredDispenseDurationMs = calculateDispenseDurationMs(targetMilliLitres);
      dispensedMilliLitres = 0;
      dispenseStartTime = millis();
      isDispensing = true;

      // Nyalakan Pompa & Pindah ke Animasi Dispensing
      startPump();
      showDispensingScreen(targetMilliLitres);
      return;
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 4: Di Layar Pengisian Air (Tombol STOP Darurat)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_DISPENSING) {
    if (touchY >= 190 && touchY <= 240 && touchX >= 10 && touchX <= 230) {
      Serial.println("[TOUCH] STOP DARURAT DITEKAN!");
      isDispensing = false;
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

  // Inisialisasi Antrean Pesan Antar-Core (FreeRTOS)
  qNetToUI = xQueueCreate(10, sizeof(NetToUIMessage));
  qUIToNet = xQueueCreate(10, sizeof(UIToNetMessage));

  // Inisialisasi Layar LCD ST7789 & Touch Screen via TFT_eSPI (Termasuk Auto-Kalibrasi NVS)
  initDisplayDriver();

  // Inisialisasi Tampilan Boot WiFi Awal
  showBootWifiScreen("", "", "Memulai Perangkat...");

  // Inisialisasi Model Debit Pompa Presisi (NVS Flash)
  initFlowCalculator();

  // Inisialisasi Sensor Infrared Photoelectric E18-B03P1 & Buzzer
  initProximitySensor();
  initBuzzer();
  beepOnce(100);

  // Inisialisasi WiFiManager Captive Portal (Sinkron saat boot)
  setupWiFiManager();

  // Konfigurasi Klien MQTT Broker
  mqttClient.setServer(mqtt_broker, MQTT_PORT);
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
// LOOP UTAMA: DEDICATED UI & CONTROL TASK (BERJALAN DI CORE 1 APP_CPU)
// ==============================================================================
void loop() {
  // 1. Baca Sensor Proximity E18-B03P1 & Evaluasi Alarm Buzzer
  isTumblerPresent = checkTumblerPresent();
  updateSensorBuzzerAlarm(isTumblerPresent);

  // 2. Proses Pesan Masuk dari Core 0 (Event Jaringan & MQTT)
  handleIncomingNetworkMessages();

  unsigned long currentMillis = millis();

  // 3. Baca Input Sentuhan Layar Touch Screen (High Priority, Zero-Lag)
  handleTouchScreen();

  // 3. Status 1: Proses Pengisian Air Sedang Berlangsung (Dispensing)
  if (isDispensing) {
    unsigned long elapsedTimeMs = currentMillis - dispenseStartTime;
    dispensedMilliLitres = calculateLiveDispensedMl(elapsedTimeMs, targetMilliLitres);

    // Perbarui Animasi Aliran Air & Angka Live di Layar LCD
    updateDispensingAnimation(dispensedMilliLitres, targetMilliLitres);

    // Kirim Telemetri Pengisian ke Core 0 setiap 300 ms
    if (currentMillis - lastTelemetryPublishTime >= 300) {
      lastTelemetryPublishTime = currentMillis;

      float flowRateLpm = (pumpFlowRateMlPerSec * 60.0f) / 1000.0f;
      UIToNetMessage uiMsg;
      memset(&uiMsg, 0, sizeof(uiMsg));
      uiMsg.type = UI_MSG_TELEMETRY;
      uiMsg.dispensedMl = dispensedMilliLitres;
      uiMsg.targetMl = targetMilliLitres;
      uiMsg.flowRateLpm = flowRateLpm;
      uiMsg.flowRateMlPerSec = pumpFlowRateMlPerSec;
      strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);

      if (qUIToNet != NULL) {
        xQueueSend(qUIToNet, &uiMsg, 0);
      }
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

      // Kirim event selesai ke Core 0
      UIToNetMessage uiMsg;
      memset(&uiMsg, 0, sizeof(uiMsg));
      uiMsg.type = UI_MSG_COMPLETE;
      uiMsg.dispensedMl = dispensedMilliLitres;
      strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
      strncpy(uiMsg.statusStr, statusStr.c_str(), sizeof(uiMsg.statusStr) - 1);

      if (qUIToNet != NULL) {
        xQueueSend(qUIToNet, &uiMsg, 0);
      }
    }
  }

  // 4. Status 2: Sedang Menampilkan QRIS (Evaluasi Countdown 5 Menit = 300 Detik Penuh)
  else if (currentScreen == SCREEN_QRIS) {
    if (qrisStartTime == 0) qrisStartTime = currentMillis;
    if (qrisDurationSeconds < 60) qrisDurationSeconds = 300;

    unsigned long elapsedSec = (currentMillis - qrisStartTime) / 1000;
    if (elapsedSec >= qrisDurationSeconds) {
      Serial.printf("[QRIS] Batas waktu %lu detik tercapai! Membatalkan otomatis...\n", qrisDurationSeconds);
      
      UIToNetMessage uiMsg;
      memset(&uiMsg, 0, sizeof(uiMsg));
      uiMsg.type = UI_MSG_ORDER_CANCEL;
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

      if (qUIToNet != NULL) {
        xQueueSend(qUIToNet, &uiMsg, 0);
      }
    }
  }
}
