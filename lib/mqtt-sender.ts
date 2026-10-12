import mqtt from "mqtt";

const BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

export async function sendMqttCommand(
  deviceCode: string,
  payload: object
): Promise<boolean> {
  const topic = `water/dispenser/${deviceCode}/command`;
  return publishMqttMessage(topic, payload);
}

export async function publishMqttMessage(
  topic: string,
  payload: string | object
): Promise<boolean> {
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER_URL, {
      clientId: `API_TRIGGER_${Math.random().toString(16).substring(2, 8)}`,
      connectTimeout: 3000,
    });

    const message = typeof payload === "string" ? payload : JSON.stringify(payload);

    client.on("connect", () => {
      client.publish(topic, message, { qos: 1 }, (err) => {
        client.end();
        if (err) {
          console.error(`[MQTT SENDER] Gagal publish ke ${topic}:`, err);
          resolve(false);
        } else {
          console.log(`[MQTT SENDER] Pesan terkirim ke ${topic}`);
          resolve(true);
        }
      });
    });

    client.on("error", (err) => {
      console.error("[MQTT SENDER] Koneksi error:", err.message);
      client.end();
      resolve(false);
    });
  });
}
