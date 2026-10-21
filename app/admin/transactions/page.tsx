"use client";

import { useEffect, useState, useCallback } from "react";
import { TransactionItem, getStatusBadge } from "@/components/admin/dashboard/recent-transactions-table";

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [simulatingId, setSimulatingId] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      setRefreshing(true);
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", "100");

      const res = await fetch(`/api/admin/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error("Gagal memuat transaksi:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  // Muat transaksi saat filter atau kata kunci berubah
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Hook WebSocket untuk auto-update transaksi real-time
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const host = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";
      ws = new WebSocket(`ws://${host}:3001`);
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "MQTT_EVENT" && (payload.eventType === "complete" || payload.eventType === "status")) {
            fetchTransactions();
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (ws) ws.close();
    };
  }, [fetchTransactions]);

  const handleSimulatePay = async (orderId: string) => {
    setSimulatingId(orderId);
    try {
      const res = await fetch("/api/payment/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchTransactions();
      } else {
        alert(data.error || "Gagal simulasi pembayaran.");
      }
    } catch {
      alert("Terjadi gangguan koneksi saat simulasi.");
    } finally {
      setSimulatingId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Title & Stats Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Daftar Transaksi Pembelian Air
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Riwayat seluruh transaksi air minum, status verifikasi QRIS, dan volume teralirkan
          </p>
        </div>

        <button
          type="button"
          onClick={fetchTransactions}
          disabled={refreshing || loading}
          className="self-start sm:self-auto px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 shadow-xs cursor-pointer disabled:opacity-50"
        >
          {refreshing ? "Memperbarui..." : "Segarkan Data"}
        </button>
      </div>

      {/* Filter Bar: Pencarian Invoice & Filter Status */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Input Search */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
              🔍
            </span>
            <input
              type="text"
              placeholder="Cari No. Order / Invoice (misal: INV-WATER)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-800 placeholder:font-sans placeholder:text-slate-400"
            />
          </div>

          {/* Filter Status */}
          <div className="flex items-center gap-2">
            <label htmlFor="tx-status-filter" className="text-xs text-slate-600 font-medium whitespace-nowrap">
              Status:
            </label>
            <select
              id="tx-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Status</option>
              <option value="COMPLETED">COMPLETED (Selesai)</option>
              <option value="PAID">PAID (Lunas)</option>
              <option value="DISPENSING">DISPENSING (Mengalir)</option>
              <option value="PENDING">PENDING (Menunggu)</option>
              <option value="FAILED">FAILED (Gagal)</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-mono self-end md:self-center">
          Ditemukan: <span className="font-bold text-slate-800">{total}</span> transaksi
        </div>
      </div>

      {/* Tabel Data Transaksi */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs sm:text-sm text-slate-700 min-w-[620px]">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs uppercase tracking-wider">
              <tr>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4">Invoice / Waktu</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4">Perangkat</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4">Volume</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4">Nominal</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4">Metode Bayar</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 font-sans">
                    Memuat data transaksi...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 font-sans">
                    Tidak ada transaksi yang cocok dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-sans">
                      <div className="font-bold text-slate-900 font-mono text-xs sm:text-sm">
                        {tx.orderId}
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-slate-400">
                        {new Date(tx.createdAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </td>
                    <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-sans text-slate-600">
                      <span className="font-semibold text-slate-800">{tx.device?.code || "DISPENSER-01"}</span>
                      {tx.device?.name && (
                        <span className="text-[10px] text-slate-400 block">{tx.device.name}</span>
                      )}
                    </td>
                    <td className="py-2.5 sm:py-3 px-3 sm:px-4">
                      <span className="font-bold text-slate-900">{tx.volumeMl} mL</span>
                      {tx.dispensedMl > 0 && (
                        <span className="text-[10px] sm:text-[11px] text-slate-500 ml-1">
                          ({tx.dispensedMl} terisi)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-bold text-slate-900 font-mono">
                      Rp {tx.amount.toLocaleString("id-ID")}
                    </td>
                    <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-sans text-slate-500">
                      {tx.paymentMethod}
                    </td>
                    <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-center font-sans">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold border ${getStatusBadge(
                          tx.status
                        )}`}
                      >
                        {tx.status}
                      </span>
                      {tx.status === "PENDING" && (
                        <button
                          type="button"
                          onClick={() => handleSimulatePay(tx.orderId)}
                          disabled={simulatingId === tx.orderId}
                          className="mt-1 block mx-auto px-2 py-0.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                          title="Simulasikan pembayaran lunas untuk pengujian development"
                        >
                          {simulatingId === tx.orderId ? "..." : "⚡ Simulasi Bayar"}
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
    </div>
  );
}
