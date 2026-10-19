"use client";

export interface SensorStatusCardsProps {
  isTumblerIn: boolean;
  liveDist: number | null;
  targetDistance: number;
  isAlarmOn: boolean;
  isBeeping: boolean;
}

export default function SensorStatusCards({
  isTumblerIn,
  liveDist,
  targetDistance,
  isAlarmOn,
  isBeeping,
}: SensorStatusCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
      {/* Card 1: Status Sensor Ultrasonik HC-SR04 */}
      <div
        className={`p-4 sm:p-6 rounded-2xl border transition-all ${
          isTumblerIn
            ? "bg-emerald-50/80 border-emerald-300 shadow-emerald-100 shadow-md"
            : "bg-red-50/80 border-red-300 shadow-red-100 shadow-md"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-slate-500">
              Deteksi Sensor HC-SR04 (Ultrasonik)
            </span>
            <h2
              className={`text-lg sm:text-2xl font-extrabold mt-0.5 sm:mt-1 ${
                isTumblerIn ? "text-emerald-800" : "text-red-800"
              }`}
            >
              {isTumblerIn ? "Wadah Masuk Jangkauan" : "Di Luar Jangkauan"}
            </h2>
          </div>
          <div
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl border shrink-0 ${
              isTumblerIn
                ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                : "bg-red-100 border-red-300 text-red-700"
            }`}
          >
            {isTumblerIn ? "🏺" : "⚠️"}
          </div>
        </div>

        <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-xs font-mono text-slate-700">
          <div className="bg-white/80 p-2 sm:p-2.5 rounded-xl border border-slate-200">
            <span className="text-[9px] sm:text-[10px] text-slate-400 block uppercase font-sans font-semibold">
              Jarak Live
            </span>
            <span className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isTumblerIn ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {liveDist !== null ? `${liveDist.toFixed(1)} cm` : "Membaca..."}
            </span>
          </div>
          <div className="bg-white/80 p-2 sm:p-2.5 rounded-xl border border-slate-200">
            <span className="text-[9px] sm:text-[10px] text-slate-400 block uppercase font-sans font-semibold">
              Batas Maks
            </span>
            <span className="text-base sm:text-lg font-bold text-blue-700 block mt-0.5">
              &le; {targetDistance.toFixed(1)} cm
            </span>
          </div>
        </div>

        <p className="text-[11px] sm:text-xs text-slate-600 mt-2.5 sm:mt-3 leading-relaxed">
          {isTumblerIn
            ? "✓ Wadah terdeteksi dalam jarak jangkauan. Buzzer otomatis senyap (mati)."
            : "✕ Wadah tidak terdeteksi (kosong). Buzzer berbunyi alarm peringatan saat mode aktif."}
        </p>
      </div>

      {/* Card 2: Status Suara Buzzer */}
      <div
        className={`p-4 sm:p-6 rounded-2xl border transition-all ${
          isAlarmOn
            ? isBeeping
              ? "bg-amber-50 border-amber-300 shadow-amber-100 shadow-md"
              : "bg-slate-50 border-slate-300"
            : "bg-slate-100 border-slate-200"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider text-slate-500">
              Status Suara Buzzer (GPIO 27)
            </span>
            <h2 className="text-lg sm:text-2xl font-extrabold mt-0.5 sm:mt-1 text-slate-900">
              {isAlarmOn
                ? isBeeping
                  ? "🔊 ALARM BERBUNYI"
                  : "🔇 SENYAP (WADAH ADA)"
                : "⏸️ SENYAP (OFF)"}
            </h2>
          </div>
          <div
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl border shrink-0 ${
              isBeeping
                ? "bg-amber-200 border-amber-400 text-amber-900 animate-bounce"
                : "bg-slate-200 border-slate-300 text-slate-600"
            }`}
          >
            {isBeeping ? "🔊" : isAlarmOn ? "🔈" : "🔇"}
          </div>
        </div>

        <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-mono text-slate-600">
          <span>
            Mode:{" "}
            <strong className={isAlarmOn ? "text-emerald-700" : "text-slate-500"}>
              {isAlarmOn ? "ON" : "OFF"}
            </strong>
          </span>
          <span>
            Buzzer Fisik:{" "}
            <strong className={isBeeping ? "text-amber-700" : "text-slate-500"}>
              {isBeeping ? "BUNYI" : "MATI"}
            </strong>
          </span>
        </div>

        <p className="text-[11px] sm:text-xs text-slate-600 mt-2 sm:mt-2.5 leading-relaxed">
          {isAlarmOn
            ? "Sistem memantau ultrasonik secara aktif: berbunyi jika wadah kosong, langsung senyap saat wadah diletakkan."
            : "Fitur alarm dibisukan. Buzzer tidak akan berbunyi otomatis saat wadah kosong."}
        </p>
      </div>
    </div>
  );
}
