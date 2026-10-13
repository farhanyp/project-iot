import mqtt from "mqtt";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "../lib/prisma";

const BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const WS_PORT = parseInt(process.env.WS_PORT || "3001", 10);

console.log("=========================================");
console.log("    IOT GATEWAY / BRIDGE SERVICE         ");
console.log("=========================================");

// 1. Inisialisasi WebSocket Server untuk Browser Web
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`[WS] WebSocket Server listening on ws://localhost:${WS_PORT}`);

// Cache status perangkat terakhir agar browser baru/refresh langsung tahu status nyata
let cachedDeviceStatus: "READY" | "DISPENSING" | "OFFLINE" = "OFFLINE";
let cachedTelemetry: Record<string, unknown> | null = null;
let lastDeviceCode = "DISPENSER-01";
let simulationTimer: NodeJS.Timeout | null = null;

const broadcastToClients = (payload: object) => {
  const messageStr = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
};

// 2. Inisialisasi MQTT Client ke Eclipse Mosquitto
console.log(`[MQTT] Connecting to Mosquitto Broker at ${BROKER_URL}...`);
const mqttClient = mqtt.connect(BROKER_URL, {
  clientId: `NEXTJS_IOT_GATEWAY_${Math.random().toString(16).substring(2, 8)}`,
  clean: true,
  reconnectPeriod: 3000,
});

mqttClient.on("connect", () => {
  console.log(`[MQTT] Connected successfully to Mosquitto Broker!`);

  // Subscribe ke topik telemetri, status, dan perintah perangkat dispenser
  const topics = [
    "water/dispenser/+/status",
    "water/dispenser/+/telemetry",
    "water/dispenser/+/complete",
    "water/dispenser/+/command",
  ];

  mqttClient.subscribe(topics, (err) => {
    if (err) {
      console.error("[MQTT] Failed to subscribe to topics:", err);
    } else {
      console.log(`[MQTT] Subscribed to topics: ${topics.join(", ")}`);
    }
  });

  broadcastToClients({
    type: "SYSTEM_STATUS",
    mqttConnected: true,
    timestamp: new Date().toISOString(),
  });
});

mqttClient.on("reconnect", () => {
  console.log("[MQTT] Reconnecting to broker...");
});

mqttClient.on("error", (err) => {
  console.error("[MQTT] Error:", err.message);
  broadcastToClients({
    type: "SYSTEM_STATUS",
    mqttConnected: false,
    error: err.message,
    timestamp: new Date().toISOString(),
  });
});

