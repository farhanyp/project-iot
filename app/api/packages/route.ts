import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishMqttMessage } from "@/lib/mqtt-sender";

// Helper broadcast daftar paket aktif ke semua ESP32 Dispenser via MQTT
async function broadcastPackagesToDispensers() {
  try {
    const packages = await prisma.packagePreset.findMany({
      where: { isActive: true },
      orderBy: { volumeMl: "asc" },
      select: { id: true, name: true, volumeMl: true, price: true, code: true },
    });
    await publishMqttMessage(
      "water/dispenser/+/packages",
      JSON.stringify({ packages })
    );
  } catch (err) {
    console.warn("[BROADCAST PACKAGES ERROR]:", err);
  }
}

// 1. GET: Ambil daftar paket aktif
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

// 2. POST: Tambah paket baru ke database dan broadcast ke ESP32
export async function POST(req: NextRequest) {
  try {
    const { name, volumeMl, price, code } = await req.json();

    if (!name || !volumeMl || !price) {
      return NextResponse.json(
        { success: false, error: "Nama, volume (mL), dan harga wajib diisi." },
        { status: 400 }
      );
    }

    const packageCode = code || `PKG_${volumeMl}ML_${Date.now().toString(36).toUpperCase()}`;

    const newPackage = await prisma.packagePreset.create({
      data: {
        code: packageCode,
        name,
        volumeMl: parseInt(volumeMl, 10),
        price: parseFloat(price),
        isActive: true,
      },
    });

    // Broadcast daftar paket baru ke layar LCD ESP32
    broadcastPackagesToDispensers().catch(console.warn);

    return NextResponse.json({ success: true, package: newPackage });
  } catch (error) {
    console.error("[API_PACKAGES_POST]", error);
    return NextResponse.json(
      { success: false, error: "Gagal menambahkan paket baru." },
      { status: 500 }
    );
  }
}

// 3. PUT: Update paket yang ada di database dan broadcast ke ESP32
export async function PUT(req: NextRequest) {
  try {
    const { id, name, volumeMl, price, isActive } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "ID paket diperlukan." }, { status: 400 });
    }

    const updated = await prisma.packagePreset.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(volumeMl !== undefined && { volumeMl: parseInt(volumeMl, 10) }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    broadcastPackagesToDispensers().catch(console.warn);

    return NextResponse.json({ success: true, package: updated });
  } catch (error) {
    console.error("[API_PACKAGES_PUT]", error);
    return NextResponse.json(
      { success: false, error: "Gagal memperbarui paket." },
      { status: 500 }
    );
  }
}

// 4. DELETE: Hapus atau nonaktifkan paket dan sync ke ESP32
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID paket diperlukan." }, { status: 400 });
    }

    await prisma.packagePreset.update({
      where: { id },
      data: { isActive: false },
    });

    broadcastPackagesToDispensers().catch(console.warn);

    return NextResponse.json({ success: true, message: "Paket berhasil dihapus / dinonaktifkan." });
  } catch (error) {
    console.error("[API_PACKAGES_DELETE]", error);
    return NextResponse.json(
      { success: false, error: "Gagal menghapus paket." },
      { status: 500 }
    );
  }
}
