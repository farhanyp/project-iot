import { NextRequest, NextResponse } from "next/server";
import { processPaymentSettlement } from "@/lib/payment-helper";

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const result = await processPaymentSettlement(orderId, "simulation_qris", "settlement");

    if (!result.success || !result.transaction) {
      return NextResponse.json(
        { error: result.error || "Gagal memproses simulasi pembayaran." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.alreadyProcessed
        ? "Transaksi sudah lunas sebelumnya."
        : "Pembayaran berhasil diverifikasi (Simulasi Sandbox). Pompa air telah dipicu otomatis!",
      orderId: result.transaction.orderId,
      volumeMl: result.transaction.volumeMl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Simulation error";
    console.error("[PAYMENT SIMULATION ERROR]:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
