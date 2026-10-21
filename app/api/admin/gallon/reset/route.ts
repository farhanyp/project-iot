import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const log = await prisma.activityLog.create({
      data: {
        level: "INFO",
        action: "GALLON_RESET",
        message: `Penggantian galon baru (19 Liter) oleh admin ${session.username}`,
        metadata: {
          operator: session.username,
          resetAt: new Date().toISOString(),
          capacityMl: 19000,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Status galon berhasil di-reset. Penghitungan dimulai dari galon baru (19 Liter).",
      logId: log.id,
      resetAt: log.createdAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
