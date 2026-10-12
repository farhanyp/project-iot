import React from "react";
import { IconDroplet } from "@/components/icons";
import { TelemetryData } from "@/lib/use-iot-socket";

interface HeaderProps {
  isConnected: boolean;
  mqttConnected: boolean;
  deviceStatus: "READY" | "DISPENSING" | "OFFLINE";
  telemetry: TelemetryData;
}

export function Header({
  isConnected,
  mqttConnected,
  deviceStatus,
  telemetry,
}: HeaderProps) {
  const isScaleSaturated =
    telemetry.scaleRaw !== undefined &&
    (telemetry.scaleRaw <= -8300000 || telemetry.scaleRaw >= 8300000);

  return (
    <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-[#4D8DBA]/20">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-[#086288]/20 border border-[#4D8DBA]/40 flex items-center justify-center text-[#97D7FF] shadow-inner shadow-[#086288]/30">
          <IconDroplet className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">WaterVend IoT</h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[#086288]/30 text-[#FFEFC4] border border-[#4D8DBA]/40 font-semibold tracking-wider">
              DISPENSER-01
            </span>
          </div>
          <p className="text-xs text-[#97D7FF]/70 mt-0.5">
            Sistem Dispenser Air Presisi • Load Cell 5kg HX711 Cut-Off & Overweight Protection
          </p>
        </div>
      </div>

      {/* Connection & Telemetry Status Badges */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* WebSocket Status */}
        <div
          className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-medium transition-colors ${
            isConnected
              ? "bg-[#086288]/20 text-[#97D7FF] border-[#4D8DBA]/40"
              : "bg-rose-500/10 text-rose-300 border-rose-500/30"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? "bg-[#97D7FF] shadow-[0_0_8px_#97D7FF]"
                : "bg-rose-400"
            }`}
          />
          <span>WS Gateway</span>
        </div>

        {/* MQTT Broker Status */}
        <div
          className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-medium transition-colors ${
            mqttConnected
              ? "bg-[#086288]/20 text-[#97D7FF] border-[#4D8DBA]/40"
              : "bg-amber-500/10 text-[#FFEFC4] border-amber-500/30"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              mqttConnected
                ? "bg-[#97D7FF] shadow-[0_0_8px_#97D7FF]"
                : "bg-[#FFEFC4] animate-pulse"
            }`}
          />
          <span>MQTT Broker</span>
        </div>

        {/* Load Cell Sensor Status */}
        <div
          className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-medium transition-colors ${
            isScaleSaturated
              ? "bg-amber-500/15 text-[#FFEFC4] border-amber-500/40"
              : telemetry.isScaleReady === true
              ? "bg-[#086288]/20 text-[#97D7FF] border-[#4D8DBA]/40"
              : "bg-rose-500/10 text-rose-300 border-rose-500/30"
          }`}
          title={isScaleSaturated ? "HX711 Kejenuhan ADC (-8388608)" : undefined}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isScaleSaturated
                ? "bg-[#FFEFC4] animate-pulse"
                : telemetry.isScaleReady === true
                ? "bg-[#97D7FF] shadow-[0_0_8px_#97D7FF]"
                : "bg-rose-400 animate-pulse"
            }`}
          />
          <span>
            {isScaleSaturated
              ? "HX711 Saturated"
              : telemetry.isScaleReady === true
              ? "Load Cell Siap"
              : "Sensor Offline"}
          </span>
        </div>

        {/* ESP32 State */}
        <div
          className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 font-semibold transition-colors ${
            deviceStatus === "DISPENSING"
              ? "bg-[#4D8DBA]/25 text-[#FFEFC4] border-[#97D7FF]/50 shadow-sm shadow-[#086288]/30"
              : deviceStatus === "READY"
              ? "bg-[#086288]/25 text-[#97D7FF] border-[#4D8DBA]/40"
              : "bg-slate-900/80 text-slate-400 border-slate-800"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              deviceStatus === "DISPENSING"
                ? "bg-[#97D7FF] animate-ping"
                : deviceStatus === "READY"
                ? "bg-[#97D7FF]"
                : "bg-slate-500"
            }`}
          />
          <span>ESP32: {deviceStatus}</span>
        </div>
      </div>
    </header>
  );
}
