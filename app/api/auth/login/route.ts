import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username dan password wajib diisi." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json(
        { error: "Username atau password salah." },
        { status: 401 }
      );
    }

    // Set cookie sesi
    await setSessionCookie({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    });

    // Catat log aktivitas
    await prisma.activityLog.create({
      data: {
        level: "INFO",
        action: "AUTH_LOGIN",
        message: `Pengelola '${user.username}' (${user.role}) berhasil login.`,
        metadata: {
          userId: user.id,
          role: user.role,
          ip: req.headers.get("x-forwarded-for") || "localhost",
        },
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("[LOGIN ERROR]:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat memproses login." },
      { status: 500 }
    );
  }
}
