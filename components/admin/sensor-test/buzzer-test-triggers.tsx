"use client";

export interface BuzzerTestTriggersProps {
  onTestBuzzer: (pulses: number) => void;
}

export default function BuzzerTestTriggers({ onTestBuzzer }: BuzzerTestTriggersProps) {
  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
      <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
        Uji Bunyi Buzzer Manual (Diagnostic Audio)
      </h3>
      <p className="text-xs text-slate-500 leading-relaxed">
        Kirim pulsa bunyi langsung ke GPIO 27 untuk memastikan rangkaian hardware buzzer
        berfungsi sempurna
      </p>

      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 pt-1">
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
  );
}
