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
unsigned long loadingMenuStartTime    = 0;
bool initialPackagesLoaded            = false;
int dispenserDryRunRetryCount         = 0;
const int MAX_DRY_RUN_RETRIES         = 2;

// Variabel Kontrol Sensor Proximity Optik CHE18-30NA-B710 & Buzzer
bool isTumblerPresent                 = false;
bool isBuzzerAlarmEnabled             = true;
bool isBuzzerSounding                 = false;
float targetDistanceCm                = 15.0f; // Jarak acuan nominal
float currentMeasuredDistanceCm       = 999.0f; // 5.0f jika terdeteksi, 999.0f jika kosong
bool sensorActiveHigh                 = false; // Default NPN NO: Active LOW (LOW = Terdeteksi)
uint8_t relayActiveState              = RELAY_ACTIVE_STATE; // Default LOW (Active LOW relay)
bool isDirectProximityMode            = false; // true: Wadah ada = Pompa Nyala, Wadah jauh = Pompa Mati (Bebas bayar/Testing)

// State Machine Buzzer Non-Blocking Bebas Konflik Antar-Core
volatile unsigned long buzzerBeepUntil        = 0;
volatile int buzzerBeepCountRemaining         = 0;
volatile unsigned long buzzerNextBeepTime     = 0;

// Variabel Kontrol Pengisian Alur Interaktif
unsigned long pauseStartTime                 = 0;

// Variabel Pengisian Multi-Botol (Ganti Botol di Tengah Jalan)
unsigned long totalAccumulatedMl              = 0;
bool isSwitchingBottle                        = false;

