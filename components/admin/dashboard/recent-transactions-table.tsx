"use client";

export interface TransactionItem {
  id: string;
  orderId: string;
  volumeMl: number;
  amount: number;
  dispensedMl: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  device?: { code: string; name: string };
}

export interface RecentTransactionsTableProps {
  transactions: TransactionItem[];
  loading: boolean;
  onSimulatePay: (orderId: string) => void;
  simulatingId: string | null;
}

export function getStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700 border-emerald-300";
    case "PAID":
    case "DISPENSING":
      return "bg-blue-50 text-blue-700 border-blue-300";
    case "PENDING":
      return "bg-amber-50 text-amber-700 border-amber-300";
    case "FAILED":
    case "FAILED_AIR_HABIS":
      return "bg-red-50 text-red-700 border-red-300 font-bold";
    default:
      return "bg-slate-100 text-slate-600 border-slate-300";
  }
}

export default function RecentTransactionsTable({
  transactions,
  loading,
  onSimulatePay,
  simulatingId,
}: RecentTransactionsTableProps) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      <div className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <h2 className="font-bold text-sm sm:text-base text-slate-900">Transaksi Terbaru</h2>
        <span className="text-xs text-slate-500">
          15 Transaksi Terakhir <span className="sm:hidden text-[11px] text-blue-600 font-medium">(geser horizontal →)</span>
        </span>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs sm:text-sm text-slate-700 min-w-[560px]">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs uppercase tracking-wider">
            <tr>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Invoice / Waktu</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Perangkat</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Volume</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Nominal</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Metode</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-xs">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400 font-sans">
                  Memuat data transaksi...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400 font-sans">
                  Belum ada transaksi tercatat di database.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-sans">
                    <div className="font-bold text-slate-900 font-mono text-xs sm:text-sm">{tx.orderId}</div>
                    <div className="text-[10px] sm:text-[11px] text-slate-400">
                      {new Date(tx.createdAt).toLocaleString("id-ID")}
                    </div>
                  </td>
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-sans text-slate-600">
                    {tx.device?.code || "DISPENSER-01"}
                  </td>
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4">
                    {tx.volumeMl} mL
                    {tx.dispensedMl > 0 && (
                      <span className="text-[10px] sm:text-[11px] text-slate-400 ml-1">
                        ({tx.dispensedMl} terisi)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-bold text-slate-900">
                    Rp {tx.amount.toLocaleString("id-ID")}
                  </td>
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-sans text-slate-500">
                    {tx.paymentMethod}
                  </td>
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-center font-sans">
                    <span
                      className={`inline-block px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold border ${getStatusBadge(
                        tx.status
                      )}`}
                    >
                      {tx.status}
                    </span>
                    {tx.status === "PENDING" && (
                      <button
                        type="button"
                        onClick={() => onSimulatePay(tx.orderId)}
                        disabled={simulatingId === tx.orderId}
                        className="mt-1 block mx-auto px-2 py-0.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        title="Simulasikan pembayaran lunas untuk pengujian development"
                      >
                        {simulatingId === tx.orderId ? "..." : "⚡ Simulasi"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
