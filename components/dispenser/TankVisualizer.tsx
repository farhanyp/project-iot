import React from "react";
import { IconActivity, IconDroplet, IconShield } from "@/components/icons";
import { TelemetryData } from "@/lib/use-iot-socket";

interface TankVisualizerProps {
  deviceStatus: "READY" | "DISPENSING" | "OFFLINE";
  telemetry: TelemetryData;
  percentage: number;
  target: number;
  currentDispensed: number;
  maxLimitNum: number;
  onReset?: () => void;
}

export function TankVisualizer({
  deviceStatus,
  telemetry,
  percentage,
  target,
  currentDispensed,
  maxLimitNum,
}: TankVisualizerProps) {
  const isDispensing = deviceStatus === "DISPENSING";

  return (
    <div className="bg-[#086288]/10 border border-[#4D8DBA]/25 rounded-2xl p-6 flex flex-col items-center justify-between backdrop-blur-md relative overflow-hidden shadow-lg shadow-[#086288]/5">
      {/* Background ambient glow when dispensing */}
      {isDispensing && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#086288]/30 rounded-full blur-3xl pointer-events-none" />
      )}

      {/* Top Header Information */}
      <div className="w-full text-center space-y-2 z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#086288]/20 text-[11px] font-medium text-[#97D7FF] border border-[#4D8DBA]/30">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isDispensing
                ? "bg-[#97D7FF] animate-ping"
                : deviceStatus === "READY"
                ? "bg-[#97D7FF]"
                : "bg-slate-500"
            }`}
          />
          <span>
            {isDispensing
              ? "Air Sedang Mengalir"
              : deviceStatus === "READY"
              ? "Dispenser Siap"
              : "Menunggu ESP32"}
          </span>
        </div>

        <h2 className="text-lg font-bold text-white tracking-tight">
          Visualisasi Pengisian
        </h2>

        {/* Badges Cutoff & Safety */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-medium border ${
              telemetry.isScaleReady === true
                ? "bg-[#086288]/30 text-[#97D7FF] border-[#4D8DBA]/40"
                : "bg-amber-500/10 text-[#FFEFC4] border-amber-500/25"
            }`}
          >
            <IconDroplet className="w-3 h-3 text-[#97D7FF]" />
            <span>{telemetry.isScaleReady ? "Cut-off: Load Cell" : "Cut-off: Estimasi Waktu"}</span>
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-medium bg-[#FFEFC4]/10 text-[#FFEFC4] border border-[#FFEFC4]/25">
            <IconShield className="w-3 h-3 text-[#FFEFC4]" />
            <span>Limit: {maxLimitNum}g</span>
          </span>
        </div>
      </div>

      {/* Cylindrical Tank Visualizer */}
      <div className="my-6 relative w-44 h-60 bg-[#06121a]/90 border-2 border-[#4D8DBA]/30 rounded-3xl p-1.5 flex flex-col justify-end overflow-hidden shadow-2xl shadow-[#086288]/20 z-10">
        {/* Subtle glass reflection highlight */}
        <div className="absolute inset-y-0 left-2 w-3 bg-gradient-to-r from-white/15 to-transparent rounded-full pointer-events-none z-20" />

        {/* Tick marks */}
        <div className="absolute inset-y-0 right-3 flex flex-col justify-between py-5 text-[9px] text-[#4D8DBA] font-mono select-none pointer-events-none z-20 font-medium">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>

        {/* Liquid Water Column */}
        <div
          className="w-full bg-gradient-to-t from-[#086288] via-[#4D8DBA] to-[#97D7FF] rounded-2xl transition-all duration-300 relative flex items-center justify-center shadow-lg shadow-[#086288]/40 overflow-hidden"
          style={{ height: `${Math.max(10, percentage)}%` }}
        >
          {/* Surface wave effect when active */}
          {isDispensing && (
            <>
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
              <div className="absolute top-0 inset-x-0 h-1.5 bg-[#FFEFC4]/40 blur-[1px]" />
            </>
          )}

          <span className="text-[#060f16] font-black text-sm drop-shadow-sm z-10 font-mono bg-[#FFEFC4]/90 px-2 py-0.5 rounded-md shadow-sm">
            {percentage}%
          </span>
        </div>
      </div>

      {/* Readout Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 w-full z-10">
        <div className="bg-[#06121a]/80 p-3.5 rounded-xl border border-[#4D8DBA]/25 text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#4D8DBA] block">
            Netto Terisi
          </span>
          <div className="flex items-baseline justify-center gap-1 mt-1">
            <span className="text-2xl font-black text-[#97D7FF] font-mono tracking-tight">
              {telemetry.dispensedMl || 0}
            </span>
            <span className="text-xs font-medium text-slate-400">/ {target} mL</span>
          </div>
          <span className="text-[11px] text-[#4D8DBA] font-mono block mt-0.5">
            {currentDispensed.toFixed(1)} g
          </span>
        </div>

        <div className="bg-[#06121a]/80 p-3.5 rounded-xl border border-[#4D8DBA]/25 text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#4D8DBA] block">
            Debit Pompa
          </span>
          <div className="flex items-baseline justify-center gap-1 mt-1">
            <span className="text-2xl font-black text-[#97D7FF] font-mono tracking-tight">
              {telemetry.flowRate || 0}
            </span>
            <span className="text-xs font-medium text-slate-400">L/min</span>
          </div>
          <div className="flex items-center justify-center gap-1 text-[11px] text-[#4D8DBA] mt-0.5">
            <IconActivity className="w-3 h-3 text-[#97D7FF]" />
            <span>Pompa DC BR314</span>
          </div>
        </div>
      </div>
    </div>
  );
}
