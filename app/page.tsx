"use client";

import { useState } from "react";
import { useIoTSocket } from "@/lib/use-iot-socket";
import { Header } from "@/components/dispenser/Header";
import { OverweightAlert } from "@/components/dispenser/OverweightAlert";
import { TankVisualizer } from "@/components/dispenser/TankVisualizer";
import { ScaleCard } from "@/components/dispenser/ScaleCard";
import { DispenseForm } from "@/components/dispenser/DispenseForm";
import { CalibrationCard } from "@/components/dispenser/CalibrationCard";
import { SystemSpecs } from "@/components/dispenser/SystemSpecs";
import { EventLogCard } from "@/components/dispenser/EventLogCard";

export default function Home() {
  const {
    isConnected,
    mqttConnected,
    deviceStatus,
    telemetry,
    events,
    sendCommand,
    sendTare,
    sendReset,
    sendCalibrate,
    sendSetCalFactor,
    sendSetMaxWeight,
  } = useIoTSocket();

  // Volume states
  const [selectedVolume, setSelectedVolume] = useState<number>(600);
  const [customVolume, setCustomVolume] = useState<string>("");

  // Calibration & Safety states
  const [knownWeight, setKnownWeight] = useState<string>("500");
  const [calFactorInput, setCalFactorInput] = useState<string>("-420.0");
  const [maxWeightLimitInput, setMaxWeightLimitInput] = useState<string>("2500");
  const [tareFeedback, setTareFeedback] = useState<string | null>(null);
  const [calFeedback, setCalFeedback] = useState<string | null>(null);
  const [maxWeightFeedback, setMaxWeightFeedback] = useState<string | null>(null);
  const [emergencyStopFeedback, setEmergencyStopFeedback] = useState<string | null>(null);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [dismissOverweightAlert, setDismissOverweightAlert] = useState<boolean>(false);

  // Sync calibration factor if ESP32 sends updated value
  const [prevCalFactor, setPrevCalFactor] = useState(telemetry.calFactor);
  if (telemetry.calFactor !== undefined && telemetry.calFactor !== prevCalFactor) {
    setPrevCalFactor(telemetry.calFactor);
    setCalFactorInput(String(telemetry.calFactor));
  }

  // Sync max weight limit if ESP32 sends updated value
  const [prevMaxWeight, setPrevMaxWeight] = useState(telemetry.maxWeightLimit);
  if (telemetry.maxWeightLimit !== undefined && telemetry.maxWeightLimit !== prevMaxWeight) {
    setPrevMaxWeight(telemetry.maxWeightLimit);
    setMaxWeightLimitInput(String(telemetry.maxWeightLimit));
  }

  // Reset alert dismiss when a new dispense cycle starts
  const [prevDeviceStatus, setPrevDeviceStatus] = useState(deviceStatus);
  if (deviceStatus !== prevDeviceStatus) {
    setPrevDeviceStatus(deviceStatus);
    if (deviceStatus === "DISPENSING") {
      setDismissOverweightAlert(false);
    }
  }

  // Calculated values
  const currentVolume = customVolume
    ? parseInt(customVolume, 10) || selectedVolume
    : selectedVolume;
  const currentPrice = `Rp ${(currentVolume * 10).toLocaleString("id-ID")}`;

  const target = telemetry.targetMl > 0 ? telemetry.targetMl : currentVolume;
  const currentDispensed = telemetry.weightGrams ?? telemetry.dispensedMl ?? 0;
  const percentage = Math.min(100, Math.round((currentDispensed / (target || 1)) * 100));

  const maxLimitNum = parseFloat(maxWeightLimitInput) || 2500;
  const currentGross =
    telemetry.grossWeight ??
    (deviceStatus === "DISPENSING"
      ? (telemetry.containerWeight || 0) + (telemetry.weightGrams || 0)
      : telemetry.currentWeight || 0);
  const grossPercentage = Math.min(100, Math.round((currentGross / maxLimitNum) * 100));

  // Action handlers
  const handleStartDispense = () => {
    const limitNum = parseFloat(maxWeightLimitInput) || 2500;
    sendCommand("START", {
      volumeMl: currentVolume,
      maxWeight: limitNum,
      deviceId: "DISPENSER-01",
    });
    setTareFeedback("Memulai pengisian: Wadah di-tare otomatis & proteksi beban aktif...");
    setTimeout(() => setTareFeedback(null), 5000);
  };

  const handleStopDispense = () => {
    sendCommand("STOP", 0, "DISPENSER-01");
    setEmergencyStopFeedback("STOP DARURAT: Perintah mematikan pompa air telah dikirim seketika!");
    setTimeout(() => setEmergencyStopFeedback(null), 6000);
  };

  const handleReset = () => {
    sendReset("DISPENSER-01");
    setEmergencyStopFeedback(null);
    setDismissOverweightAlert(true);
    setResetFeedback("Timbangan & sesi pengisian berhasil di-reset ke 0 (Siap transaksi baru)!");
    setTimeout(() => setResetFeedback(null), 5000);
  };

  const handleManualTare = () => {
    sendTare("DISPENSER-01");
    setTareFeedback("Perintah Tare terkirim. Timbangan dinolkan (0.0 g).");
    setTimeout(() => setTareFeedback(null), 4000);
  };

  const handleRunCalibration = () => {
    const weightNum = parseFloat(knownWeight);
    if (isNaN(weightNum) || weightNum <= 0) {
      setCalFeedback("Masukkan angka berat acuan yang valid (misal: 500 gram)");
      return;
    }
    sendCalibrate(weightNum, "DISPENSER-01");
    setCalFeedback(`Perintah kalibrasi untuk bobot ${weightNum} g telah dikirim ke ESP32!`);
    setTimeout(() => setCalFeedback(null), 5000);
  };

  const handleSaveCalFactor = () => {
    const factorNum = parseFloat(calFactorInput);
    if (isNaN(factorNum)) {
      setCalFeedback("Masukkan angka faktor kalibrasi yang valid (misal: -420.0)");
      return;
    }
    sendSetCalFactor(factorNum, "DISPENSER-01");
    setCalFeedback(`Faktor kalibrasi ${factorNum} berhasil disimpan di Flash ESP32.`);
    setTimeout(() => setCalFeedback(null), 5000);
  };

  const handleSaveMaxWeight = () => {
    const maxNum = parseFloat(maxWeightLimitInput);
    if (isNaN(maxNum) || maxNum <= 100) {
      setMaxWeightFeedback("Masukkan batas berat maksimal yang valid (> 100 gram, misal: 2500)");
      return;
    }
    sendSetMaxWeight(maxNum, "DISPENSER-01");
    setMaxWeightFeedback(`Batas berat maksimal ${maxNum} g berhasil disimpan ke Flash ESP32.`);
    setTimeout(() => setMaxWeightFeedback(null), 5000);
  };

  return (
    <div className="min-h-screen bg-[#060f16] text-slate-100 p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#086288] selection:text-[#FFEFC4]">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header & Connection Indicators */}
        <Header
          isConnected={isConnected}
          mqttConnected={mqttConnected}
          deviceStatus={deviceStatus}
          telemetry={telemetry}
        />

        {/* Emergency Overweight Warning Banner */}
        {telemetry.status === "STOPPED_OVERWEIGHT" && !dismissOverweightAlert && (
          <OverweightAlert
            currentGross={currentGross}
            maxLimitNum={maxLimitNum}
            onDismiss={() => setDismissOverweightAlert(true)}
          />
        )}

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Visualizer Tank & Specs */}
          <div className="lg:col-span-5 space-y-6">
            <TankVisualizer
              deviceStatus={deviceStatus}
              telemetry={telemetry}
              percentage={percentage}
              target={target}
              currentDispensed={currentDispensed}
              maxLimitNum={maxLimitNum}
              onReset={handleReset}
            />

            <SystemSpecs maxLimitNum={maxLimitNum} />
          </div>

          {/* Right Column: Scale, Dispense Form, Calibration */}
          <div className="lg:col-span-7 space-y-6">
            <ScaleCard
              deviceStatus={deviceStatus}
              telemetry={telemetry}
              isConnected={isConnected}
              currentGross={currentGross}
              maxLimitNum={maxLimitNum}
              grossPercentage={grossPercentage}
              tareFeedback={tareFeedback}
              onTare={handleManualTare}
              onReset={handleReset}
            />

            <DispenseForm
              selectedVolume={selectedVolume}
              setSelectedVolume={setSelectedVolume}
              customVolume={customVolume}
              setCustomVolume={setCustomVolume}
              maxWeightLimitInput={maxWeightLimitInput}
              setMaxWeightLimitInput={setMaxWeightLimitInput}
              currentVolume={currentVolume}
              currentPrice={currentPrice}
              maxLimitNum={maxLimitNum}
              isDispensing={deviceStatus === "DISPENSING"}
              isConnected={isConnected}
              dispenseStatus={telemetry.status}
              emergencyStopFeedback={emergencyStopFeedback}
              resetFeedback={resetFeedback}
              onStartDispense={handleStartDispense}
              onStopDispense={handleStopDispense}
              onResetDispense={handleReset}
            />

            <CalibrationCard
              isDispensing={deviceStatus === "DISPENSING"}
              knownWeight={knownWeight}
              setKnownWeight={setKnownWeight}
              calFactorInput={calFactorInput}
              setCalFactorInput={setCalFactorInput}
              maxWeightLimitInput={maxWeightLimitInput}
              setMaxWeightLimitInput={setMaxWeightLimitInput}
              calFeedback={calFeedback}
              maxWeightFeedback={maxWeightFeedback}
              onRunCalibration={handleRunCalibration}
              onSaveCalFactor={handleSaveCalFactor}
              onSaveMaxWeight={handleSaveMaxWeight}
            />
          </div>
        </div>

        {/* Bottom Stream / Telemetry Events */}
        <EventLogCard events={events} />
      </div>
    </div>
  );
}
