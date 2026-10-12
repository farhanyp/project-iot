import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";

async function main() {
  console.log("[SEED] Memulai inisialisasi database...");

  // 1. Akun Admin Default
  const adminPasswordHash = hashPassword("admin123");
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: adminPasswordHash,
      name: "Administrator",
      role: "ADMIN",
    },
  });
  console.log(`[SEED] Admin siap: ${admin.username} (password: admin123)`);

  // 2. Preset Paket Air
  const presets = [
    { code: "CUP_250ML", name: "Gelas Mini 250 mL", volumeMl: 250, price: 2500 },
    { code: "BOTTLE_600ML", name: "Botol Sedang 600 mL", volumeMl: 600, price: 6000 },
    { code: "GALLON_1500ML", name: "Botol Besar 1.500 mL", volumeMl: 1500, price: 15000 },
  ];

  for (const p of presets) {
    await prisma.packagePreset.upsert({
      where: { code: p.code },
      update: { name: p.name, volumeMl: p.volumeMl, price: p.price, isActive: true },
      create: { code: p.code, name: p.name, volumeMl: p.volumeMl, price: p.price, isActive: true },
    });
  }
  console.log(`[SEED] ${presets.length} Paket preset siap.`);

  // 3. Perangkat Default DISPENSER-01
  const device = await prisma.device.upsert({
    where: { code: "DISPENSER-01" },
    update: { isActive: true },
    create: {
      code: "DISPENSER-01",
      name: "Dispenser Utama DISPENSER-01",
      location: "Kios Lantai 1",
      status: "READY",
      isActive: true,
      pricePerMl: 0.01,
    },
  });
  console.log(`[SEED] Perangkat default siap: ${device.code}`);

  // 4. Catat Log Aktivitas
  await prisma.activityLog.create({
    data: {
      level: "INFO",
      action: "SYSTEM_INITIALIZED",
      message: "Database berhasil diinisialisasi dengan data default.",
      deviceId: device.id,
      metadata: { seededAt: new Date().toISOString() },
    },
  });

  console.log("[SEED] Selesai dengan sukses!");
}

main()
  .catch((e) => {
    console.error("[SEED ERROR]:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
