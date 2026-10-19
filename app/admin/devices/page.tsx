"use client";

import { useEffect, useState, useCallback } from "react";
import DeviceCard, { DeviceItem } from "@/components/admin/devices/device-card";

export default function AdminDevicesPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/devices");
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/admin/devices")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.devices) {
          setDevices(data.devices);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleToggleActive = async (device: DeviceItem) => {
    try {
      const res = await fetch("/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: device.id, isActive: !device.isActive }),
      });
      if (res.ok) {
        showFeedback(
          `Status operasional ${device.code} diubah menjadi ${
            !device.isActive ? "AKTIF" : "NON-AKTIF"
          }.`
        );
        fetchDevices();
      }
    } catch {
      showFeedback("Gagal memperbarui status perangkat.");
    }
  };

  const handleUpdatePrice = async (id: string, newPricePerMl: number) => {
    try {
      const res = await fetch("/api/admin/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pricePerMl: newPricePerMl }),
      });
      if (res.ok) {
        showFeedback(
          `Tarif berhasil disimpan: Rp ${(newPricePerMl * 1000).toLocaleString(
            "id-ID"
          )} / Liter`
        );
        fetchDevices();
      }
    } catch {
      showFeedback("Gagal memperbarui tarif.");
    }
  };

  const handleSwitchPump = async (deviceCode: string, action: "ON" | "OFF") => {
    try {
      const res = await fetch("/api/admin/devices/switch-pump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode, action }),
      });
      const data = await res.json();
      showFeedback(data.message || `Pompa ${action} dikirim.`);
    } catch {
      showFeedback("Gagal mengirim perintah remote pompa.");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Manajemen Perangkat</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
            Kontrol operasional dispenser, tarif per mL, dan sakelar jarak jauh
          </p>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-xs sm:text-sm font-medium">
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Memuat data perangkat...</div>
      ) : devices.length === 0 ? (
        <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
          Belum ada perangkat terdaftar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {devices.map((dev) => (
            <DeviceCard
              key={dev.id}
              device={dev}
              onToggleActive={handleToggleActive}
              onUpdatePrice={handleUpdatePrice}
              onSwitchPump={handleSwitchPump}
            />
          ))}
        </div>
      )}
    </div>
  );
}
