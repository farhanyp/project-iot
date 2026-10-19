"use client";

import { useState, useEffect } from "react";
import { useIoTSocket } from "@/lib/use-iot-socket";
import SensorStatusCards from "@/components/admin/sensor-test/sensor-status-cards";
import AlarmControls from "@/components/admin/sensor-test/alarm-controls";
import DistanceCalibration from "@/components/admin/sensor-test/distance-calibration";
import SerialGuide from "@/components/admin/sensor-test/serial-guide";
import BuzzerTestTriggers from "@/components/admin/sensor-test/buzzer-test-triggers";

export default function SensorTestPage() {
  const {
    isConnected,
    mqttConnected,
    telemetry,
    events,
    sendSetBuzzerAlarm,
    sendResetSensor,
    sendSetProximityConfig,
    sendTestBuzzer,
  } = useIoTSocket();

  const [targetDistance, setTargetDistance] = useState<number>(12.0);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Sinkronisasi targetDistance saat menerima telemetri dari ESP32
  useEffect(() => {
    if (telemetry.targetDistanceCm !== undefined && telemetry.targetDistanceCm > 0) {
      setTargetDistance(telemetry.targetDistanceCm);
    }
  }, [telemetry.targetDistanceCm]);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleSaveConfig = () => {
    sendSetProximityConfig(targetDistance, true);
    showFeedback(`Target jarak baru tersimpan ke NVS Flash ESP32: <= ${targetDistance.toFixed(1)} cm`);
  };

  const isTumblerIn = !!telemetry.isTumblerPresent;
  const isAlarmOn = telemetry.buzzerAlarmEnabled !== false;
  const isBeeping = !!telemetry.isBuzzerSounding;
  const liveDist = telemetry.currentDistanceCm !== undefined ? telemetry.currentDistanceCm : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Status Koneksi */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Uji Sensor Ultrasonik HC-SR04 & Buzzer
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
            Diagnostik jarak fisik tumbler, kontrol alarm bunyi saat wadah kosong, dan kalibrasi jarak dinamis (cm)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-mono self-start sm:self-auto">
          <span
            className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border flex items-center gap-1 sm:gap-1.5 ${
              isConnected
                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                : "bg-red-50 text-red-700 border-red-300"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
            />
            WS: {isConnected ? "Online" : "Offline"}
          </span>
          <span
            className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border flex items-center gap-1 sm:gap-1.5 ${
              mqttConnected
                ? "bg-blue-50 text-blue-700 border-blue-300"
                : "bg-amber-50 text-amber-700 border-amber-300"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                mqttConnected ? "bg-blue-500" : "bg-amber-500"
              }`}
            />
            MQTT: {mqttConnected ? "Aktif" : "Connecting"}
          </span>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs sm:text-sm font-medium animate-fade-in flex items-center justify-between gap-2">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-blue-500 hover:text-blue-700 text-xs cursor-pointer shrink-0 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Baris Status Utama: Status Deteksi Tumbler & Buzzer */}
      <SensorStatusCards
        isTumblerIn={isTumblerIn}
        liveDist={liveDist}
        targetDistance={targetDistance}
        isAlarmOn={isAlarmOn}
        isBeeping={isBeeping}
      />

      {/* Baris Tombol Kontrol Cepat: ON, OFF, RESET */}
      <AlarmControls
        isAlarmOn={isAlarmOn}
        onTurnOn={() => {
          sendSetBuzzerAlarm(true);
          showFeedback("Alarm Bunyi DIAKTIFKAN (ON). Buzzer berbunyi jika wadah kosong / di luar jangkauan.");
        }}
        onTurnOff={() => {
          sendSetBuzzerAlarm(false);
          showFeedback("Alarm Bunyi DIMATIKAN (OFF). Buzzer dalam mode senyap.");
        }}
        onReset={() => {
          sendResetSensor();
          showFeedback("Sensor HC-SR04 & Buzzer berhasil di-reset ke kondisi baseline!");
        }}
      />

      {/* Pengaturan Jarak (cm) & Panduan Operasional */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        <DistanceCalibration
          targetDistance={targetDistance}
          setTargetDistance={setTargetDistance}
          onSaveConfig={handleSaveConfig}
        />

        <SerialGuide />
      </div>

      {/* Uji Coba Suara Buzzer Manual */}
      <BuzzerTestTriggers
        onTestBuzzer={(pulses) => {
          sendTestBuzzer(pulses);
          showFeedback(`Mengirim perintah Bip ${pulses}x ke Buzzer...`);
        }}
      />

      {/* Log Aktivitas MQTT Live */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
            Log Aktivitas Sensor Real-Time
          </h3>
          <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">
            {events.length} pesan
          </span>
        </div>

        <div className="bg-slate-900 text-slate-200 p-3 sm:p-3.5 rounded-xl font-mono text-[10px] sm:text-[11px] h-36 sm:h-40 overflow-y-auto space-y-1">
          {events.length === 0 ? (
            <div className="text-slate-500 py-4 text-center">Menunggu data sinyal dari ESP32...</div>
          ) : (
            events.map((evt, idx) => (
              <div key={idx} className="flex gap-1.5 sm:gap-2 leading-relaxed">
                <span className="text-slate-500 shrink-0">
                  [{evt.timestamp.split("T")[1]?.slice(0, 8)}]
                </span>
                <span className="text-cyan-400 shrink-0">
                  [{evt.eventType || evt.type}]
                </span>
                <span className="text-slate-300 break-all">{JSON.stringify(evt.data)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
