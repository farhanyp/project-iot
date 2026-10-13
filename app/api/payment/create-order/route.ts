import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSnapTransaction, createQrisTransaction } from "@/lib/midtrans";
import { publishMqttMessage } from "@/lib/mqtt-sender";

const PAYMENT_QRIS_MODE = process.env.PAYMENT_QRIS_MODE || "core";

export async function POST(req: NextRequest) {
  try {
    const { volumeMl, deviceId = "DISPENSER-01", packagePresetId } = await req.json();

    if (!volumeMl || volumeMl <= 0) {
      return NextResponse.json({ error: "Volume air tidak valid." }, { status: 400 });
    }

    // 1. Validasi Perangkat
    let device = await prisma.device.findUnique({
      where: { code: deviceId },
    });

    if (!device) {
      device = await prisma.device.create({
        data: {
          code: deviceId,
          name: `Dispenser ${deviceId}`,
          status: "READY",
          isActive: true,
          pricePerMl: 0.01,
        },
      });
    }

    if (!device.isActive) {
      return NextResponse.json(
        { error: "Perangkat ini sedang dinonaktifkan oleh pengelola (Maintenance)." },
        { status: 403 }
      );
    }

    // 2. Hitung Harga
    let amount = volumeMl * 10;
    let itemName = `Isi Ulang Air ${volumeMl} mL`;

    if (packagePresetId) {
      const preset = await prisma.packagePreset.findUnique({
        where: { id: packagePresetId },
      });
      if (preset) {
        amount = preset.price;
        itemName = preset.name;
      }
    } else {
      amount = Math.round(volumeMl * (device.pricePerMl || 0.01) * 1000);
      if (amount < 500) amount = 500;
    }

    // 3. Buat Kode Order Invoice Unik
    const orderId = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    let snapToken: string | null = null;
    let qrString = "";
    let qrUrl = "";
    let qrUrlV2 = "";
    let redirectUrl = "";
    let isSimulated = false;

    // 4. Proses Gateway Berdasarkan Mode (Direct Core QRIS vs Snap)
    if (PAYMENT_QRIS_MODE === "core") {
      const qris = await createQrisTransaction({
        orderId,
        grossAmount: amount,
        itemName,
      });
      qrString = qris.qrString;
      qrUrl = qris.qrUrl || "";
      qrUrlV2 = qris.qrUrlV2 || "";
      isSimulated = qris.isSimulated;

      // Broadcast string QRIS langsung ke ESP32 LCD TFT melalui MQTT (non-blocking)
      publishMqttMessage(
        `water/dispenser/${deviceId}/qr`,
        JSON.stringify({
          orderId,
          amount,
          volumeMl,
          qrString,
          timestamp: Date.now(),
        })
      ).catch((err) => {
        console.warn("[MQTT QR BROADCAST WARN]:", err);
      });
    } else {
      const snap = await createSnapTransaction({
        orderId,
        grossAmount: amount,
        itemName,
      });
      snapToken = snap.token;
      redirectUrl = snap.redirectUrl;
      isSimulated = snap.isSimulated;
    }

    // 5. Simpan Transaksi ke Database
    const transaction = await prisma.transaction.create({
      data: {
        orderId,
        deviceId: device.id,
        packagePresetId: packagePresetId || undefined,
        volumeMl,
        amount,
        status: "PENDING",
        paymentMethod: "MIDTRANS_QRIS",
        snapToken: snapToken || qrString,
      },
    });

    return NextResponse.json({
      success: true,
      orderId: transaction.orderId,
      transactionId: transaction.id,
      amount: transaction.amount,
      volumeMl: transaction.volumeMl,
      paymentMode: PAYMENT_QRIS_MODE,
      qrString,
      qrUrl,
      qrUrlV2,
      snapToken,
      redirectUrl,
      isSimulated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Gagal membuat pesanan pembayaran.";
    console.error("[CREATE ORDER ERROR]:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
