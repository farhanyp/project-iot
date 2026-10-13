"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useIoTSocket } from "@/lib/use-iot-socket";

interface PackageItem {
  id?: string;
  code: string;
  name: string;
  volumeMl: number;
  price: number;
}

interface PaymentOrder {
  orderId: string;
  amount: number;
  volumeMl: number;
  snapToken?: string;
  qrString?: string;
  qrUrl?: string;
  qrUrlV2?: string;
  paymentMode?: string;
  isSimulated: boolean;
}

const DEFAULT_PACKAGES: PackageItem[] = [
  { code: "CUP_250ML", name: "Gelas Mini", volumeMl: 250, price: 2500 },
  { code: "BOTTLE_600ML", name: "Botol Sedang", volumeMl: 600, price: 6000 },
  { code: "GALLON_1500ML", name: "Botol Besar", volumeMl: 1500, price: 15000 },
];

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

  // Daftar paket dinamis dari database (fallback ke DEFAULT_PACKAGES)
  const [packages, setPackages] = useState<PackageItem[]>(DEFAULT_PACKAGES);
  const [selectedVolume, setSelectedVolume] = useState<number>(600);
  const [customVolume, setCustomVolume] = useState<string>("");
  const [knownWeight, setKnownWeight] = useState<string>("500");
  const [calFactorInput, setCalFactorInput] = useState<string>("-420.0");
  const [maxWeightLimitInput, setMaxWeightLimitInput] = useState<string>("2500");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dismissAlert, setDismissAlert] = useState<boolean>(false);

  // State Pembayaran Midtrans QRIS
  const [isPaying, setIsPaying] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Muat daftar paket aktif dari database
  useEffect(() => {
    fetch("/api/packages")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.packages) && data.packages.length > 0) {
          setPackages(data.packages);
        }
      })
      .catch((err) => {
        console.warn("Gagal memuat paket dari server, memakai fallback lokal:", err);
      });
  }, []);

  // Sync telemetri ESP32 saat render
  const [prevCal, setPrevCal] = useState(telemetry.calFactor);
  if (telemetry.calFactor !== undefined && telemetry.calFactor !== prevCal) {
    setPrevCal(telemetry.calFactor);
    setCalFactorInput(String(telemetry.calFactor));
  }

  const [prevLimit, setPrevLimit] = useState(telemetry.maxWeightLimit);
  if (telemetry.maxWeightLimit !== undefined && telemetry.maxWeightLimit !== prevLimit) {
    setPrevLimit(telemetry.maxWeightLimit);
    setMaxWeightLimitInput(String(telemetry.maxWeightLimit));
  }

  const [prevStatus, setPrevStatus] = useState(deviceStatus);
  if (deviceStatus !== prevStatus) {
    setPrevStatus(deviceStatus);
    if (deviceStatus === "DISPENSING") {
      setDismissAlert(false);
      // Jika pompa mulai mengalir, tutup modal pembayaran jika masih terbuka
      if (paymentOrder) setPaymentOrder(null);
    }
  }

  const currentVolume = customVolume ? parseInt(customVolume, 10) || selectedVolume : selectedVolume;
  const matchedPreset = packages.find((p) => p.volumeMl === currentVolume);
  const currentPriceAmount = matchedPreset ? matchedPreset.price : Math.round(currentVolume * 10);
  const currentPrice = `Rp ${currentPriceAmount.toLocaleString("id-ID")}`;

  const target = telemetry.targetMl > 0 ? telemetry.targetMl : currentVolume;
  const dispensed = telemetry.weightGrams ?? telemetry.dispensedMl ?? 0;
  const fillPct = Math.min(100, Math.round((dispensed / (target || 1)) * 100));

  const maxLimit = parseFloat(maxWeightLimitInput) || 2500;
  const gross = telemetry.grossWeight ?? (
    deviceStatus === "DISPENSING"
      ? (telemetry.containerWeight || 0) + (telemetry.weightGrams || 0)
      : telemetry.currentWeight || 0
  );
  const grossPct = Math.min(100, Math.round((gross / maxLimit) * 100));

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  // Polling Status Pembayaran saat Modal QRIS Terbuka
  useEffect(() => {
    if (!paymentOrder) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status?orderId=${paymentOrder.orderId}`);
        if (res.ok) {
          const data = await res.json();
          const status = data.transaction?.status;
          if (status === "PAID" || status === "DISPENSING" || status === "COMPLETED") {
            showFeedback("Pembayaran lunas! Air mulai mengalir ke wadah...");
            setPaymentOrder(null);
          }
        }
      } catch (e) {
        console.error("Error polling payment status:", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [paymentOrder]);

  // Alur Beli Air QRIS
  const handleInitiatePayment = async () => {
    setIsPaying(true);
    try {
      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          volumeMl: currentVolume,
          deviceId: "DISPENSER-01",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat pesanan.");

      setPaymentOrder({
        orderId: data.orderId,
        amount: data.amount,
        volumeMl: data.volumeMl,
        snapToken: data.snapToken,
        qrString: data.qrString,
        qrUrl: data.qrUrl,
        qrUrlV2: data.qrUrlV2,
        paymentMode: data.paymentMode,
        isSimulated: data.isSimulated,
      });
    } catch (e: unknown) {
      showFeedback(e instanceof Error ? e.message : "Gagal membuat sesi pembayaran.");
    } finally {
      setIsPaying(false);
    }
  };

  // Simulasi Bayar Instan (Dev/Sandbox testing)
  const handleSimulatePayment = async () => {
    if (!paymentOrder) return;
    setSimulating(true);
    try {
      const res = await fetch("/api/payment/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: paymentOrder.orderId }),
      });
      const data = await res.json();
      if (res.ok) {
        showFeedback(data.message || "Pembayaran diverifikasi! Pompa menyala.");
        setPaymentOrder(null);
      } else {
        showFeedback(data.error || "Gagal memproses simulasi.");
      }
    } catch {
      showFeedback("Terjadi kesalahan saat simulasi pembayaran.");
    } finally {
      setSimulating(false);
    }
  };

  const handleStartManual = () => {
    sendCommand("START", { volumeMl: currentVolume, maxWeight: maxLimit, deviceId: "DISPENSER-01" });
    showFeedback("Pengisian manual dimulai.");
  };

  const handleStop = () => {
    sendCommand("STOP", 0, "DISPENSER-01");
    showFeedback("Pompa dimatikan.");
  };

  const handleTare = () => {
    sendTare("DISPENSER-01");
    showFeedback("Timbangan dinolkan (Tare).");
  };

  const handleReset = () => {
    sendReset("DISPENSER-01");
    setDismissAlert(true);
    showFeedback("Sesi & timbangan di-reset.");
  };

  const handleCalibrate = () => {
    const val = parseFloat(knownWeight);
    if (!val || val <= 0) return showFeedback("Berat acuan tidak valid.");
    sendCalibrate(val, "DISPENSER-01");
    showFeedback(`Kalibrasi ${val}g dikirim.`);
  };

  const handleSaveFactor = () => {
    const val = parseFloat(calFactorInput);
    if (isNaN(val)) return showFeedback("Faktor kalibrasi tidak valid.");
    sendSetCalFactor(val, "DISPENSER-01");
    showFeedback(`Faktor ${val} disimpan.`);
  };

  const handleSaveMax = () => {
    const val = parseFloat(maxWeightLimitInput);
    if (!val || val <= 100) return showFeedback("Batas beban tidak valid.");
    sendSetMaxWeight(val, "DISPENSER-01");
    showFeedback(`Batas ${val}g disimpan.`);
  };

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header & Status */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Kiosk Air Minum Otomatis</h1>
            <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              DISPENSER-01
            </span>
          </div>
          <p className="text-sm md:text-base text-slate-600 mt-1">
            Pilih paket takaran air, bayar non-tunai via QRIS, air mengalir otomatis dengan timbangan presisi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/admin"
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-md font-semibold text-slate-700 text-xs shadow-xs"
          >
            Panel Admin ↗
          </Link>
          <span className={`px-2.5 py-1 rounded-md font-medium border ${isConnected ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-red-50 text-red-800 border-red-300"}`}>
            WS {isConnected ? "Online" : "Offline"}
          </span>
          <span className={`px-2.5 py-1 rounded-md font-medium border ${mqttConnected ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-amber-50 text-amber-800 border-amber-300"}`}>
            MQTT {mqttConnected ? "Online" : "Connecting"}
          </span>
          <span className={`px-2.5 py-1 rounded-md font-medium border ${deviceStatus === "DISPENSING" ? "bg-blue-50 text-blue-800 border-blue-300" : "bg-slate-100 text-slate-800 border-slate-300"}`}>
            ESP32: {deviceStatus}
          </span>
        </div>
      </header>

      {/* Banner Selesai Pengisian */}
      {telemetry.status === "COMPLETED" && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl flex items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✅</span>
            <div>
              <h3 className="font-bold text-base md:text-lg">Pengisian Air Selesai!</h3>
              <p className="text-sm text-emerald-800">
                Sebanyak <strong>{telemetry.dispensedMl || target} mL</strong> air telah terisi penuh. Silakan ambil wadah Anda. Terima kasih!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-bold shadow-xs cursor-pointer shrink-0"
          >
            Isi Lagi / Selesai
          </button>
        </div>
      )}

      {/* Banner Sedang Mengisi Air */}
      {deviceStatus === "DISPENSING" && (
        <div className="p-4 bg-blue-50 border border-blue-300 text-blue-950 rounded-xl flex items-center gap-3 shadow-xs">
          <div className="w-3.5 h-3.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
          <div>
            <h3 className="font-bold text-base md:text-lg">Air Sedang Mengalir Otomatis...</h3>
            <p className="text-sm text-blue-800">
              Sensor beban memantau volume secara presisi. Jangan mengangkat atau menggeser wadah hingga pengisian selesai.
            </p>
          </div>
        </div>
      )}

      {/* Alert Overweight */}
      {telemetry.status === "STOPPED_OVERWEIGHT" && !dismissAlert && (
        <div className="p-4 bg-red-50 border border-red-300 text-red-900 rounded-lg text-base flex items-center justify-between gap-3">
          <span>Beban platform (<strong>{gross.toFixed(1)}g</strong>) melebihi batas aman (<strong>{maxLimit}g</strong>). Pompa dimatikan otomatis.</span>
          <button type="button" onClick={() => setDismissAlert(true)} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 rounded font-semibold text-sm cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Kolom Kiri: Pilihan Paket & Beli Air */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="font-bold text-slate-900 text-lg">Pilih Takaran Air</h2>
            <span className="text-xl md:text-2xl font-bold text-slate-900 font-mono">{currentPrice}</span>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-3 gap-3">
            {packages.map((p) => (
              <button
                key={p.volumeMl}
                type="button"
                onClick={() => { setSelectedVolume(p.volumeMl); setCustomVolume(""); }}
                className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                  selectedVolume === p.volumeMl && !customVolume
                    ? "border-blue-600 bg-blue-50 text-blue-950 font-bold ring-2 ring-blue-600 shadow-xs"
                    : "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
                }`}
              >
                <div className="text-xs text-slate-600 font-medium">{p.name}</div>
                <div className="text-xl font-bold my-1">{p.volumeMl} mL</div>
                <div className="text-xs font-semibold text-slate-700">Rp {p.price.toLocaleString("id-ID")}</div>
              </button>
            ))}
          </div>

          {/* Custom Input */}
          <div className="flex items-center gap-3 text-sm md:text-base">
            <label htmlFor="custom-vol" className="text-slate-700 font-medium shrink-0">Volume Kustom:</label>
            <div className="relative w-full">
              <input
                id="custom-vol"
                type="number"
                min="50"
                max="5000"
                placeholder="cth: 750"
                value={customVolume}
                onChange={(e) => setCustomVolume(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-mono pointer-events-none">mL</span>
            </div>
          </div>

          {/* Pengisian & Progress */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <div className="flex justify-between items-center text-sm md:text-base text-slate-700 font-mono">
              <span>Terisi: <strong className="text-slate-900 text-base md:text-lg">{telemetry.dispensedMl || 0}</strong> / {target} mL</span>
              <span>Laju: <strong>{telemetry.flowRate || 0}</strong> L/min</span>
            </div>
            <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all duration-200" style={{ width: `${fillPct}%` }} />
            </div>
            <div className="text-xs md:text-sm text-slate-500 font-mono text-right">
              Massa air: {dispensed.toFixed(1)} gram ({fillPct}%)
            </div>
          </div>

          {/* Tombol Utama Pembayaran & Emergency Stop */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleInitiatePayment}
              disabled={isPaying || deviceStatus === "DISPENSING" || !isConnected}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3.5 px-5 rounded-lg text-lg transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2"
            >
              <span>💳</span>
              <span>{isPaying ? "Menyiapkan Pembayaran..." : `Bayar via QRIS (${currentPrice})`}</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleStartManual}
                disabled={deviceStatus === "DISPENSING" || !isConnected}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 px-3 rounded-lg text-xs transition-colors border border-slate-300 cursor-pointer disabled:opacity-50"
                title="Bypass bayar (Khusus pengujian operator)"
              >
                Uji Tanpa Bayar (Manual)
              </button>

              <button
                type="button"
                onClick={handleStop}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Stop Darurat
              </button>
            </div>
          </div>
        </section>

        {/* Kolom Kanan: Timbangan Digital */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="font-bold text-slate-900 text-lg">Timbangan (Load Cell 5kg)</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTare}
                disabled={deviceStatus === "DISPENSING" || !isConnected}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-md text-sm font-medium text-slate-800 disabled:opacity-40 cursor-pointer"
              >
                Tare (0.0g)
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={deviceStatus === "DISPENSING" || !isConnected}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-md text-sm font-medium text-slate-800 disabled:opacity-40 cursor-pointer"
              >
                Reset Sesi
              </button>
            </div>
          </div>

          {/* Display Berat Utama */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-baseline justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold block">
                {deviceStatus === "DISPENSING" ? "Netto Air Mengalir" : "Beban di Platform"}
              </span>
              <div className="text-4xl md:text-5xl font-extrabold font-mono text-slate-900 mt-1">
                {deviceStatus === "DISPENSING" ? `+${dispensed.toFixed(1)}` : (telemetry.currentWeight ?? 0).toFixed(1)}
                <span className="text-lg md:text-xl font-normal text-slate-500 ml-1">g</span>
              </div>
            </div>
            <div className="text-right text-sm md:text-base text-slate-700 font-mono space-y-1">
              <div>Tara Wadah: <strong>{telemetry.containerWeight ?? 0}g</strong></div>
              <div>Total Bruto: <strong>{gross.toFixed(1)}g</strong></div>
              <div className="text-slate-500 text-xs md:text-sm">Batas Maks: {maxLimit}g</div>
            </div>
          </div>

          {/* Bar Beban Platform */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm md:text-base text-slate-700 font-medium">
              <span>Beban Platform: {gross.toFixed(1)} / {maxLimit}g</span>
              <span className={`font-mono font-bold ${grossPct >= 90 ? "text-red-600" : ""}`}>{grossPct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div className={`h-full transition-all duration-200 ${grossPct >= 90 ? "bg-red-500" : grossPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${grossPct}%` }} />
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-800 font-mono font-medium">
              {feedback}
            </div>
          )}
        </section>
      </div>

      {/* Modal Dialog QRIS Pembayaran */}
      {paymentOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-5 text-center">
            <div className="space-y-1">
              <h3 className="font-bold text-xl text-slate-900">Pembayaran QRIS</h3>
              <p className="text-xs text-slate-500 font-mono">{paymentOrder.orderId}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="text-3xl font-bold font-mono text-blue-700">
                Rp {paymentOrder.amount.toLocaleString("id-ID")}
              </div>
              <p className="text-xs text-slate-600">
                Volume: <strong>{paymentOrder.volumeMl} mL</strong> air minum
              </p>
            </div>

            {/* Area QR Code (Direct Core API / Real QR Image / Mock) */}
            <div className="p-4 bg-white border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center space-y-2">
              {paymentOrder.qrUrl && !paymentOrder.isSimulated ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={paymentOrder.qrUrl}
                  alt="QRIS Code Midtrans"
                  className="w-44 h-44 object-contain rounded-lg border border-slate-200"
                />
              ) : (
                <div className="w-44 h-44 bg-slate-100 rounded-lg flex flex-col items-center justify-center p-2 text-center text-xs text-slate-500 font-mono border border-slate-200">
                  <span className="text-3xl mb-1">📱</span>
                  <span className="font-bold text-slate-800 text-sm">[QRIS Otomatis]</span>
                  <span className="text-[10px] text-slate-400 mt-1">Midtrans Core API</span>
                  {paymentOrder.qrString && (
                    <span className="text-[10px] text-emerald-700 font-medium mt-1">
                      ✓ EMVCo dikirim ke LCD TFT
                    </span>
                  )}
                </div>
              )}
              <span className="text-[11px] text-slate-500">
                {paymentOrder.isSimulated
                  ? "Mode Pengujian: Klik tombol di bawah untuk simulasi bayar instan"
                  : "Silakan scan kode QRIS menggunakan e-wallet atau m-banking Anda"}
              </span>
            </div>

            {/* Helper Khusus Midtrans Sandbox Simulator */}
            <div className="space-y-2 text-left bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-800 block text-xs">
                🧪 Pengujian Simulator Midtrans:
              </span>

              {/* Opsi QRIS v2 (Rekomendasi Utama) */}
              {paymentOrder.qrUrlV2 && (
                <div className="bg-white p-2 rounded-lg border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-700 text-[11px]">QRIS v2 (OpenAPI / MPM)</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (paymentOrder.qrUrlV2) {
                          navigator.clipboard.writeText(paymentOrder.qrUrlV2);
                          showFeedback("✓ URL QRIS v2 disalin! Tempelkan di Simulator v2");
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      📋 Salin URL v2
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 line-clamp-1 font-mono break-all select-all">
                    {paymentOrder.qrUrlV2}
                  </p>
                  <div className="pt-1 border-t border-slate-100 flex justify-end">
                    <a
                      href="https://simulator.sandbox.midtrans.com/v2/qris/index"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-emerald-700 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      Buka Simulator QRIS v2 ↗
                    </a>
                  </div>
                </div>
              )}

              {/* Opsi QRIS v1 Standar */}
              {paymentOrder.qrUrl && (
                <div className="bg-white p-2 rounded-lg border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-700 text-[11px]">QRIS v1 (Standar)</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (paymentOrder.qrUrl) {
                          navigator.clipboard.writeText(paymentOrder.qrUrl);
                          showFeedback("✓ URL QRIS v1 disalin! Tempelkan di Simulator v1");
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      📋 Salin URL v1
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 line-clamp-1 font-mono break-all select-all">
                    {paymentOrder.qrUrl}
                  </p>
                  <div className="pt-1 border-t border-slate-100 flex justify-end">
                    <a
                      href="https://simulator.sandbox.midtrans.com/qris/index"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-blue-700 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      Buka Simulator QRIS v1 ↗
                    </a>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-slate-400 italic">
                *Catatan: Simulator Midtrans membaca URL Gambar. Masukkan PIN simulasi 123456 jika diminta.
              </p>
            </div>

            {/* Tombol Simulasi Bayar Instan */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSimulatePayment}
                disabled={simulating}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors cursor-pointer shadow-sm"
              >
                {simulating ? "Memproses..." : "✓ Bayar Lunas (Simulasi Sandbox)"}
              </button>

              <button
                type="button"
                onClick={() => setPaymentOrder(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Batal / Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Konfigurasi & Kalibrasi */}
      <details className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700 shadow-sm">
        <summary className="font-semibold cursor-pointer text-slate-900 text-base select-none">
          Pengaturan Kalibrasi & Batas Beban Flash ESP32
        </summary>
        <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 mt-3">
          <div className="space-y-1.5">
            <label htmlFor="known-weight" className="text-slate-700 font-medium block">1. Kalibrasi Beban (g):</label>
            <div className="flex gap-2">
              <input id="known-weight" type="number" value={knownWeight} onChange={(e) => setKnownWeight(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-base" />
              <button type="button" onClick={handleCalibrate} className="px-3.5 py-1.5 bg-slate-800 text-white font-medium rounded-lg shrink-0 hover:bg-slate-700 cursor-pointer">Set</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cal-factor" className="text-slate-700 font-medium block">2. Faktor Kalibrasi:</label>
            <div className="flex gap-2">
              <input id="cal-factor" type="number" step="0.1" value={calFactorInput} onChange={(e) => setCalFactorInput(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-base" />
              <button type="button" onClick={handleSaveFactor} className="px-3.5 py-1.5 bg-slate-800 text-white font-medium rounded-lg shrink-0 hover:bg-slate-700 cursor-pointer">Simpan</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="max-weight" className="text-slate-700 font-medium block">3. Batas Beban Flash (g):</label>
            <div className="flex gap-2">
              <input id="max-weight" type="number" step="50" value={maxWeightLimitInput} onChange={(e) => setMaxWeightLimitInput(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-base" />
              <button type="button" onClick={handleSaveMax} className="px-3.5 py-1.5 bg-slate-800 text-white font-medium rounded-lg shrink-0 hover:bg-slate-700 cursor-pointer">Simpan</button>
            </div>
          </div>
        </div>
      </details>

      {/* Log Telemetri */}
      <details className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700 shadow-sm">
        <summary className="font-semibold cursor-pointer text-slate-900 text-base select-none">
          Live MQTT & WebSocket Log ({events.length} event)
        </summary>
        <div className="mt-3 p-3 bg-slate-950 text-slate-200 rounded-lg font-mono text-xs md:text-sm h-40 overflow-y-auto space-y-1.5">
          {events.length === 0 ? (
            <div className="text-slate-500 text-center py-12">Menunggu data MQTT...</div>
          ) : (
            events.map((ev, i) => (
              <div key={i} className="flex gap-2 border-b border-slate-800/60 pb-1">
                <span className="text-slate-400 shrink-0">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                <span className="text-cyan-400 shrink-0">[{ev.eventType || ev.type}]</span>
                <span className="truncate">{JSON.stringify(ev.data || {})}</span>
              </div>
            ))
          )}
        </div>
      </details>
    </main>
  );
}