// 3. Menangani Pesan Masuk dari ESP32 (MQTT -> Web & DB)
mqttClient.on("message", async (topic, message) => {
  try {
    const topicParts = topic.split("/");
    const deviceCode = topicParts[2] || "UNKNOWN";
    const eventType = topicParts[3]; // "status", "telemetry", "complete"
    const payload = JSON.parse(message.toString());

    // Update in-memory cache
    lastDeviceCode = deviceCode;
    if (eventType === "status") {
      cachedDeviceStatus = payload.status === "OFFLINE" ? "OFFLINE" : (payload.status || "READY");
      if (payload.calFactor !== undefined || payload.isScaleReady !== undefined) {
        cachedTelemetry = {
          ...(cachedTelemetry || {}),
          calFactor: payload.calFactor ?? cachedTelemetry?.calFactor,
          isScaleReady: payload.isScaleReady !== undefined ? !!payload.isScaleReady : cachedTelemetry?.isScaleReady,
          scaleStatus: payload.scaleStatus ?? cachedTelemetry?.scaleStatus,
          scaleLog: payload.scaleLog ?? cachedTelemetry?.scaleLog,
          scaleRaw: payload.scaleRaw ?? cachedTelemetry?.scaleRaw,
        };
      }
    } else if (eventType === "telemetry") {
      if (simulationTimer) {
        // Hardware ESP32 fisik aktif dan mengirim telemetri nyata, matikan simulasi virtual
        clearInterval(simulationTimer);
        simulationTimer = null;
      }
      if (payload.status === "DISPENSING") {
        cachedDeviceStatus = "DISPENSING";
      } else if (payload.status === "READY") {
        cachedDeviceStatus = "READY";
      }
      cachedTelemetry = {
        ...(cachedTelemetry || {}),
        ...payload,
      };
    } else if (eventType === "complete") {
      if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
      }
      cachedDeviceStatus = "READY";
      if (cachedTelemetry) {
        cachedTelemetry.dispensedMl = payload.dispensedMl || cachedTelemetry.dispensedMl;
        cachedTelemetry.weightGrams = payload.weightGrams || cachedTelemetry.weightGrams;
        cachedTelemetry.status = "COMPLETED";
      }
    } else if (eventType === "command") {
      console.log(`[MQTT COMMAND for ${deviceCode}]:`, payload);
      if (payload.action === "START") {
        const targetMl = Number(payload.volumeMl) || 600;
        const txId = payload.transactionId;
        const orderId = payload.orderId;

        cachedDeviceStatus = "DISPENSING";
        cachedTelemetry = {
          ...(cachedTelemetry || {}),
          status: "DISPENSING",
          targetMl,
          dispensedMl: 0,
          weightGrams: 0,
          flowRate: 1.25,
        };

        // Broadcast status DISPENSING instan ke WebSocket client
        broadcastToClients({
          type: "MQTT_EVENT",
          topic: `water/dispenser/${deviceCode}/status`,
          deviceCode,
          eventType: "status",
          data: { status: "DISPENSING", targetMl, message: "Pompa menyala, mulai pengisian air" },
          timestamp: new Date().toISOString(),
        });

        // Update status perangkat di DB menjadi DISPENSING
        prisma.device.updateMany({
          where: { code: deviceCode },
          data: { status: "DISPENSING" },
        }).catch((e) => console.warn("[DB Device Update Warn]:", e.message));

        // Jika transaksi ada di DB, set ke DISPENSING
        if (txId || orderId) {
          prisma.transaction.updateMany({
            where: {
              OR: [
                ...(txId ? [{ id: txId }] : []),
                ...(orderId ? [{ orderId }] : []),
              ],
            },
            data: { status: "DISPENSING" },
          }).catch((e) => console.warn("[DB TX Update Warn]:", e.message));
        }

        // Simulasi aliran air virtual otomatis jika ESP32 fisik belum terhubung
        if (simulationTimer) clearInterval(simulationTimer);
        let currentMl = 0;
        simulationTimer = setInterval(async () => {
          currentMl += 25; // Bertambah 25 mL per 200ms
          if (currentMl > targetMl) currentMl = targetMl;

          cachedTelemetry = {
            ...(cachedTelemetry || {}),
            status: "DISPENSING",
            targetMl,
            dispensedMl: currentMl,
            weightGrams: currentMl,
            flowRate: 1.25,
          };

          broadcastToClients({
            type: "MQTT_EVENT",
            topic: `water/dispenser/${deviceCode}/telemetry`,
            deviceCode,
            eventType: "telemetry",
            data: {
              status: "DISPENSING",
              targetMl,
              dispensedMl: currentMl,
              weightGrams: currentMl,
              flowRate: 1.25,
            },
            timestamp: new Date().toISOString(),
          });

          // Begitu target tercapai, cut-off pompa otomatis!
          if (currentMl >= targetMl) {
            if (simulationTimer) clearInterval(simulationTimer);
            simulationTimer = null;
            cachedDeviceStatus = "READY";
            cachedTelemetry = {
              ...(cachedTelemetry || {}),
              status: "COMPLETED",
              dispensedMl: targetMl,
              weightGrams: targetMl,
              flowRate: 0,
            };

            broadcastToClients({
              type: "MQTT_EVENT",
              topic: `water/dispenser/${deviceCode}/complete`,
              deviceCode,
              eventType: "complete",
              data: {
                status: "COMPLETED",
                dispensedMl: targetMl,
                weightGrams: targetMl,
                flowRate: 0,
                message: "Target volume tercapai, pompa dimatikan otomatis.",
              },
              timestamp: new Date().toISOString(),
            });

            // Update status transaksi di database ke COMPLETED
            try {
              if (txId || orderId) {
                await prisma.transaction.updateMany({
                  where: {
                    OR: [
                      ...(txId ? [{ id: txId }] : []),
                      ...(orderId ? [{ orderId }] : []),
                    ],
                  },
                  data: {
                    status: "COMPLETED",
                    dispensedMl: targetMl,
                    completedAt: new Date(),
                  },
                });
              }
              await prisma.device.updateMany({
                where: { code: deviceCode },
                data: { status: "READY" },
              });
              console.log(`[PUMP AUTO CUT-OFF] Pengisian ${targetMl} mL selesai untuk ${orderId || txId || deviceCode}`);
            } catch (err) {
              console.warn("[DB Complete Error]:", (err as Error).message);
            }
          }
        }, 200);
      } else if (payload.action === "STOP" || payload.action === "RESET") {
        if (simulationTimer) {
          clearInterval(simulationTimer);
          simulationTimer = null;
        }
        cachedDeviceStatus = "READY";
      }
    }

    // Broadcast ke semua browser client via WebSocket
    broadcastToClients({
      type: "MQTT_EVENT",
      topic,
      deviceCode,
      eventType,
      data: payload,
      timestamp: new Date().toISOString(),
    });

    // Sinkronisasi data ke PostgreSQL via Prisma 8
    try {
      if (eventType === "status") {
        // Upsert data device jika belum ada
        await prisma.device.upsert({
          where: { code: deviceCode },
          update: {
            status: payload.status === "OFFLINE" ? "OFFLINE" : "READY",
            lastPingAt: new Date(),
          },
          create: {
            code: deviceCode,
            name: `Dispenser ${deviceCode}`,
            status: payload.status === "OFFLINE" ? "OFFLINE" : "READY",
            lastPingAt: new Date(),
          },
        });
      } else if (eventType === "telemetry" && payload.transactionId) {
        // Update volume terisi secara berkala pada transaksi aktif
        await prisma.transaction.updateMany({
          where: {
            id: payload.transactionId,
            status: "DISPENSING",
          },
          data: {
            dispensedMl: payload.dispensedMl || 0,
          },
        });
      } else if (eventType === "complete" && payload.transactionId) {
        // Transaksi selesai
        await prisma.transaction.update({
          where: { id: payload.transactionId },
          data: {
            status: "COMPLETED",
            dispensedMl: payload.dispensedMl,
            completedAt: new Date(),
          },
        });
        console.log(`[DB] Transaction ${payload.transactionId} marked as COMPLETED.`);
      }
    } catch (dbErr) {
      // Catch DB errors agar tidak memutus aliran real-time jika database sedang booting
      console.warn("[DB SYNC WARNING]:", (dbErr as Error).message);
    }
  } catch (parseErr) {
    console.error("[MQTT] Error parsing message payload:", parseErr);
  }
});

