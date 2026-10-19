"use client";

export interface DistanceCalibrationProps {
  targetDistance: number;
  setTargetDistance: (dist: number) => void;
  onSaveConfig: () => void;
}

export default function DistanceCalibration({
  targetDistance,
  setTargetDistance,
  onSaveConfig,
}: DistanceCalibrationProps) {
  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3.5 sm:space-y-4">
      <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
        Pengaturan Jarak Deteksi Dinamis
      </h3>

      <div className="space-y-3 text-xs">
        {/* Input Slider Jarak */}
        <div>
          <div className="flex items-center justify-between font-medium text-slate-700 mb-1">
            <label htmlFor="dist-slider">Target Batas Jarak Deteksi Tumbler:</label>
            <span className="font-mono font-bold text-blue-600 text-xs sm:text-sm bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {targetDistance.toFixed(1)} cm
            </span>
          </div>
          <input
            id="dist-slider"
            type="range"
            min="3.0"
            max="30.0"
            step="0.5"
            value={targetDistance}
            onChange={(e) => setTargetDistance(parseFloat(e.target.value))}
            className="w-full cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-0.5">
            <span>Dekat (3 cm)</span>
            <span>Standar (10-12 cm)</span>
            <span>Jauh (30 cm)</span>
          </div>
        </div>

        {/* Input Angka Presisi */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 pt-1">
          <label htmlFor="dist-number" className="text-slate-600 font-medium">
            Ketik Angka Jarak Manual (cm):
          </label>
          <input
            id="dist-number"
            type="number"
            step="0.5"
            min="3"
            max="30"
            value={targetDistance}
            onChange={(e) =>
              setTargetDistance(parseFloat(e.target.value) || 12.0)
            }
            className="w-full sm:w-24 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs text-center font-bold bg-white"
          />
        </div>

        <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-[11px] leading-relaxed">
          💡 <strong>Info Kalibrasi:</strong> Saat tumbler diletakkan pada jarak di bawah angka
          ini (&le; {targetDistance.toFixed(1)} cm), dispenser mengenali tumbler telah
          terpasang dan tombol <strong>LANJUT</strong> di layar dispenser akan diizinkan.
        </div>

        {/* Tombol Simpan */}
        <button
          type="button"
          onClick={onSaveConfig}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-xs flex items-center justify-center gap-2 shadow-sm shadow-blue-200 mt-2 active:scale-95"
        >
          <span>💾</span>
          <span>Simpan Jarak ke NVS Flash ESP32</span>
        </button>
      </div>
    </div>
  );
}
