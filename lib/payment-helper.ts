import { prisma } from "./prisma";
import { sendMqttCommand } from "./mqtt-sender";

export async function processPaymentSettlement(
  orderId: string,
  paymentType: string = "qris",
  midtransStatus: string = "settlement"
) {
  const transaction = await prisma.transaction.findUnique({
    where: { orderId },
    include: { device: true },
  });

  if (!transaction) {
    return { success: false, error: "Transaksi tidak ditemukan." };
  }

  // Jika sudah berstatus lunas / sedang menuang / selesai, jangan kirim START ganda
  if (
    transaction.status === "PAID" ||
    transaction.status === "DISPENSING" ||
    transaction.status === "COMPLETED"
  ) {
    return {
      success: true,
      alreadyProcessed: true,
      transaction,
    };
  }

  // 1. Perbarui status transaksi menjadi PAID
  const updatedTransaction = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: "PAID",
      paymentType: paymentType || "qris",
      midtransStatus: midtransStatus || "settlement",
      startedAt: new Date(),
    },
    include: { device: true },
  });

  // 2. Catat Log Aktivitas
  try {
    await prisma.activityLog.create({
      data: {
        level: "INFO",
        action: "PAYMENT_PAID",
        message: `Pembayaran sukses diverifikasi untuk ${transaction.orderId} (Rp ${transaction.amount.toLocaleString("id-ID")}).`,
        deviceId: transaction.deviceId,
        metadata: {
          orderId: transaction.orderId,
          volumeMl: transaction.volumeMl,
          paymentType,
          midtransStatus,
        },
      },
    });
  } catch (logErr) {
    console.warn("[LOG ERROR]:", logErr);
  }

  // 3. NOTIFIKASI PEMBAYARAN LUNAS KE ESP32: Menampilkan instruksi letakkan tumbler
  const deviceCode = transaction.device?.code || "DISPENSER-01";
  try {
    const sent = await sendMqttCommand(deviceCode, {
      action: "PAYMENT_SUCCESS",
      volumeMl: transaction.volumeMl,
      maxWeight: 2500,
      transactionId: transaction.id,
      orderId: transaction.orderId,
    });
    console.log(
      `[PAYMENT NOTIFICATION] Perintah PAYMENT_SUCCESS dikirim ke ${deviceCode} untuk order ${transaction.orderId} (Status kirim: ${sent})`
    );
  } catch (mqttErr) {
    console.error("[MQTT PAYMENT_SUCCESS COMMAND ERROR]:", mqttErr);
  }

  return {
    success: true,
    alreadyProcessed: false,
    transaction: updatedTransaction,
  };
}
