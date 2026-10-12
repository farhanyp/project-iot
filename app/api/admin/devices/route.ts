import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const devices = await prisma.device.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { transactions: true } },
    },
  });

  return NextResponse.json({ success: true, devices });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, isActive, pricePerMl, name, location } = await req.json();

    if (!id) return NextResponse.json({ error: "Device ID required" }, { status: 400 });

    const device = await prisma.device.update({
      where: { id },
      data: {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(pricePerMl !== undefined ? { pricePerMl: parseFloat(pricePerMl) } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(location !== undefined ? { location } : {}),
      },
    });

    await prisma.activityLog.create({
      data: {
        level: "INFO",
        action: "DEVICE_UPDATED",
        message: `Perangkat ${device.code} diperbarui oleh ${session.username}.`,
        deviceId: device.id,
        metadata: { isActive, pricePerMl },
      },
    });

    return NextResponse.json({ success: true, device });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
