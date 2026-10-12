"use client";

import React from "react";
import {
  IconCup,
  IconBottle,
  IconGallon,
  IconPlay,
  IconStop,
  IconShield,
  IconAlertTriangle,
} from "@/components/icons";

interface Preset {
  label: string;
  volume: number;
  price: string;
  icon: "cup" | "bottle" | "gallon";
}

interface DispenseFormProps {
  selectedVolume: number;
  setSelectedVolume: (vol: number) => void;
  customVolume: string;
  setCustomVolume: (val: string) => void;
  maxWeightLimitInput: string;
  setMaxWeightLimitInput: (val: string) => void;
  currentVolume: number;
  currentPrice: string;
  maxLimitNum: number;
  isDispensing: boolean;
  isConnected: boolean;
  dispenseStatus?: string;
  emergencyStopFeedback: string | null;
  resetFeedback?: string | null;
  onStartDispense: () => void;
  onStopDispense: () => void;
  onResetDispense?: () => void;
}

const presets: Preset[] = [
  { label: "Gelas Mini", volume: 250, price: "Rp 2.500", icon: "cup" },
  { label: "Botol Sedang", volume: 600, price: "Rp 6.000", icon: "bottle" },
  { label: "Botol Besar", volume: 1500, price: "Rp 15.000", icon: "gallon" },
];

