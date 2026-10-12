import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const packages = await prisma.packagePreset.findMany({
      where: { isActive: true },
      orderBy: { volumeMl: "asc" },
    });
    return NextResponse.json({ success: true, packages });
  } catch (error) {
    console.error("[API_PACKAGES_GET]", error);
    return NextResponse.json(
      { success: false, error: "Gagal mengambil daftar paket" },
      { status: 500 }
    );
  }
}
