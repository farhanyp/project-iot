import { NextResponse } from "next/server";
import { broadcastPackagesToDispensers } from "../route";

// Endpoint untuk memicu sinkronisasi manual paket ke semua ESP32 via MQTT
export async function POST() {
  try {
    const result = await broadcastPackagesToDispensers();
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Sinkronisasi berhasil: ${result.count} paket aktif dikirim ke ESP32.`,
        count: result.count,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Gagal menyiarkan paket via MQTT" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[API_PACKAGES_SYNC]", error);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan internal sinkronisasi." },
      { status: 500 }
    );
  }
}
