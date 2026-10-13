import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { processPaymentSettlement } from "@/lib/payment-helper";

export async function GET() {
  return NextResponse.json({
    status: "OK",
    message: "Midtrans notification webhook endpoint is ready.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    console.log("[MIDTRANS WEBHOOK RECEIVED]:", payload);

    const orderId = payload.order_id;
    const statusCode = payload.status_code;
    const grossAmount = payload.gross_amount;
    const signatureKey = payload.signature_key;
    const transactionStatus = payload.transaction_status;
    const paymentType = payload.payment_type;
    const fraudStatus = payload.fraud_status;

    if (!orderId) {
      return NextResponse.json({ error: "order_id missing" }, { status: 400 });
    }

    // 1. Verifikasi Tanda Tangan SHA512
    if (signatureKey) {
      const isValid = verifyMidtransSignature(orderId, statusCode, grossAmount, signatureKey);
      if (!isValid) {
        console.warn(`[MIDTRANS WEBHOOK] Signature tidak cocok untuk order ${orderId}`);
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    // 2. Ambil Transaksi dari DB
    const transaction = await prisma.transaction.findUnique({
      where: { orderId },
      include: { device: true },
    });

    if (!transaction) {
      console.warn(`[MIDTRANS WEBHOOK] Transaksi tidak ditemukan di DB: ${orderId} (kemungkinan probe/tes dari Midtrans Dashboard)`);
      // Kembalikan status 200 agar fitur Test di Dashboard Midtrans sukses
      return NextResponse.json({
        status: "OK",
        message: `Order ${orderId} tidak ada di database lokal (diabaikan sebagai tes/probe).`,
      });
    }

    // 3. Evaluasi Status Pembayaran
    const isPaid =
      transactionStatus === "settlement" ||
      (transactionStatus === "capture" && fraudStatus === "accept");

    const isFailed =
      transactionStatus === "cancel" ||
      transactionStatus === "deny" ||
      transactionStatus === "expire";

    if (isPaid && transaction.status === "PENDING") {
      await processPaymentSettlement(transaction.orderId, paymentType || "qris", transactionStatus);
      console.log(`[PUMP AUTO-TRIGGER via Webhook] Pompa dinyalakan otomatis untuk order ${transaction.orderId}!`);
    } else if (isFailed) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: transactionStatus === "cancel" ? "CANCELLED" : "FAILED",
          midtransStatus: transactionStatus,
        },
      });

      await prisma.activityLog.create({
        data: {
          level: "WARN",
          action: "PAYMENT_FAILED",
          message: `Pembayaran gagal/kedaluwarsa untuk ${transaction.orderId} (${transactionStatus}).`,
          deviceId: transaction.deviceId,
          metadata: { orderId: transaction.orderId, status: transactionStatus },
        },
      });
    }

    return NextResponse.json({ status: "OK", message: "Webhook processed" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Webhook error";
    console.error("[WEBHOOK ERROR]:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
