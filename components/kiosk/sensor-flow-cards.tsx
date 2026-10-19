"use client";

import Link from "next/link";

export interface SensorFlowCardsProps {
  isTumblerPresent?: boolean;
  currentDistanceCm?: number;
  targetDistanceCm?: number;
  flowRateMlPerSec?: number;
  currentVolume: number;
  deviceStatus: string;
  isConnected: boolean;
  onReset: () => void;
  feedback: string | null;
}

export default function SensorFlowCards({
  isTumblerPresent,
  currentDistanceCm,
  targetDistanceCm = 12,
  flowRateMlPerSec = 25.0,
  currentVolume,
  deviceStatus,
  isConnected,
  onReset,
  feedback,
}: SensorFlowCardsProps) {
  const activeRate = flowRateMlPerSec > 0 ? flowRateMlPerSec : 25.0;
  const lpm = ((activeRate * 60) / 1000).toFixed(2);
  const estSeconds = (currentVolume / activeRate).toFixed(1);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-5 shadow-sm">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <h2 className="font-bold text-slate-900 text-base sm:text-lg">Sensor & Model Aliran Air</h2>
        <button
          type="button"
          onClick={onReset}
          disabled={deviceStatus === "DISPENSING" || !isConnected}
          className="px-2.5 sm:px-3 py-1 sm:py-1.5 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-md text-xs sm:text-sm font-medium text-slate-800 disabled:opacity-40 cursor-pointer"
        >
          Reset Sesi
        </button>
      </div>

      {/* Card 1: Status Sensor Ultrasonik HC-SR04 */}
      <div
        className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
          isTumblerPresent
            ? "bg-emerald-50/70 border-emerald-300"
            : "bg-amber-50/70 border-amber-300"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-slate-500">
              Sensor Wadah (HC-SR04 Ultrasonik)
            </span>
            <div
              className={`text-base sm:text-xl font-extrabold mt-0.5 ${
                isTumblerPresent ? "text-emerald-800" : "text-amber-800"
              }`}
            >
              {isTumblerPresent ? "✓ Wadah Terdeteksi (Siap)" : "⚠️ Wadah Belum Diletakkan"}
            </div>
          </div>
          <span className="text-xl sm:text-2xl shrink-0">{isTumblerPresent ? "🏺" : "⏳"}</span>
        </div>
        <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-xs font-mono text-slate-700">
          <span>
            Jarak:{" "}
            <strong>
              {currentDistanceCm !== undefined
                ? `${currentDistanceCm.toFixed(1)} cm`
                : "Membaca..."}
            </strong>
          </span>
          <span className="text-slate-500">
            Target: &le; {targetDistanceCm} cm
          </span>
        </div>
      </div>

      {/* Card 2: Parameter Debit Pompa & Estimasi Waktu */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-slate-500">
              Model Debit Pompa BR314
            </span>
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-blue-700 mt-0.5">
              {activeRate.toFixed(1)}{" "}
              <span className="text-xs sm:text-sm font-normal text-slate-500">mL / detik</span>
            </div>
          </div>
          <div className="text-right text-xs font-mono text-slate-600 shrink-0">
            <div>
              Setara: <strong>{lpm} L/m</strong>
            </div>
            <div className="text-emerald-700 font-semibold mt-0.5 text-[11px] sm:text-xs">
              Terkalibrasi
            </div>
          </div>
        </div>

        <div className="bg-white p-2.5 sm:p-3 rounded-lg border border-slate-200 text-xs space-y-1 sm:space-y-1.5 font-mono">
          <div className="flex justify-between text-slate-600">
            <span>Paket Terpilih:</span>
            <strong className="text-slate-900">{currentVolume} mL</strong>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Estimasi Durasi:</span>
            <strong className="text-blue-700">{estSeconds} detik</strong>
          </div>
        </div>

        <div className="text-right">
          <Link
            href="/admin"
            className="text-[11px] sm:text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
          >
            Ubah / Kalibrasi Debit di Admin &rarr;
          </Link>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className="p-2.5 sm:p-3 bg-slate-100 border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-800 font-mono font-medium">
          {feedback}
        </div>
      )}
    </section>
  );
}
