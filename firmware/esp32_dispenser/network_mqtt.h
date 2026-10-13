#pragma once
#include "config.h"
#include "display_ui.h"
#include "pump_control.h"
#include "flow_calculator.h"

// ==============================================================================
// MODUL JARINGAN WIFI & PROTOKOL MQTT IOT
// (Mendukung Dynamic Packages, 6-Stage Flow, dan Kalibrasi Aliran Pompa)
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
    if (currentScreen == SCREEN_STANDBY) {
      showStandbyScreen();
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

  // Tampilkan ringkasan status Wi-Fi terkoneksi
  showBootWifiScreen(WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), "Terhubung [OK]");
  delay(1200);
}

// Handler Callback Perintah MQTT dari Backend Web
inline void mqttCallback(char* topic, byte* message, unsigned int length) {
  String messageStr = "";
  for (unsigned int i = 0; i < length; i++) {
    messageStr += (char)message[i];
  }
  Serial.printf("\n[MQTT Diterima] Topik: %s | Data: %s\n", topic, messageStr.c_str());

  String topicStr = String(topic);

  // Penerimaan paket dinamis dari database web
  if (topicStr.endsWith("/packages") || messageStr.indexOf("\"packages\"") >= 0) {
    parsePackagesFromJson(messageStr);
    return;
  }

  String action = extractJsonValue(messageStr, "action");

  // Perintah 1: PAYMENT_SUCCESS -> Pembayaran lunas, instruksikan letakkan tumbler!
  if (action == "PAYMENT_SUCCESS") {
    String volStr = extractJsonValue(messageStr, "volumeMl");
    targetMilliLitres = (volStr.length() > 0) ? volStr.toInt() : 600;
    currentTransactionId = extractJsonValue(messageStr, "orderId");
    if (currentTransactionId.length() == 0) {
      currentTransactionId = extractJsonValue(messageStr, "transactionId");
    }

    Serial.printf("[ALUR] Pembayaran Lunas! Menampilkan instruksi letakkan tumbler (Target: %lu mL)\n", targetMilliLitres);
    showPlaceTumblerScreen(targetMilliLitres, currentTransactionId.c_str());
  }

  // Perintah 2: START -> Pemicu pompa air langsung
  else if (action == "START") {
    String volStr = extractJsonValue(messageStr, "volumeMl");
    targetMilliLitres = (volStr.length() > 0) ? volStr.toInt() : 600;

    currentTransactionId = extractJsonValue(messageStr, "transactionId");
    if (currentTransactionId.length() == 0) {
      currentTransactionId = extractJsonValue(messageStr, "orderId");
    }

    requiredDispenseDurationMs = calculateDispenseDurationMs(targetMilliLitres);
    dispensedMilliLitres = 0;
    dispenseStartTime = millis();
    isDispensing = true;

    startPump();
    showDispensingScreen(targetMilliLitres);
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
    unsigned long durSec = (durStr.length() > 0) ? durStr.toInt() : 300; // Default 5 menit

    showQRISScreen(nominal.c_str(), qris.c_str(), durSec);
  }

  // Perintah 4: STOP
  else if (action == "STOP") {
    isDispensing = false;
    stopPump();
    showCompleteScreen("EMERGENCY_STOPPED", dispensedMilliLitres, "Tombol Stop Darurat Ditekan");

    String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
    mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"message\":\"Emergency Stopped\"}", true);

    String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
    String completePayload = String("{\"status\":\"EMERGENCY_STOPPED\",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                             String(",\"transactionId\":\"") + currentTransactionId + "\"}";
    mqttClient.publish(topicComplete.c_str(), completePayload.c_str());
  }

  // Perintah 5: SHOW_MENU / RESET
  else if (action == "SHOW_MENU" || action == "RESET") {
    isDispensing = false;
    stopPump();
    dispensedMilliLitres = 0;
    targetMilliLitres = 0;
    currentTransactionId = "";

    showStandbyScreen();
  }

  // Perintah 6: SET_FLOW_RATE -> Konfigurasi manual debit pompa (mL/detik)
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

  // Perintah 7: CALIBRATE_PUMP -> Kalibrasi rasio volume aktual dibanding target
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

// Menghubungkan ulang ke Broker MQTT
inline void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Menghubungkan ke Mosquitto Broker...");
    showBootWifiScreen(WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), "Menghubungkan MQTT...");

    String clientId = String("ESP32-") + DEVICE_ID;
    String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
    String topicCommand = String("water/dispenser/") + DEVICE_ID + "/command";
    String topicQr = String("water/dispenser/") + DEVICE_ID + "/qr";
    String topicPackages = String("water/dispenser/") + DEVICE_ID + "/packages";

    if (mqttClient.connect(clientId.c_str(), topicStatus.c_str(), 1, true, "{\"status\":\"OFFLINE\"}")) {
      Serial.println(" Terhubung!");

      String readyPayload = String("{\"status\":\"READY\",\"flowRateMlPerSec\":") + String(pumpFlowRateMlPerSec, 2) + 
                            String(",\"cutOffMode\":\"CALIBRATED_FLOW_TIMER\"}");
      mqttClient.publish(topicStatus.c_str(), readyPayload.c_str(), true);

      // Berlangganan topik perintah, qr, dan daftar paket
      mqttClient.subscribe(topicCommand.c_str());
      mqttClient.subscribe(topicQr.c_str());
      mqttClient.subscribe(topicPackages.c_str());
      Serial.println("[MQTT] Berlangganan ke topik command, qr, dan packages!");

      // Tampilkan layar menu utama (Standby)
      showStandbyScreen();
    } else {
      Serial.printf(" Gagal (rc=%d). Mencoba lagi dalam 4 detik...\n", mqttClient.state());
      delay(4000);
    }
  }
}
