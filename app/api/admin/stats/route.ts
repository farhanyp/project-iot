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

    // 1. Agregasi Omset
    const [todayAgg, weekAgg, totalAgg, totalDispensedAgg, totalCount] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          status: { in: successfulStatuses },
          createdAt: { gte: startOfToday },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          status: { in: successfulStatuses },
          createdAt: { gte: sevenDaysAgo },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          status: { in: successfulStatuses },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          status: { in: successfulStatuses },
        },
        _sum: { dispensedMl: true },
      }),
      prisma.transaction.count(),
    ]);

    // 2. Transaksi Terbaru
    const recentTransactions = await prisma.transaction.findMany({
      take: 15,
      orderBy: { createdAt: "desc" },
      include: {
        device: { select: { code: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      stats: {
        todayRevenue: todayAgg._sum.amount || 0,
        weekRevenue: weekAgg._sum.amount || 0,
        totalRevenue: totalAgg._sum.amount || 0,
        totalDispensedLiters: ((totalDispensedAgg._sum.dispensedMl || 0) / 1000).toFixed(1),
        totalTransactions: totalCount,
      },
      recentTransactions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
