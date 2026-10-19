"use client";

import Link from "next/link";

export interface KioskHeadbarProps {
  deviceCode?: string;
  isConnected: boolean;
  mqttConnected: boolean;
  deviceStatus: string;
}

export default function KioskHeadbar({
  deviceCode = "DISPENSER-01",
  isConnected,
  mqttConnected,
  deviceStatus,
}: KioskHeadbarProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 border-b border-slate-200">
      <div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            Kiosk Air Minum Otomatis
          </h1>
          <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[11px] sm:text-xs font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            {deviceCode}
          </span>
        </div>
        <p className="text-xs sm:text-sm md:text-base text-slate-600 mt-1 leading-relaxed">
          Pilih paket takaran air, bayar non-tunai via QRIS, air mengalir otomatis dengan timbangan presisi.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
        <Link
          href="/admin"
          className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-md font-semibold text-slate-700 shadow-xs active:scale-95 transition-transform"
        >
          Panel Admin ↗
        </Link>
        <span
          className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-md font-medium border ${
            isConnected
              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
              : "bg-red-50 text-red-800 border-red-300"
          }`}
        >
          WS {isConnected ? "Online" : "Offline"}
        </span>
        <span
          className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-md font-medium border ${
            mqttConnected
              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
              : "bg-amber-50 text-amber-800 border-amber-300"
          }`}
        >
          MQTT {mqttConnected ? "Online" : "Connecting"}
        </span>
        <span
          className={`px-2 py-1 sm:px-2.5 sm:py-1 rounded-md font-medium border ${
            deviceStatus === "DISPENSING"
              ? "bg-blue-50 text-blue-800 border-blue-300"
              : "bg-slate-100 text-slate-800 border-slate-300"
          }`}
        >
          ESP32: {deviceStatus}
        </span>
      </div>
    </header>
  );
}
