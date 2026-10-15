"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useIoTSocket } from "@/lib/use-iot-socket";

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

  // Hook IoT WebSocket untuk Kontrol Debit & Kalibrasi Real-time
  const {
    isConnected,
    telemetry,
    sendSetFlowRate,
    sendCalibratePump,
  } = useIoTSocket();

  const [inputFlowRate, setInputFlowRate] = useState<number>(25.0);
  const [calTargetMl, setCalTargetMl] = useState<number>(600);
  const [calMeasuredMl, setCalMeasuredMl] = useState<number>(600);
  const [flowFeedback, setFlowFeedback] = useState<string | null>(null);
  const [showCupCalibrator, setShowCupCalibrator] = useState<boolean>(false);
  const [isApplyingFlow, setIsApplyingFlow] = useState<boolean>(false);

  // Sinkronkan nilai debit awal dari ESP32 saat pertama kali terhubung
  const hasSyncedInitialFlow = useRef(false);
  useEffect(() => {
    if (!hasSyncedInitialFlow.current && telemetry.flowRateMlPerSec && telemetry.flowRateMlPerSec > 0) {
      setInputFlowRate(telemetry.flowRateMlPerSec);
      hasSyncedInitialFlow.current = true;
    }
  }, [telemetry.flowRateMlPerSec]);

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

  const handleApplyFlowRate = (rate: number) => {
    setIsApplyingFlow(true);
    sendSetFlowRate(rate);
    const lpm = ((rate * 60) / 1000).toFixed(2);
    setFlowFeedback(`Debit baru ${rate.toFixed(1)} mL/detik (~${lpm} Liter/menit) berhasil dikirim dan disimpan ke NVS Flash ESP32!`);
    setTimeout(() => {
      setIsApplyingFlow(false);
      setFlowFeedback(null);
    }, 4500);
  };

  const handleApplyCupCalibration = () => {
    if (calTargetMl <= 0 || calMeasuredMl <= 0) return;
    const currentRate = inputFlowRate > 0 ? inputFlowRate : 25.0;
    const newRate = Math.round((currentRate * (calMeasuredMl / calTargetMl)) * 10) / 10;
    sendCalibratePump(calTargetMl, calMeasuredMl);
    setInputFlowRate(newRate);
    const lpm = ((newRate * 60) / 1000).toFixed(2);
    setFlowFeedback(`Hasil takar ${calMeasuredMl} mL dari target ${calTargetMl} mL diterapkan. Debit baru: ${newRate.toFixed(1)} mL/detik (~${lpm} Liter/menit).`);
    setShowCupCalibrator(false);
    setTimeout(() => setFlowFeedback(null), 4500);
  };

  const activeRate = inputFlowRate > 0 ? inputFlowRate : 25.0;
  const lpmEquivalent = ((activeRate * 60) / 1000).toFixed(2);
  const time100 = (100 / activeRate).toFixed(1);
  const time250 = (250 / activeRate).toFixed(1);
  const time600 = (600 / activeRate).toFixed(1);
  const time1500 = (1500 / activeRate).toFixed(1);

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

      {/* Kartu Pengaturan & Simulator Debit Pompa Dinamis */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-blue-50/70 via-slate-50 to-cyan-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs font-bold font-mono">DEBIT POMPA</span>
              <h2 className="font-bold text-base text-slate-900">Pengaturan Debit & Kalibrasi Pompa Dinamis</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Debit Default: <strong>25.0 mL / detik</strong> (setara dengan <strong>1.5 Liter / menit</strong>). Ubah debit di bawah ini untuk menyesuaikan kecepatan dan durasi pengaliran air secara otomatis.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
              isConnected ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-slate-100 text-slate-600 border-slate-200"
            }`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
              {isConnected ? "ESP32 Terhubung" : "ESP32 Offline"}
            </span>
          </div>
        </div>

        {flowFeedback && (
          <div className="mx-4 sm:mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs font-medium flex items-center justify-between">
            <span>✅ {flowFeedback}</span>
            <button type="button" onClick={() => setFlowFeedback(null)} className="text-emerald-700 hover:text-emerald-900 text-xs cursor-pointer font-bold">✕</button>
          </div>
        )}

        <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Kolom Kiri: Input Nilai Debit & Preset (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="flowRateInput" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Nilai Debit Pompa (mL / detik)
                </label>
                <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Setara dengan {lpmEquivalent} Liter / menit
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="flowRateInput"
                  type="number"
                  min="5"
                  max="100"
                  step="0.5"
                  value={inputFlowRate}
                  onChange={(e) => setInputFlowRate(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-xl font-bold font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
                <span className="text-sm font-semibold text-slate-500">mL / detik</span>

                <button
                  type="button"
                  onClick={() => handleApplyFlowRate(activeRate)}
                  disabled={isApplyingFlow}
                  className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isApplyingFlow ? "Menyimpan..." : "💾 Terapkan ke Mesin"}
                </button>
              </div>

              {/* Slider Cepat */}
              <div className="mt-3">
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="0.5"
                  value={inputFlowRate}
                  onChange={(e) => setInputFlowRate(parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                  <span>10 mL/s (Lambat)</span>
                  <span>25 mL/s (Standar)</span>
                  <span>40 mL/s (Cepat)</span>
                  <span>60 mL/s (Tinggi)</span>
                </div>
              </div>
            </div>

            {/* Tombol Preset Cepat */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Pilih Cepat Nilai Debit:
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "15 mL/s (0.9 L/m)", val: 15.0 },
                  { label: "20 mL/s (1.2 L/m)", val: 20.0 },
                  { label: "25 mL/s (Default 1.5 L/m)", val: 25.0 },
                  { label: "30 mL/s (1.8 L/m)", val: 30.0 },
                  { label: "35 mL/s (2.1 L/m)", val: 35.0 },
                  { label: "50 mL/s (3.0 L/m)", val: 50.0 },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() => {
                      setInputFlowRate(preset.val);
                      handleApplyFlowRate(preset.val);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors border cursor-pointer ${
                      Math.abs(inputFlowRate - preset.val) < 0.1
                        ? "bg-blue-100 border-blue-400 text-blue-800 font-bold"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggle Panduan Kalibrasi Gelas Ukur */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCupCalibrator(!showCupCalibrator)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>{showCupCalibrator ? "▼ Tutup Kalibrasi Gelas Ukur" : "▶ Belum tahu debit pompa Anda? Buka Kalibrasi Gelas Ukur"}</span>
              </button>

              {showCupCalibrator && (
                <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                  <p className="text-slate-600">
                    <strong>Cara Kalibrasi Nyata:</strong> Alirkan air dengan target tertentu (misal 600 mL), lalu takar hasilnya menggunakan gelas ukur. Sistem akan mengoreksi debit secara otomatis.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Target Volume (mL)</label>
                      <input
                        type="number"
                        value={calTargetMl}
                        onChange={(e) => setCalTargetMl(Number(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">Hasil Takar Gelas Ukur (mL)</label>
                      <input
                        type="number"
                        value={calMeasuredMl}
                        onChange={(e) => setCalMeasuredMl(Number(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] font-mono text-slate-600">
                      Rekomendasi Debit Baru: <strong>{calTargetMl > 0 ? (activeRate * (calMeasuredMl / calTargetMl)).toFixed(1) : 0} mL/s</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyCupCalibration}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded font-medium shadow-xs cursor-pointer text-xs"
                    >
                      Hitung & Simpan Kalibrasi
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Kolom Kanan: Output Simulasi Waktu Pengisian (5 cols) */}
          <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 sm:p-5 rounded-xl flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between border-b border-slate-700 pb-2.5 mb-3">
                <span className="text-xs uppercase font-bold tracking-wider text-cyan-400">
                  Simulasi Waktu Pengisian Air
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                  {activeRate.toFixed(1)} mL/detik
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="font-bold text-amber-300 text-sm mb-1 tracking-wide">
                  Artinya:
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                  <span className="text-slate-300">Untuk <strong>100 mL</strong></span>
                  <span className="font-mono text-cyan-300 font-semibold">butuh waktu sekitar <strong>{time100}</strong> detik.</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                  <span className="text-slate-300">Untuk <strong>250 mL</strong></span>
                  <span className="font-mono text-cyan-300 font-semibold">butuh waktu sekitar <strong>{time250}</strong> detik.</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                  <span className="text-slate-300">Untuk <strong>600 mL</strong></span>
                  <span className="font-mono text-cyan-300 font-semibold">butuh waktu sekitar <strong>{time600}</strong> detik.</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                  <span className="text-slate-300">Untuk <strong>1.500 mL (1.5 L)</strong></span>
                  <span className="font-mono text-cyan-300 font-semibold">butuh waktu sekitar <strong>{time1500}</strong> detik.</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-700/80 text-[11px] text-slate-400">
              💡 Pompa ESP32 secara otomatis menyesuaikan durasi pengaliran air dan cut-off pompa secara presisi berdasarkan angka debit di atas.
            </div>
          </div>
        </div>
      </section>

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
