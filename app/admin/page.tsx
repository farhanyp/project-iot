"use client";

import { useEffect, useState, useCallback } from "react";

interface StatsData {
  todayRevenue: number;
  weekRevenue: number;
  totalRevenue: number;
  totalDispensedLiters: string;
  totalTransactions: number;
}

interface TransactionItem {
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

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [simulatingId, setSimulatingId] = useState<string | null>(null);

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
        fetchStats();
      } else {
        alert(data.error || "Gagal simulasi pembayaran.");
      }
    } catch {
      alert("Terjadi error koneksi saat simulasi.");
    } finally {
      setSimulatingId(null);
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setTransactions(data.recentTransactions || []);
      }
    } catch (e) {
      console.error("Failed to load stats:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadStats = () => {
      fetch("/api/admin/stats")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (isMounted && data?.stats) {
            setStats(data.stats);
            setTransactions(data.recentTransactions || []);
            setLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) setLoading(false);
        });
    };

    loadStats();
    const interval = setInterval(loadStats, 10000);

    // Koneksi WebSocket ke IoT Gateway (FR-07: Pembaruan Metrik Real-time)
    let ws: WebSocket | null = null;
    try {
      const host = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";
      ws = new WebSocket(`ws://${host}:3001`);
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "MQTT_EVENT" && (payload.eventType === "complete" || payload.eventType === "status")) {
            loadStats();
          }
        } catch {}
      };
    } catch {}

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-700 border-emerald-300";
      case "PAID":
      case "DISPENSING":
        return "bg-blue-50 text-blue-700 border-blue-300";
      case "PENDING":
        return "bg-amber-50 text-amber-700 border-amber-300";
      default:
        return "bg-slate-100 text-slate-600 border-slate-300";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Ringkasan Operasional</h1>
          <p className="text-sm text-slate-500">Pemantauan pendapatan dan aktivitas transaksi otomatis</p>
        </div>
        <button
          type="button"
          onClick={fetchStats}
          disabled={refreshing}
          className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-xs cursor-pointer disabled:opacity-50"
        >
          {refreshing ? "Memperbarui..." : "Segarkan Data"}
        </button>
      </div>

      {/* Cards Metrik Omset & Volume */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs uppercase font-semibold text-slate-500 tracking-wider">Omset Hari Ini</span>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            Rp {(stats?.todayRevenue || 0).toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-slate-400">Dimulai sejak 00:00 WIB</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs uppercase font-semibold text-slate-500 tracking-wider">Omset 7 Hari</span>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            Rp {(stats?.weekRevenue || 0).toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-slate-400">Akumulasi minggu berjalan</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs uppercase font-semibold text-slate-500 tracking-wider">Total Pendapatan</span>
          <div className="text-2xl font-bold text-emerald-700 font-mono">
            Rp {(stats?.totalRevenue || 0).toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-slate-400">Total seluruh transaksi lunas</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs uppercase font-semibold text-slate-500 tracking-wider">Air Terjual</span>
          <div className="text-2xl font-bold text-blue-700 font-mono">
            {stats?.totalDispensedLiters || 0} <span className="text-sm font-normal text-slate-500">Liter</span>
          </div>
          <p className="text-[11px] text-slate-400">{stats?.totalTransactions || 0} total transaksi dicatat</p>
        </div>
      </div>

      {/* Tabel Transaksi Terbaru */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-base text-slate-900">Transaksi Terbaru</h2>
          <span className="text-xs text-slate-500">15 Transaksi Terakhir</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Invoice / Waktu</th>
                <th className="py-3 px-4">Perangkat</th>
                <th className="py-3 px-4">Volume</th>
                <th className="py-3 px-4">Nominal</th>
                <th className="py-3 px-4">Metode</th>
                <th className="py-3 px-4 text-center">Status</th>
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
                    <td className="py-3 px-4 font-sans">
                      <div className="font-bold text-slate-900 font-mono">{tx.orderId}</div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(tx.createdAt).toLocaleString("id-ID")}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-600">
                      {tx.device?.code || "DISPENSER-01"}
                    </td>
                    <td className="py-3 px-4">
                      {tx.volumeMl} mL
                      {tx.dispensedMl > 0 && (
                        <span className="text-[11px] text-slate-400 ml-1">({tx.dispensedMl} terisi)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      Rp {tx.amount.toLocaleString("id-ID")}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-500">
                      {tx.paymentMethod}
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadge(tx.status)}`}>
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
                          {simulatingId === tx.orderId ? "Memproses..." : "⚡ Simulasi Lunas"}
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
