"use client";

export interface PackageItem {
  id?: string;
  code: string;
  name: string;
  volumeMl: number;
  price: number;
}

export interface PackageSelectorProps {
  packages: PackageItem[];
  selectedVolume: number;
  onSelectVolume: (vol: number) => void;
  customVolume: string;
  onChangeCustomVolume: (val: string) => void;
  currentPrice: string;
  dispensed: number;
  target: number;
  flowRate: number;
  fillPct: number;
  isPaying: boolean;
  deviceStatus: string;
  isConnected: boolean;
  onInitiatePayment: () => void;
  onStartManual: () => void;
  onStop: () => void;
}

export default function PackageSelector({
  packages,
  selectedVolume,
  onSelectVolume,
  customVolume,
  onChangeCustomVolume,
  currentPrice,
  dispensed,
  target,
  flowRate,
  fillPct,
  isPaying,
  deviceStatus,
  isConnected,
  onInitiatePayment,
  onStartManual,
  onStop,
}: PackageSelectorProps) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-5 shadow-sm">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <h2 className="font-bold text-slate-900 text-base sm:text-lg">Pilih Takaran Air</h2>
        <span className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 font-mono">
          {currentPrice}
        </span>
      </div>

      {/* Preset Buttons */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {packages.map((p) => (
          <button
            key={p.volumeMl}
            type="button"
            onClick={() => onSelectVolume(p.volumeMl)}
            className={`p-2.5 sm:p-3.5 rounded-xl border text-center transition-all cursor-pointer active:scale-95 ${
              selectedVolume === p.volumeMl && !customVolume
                ? "border-blue-600 bg-blue-50 text-blue-950 font-bold ring-2 ring-blue-600 shadow-xs"
                : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
            }`}
          >
            <div className="text-[11px] sm:text-xs text-slate-600 font-medium truncate">{p.name}</div>
            <div className="text-base sm:text-xl font-bold my-0.5 sm:my-1">{p.volumeMl} mL</div>
            <div className="text-[11px] sm:text-xs font-semibold text-slate-700">
              Rp {p.price.toLocaleString("id-ID")}
            </div>
          </button>
        ))}
      </div>

      {/* Custom Input */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-sm md:text-base">
        <label htmlFor="custom-vol" className="text-slate-700 font-medium shrink-0 text-xs sm:text-sm">
          Volume Kustom:
        </label>
        <div className="relative w-full">
          <input
            id="custom-vol"
            type="number"
            min="50"
            max="5000"
            placeholder="cth: 750"
            value={customVolume}
            onChange={(e) => onChangeCustomVolume(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs sm:text-sm font-mono pointer-events-none">
            mL
          </span>
        </div>
      </div>

      {/* Pengisian & Progress */}
      <div className="bg-slate-50 p-3 sm:p-4 rounded-lg border border-slate-200 space-y-2 sm:space-y-3">
        <div className="flex justify-between items-center text-xs sm:text-sm md:text-base text-slate-700 font-mono">
          <span>
            Terisi:{" "}
            <strong className="text-slate-900 text-sm sm:text-base md:text-lg">
              {dispensed}
            </strong>{" "}
            / {target} mL
          </span>
          <span>
            Laju: <strong>{flowRate}</strong> L/min
          </span>
        </div>
        <div className="w-full h-3 sm:h-4 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-200"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="text-[11px] sm:text-xs md:text-sm text-slate-500 font-mono text-right">
          Volume terisi: {dispensed} mL ({fillPct}%)
        </div>
      </div>

      {/* Tombol Utama Pembayaran & Emergency Stop */}
      <div className="space-y-2 pt-1 sm:pt-2">
        <button
          type="button"
          onClick={onInitiatePayment}
          disabled={isPaying || deviceStatus === "DISPENSING" || !isConnected}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold py-3 sm:py-3.5 px-4 sm:px-5 rounded-lg text-base sm:text-lg transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2"
        >
          <span>💳</span>
          <span className="truncate">
            {isPaying ? "Menyiapkan Pembayaran..." : `Bayar via QRIS (${currentPrice})`}
          </span>
        </button>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onStartManual}
            disabled={deviceStatus === "DISPENSING" || !isConnected}
            className="flex-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-medium py-2 px-3 rounded-lg text-xs transition-colors border border-slate-300 cursor-pointer disabled:opacity-50"
            title="Bypass bayar (Khusus pengujian operator)"
          >
            Uji Tanpa Bayar (Manual)
          </button>

          <button
            type="button"
            onClick={onStop}
            className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer"
          >
            Stop Darurat
          </button>
        </div>
      </div>
    </section>
  );
}