// Variabel Safety Hold Button & Smart Complete Reset
unsigned long holdButtonStartTime             = 0;
bool completeBottleWasRemoved                 = false;
bool completeScreenReminderBeeped             = false;
unsigned long completeScreenEnterTime         = 0;



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
      dispenserDryRunRetryCount = 0;
      totalAccumulatedMl = 0;
      isSwitchingBottle = false;
      beepPattern(2); // 2 Bip konfirmasi pembayaran QRIS lunas diterima!
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
      initialPackagesLoaded = true;
      Serial.printf("[UI Core 1] Paket menu berhasil disinkronkan (%d paket)!\n", totalPackages);
      if (currentScreen == SCREEN_LOADING) {
        // Tampilkan progress 100% sebelum beralih ke Standby
        updateLoadingMenuAnimation(100);
        delay(400);
        showStandbyScreen();
      } else if (currentScreen == SCREEN_STANDBY) {
        showStandbyScreen();
      }
    }
    else if (netMsg.type == NET_MSG_CMD_START) {
      targetMilliLitres = (netMsg.volumeMl > 0) ? netMsg.volumeMl : 600;
      currentTransactionId = String(netMsg.orderId);
      requiredDispenseDurationMs = calculateDispenseDurationMs(targetMilliLitres);
      dispensedMilliLitres = 0;
      totalAccumulatedMl = 0;
      isSwitchingBottle = false;
      activePumpDurationMs = 0;
      lastPumpIterationMillis = millis();
      dispenseStartTime = millis();
      isDispensing = true;
      isDispensePaused = false;

      startPump();
      showDispensingScreen(targetMilliLitres);
    }
    else if (netMsg.type == NET_MSG_CMD_STOP) {
      isDispensing = false;
      isDispensePaused = false;
      isSwitchingBottle = false;
      stopPump();
      beepAlertLong(500); // Alarm panjang Stop Darurat
      showCompleteScreen("EMERGENCY_STOPPED", dispensedMilliLitres, "Tombol Stop Darurat Ditekan");
    }
    else if (netMsg.type == NET_MSG_CMD_RESET) {
      // HANYA reset jika bukan sedang di SCREEN_QRIS atau SCREEN_DISPENSING
      if (currentScreen != SCREEN_QRIS && currentScreen != SCREEN_DISPENSING) {
        isDispensing = false;
        isDispensePaused = false;
        isSwitchingBottle = false;
        stopPump();
        dispensedMilliLitres = 0;
        totalAccumulatedMl = 0;
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
bool handleTouchScreen() {
  static bool s_wasTouched = false;
  static unsigned long s_lastHoldTick = 0;
  int touchX = 0, touchY = 0;

  // Baca sentuhan melalui fungsi terisolasi SPI XPT2046 dengan filter noise
  bool isTouched = getDisplayTouch(touchX, touchY);
  if (!isTouched) {
    s_wasTouched = false;
    // Release detection untuk safety hold buttons (Batal QRIS & Stop Darurat)
    if (holdButtonStartTime != 0) {
      holdButtonStartTime = 0;
      if (currentScreen == SCREEN_QRIS) {
        resetCancelQRISButton();
      } else if (currentScreen == SCREEN_DISPENSING && !isDispensePaused && !isSwitchingBottle) {
        resetStopDispensingButton();
      }
    }
    return false;
  }

  // 1. Deteksi Klik LCD: Bunyi SEKALI saja saat pertama kali layar disentuh (Edge Detection)
  if (!s_wasTouched) {
    s_wasTouched = true;
    beepOnce(35); // Feedback audio sentuhan (tactile click) bunyi sekali
    Serial.printf("[TOUCH CLICK] X=%d, Y=%d (Screen: %d)\n", touchX, touchY, currentScreen);
  }

  // ----------------------------------------------------------------------------
  // KASUS 1: Di Layar Standby (Memilih Menu Paket Air)
  // ----------------------------------------------------------------------------
  if (currentScreen == SCREEN_STANDBY) {
    static unsigned long lastMenuTapTime = 0;
    if (millis() - lastMenuTapTime < 400) return false; // Debounce sentuhan antar-menu

    int maxCards = (totalPackages > 3) ? 3 : totalPackages;

    // Pembagian zona sentuh diskrit tanpa overlap (34..117, 118..199, 200..282)
    // Sesuai dengan geometri kartu vertikal (Tinggi 72px + Gap 8px):
    // Card 0: Y=40..112  -> Zona Sentuh: 34..116
    // Card 1: Y=120..192 -> Zona Sentuh: 118..198
    // Card 2: Y=200..272 -> Zona Sentuh: 200..280
    const int zoneYStart[3] = {34, 118, 200};
    const int zoneYEnd[3]   = {116, 198, 280};

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

        // Feedback visual tombol terpilih seketika (menyorot pill button)
        int cardDrawY = 40 + i * 80;
        tft.drawRoundRect(8, cardDrawY, 224, 72, 6, WV_SUCCESS_GREEN);
        tft.fillRoundRect(18, cardDrawY + 46, 204, 20, 4, WV_SUCCESS_GREEN);
        tft.setTextColor(WV_TEXT_WHITE, WV_SUCCESS_GREEN);
        tft.setTextSize(1);
        tft.setCursor(55, cardDrawY + 52);
        tft.print("[ OK! PAKET TERPILIH ]");

        activePackageIndex = i;
        targetMilliLitres = dispenserPackages[i].volumeMl;
        totalAccumulatedMl = 0;
        isSwitchingBottle = false;

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

        qrisIgnoreTouchUntil = millis() + 2500;
        return true;
      }
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 2: Di Layar QRIS (Tombol Batalkan Pesanan - Tahan 1.0 Detik dengan Progress Bar)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_QRIS) {
    if (millis() < qrisIgnoreTouchUntil) return false;

    // Batasi koordinat sentuh tombol BATAL (X: 8-232, Y: 278-320)
    if (touchX >= 8 && touchX <= 232 && touchY >= 278 && touchY <= 320) {
      if (holdButtonStartTime == 0) {
        holdButtonStartTime = millis();
        s_lastHoldTick = millis();
      }
      unsigned long heldMs = millis() - holdButtonStartTime;
      int pct = (heldMs >= 1000) ? 100 : (int)((heldMs * 100) / 1000);
      drawHoldProgressCancelQRIS(pct);

      // Feedback suara ketika tombol DITAHAN: Bunyi tick setiap 200ms
      if (millis() - s_lastHoldTick >= 200 && heldMs < 1000) {
        s_lastHoldTick = millis();
        beepOnce(25); // Bunyi saat tombol ditahan
      }

      if (heldMs >= 1000) {
        Serial.println("[TOUCH] Customer menahan tombol batal 1.0 detik. Membatalkan pesanan QRIS...");
        holdButtonStartTime = 0;
        beepOnce(120);

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
      return false; // Sedang ditahan
    } else {
      if (holdButtonStartTime != 0) {
        holdButtonStartTime = 0;
        resetCancelQRISButton();
      }
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 3: Di Layar Letakkan Tumbler (Tombol MULAI ISI & TIMBANG ULANG WADAH)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_PLACE_TUMBLER) {
    // Area sentuh tombol MULAI ISI AIR (Y: 178-242, X: 6-234)
    if (touchY >= 178 && touchY <= 242 && touchX >= 6 && touchX <= 234) {
      // Proteksi Keamanan: Cegah air tumpah jika tumbler belum diletakkan di bawah corong
      if (!isTumblerPresent) {
        Serial.println("[SAFETY] Tombol MULAI ditekan tapi tumbler belum terdeteksi di sensor!");
        tft.fillRoundRect(8, 182, 224, 56, 8, WV_DANGER_RED);
        tft.setTextColor(WV_TEXT_WHITE, WV_DANGER_RED);
        tft.setTextSize(2);
        tft.setCursor(24, 194);
        tft.print("PASANG TUMBLER!");
        beepPattern(2);
        delay(600);
        s_placeTumblerFirstDraw = true;
        return false;
      }

      Serial.println("[TOUCH] Tombol MULAI ditekan! Wadah terdeteksi.");
      beepOnce(80);

      // Feedback visual seketika
      tft.fillRoundRect(8, 182, 224, 56, 8, WV_PRIMARY_BLUE);
      tft.setTextColor(WV_TEXT_WHITE, WV_PRIMARY_BLUE);
      tft.setTextSize(2);
      tft.setCursor(45, 194);
      tft.print("MEMULAI...");

      requiredDispenseDurationMs = calculateDispenseDurationMs(targetMilliLitres);
      dispensedMilliLitres = 0;
      totalAccumulatedMl = 0;
      isSwitchingBottle = false;
      activePumpDurationMs = 0;
      lastPumpIterationMillis = millis();
      dispenseStartTime = millis();
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
      if (isSwitchingBottle) {
        // --- SENTUHAN SAAT MODE GANTI BOTOL BARU ---

        // A. Tombol 1: MULAI ISI BOTOL > (Y: 160..220, X: 6..234)
        if (touchY >= 160 && touchY <= 220 && touchX >= 6 && touchX <= 234) {
          if (!isTumblerPresent) {
            Serial.println("[SAFETY] Tombol MULAI ditekan tapi botol baru belum terdeteksi!");
            beepPattern(2);
            return false;
          }

          Serial.printf("[TOUCH] Botol baru dikonfirmasi! Melanjutkan sisa air dari %lu mL (Target: %lu mL)\n",
                        totalAccumulatedMl, targetMilliLitres);
          beepOnce(80);

          isSwitchingBottle = false;
          isDispensePaused = false;
          lastPumpIterationMillis = millis();
          dispenseStartTime = millis();

          startPump();
          showDispensingScreen(targetMilliLitres);
          return true;
        }

        // B. Tombol 2: SELESAI (SUDAH CUKUP) (Y: 224..270, X: 6..234)
        if (touchY >= 224 && touchY <= 270 && touchX >= 6 && touchX <= 234) {
          Serial.println("[TOUCH] SELESAI (SUDAH CUKUP) ditekan pada mode ganti botol.");
          beepPattern(3); // 3 Bip selesai pengisian
          isDispensing = false;
          isDispensePaused = false;
          isSwitchingBottle = false;
          stopPump();
          showCompleteScreen("COMPLETED", dispensedMilliLitres, "Pengisian Selesai (Diakhiri Pelanggan)");

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

        // C. Tombol 3: KEMBALI KE JEDA (Y: 272..316, X: 6..234)
        if (touchY >= 272 && touchY <= 316 && touchX >= 6 && touchX <= 234) {
          Serial.println("[TOUCH] BATALKAN GANTI BOTOL ditekan. Kembali ke jeda...");
          beepOnce(60);
          isSwitchingBottle = false;
          s_lastDispensePauseState = false; // Memaksa redraw layar pause normal
          return true;
        }

        return false;
      }

      // --- SENTUHAN SAAT JEDA NORMAL (WADAH TERLEPAS) ---

      // A. Tombol 1: + GANTI BOTOL LAIN (Y: 124..170, X: 6..234)
      if (touchY >= 124 && touchY <= 170 && touchX >= 6 && touchX <= 234) {
        Serial.println("[TOUCH] Tombol GANTI BOTOL LAIN ditekan!");
        beepOnce(80);

        totalAccumulatedMl = dispensedMilliLitres; // Kunci volume yang sudah masuk
        isSwitchingBottle = true;
        pauseStartTime = millis(); // Reset timeout jeda untuk botol baru

        showSwitchBottleScreen(totalAccumulatedMl, targetMilliLitres);
        return true;
      }

      // B. Tombol 2: SELESAI (CUKUP) (Y: 172..216, X: 6..234)
      if (touchY >= 172 && touchY <= 216 && touchX >= 6 && touchX <= 234) {
        Serial.println("[TOUCH] SELESAI (CUKUP) ditekan saat jeda pengisian.");
        beepPattern(3); // 3 Bip selesai pengisian
        isDispensing = false;
        isDispensePaused = false;
        isSwitchingBottle = false;
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

      // C. Tombol 3: STOP / BATAL saat Jeda (Y: 218..264, X: 6..234)
      if (touchY >= 218 && touchY <= 264 && touchX >= 6 && touchX <= 234) {
        Serial.println("[TOUCH] STOP/BATAL ditekan saat jeda pengisian!");
        beepAlertLong(500); // Alarm panjang Stop Darurat
        isDispensing = false;
        isDispensePaused = false;
        isSwitchingBottle = false;
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
      // Area sentuh STOP darurat normal (Y: 180-236, X: 8-232) - Tahan 1.0 Detik dengan Progress Fill
      if (touchY >= 180 && touchY <= 236 && touchX >= 8 && touchX <= 232) {
        if (holdButtonStartTime == 0) {
          holdButtonStartTime = millis();
          s_lastHoldTick = millis();
        }
        unsigned long heldMs = millis() - holdButtonStartTime;
        int pct = (heldMs >= 1000) ? 100 : (int)((heldMs * 100) / 1000);
        drawHoldProgressStopDispensing(pct);

        // Feedback suara ketika tombol DITAHAN: Bunyi tick setiap 200ms
        if (millis() - s_lastHoldTick >= 200 && heldMs < 1000) {
          s_lastHoldTick = millis();
          beepOnce(30); // Bunyi saat tombol ditahan
        }

        if (heldMs >= 1000) {
          Serial.println("[TOUCH] STOP DARURAT DITAHAN 1 DETIK! Menghentikan pengisian...");
          holdButtonStartTime = 0;
          beepAlertLong(500); // Alarm panjang Stop Darurat
          isDispensing = false;
          isDispensePaused = false;
          isSwitchingBottle = false;
          stopPump();
          showCompleteScreen("EMERGENCY_STOPPED", dispensedMilliLitres, "Stop Darurat Ditekan");

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
        return false;
      } else {
        if (holdButtonStartTime != 0) {
          holdButtonStartTime = 0;
          resetStopDispensingButton();
        }
      }
    }
  }

  // ----------------------------------------------------------------------------
  // KASUS 5: Di Layar Kegagalan Air Tidak Naik (SCREEN_FAILED)
  // ----------------------------------------------------------------------------
  else if (currentScreen == SCREEN_FAILED) {
    // A. Tombol 1: COBA LAGI (Y: 200..256, X: 6..234)
    if (touchY >= 200 && touchY <= 256 && touchX >= 6 && touchX <= 234) {
      Serial.println("[TOUCH FAILED SCREEN] Pelanggan memilih COBA LAGI!");
      beepOnce(80);

      // Cek Batas Percobaan Coba Lagi agar tidak bisa di-looping tanpa henti
      if (dispenserDryRunRetryCount >= MAX_DRY_RUN_RETRIES) {
        Serial.println("[SAFETY] Batas coba lagi sudah habis! Harus tekan LAPOR ADMIN.");
        tft.fillRoundRect(8, 206, 224, 48, 6, WV_WARNING_AMBER);
        tft.setTextColor(WV_TEXT_WHITE, WV_WARNING_AMBER);
        tft.setTextSize(2);
        tft.setCursor(20, 218);
        tft.print("BATAS COBA HABIS!");
        beepPattern(2);
        delay(800);
        // Tampilkan kembali tombol coba habis
        tft.fillRoundRect(8, 206, 224, 48, 6, WV_FOOTER_BG);
        tft.drawRoundRect(8, 206, 224, 48, 6, WV_CARD_BORDER);
        tft.setTextColor(WV_TEXT_MUTED, WV_FOOTER_BG);
        tft.setTextSize(2);
        tft.setCursor(25, 214);
        tft.print("[ COBA HABIS ]");
        tft.setTextSize(1);
        tft.setCursor(20, 236);
        tft.print("Silakan tekan LAPOR ADMIN di bawah");
        return false;
      }

      // Proteksi Keamanan: Pastikan wadah masih terpasang (Sensor Ultrasonik)
      bool isBottleReady = isTumblerPresent;
      if (!isBottleReady) {
        Serial.printf("[SAFETY] Ingin coba lagi tapi wadah belum terpasang!\n");
        tft.fillRoundRect(8, 206, 224, 48, 6, WV_WARNING_AMBER);
        tft.setTextColor(WV_TEXT_WHITE, WV_WARNING_AMBER);
        tft.setTextSize(2);
        tft.setCursor(28, 218);
        tft.print("PASANG WADAH!");
        beepPattern(2);
        delay(800);
        // Pulihkan tombol Coba Lagi
        int retryLeft = max(0, MAX_DRY_RUN_RETRIES - dispenserDryRunRetryCount);
        tft.fillRoundRect(8, 206, 224, 48, 6, WV_PRIMARY_BLUE);
        tft.setTextColor(WV_TEXT_WHITE, WV_PRIMARY_BLUE);
        tft.setTextSize(2);
        tft.setCursor(25, 214);
        tft.printf("[ > COBA LAGI (%d) ]", retryLeft);
        tft.setTextSize(1);
        tft.setCursor(20, 236);
        tft.print("Lanjutkan sisa air tanpa bayar lagi");
        return false;
      }

      // Tambahkan hitungan percobaan retry
      dispenserDryRunRetryCount++;
      Serial.printf("[RETRY] Melakukan percobaan coba lagi ke-%d dari maks %d\n", dispenserDryRunRetryCount, MAX_DRY_RUN_RETRIES);

      // Beri feedback tombol ditekan
      tft.fillRoundRect(8, 206, 224, 48, 6, WV_SUCCESS_GREEN);
      tft.setTextColor(WV_TEXT_WHITE, WV_SUCCESS_GREEN);
      tft.setTextSize(2);
      tft.setCursor(25, 218);
      tft.print("MEMULAI LAGI...");

      // Hitung sisa durasi / volume yang belum terisi
      unsigned long remainingMl = (targetMilliLitres > dispensedMilliLitres) ? (targetMilliLitres - dispensedMilliLitres) : targetMilliLitres;
      requiredDispenseDurationMs = calculateDispenseDurationMs(remainingMl);

      lastPumpIterationMillis = millis();
      dispenseStartTime = millis();
      isDispensePaused = false;
      isDispensing = true;

      startPump();
      showDispensingScreen(targetMilliLitres);
      return true;
    }

    // B. Tombol 2: BATAL & LAPOR ADMIN (Y: 258..316, X: 6..234)
    if (touchY >= 258 && touchY <= 316 && touchX >= 6 && touchX <= 234) {
      Serial.println("[TOUCH FAILED SCREEN] Pelanggan memilih BATAL & LAPOR ADMIN!");
      beepPattern(2);

      // Feedback visual tombol
      tft.fillRoundRect(8, 260, 224, 48, 6, WV_TEXT_BLACK);
      tft.setTextColor(WV_TEXT_WHITE, WV_TEXT_BLACK);
      tft.setTextSize(2);
      tft.setCursor(20, 272);
      tft.print("MELAPORKAN...");

      isDispensing = false;
      isDispensePaused = false;
      stopPump();

      // Kirim event complete dengan status FAILED_AIR_HABIS ke Core 0
      UIToNetMessage uiMsg;
      memset(&uiMsg, 0, sizeof(uiMsg));
      uiMsg.type = UI_MSG_COMPLETE;
      uiMsg.dispensedMl = dispensedMilliLitres;
      strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
      strncpy(uiMsg.statusStr, "FAILED", sizeof(uiMsg.statusStr) - 1);

      if (qUIToNet != NULL) {
        xQueueSend(qUIToNet, &uiMsg, 0);
      }

      long currentPrice = (activePackageIndex >= 0 && activePackageIndex < totalPackages) ? dispenserPackages[activePackageIndex].price : 6000L;
      showReportedClaimScreen(currentTransactionId.c_str(), currentPrice);
      return true;
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

  // Inisialisasi Sensor Proximity & Buzzer
  initProximitySensor();
  initBuzzer();
  beepOnce(100);

  // Inisialisasi Paket Menu Air dari Flash NVS (Memulihkan menu tersimpan saat boot)
  loadPackagesFromNVS();

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

  // Tampilkan layar loading UI/UX untuk mengambil menu pertama kali
  showLoadingMenuScreen("Menghubungkan ke Server...");
  loadingMenuStartTime = millis();

  // Kirim permintaan get_packages ke Core 0
  UIToNetMessage getPkgMsg;
  memset(&getPkgMsg, 0, sizeof(getPkgMsg));
  getPkgMsg.type = UI_MSG_GET_PACKAGES;
  if (qUIToNet != NULL) {
    xQueueSend(qUIToNet, &getPkgMsg, 0);
  }
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
      saveProximityConfig(newDist, sensorActiveHigh);
      Serial.printf(">> [OK] Target acuan deteksi diperbarui: <= %.1f cm (Tersimpan ke NVS Flash)\n", targetDistanceCm);
      beepOnce(80);
    } else {
      Serial.println(">> [ERROR] Nilai jarak tidak valid! Masukkan antara 2.0 s/d 50.0 cm (Contoh: DIST:12.0)");
    }
  }
  // 2. Perintah PROX? / STATUS? / DIST? (Cek Status Sensor Proximity Optik)
  else if (cmd.equalsIgnoreCase("PROX?") || cmd.equalsIgnoreCase("STATUS?") || cmd.equalsIgnoreCase("DIST?")) {
    int rawPin = digitalRead(PIN_PROXIMITY_SENSOR);
    Serial.println("==================================================");
    Serial.println(">> STATUS SENSOR PROXIMITY OPTIK CHE18-30NA-B710:");
    Serial.printf("   - Pin Hardware GPIO   : %d (INPUT_PULLUP)\n", PIN_PROXIMITY_SENSOR);
    Serial.printf("   - Level Sinyal Fisik  : %s\n", rawPin == HIGH ? "HIGH (3.3V)" : "LOW (0V / GND)");
    Serial.printf("   - Konfigurasi Logika  : %s\n", sensorActiveHigh ? "Active HIGH" : "Active LOW (NPN NO Default)");
    Serial.printf("   - Status Tumbler      : %s\n", isTumblerPresent ? "TERPASANG [OK]" : "KOSONG / TIDAK TERDETEKSI");
    Serial.printf("   - Alarm Buzzer        : %s\n", isBuzzerAlarmEnabled ? "AKTIF (ON)" : "MATI (OFF)");
    Serial.println("==================================================");
  }
  // 3. Perintah POLARITY:LOW / POLARITY:HIGH
  else if (cmd.equalsIgnoreCase("POLARITY:LOW") || cmd.equalsIgnoreCase("ACT:LOW")) {
    saveProximityPolarity(false);
    beepOnce(80);
    Serial.println(">> [OK] Polaritas diset Active LOW (Default NPN Normally Open).");
  }
  else if (cmd.equalsIgnoreCase("POLARITY:HIGH") || cmd.equalsIgnoreCase("ACT:HIGH")) {
    saveProximityPolarity(true);
    beepOnce(80);
    Serial.println(">> [OK] Polaritas diset Active HIGH.");
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
  // 11. Perintah SONG (Uji Coba Melodi Lagu Buzzer Take on Me)
  else if (cmd.equalsIgnoreCase("SONG") || cmd.equalsIgnoreCase("LAGU")) {
    Serial.println(">> [OK] Memulai pemutaran lagu Take on Me pada buzzer...");
    startBootSong();
  }
  else if (cmd.equalsIgnoreCase("SONG:STOP") || cmd.equalsIgnoreCase("STOP:SONG")) {
    Serial.println(">> [OK] Menghentikan melodi lagu buzzer.");
    stopBootSong();
  }
  // 12. Perintah Uji Coba Manual Pompa Air (PUMP:ON / PUMP:OFF / PUMP:TEST)
  else if (cmd.equalsIgnoreCase("PUMP:ON") || cmd.equalsIgnoreCase("POMPA:ON")) {
    Serial.println(">> [MANUAL] Memaksa Pompa MENYALA (ON)...");
    startPump();
    beepOnce(60);
  }
  else if (cmd.equalsIgnoreCase("PUMP:OFF") || cmd.equalsIgnoreCase("POMPA:OFF")) {
    Serial.println(">> [MANUAL] Memaksa Pompa MATI (OFF)...");
    stopPump();
    beepOnce(60);
  }
  else if (cmd.equalsIgnoreCase("PUMP:TEST") || cmd.equalsIgnoreCase("TEST:PUMP")) {
    Serial.println(">> [TEST POMPA] Menyalakan pompa selama 3 detik...");
    startPump();
    beepOnce(80);
    delay(3000);
    stopPump();
    Serial.println(">> [TEST POMPA] Selesai uji coba 3 detik. Pompa dimatikan.");
    beepPattern(2);
  }
  // 13. Perintah Polaritas Relay (RELAY:LOW / RELAY:HIGH)
  else if (cmd.equalsIgnoreCase("RELAY:LOW") || cmd.equalsIgnoreCase("RELAY:0")) {
    relayActiveState = LOW;
    stopPump();
    Serial.println(">> [OK] Konfigurasi Relay diatur ke: ACTIVE LOW (0V)");
    beepOnce(80);
  }
  else if (cmd.equalsIgnoreCase("RELAY:HIGH") || cmd.equalsIgnoreCase("RELAY:1")) {
    relayActiveState = HIGH;
    stopPump();
    Serial.println(">> [OK] Konfigurasi Relay diatur ke: ACTIVE HIGH (3.3V)");
    beepOnce(80);
  }
  // 14. Perintah Mode Operasi (MODE:DIRECT / MODE:KIOSK)
  else if (cmd.equalsIgnoreCase("MODE:DIRECT") || cmd.equalsIgnoreCase("DIRECT:ON") || cmd.equalsIgnoreCase("AUTO:ON")) {
    isDirectProximityMode = true;
    Serial.println("==================================================");
    Serial.println(">> [OK] MODE OTOMATIS LANGSUNG (DIRECT) AKTIF!");
    Serial.println("   - Botol didekatkan ke sensor -> POMPA MENYALA");
    Serial.println("   - Botol dijauhkan dari sensor -> POMPA MATI");
    Serial.println("   - Jarak murni diatur dari sekrup di belakang sensor!");
    Serial.println("==================================================");
    beepPattern(3);
  }
  else if (cmd.equalsIgnoreCase("MODE:KIOSK") || cmd.equalsIgnoreCase("DIRECT:OFF") || cmd.equalsIgnoreCase("AUTO:OFF")) {
    isDirectProximityMode = false;
    stopPump();
    Serial.println(">> [OK] MODE KIOSK BERBAYAR AKTIF (Alur Normal QRIS)");
    beepOnce(100);
  }
  // 15. Bantuan Command
  else if (cmd.equalsIgnoreCase("HELP") || cmd.equalsIgnoreCase("?")) {
    Serial.println(">> PERINTAH SERIAL TERSEDIA:");
    Serial.println("   - MODE:DIRECT   : Aktifkan mode otomatis bebas bayar (Botol ada = Pompa ON, Botol jauh = Pompa OFF)");
    Serial.println("   - MODE:KIOSK    : Kembalikan ke mode kiosk berbayar (Alur QRIS)");
    Serial.println("   - PUMP:TEST     : Uji coba pompa menyala 3 detik");
    Serial.println("   - PUMP:ON/OFF   : Nyalakan / Matikan pompa manual");
    Serial.println("   - PROX?         : Cek level pin & status sensor optik CHE18-30NA-B710");
    Serial.println("   - POLARITY:LOW  : Set logika deteksi Active LOW (Default NPN Normally Open)");
    Serial.println("   - POLARITY:HIGH : Set logika deteksi Active HIGH");
    Serial.println("   - RELAY:LOW     : Set relay Active LOW (0V)");
    Serial.println("   - RELAY:HIGH    : Set relay Active HIGH (3.3V)");
    Serial.println("   - SONG          : Uji coba pemutaran lagu buzzer (Take on Me)");
    Serial.println("   - FLOW:<rate>   : Atur debit pompa dinamis (Contoh: FLOW:25.0)");
    Serial.println("   - FLOW?         : Cek debit saat ini & tabel simulasi waktu");
    Serial.println("   - WIFI:RESET    : Hapus Wi-Fi tersimpan & buka hotspot");
    Serial.println("   - BEEP          : Uji coba bunyi buzzer");
  }
}

// ==============================================================================
// LOOP UTAMA: DEDICATED UI & CONTROL TASK (BERJALAN DI CORE 1 APP_CPU)
// ==============================================================================
void loop() {
  // 1. Baca Perintah Serial Monitor (Offline Dynamic Distance Config & Kalibrasi)
  handleSerialCommands();

  // 2. Baca Sensor Proximity Optik CHE18-30NA-B710
  if (isDirectProximityMode || currentScreen == SCREEN_PLACE_TUMBLER || currentScreen == SCREEN_DISPENSING || 
      currentScreen == SCREEN_COMPLETE || currentScreen == SCREEN_FAILED) {
    isTumblerPresent = checkTumblerPresent();
  } else {
    isTumblerPresent = false;
  }
  // 3. Update State Machine Buzzer (Selalu dipanggil di setiap loop di Core 1 agar antrean bip mati tepat waktu)
  updateBuzzer();

  // A. LOGIKA MODE LANGSUNG OTOMATIS (DIRECT AUTO PROXIMITY MODE)
  // Wadah terdeteksi = Pompa Nyala, Wadah dijauhkan = Pompa Mati (Bebas bayar / Testing)
  if (isDirectProximityMode) {
    static bool s_directPumpActive = false;
    if (isTumblerPresent && !s_directPumpActive) {
      s_directPumpActive = true;
      startPump();
      Serial.println("[DIRECT MODE] Wadah terdeteksi -> POMPA NYALA (ON)");
    } else if (!isTumblerPresent && s_directPumpActive) {
      s_directPumpActive = false;
      stopPump();
      Serial.println("[DIRECT MODE] Wadah dijauhkan -> POMPA MATI (OFF)");
    }
    return; // Langsung selesai untuk iterasi loop ini di mode langsung
  }

  // B. LOGIKA AUTO-START DI LAYAR LETAKKAN WADAH (SCREEN_PLACE_TUMBLER)
  // Begitu wadah terdeteksi di tatakan, pompa OTOMATIS MENYALA tanpa harus sentuh layar!
  if (currentScreen == SCREEN_PLACE_TUMBLER) {
    updatePlaceTumblerUI(isTumblerPresent, currentMeasuredDistanceCm);
    if (isTumblerPresent && !isDispensing) {
      static unsigned long s_autoStartTimer = 0;
      if (s_autoStartTimer == 0) s_autoStartTimer = millis();
      if (millis() - s_autoStartTimer >= 200) { // Stabil 200ms
        s_autoStartTimer = 0;
        Serial.println("[AUTO-START] Wadah terdeteksi di tatakan! Pompa OTOMATIS MENYALA...");
        beepOnce(80);
        requiredDispenseDurationMs = calculateDispenseDurationMs(targetMilliLitres);
        dispensedMilliLitres = 0;
        totalAccumulatedMl = 0;
        isSwitchingBottle = false;
        activePumpDurationMs = 0;
        lastPumpIterationMillis = millis();
        dispenseStartTime = millis();
        isDispensing = true;
        isDispensePaused = false;
        startPump();
        showDispensingScreen(targetMilliLitres);
        return;
      }
    } else {
      static unsigned long s_autoStartTimer = 0;
      s_autoStartTimer = 0;
    }
  }
  else if (currentScreen == SCREEN_DISPENSING && isSwitchingBottle) {
    updateSwitchBottleUI(isTumblerPresent);
  }

  // 4. Proses Pesan Masuk dari Core 0 (Event Jaringan & MQTT)
  handleIncomingNetworkMessages();

  // 5. Baca Input Sentuhan Layar Touch Screen (High Priority, Zero-Lag)
  if (handleTouchScreen()) {
    // Layar baru saja berpindah melalui interaksi sentuhan.
    // Segera akhiri iterasi loop ini agar layar baru dievaluasi dengan timer segar di iterasi berikutnya!
    return;
  }

  // Refresh waktu saat ini setelah interaksi sentuhan
  unsigned long currentMillis = millis();

  // 6. Status 1: Proses Pengisian Air Sedang Berlangsung (Dispensing)
  if (isDispensing) {
    // KASUS A: SEDANG DALAM PROSES GANTI BOTOL BARU
    if (isSwitchingBottle) {
      stopPump();

      // Peringatan Audio 15 detik terakhir sebelum jeda ganti botol habis (75..90 detik): Bip tiap 3 dtk
      unsigned long elapsedSwitch = currentMillis - pauseStartTime;
      if (elapsedSwitch >= 75000 && elapsedSwitch < 90000) {
        static unsigned long s_lastSwitchWarnTime = 0;
        if (currentMillis - s_lastSwitchWarnTime >= 3000) {
          s_lastSwitchWarnTime = currentMillis;
          beepOnce(70);
        }
      }

      // Evaluasi Batas Waktu Ganti Botol (Timeout 90 Detik)
      if (currentMillis - pauseStartTime >= 90000) {
        Serial.println("[TIMEOUT GANTI BOTOL] Batas waktu 90 detik habis. Menyelesaikan otomatis...");
        isDispensing = false;
        isDispensePaused = false;
        isSwitchingBottle = false;
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
      return; // Tunggu pelanggan mengonfirmasi botol baru
    }

    // PROTEKSI SENSOR WADAH: SMART PAUSE & RESUME (Sensor Ultrasonik)
    bool isTumblerRemoved = !isTumblerPresent;

    if (isTumblerRemoved) {
      // WADAH TERLEPAS / DITARIK!
      if (!isDispensePaused) {
        isDispensePaused = true;
        stopPump();
        pauseStartTime = currentMillis;
        beepPattern(2); // Peringatan 2 bip wadah terlepas
        Serial.printf("[SAFETY PAUSE] Wadah terlepas saat dispensing! Pompa DIMATIKAN sementara. Terisi: %lu/%lu mL\n",
                      dispensedMilliLitres, targetMilliLitres);
      }

      // Peringatan Audio 15 detik terakhir sebelum timeout jeda habis (45..60 detik): Bip tiap 3 dtk
      unsigned long elapsedPause = currentMillis - pauseStartTime;
      if (elapsedPause >= 45000 && elapsedPause < 60000) {
        static unsigned long s_lastPauseWarnTime = 0;
        if (currentMillis - s_lastPauseWarnTime >= 3000) {
          s_lastPauseWarnTime = currentMillis;
          beepOnce(70);
        }
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
        startPump();
        beepOnce(80); // Bip konfirmasi resume
        Serial.printf("[SAFETY RESUME] Wadah terpasang kembali! Pompa DINYALAKAN kembali. Melanjutkan dari %lu mL...\n",
                      dispensedMilliLitres);
      }

      // Akumulasikan waktu aktif pompa berputar
      unsigned long deltaMs = (currentMillis >= lastPumpIterationMillis) ? (currentMillis - lastPumpIterationMillis) : 0;
      activePumpDurationMs += deltaMs;
      lastPumpIterationMillis = currentMillis;

      // Hitung estimasi volume air terisi (mL) real-time berdasarkan debit pompa terkalibrasi & waktu aktif
      unsigned long remainingQuota = (targetMilliLitres > totalAccumulatedMl) ? (targetMilliLitres - totalAccumulatedMl) : 0;
      dispensedMilliLitres = totalAccumulatedMl + calculateLiveDispensedMl(activePumpDurationMs, remainingQuota);
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

      if (qUIToNet != NULL) {
        xQueueSend(qUIToNet, &uiMsg, 0);
      }
    }

    // Pemicu Pengisian Selesai: Durasi pompa tercapai atau kuota volume terpenuhi
    if (activePumpDurationMs >= requiredDispenseDurationMs || dispensedMilliLitres >= targetMilliLitres) {
      stopPump();
      isDispensing = false;
      isDispensePaused = false;
      dispensedMilliLitres = targetMilliLitres;

      beepPattern(3); // 3 Bip gembira: Pengisian air selesai 100%!
      Serial.printf("[DISPENSE COMPLETE] Selesai: %lu mL dalam %lu ms (Target: %lu mL). Pompa Mati Presisi!\n",
                    dispensedMilliLitres, activePumpDurationMs, targetMilliLitres);

      showCompleteScreen("COMPLETED", dispensedMilliLitres, "Pengisian Selesai Presisi");

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

  // 5. Status 3: Layar Place Tumbler, Selesai, Gagal, Loading, atau Siaga (Standby)
  else {
    // Penanganan khusus SCREEN_LOADING (Animasi & Auto-Fallback jika offline)
    if (currentScreen == SCREEN_LOADING) {
      updateLoadingMenuAnimation();

      // Jika dalam 5 detik belum dapat update paket dari broker, gunakan paket NVS/default agar tidak macet
      if (loadingMenuStartTime > 0 && currentMillis - loadingMenuStartTime >= 5000) {
        Serial.println("[LOADING MENU] Waktu tunggu 5 detik tercapai. Menampilkan menu lokal/NVS...");
        updateLoadingMenuAnimation(100);
        delay(300);
        showStandbyScreen();
      }
      return; // Jangan jalankan reset standby selama loading berlangsung
    }

    // Penanganan Cerdas SCREEN_COMPLETE (Smart Reset: 5s jika botol diangkat, 10s jika tertinggal + pengingat 6s)
    if (currentScreen == SCREEN_COMPLETE) {
      bool isBottleLifted = !isTumblerPresent;
      if (isBottleLifted && !completeBottleWasRemoved) {
        completeBottleWasRemoved = true;
        autoResetScreenTime = currentMillis + 5000; // Reset tepat 5 detik setelah botol diangkat! ("5 detik aja")
        Serial.println("[SMART RESET] Botol telah diangkat. Auto reset dalam 5 detik.");
      }

      // Jika botol masih tertinggal di tatakan pada detik ke-6, ingatkan dengan 2 bip buzzer ("10")
      if (!completeBottleWasRemoved && !completeScreenReminderBeeped && (currentMillis - completeScreenEnterTime >= 6000)) {
        completeScreenReminderBeeped = true;
        beepPattern(2);
        Serial.println("[SMART REMINDER] Pengingat: Botol masih di tatakan selama 6 detik!");
      }
    }

    checkAutoResetScreen();

    // Fail-safe Timeout 3 Menit untuk SCREEN_FAILED jika ditinggal pelanggan tanpa sentuhan
    static unsigned long failedScreenStartTime = 0;
    if (currentScreen == SCREEN_FAILED) {
      if (failedScreenStartTime == 0) failedScreenStartTime = currentMillis;
      if (currentMillis - failedScreenStartTime >= 180000) { // 3 menit (180 detik)
        failedScreenStartTime = 0;
        Serial.println("[TIMEOUT FAILED SCREEN] 3 menit tanpa sentuhan, auto-lapor gagal ke server.");
        UIToNetMessage uiMsg;
        memset(&uiMsg, 0, sizeof(uiMsg));
        uiMsg.type = UI_MSG_COMPLETE;
        uiMsg.dispensedMl = dispensedMilliLitres;
        strncpy(uiMsg.orderId, currentTransactionId.c_str(), sizeof(uiMsg.orderId) - 1);
        strncpy(uiMsg.statusStr, "FAILED", sizeof(uiMsg.statusStr) - 1);
        if (qUIToNet != NULL) {
          xQueueSend(qUIToNet, &uiMsg, 0);
        }
        showStandbyScreen();
      }
    } else {
      failedScreenStartTime = 0;
    }

    // Kirim Heartbeat Status READY ke Core 0 setiap 1000 ms (HANYA jika bukan di SCREEN_FAILED)
    if (currentScreen != SCREEN_FAILED && currentMillis - lastTelemetryPublishTime >= 1000) {
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
