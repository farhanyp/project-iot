"use client";

export interface PaymentOrder {
  orderId: string;
  amount: number;
  volumeMl: number;
  snapToken?: string;
  qrString?: string;
  qrUrl?: string;
  qrUrlV2?: string;
  paymentMode?: string;
  isSimulated: boolean;
}

export interface QrisPaymentModalProps {
  paymentOrder: PaymentOrder | null;
  simulating: boolean;
  onSimulate: () => void;
  onCancel: () => void;
  onCopyUrl: (url: string, label: string) => void;
}

export default function QrisPaymentModal({
  paymentOrder,
  simulating,
  onSimulate,
  onCancel,
  onCopyUrl,
}: QrisPaymentModalProps) {
  if (!paymentOrder) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-white rounded-2xl max-w-sm w-full p-4 sm:p-6 shadow-xl border border-slate-200 space-y-4 sm:space-y-5 text-center max-h-[92vh] overflow-y-auto">
        <div className="space-y-0.5">
          <h3 className="font-bold text-lg sm:text-xl text-slate-900">Pembayaran QRIS</h3>
          <p className="text-[11px] sm:text-xs text-slate-500 font-mono break-all">{paymentOrder.orderId}</p>
        </div>

        <div className="p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1 sm:space-y-2">
          <div className="text-2xl sm:text-3xl font-bold font-mono text-blue-700">
            Rp {paymentOrder.amount.toLocaleString("id-ID")}
          </div>
          <p className="text-xs text-slate-600">
            Volume: <strong>{paymentOrder.volumeMl} mL</strong> air minum
          </p>
        </div>

        {/* Area QR Code */}
        <div className="p-3 sm:p-4 bg-white border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center space-y-2">
          {paymentOrder.qrUrl && !paymentOrder.isSimulated ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={paymentOrder.qrUrl}
              alt="QRIS Code Midtrans"
              className="w-40 h-40 sm:w-44 sm:h-44 object-contain rounded-lg border border-slate-200"
            />
          ) : (
            <div className="w-40 h-40 sm:w-44 sm:h-44 bg-slate-100 rounded-lg flex flex-col items-center justify-center p-2 text-center text-xs text-slate-500 font-mono border border-slate-200">
              <span className="text-2xl sm:text-3xl mb-1">📱</span>
              <span className="font-bold text-slate-800 text-xs sm:text-sm">[QRIS Otomatis]</span>
              <span className="text-[10px] text-slate-400 mt-1">Midtrans Core API</span>
              {paymentOrder.qrString && (
                <span className="text-[10px] text-emerald-700 font-medium mt-1">
                  ✓ EMVCo dikirim ke LCD TFT
                </span>
              )}
            </div>
          )}
          <span className="text-[11px] text-slate-500 leading-tight">
            {paymentOrder.isSimulated
              ? "Mode Pengujian: Klik tombol di bawah untuk simulasi bayar instan"
              : "Silakan scan kode QRIS menggunakan e-wallet atau m-banking Anda"}
          </span>
        </div>

        {/* Helper Khusus Midtrans Sandbox Simulator */}
        <div className="space-y-2 text-left bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200 text-xs">
          <span className="font-bold text-slate-800 block text-xs">
            🧪 Pengujian Simulator Midtrans:
          </span>

          {/* Opsi QRIS v2 (Rekomendasi Utama) */}
          {paymentOrder.qrUrlV2 && (
            <div className="bg-white p-2 rounded-lg border border-slate-200 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-emerald-700 text-[11px]">
                  QRIS v2 (OpenAPI / MPM)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    paymentOrder.qrUrlV2 &&
                    onCopyUrl(paymentOrder.qrUrlV2, "URL QRIS v2")
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded cursor-pointer transition-colors"
                >
                  📋 Salin URL v2
                </button>
              </div>
              <p className="text-[10px] text-slate-500 line-clamp-1 font-mono break-all select-all">
                {paymentOrder.qrUrlV2}
              </p>
              <div className="pt-1 border-t border-slate-100 flex justify-end">
                <a
                  href="https://simulator.sandbox.midtrans.com/v2/qris/index"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-emerald-700 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  Buka Simulator QRIS v2 ↗
                </a>
              </div>
            </div>
          )}

          {/* Opsi QRIS v1 Standar */}
          {paymentOrder.qrUrl && (
            <div className="bg-white p-2 rounded-lg border border-slate-200 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-blue-700 text-[11px]">QRIS v1 (Standar)</span>
                <button
                  type="button"
                  onClick={() =>
                    paymentOrder.qrUrl &&
                    onCopyUrl(paymentOrder.qrUrl, "URL QRIS v1")
                  }
                  className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded cursor-pointer transition-colors"
                >
                  📋 Salin URL v1
                </button>
              </div>
              <p className="text-[10px] text-slate-500 line-clamp-1 font-mono break-all select-all">
                {paymentOrder.qrUrl}
              </p>
              <div className="pt-1 border-t border-slate-100 flex justify-end">
                <a
                  href="https://simulator.sandbox.midtrans.com/qris/index"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-blue-700 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  Buka Simulator QRIS v1 ↗
                </a>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-400 italic">
            *Catatan: Simulator Midtrans membaca URL Gambar. Masukkan PIN simulasi 123456 jika diminta.
          </p>
        </div>

        {/* Tombol Simulasi Bayar Instan */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={onSimulate}
            disabled={simulating}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors cursor-pointer shadow-sm"
          >
            {simulating ? "Memproses..." : "✓ Bayar Lunas (Simulasi Sandbox)"}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer"
          >
            Batal / Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
