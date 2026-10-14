#pragma once
#include "config.h"
#include "display_ui.h"
#include "pump_control.h"
#include "flow_calculator.h"

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

  while (count < MAX_PACKAGES) {
    int nameIdx = json.indexOf("\"name\"", searchPos);
    if (nameIdx < 0) break;

    int volIdx = json.indexOf("\"volumeMl\"", searchPos);
    int priceIdx = json.indexOf("\"price\"", searchPos);
    int idIdx = json.indexOf("\"id\"", searchPos);

    String nameVal = extractJsonValue(json.substring(nameIdx - 1), "name");
    String volVal = extractJsonValue(json.substring(volIdx - 1), "volumeMl");
    String priceVal = extractJsonValue(json.substring(priceIdx - 1), "price");
    String idVal = (idIdx >= 0) ? extractJsonValue(json.substring(idIdx - 1), "id") : String(count);

    if (nameVal.length() > 0 && volVal.length() > 0 && priceVal.length() > 0) {
      strncpy(dispenserPackages[count].id, idVal.c_str(), sizeof(dispenserPackages[count].id) - 1);
      strncpy(dispenserPackages[count].name, nameVal.c_str(), sizeof(dispenserPackages[count].name) - 1);
      dispenserPackages[count].volumeMl = volVal.toInt();
      dispenserPackages[count].price = priceVal.toInt();
      count++;
    }

    searchPos = nameIdx + 8;
  }

  if (count > 0) {
    totalPackages = count;
    Serial.printf("[PACKAGES] Berhasil memuat %d paket dari backend web!\n", totalPackages);
    
    // Kirim notifikasi ke UI Task (Core 1)
    NetToUIMessage netMsg;
    memset(&netMsg, 0, sizeof(netMsg));
    netMsg.type = NET_MSG_PACKAGES_UPDATED;
    if (qNetToUI != NULL) {
      xQueueSend(qNetToUI, &netMsg, 0);
    }
  }
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
      }
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
    Serial.println("[MQTT Core 0] Berlangganan ke topik command, qr, dan packages!");
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
      mqttClient.publish(topicCancel.c_str(), "{\"status\":\"CANCELLED\"}");
      Serial.println("[MQTT Core 0] Order cancel terkirim ke backend.");
    }
    else if (uiMsg.type == UI_MSG_TELEMETRY) {
      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"flowRate\":") + String(uiMsg.flowRateLpm, 2) + 
                       String(",\"flowRateMlPerSec\":") + String(uiMsg.flowRateMlPerSec, 2) + 
                       String(",\"dispensedMl\":") + String(uiMsg.dispensedMl) + 
                       String(",\"targetMl\":") + String(uiMsg.targetMl) + 
                       String(",\"status\":\"DISPENSING\"") + 
                       String(",\"cutOffMode\":\"CALIBRATED_FLOW_TIMER\"") + 
                       String(",\"transactionId\":\"") + String(uiMsg.orderId) + "\"}";
      mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
    }
    else if (uiMsg.type == UI_MSG_COMPLETE) {
      String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
      String completePayload = String("{\"status\":\"") + String(uiMsg.statusStr) + "\"" + 
                               String(",\"dispensedMl\":") + String(uiMsg.dispensedMl) + 
                               String(",\"transactionId\":\"") + String(uiMsg.orderId) + "\"}";
      mqttClient.publish(topicComplete.c_str(), completePayload.c_str());

      String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
      mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\"}", true);
      Serial.printf("[MQTT Core 0] Selesai pengisian terkirim: %s (%lu mL)\n", uiMsg.statusStr, uiMsg.dispensedMl);
    }
    else if (uiMsg.type == UI_MSG_STATUS_READY) {
      String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
      String payload = String("{\"status\":\"READY\"") + 
                       String(",\"flowRateMlPerSec\":") + String(pumpFlowRateMlPerSec, 2) + 
                       String(",\"cutOffMode\":\"CALIBRATED_FLOW_TIMER\"") + 
                       String(",\"dispensedMl\":0,\"targetMl\":0,\"flowRate\":0.0}");
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
