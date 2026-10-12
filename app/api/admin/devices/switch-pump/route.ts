import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendMqttCommand } from "@/lib/mqtt-sender";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { deviceCode = "DISPENSER-01", action } = await req.json();

    if (action !== "ON" && action !== "OFF") {
      return NextResponse.json({ error: "Action must be ON or OFF" }, { status: 400 });
    }

    // Kirim perintah paksa ke ESP32 via MQTT
    await sendMqttCommand(deviceCode, {
      action: action === "ON" ? "START" : "STOP",
      volumeMl: action === "ON" ? 500 : 0,
      isManualTest: true,
    });

    const device = await prisma.device.findUnique({ where: { code: deviceCode } });

    await prisma.activityLog.create({
      data: {
        level: "WARN",
        action: "REMOTE_PUMP_SWITCH",
        message: `Admin ${session.username} memicu sakelar remote pompa ${action} pada ${deviceCode}.`,
        deviceId: device?.id,
        metadata: { action, deviceCode },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Perintah remote pompa ${action} telah dikirim ke ${deviceCode}.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
