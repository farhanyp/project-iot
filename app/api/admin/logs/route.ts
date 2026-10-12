import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const level = req.nextUrl.searchParams.get("level");

  try {
    const validLevels = ["INFO", "WARN", "ERROR"] as const;
    const filterLevel = level && validLevels.includes(level as (typeof validLevels)[number])
      ? (level as (typeof validLevels)[number])
      : undefined;

    const logs = await prisma.activityLog.findMany({
      where: filterLevel ? { level: filterLevel } : undefined,
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        device: { select: { code: true } },
      },
    });

    return NextResponse.json({ success: true, logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
