"use client";

export interface DispensingBannerProps {
  status: string; // telemetry status or deviceStatus
  dispensedMl: number;
  targetMl: number;
  onReset: () => void;
}

export default function DispensingBanner({
  status,
  dispensedMl,
  targetMl,
  onReset,
}: DispensingBannerProps) {
  return (
    <>
      {/* Banner Selesai Pengisian */}
      {status === "COMPLETED" && (
        <div className="p-3.5 sm:p-4 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <span className="text-2xl sm:text-3xl shrink-0 mt-0.5 sm:mt-0">✅</span>
            <div>
              <h3 className="font-bold text-sm sm:text-base md:text-lg">Pengisian Air Selesai!</h3>
              <p className="text-xs sm:text-sm text-emerald-800 leading-relaxed">
                Sebanyak <strong>{dispensedMl || targetMl} mL</strong> air telah terisi penuh. Silakan ambil wadah Anda. Terima kasih!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="w-full sm:w-auto px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white rounded-lg text-xs sm:text-sm font-bold shadow-xs cursor-pointer shrink-0 text-center"
          >
            Isi Lagi / Selesai
          </button>
        </div>
      )}

      {/* Banner Sedang Mengisi Air */}
      {status === "DISPENSING" && (
        <div className="p-3.5 sm:p-4 bg-blue-50 border border-blue-300 text-blue-950 rounded-xl flex items-start sm:items-center gap-2.5 sm:gap-3 shadow-xs">
          <div className="w-3.5 h-3.5 rounded-full bg-blue-600 animate-pulse shrink-0 mt-1 sm:mt-0" />
          <div>
            <h3 className="font-bold text-sm sm:text-base md:text-lg">Air Sedang Mengalir Otomatis...</h3>
            <p className="text-xs sm:text-sm text-blue-800 leading-relaxed">
              Pompa mengalirkan air dengan model debit terkalibrasi presisi. Jangan mengangkat atau menggeser wadah hingga pengisian selesai.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
