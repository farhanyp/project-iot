"use client";

import { useState, useEffect } from "react";
import { useIoTSocket } from "@/lib/use-iot-socket";
import KioskHeadbar from "@/components/kiosk/kiosk-headbar";
import DispensingBanner from "@/components/kiosk/dispensing-banner";
import PackageSelector, { PackageItem } from "@/components/kiosk/package-selector";
import SensorFlowCards from "@/components/kiosk/sensor-flow-cards";
import QrisPaymentModal, { PaymentOrder } from "@/components/kiosk/qris-payment-modal";
import TelemetryLog from "@/components/kiosk/telemetry-log";

const DEFAULT_PACKAGES: PackageItem[] = [
  { code: "CUP_200ML", name: "Gelas Kecil", volumeMl: 200, price: 2000 },
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
    sendReset,
  } = useIoTSocket();

  // Daftar paket dinamis dari database (fallback ke DEFAULT_PACKAGES)
  const [packages, setPackages] = useState<PackageItem[]>(DEFAULT_PACKAGES);
  const [selectedVolume, setSelectedVolume] = useState<number>(600);
  const [customVolume, setCustomVolume] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);

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

  const [prevStatus, setPrevStatus] = useState(deviceStatus);
  if (deviceStatus !== prevStatus) {
    setPrevStatus(deviceStatus);
    if (deviceStatus === "DISPENSING") {
      // Jika pompa mulai mengalir, tutup modal pembayaran jika masih terbuka
      if (paymentOrder) setPaymentOrder(null);
    }
  }

  const currentVolume = customVolume ? parseInt(customVolume, 10) || selectedVolume : selectedVolume;
  const matchedPreset = packages.find((p) => p.volumeMl === currentVolume);
  const currentPriceAmount = matchedPreset ? matchedPreset.price : Math.round(currentVolume * 10);
  const currentPrice = `Rp ${currentPriceAmount.toLocaleString("id-ID")}`;

  const target = telemetry.targetMl > 0 ? telemetry.targetMl : currentVolume;
  const dispensed = telemetry.dispensedMl ?? 0;
  const fillPct = Math.min(100, Math.round((dispensed / (target || 1)) * 100));

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
          } else if (status === "FAILED") {
            showFeedback("Pengisian GAGAL: Air tidak mengalir / habis. Silakan hubungi admin untuk klaim refund.");
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

  const handleCancelPayment = () => {
    setPaymentOrder(null);
    sendCommand("SHOW_MENU");
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
    sendCommand("START", { volumeMl: currentVolume, deviceId: "DISPENSER-01" });
    showFeedback("Pengisian manual dimulai.");
  };

  const handleStop = () => {
    sendCommand("STOP", 0, "DISPENSER-01");
    showFeedback("Pompa dimatikan.");
  };

  const handleReset = () => {
    sendReset("DISPENSER-01");
    showFeedback("Sesi pengisian di-reset.");
  };

  const handleCopyUrl = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    showFeedback(`✓ ${label} disalin!`);
  };

  return (
    <main className="max-w-5xl mx-auto p-3 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
      {/* Header & Status Bar */}
      <KioskHeadbar
        deviceCode="DISPENSER-01"
        isConnected={isConnected}
        mqttConnected={mqttConnected}
        deviceStatus={deviceStatus}
      />

      {/* Banner Selesai / Sedang Pengisian */}
      <DispensingBanner
        status={telemetry.status === "COMPLETED" ? "COMPLETED" : deviceStatus}
        dispensedMl={telemetry.dispensedMl ?? 0}
        targetMl={target}
        onReset={handleReset}
      />

      {/* Main Grid: Kolom Kiri Pilihan Paket, Kolom Kanan Status Sensor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <PackageSelector
          packages={packages}
          selectedVolume={selectedVolume}
          onSelectVolume={(vol) => {
            setSelectedVolume(vol);
            setCustomVolume("");
          }}
          customVolume={customVolume}
          onChangeCustomVolume={setCustomVolume}
          currentPrice={currentPrice}
          dispensed={dispensed}
          target={target}
          flowRate={telemetry.flowRate || 0}
          fillPct={fillPct}
          isPaying={isPaying}
          deviceStatus={deviceStatus}
          isConnected={isConnected}
          onInitiatePayment={handleInitiatePayment}
          onStartManual={handleStartManual}
          onStop={handleStop}
        />

        <SensorFlowCards
          isTumblerPresent={telemetry.isTumblerPresent}
          currentDistanceCm={telemetry.currentDistanceCm}
          targetDistanceCm={telemetry.targetDistanceCm}
          flowRateMlPerSec={telemetry.flowRateMlPerSec}
          currentVolume={currentVolume}
          deviceStatus={deviceStatus}
          isConnected={isConnected}
          onReset={handleReset}
          feedback={feedback}
        />
      </div>

      {/* Modal Dialog QRIS Pembayaran */}
      <QrisPaymentModal
        paymentOrder={paymentOrder}
        simulating={simulating}
        onSimulate={handleSimulatePayment}
        onCancel={handleCancelPayment}
        onCopyUrl={handleCopyUrl}
      />

      {/* Log Telemetri Live */}
      <TelemetryLog events={events} />
    </main>
  );
}
