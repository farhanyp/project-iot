import "dotenv/config";
import mqtt from "mqtt";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "../lib/prisma";
import { createQrisTransaction, checkMidtransStatus } from "../lib/midtrans";
import { processPaymentSettlement } from "../lib/payment-helper";

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

  // Subscribe ke topik telemetri, status, perintah, permintaan order touch, pembatalan, dan permintaan sinkronisasi paket
  const topics = [
    "water/dispenser/+/status",
    "water/dispenser/+/telemetry",
    "water/dispenser/+/complete",
    "water/dispenser/+/command",
    "water/dispenser/+/order_request",
    "water/dispenser/+/cancel",
    "water/dispenser/+/get_packages",
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

      if (payload.status === "READY") {
        // Auto-push paket menu air terbaru ke dispenser yang baru online
        prisma.packagePreset.findMany({
          where: { isActive: true },
          orderBy: { volumeMl: "asc" },
          select: { id: true, name: true, volumeMl: true, price: true, code: true },
        }).then((packages) => {
          if (packages && packages.length > 0) {
            mqttClient.publish(
              `water/dispenser/${deviceCode}/packages`,
              JSON.stringify({ packages })
            );
            console.log(`[MQTT BRIDGE] Otomatis menyinkronkan ${packages.length} paket ke ${deviceCode} (Status: READY)`);
          }
        }).catch((err) => {
          console.warn("[MQTT BRIDGE] Gagal auto-push paket:", err);
        });
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
      const rawCompleteStatus = (payload.status || "").toUpperCase();
      const isFailedComplete = rawCompleteStatus.includes("FAIL") || 
                               rawCompleteStatus.includes("HABIS") || 
                               rawCompleteStatus === "EMERGENCY_STOPPED";
      cachedDeviceStatus = isFailedComplete ? "OFFLINE" : "READY";
      if (cachedTelemetry) {
        cachedTelemetry.dispensedMl = payload.dispensedMl || cachedTelemetry.dispensedMl;
        cachedTelemetry.status = isFailedComplete ? "FAILED" : "COMPLETED";
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
    } else if (eventType === "order_request") {
      console.log(`[ORDER REQUEST from Touch LCD ${deviceCode}]:`, payload);
      const volumeMl = Number(payload.volumeMl) || 250;
      const amount = Number(payload.amount) || 2500;
      const packageName = payload.packageName || `Air Minum ${volumeMl} mL`;
      const orderId = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      try {
        const qris = await createQrisTransaction({
          orderId,
          grossAmount: amount,
          itemName: packageName,
        });

        let device = await prisma.device.findUnique({ where: { code: deviceCode } });
        if (!device) {
          device = await prisma.device.create({
            data: { code: deviceCode, name: `Dispenser ${deviceCode}`, status: "READY" },
          });
        }

        await prisma.transaction.create({
          data: {
            orderId,
            deviceId: device.id,
            volumeMl,
            amount,
            status: "PENDING",
            paymentMethod: "MIDTRANS_QRIS",
            snapToken: qris.qrString,
          },
        });

        const qrisCommand = {
          action: "SHOW_QRIS",
          nominal: amount.toLocaleString("id-ID"),
          amount,
          volumeMl,
          qris: qris.qrString,
          qrString: qris.qrString,
          orderId,
          timeoutSeconds: 300,
        };

        mqttClient.publish(
          `water/dispenser/${deviceCode}/command`,
          JSON.stringify(qrisCommand),
          { qos: 1 }
        );
        console.log(`[QRIS SENT TO ESP32 ${deviceCode}] Order: ${orderId}, Rp ${amount}`);
      } catch (err) {
        console.error(`[ORDER REQUEST ERROR for ${deviceCode}]:`, (err as Error).message);
      }
    } else if (eventType === "cancel") {
      console.log(`[ORDER CANCELLED from ${deviceCode}]`);
      if (payload.orderId) {
        prisma.transaction.updateMany({
          where: { orderId: payload.orderId, status: "PENDING" },
          data: { status: "CANCELLED" },
        }).catch((e) => console.warn("[DB Cancel Warn]:", e.message));
      }
    } else if (eventType === "get_packages") {
      console.log(`[MQTT] Perangkat ${deviceCode} meminta sinkronisasi paket menu (get_packages)`);
      try {
        const packages = await prisma.packagePreset.findMany({
          where: { isActive: true },
          orderBy: { volumeMl: "asc" },
          select: { id: true, name: true, volumeMl: true, price: true, code: true },
        });
        if (packages && packages.length > 0) {
          mqttClient.publish(
            `water/dispenser/${deviceCode}/packages`,
            JSON.stringify({ packages }),
            { qos: 1 }
          );
          console.log(`[MQTT BRIDGE] Berhasil merespon get_packages: ${packages.length} paket ke ${deviceCode}`);
        }
      } catch (err) {
        console.error(`[GET_PACKAGES ERROR for ${deviceCode}]:`, (err as Error).message);
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
        // Kirim daftar paket terbaru ke ESP32 agar menu selalu tersinkron
        prisma.packagePreset.findMany({
          where: { isActive: true },
          orderBy: { volumeMl: "asc" },
          select: { id: true, name: true, volumeMl: true, price: true },
        }).then((packages) => {
          if (packages.length > 0) {
            mqttClient.publish(
              `water/dispenser/${deviceCode}/packages`,
              JSON.stringify({ packages }),
              { qos: 1 }
            );
          }
        }).catch((e) => console.warn("[SYNC PACKAGES WARN]:", e.message));

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
      } else if (eventType === "telemetry" && (payload.transactionId || payload.orderId)) {
        const txIdentifier = payload.orderId || payload.transactionId;
        // Update volume terisi secara berkala pada transaksi aktif & pastikan status DISPENSING
        await prisma.transaction.updateMany({
          where: {
            OR: [
              { orderId: String(txIdentifier) },
              { id: String(txIdentifier) },
            ],
            status: { in: ["PAID", "DISPENSING"] },
          },
          data: {
            status: "DISPENSING",
            ...(payload.dispensedMl !== undefined ? { dispensedMl: Number(payload.dispensedMl) || 0 } : {}),
          },
        });
      } else if (eventType === "complete") {
        const txIdentifier = payload.orderId || payload.transactionId;
        const dispensed = Number(payload.dispensedMl) || 0;
        console.log(`[MQTT COMPLETE EVENT for ${deviceCode}]:`, payload);

        let targetTx = null;
        if (txIdentifier) {
          targetTx = await prisma.transaction.findFirst({
            where: {
              OR: [
                { orderId: String(txIdentifier) },
                { id: String(txIdentifier) },
              ],
            },
          });
        }

        // Fallback jika txIdentifier kosong atau tidak cocok, cari transaksi aktif terakhir di dispenser ini
        if (!targetTx) {
          const dev = await prisma.device.findUnique({ where: { code: deviceCode } });
          if (dev) {
            targetTx = await prisma.transaction.findFirst({
              where: {
                deviceId: dev.id,
                status: { in: ["PAID", "DISPENSING", "PENDING"] },
              },
              orderBy: { createdAt: "desc" },
            });
          }
        }

        const rawStatus = (payload.status || "COMPLETED").toUpperCase();
        const isFailed = rawStatus.includes("FAIL") || 
                         rawStatus.includes("HABIS") || 
                         rawStatus === "OVERWEIGHT" || 
                         rawStatus === "EMERGENCY_STOPPED";

        if (targetTx) {
          const finalDispensed = dispensed;
          const finalStatus = isFailed ? "FAILED" : "COMPLETED";

          const updatedTx = await prisma.transaction.update({
            where: { id: targetTx.id },
            data: {
              status: finalStatus,
              dispensedMl: finalDispensed,
              completedAt: new Date(),
            },
          });
          console.log(`[DB STATUS] Transaksi ${updatedTx.orderId} (${updatedTx.id}) status diperbarui: ${finalStatus} (${updatedTx.dispensedMl} mL).`);

          // Catat ke Log Aktivitas
          await prisma.activityLog.create({
            data: {
              level: isFailed ? "ERROR" : "INFO",
              action: isFailed ? "PUMP_DRY_RUN_FAILED" : "DISPENSE_COMPLETED",
              message: isFailed 
                ? `Pengisian GAGAL (${rawStatus}): Air tidak naik. Terisi ${finalDispensed}/${targetTx.volumeMl} mL. Order: ${targetTx.orderId}` 
                : `Pengisian air selesai (${finalDispensed} mL). Status transaksi COMPLETED.`,
              deviceId: targetTx.deviceId,
              metadata: {
                orderId: targetTx.orderId,
                dispensedMl: finalDispensed,
                targetMl: targetTx.volumeMl,
                amount: targetTx.amount,
                reason: rawStatus,
                deviceCode,
              },
            },
          }).catch(() => {});

          await prisma.device.updateMany({
            where: { code: deviceCode },
            data: { status: isFailed ? "ERROR" : "READY" },
          });
        } else {
          console.warn(`[DB WARN] Transaksi tidak ditemukan untuk event complete pada ${deviceCode} (txIdentifier: ${txIdentifier})`);
          await prisma.device.updateMany({
            where: { code: deviceCode },
            data: { status: isFailed ? "ERROR" : "READY" },
          });
        }
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
        const { deviceId = "DISPENSER-01", action, volumeMl = 600 } = msg;

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
            cachedTelemetry.targetMl = 0;
            cachedTelemetry.status = "READY";
          }
          broadcastToClients({
            type: "MQTT_EVENT",
            topic: `water/dispenser/${deviceId}/status`,
            deviceCode: deviceId,
            eventType: "status",
            data: { status: "READY", dispensedMl: 0, message: "Reset sesi pengisian berhasil" },
            timestamp: new Date().toISOString(),
          });
        }

        // Teruskan perintah ke ESP32 melalui MQTT PubSub
        const commandTopic = `water/dispenser/${deviceId}/command`;
        const commandPayload: Record<string, unknown> = {
          ...msg,
          action,
          volumeMl,
          transactionId,
          timestamp: Date.now(),
        };

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

// 5. Polling Otomatis Status Midtrans untuk Transaksi PENDING (Deteksi Pembayaran QRIS Real-Time)
setInterval(async () => {
  try {
    const pendingTransactions = await prisma.transaction.findMany({
      where: {
        status: "PENDING",
        createdAt: {
          gte: new Date(Date.now() - 6 * 60 * 1000), // Transaksi dalam 6 menit terakhir
        },
      },
      take: 5,
    });

    for (const tx of pendingTransactions) {
      try {
        const midtransResult = await checkMidtransStatus(tx.orderId);
        if (midtransResult && midtransResult.isPaid) {
          console.log(
            `[IOT POLLER] Transaksi ${tx.orderId} terdeteksi LUNAS di Midtrans! Mengirim sinyal PAYMENT_SUCCESS...`
          );
          await processPaymentSettlement(
            tx.orderId,
            midtransResult.paymentType || "qris",
            midtransResult.transactionStatus
          );
        } else if (midtransResult && midtransResult.isFailed) {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: { status: "CANCELLED" },
          });
        }
      } catch {
        // Abaikan error per order
      }
    }
  } catch {
    // Abaikan error polling
  }
}, 2500);

const shutdown = () => {
  console.log("\n[GATEWAY] Shutting down IoT Gateway...");
  wss.close();
  mqttClient.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
