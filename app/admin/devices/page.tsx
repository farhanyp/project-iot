"use client";

import { useEffect, useState, useCallback } from "react";

interface DeviceItem {
  id: string;
  code: string;
  name: string;
  location: string | null;
  status: string;
  isActive: boolean;
  pricePerMl: number;
  lastPingAt: string | null;
  _count?: { transactions: number };
}

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
        showFeedback(`Status operasional ${device.code} diubah menjadi ${!device.isActive ? "AKTIF" : "NON-AKTIF"}.`);
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
        showFeedback(`Tarif berhasil disimpan: Rp ${(newPricePerMl * 1000).toLocaleString("id-ID")} / Liter`);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manajemen Perangkat</h1>
          <p className="text-sm text-slate-500">Kontrol operasional dispenser, tarif per mL, dan sakelar jarak jauh</p>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-sm font-medium">
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Memuat data perangkat...</div>
      ) : devices.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
          Belum ada perangkat terdaftar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {devices.map((dev) => (
            <div key={dev.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-lg text-slate-900 font-mono">{dev.code}</h2>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${dev.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-red-50 text-red-700 border-red-300"}`}>
                      {dev.isActive ? "Operasional Aktif" : "Maintenance / Nonaktif"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{dev.name} • {dev.location || "Lokasi Belum Diatur"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleActive(dev)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${dev.isActive ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"}`}
                >
                  {dev.isActive ? "Nonaktifkan Kios" : "Aktifkan Kios"}
                </button>
              </div>

              {/* Status & Metrik */}
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600 font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Status Fisik</span>
                  <strong className="text-slate-800">{dev.status}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Total Pesanan</span>
                  <strong className="text-slate-800">{dev._count?.transactions || 0}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Tarif Dasar</span>
                  <strong className="text-slate-800">Rp {(dev.pricePerMl * 1000).toLocaleString("id-ID")} / L</strong>
                </div>
              </div>

              {/* Form Ubah Tarif */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                <label className="text-slate-700 font-medium shrink-0">
                  Ubah Tarif per mL (Rp):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.001"
                    defaultValue={dev.pricePerMl}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val && val !== dev.pricePerMl) handleUpdatePrice(dev.id, val);
                    }}
                    className="w-24 border border-slate-300 rounded px-2 py-1 font-mono text-xs"
                  />
                  <span className="text-slate-400">(Rp {(dev.pricePerMl * 1000).toFixed(0)}/L)</span>
                </div>
              </div>

              {/* Remote Control Pompa Manual */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <span className="text-xs font-semibold text-slate-700 block">
                  Uji Coba Remote Pompa (Maintenance)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSwitchPump(dev.code, "ON")}
                    className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-medium py-2 px-3 rounded text-xs transition-colors cursor-pointer"
                  >
                    Nyalakan Pompa (Uji 500mL)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchPump(dev.code, "OFF")}
                    className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded text-xs transition-colors cursor-pointer"
                  >
                    Paksa Matikan Pompa
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
