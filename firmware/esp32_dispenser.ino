/*
 * Firmware ESP32 Dispenser Air Minum Otomatis Berbayar (WaterVend IoT)
 * 
 * Hardware yang digunakan:
 * - ESP32 DevKit V1
 * - Extended Development Board (Shield Adapter)
 * - Sensor Berat: Load Cell 5kg + Modul Penguat HX711 (Cut-Off Presisi & Real-Time Weight)
 *   - DT / DOUT : GPIO 16 (D16 / RX2)
 *   - SCK / CLK : GPIO 4  (D4)
 * - Modul Relay 2 Channel (Optocoupler Isolation)
 *   - Channel 1 (IN1): Kontrol Pompa Air BR314 (GPIO 5)
 *   - Channel 2 (IN2): Cadangan / Auxiliary (GPIO 18)
 * - Pompa Air DC BR314 (Ditenagai Catu Daya terpisah via Kontak Relay)
 * - LED Status Onboard (GPIO 2)
 * - Tombol BOOT (GPIO 0): Tahan saat menyala untuk Reset WiFi
 * 
 * Protokol Komunikasi:
 * - MQTT via Eclipse Mosquitto (Broker Port 1883)
 * - PubSub Topics:
 *   - Subscribe: water/dispenser/{DEVICE_ID}/command
 *   - Publish:   water/dispenser/{DEVICE_ID}/status
 *   - Publish:   water/dispenser/{DEVICE_ID}/telemetry
 *   - Publish:   water/dispenser/{DEVICE_ID}/complete
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiManager.h>      // Library WiFiManager oleh tzapu
#include <Preferences.h>      // Simpan IP MQTT, Faktor Kalibrasi & Batas Berat ke NVS Flash ESP32
#include "HX711.h"            // Library HX711 oleh bogde

// ====== KONFIGURASI DEFAULT & PREFERENCES ======
Preferences preferences;
char mqtt_broker[40] = "10.10.4.235"; // IP Laptop / Mosquitto Broker saat ini
const int   MQTT_PORT     = 1883;
const char* DEVICE_ID     = "DISPENSER-01";

// Pin Tombol BOOT onboard untuk Reset Pengaturan WiFi (tahan 3 detik saat menyala)
const int PIN_TRIGGER_RESET_WIFI = 0; // GPIO 0 (Tombol BOOT ESP32)

// ====== PIN HARDWARE (EXTENDED DEVELOPMENT BOARD) ======
// Sensor Timbangan HX711 + Load Cell 5kg
const int PIN_HX711_DT        = 16; // GPIO 16 (DT / Data - D16)
const int PIN_HX711_SCK       = 4;  // GPIO 4  (SCK / Clock - D4)

// Channel 1 Relay: Kontrol Pompa BR314
const int PIN_RELAY_PUMP_CH1  = 5;  // GPIO 5 (D5 pada Expansion Board)
// Channel 2 Relay: Cadangan (Spare)
const int PIN_RELAY_SPARE_CH2 = 18; // GPIO 18 (Cadangan)
// Status LED Onboard
const int PIN_LED_STATUS      = 2;  // GPIO 2

// ====== KONFIGURASI LOGIKA TRIGGER RELAY ======
// Relay OFF selalu dengan MELEPAS pin (INPUT/floating) agar tidak terpengaruh level 3.3V ESP32.
// RELAY_ACTIVE_STATE = level yang MENYALAKAN relay: LOW untuk modul Active LOW, HIGH untuk Active HIGH.
#define RELAY_ACTIVE_STATE LOW

// ====== ESTIMASI DEBIT POMPA BR314 (CADANGAN / FALLBACK) ======
const float PUMP_FLOW_RATE_ML_PER_SEC = 25.0; // 25 mL per detik (~1.5 Liter/menit)

// ====== VARIABEL TIMBANGAN (HX711), KALIBRASI & BATAS BERAT ======
HX711 scale;
float calibrationFactor   = -420.0;   // Faktor kalibrasi (dimuat dari NVS Flash)
float maxWeightLimitGrams = 2500.0;   // Batas berat maksimal proteksi (default 2500g)
bool isScaleReady         = false;    // Status apakah HX711 siap
long lastRawAdcReading    = 0;        // Nilai ADC mentah 24-bit absolut dari HX711
long lastRawValueNet      = 0;        // Nilai ADC setelah dikurangi tare offset
float initialContainerWeight = 0.0; // Berat wadah kosong saat di-tare
float dispensedWeightGrams   = 0.0; // Berat air bersih yang telah diisi (1 gram = 1 mL)
float currentLiveWeight      = 0.0; // Pembacaan berat live saat standby/idle
unsigned long lastTelemetryPublishTime = 0;

// ====== VARIABEL PENGUKURAN & STATUS PENGISIAN ======
bool isDispensing = false;
unsigned long targetMilliLitres = 0;
unsigned long dispensedMilliLitres = 0;
unsigned long dispenseStartTime = 0;
String currentTransactionId = "";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ====== HELPER JSON VALUE EXTRACTOR ======
String extractJsonValue(const String& json, const String& key) {
  int keyIndex = json.indexOf("\"" + key + "\"");
  if (keyIndex < 0) return "";
  int colonIndex = json.indexOf(":", keyIndex);
  if (colonIndex < 0) return "";
  
  int startIdx = colonIndex + 1;
  while (startIdx < json.length() && (json[startIdx] == ' ' || json[startIdx] == '\t')) {
    startIdx++;
  }
  
  if (json[startIdx] == '\"') {
    int endQuote = json.indexOf("\"", startIdx + 1);
    if (endQuote > startIdx) {
      return json.substring(startIdx + 1, endQuote);
    }
  } else {
    int endIdx = startIdx;
    while (endIdx < json.length() && json[endIdx] != ',' && json[endIdx] != '}' && json[endIdx] != ']') {
      endIdx++;
    }
    String val = json.substring(startIdx, endIdx);
    val.trim();
    return val;
  }
  return "";
}

// ====== SETUP WIFIMANAGER DENGAN CAPTIVE PORTAL ======
void setupWiFiManager() {
  preferences.begin("watervend", false);
  String savedBroker = preferences.getString("mqtt_broker", "10.10.4.235");
  if (savedBroker == "192.168.1.4") {
    savedBroker = "10.10.4.235";
    preferences.putString("mqtt_broker", savedBroker);
  }
  savedBroker.toCharArray(mqtt_broker, 40);

  // Ambil faktor kalibrasi & batas berat yang tersimpan di NVS jika ada
  calibrationFactor   = preferences.getFloat("cal_factor", -420.0);
  maxWeightLimitGrams = preferences.getFloat("max_weight", 2500.0);
  preferences.end();

  WiFiManager wm;
  WiFiManagerParameter custom_mqtt_broker("broker", "IP Laptop / MQTT Broker", mqtt_broker, 40);
  wm.addParameter(&custom_mqtt_broker);

  if (digitalRead(PIN_TRIGGER_RESET_WIFI) == LOW) {
    Serial.println("\n[RESET] Tombol BOOT terdeteksi! Menghapus data Wi-Fi tersimpan...");
    wm.resetSettings();
    delay(1000);
  }

  wm.setConfigPortalTimeout(180);

  Serial.println("\n[WiFiManager] Mencoba menyambung ke Wi-Fi tersimpan...");
  digitalWrite(PIN_LED_STATUS, HIGH);

  bool res = wm.autoConnect("WaterVend-Setup");

  if (!res) {
    Serial.println("[WiFiManager] Gagal terhubung atau waktu portal habis. Merestart ESP32...");
    delay(2000);
    ESP.restart();
  }

  if (strlen(custom_mqtt_broker.getValue()) > 0) {
    strcpy(mqtt_broker, custom_mqtt_broker.getValue());
    preferences.begin("watervend", false);
    preferences.putString("mqtt_broker", String(mqtt_broker));
    preferences.end();
    Serial.printf("[WiFiManager] IP MQTT Broker tersimpan: %s\n", mqtt_broker);
  }

  Serial.println("\n[Wi-Fi] Terhubung Berhasil!");
  Serial.print("[Wi-Fi] SSID Aktif: ");
  Serial.println(WiFi.SSID());
  Serial.print("[Wi-Fi] IP ESP32: ");
  Serial.println(WiFi.localIP());
  Serial.printf("[MQTT] Target Broker: %s:%d\n", mqtt_broker, MQTT_PORT);
  Serial.printf("[CONFIG] Faktor Kalibrasi: %.2f | Batas Berat Maksimal: %.1f g\n", 
                calibrationFactor, maxWeightLimitGrams);
}

// ====== KONTROL POMPA BR314 (RELAY CHANNEL 1) ======
void startPump() {
  pinMode(PIN_RELAY_PUMP_CH1, OUTPUT);
  digitalWrite(PIN_RELAY_PUMP_CH1, RELAY_ACTIVE_STATE); // Relay Ch 1 ON -> Pompa BR314 Berputar
  digitalWrite(PIN_LED_STATUS, HIGH);
  Serial.println("[POMPA BR314] STATUS: HIDUP (ON) -> Air mulai mengalir.");
}

void stopPump() {
  pinMode(PIN_RELAY_PUMP_CH1, INPUT); // Lepas pin (floating) -> Relay Ch 1 OFF -> Pompa BR314 Berhenti
  digitalWrite(PIN_LED_STATUS, LOW);
  Serial.println("[POMPA BR314] STATUS: MATI (OFF) -> Aliran air berhenti seketika.");
}

// ====== CEK VALIDITAS PEMBACAAN ADC 24-BIT HX711 ======
bool isAdcReadingValid(long raw) {
  // Rentang ADC 24-bit yang valid (bukan jenuh minimum -8388608 atau maksimum 8388607 atau 0/-1)
  return (raw > -8300000 && raw < 8300000 && raw != 0 && raw != -1);
}

// ====== INISIALISASI TIMBANGAN HX711 ======
void setupLoadCell() {
  Serial.println("\n[HX711] Menginisialisasi sensor timbangan (DT: D16, SCK: D4)...");
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);

  // Tunggu sensor siap (maksimal 1 detik)
  if (scale.wait_ready_timeout(1000)) {
    lastRawAdcReading = scale.read();

    if (isAdcReadingValid(lastRawAdcReading)) {
      isScaleReady = true;
      scale.set_scale(calibrationFactor);
      scale.tare(10); // Nol-kan timbangan saat booting tanpa beban
      lastRawValueNet = scale.get_value(1);

      Serial.println("\n=======================================================");
      Serial.println("[HX711 STATUS] ✅ SENSOR LOAD CELL & HX711 TERPASANG NORMAL!");
      Serial.printf("  - Pin DT (Data) : GPIO %d (D16)\n", PIN_HX711_DT);
      Serial.printf("  - Pin SCK (Clk) : GPIO %d (D4)\n", PIN_HX711_SCK);
      Serial.printf("  - Raw ADC Awal  : %ld\n", lastRawAdcReading);
      Serial.printf("  - Faktor Kalibrasi : %.2f\n", calibrationFactor);
      Serial.println("  - Status Timbangan : SIAP DIGUNAKAN SECARA REAL-TIME.");
      Serial.println("=======================================================\n");
    } else {
      isScaleReady = false;
      Serial.println("\n=======================================================");
      Serial.printf("[HX711 PERINGATAN] ⚠️ RAW ADC JENUH / SATURATED (%ld)!\n", lastRawAdcReading);
      Serial.println("  Penyebab & Solusi Wajib:");
      Serial.println("  1. PINDAHKAN VCC HX711 KE 5V (VIN ESP32)! Jika dipasang di 3.3V, ADC akan jenuh -8388608.");
      Serial.println("  2. Periksa 4 kabel Load Cell ke HX711:");
      Serial.println("     Merah -> E+ | Hitam -> E- | Putih -> A- | Hijau -> A+");
      Serial.println("  3. Pastikan tidak ada kabel longgar / kendor.");
      Serial.println("=======================================================\n");
    }
  } else {
    isScaleReady = false;
    Serial.println("\n=======================================================");
    Serial.println("[HX711 STATUS] ⚠️ LOAD CELL / HX711 BELUM MERESPON!");
    Serial.printf("  - Periksa kabel DT (GPIO %d / D16) & SCK (GPIO %d / D4)\n", PIN_HX711_DT, PIN_HX711_SCK);
    Serial.println("  - Sistem akan menunggu sensor tersambung secara otomatis.");
    Serial.println("=======================================================\n");
  }
}

// ====== CALLBACK MQTT COMMAND ======
void mqttCallback(char* topic, byte* message, unsigned int length) {
  String messageStr = "";
  for (unsigned int i = 0; i < length; i++) {
    messageStr += (char)message[i];
  }
  Serial.print("\n[MQTT Command Diterima]: ");
  Serial.println(messageStr);

  String action = extractJsonValue(messageStr, "action");

  // Perintah 1: START (Mulai Pengisian Air)
  if (action == "START") {
    String volStr = extractJsonValue(messageStr, "volumeMl");
    targetMilliLitres = (volStr.length() > 0) ? volStr.toInt() : 600;

    String maxWtStr = extractJsonValue(messageStr, "maxWeight");
    if (maxWtStr.length() > 0) {
      maxWeightLimitGrams = maxWtStr.toFloat();
    }

    String txId = extractJsonValue(messageStr, "transactionId");
    currentTransactionId = (txId.length() > 0) ? txId : (String("tx-") + String(millis()));

    // Baca berat wadah awal & Tare otomatis saat pengisian dimulai
    if (scale.is_ready() || scale.wait_ready_timeout(200)) {
      long raw = scale.read();
      lastRawAdcReading = raw;
      if (isAdcReadingValid(raw)) {
        isScaleReady = true;
        scale.set_scale(calibrationFactor);
        
        // Ambil bobot wadah saat ini (gram)
        long currentOffset = scale.get_offset();
        long netBeforeTare = raw - currentOffset;
        initialContainerWeight = (float)netBeforeTare / calibrationFactor;
        if (initialContainerWeight < 0.0) initialContainerWeight = 0.0;
        
        // Tare agar penambahan air bersih mulai dari 0 gram
        scale.tare(3);
        Serial.printf("[TARE OTOMATIS] Wadah terdeteksi: %.1f g -> Timbangan di-tare (0 g).\n", initialContainerWeight);
      } else {
        isScaleReady = false;
        initialContainerWeight = 0.0;
        Serial.printf("[TARE INFO] Sensor ADC jenuh (%ld), fallback ke estimasi waktu debit pompa.\n", raw);
      }
    } else {
      isScaleReady = false;
      initialContainerWeight = 0.0;
      Serial.println("[TARE INFO] Sensor belum siap, menggunakan estimasi waktu pompa.");
    }

    dispensedWeightGrams = 0.0;
    dispensedMilliLitres = 0;
    dispenseStartTime = millis();
    lastTelemetryPublishTime = millis();
    isDispensing = true;

    // Hidupkan Pompa BR314
    startPump();

    Serial.printf("[PENGISIAN DIMULAI] Target: %lu mL (Tx: %s) | Mode: %s\n", 
                  targetMilliLitres, currentTransactionId.c_str(), (isScaleReady ? "WEIGHT_LOADCELL" : "TIME_FALLBACK"));

    // Publish telemetri awal dengan log Tare
    String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
    String tareLogMsg = isScaleReady 
      ? (String("Wadah terdeteksi ") + String(initialContainerWeight, 1) + " g. Timbangan dinolkan otomatis.")
      : (lastRawAdcReading <= -8300000 
          ? String("ADC Jenuh (-8388608). Mode debit waktu aktif. Cek VCC ke 5V!") 
          : String("Mode cadangan debit waktu aktif."));

    String payload = String("{\"status\":\"DISPENSING\",\"dispensedMl\":0,\"weightGrams\":0.0,\"grossWeight\":") + String(initialContainerWeight, 1) +
                     String(",\"targetMl\":") + targetMilliLitres + 
                     String(",\"containerWeight\":") + String(initialContainerWeight, 1) + 
                     String(",\"maxWeightLimit\":") + String(maxWeightLimitGrams, 1) + 
                     String(",\"isScaleReady\":") + (isScaleReady ? "true" : "false") + 
                     String(",\"scaleRaw\":") + String(lastRawAdcReading) + 
                     String(",\"tareLog\":\"") + tareLogMsg + "\"" + 
                     String(",\"flowRate\":") + String((PUMP_FLOW_RATE_ML_PER_SEC * 60) / 1000, 2) + 
                     String(",\"cutOffMode\":\"") + (isScaleReady ? "WEIGHT_LOADCELL" : "TIME_FALLBACK") + "\"" + 
                     String(",\"transactionId\":\"") + currentTransactionId + "\"}";
    mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
  }

  // Perintah 2: STOP (Stop Darurat - BISA DITEKAN KAPAN SAJA)
  else if (action == "STOP") {
    isDispensing = false;
    stopPump(); // Matikan Pompa BR314 seketika tanpa syarat!
    Serial.printf("[STOP DARURAT DITERIMA] Pompa dimatikan paksa pada %lu mL (%.1f g).\n", 
                  dispensedMilliLitres, dispensedWeightGrams);

    String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
    mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"message\":\"Emergency Stopped - Pompa Dimatikan\"}", true);

    String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
    String stopPayload = String("{\"status\":\"EMERGENCY_STOPPED\",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                         String(",\"weightGrams\":") + String(dispensedWeightGrams, 1) + 
                         String(",\"transactionId\":\"") + currentTransactionId + "\"}";
    mqttClient.publish(topicComplete.c_str(), stopPayload.c_str());
  }

  // Perintah: RESET (Reset Sesi Pengisian, Nol-kan Berat & Volume, dan Tare Ulang)
  else if (action == "RESET") {
    isDispensing = false;
    stopPump(); // Matikan pompa seketika jika masih menyala
    dispensedWeightGrams = 0.0;
    dispensedMilliLitres = 0;
    targetMilliLitres = 0;
    initialContainerWeight = 0.0;
    currentTransactionId = "";

    // Lakukan tare jika sensor siap
    if (scale.is_ready() || scale.wait_ready_timeout(200)) {
      long raw = scale.read();
      lastRawAdcReading = raw;
      if (isAdcReadingValid(raw)) {
        isScaleReady = true;
        scale.set_scale(calibrationFactor);
        scale.tare(5);
        currentLiveWeight = 0.0;
        Serial.println("[RESET] Timbangan berhasil di-tare ke 0.0 g.");
      }
    }

    Serial.println("[RESET] Sesi pengisian dinolkan (0 mL / 0.0 g). Status: READY.");

    String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
    String payload = String("{\"status\":\"READY\",\"isScaleReady\":") + (isScaleReady ? "true" : "false") + 
                     String(",\"message\":\"Sesi pengisian & timbangan berhasil di-reset\",\"dispensedMl\":0,\"weightGrams\":0.0,\"currentWeight\":0.0}");
    mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);

    String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
    String telPayload = String("{\"status\":\"READY\",\"dispensedMl\":0,\"weightGrams\":0.0,\"targetMl\":0,\"flowRate\":0.0,\"tareLog\":\"Sesi pengisian berhasil di-reset.\"}");
    mqttClient.publish(topicTelemetry.c_str(), telPayload.c_str());
  }

  // Perintah 3: TARE (Nol-kan Timbangan Secara Manual dari Web)
  else if (action == "TARE") {
    if (scale.is_ready() || scale.wait_ready_timeout(500)) {
      long raw = scale.read();
      lastRawAdcReading = raw;
      if (isAdcReadingValid(raw)) {
        isScaleReady = true;
        scale.set_scale(calibrationFactor);
        scale.tare(5);
        currentLiveWeight = 0.0;
        Serial.println("[TARE MANUAL] Timbangan berhasil dinolkan via Web Dashboard.");

        String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
        String payload = String("{\"status\":\"READY\",\"isScaleReady\":true,\"scaleRaw\":") + String(raw) + 
                         String(",\"message\":\"Timbangan berhasil di-tare (0.0 g)\",\"currentWeight\":0.0,\"calFactor\":") + 
                         String(calibrationFactor, 2) + ",\"maxWeightLimit\":" + String(maxWeightLimitGrams, 1) + "}";
        mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);
      } else {
        isScaleReady = false;
        Serial.printf("[TARE GAGAL] ADC Jenuh (%ld). Cek kabel VCC ke 5V!\n", raw);
        String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
        String payload = String("{\"status\":\"READY\",\"isScaleReady\":false,\"scaleRaw\":") + String(raw) + 
                         String(",\"message\":\"Gagal Tare: ADC jenuh (") + String(raw) + String("). Pindahkan VCC ke 5V!\"}");
        mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);
      }
    } else {
      Serial.println("[TARE GAGAL] Modul HX711 tidak merespon.");
      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"isScaleReady\":false,\"message\":\"Gagal: Modul HX711 belum merespon\"}", true);
    }
  }

  // Perintah 4: CALIBRATE (Kalibrasi Otomatis dengan Beban Acuan dari Web)
  else if (action == "CALIBRATE") {
    String weightStr = extractJsonValue(messageStr, "knownWeight");
    float knownWeight = (weightStr.length() > 0) ? weightStr.toFloat() : 500.0;

    if ((scale.is_ready() || scale.wait_ready_timeout(500)) && knownWeight > 0.0) {
      long raw = scale.read();
      lastRawAdcReading = raw;
      if (!isAdcReadingValid(raw)) {
        isScaleReady = false;
        Serial.printf("[KALIBRASI GAGAL] Nilai ADC jenuh (%ld)!\n", raw);
        String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
        mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"isScaleReady\":false,\"message\":\"Gagal: ADC Jenuh (-8388608). Pastikan VCC ke 5V!\"}", true);
      } else {
        isScaleReady = true;
        long rawReading = scale.get_value(10);
        if (abs(rawReading) < 100) {
          Serial.println("[KALIBRASI GAGAL] Nilai sensor terlalu kecil. Pastikan beban acuan diletakkan!");
          String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
          mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"message\":\"Gagal: Nilai sensor terlalu kecil. Pastikan beban acuan ditaruh!\"}", true);
        } else {
          calibrationFactor = (float)rawReading / knownWeight;
          scale.set_scale(calibrationFactor);

          preferences.begin("watervend", false);
          preferences.putFloat("cal_factor", calibrationFactor);
          preferences.end();

          Serial.printf("[KALIBRASI SUKSES] Beban: %.1f g | Raw Value: %ld | Faktor Baru: %.2f (Tersimpan ke Flash)\n", 
                        knownWeight, rawReading, calibrationFactor);

          String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
          String payload = String("{\"status\":\"READY\",\"isScaleReady\":true,\"message\":\"Kalibrasi berhasil tersimpan!\",\"calFactor\":") + 
                           String(calibrationFactor, 2) + ",\"knownWeight\":" + String(knownWeight, 1) + "}";
          mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);
        }
      }
    } else {
      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"isScaleReady\":false,\"message\":\"Gagal Kalibrasi: HX711 belum siap\"}", true);
    }
  }

  // Perintah 5: SET_CAL_FACTOR (Set Nilai Faktor Kalibrasi Langsung)
  else if (action == "SET_CAL_FACTOR") {
    String factorStr = extractJsonValue(messageStr, "factor");
    if (factorStr.length() > 0) {
      float newFactor = factorStr.toFloat();
      calibrationFactor = newFactor;
      scale.set_scale(calibrationFactor);

      preferences.begin("watervend", false);
      preferences.putFloat("cal_factor", calibrationFactor);
      preferences.end();

      Serial.printf("[SET CAL FACTOR] Faktor kalibrasi disetel ke: %.2f (Tersimpan di Flash)\n", calibrationFactor);

      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      String payload = String("{\"status\":\"READY\",\"message\":\"Faktor kalibrasi berhasil diubah\",\"calFactor\":") + 
                       String(calibrationFactor, 2) + "}";
      mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);
    }
  }

  // Perintah 6: SET_MAX_WEIGHT (Set Batas Berat Maksimal Keselamatan)
  else if (action == "SET_MAX_WEIGHT") {
    String maxWtStr = extractJsonValue(messageStr, "maxWeight");
    if (maxWtStr.length() > 0) {
      maxWeightLimitGrams = maxWtStr.toFloat();
      preferences.begin("watervend", false);
      preferences.putFloat("max_weight", maxWeightLimitGrams);
      preferences.end();

      Serial.printf("[SET MAX WEIGHT] Batas berat maksimal disetel ke: %.1f gram (Tersimpan di Flash)\n", maxWeightLimitGrams);

      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      String payload = String("{\"status\":\"READY\",\"message\":\"Batas berat maksimal berhasil diperbarui\",\"maxWeightLimit\":") + 
                       String(maxWeightLimitGrams, 1) + "}";
      mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);
    }
  }
}

// ====== REKONEKSI MQTT DENGAN LAST WILL AND TESTAMENT (LWT) ======
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Menghubungkan ke Mosquitto Broker...");
    String clientId = String("ESP32-") + DEVICE_ID;
    String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
    String topicCommand = String("water/dispenser/") + DEVICE_ID + "/command";

    const char* willTopic = topicStatus.c_str();
    int willQos = 1;
    bool willRetain = true;
    const char* willMessage = "{\"status\":\"OFFLINE\"}";

    if (mqttClient.connect(clientId.c_str(), willTopic, willQos, willRetain, willMessage)) {
      Serial.println(" Terhubung!");

      String readyPayload = String("{\"status\":\"READY\",\"isScaleReady\":") + (isScaleReady ? "true" : "false") + 
                            String(",\"scaleStatus\":\"") + (isScaleReady ? "CONNECTED" : "WAITING") + "\"" +
                            String(",\"calFactor\":") + String(calibrationFactor, 2) + 
                            String(",\"maxWeightLimit\":") + String(maxWeightLimitGrams, 1) + "}";
      mqttClient.publish(topicStatus.c_str(), readyPayload.c_str(), true);
      mqttClient.subscribe(topicCommand.c_str());
      Serial.printf("[MQTT] Berlangganan topik: %s\n", topicCommand.c_str());
    } else {
      Serial.print(" Gagal (rc=");
      Serial.print(mqttClient.state());
      Serial.println("). Mencoba lagi dalam 5 detik...");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(PIN_LED_STATUS, OUTPUT);
  pinMode(PIN_TRIGGER_RESET_WIFI, INPUT_PULLUP);

  // Relay dimatikan dengan MELEPAS pin (floating) -> relay pasti OFF saat booting
  stopPump();
  pinMode(PIN_RELAY_SPARE_CH2, INPUT);

  // Inisialisasi Sensor Timbangan Load Cell 5kg + HX711
  setupLoadCell();

  // Inisialisasi WiFiManager (Auto-connect atau Captive Portal)
  setupWiFiManager();

  // Hubungkan ke MQTT Broker dengan IP dinamis dari Preferences/Portal
  mqttClient.setServer(mqtt_broker, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  unsigned long currentMillis = millis();

  // ====== BACA TIMBANGAN REAL-TIME NON-BLOCKING ======
  if (scale.is_ready()) {
    long raw = scale.read();
    lastRawAdcReading = raw;

    if (isAdcReadingValid(raw)) {
      isScaleReady = true;
      lastRawValueNet = raw - scale.get_offset();

      // Hitung berat bersih dalam gram (1 mL air murni ~ 1 gram)
      float calculatedWeight = (float)lastRawValueNet / calibrationFactor;

      // Filter getaran / noise sangat kecil
      if (abs(calculatedWeight) < 0.5) calculatedWeight = 0.0;

      if (isDispensing) {
        if (calculatedWeight < 0.0) calculatedWeight = 0.0;
        dispensedWeightGrams = calculatedWeight;
        dispensedMilliLitres = (unsigned long)dispensedWeightGrams;
      } else {
        currentLiveWeight = calculatedWeight;
      }
    } else {
      isScaleReady = false;
      currentLiveWeight = 0.0;
    }
  }

  // ====== KASUS 1: PROSES PENGISIAN AIR SEDANG BERLANGSUNG ======
  if (isDispensing) {
    if (!isScaleReady) {
      // Fallback: Estimasi debit pompa berbasis waktu jika sensor belum terpasang / jenuh
      unsigned long elapsedTimeMs = currentMillis - dispenseStartTime;
      dispensedMilliLitres = (unsigned long)((elapsedTimeMs / 1000.0) * PUMP_FLOW_RATE_ML_PER_SEC);
      dispensedWeightGrams = (float)dispensedMilliLitres;
    }

    // Berat bruto total di atas platform (wadah awal + air yang terisi)
    float totalGrossWeight = initialContainerWeight + dispensedWeightGrams;

    // Kirim pembaruan telemetri setiap 300 ms ke Web Dashboard
    if (currentMillis - lastTelemetryPublishTime >= 300) {
      lastTelemetryPublishTime = currentMillis;

      float flowRateLpm = (PUMP_FLOW_RATE_ML_PER_SEC * 60.0) / 1000.0; // Liter/menit (~1.50 L/min)
      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"flowRate\":") + String(flowRateLpm, 2) + 
                       String(",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                       String(",\"weightGrams\":") + String(dispensedWeightGrams, 1) + 
                       String(",\"grossWeight\":") + String(totalGrossWeight, 1) + 
                       String(",\"scaleRaw\":") + String(lastRawAdcReading) + 
                       String(",\"scaleValue\":") + String(lastRawValueNet) + 
                       String(",\"maxWeightLimit\":") + String(maxWeightLimitGrams, 1) + 
                       String(",\"isScaleReady\":") + (isScaleReady ? "true" : "false") + 
                       String(",\"targetMl\":") + String(targetMilliLitres) + 
                       String(",\"containerWeight\":") + String(initialContainerWeight, 1) + 
                       String(",\"status\":\"DISPENSING\"") + 
                       String(",\"cutOffMode\":\"") + (isScaleReady ? "WEIGHT_LOADCELL" : "TIME_FALLBACK") + "\"" + 
                       String(",\"transactionId\":\"") + currentTransactionId + "\"}";
      mqttClient.publish(topicTelemetry.c_str(), payload.c_str());

      Serial.printf("[DISPENSING] Air: %.1f g (%lu mL) | Raw ADC: %ld | Mode: %s\n", 
                    dispensedWeightGrams, dispensedMilliLitres, lastRawAdcReading, (isScaleReady ? "WEIGHT" : "TIME"));
    }

    // CUT-OFF OTOMATIS BERBASIS BERAT AIR & PROTEKSI BEBAN MAKSIMAL
    bool targetReached = false;
    if (isScaleReady) {
      targetReached = (dispensedWeightGrams >= (float)targetMilliLitres);
    } else {
      targetReached = (dispensedMilliLitres >= targetMilliLitres);
    }

    // Proteksi Beban Berlebih: HANYA aktif jika timbangan valid dan nilainya masuk akal (< 20000g)
    bool overweightExceeded = (isScaleReady && (totalGrossWeight >= maxWeightLimitGrams) && (totalGrossWeight < 20000.0));

    // Safety Timeout (Wadah bocor / diangkat)
    unsigned long maxSafetyDuration = ((targetMilliLitres / PUMP_FLOW_RATE_ML_PER_SEC) * 1000) + 7000;
    bool timeoutSafety = (currentMillis - dispenseStartTime > maxSafetyDuration);

    if (targetReached || timeoutSafety || overweightExceeded) {
      isDispensing = false;
      stopPump(); // MATIKAN POMPA BR314 SEKETIKA

      if (overweightExceeded) {
        Serial.printf("[OVERWEIGHT CUT-OFF] Beban total (%.1f g) melampaui batas berat (%.1f g)! Pompa dimatikan.\n", 
                      totalGrossWeight, maxWeightLimitGrams);

        String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
        String alertPayload = String("{\"status\":\"STOPPED_OVERWEIGHT\",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                              String(",\"weightGrams\":") + String(dispensedWeightGrams, 1) + 
                              String(",\"grossWeight\":") + String(totalGrossWeight, 1) + 
                              String(",\"maxWeightLimit\":") + String(maxWeightLimitGrams, 1) + 
                              String(",\"message\":\"Pompa dimatikan otomatis: Beban melebihi batas berat maksimal!\"") + 
                              String(",\"transactionId\":\"") + currentTransactionId + "\"}";
        mqttClient.publish(topicComplete.c_str(), alertPayload.c_str());

        String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
        mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"message\":\"Pompa berhenti: Melebihi batas berat aman\"}", true);
      }
      else if (timeoutSafety && !targetReached) {
        Serial.printf("[SAFETY CUT-OFF] Batas waktu keselamatan tercapai! Pompa dimatikan pada %.1f g.\n", dispensedWeightGrams);

        String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
        String completePayload = String("{\"status\":\"TIMEOUT_CUTOFF\",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                                 String(",\"weightGrams\":") + String(dispensedWeightGrams, 1) + 
                                 String(",\"transactionId\":\"") + currentTransactionId + "\"}";
        mqttClient.publish(topicComplete.c_str(), completePayload.c_str());

        String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
        mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\"}", true);
      } 
      else {
        Serial.printf("[SELESAI] Target %lu mL (%.1f g) tercapai! Pompa BR314 dimatikan presisi.\n", 
                      targetMilliLitres, dispensedWeightGrams);

        String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
        String completePayload = String("{\"status\":\"COMPLETED\",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                                 String(",\"weightGrams\":") + String(dispensedWeightGrams, 1) + 
                                 String(",\"transactionId\":\"") + currentTransactionId + "\"}";
        mqttClient.publish(topicComplete.c_str(), completePayload.c_str());

        String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
        String statusPayload = String("{\"status\":\"READY\",\"isScaleReady\":") + (isScaleReady ? "true" : "false") + 
                               String(",\"lastDispensedWeight\":") + String(dispensedWeightGrams, 1) + "}";
        mqttClient.publish(topicStatus.c_str(), statusPayload.c_str(), true);
      }
    }
  }

  // ====== KASUS 2: MODE STANDBY / IDLE (PEMANTAUAN BERAT REAL-TIME) ======
  else {
    // Kirim telemetri status berat standby ke Web Dashboard setiap 400 ms (Real-Time Responsif!)
    if (currentMillis - lastTelemetryPublishTime >= 400) {
      lastTelemetryPublishTime = currentMillis;

      String scaleLogMsg = "";
      if (lastRawAdcReading <= -8300000 || lastRawAdcReading >= 8300000) {
        scaleLogMsg = "ADC Jenuh (-8388608). Cek: 1. VCC wajib ke 5V (bukan 3.3V). 2. Kabel: Merah->E+, Hitam->E-, Putih->A-, Hijau->A+";
      } else if (!isScaleReady) {
        scaleLogMsg = "Sensor belum terdeteksi. Cek pin DT->D16, SCK->D4.";
      } else {
        scaleLogMsg = "Sensor Load Cell Normal & Siap.";
      }

      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"status\":\"READY\"") + 
                       String(",\"currentWeight\":") + String(currentLiveWeight, 1) + 
                       String(",\"calFactor\":") + String(calibrationFactor, 2) + 
                       String(",\"maxWeightLimit\":") + String(maxWeightLimitGrams, 1) + 
                       String(",\"isScaleReady\":") + (isScaleReady ? "true" : "false") + 
                       String(",\"scaleRaw\":") + String(lastRawAdcReading) + 
                       String(",\"scaleValue\":") + String(lastRawValueNet) + 
                       String(",\"scaleLog\":\"") + scaleLogMsg + "\"" + 
                       String(",\"cutOffMode\":\"") + (isScaleReady ? "WEIGHT_LOADCELL" : "TIME_FALLBACK") + "\"" + 
                       String(",\"dispensedMl\":0,\"targetMl\":0,\"flowRate\":0.0}");
      mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
    }
  }
}
