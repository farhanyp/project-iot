import "dotenv/config";
import crypto from "crypto";

const MIDTRANS_SERVER_KEY = (process.env.MIDTRANS_SERVER_KEY || "").trim();
const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === "true";

const SNAP_API_URL = IS_PRODUCTION
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions";

const CORE_API_URL = IS_PRODUCTION
  ? "https://api.midtrans.com/v2/charge"
  : "https://api.sandbox.midtrans.com/v2/charge";

export interface CreateOrderParams {
  orderId: string;
  grossAmount: number;
  itemName: string;
  quantity?: number;
  customerName?: string;
}

export interface SnapResponse {
  token: string;
  redirectUrl: string;
  isSimulated: boolean;
}

export interface QrisChargeResponse {
  orderId: string;
  grossAmount: number;
  qrString: string; // String EMVCo mentah untuk digambar langsung di layar LCD TFT ESP32
  qrUrl?: string; // URL gambar PNG QR code v1 (untuk simulator v1)
  qrUrlV2?: string; // URL gambar PNG QR code v2 (untuk simulator v2)
  transactionId?: string;
  isSimulated: boolean;
}

// 1. Pembuatan Sesi Pembayaran Snap (Pop-up Web Iframe Standar)
export async function createSnapTransaction(params: CreateOrderParams): Promise<SnapResponse> {
  const { orderId, grossAmount, itemName, quantity = 1, customerName = "Konsumen Kios" } = params;

  // Jika kredensial belum diisi di .env, gunakan mode simulasi sandbox bawaan
  if (!MIDTRANS_SERVER_KEY || MIDTRANS_SERVER_KEY.trim() === "") {
    console.log(`[MIDTRANS MOCK SNAP] Menggunakan simulasi lokal untuk order: ${orderId}`);
    return {
      token: `MOCK-SNAP-${Date.now()}-${orderId}`,
      redirectUrl: `/payment/simulate?orderId=${orderId}`,
      isSimulated: true,
    };
  }

  const authHeader = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64");

  const payload = {
    transaction_details: {
      order_id: orderId,
      gross_amount: Math.round(grossAmount),
    },
    item_details: [
      {
        id: "WATER_REFILL",
        price: Math.round(grossAmount / quantity),
        quantity,
        name: itemName,
      },
    ],
    customer_details: {
      first_name: customerName,
    },
    enabled_payments: ["qris", "gopay", "shopeepay", "other_qris"],
  };

  const response = await fetch(SNAP_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${authHeader}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[MIDTRANS ERROR RESPONSE]:", errorText);
    throw new Error(`Midtrans API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    token: data.token,
    redirectUrl: data.redirect_url,
    isSimulated: false,
  };
}

// 2. Pembuatan Direct QRIS Core API (Tanpa Pop-up, Langsung Menghasilkan qr_string EMVCo untuk LCD TFT)
export async function createQrisTransaction(params: CreateOrderParams): Promise<QrisChargeResponse> {
  const { orderId, grossAmount, itemName, quantity = 1 } = params;

  // Jika kredensial belum diisi di .env, gunakan mode simulasi mock lokal
  if (!MIDTRANS_SERVER_KEY || MIDTRANS_SERVER_KEY.trim() === "") {
    console.log(`[MIDTRANS MOCK CORE QRIS] Menggunakan simulasi lokal QRIS untuk order: ${orderId}`);
    return {
      orderId,
      grossAmount,
      qrString: `00020101021226590014ID.LINKAJA.WWW01189360091100200023815204581253033605802ID5911WATERVEND6007JAKARTA61051234062070703A016304${orderId}`,
      qrUrl: `/payment/simulate?orderId=${orderId}`,
      isSimulated: true,
    };
  }

  const authHeader = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64");

  const payload = {
    payment_type: "qris",
    transaction_details: {
      order_id: orderId,
      gross_amount: Math.round(grossAmount),
    },
    item_details: [
      {
        id: "WATER_REFILL",
        price: Math.round(grossAmount / quantity),
        quantity,
        name: itemName,
      },
    ],
    qris: {
      acquirer: process.env.MIDTRANS_QRIS_ACQUIRER || "airpay shopee",
    },
  };

  const response = await fetch(CORE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${authHeader}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[MIDTRANS CORE QRIS ERROR]:", errorText);
    throw new Error(`Midtrans Core API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const qrActionV1 = Array.isArray(data.actions)
    ? data.actions.find((a: { name: string; url: string }) => a.name === "generate-qr-code")
    : undefined;

  const qrActionV2 = Array.isArray(data.actions)
    ? data.actions.find((a: { name: string; url: string }) => a.name === "generate-qr-code-v2")
    : undefined;

  return {
    orderId,
    grossAmount,
    qrString: data.qr_string || "",
    qrUrl: qrActionV1?.url || "",
    qrUrlV2: qrActionV2?.url || "",
    transactionId: data.transaction_id,
    isSimulated: false,
  };
}

// 3. Verifikasi Tanda Tangan Webhook SHA512
export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string
): boolean {
  if (!MIDTRANS_SERVER_KEY) {
    // Mode simulasi lokal selalu valid
    return true;
  }

  const payload = `${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY}`;
  const expectedSignature = crypto.createHash("sha512").update(payload).digest("hex");

  return expectedSignature.toLowerCase() === signatureKey.toLowerCase();
}

export interface MidtransStatusResult {
  statusCode: string;
  transactionStatus: string;
  fraudStatus?: string;
  paymentType?: string;
  grossAmount?: string;
  orderId: string;
  isPaid: boolean;
  isFailed: boolean;
  raw?: Record<string, unknown>;
}

// 4. Pengecekan Status Transaksi Langsung ke Midtrans Core API (Active Polling Fallback)
export async function checkMidtransStatus(orderId: string): Promise<MidtransStatusResult | null> {
  if (!MIDTRANS_SERVER_KEY || MIDTRANS_SERVER_KEY.trim() === "") {
    return null;
  }

  const baseUrl = IS_PRODUCTION
    ? "https://api.midtrans.com/v2"
    : "https://api.sandbox.midtrans.com/v2";

  const authHeader = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64");

  try {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(orderId)}/status`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
      // Jangan gunakan cache agar data status real-time
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 404) {
        return null; // Transaksi belum terdaftar di Midtrans
      }
      const errText = await res.text();
      console.warn(`[MIDTRANS STATUS CHECK WARN] (${res.status}): ${errText}`);
      return null;
    }

    const data = await res.json();
    const transactionStatus = String(data.transaction_status || "");
    const fraudStatus = String(data.fraud_status || "");

    const isPaid =
      transactionStatus === "settlement" ||
      (transactionStatus === "capture" && fraudStatus === "accept");

    const isFailed =
      transactionStatus === "cancel" ||
      transactionStatus === "deny" ||
      transactionStatus === "expire";

    return {
      statusCode: String(data.status_code || "200"),
      transactionStatus,
      fraudStatus,
      paymentType: data.payment_type,
      grossAmount: data.gross_amount,
      orderId: data.order_id || orderId,
      isPaid,
      isFailed,
      raw: data,
    };
  } catch (error) {
    console.error("[MIDTRANS STATUS CHECK ERROR]:", error);
    return null;
  }
}

