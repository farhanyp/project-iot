import React from "react";
import { IconSettings } from "@/components/icons";

interface SystemSpecsProps {
  maxLimitNum: number;
}

export function SystemSpecs({ maxLimitNum }: SystemSpecsProps) {
  return (
    <div className="bg-[#086288]/10 border border-[#4D8DBA]/25 rounded-2xl p-5 text-xs text-slate-300 space-y-3 backdrop-blur-md shadow-sm">
      <div className="font-semibold text-white flex items-center gap-2">
        <IconSettings className="w-4 h-4 text-[#97D7FF]" />
        <span>Spesifikasi & Konfigurasi Pinout</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="bg-[#06121a]/80 p-3 rounded-xl border border-[#4D8DBA]/20">
          <span className="text-[#4D8DBA] block text-[10px] uppercase font-bold tracking-wider">
            Sensor Beban Platform
          </span>
          <span className="text-[#97D7FF] font-medium font-mono text-[11px]">
            Load Cell 5kg + HX711 (DT: 16, SCK: 4)
          </span>
        </div>
        <div className="bg-[#06121a]/80 p-3 rounded-xl border border-[#4D8DBA]/20">
          <span className="text-[#4D8DBA] block text-[10px] uppercase font-bold tracking-wider">
            Proteksi & Safety Cut-Off
          </span>
          <span className="text-[#FFEFC4] font-medium font-mono text-[11px]">
            Auto-Tare + Overweight ({maxLimitNum}g)
          </span>
        </div>
      </div>
    </div>
  );
}