export function DispenseForm({
  selectedVolume,
  setSelectedVolume,
  customVolume,
  setCustomVolume,
  maxWeightLimitInput,
  setMaxWeightLimitInput,
  currentVolume,
  currentPrice,
  maxLimitNum,
  isDispensing,
  isConnected,
  emergencyStopFeedback,
  resetFeedback,
  onStartDispense,
  onStopDispense,
  onResetDispense,
}: DispenseFormProps) {
  const renderPresetIcon = (type: Preset["icon"]) => {
    switch (type) {
      case "cup":
        return <IconCup className="w-5 h-5" />;
      case "bottle":
        return <IconBottle className="w-5 h-5" />;
      case "gallon":
        return <IconGallon className="w-5 h-5" />;
    }
  };

  return (
    <div className="bg-[#086288]/10 border border-[#4D8DBA]/25 rounded-2xl p-6 space-y-6 backdrop-blur-md shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">Pilih Takaran Air</h3>
          <p className="text-xs text-[#97D7FF]/70 mt-0.5">
            Tarif Rp 10 / mL • Otomatis Tare wadah & Proteksi cut-off beban
          </p>
        </div>
        <div className="flex items-center gap-1.5 self-start sm:self-auto px-3 py-1 rounded-xl bg-[#086288]/30 border border-[#4D8DBA]/40 text-[#FFEFC4] text-xs font-mono font-medium shadow-sm">
          <span className="text-[#97D7FF]">Total:</span>
          <span className="font-bold text-[#FFEFC4] text-sm">{currentPrice}</span>
        </div>
      </div>

      {/* Preset Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {presets.map((preset) => {
          const isSelected = selectedVolume === preset.volume && !customVolume;
          return (
            <button
              key={preset.volume}
              type="button"
              onClick={() => {
                setSelectedVolume(preset.volume);
                setCustomVolume("");
              }}
              className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-3 cursor-pointer ${
                isSelected
                  ? "bg-[#086288]/35 border-[#97D7FF] text-white shadow-lg shadow-[#086288]/30 scale-[1.02]"
                  : "bg-[#06121a]/70 border-[#4D8DBA]/25 hover:border-[#4D8DBA]/60 text-slate-300 hover:bg-[#086288]/15"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">{preset.label}</span>
                <div
                  className={`p-1.5 rounded-lg ${
                    isSelected
                      ? "bg-[#4D8DBA]/30 text-[#97D7FF]"
                      : "bg-[#06121a] text-[#4D8DBA]"
                  }`}
                >
                  {renderPresetIcon(preset.icon)}
                </div>
              </div>

              <div>
                <div className="text-xl font-bold font-mono tracking-tight text-[#97D7FF]">
                  {preset.volume} <span className="text-xs font-normal text-slate-400">mL</span>
                </div>
                <div className="text-xs font-semibold text-[#FFEFC4] mt-0.5">{preset.price}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom Volume & Max Weight Inputs */}
      <div className="bg-[#06121a]/85 p-4 rounded-xl border border-[#4D8DBA]/25 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="custom-vol" className="text-xs font-medium text-slate-300 block mb-1">
              Volume Kustom (mL):
            </label>
            <div className="relative">
              <input
                id="custom-vol"
                type="number"
                min="50"
                max="5000"
                placeholder="cth: 750"
                value={customVolume}
                onChange={(e) => setCustomVolume(e.target.value)}
                className="w-full bg-[#06121a] border border-[#4D8DBA]/35 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#97D7FF] font-mono transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#4D8DBA] font-mono pointer-events-none">
                mL
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="max-weight-quick"
              className="text-xs font-medium text-[#FFEFC4] block mb-1 flex items-center gap-1"
            >
              <IconShield className="w-3.5 h-3.5 text-[#FFEFC4]" />
              <span>Batas Beban Maksimal (gram):</span>
            </label>
            <div className="relative">
              <input
                id="max-weight-quick"
                type="number"
                min="200"
                max="5000"
                step="50"
                placeholder="2500"
                value={maxWeightLimitInput}
                onChange={(e) => setMaxWeightLimitInput(e.target.value)}
                className="w-full bg-[#06121a] border border-[#4D8DBA]/35 rounded-xl px-3.5 py-2 text-sm text-[#FFEFC4] placeholder-slate-600 focus:outline-none focus:border-[#FFEFC4] font-mono transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#4D8DBA] font-mono pointer-events-none">
                gram
              </span>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-300 flex items-center gap-2 pt-1 border-t border-[#4D8DBA]/15">
          <IconShield className="w-3.5 h-3.5 text-[#FFEFC4] shrink-0" />
          <span>
            Jika bobot platform (wadah + air) mencapai{" "}
            <strong className="text-[#FFEFC4] font-mono">{maxLimitNum} g</strong>, pompa air otomatis
            dimatikan untuk mencegah tumpah.
          </span>
        </div>
      </div>

      {/* Feedback Stop Darurat */}
      {emergencyStopFeedback && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-2.5 shadow-lg">
          <IconAlertTriangle className="w-5 h-5 text-rose-400 animate-pulse shrink-0" />
          <span>{emergencyStopFeedback}</span>
        </div>
      )}

      {/* Feedback Reset */}
      {resetFeedback && (
        <div className="p-3 rounded-xl bg-[#086288]/30 border border-[#4D8DBA]/40 text-[#FFEFC4] text-xs font-medium flex items-center gap-2 shadow-sm">
          <span className="text-[#97D7FF]">✓</span>
          <span>{resetFeedback}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button
          type="button"
          onClick={onStartDispense}
          disabled={isDispensing || !isConnected}
          className="flex-1 py-3.5 px-6 rounded-xl font-bold bg-gradient-to-r from-[#086288] via-[#4D8DBA] to-[#086288] hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-[#FFEFC4] shadow-lg shadow-[#086288]/30 border border-[#97D7FF]/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <IconPlay className="w-4 h-4 text-[#FFEFC4]" />
          <span>Mulai Pengisian ({currentVolume} mL / {currentVolume} g)</span>
        </button>

        {onResetDispense && (
          <button
            type="button"
            onClick={onResetDispense}
            disabled={isDispensing || !isConnected}
            className="py-3.5 px-5 rounded-xl font-semibold bg-[#06121a] hover:bg-[#086288]/30 active:bg-[#086288]/50 text-[#97D7FF] border border-[#4D8DBA]/40 shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Nol-kan timbangan dan reset sesi pengisian"
          >
            <span>Reset Sesi</span>
          </button>
        )}

        <button
          type="button"
          onClick={onStopDispense}
          className="py-3.5 px-6 rounded-xl font-bold bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-lg shadow-rose-600/20 border border-rose-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          title="Matikan pompa air seketika (Bisa ditekan kapan saja)"
        >
          <IconStop className="w-4 h-4" />
          <span>Stop Darurat</span>
        </button>
      </div>
    </div>
  );
}
