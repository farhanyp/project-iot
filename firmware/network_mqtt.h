#pragma once
#include "config.h"
#include "display_ui.h"
#include "pump_control.h"
#include "scale_sensor.h"

// ==============================================================================
// MODUL JARINGAN WIFI & PROTOKOL MQTT IOT
// ==============================================================================

// Helper untuk mengekstrak nilai string dari payload JSON sederhana tanpa library berat
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

// Inisialisasi WiFiManager dengan Captive Portal
inline void setupWiFiManager() {
  preferences.begin("watervend", false);
  String savedBroker = preferences.getString("mqtt_broker", "192.168.1.4");
  savedBroker.toCharArray(mqtt_broker, 40);

  calibrationFactor   = preferences.getFloat("cal_factor", -420.0);
  maxWeightLimitGrams = preferences.getFloat("max_weight", 2500.0);
  preferences.end();

  WiFiManager wm;
  WiFiManagerParameter custom_mqtt_broker("broker", "IP Laptop / MQTT Broker", mqtt_broker, 40);
  wm.addParameter(&custom_mqtt_broker);

  if (digitalRead(PIN_TRIGGER_RESET_WIFI) == LOW) {
    Serial.println("\n[RESET] Tombol BOOT terdeteksi! Menghapus data Wi-Fi tersimpan...");
    showBootScreen("Reset WiFi Diaktifkan...");
    wm.resetSettings();
    delay(1000);
  }

  wm.setConfigPortalTimeout(180);

  Serial.println("\n[WiFiManager] Mencoba menyambung ke Wi-Fi tersimpan...");
  showBootScreen("Menghubungkan Wi-Fi...");

  bool res = wm.autoConnect("WaterVend-Setup");

  if (!res) {
    Serial.println("[WiFiManager] Gagal terhubung. Merestart ESP32...");
    showBootScreen("Gagal WiFi, Restart...");
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
}

// Handler Callback Perintah MQTT dari Backend / Dashboard Web
inline void mqttCallback(char* topic, byte* message, unsigned int length) {
  String messageStr = "";
  for (unsigned int i = 0; i < length; i++) {
    messageStr += (char)message[i];
  }
  Serial.print("\n[MQTT Command Diterima]: ");
  Serial.println(messageStr);

  String action = extractJsonValue(messageStr, "action");

  // Perintah 1: START
  if (action == "START") {
    String volStr = extractJsonValue(messageStr, "volumeMl");
    targetMilliLitres = (volStr.length() > 0) ? volStr.toInt() : 600;

    String maxWtStr = extractJsonValue(messageStr, "maxWeight");
    if (maxWtStr.length() > 0) {
      maxWeightLimitGrams = maxWtStr.toFloat();
    }

    currentTransactionId = extractJsonValue(messageStr, "transactionId");
    if (currentTransactionId.length() == 0) {
      currentTransactionId = "tx-" + String(millis());
    }

    if (scale.is_ready() || scale.wait_ready_timeout(200)) {
      long raw = scale.read();
      lastRawAdcReading = raw;
      if (isAdcReadingValid(raw)) {
        isScaleReady = true;
        scale.set_scale(calibrationFactor);
        long netBefore = raw - scale.get_offset();
        initialContainerWeight = (float)netBefore / calibrationFactor;
        if (initialContainerWeight < 0.0) initialContainerWeight = 0.0;
        scale.tare(3);
      } else {
        isScaleReady = false;
        initialContainerWeight = 0.0;
      }
    } else {
      isScaleReady = false;
      initialContainerWeight = 0.0;
    }

    dispensedWeightGrams = 0.0;
    dispensedMilliLitres = 0;
    dispenseStartTime = millis();
    isDispensing = true;

    startPump();
    showDispensingScreen(targetMilliLitres);

    String topicTelemetry = String("water/dispenser/") + DEVICE_ID + "/telemetry";
    String payload = String("{\"status\":\"DISPENSING\",\"dispensedMl\":0,\"weightGrams\":0.0,\"grossWeight\":") + 
                     String(initialContainerWeight, 1) + ",\"targetMl\":" + String(targetMilliLitres) + 
                     ",\"containerWeight\":" + String(initialContainerWeight, 1) + 
                     ",\"maxWeightLimit\":" + String(maxWeightLimitGrams, 1) + 
                     ",\"isScaleReady\":" + (isScaleReady ? "true" : "false") + 
                     ",\"scaleRaw\":" + String(lastRawAdcReading) + 
                     ",\"flowRate\":" + String((PUMP_FLOW_RATE_ML_PER_SEC * 60.0) / 1000.0, 2) + 
                     ",\"cutOffMode\":\"" + (isScaleReady ? "WEIGHT_LOADCELL" : "TIME_FALLBACK") + "\"" + 
                     ",\"transactionId\":\"" + currentTransactionId + "\"}";
    mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
  }

  // Perintah 2: STOP
  else if (action == "STOP") {
    isDispensing = false;
    stopPump();
    showCompleteScreen("EMERGENCY_STOPPED", dispensedMilliLitres, dispensedWeightGrams, "Tombol Stop Darurat Ditekan");

    String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
    mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"message\":\"Emergency Stopped\"}", true);

    String topicComplete = String("water/dispenser/") + DEVICE_ID + "/complete";
    String completePayload = String("{\"status\":\"EMERGENCY_STOPPED\",\"dispensedMl\":") + String(dispensedMilliLitres) + 
                             String(",\"weightGrams\":") + String(dispensedWeightGrams, 1) + 
                             String(",\"transactionId\":\"") + currentTransactionId + "\"}";
    mqttClient.publish(topicComplete.c_str(), completePayload.c_str());
  }

  // Perintah 3: RESET
  else if (action == "RESET") {
    isDispensing = false;
    stopPump();
    dispensedMilliLitres = 0;
    dispensedWeightGrams = 0.0;
    targetMilliLitres = 0;
    initialContainerWeight = 0.0;
    currentTransactionId = "";

    if (scale.is_ready() || scale.wait_ready_timeout(200)) {
      long raw = scale.read();
      lastRawAdcReading = raw;
      if (isAdcReadingValid(raw)) {
        isScaleReady = true;
        scale.set_scale(calibrationFactor);
        scale.tare(5);
        currentLiveWeight = 0.0;
      }
    }

    showStandbyScreen();
    String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
    mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"message\":\"Sesi pengisian di-reset\"}", true);
  }

  // Perintah 4: TARE
  else if (action == "TARE") {
    if (scale.is_ready() || scale.wait_ready_timeout(500)) {
      long raw = scale.read();
      if (isAdcReadingValid(raw)) {
        scale.set_scale(calibrationFactor);
        scale.tare(5);
        currentLiveWeight = 0.0;
        String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
        mqttClient.publish(topicStatus.c_str(), "{\"status\":\"READY\",\"isScaleReady\":true,\"message\":\"Tare Berhasil\",\"currentWeight\":0.0}", true);
      }
    }
  }

  // Perintah 5: SHOW_QRIS
  else if (action == "SHOW_QRIS") {
    String nominal = extractJsonValue(messageStr, "nominal");
    if (nominal.length() == 0) nominal = "6.000";
    String qris = extractJsonValue(messageStr, "qris");
    if (qris.length() == 0) {
      qris = "00020101021226600016ID.WATERVEND.WWW520458125303360540660005802ID5913WATERVEND IOT6007BANDUNG6304ABCD";
    }
    showQRISScreen(nominal.c_str(), qris.c_str());
  }

  // Perintah 6: SHOW_MENU
  else if (action == "SHOW_MENU") {
    showStandbyScreen();
  }
}

