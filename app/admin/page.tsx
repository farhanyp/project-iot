"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useIoTSocket } from "@/lib/use-iot-socket";
import MetricCards, { StatsData } from "@/components/admin/dashboard/metric-cards";
import FlowRateEngine from "@/components/admin/dashboard/flow-rate-engine";
import RecentTransactionsTable, { TransactionItem } from "@/components/admin/dashboard/recent-transactions-table";

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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Ringkasan Operasional</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
            Pemantauan pendapatan dan aktivitas transaksi otomatis
          </p>
        </div>
        <button
          type="button"
          onClick={fetchStats}
          disabled={refreshing}
          className="self-start sm:self-auto px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 shadow-xs cursor-pointer disabled:opacity-50"
        >
          {refreshing ? "Memperbarui..." : "Segarkan Data"}
        </button>
      </div>

      {/* Cards Metrik Omset & Volume */}
      <MetricCards stats={stats} />

      {/* Kartu Pengaturan & Simulator Debit Pompa Dinamis */}
      <FlowRateEngine
        isConnected={isConnected}
        inputFlowRate={inputFlowRate}
        setInputFlowRate={setInputFlowRate}
        onApplyFlowRate={handleApplyFlowRate}
        isApplyingFlow={isApplyingFlow}
        flowFeedback={flowFeedback}
        setFlowFeedback={setFlowFeedback}
        calTargetMl={calTargetMl}
        setCalTargetMl={setCalTargetMl}
        calMeasuredMl={calMeasuredMl}
        setCalMeasuredMl={setCalMeasuredMl}
        onApplyCupCalibration={handleApplyCupCalibration}
        showCupCalibrator={showCupCalibrator}
        setShowCupCalibrator={setShowCupCalibrator}
      />

      {/* Tabel Transaksi Terbaru */}
      <RecentTransactionsTable
        transactions={transactions}
        loading={loading}
        onSimulatePay={handleSimulatePay}
        simulatingId={simulatingId}
      />
    </div>
  );
}
