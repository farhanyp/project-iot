"use client";

import { useState } from "react";

export interface BuzzerTestTriggersProps {
  onTestBuzzer: (pulses: number) => void;
  onPlaySong?: () => void;
  onStopSong?: () => void;
}

export default function BuzzerTestTriggers({
  onTestBuzzer,
  onPlaySong,
  onStopSong,
}: BuzzerTestTriggersProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => {
    setIsPlaying(true);
    onPlaySong?.();
  };

  const handleStop = () => {
    setIsPlaying(false);
    onStopSong?.();
  };

  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div>
        <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
          Uji Bunyi Buzzer & Melodi Musik (Diagnostic Audio)
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
          Kirim pulsa nada atau putar melodi musik langsung ke GPIO 27 untuk memastikan hardware buzzer berfungsi sempurna
        </p>
      </div>

      {/* Bagian 1: Uji Pulsa Bip Standar */}
      <div>
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
          Pola Bip Sistem:
        </span>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onTestBuzzer(1)}
            className="py-2.5 sm:py-2 px-3.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer transition-colors text-center"
          >
            🔔 Test Bip 1x (Sentuhan)
          </button>

          <button
            type="button"
            onClick={() => onTestBuzzer(2)}
            className="py-2.5 sm:py-2 px-3.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer transition-colors text-center"
          >
            🔔🔔 Test Bip 2x (Sukses)
          </button>

          <button
            type="button"
            onClick={() => onTestBuzzer(3)}
            className="py-2.5 sm:py-2 px-3.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer transition-colors text-center"
          >
            🚨 Test Bip 3x (Alarm Peringatan)
          </button>
        </div>
      </div>

      {/* Bagian 2: Pemutar Melodi Lagu */}
      <div className="pt-2 border-t border-slate-100">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
          Pemutar Musik Melodi (Take on Me):
        </span>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 items-center">
          <button
            type="button"
            onClick={handlePlay}
            className={`py-2.5 sm:py-2 px-4 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-2 shadow-xs ${
              isPlaying
                ? "bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-1 animate-pulse"
                : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 active:bg-indigo-200"
            }`}
          >
            <span>▶️</span>
            <span>Putar Lagu (Take on Me)</span>
          </button>

          <button
            type="button"
            onClick={handleStop}
            className="py-2.5 sm:py-2 px-4 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 rounded-lg text-xs font-bold text-rose-700 cursor-pointer transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            <span>⏹️</span>
            <span>Hentikan Lagu</span>
          </button>

          {isPlaying && (
            <span className="text-xs font-medium text-indigo-600 flex items-center gap-1.5 animate-pulse">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
              Melodi sedang diputar pada ESP32...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