// Menghubungkan ulang ke Broker MQTT dengan Last Will and Testament (LWT)
inline void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Menghubungkan ke Mosquitto Broker...");
    showBootScreen("Menghubungkan MQTT...");
    String clientId = String("ESP32-") + DEVICE_ID;
    String topicStatus = String("water/dispenser/") + DEVICE_ID + "/status";
    String topicCommand = String("water/dispenser/") + DEVICE_ID + "/command";

    if (mqttClient.connect(clientId.c_str(), topicStatus.c_str(), 1, true, "{\"status\":\"OFFLINE\"}")) {
      Serial.println(" Terhubung!");

      String readyPayload = String("{\"status\":\"READY\",\"isScaleReady\":") + (isScaleReady ? "true" : "false") + 
                            String(",\"calFactor\":") + String(calibrationFactor, 2) + 
                            String(",\"maxWeightLimit\":") + String(maxWeightLimitGrams, 1) + "}";
      mqttClient.publish(topicStatus.c_str(), readyPayload.c_str(), true);
      mqttClient.subscribe(topicCommand.c_str());
      Serial.printf("[MQTT] Berlangganan topik: %s\n", topicCommand.c_str());

      showStandbyScreen();
    } else {
      Serial.printf(" Gagal (rc=%d). Mencoba lagi dalam 4 detik...\n", mqttClient.state());
      delay(4000);
    }
  }
}
