import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMqttCommand } from "@/lib/mqtt-sender";

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { orderId },
      include: { device: true },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    if (transaction.status === "PAID" || transaction.status === "DISPENSING" || transaction.status === "COMPLETED") {
      return NextResponse.json({
        success: true,
        message: "Transaksi sudah dibayar sebelumnya.",
        status: transaction.status,
      });
    }

    // Ubah status menjadi PAID
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "PAID",
        paymentType: "simulation_qris",
        midtransStatus: "settlement",
        startedAt: new Date(),
      },
    });

    // Catat log aktivitas
    await prisma.activityLog.create({
      data: {
        level: "INFO",
        action: "PAYMENT_SIMULATED",
        message: `[SIMULASI LOKAL] Pembayaran sukses untuk ${transaction.orderId} (Rp ${transaction.amount.toLocaleString("id-ID")}).`,
        deviceId: transaction.deviceId,
        metadata: {
          orderId: transaction.orderId,
          volumeMl: transaction.volumeMl,
        },
      },
    });

    // Pemicu pompa otomatis via MQTT
    const deviceCode = transaction.device.code || "DISPENSER-01";
    await sendMqttCommand(deviceCode, {
      action: "START",
      volumeMl: transaction.volumeMl,
      maxWeight: 2500,
      transactionId: transaction.id,
      orderId: transaction.orderId,
    });

    return NextResponse.json({
      success: true,
      message: "Pembayaran berhasil diverifikasi (Simulasi Sandbox). Pompa air telah dipicu otomatis!",
      orderId: transaction.orderId,
      volumeMl: transaction.volumeMl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Simulation error";
    console.error("[PAYMENT SIMULATION ERROR]:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
