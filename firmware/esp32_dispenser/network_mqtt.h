#pragma once
#include "config.h"
#include "display_ui.h"
#include "pump_control.h"
#include "flow_calculator.h"
#include "proximity_sensor.h"
#include "buzzer_control.h"
#include "scale_sensor.h"

// ==============================================================================
// MODUL JARINGAN WIFI & PROTOKOL MQTT IOT (CORE 0 DEDICATED TASK)
// (Thread-Safe FreeRTOS Queue, Non-blocking Reconnect, Dynamic Packages)
// ==============================================================================

// Helper untuk mengekstrak nilai string dari payload JSON sederhana
inline String extractJsonValue(const String& json, const String& key) {
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

// Helper untuk memparsing daftar paket dari database web
inline void parsePackagesFromJson(const String& json) {
  int searchPos = 0;
  int count = 0;

  // Cari posisi array "packages": [ ... ]
  int packagesKeyIdx = json.indexOf("\"packages\"");
  if (packagesKeyIdx >= 0) {
    int arrayStart = json.indexOf("[", packagesKeyIdx);
    if (arrayStart >= 0) {
      searchPos = arrayStart + 1;
    }
  }

  while (count < MAX_PACKAGES) {
    int objStart = json.indexOf('{', searchPos);
    if (objStart < 0) break;
    int objEnd = json.indexOf('}', objStart);
    if (objEnd < 0) break;

    // Ekstrak objek JSON tunggal: { ... }
    String itemJson = json.substring(objStart, objEnd + 1);

    String nameVal = extractJsonValue(itemJson, "name");
    String volVal = extractJsonValue(itemJson, "volumeMl");
    String priceVal = extractJsonValue(itemJson, "price");
    String codeVal = extractJsonValue(itemJson, "code");
    String idVal = extractJsonValue(itemJson, "id");
    if (idVal.length() == 0) idVal = String(count + 1);
    if (codeVal.length() == 0) codeVal = String("PKG_") + volVal;

    if (nameVal.length() > 0 && volVal.length() > 0 && priceVal.length() > 0) {
      strncpy(dispenserPackages[count].id, idVal.c_str(), sizeof(dispenserPackages[count].id) - 1);
      dispenserPackages[count].id[sizeof(dispenserPackages[count].id) - 1] = '\0';

      strncpy(dispenserPackages[count].code, codeVal.c_str(), sizeof(dispenserPackages[count].code) - 1);
      dispenserPackages[count].code[sizeof(dispenserPackages[count].code) - 1] = '\0';

      strncpy(dispenserPackages[count].name, nameVal.c_str(), sizeof(dispenserPackages[count].name) - 1);
      dispenserPackages[count].name[sizeof(dispenserPackages[count].name) - 1] = '\0';

      dispenserPackages[count].volumeMl = volVal.toInt();
      dispenserPackages[count].price = priceVal.toInt();

      Serial.printf("[PACKAGES] Paket %d dimuat: %s (%s) | %d mL | Rp %ld\n",
                    count + 1, dispenserPackages[count].name, dispenserPackages[count].code,
                    dispenserPackages[count].volumeMl, dispenserPackages[count].price);
      count++;
    }

    searchPos = objEnd + 1;
  }

  if (count > 0) {
    totalPackages = count;
    Serial.printf("[PACKAGES] Total %d paket menu berhasil disinkronisasi dari database web!\n", totalPackages);
    
    // Simpan permanen ke Flash Memory NVS
    preferences.begin("wv_pkg", false);
    preferences.putInt("count", totalPackages);
    for (int i = 0; i < totalPackages; i++) {
      String pfx = "p" + String(i) + "_";
      preferences.putString((pfx + "id").c_str(), dispenserPackages[i].id);
      preferences.putString((pfx + "code").c_str(), dispenserPackages[i].code);
      preferences.putString((pfx + "name").c_str(), dispenserPackages[i].name);
      preferences.putInt((pfx + "vol").c_str(), dispenserPackages[i].volumeMl);
      preferences.putLong((pfx + "prc").c_str(), dispenserPackages[i].price);
    }
    preferences.end();
    Serial.printf("[NVS] %d paket berhasil disimpan permanen ke Flash Memory NVS!\n", totalPackages);

    // Kirim notifikasi ke UI Task (Core 1)
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_PACKAGES_UPDATED;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }
}

// Memuat paket menu yang tersimpan dari NVS saat boot awal
inline void loadPackagesFromNVS() {
  preferences.begin("wv_pkg", true);
  int count = preferences.getInt("count", 0);
  if (count > 0 && count <= MAX_PACKAGES) {
    for (int i = 0; i < count; i++) {
      String pfx = "p" + String(i) + "_";
      String idVal = preferences.getString((pfx + "id").c_str(), "");
      String codeVal = preferences.getString((pfx + "code").c_str(), "");
      String nameVal = preferences.getString((pfx + "name").c_str(), "");
      int volVal = preferences.getInt((pfx + "vol").c_str(), 0);
      long prcVal = preferences.getLong((pfx + "prc").c_str(), 0);

      if (nameVal.length() > 0 && volVal > 0) {
        strncpy(dispenserPackages[i].id, idVal.c_str(), sizeof(dispenserPackages[i].id) - 1);
        dispenserPackages[i].id[sizeof(dispenserPackages[i].id) - 1] = '\0';

        strncpy(dispenserPackages[i].code, codeVal.c_str(), sizeof(dispenserPackages[i].code) - 1);
        dispenserPackages[i].code[sizeof(dispenserPackages[i].code) - 1] = '\0';

        strncpy(dispenserPackages[i].name, nameVal.c_str(), sizeof(dispenserPackages[i].name) - 1);
        dispenserPackages[i].name[sizeof(dispenserPackages[i].name) - 1] = '\0';

        dispenserPackages[i].volumeMl = volVal;
        dispenserPackages[i].price = prcVal;
      }
    }
    totalPackages = count;
    Serial.printf("[NVS] Berhasil memuat %d paket menu dari Flash Memory NVS!\n", totalPackages);
  } else {
    Serial.println("[NVS] Belum ada paket tersimpan di NVS. Menggunakan paket bawaan default.");
  }
  preferences.end();
}


// Helper untuk menghapus kredensial Wi-Fi & membuka portal konfigurasi
inline void resetWiFiSettings() {
  Serial.println("\n[WIFI RESET] Menghapus data Wi-Fi tersimpan & merestart ESP32...");
  WiFiManager wm;
  wm.resetSettings();
  delay(1000);
  ESP.restart();
}

// Inisialisasi WiFiManager dengan Captive Portal
inline void setupWiFiManager() {
  preferences.begin("watervend", false);
  String savedBroker = preferences.getString("mqtt_broker", "192.168.1.4");
  savedBroker.toCharArray(mqtt_broker, 40);
  preferences.end();

  WiFiManager wm;
  WiFiManagerParameter custom_mqtt_broker("broker", "IP Laptop / MQTT Broker", mqtt_broker, 40);
  wm.addParameter(&custom_mqtt_broker);

  if (digitalRead(PIN_TRIGGER_RESET_WIFI) == LOW) {
    Serial.println("\n[RESET] Tombol BOOT terdeteksi! Menghapus data Wi-Fi tersimpan...");
    showBootWifiScreen("", "", "Reset WiFi Diaktifkan...");
    wm.resetSettings();
    delay(1000);
  }

  // Tampilkan UI Boot WiFi
  showBootWifiScreen("", "", "Menghubungkan Wi-Fi...");
  wm.setConfigPortalTimeout(180);
  bool res = wm.autoConnect("WaterVend-Setup");

  if (!res) {
    Serial.println("[WiFiManager] Gagal terhubung. Membuka hotspot konfigurasi...");
    showBootWifiScreen("WaterVend-Setup", "192.168.4.1", "Mode Hotspot Setup");
    res = wm.startConfigPortal("WaterVend-Setup");
  }

  if (!res) {
    Serial.println("[WiFiManager] Gagal setup. Merestart ESP32...");
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

  showBootWifiScreen(WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), "Terhubung [OK]");
  delay(800);
}

// Handler Callback Perintah MQTT dari Backend Web (Dijalankan di Core 0)
inline void mqttCallback(char* topic, byte* message, unsigned int length) {
  String messageStr = "";
  for (unsigned int i = 0; i < length; i++) {
    messageStr += (char)message[i];
  }
  Serial.printf("\n[MQTT Core 0] Topik: %s | Data: %s\n", topic, messageStr.c_str());

  String topicStr = String(topic);

  // Penerimaan paket dinamis dari database web
  if (topicStr.endsWith("/packages") || messageStr.indexOf("\"packages\"") >= 0) {
    parsePackagesFromJson(messageStr);
    return;
  }

  String action = extractJsonValue(messageStr, "action");

  // Perintah 1: PAYMENT_SUCCESS -> Pembayaran lunas
  if (action == "PAYMENT_SUCCESS") {
    String volStr = extractJsonValue(messageStr, "volumeMl");
    unsigned long vol = (volStr.length() > 0) ? volStr.toInt() : 600;
    String txId = extractJsonValue(messageStr, "orderId");
    if (txId.length() == 0) {
      txId = extractJsonValue(messageStr, "transactionId");
    }

    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_PAYMENT_SUCCESS;
    netMsg.volumeMl = vol;
    strncpy(netMsg.orderId, txId.c_str(), sizeof(netMsg.orderId) - 1);

    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 2: START -> Pemicu pompa air langsung
  else if (action == "START") {
    String volStr = extractJsonValue(messageStr, "volumeMl");
    unsigned long vol = (volStr.length() > 0) ? volStr.toInt() : 600;
    String txId = extractJsonValue(messageStr, "transactionId");
    if (txId.length() == 0) {
      txId = extractJsonValue(messageStr, "orderId");
    }

    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_CMD_START;
    netMsg.volumeMl = vol;
    strncpy(netMsg.orderId, txId.c_str(), sizeof(netMsg.orderId) - 1);

    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 3: SHOW_QRIS -> Tampilkan QRIS dengan timer 5 menit
  else if (action == "SHOW_QRIS" || action == "QR" || topicStr.endsWith("/qr") || messageStr.indexOf("\"qrString\"") >= 0) {
    String nominal = extractJsonValue(messageStr, "nominal");
    if (nominal.length() == 0) {
      String amt = extractJsonValue(messageStr, "amount");
      if (amt.length() > 0) {
        long val = amt.toInt();
        if (val >= 1000) {
          nominal = String(val / 1000) + "." + ((val % 1000 < 100) ? "0" : "") + ((val % 1000 < 10) ? "0" : "") + String(val % 1000);
        } else {
          nominal = amt;
        }
      } else {
        nominal = "6.000";
      }
    }

    String qris = extractJsonValue(messageStr, "qris");
    if (qris.length() == 0) {
      qris = extractJsonValue(messageStr, "qrString");
    }
    if (qris.length() == 0) {
      qris = "00020101021226600016ID.WATERVEND.WWW520458125303360540660005802ID5913WATERVEND IOT6007BANDUNG6304ABCD";
    }

    String durStr = extractJsonValue(messageStr, "timeoutSeconds");
    unsigned long durSec = (durStr.length() > 0) ? durStr.toInt() : 300;
    if (durSec < 60) durSec = 300; // Pastikan minimal 300 detik (5 menit)

    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_SHOW_QRIS;
    strncpy(netMsg.nominal, nominal.c_str(), sizeof(netMsg.nominal) - 1);
    strncpy(netMsg.qrPayload, qris.c_str(), sizeof(netMsg.qrPayload) - 1);
    netMsg.timeoutSeconds = durSec;
    String txId = extractJsonValue(messageStr, "orderId");
    if (txId.length() == 0) {
      txId = extractJsonValue(messageStr, "transactionId");
    }
    strncpy(netMsg.orderId, txId.c_str(), sizeof(netMsg.orderId) - 1);

    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 4: STOP
  else if (action == "STOP") {
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_CMD_STOP;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 5: SHOW_MENU / RESET
  else if (action == "SHOW_MENU" || action == "RESET") {
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_CMD_RESET;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 6: SET_FLOW_RATE
  else if (action == "SET_FLOW_RATE") {
    String flowStr = extractJsonValue(messageStr, "flowRate");
    if (flowStr.length() > 0) {
      float newRate = flowStr.toFloat();
      savePumpFlowRate(newRate);

      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      String payload = String("{\"status\":\"READY\",\"flowRateMlPerSec\":") + String(pumpFlowRateMlPerSec, 2) + "}";
      mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);

      float lpm = (pumpFlowRateMlPerSec * 60.0f) / 1000.0f;
      Serial.println("==================================================");
      Serial.printf(">> [MQTT] Debit Pompa Diperbarui: %.1f mL/detik (~%.2f Liter/menit)\n", pumpFlowRateMlPerSec, lpm);
      Serial.println("   Artinya:");
      Serial.printf("   - Untuk 100 mL   : butuh waktu sekitar %.1f detik\n", 100.0f / pumpFlowRateMlPerSec);
      Serial.printf("   - Untuk 250 mL   : butuh waktu sekitar %.1f detik\n", 250.0f / pumpFlowRateMlPerSec);
      Serial.printf("   - Untuk 600 mL   : butuh waktu sekitar %.1f detik\n", 600.0f / pumpFlowRateMlPerSec);
      Serial.printf("   - Untuk 1.500 mL : butuh waktu sekitar %.1f detik\n", 1500.0f / pumpFlowRateMlPerSec);
      Serial.println("==================================================");
    }
  }

  // Perintah 7: CALIBRATE_PUMP
  else if (action == "CALIBRATE_PUMP") {
    String measuredStr = extractJsonValue(messageStr, "measuredMl");
    String targetStr = extractJsonValue(messageStr, "targetMl");
    if (measuredStr.length() > 0 && targetStr.length() > 0) {
      float measured = measuredStr.toFloat();
      float target = targetStr.toFloat();
      if (measured > 0.0f && target > 0.0f) {
        float adjustedRate = pumpFlowRateMlPerSec * (measured / target);
        savePumpFlowRate(adjustedRate);

        String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
        String payload = String("{\"status\":\"READY\",\"flowRateMlPerSec\":") + String(pumpFlowRateMlPerSec, 2) + "}";
        mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);

        float lpm = (pumpFlowRateMlPerSec * 60.0f) / 1000.0f;
        Serial.println("==================================================");
        Serial.printf(">> [MQTT KALIBRASI] Target: %.0f mL | Riil: %.0f mL -> Debit Baru: %.1f mL/detik (~%.2f L/menit)\n",
                      target, measured, pumpFlowRateMlPerSec, lpm);
        Serial.println("   Artinya:");
        Serial.printf("   - Untuk 100 mL   : butuh waktu sekitar %.1f detik\n", 100.0f / pumpFlowRateMlPerSec);
        Serial.printf("   - Untuk 250 mL   : butuh waktu sekitar %.1f detik\n", 250.0f / pumpFlowRateMlPerSec);
        Serial.printf("   - Untuk 600 mL   : butuh waktu sekitar %.1f detik\n", 600.0f / pumpFlowRateMlPerSec);
        Serial.printf("   - Untuk 1.500 mL : butuh waktu sekitar %.1f detik\n", 1500.0f / pumpFlowRateMlPerSec);
        Serial.println("==================================================");
      }
    }
  }

  // Perintah 8: SET_BUZZER_ALARM (Tombol ON / OFF dari Web)
  else if (action == "SET_BUZZER_ALARM") {
    String enStr = extractJsonValue(messageStr, "enabled");
    bool en = (enStr == "true" || enStr == "1");
    setBuzzerAlarmEnabled(en);
  }

  // Perintah 9: RESET_SENSOR (Tombol RESET Sinkronisasi dari Web)
  else if (action == "RESET_SENSOR") {
    resetProximitySensor();
    stopBuzzer();
  }

  // Perintah 10: SET_PROXIMITY_CONFIG (Simpan Jarak cm & Polaritas dari Web)
  else if (action == "SET_PROXIMITY_CONFIG") {
    String distStr = extractJsonValue(messageStr, "targetDistanceCm");
    String polStr = extractJsonValue(messageStr, "activeHigh");
    float dist = (distStr.length() > 0) ? distStr.toFloat() : targetDistanceCm;
    bool actHigh = (polStr.length() > 0) ? (polStr == "true" || polStr == "1") : sensorActiveHigh;
    saveProximityConfig(dist, actHigh);
  }

  // Perintah 11: TEST_BUZZER (Uji Bunyi Buzzer dari Web)
  else if (action == "TEST_BUZZER") {
    String cntStr = extractJsonValue(messageStr, "count");
    int count = (cntStr.length() > 0) ? cntStr.toInt() : 1;
    beepPattern(count);
  }

  // Perintah 12: TARE (Nolkan Timbangan dari Web)
  else if (action == "TARE") {
    Serial.println("[MQTT Core 0] Menerima perintah TARE dari Web");
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_CMD_TARE;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 13: CALIBRATE (Kalibrasi Beban Acuan dari Web)
  else if (action == "CALIBRATE") {
    String kwStr = extractJsonValue(messageStr, "knownWeight");
    float kw = (kwStr.length() > 0) ? kwStr.toFloat() : 200.0f;
    Serial.printf("[MQTT Core 0] Menerima perintah CALIBRATE dari Web (Beban: %.1f g)\n", kw);
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_CMD_CALIBRATE;
    netMsg.floatVal = kw;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 14: SET_CAL_FACTOR (Ubah Faktor Kalibrasi Manual dari Web)
  else if (action == "SET_CAL_FACTOR") {
    String fStr = extractJsonValue(messageStr, "factor");
    float f = (fStr.length() > 0) ? fStr.toFloat() : calibrationFactor;
    Serial.printf("[MQTT Core 0] Menerima perintah SET_CAL_FACTOR dari Web (Faktor: %.2f)\n", f);
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_CMD_SET_CAL_FACTOR;
    netMsg.floatVal = f;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 15: SET_MAX_WEIGHT (Ubah Batas Beban Maksimal dari Web)
  else if (action == "SET_MAX_WEIGHT") {
    String mwStr = extractJsonValue(messageStr, "maxWeight");
    float mw = (mwStr.length() > 0) ? mwStr.toFloat() : 2500.0f;
    Serial.printf("[MQTT Core 0] Menerima perintah SET_MAX_WEIGHT dari Web (Batas: %.0f g)\n", mw);
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_CMD_SET_MAX_WEIGHT;
    netMsg.floatVal = mw;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 16: RESET_WIFI (Reset Wi-Fi & Buka Hotspot dari Web)
  else if (action == "RESET_WIFI") {
    Serial.println("[MQTT Core 0] Menerima perintah RESET_WIFI dari Web!");
    beepPattern(3);
    resetWiFiSettings();
  }

  // Perintah 17: SET_OFFSET (Atur Early Cut-off Offset dari Web)
  else if (action == "SET_OFFSET" || action == "SET_CUTOFF_OFFSET") {
    String offStr = extractJsonValue(messageStr, "offset");
    if (offStr.length() == 0) offStr = extractJsonValue(messageStr, "value");
    float off = (offStr.length() > 0) ? offStr.toFloat() : 15.0f;
    Serial.printf("[MQTT Core 0] Menerima perintah SET_OFFSET dari Web (Offset: %.1f g)\n", off);
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_CMD_SET_OFFSET;
    netMsg.floatVal = off;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }

  // Perintah 18: SET_BIAS (Atur Safety Margin Bias dari Web)
  else if (action == "SET_BIAS" || action == "SET_SAFETY_BIAS") {
    String biasStr = extractJsonValue(messageStr, "bias");
    if (biasStr.length() == 0) biasStr = extractJsonValue(messageStr, "value");
    float bias = (biasStr.length() > 0) ? biasStr.toFloat() : 1.0f;
    Serial.printf("[MQTT Core 0] Menerima perintah SET_BIAS dari Web (Bias: %.1f g)\n", bias);
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_CMD_SET_BIAS;
    netMsg.floatVal = bias;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }
}

// Menghubungkan ulang ke Broker MQTT secara NON-BLOCKING pada Core 0
inline void handleMQTTConnection() {
  if (mqttClient.connected()) return;

  unsigned long now = millis();
  if (now - lastMqttRetryTime < 5000) return;
  lastMqttRetryTime = now;

  Serial.println("[MQTT Core 0] Mencoba menghubungkan ke Mosquitto Broker...");

  String clientId = String("ESP32-") + DEVICE_ID;
  String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
  String topicCommand = String("water/dispenser/") + DEVICE_ID + "/command";
  String topicQr = String("water/dispenser/") + DEVICE_ID + "/qr";
  String topicPackages = String("water/dispenser/") + DEVICE_ID + "/packages";

  if (mqttClient.connect(clientId.c_str(), topicStatus.c_str(), 1, true, "{\"status\":\"OFFLINE\"}")) {
    Serial.println("[MQTT Core 0] Terhubung Berhasil!");

    String readyPayload = String("{\"status\":\"READY\",\"flowRateMlPerSec\":") + String(pumpFlowRateMlPerSec, 2) + 
                          String(",\"cutOffMode\":\"CALIBRATED_FLOW_TIMER\"}");
    mqttClient.publish(topicStatus.c_str(), readyPayload.c_str(), true);

    // Berlangganan topik
    mqttClient.subscribe(topicCommand.c_str());
    mqttClient.subscribe(topicQr.c_str());
    mqttClient.subscribe(topicPackages.c_str());
    mqttClient.subscribe("water/dispenser/broadcast/packages");
    Serial.println("[MQTT Core 0] Berlangganan ke topik command, qr, packages, dan broadcast!");
  } else {
    Serial.printf("[MQTT Core 0] Gagal terhubung (rc=%d). Akan dicoba lagi di background.\n", mqttClient.state());
  }
}

// Memproses pesan keluar dari UI Task (Core 1) ke Broker MQTT (Dijalankan di Core 0)
inline void processOutgoingUIMessages() {
  if (qUIToNet == NULL) return;

  UIToNetMessage uiMsg;
  while (xQueueReceive(qUIToNet, &uiMsg, 0) == pdTRUE) {
    if (!mqttClient.connected()) continue;

    if (uiMsg.type == UI_MSG_ORDER_REQUEST) {
      String topicOrder = String("water/dispenser/") + DEVICE_ID + "/order_request";
      String payload = String("{\"volumeMl\":") + String(uiMsg.volumeMl) +
                       String(",\"amount\":") + String(uiMsg.price) +
                       String(",\"packageId\":\"") + String(uiMsg.packageId) + "\"" +
                       String(",\"packageName\":\"") + String(uiMsg.packageName) + "\"}";
      mqttClient.publish(topicOrder.c_str(), payload.c_str());
      Serial.printf("[MQTT Core 0] Order request terkirim: %s (%lu mL)\n", uiMsg.packageName, uiMsg.volumeMl);
    }
    else if (uiMsg.type == UI_MSG_ORDER_CANCEL) {
      String topicCancel = String("water/dispenser/") + DEVICE_ID + "/cancel";
      String cancelPayload = String("{\"status\":\"CANCELLED\",\"orderId\":\"") + String(uiMsg.orderId) + "\"}";
      mqttClient.publish(topicCancel.c_str(), cancelPayload.c_str());
      Serial.printf("[MQTT Core 0] Order cancel terkirim ke backend (Order: %s).\n", uiMsg.orderId);
    }
    else if (uiMsg.type == UI_MSG_TELEMETRY) {
      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"flowRate\":") + String(uiMsg.flowRateLpm, 2) + 
                       String(",\"flowRateMlPerSec\":") + String(uiMsg.flowRateMlPerSec, 2) + 
                       String(",\"dispensedMl\":") + String(uiMsg.dispensedMl) + 
                       String(",\"targetMl\":") + String(uiMsg.targetMl) + 
                       String(",\"status\":\"DISPENSING\"") + 
                       String(",\"cutOffMode\":\"CALIBRATED_FLOW_TIMER\"") + 
                       String(",\"transactionId\":\"") + String(uiMsg.orderId) + "\"" +
                       String(",\"currentWeight\":") + String(uiMsg.currentWeight, 1) + 
                       String(",\"weightGrams\":") + String(uiMsg.dispensedWeightGrams, 1) + 
                       String(",\"containerWeight\":") + String(uiMsg.containerTareWeight, 1) + 
                       String(",\"grossWeight\":") + String(uiMsg.grossWeight, 1) + 
                       String(",\"calFactor\":") + String(uiMsg.calFactor, 2) + 
                       String(",\"maxWeightLimit\":") + String(maxWeightLimit, 0) + 
                       String(",\"isScaleReady\":") + (uiMsg.isScaleReady ? "true" : "false") + 
                       String(",\"scaleStatus\":\"") + (uiMsg.isScaleReady ? "CONNECTED" : "DISCONNECTED") + "\"" + 
                       String(",\"isTumblerPresent\":") + (isTumblerPresent ? "true" : "false") + 
                       String(",\"buzzerAlarmEnabled\":") + (isBuzzerAlarmEnabled ? "true" : "false") + 
                       String(",\"isBuzzerSounding\":") + (isBuzzerSounding ? "true" : "false") + 
                        String(",\"targetDistanceCm\":") + String(targetDistanceCm, 1) + 
                        String(",\"currentDistanceCm\":") + String(currentMeasuredDistanceCm, 1) + 
                        String(",\"cutoffOffset\":") + String(dispenseEarlyOffsetGrams, 1) + 
                        String(",\"safetyBias\":") + String(targetSafetyBiasGrams, 1) + 
                        String(",\"effectiveTarget\":") + String(max(0.0f, (float)uiMsg.targetMl - targetSafetyBiasGrams), 1) + "}";
      mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
    }
    else if (uiMsg.type == UI_MSG_COMPLETE) {
      String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
      String completePayload = String("{\"status\":\"") + String(uiMsg.statusStr) + "\"" + 
                               String(",\"dispensedMl\":") + String(uiMsg.dispensedMl) + 
                               String(",\"orderId\":\"") + String(uiMsg.orderId) + "\"" +
                               String(",\"transactionId\":\"") + String(uiMsg.orderId) + "\"}";
      mqttClient.publish(topicComplete.c_str(), completePayload.c_str());

      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\"}", true);
      Serial.printf("[MQTT Core 0] Selesai pengisian terkirim: %s (%lu mL, Order: %s)\n", uiMsg.statusStr, uiMsg.dispensedMl, uiMsg.orderId);
    }
    else if (uiMsg.type == UI_MSG_STATUS_READY) {
      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"status\":\"READY\"") + 
                       String(",\"flowRateMlPerSec\":") + String(pumpFlowRateMlPerSec, 2) + 
                       String(",\"cutOffMode\":\"CALIBRATED_FLOW_TIMER\"") + 
                       String(",\"dispensedMl\":0,\"targetMl\":0,\"flowRate\":0.0") + 
                       String(",\"currentWeight\":") + String(uiMsg.currentWeight, 1) + 
                       String(",\"weightGrams\":0.0") + 
                       String(",\"containerWeight\":") + String(uiMsg.containerTareWeight, 1) + 
                       String(",\"grossWeight\":") + String(uiMsg.grossWeight, 1) + 
                       String(",\"calFactor\":") + String(uiMsg.calFactor, 2) + 
                       String(",\"maxWeightLimit\":") + String(maxWeightLimit, 0) + 
                       String(",\"isScaleReady\":") + (uiMsg.isScaleReady ? "true" : "false") + 
                       String(",\"scaleStatus\":\"") + (uiMsg.isScaleReady ? "CONNECTED" : "DISCONNECTED") + "\"" + 
                       String(",\"isTumblerPresent\":") + (isTumblerPresent ? "true" : "false") + 
                       String(",\"buzzerAlarmEnabled\":") + (isBuzzerAlarmEnabled ? "true" : "false") + 
                       String(",\"isBuzzerSounding\":") + (isBuzzerSounding ? "true" : "false") + 
                       String(",\"targetDistanceCm\":") + String(targetDistanceCm, 1) + 
                       String(",\"currentDistanceCm\":") + String(currentMeasuredDistanceCm, 1) + 
                       String(",\"cutoffOffset\":") + String(dispenseEarlyOffsetGrams, 1) + 
                       String(",\"safetyBias\":") + String(targetSafetyBiasGrams, 1) + 
                       String(",\"effectiveTarget\":") + String(max(0.0f, (float)targetMilliLitres - targetSafetyBiasGrams), 1) + "}";
      mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
    }
  }
}

// Task Utama Jaringan & MQTT (Berjalan di Core 0)
inline void networkTask(void* pvParameters) {
  Serial.println("[FreeRTOS] Network Task aktif pada Core 0!");

  for (;;) {
    // 1. Pemeliharaan Koneksi MQTT
    handleMQTTConnection();

    // 2. Loop MQTT Client
    if (mqttClient.connected()) {
      mqttClient.loop();
    }

    // 3. Proses antrean pesan keluar dari UI
    processOutgoingUIMessages();

    // 4. Yield CPU 10ms untuk menghindari WDT trigger & menjaga efisiensi
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
