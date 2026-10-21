import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const successfulStatuses: ("PAID" | "DISPENSING" | "COMPLETED")[] = ["PAID", "DISPENSING", "COMPLETED"];

    // 1. Agregasi Omset & Kuantitas Transaksi
    const [
      todayAgg,
      todayCount,
      weekAgg,
      weekCount,
      totalAgg,
      totalCount,
      totalDispensedAgg,
      lastGallonReset,
    ] = await Promise.all([
      // Omset hari ini (sukses)
      prisma.transaction.aggregate({
        where: {
          status: { in: successfulStatuses },
          createdAt: { gte: startOfToday },
        },
        _sum: { amount: true },
      }),
      // Kuantitas transaksi hari ini
      prisma.transaction.count({
        where: {
          createdAt: { gte: startOfToday },
        },
      }),
      // Omset 7 hari (sukses)
      prisma.transaction.aggregate({
        where: {
          status: { in: successfulStatuses },
          createdAt: { gte: sevenDaysAgo },
        },
        _sum: { amount: true },
      }),
      // Kuantitas transaksi 7 hari
      prisma.transaction.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      // Total omset keseluruhan (sukses)
      prisma.transaction.aggregate({
        where: {
          status: { in: successfulStatuses },
        },
        _sum: { amount: true },
      }),
      // Total kuantitas transaksi dari awal
      prisma.transaction.count(),
      // Total liter air yang sudah dialirkan
      prisma.transaction.aggregate({
        where: {
          status: { in: successfulStatuses },
        },
        _sum: { dispensedMl: true, volumeMl: true },
      }),
      // Pencatatan penggantian galon terakhir
      prisma.activityLog.findFirst({
        where: { action: "GALLON_RESET" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // 2. Perhitungan Estimasi Galon Berjalan (Standar Galon 19 Liter / 19.000 mL)
    const gallonSince = lastGallonReset ? lastGallonReset.createdAt : new Date(0);
    const currentGallonAgg = await prisma.transaction.aggregate({
      where: {
        status: { in: successfulStatuses },
        createdAt: { gte: gallonSince },
      },
      _sum: { dispensedMl: true, volumeMl: true },
    });

    const GALLON_CAPACITY_ML = 19000;
    const currentGallonUsedMl = (currentGallonAgg._sum.dispensedMl || 0) > 0
      ? (currentGallonAgg._sum.dispensedMl || 0)
      : (currentGallonAgg._sum.volumeMl || 0);

    const remainingMl = Math.max(0, GALLON_CAPACITY_ML - currentGallonUsedMl);
    const remainingPercent = Math.max(0, Math.min(100, Math.round((remainingMl / GALLON_CAPACITY_ML) * 100)));

    const gallonStats = {
      capacityMl: GALLON_CAPACITY_ML,
      usedMl: currentGallonUsedMl,
      usedLiters: (currentGallonUsedMl / 1000).toFixed(2),
      remainingMl,
      remainingLiters: (remainingMl / 1000).toFixed(2),
      remainingPercent,
      estimatedBottles600ml: Math.floor(remainingMl / 600),
      estimatedCups200ml: Math.floor(remainingMl / 200),
      lastResetAt: lastGallonReset?.createdAt || null,
    };

    const totalDispensed = (totalDispensedAgg._sum.dispensedMl || 0) > 0
      ? (totalDispensedAgg._sum.dispensedMl || 0)
      : (totalDispensedAgg._sum.volumeMl || 0);

    return NextResponse.json({
      success: true,
      stats: {
        todayRevenue: todayAgg._sum.amount || 0,
        todayTransactions: todayCount,
        weekRevenue: weekAgg._sum.amount || 0,
        weekTransactions: weekCount,
        totalRevenue: totalAgg._sum.amount || 0,
        totalTransactions: totalCount,
        totalDispensedLiters: (totalDispensed / 1000).toFixed(1),
        gallon: gallonStats,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
