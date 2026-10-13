import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkMidtransStatus } from "@/lib/midtrans";
import { processPaymentSettlement } from "@/lib/payment-helper";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  let transaction = await prisma.transaction.findUnique({
    where: { orderId },
    select: {
      id: true,
      orderId: true,
      status: true,
      volumeMl: true,
      amount: true,
      dispensedMl: true,
      paymentType: true,
      createdAt: true,
    },
  });

  if (!transaction) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // JIKA STATUS MASIH PENDING: Lakukan active polling ke Midtrans Core API
  // Ini menangani kasus webhook Midtrans belum sampai ke localhost / tertunda
  if (transaction.status === "PENDING") {
    try {
      const midtransResult = await checkMidtransStatus(orderId);

      if (midtransResult && midtransResult.isPaid) {
        console.log(
          `[STATUS SYNC ACTIVE] Order ${orderId} terdeteksi SUKSES di Midtrans (${midtransResult.transactionStatus}). Memproses otomatis...`
        );
        const settlement = await processPaymentSettlement(
          orderId,
          midtransResult.paymentType || "qris",
          midtransResult.transactionStatus
        );

        if (settlement.success && settlement.transaction) {
          transaction = {
            id: settlement.transaction.id,
            orderId: settlement.transaction.orderId,
            status: settlement.transaction.status,
            volumeMl: settlement.transaction.volumeMl,
            amount: settlement.transaction.amount,
            dispensedMl: settlement.transaction.dispensedMl,
            paymentType: settlement.transaction.paymentType,
            createdAt: settlement.transaction.createdAt,
          };
        }
      } else if (midtransResult && midtransResult.isFailed) {
        console.log(`[STATUS SYNC ACTIVE] Order ${orderId} status gagal di Midtrans: ${midtransResult.transactionStatus}`);
        const newStatus = midtransResult.transactionStatus === "cancel" ? "CANCELLED" : "FAILED";
        const updated = await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: newStatus,
            midtransStatus: midtransResult.transactionStatus,
          },
          select: {
            id: true,
            orderId: true,
            status: true,
            volumeMl: true,
            amount: true,
            dispensedMl: true,
            paymentType: true,
            createdAt: true,
          },
        });
        transaction = updated;
      }
    } catch (checkErr) {
      console.warn("[MIDTRANS ACTIVE STATUS SYNC ERROR]:", checkErr);
    }
  }

  return NextResponse.json({ success: true, transaction });
}
