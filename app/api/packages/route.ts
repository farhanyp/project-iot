import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishMqttMessage } from "@/lib/mqtt-sender";

// Helper broadcast daftar paket aktif ke semua ESP32 Dispenser via MQTT
export async function broadcastPackagesToDispensers() {
  try {
    const packages = await prisma.packagePreset.findMany({
      where: { isActive: true },
      orderBy: { volumeMl: "asc" },
      select: { id: true, name: true, volumeMl: true, price: true, code: true },
    });

    const payload = JSON.stringify({ packages });

    // 1. Broadcast ke topik umum dan fallback DISPENSER-01
    await publishMqttMessage("water/dispenser/broadcast/packages", payload);
    await publishMqttMessage("water/dispenser/DISPENSER-01/packages", payload);

    // 2. Broadcast ke seluruh perangkat aktif di database
    const devices = await prisma.device.findMany({
      select: { code: true },
    });
    for (const dev of devices) {
      if (dev.code !== "DISPENSER-01") {
        await publishMqttMessage(`water/dispenser/${dev.code}/packages`, payload);
      }
    }

    console.log(`[MQTT BROADCAST] ${packages.length} paket berhasil disinkronisasi ke ESP32.`);
    return { success: true, count: packages.length };
  } catch (err) {
    console.warn("[BROADCAST PACKAGES ERROR]:", err);
    return { success: false, error: err };
  }
}

// 1. GET: Ambil daftar paket (all=true untuk admin, default: hanya aktif)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all") === "true";

    const packages = await prisma.packagePreset.findMany({
      where: all ? undefined : { isActive: true },
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
    const { id, name, volumeMl, price, isActive, code } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "ID paket diperlukan." }, { status: 400 });
    }

    const updated = await prisma.packagePreset.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
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

// 4. DELETE: Hapus paket (soft-delete jika ada transaksi, hard-delete jika belum ada) dan sync ke ESP32
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID paket diperlukan." }, { status: 400 });
    }

    const txCount = await prisma.transaction.count({ where: { packagePresetId: id } });
    if (txCount > 0) {
      await prisma.packagePreset.update({
        where: { id },
        data: { isActive: false },
      });
    } else {
      await prisma.packagePreset.delete({
        where: { id },
      });
    }

    broadcastPackagesToDispensers().catch(console.warn);

    return NextResponse.json({
      success: true,
      message: txCount > 0 ? "Paket dinonaktifkan (karena memiliki riwayat transaksi)." : "Paket berhasil dihapus permanen.",
    });
  } catch (error) {
    console.error("[API_PACKAGES_DELETE]", error);
    return NextResponse.json(
      { success: false, error: "Gagal menghapus paket." },
      { status: 500 }
    );
  }
}
