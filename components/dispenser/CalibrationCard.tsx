"use client";

import React, { useState } from "react";
import { IconSettings, IconChevronDown, IconCheckCircle, IconShield } from "@/components/icons";

interface CalibrationCardProps {
  isDispensing: boolean;
  knownWeight: string;
  setKnownWeight: (val: string) => void;
  calFactorInput: string;
  setCalFactorInput: (val: string) => void;
  maxWeightLimitInput: string;
  setMaxWeightLimitInput: (val: string) => void;
  calFeedback: string | null;
  maxWeightFeedback: string | null;
  onRunCalibration: () => void;
  onSaveCalFactor: () => void;
  onSaveMaxWeight: () => void;
}

export function CalibrationCard({
  isDispensing,
  knownWeight,
  setKnownWeight,
  calFactorInput,
  setCalFactorInput,
  maxWeightLimitInput,
  setMaxWeightLimitInput,
  calFeedback,
  maxWeightFeedback,
  onRunCalibration,
  onSaveCalFactor,
  onSaveMaxWeight,
}: CalibrationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"known" | "factor" | "limit">("known");

  return (
    <div className="bg-[#086288]/10 border border-[#4D8DBA]/25 rounded-2xl p-5 space-y-4 backdrop-blur-md shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#086288]/20 border border-[#4D8DBA]/30 flex items-center justify-center text-[#97D7FF]">
            <IconSettings className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Kalibrasi & Konfigurasi EEPROM ESP32
            </h3>
            <p className="text-[11px] text-[#97D7FF]/70">
              Pengaturan faktor skala & memori flash proteksi
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#086288]/30 hover:bg-[#086288]/50 text-[#97D7FF] border border-[#4D8DBA]/40 transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <span>{isOpen ? "Tutup" : "Buka Panel"}</span>
          <IconChevronDown
            className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {isOpen && (
        <div className="space-y-4 pt-2 border-t border-[#4D8DBA]/20">
          {/* Segmented Tab Header */}
          <div className="flex p-1 bg-[#06121a] rounded-xl border border-[#4D8DBA]/25 gap-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("known")}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === "known"
                  ? "bg-[#086288] text-[#FFEFC4] shadow-sm border border-[#4D8DBA]/40"
                  : "text-[#4D8DBA] hover:text-[#97D7FF]"
              }`}
            >
              Beban Acuan
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("factor")}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === "factor"
                  ? "bg-[#086288] text-[#FFEFC4] shadow-sm border border-[#4D8DBA]/40"
                  : "text-[#4D8DBA] hover:text-[#97D7FF]"
              }`}
            >
              Faktor Kalibrasi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("limit")}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === "limit"
                  ? "bg-[#086288] text-[#FFEFC4] shadow-sm border border-[#4D8DBA]/40"
                  : "text-[#4D8DBA] hover:text-[#97D7FF]"
              }`}
            >
              Batas Keamanan
            </button>
          </div>

          {/* Tab 1: Known Weight */}
          {activeTab === "known" && (
            <div className="bg-[#06121a]/85 p-4 rounded-xl border border-[#4D8DBA]/25 space-y-3">
              <div>
                <span className="text-xs font-semibold text-white">Kalibrasi Beban Acuan</span>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Letakkan beban yang pasti bobotnya di atas timbangan (cth: botol 500g), lalu klik Kalibrasi.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1">
                  <label htmlFor="known-wt" className="text-[11px] text-[#4D8DBA] block mb-1">
                    Berat Beban Acuan (gram):
                  </label>
                  <input
                    id="known-wt"
                    type="number"
                    placeholder="500"
                    value={knownWeight}
                    onChange={(e) => setKnownWeight(e.target.value)}
                    className="w-full bg-[#06121a] border border-[#4D8DBA]/35 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#97D7FF] font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={onRunCalibration}
                  disabled={isDispensing}
                  className="sm:self-end py-2 px-4 rounded-xl bg-[#086288] hover:bg-[#4D8DBA] text-[#FFEFC4] text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm border border-[#4D8DBA]/40"
                >
                  Kalibrasi Sekarang
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Calibration Factor */}
          {activeTab === "factor" && (
            <div className="bg-[#06121a]/85 p-4 rounded-xl border border-[#4D8DBA]/25 space-y-3">
              <div>
                <span className="text-xs font-semibold text-white">Faktor Kalibrasi Langsung</span>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Gunakan nilai faktor kalibrasi yang didapat dari serial monitor <code className="text-[#97D7FF]">calibration_hx711.ino</code>.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1">
                  <label htmlFor="cal-factor" className="text-[11px] text-[#4D8DBA] block mb-1">
                    Faktor Kalibrasi (calibration_factor):
                  </label>
                  <input
                    id="cal-factor"
                    type="number"
                    step="0.01"
                    placeholder="-420.0"
                    value={calFactorInput}
                    onChange={(e) => setCalFactorInput(e.target.value)}
                    className="w-full bg-[#06121a] border border-[#4D8DBA]/35 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#97D7FF] font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={onSaveCalFactor}
                  disabled={isDispensing}
                  className="sm:self-end py-2 px-4 rounded-xl bg-[#086288]/60 hover:bg-[#086288] text-white border border-[#4D8DBA]/40 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  Simpan ke Flash
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Permanent Max Weight */}
          {activeTab === "limit" && (
            <div className="bg-[#06121a]/85 p-4 rounded-xl border border-[#4D8DBA]/25 space-y-3">
              <div>
                <span className="text-xs font-semibold text-[#FFEFC4] flex items-center gap-1.5">
                  <IconShield className="w-3.5 h-3.5 text-[#FFEFC4]" />
                  <span>Batas Beban Maksimal Permanen</span>
                </span>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Tersimpan ke flash ESP32 agar tetap aktif meskipun mikrokontroler reboot atau mati lampu.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1">
                  <label htmlFor="max-weight-cfg" className="text-[11px] text-[#4D8DBA] block mb-1">
                    Batas Beban Maksimal (gram):
                  </label>
                  <input
                    id="max-weight-cfg"
                    type="number"
                    min="200"
                    max="5000"
                    step="50"
                    placeholder="2500"
                    value={maxWeightLimitInput}
                    onChange={(e) => setMaxWeightLimitInput(e.target.value)}
                    className="w-full bg-[#06121a] border border-[#4D8DBA]/35 rounded-xl px-3 py-1.5 text-xs text-[#FFEFC4] focus:outline-none focus:border-[#FFEFC4] font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={onSaveMaxWeight}
                  disabled={isDispensing}
                  className="sm:self-end py-2 px-4 rounded-xl bg-[#086288] hover:bg-[#4D8DBA] text-[#FFEFC4] border border-[#FFEFC4]/30 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  Simpan Batas Beban
                </button>
              </div>
            </div>
          )}

          {/* Feedbacks */}
          {calFeedback && (
            <div className="p-2.5 rounded-xl bg-[#086288]/20 border border-[#4D8DBA]/40 text-xs text-[#97D7FF] flex items-center gap-2">
              <IconCheckCircle className="w-4 h-4 text-[#97D7FF] shrink-0" />
              <span>{calFeedback}</span>
            </div>
          )}

          {maxWeightFeedback && (
            <div className="p-2.5 rounded-xl bg-[#086288]/30 border border-[#FFEFC4]/30 text-xs text-[#FFEFC4] flex items-center gap-2">
              <IconShield className="w-4 h-4 text-[#FFEFC4] shrink-0" />
              <span>{maxWeightFeedback}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