// 4. Menangani Pesan dari Web Browser via WebSocket (Web -> MQTT)
wss.on("connection", (ws) => {
  console.log(`[WS] Web Client connected. Total clients: ${wss.clients.size}`);

  // Kirim status awal ke client yang baru terhubung (termasuk status perangkat terakhir)
  ws.send(
    JSON.stringify({
      type: "SYSTEM_STATUS",
      mqttConnected: mqttClient.connected,
      wsConnected: true,
      deviceStatus: cachedDeviceStatus,
      deviceCode: lastDeviceCode,
      telemetry: cachedTelemetry,
      timestamp: new Date().toISOString(),
    })
  );

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log("[WS Received]:", msg);

      if (msg.type === "COMMAND") {
        const { deviceId = "DISPENSER-01", action, volumeMl = 600, knownWeight, factor, maxWeight } = msg;

        let transactionId = `tx-${Date.now()}`;

        if (action === "START") {
          // Buat record transaksi di PostgreSQL
          try {
            const device = await prisma.device.upsert({
              where: { code: deviceId },
              update: { status: "DISPENSING" },
              create: {
                code: deviceId,
                name: `Dispenser ${deviceId}`,
                status: "DISPENSING",
              },
            });

            const amount = Math.round(volumeMl * device.pricePerMl);

            const tx = await prisma.transaction.create({
              data: {
                orderId: `INV-MANUAL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
                deviceId: device.id,
                volumeMl,
                amount,
                status: "DISPENSING",
                startedAt: new Date(),
              },
            });
            transactionId = tx.id;
            console.log(`[DB] Created new Transaction: ${transactionId} (Rp ${amount} for ${volumeMl} mL)`);
          } catch (txErr) {
            console.warn("[DB TX WARNING]:", (txErr as Error).message);
          }
        }

        if (action === "STOP" || action === "RESET") {
          if (simulationTimer) {
            clearInterval(simulationTimer);
            simulationTimer = null;
          }
        }

        if (action === "RESET") {
          cachedDeviceStatus = "READY";
          if (cachedTelemetry) {
            cachedTelemetry.dispensedMl = 0;
            cachedTelemetry.weightGrams = 0;
            cachedTelemetry.targetMl = 0;
            cachedTelemetry.status = "READY";
          }
          broadcastToClients({
            type: "MQTT_EVENT",
            topic: `water/dispenser/${deviceId}/status`,
            deviceCode: deviceId,
            eventType: "status",
            data: { status: "READY", dispensedMl: 0, weightGrams: 0, message: "Reset sesi pengisian berhasil" },
            timestamp: new Date().toISOString(),
          });
        }

        // Teruskan perintah ke ESP32 melalui MQTT PubSub
        const commandTopic = `water/dispenser/${deviceId}/command`;
        const commandPayload: Record<string, unknown> = {
          action,
          volumeMl,
          transactionId,
          timestamp: Date.now(),
        };

        if (knownWeight !== undefined) {
          commandPayload.knownWeight = Number(knownWeight);
        }
        if (factor !== undefined) {
          commandPayload.factor = Number(factor);
        }
        if (maxWeight !== undefined) {
          commandPayload.maxWeight = Number(maxWeight);
        }

        mqttClient.publish(commandTopic, JSON.stringify(commandPayload), { qos: 1 });
        console.log(`[MQTT Published] To ${commandTopic}:`, commandPayload);
      }
    } catch (wsErr) {
      console.error("[WS] Error processing client message:", wsErr);
    }
  });

  ws.on("close", () => {
    console.log(`[WS] Client disconnected. Remaining: ${wss.clients.size}`);
  });
});

const shutdown = () => {
  console.log("\n[GATEWAY] Shutting down IoT Gateway...");
  wss.close();
  mqttClient.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
