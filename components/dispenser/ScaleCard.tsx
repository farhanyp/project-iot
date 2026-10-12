"use client";

import React, { useState } from "react";
import {
  IconScale,
  IconRefresh,
  IconAlertTriangle,
  IconCheckCircle,
  IconChevronDown,
} from "@/components/icons";
import { TelemetryData } from "@/lib/use-iot-socket";

interface ScaleCardProps {
  deviceStatus: "READY" | "DISPENSING" | "OFFLINE";
  telemetry: TelemetryData;
  isConnected: boolean;
  currentGross: number;
  maxLimitNum: number;
  grossPercentage: number;
  tareFeedback: string | null;
  onTare: () => void;
  onReset?: () => void;
}

export function ScaleCard({
  deviceStatus,
  telemetry,
  isConnected,
  currentGross,
  maxLimitNum,
  grossPercentage,
  tareFeedback,
  onTare,
  onReset,
}: ScaleCardProps) {
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  const isDispensing = deviceStatus === "DISPENSING";
  const isScaleSaturated =
    telemetry.scaleRaw !== undefined &&
    (telemetry.scaleRaw <= -8300000 || telemetry.scaleRaw >= 8300000);

  return (
    <div className="bg-[#086288]/10 border border-[#4D8DBA]/25 rounded-2xl p-5 space-y-4 backdrop-blur-md shadow-sm">
      {/* Header and Tare / Reset Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#086288]/20 border border-[#4D8DBA]/30 flex items-center justify-center text-[#97D7FF]">
            <IconScale className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Timbangan Digital (Load Cell 5kg)
            </h3>
            <p className="text-[11px] text-[#97D7FF]/70">
              Pemantauan bobot real-time & proteksi beban berlebih
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={isDispensing || !isConnected}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-[#06121a] hover:bg-[#086288]/20 text-[#FFEFC4] border border-[#4D8DBA]/30 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-95 cursor-pointer"
              title="Reset sesi pengisian ke 0"
            >
              <span>Reset</span>
            </button>
          )}

          <button
            type="button"
            onClick={onTare}
            disabled={isDispensing || !isConnected}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#086288]/30 hover:bg-[#086288]/50 text-[#97D7FF] border border-[#4D8DBA]/40 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-95 cursor-pointer"
            title="Nol-kan timbangan platform (Tare)"
          >
            <IconRefresh className="w-3.5 h-3.5" />
            <span>Tare</span>
          </button>
        </div>
      </div>

      {/* Hardware Status & Diagnostics */}
      {isScaleSaturated ? (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[#FFEFC4] text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-[#FFEFC4]">
              <IconAlertTriangle className="w-4 h-4 shrink-0 text-[#FFEFC4]" />
              <span>ADC Saturated / Kejenuhan HX711 (Raw: {telemetry.scaleRaw})</span>
            </div>
            <button
              type="button"
              onClick={() => setShowTroubleshoot(!showTroubleshoot)}
              className="text-[11px] text-[#FFEFC4] hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <span>{showTroubleshoot ? "Tutup Panduan" : "Panduan Perbaikan"}</span>
              <IconChevronDown
                className={`w-3 h-3 transition-transform ${showTroubleshoot ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          <p className="text-[11px] text-[#FFEFC4]/80 leading-relaxed">
            Sinyal ADC tertahan di <strong>-8,388,608</strong> sehingga berat terbaca 0.0g.
          </p>

          {showTroubleshoot && (
            <div className="bg-[#06121a]/95 p-3 rounded-lg border border-[#4D8DBA]/30 text-[11px] space-y-1.5 text-slate-300 mt-2 font-sans">
              <div className="font-semibold text-white mb-1">Langkah Perbaikan:</div>
              <div className="flex items-start gap-2">
                <span className="text-[#FFEFC4] font-bold">1.</span>
                <span>
                  <strong>Pindahkan VCC HX711 ke PIN 5V (VIN ESP32)!</strong> Jangan pakai 3.3V karena tegangan referensi internal drop.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#FFEFC4] font-bold">2.</span>
                <span>
                  <strong>Cek 4 Kabel Load Cell:</strong> Merah <code className="text-[#97D7FF]">E+</code>, Hitam <code className="text-[#97D7FF]">E-</code>, Putih <code className="text-[#97D7FF]">A-</code>, Hijau <code className="text-[#97D7FF]">A+</code>.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#FFEFC4] font-bold">3.</span>
                <span>
                  <strong>Dudukan Load Cell:</strong> Pasang cantilever dengan spacer atas dan bawah agar batang dapat melengkung fleksibel.
                </span>
              </div>
            </div>
          )}
        </div>
      ) : telemetry.isScaleReady === true ? (
        <div className="p-2.5 rounded-xl bg-[#086288]/20 border border-[#4D8DBA]/35 text-[#97D7FF] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconCheckCircle className="w-4 h-4 text-[#97D7FF] shrink-0" />
            <span className="font-medium text-white">
              Sensor Normal • DT: GPIO 16, SCK: GPIO 4
            </span>
          </div>
          {telemetry.scaleRaw !== undefined && (
            <span className="text-[10px] font-mono text-[#FFEFC4] bg-[#06121a] px-2 py-0.5 rounded border border-[#4D8DBA]/40">
              Raw: {telemetry.scaleRaw}
            </span>
          )}
        </div>
      ) : (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2">
          <IconAlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-medium text-rose-200">Sensor Belum Terdeteksi</span>
            <p className="text-[11px] text-rose-300/80">
              HX711 tidak merespon di D16 & D4. Berjalan dengan estimasi waktu pompa.
            </p>
          </div>
        </div>
      )}

      {/* Main Digital Readout */}
      <div className="bg-[#06121a]/85 p-4 rounded-xl border border-[#4D8DBA]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-[#4D8DBA] font-semibold block">
            {isDispensing ? "Penambahan Netto Air" : "Beban Timbangan (Live Reading)"}
          </span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl font-black font-mono text-[#97D7FF] tracking-tight">
              {isDispensing
                ? `+${(telemetry.weightGrams ?? telemetry.dispensedMl ?? 0).toFixed(1)}`
                : `${(telemetry.currentWeight ?? 0).toFixed(1)}`}
            </span>
            <span className="text-xs font-semibold text-[#4D8DBA]">gram</span>
          </div>
        </div>

        <div className="sm:border-l sm:border-[#4D8DBA]/20 sm:pl-4 text-xs space-y-1.5">
          <div className="flex justify-between sm:justify-start gap-4 text-slate-300">
            <span className="text-[#4D8DBA]">Tara Wadah:</span>
            <span className="text-[#FFEFC4] font-mono font-medium">
              {telemetry.containerWeight !== undefined
                ? `${telemetry.containerWeight} g`
                : (telemetry.currentWeight ?? 0) > 10
                ? `${(telemetry.currentWeight ?? 0).toFixed(1)} g`
                : "0.0 g"}
            </span>
          </div>
          <div className="flex justify-between sm:justify-start gap-4 text-slate-300">
            <span className="text-[#4D8DBA]">Beban Total:</span>
            <span className="font-mono font-medium text-white">{currentGross.toFixed(1)} g</span>
          </div>
          <div className="flex justify-between sm:justify-start gap-4 text-slate-400 text-[11px]">
            <span className="text-[#4D8DBA]">Batas Maksimal:</span>
            <span className="font-mono text-[#FFEFC4] font-medium">{maxLimitNum} g</span>
          </div>
        </div>
      </div>

      {/* Capacity Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-[#4D8DBA]">
            Beban Platform:{" "}
            <span className="font-mono text-slate-200 font-medium">
              {currentGross.toFixed(1)} / {maxLimitNum} g
            </span>
          </span>
          <span
            className={`font-mono font-bold ${
              grossPercentage >= 90
                ? "text-rose-400 animate-pulse"
                : grossPercentage >= 70
                ? "text-[#FFEFC4]"
                : "text-[#97D7FF]"
            }`}
          >
            {grossPercentage}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-[#06121a] overflow-hidden border border-[#4D8DBA]/25">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              grossPercentage >= 90
                ? "bg-rose-500"
                : grossPercentage >= 70
                ? "bg-[#FFEFC4]"
                : "bg-gradient-to-r from-[#086288] via-[#4D8DBA] to-[#97D7FF]"
            }`}
            style={{ width: `${Math.min(100, Math.max(2, grossPercentage))}%` }}
          />
        </div>
      </div>

      {/* Feedback Tare / Log Indicator */}
      {(tareFeedback || telemetry.tareLog) && (
        <div className="p-2.5 rounded-lg bg-[#086288]/20 border border-[#4D8DBA]/40 text-xs text-[#97D7FF] flex items-center gap-2">
          <IconRefresh className="w-3.5 h-3.5 animate-spin shrink-0 text-[#97D7FF]" />
          <span>{tareFeedback || telemetry.tareLog}</span>
        </div>
      )}
    </div>
  );
}
