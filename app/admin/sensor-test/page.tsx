"use client";

import { useState, useEffect } from "react";
import { useIoTSocket } from "@/lib/use-iot-socket";

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

  const [targetDistance, setTargetDistance] = useState<number>(8.0);
  const [activeHigh, setActiveHigh] = useState<boolean>(true);
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
    sendSetProximityConfig(targetDistance, activeHigh);
    showFeedback(`Pengaturan tersimpan ke ESP32: Target ${targetDistance} cm (${activeHigh ? "PNP Active HIGH" : "NPN Active LOW"})`);
  };

  const isTumblerIn = !!telemetry.isTumblerPresent;
  const isAlarmOn = telemetry.buzzerAlarmEnabled !== false;
  const isBeeping = !!telemetry.isBuzzerSounding;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Uji Sensor E18-B03P1 & Buzzer
          </h1>
          <p className="text-sm text-slate-500">
            Diagnostik sinyal optik tumbler, kontrol alarm bunyi di luar jangkauan, dan kalibrasi jarak (cm)
          </p>
        </div>

        {/* Status Koneksi */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
            isConnected ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-red-50 text-red-700 border-red-300"
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            WS: {isConnected ? "Terhubung" : "Terputus"}
          </span>
          <span className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
            mqttConnected ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-amber-50 text-amber-700 border-amber-300"
          }`}>
            <span className={`w-2 h-2 rounded-full ${mqttConnected ? "bg-blue-500" : "bg-amber-500"}`} />
            MQTT: {mqttConnected ? "Aktif" : "Menghubungkan"}
          </span>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-sm font-medium animate-fade-in flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-blue-500 hover:text-blue-700 text-xs cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Baris Status Utama: Status Deteksi Tumbler & Buzzer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Status Sensor E18 */}
        <div className={`p-6 rounded-2xl border transition-all ${
          isTumblerIn
            ? "bg-emerald-50/80 border-emerald-300 shadow-emerald-100 shadow-md"
            : "bg-red-50/80 border-red-300 shadow-red-100 shadow-md"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
                Deteksi Sensor E18-B03P1
              </span>
              <h2 className={`text-2xl font-extrabold mt-1 ${isTumblerIn ? "text-emerald-800" : "text-red-800"}`}>
                {isTumblerIn ? "Wadah Masuk Jangkauan" : "Di Luar Jangkauan"}
              </h2>
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border ${
              isTumblerIn ? "bg-emerald-100 border-emerald-300 text-emerald-700" : "bg-red-100 border-red-300 text-red-700"
            }`}>
              {isTumblerIn ? "🏺" : "⚠️"}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-xs font-mono text-slate-700">
            <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 block uppercase font-sans font-semibold">Sinyal Pin GPIO 26</span>
              <span className="text-lg font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                <span className={`w-2.5 h-2.5 rounded-full ${telemetry.rawSensorSignal === 1 ? "bg-amber-500" : "bg-slate-400"}`} />
                {telemetry.rawSensorSignal !== undefined ? (
                  telemetry.rawSensorSignal === 1 ? "1 (HIGH)" : "0 (LOW)"
                ) : (isTumblerIn ? "1 (HIGH)" : "0 (LOW)")}
              </span>
            </div>
            <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 block uppercase font-sans font-semibold">Mode Polaritas</span>
              <span className="text-xs font-bold text-blue-700 block mt-1">
                {activeHigh ? "PNP (1 = Ada)" : "NPN (0 = Ada)"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const newActiveHigh = !activeHigh;
              setActiveHigh(newActiveHigh);
              sendSetProximityConfig(targetDistance, newActiveHigh);
              showFeedback(`Logika sensor dibalik menjadi: ${newActiveHigh ? "PNP (Active HIGH)" : "NPN (Active LOW)"}`);
            }}
            className="mt-3 w-full py-2 px-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <span>🔁</span>
            <span>Sinyal Terbalik? Balik Logika ({activeHigh ? "Ganti ke NPN LOW" : "Ganti ke PNP HIGH"})</span>
          </button>

          <p className="text-xs text-slate-600 mt-2">
            {isTumblerIn
              ? "✓ Tumbler terdeteksi di depan sensor. Buzzer otomatis senyap (atau bip konfirmasi)."
              : "✕ Wadah tidak terdeteksi. Buzzer membunyikan alarm jika mode ON diaktifkan."}
          </p>
        </div>

        {/* Card 2: Status Suara Buzzer */}
        <div className={`p-6 rounded-2xl border transition-all ${
          isAlarmOn
            ? isBeeping
              ? "bg-amber-50 border-amber-300 shadow-amber-100 shadow-md"
              : "bg-slate-50 border-slate-300"
            : "bg-slate-100 border-slate-200"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-slate-500">
                Status Suara Buzzer (GPIO 27)
              </span>
              <h2 className="text-2xl font-extrabold mt-1 text-slate-900">
                {isAlarmOn ? (isBeeping ? "🔊 ALARM BERBUNYI" : "🔇 SENYAP (DALAM JANGKAUAN)") : "⏸️ MODE SENYAP (OFF)"}
              </h2>
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border ${
              isBeeping
                ? "bg-amber-200 border-amber-400 text-amber-900 animate-bounce"
                : "bg-slate-200 border-slate-300 text-slate-600"
            }`}>
              {isBeeping ? "🔊" : isAlarmOn ? "🔈" : "🔇"}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-mono text-slate-600">
            <span>Mode Alarm: <strong className={isAlarmOn ? "text-emerald-700" : "text-slate-500"}>
              {isAlarmOn ? "AKTIF (ON)" : "DIMATIKAN (OFF)"}
            </strong></span>
            <span>Fisik Buzzer: <strong className={isBeeping ? "text-amber-700" : "text-slate-500"}>
              {isBeeping ? "ON (BERBUNYI)" : "OFF (MATI)"}
            </strong></span>
          </div>

          <p className="text-xs text-slate-600 mt-2">
            {isAlarmOn
              ? "Sistem memantau sensor secara aktif: bunyi saat wadah kosong, diam saat wadah ditaruh."
              : "Fitur alarm dibisukan. Buzzer tidak akan berbunyi otomatis."}
          </p>
        </div>
      </div>

      {/* Baris Tombol Kontrol Cepat: ON, OFF, RESET */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
          Kontrol Cepat Sistem Alarm & Sensor
        </h3>
        <p className="text-xs text-slate-500">
          Gunakan tombol di bawah untuk mengaktifkan, membisukan, atau menyinkronkan kembali kondisi sensor E18-B03P1
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Tombol ON */}
          <button
            type="button"
            onClick={() => {
              sendSetBuzzerAlarm(true);
              showFeedback("Alarm Bunyi DIAKTIFKAN (ON). Buzzer berbunyi jika wadah di luar jangkauan.");
            }}
            className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
              isAlarmOn
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-200 hover:bg-emerald-700"
                : "bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
            }`}
          >
            <span>▶</span>
            <span>AKTIFKAN BUNYI (ON)</span>
          </button>

          {/* Tombol OFF */}
          <button
            type="button"
            onClick={() => {
              sendSetBuzzerAlarm(false);
              showFeedback("Alarm Bunyi DIMATIKAN (OFF). Buzzer dalam mode senyap.");
            }}
            className={`py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
              !isAlarmOn
                ? "bg-red-600 text-white shadow-md shadow-red-200 hover:bg-red-700"
                : "bg-red-50 text-red-800 border border-red-300 hover:bg-red-100"
            }`}
          >
            <span>⏸</span>
            <span>MATIKAN BUNYI (OFF)</span>
          </button>

          {/* Tombol RESET */}
          <button
            type="button"
            onClick={() => {
              sendResetSensor();
              showFeedback("Sensor E18 & Buzzer berhasil di-reset ke kondisi baseline!");
            }}
            className="py-3 px-4 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-slate-300"
          >
            <span>🔄</span>
            <span>RESET SINKRONISASI</span>
          </button>
        </div>
      </div>

      {/* Pengaturan Jarak (cm) & Kalibrasi Fisik */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Form Ubah Jarak & Polaritas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Pengaturan Jarak Acuan & Sinyal
          </h3>

          <div className="space-y-3 text-xs">
            {/* Input Slider Jarak */}
            <div>
              <div className="flex items-center justify-between font-medium text-slate-700 mb-1">
                <label htmlFor="dist-slider">Target Jarak Deteksi Tumbler:</label>
                <span className="font-mono font-bold text-blue-600 text-sm bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {targetDistance.toFixed(1)} cm
                </span>
              </div>
              <input
                id="dist-slider"
                type="range"
                min="3.0"
                max="30.0"
                step="0.5"
                value={targetDistance}
                onChange={(e) => setTargetDistance(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                <span>Dekat (3 cm)</span>
                <span>Standar (8-10 cm)</span>
                <span>Jauh (30 cm)</span>
              </div>
            </div>

            {/* Input Angka Presisi */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <label htmlFor="dist-number" className="text-slate-600 font-medium">Ketik Angka Jarak Manual (cm):</label>
              <input
                id="dist-number"
                type="number"
                step="0.1"
                min="3"
                max="30"
                value={targetDistance}
                onChange={(e) => setTargetDistance(parseFloat(e.target.value) || 8.0)}
                className="w-24 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs text-center font-bold"
              />
            </div>

            {/* Pemilihan Polaritas Sinyal */}
            <div className="pt-2 border-t border-slate-100">
              <span className="text-slate-700 font-medium block mb-1.5">Tipe Sinyal Logika Sensor E18:</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveHigh(true)}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    activeHigh ? "bg-blue-50 border-blue-300 text-blue-900 font-bold" : "border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="font-semibold text-xs">PNP (Active HIGH)</div>
                  <div className="text-[10px] text-slate-500">Standar E18-B03P1</div>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveHigh(false)}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                    !activeHigh ? "bg-blue-50 border-blue-300 text-blue-900 font-bold" : "border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="font-semibold text-xs">NPN (Active LOW)</div>
                  <div className="text-[10px] text-slate-500">Model Open-Collector</div>
                </button>
              </div>
            </div>

            {/* Tombol Simpan */}
            <button
              type="button"
              onClick={handleSaveConfig}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-xs flex items-center justify-center gap-2 shadow-sm shadow-blue-200 mt-2"
            >
              <span>💾</span>
              <span>Simpan Jarak ke NVS Flash ESP32</span>
            </button>
          </div>
        </div>

        {/* Panduan Kalibrasi Trimpot Baut Putar */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3 text-xs text-slate-700">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
            <span>⚙️</span>
            <span>Panduan Kalibrasi Baut Trimpot E18</span>
          </h3>

          <p className="text-slate-600 leading-relaxed">
            Sensor E18-B03P1 memiliki <strong>baut putar (trimpot)</strong> di bagian belakang silinder. Lakukan kalibrasi fisik berikut:
          </p>

          <ol className="list-decimal pl-4 space-y-2 text-slate-600 leading-relaxed">
            <li>
              <strong>Posisikan Tumbler</strong>: Letakkan tumbler atau botol Anda pada dudukan tepat berjarak <strong>{targetDistance} cm</strong> di depan lensa sensor.
            </li>
            <li>
              <strong>Putar Baut Belakang</strong>:
              Gunakan obeng minus kecil. Putar baut searah jarum jam (CW) untuk menambah jarak atau berlawanan arah (CCW) untuk memperpendek jarak.
            </li>
            <li>
              <strong>Amati Lampu LED Sensor</strong>:
              Hentikan putaran tepat saat lampu LED merah di belakang sensor menyala dan indikator web di samping berubah menjadi <span className="font-bold text-emerald-700">"Wadah Masuk Jangkauan"</span>.
            </li>
            <li>
              <strong>Verifikasi Suara</strong>:
              Saat tumbler ditaruh $\rightarrow$ buzzer seketika senyap. Saat tumbler diangkat $\rightarrow$ buzzer berbunyi alarm.
            </li>
          </ol>
        </div>
      </div>

      {/* Uji Coba Suara Buzzer Manual */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
          Uji Bunyi Buzzer Manual (Diagnostic Audio)
        </h3>
        <p className="text-xs text-slate-500">
          Kirim pulsa bunyi langsung ke GPIO 27 untuk memastikan rangkaian hardware buzzer berfungsi sempurna
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              sendTestBuzzer(1);
              showFeedback("Mengirim perintah Bip 1x ke Buzzer...");
            }}
            className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer transition-colors"
          >
            🔔 Test Bip 1x (Sentuhan)
          </button>

          <button
            type="button"
            onClick={() => {
              sendTestBuzzer(2);
              showFeedback("Mengirim perintah Bip 2x ke Buzzer...");
            }}
            className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer transition-colors"
          >
            🔔🔔 Test Bip 2x (Sukses)
          </button>

          <button
            type="button"
            onClick={() => {
              sendTestBuzzer(3);
              showFeedback("Mengirim perintah Bip 3x ke Buzzer...");
            }}
            className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer transition-colors"
          >
            🚨 Test Bip 3x (Alarm Peringatan)
          </button>
        </div>
      </div>

      {/* Log Aktivitas MQTT Live */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            Log Aktivitas Sensor Real-Time
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            {events.length} pesan tercatat
          </span>
        </div>

        <div className="bg-slate-900 text-slate-200 p-3.5 rounded-xl font-mono text-[11px] h-40 overflow-y-auto space-y-1">
          {events.length === 0 ? (
            <div className="text-slate-500 py-4 text-center">Menunggu data sinyal dari ESP32...</div>
          ) : (
            events.map((evt, idx) => (
              <div key={idx} className="flex gap-2 leading-relaxed">
                <span className="text-slate-500 shrink-0">[{evt.timestamp.split("T")[1]?.slice(0, 8)}]</span>
                <span className="text-cyan-400 shrink-0">[{evt.eventType || evt.type}]</span>
                <span className="text-slate-300 break-all">{JSON.stringify(evt.data)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
