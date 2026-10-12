import React from "react";
import { IconAlertTriangle } from "@/components/icons";

interface OverweightAlertProps {
  currentGross: number;
  maxLimitNum: number;
  onDismiss: () => void;
}

export function OverweightAlert({
  currentGross,
  maxLimitNum,
  onDismiss,
}: OverweightAlertProps) {
  return (
    <div className="relative overflow-hidden p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-md shadow-lg shadow-rose-950/20">
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
          <IconAlertTriangle className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h3 className="font-semibold text-white text-sm">
            Pompa Dihentikan Otomatis: Melebihi Batas Beban!
          </h3>
          <p className="text-xs text-rose-300/90 mt-0.5 leading-relaxed">
            Beban total pada platform mencapai{" "}
            <span className="font-mono font-bold text-[#FFEFC4] px-1.5 py-0.5 rounded bg-[#086288]/40 border border-[#4D8DBA]/40">
              {currentGross.toFixed(1)} g
            </span>
            , melampaui batas keamanan maksimal (
            <span className="font-mono font-bold text-[#FFEFC4]">{maxLimitNum} g</span>). Pompa segera
            diputus guna mencegah luapan air / kerusakan mekanikal.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="self-start sm:self-center px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors shrink-0 border border-rose-400/30 shadow-sm cursor-pointer"
      >
        Tutup
      </button>
    </div>
  );
}
