"use client";

export interface FlowRateEngineProps {
  isConnected: boolean;
  inputFlowRate: number;
  setInputFlowRate: (rate: number) => void;
  onApplyFlowRate: (rate: number) => void;
  isApplyingFlow: boolean;
  flowFeedback: string | null;
  setFlowFeedback: (val: string | null) => void;
  calTargetMl: number;
  setCalTargetMl: (val: number) => void;
  calMeasuredMl: number;
  setCalMeasuredMl: (val: number) => void;
  onApplyCupCalibration: () => void;
  showCupCalibrator: boolean;
  setShowCupCalibrator: (val: boolean) => void;
}

export default function FlowRateEngine({
  isConnected,
  inputFlowRate,
  setInputFlowRate,
  onApplyFlowRate,
  isApplyingFlow,
  flowFeedback,
  setFlowFeedback,
  calTargetMl,
  setCalTargetMl,
  calMeasuredMl,
  setCalMeasuredMl,
  onApplyCupCalibration,
  showCupCalibrator,
  setShowCupCalibrator,
}: FlowRateEngineProps) {
  const activeRate = inputFlowRate > 0 ? inputFlowRate : 25.0;
  const lpmEquivalent = ((activeRate * 60) / 1000).toFixed(2);
  const time100 = (100 / activeRate).toFixed(1);
  const time250 = (250 / activeRate).toFixed(1);
  const time600 = (600 / activeRate).toFixed(1);
  const time1500 = (1500 / activeRate).toFixed(1);

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      <div className="p-3.5 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-gradient-to-r from-blue-50/70 via-slate-50 to-cyan-50/50">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[11px] sm:text-xs font-bold font-mono">
              DEBIT POMPA
            </span>
            <h2 className="font-bold text-sm sm:text-base text-slate-900">
              Pengaturan Debit & Kalibrasi Pompa
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Debit Default: <strong>25.0 mL / detik</strong> (setara dengan{" "}
            <strong>1.5 Liter / menit</strong>). Ubah debit di bawah ini untuk
            menyesuaikan kecepatan dan durasi pengaliran air secara otomatis.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono self-start sm:self-auto">
          <span
            className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
              isConnected
                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
              }`}
            />
            {isConnected ? "ESP32 Terhubung" : "ESP32 Offline"}
          </span>
        </div>
      </div>

      {flowFeedback && (
        <div className="mx-3.5 sm:mx-5 mt-3 sm:mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs font-medium flex items-center justify-between gap-2">
          <span>✅ {flowFeedback}</span>
          <button
            type="button"
            onClick={() => setFlowFeedback(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs cursor-pointer font-bold shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <div className="p-3.5 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Kolom Kiri: Input Nilai Debit & Preset (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
              <label
                htmlFor="flowRateInput"
                className="text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Nilai Debit Pompa (mL / detik)
              </label>
              <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 self-start sm:self-auto">
                Setara dengan {lpmEquivalent} Liter / menit
              </span>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <input
                  id="flowRateInput"
                  type="number"
                  min="5"
                  max="100"
                  step="0.5"
                  value={inputFlowRate}
                  onChange={(e) =>
                    setInputFlowRate(Math.max(1, parseFloat(e.target.value) || 0))
                  }
                  className="w-28 sm:w-32 px-2.5 py-1.5 sm:px-3 sm:py-2 border border-slate-300 rounded-lg text-lg sm:text-xl font-bold font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
                <span className="text-xs sm:text-sm font-semibold text-slate-500">mL / detik</span>
              </div>

              <button
                type="button"
                onClick={() => onApplyFlowRate(activeRate)}
                disabled={isApplyingFlow}
                className="w-full sm:w-auto sm:ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                <span>10 mL/s</span>
                <span>25 mL/s (Std)</span>
                <span>40 mL/s</span>
                <span>60 mL/s</span>
              </div>
            </div>
          </div>

          {/* Tombol Preset Cepat */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Pilih Cepat Nilai Debit:
            </span>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {[
                { label: "15 mL/s", val: 15.0 },
                { label: "20 mL/s", val: 20.0 },
                { label: "25 mL/s (Def)", val: 25.0 },
                { label: "30 mL/s", val: 30.0 },
                { label: "35 mL/s", val: 35.0 },
                { label: "50 mL/s", val: 50.0 },
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => {
                    setInputFlowRate(preset.val);
                    onApplyFlowRate(preset.val);
                  }}
                  className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors border cursor-pointer active:scale-95 ${
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
              <span>
                {showCupCalibrator
                  ? "▼ Tutup Kalibrasi Gelas Ukur"
                  : "▶ Belum tahu debit pompa Anda? Buka Kalibrasi Gelas Ukur"}
              </span>
            </button>

            {showCupCalibrator && (
              <div className="mt-3 p-3 sm:p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  <strong>Cara Kalibrasi Nyata:</strong> Alirkan air dengan target
                  tertentu (misal 600 mL), lalu takar hasilnya menggunakan gelas ukur.
                  Sistem akan mengoreksi debit secara otomatis.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Target Volume (mL)
                    </label>
                    <input
                      type="number"
                      value={calTargetMl}
                      onChange={(e) => setCalTargetMl(Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Hasil Takar Gelas Ukur (mL)
                    </label>
                    <input
                      type="number"
                      value={calMeasuredMl}
                      onChange={(e) => setCalMeasuredMl(Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-800 bg-white"
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] font-mono text-slate-600">
                    Rekomendasi Debit Baru:{" "}
                    <strong>
                      {calTargetMl > 0
                        ? (activeRate * (calMeasuredMl / calTargetMl)).toFixed(1)
                        : 0}{" "}
                      mL/s
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={onApplyCupCalibration}
                    className="w-full sm:w-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded font-medium shadow-xs cursor-pointer text-xs"
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
              <div className="font-bold text-amber-300 text-xs sm:text-sm mb-1 tracking-wide">
                Artinya:
              </div>

              <div className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <span className="text-slate-300 text-[11px] sm:text-xs">
                  Untuk <strong>100 mL</strong>
                </span>
                <span className="font-mono text-cyan-300 font-semibold text-[11px] sm:text-xs">
                  ~<strong>{time100}</strong> detik
                </span>
              </div>

              <div className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <span className="text-slate-300 text-[11px] sm:text-xs">
                  Untuk <strong>250 mL</strong>
                </span>
                <span className="font-mono text-cyan-300 font-semibold text-[11px] sm:text-xs">
                  ~<strong>{time250}</strong> detik
                </span>
              </div>

              <div className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <span className="text-slate-300 text-[11px] sm:text-xs">
                  Untuk <strong>600 mL</strong>
                </span>
                <span className="font-mono text-cyan-300 font-semibold text-[11px] sm:text-xs">
                  ~<strong>{time600}</strong> detik
                </span>
              </div>

              <div className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <span className="text-slate-300 text-[11px] sm:text-xs">
                  Untuk <strong>1.500 mL (1.5 L)</strong>
                </span>
                <span className="font-mono text-cyan-300 font-semibold text-[11px] sm:text-xs">
                  ~<strong>{time1500}</strong> detik
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-slate-700/80 text-[10px] sm:text-[11px] text-slate-400 leading-relaxed">
            💡 Pompa ESP32 secara otomatis menyesuaikan durasi pengaliran air dan cut-off
            pompa secara presisi berdasarkan angka debit di atas.
          </div>
        </div>
      </div>
    </section>
  );
}
