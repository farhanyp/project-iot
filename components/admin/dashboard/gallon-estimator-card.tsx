"use client";

import { useState } from "react";
import { GallonStats } from "./metric-cards";

export interface GallonEstimatorCardProps {
  gallon?: GallonStats;
  onResetSuccess?: () => void;
}

export default function GallonEstimatorCard({
  gallon,
  onResetSuccess,
}: GallonEstimatorCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const capacityLiters = ((gallon?.capacityMl || 19000) / 1000).toFixed(1);
  const remainingLiters = gallon?.remainingLiters || capacityLiters;
  const usedLiters = gallon?.usedLiters || "0.00";
  const percent = gallon?.remainingPercent ?? 100;

  // Status visual
  let statusBadgeColor = "bg-emerald-50 text-emerald-700 border-emerald-300";
  let statusLabel = "Volume Aman";
  let progressColor = "bg-emerald-500";

  if (percent <= 10) {
    statusBadgeColor = "bg-red-50 text-red-700 border-red-300 animate-pulse";
    statusLabel = "Kritis - Segera Ganti Galon!";
    progressColor = "bg-red-500";
  } else if (percent <= 30) {
    statusBadgeColor = "bg-amber-50 text-amber-700 border-amber-300";
    statusLabel = "Menipis - Siapkan Galon";
    progressColor = "bg-amber-500";
  }

  const handleConfirmReset = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/gallon/reset", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setFeedback("✓ Galon baru berhasil dicatat! Perhitungan di-reset ke 19 Liter.");
        setIsModalOpen(false);
        if (onResetSuccess) onResetSuccess();
        setTimeout(() => setFeedback(null), 4000);
      } else {
        alert(data.error || "Gagal mereset data galon.");
      }
    } catch {
      alert("Terjadi kendala jaringan saat memproses reset galon.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header & Aksi Reset */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-base sm:text-lg text-slate-900">
              Estimasi Sisa Air Galon
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Pelacakan kapasitas galon aktif ({capacityLiters} Liter) berdasarkan transaksi pengisian air
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
        >
          <span>🔄</span> Pasang Galon Baru
        </button>
      </div>

      {feedback && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium">
          {feedback}
        </div>
      )}

      {/* Main Stats: Sisa Liter & Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs sm:text-sm">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono">
              {remainingLiters}
            </span>
            <span className="text-sm font-medium text-slate-500">/ {capacityLiters} Liter</span>
          </div>
          <span className="font-mono font-bold text-slate-700 text-sm sm:text-base">
            {percent}% Tersisa
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Rincian Estimasi Porsi & Informasi Terakhir Ganti */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Air Terpakai
          </span>
          <div className="text-base font-bold text-slate-900 font-mono mt-0.5">
            {usedLiters} Liter
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Dari siklus galon saat ini
          </p>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Estimasi Porsi Tersisa
          </span>
          <div className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5">
            ~{gallon?.estimatedBottles600ml ?? 0} Botol (600mL) / ~{gallon?.estimatedCups200ml ?? 0} Gelas (200mL)
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Perkiraan porsi yang bisa dilayani
          </p>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Pemasangan Terakhir
          </span>
          <div className="text-xs font-semibold text-slate-800 font-mono mt-0.5 truncate">
            {gallon?.lastResetAt
              ? new Date(gallon.lastResetAt).toLocaleString("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "Belum pernah di-reset"}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Waktu operator mengganti galon
          </p>
        </div>
      </div>

      {/* Modal Dialog Konfirmasi Reset Galon */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                Konfirmasi Pasang Galon Baru
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Apakah Anda telah mengganti wadah dengan galon baru berkapasitas 19 Liter?
                Tindakan ini akan mencatat aktivitas penggantian dan me-reset sisa air kembali ke 100% (19.000 mL).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-xs font-semibold text-white shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? "Menyimpan..." : "Ya, Konfirmasi Galon Baru"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
