import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const transaction = await prisma.transaction.findUnique({
    where: { orderId },
    select: {
      id: true,
      orderId: true,
      status: true,
      volumeMl: true,
      amount: true,
      dispensedMl: true,
      paymentType: true,
      createdAt: true,
    },
  });

  if (!transaction) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, transaction });
}
