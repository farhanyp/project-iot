import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, clearSessionCookie } from "@/lib/auth";

export async function POST() {
  try {
    const session = await getSession();

    if (session) {
      await prisma.activityLog.create({
        data: {
          level: "INFO",
          action: "AUTH_LOGOUT",
          message: `Pengelola '${session.username}' berhasil logout.`,
          metadata: { userId: session.userId },
        },
      });
    }

    await clearSessionCookie();

    return NextResponse.json({ success: true, message: "Berhasil logout." });
  } catch (error) {
    console.error("[LOGOUT ERROR]:", error);
    return NextResponse.json({ error: "Gagal memproses logout." }, { status: 500 });
  }
}
