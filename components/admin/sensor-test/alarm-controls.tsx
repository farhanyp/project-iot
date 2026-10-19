"use client";

export interface AlarmControlsProps {
  isAlarmOn: boolean;
  onTurnOn: () => void;
  onTurnOff: () => void;
  onReset: () => void;
}

export default function AlarmControls({
  isAlarmOn,
  onTurnOn,
  onTurnOff,
  onReset,
}: AlarmControlsProps) {
  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5 sm:space-y-3">
      <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
        Kontrol Cepat Sistem Alarm & Sensor
      </h3>
      <p className="text-xs text-slate-500 leading-relaxed">
        Gunakan tombol di bawah untuk mengaktifkan, membisukan alarm, atau mereset
        pembacaan sensor ultrasonik
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-1">
        {/* Tombol ON */}
        <button
          type="button"
          onClick={onTurnOn}
          className={`py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 ${
            isAlarmOn
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-200 hover:bg-emerald-700 active:bg-emerald-800"
              : "bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 active:bg-emerald-200"
          }`}
        >
          <span>▶</span>
          <span>AKTIFKAN BUNYI (ON)</span>
        </button>

        {/* Tombol OFF */}
        <button
          type="button"
          onClick={onTurnOff}
          className={`py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 ${
            !isAlarmOn
              ? "bg-red-600 text-white shadow-md shadow-red-200 hover:bg-red-700 active:bg-red-800"
              : "bg-red-50 text-red-800 border border-red-300 hover:bg-red-100 active:bg-red-200"
          }`}
        >
          <span>⏸</span>
          <span>MATIKAN BUNYI (OFF)</span>
        </button>

        {/* Tombol RESET */}
        <button
          type="button"
          onClick={onReset}
          className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-slate-300 active:scale-95"
        >
          <span>🔄</span>
          <span>RESET SINKRONISASI</span>
        </button>
      </div>
    </div>
  );
}
