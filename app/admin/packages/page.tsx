"use client";

import { useEffect, useState, useCallback } from "react";
import { useIoTSocket } from "@/lib/use-iot-socket";

interface PackageItem {
  id: string;
  code: string;
  name: string;
  volumeMl: number;
  price: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export default function AdminPackagesPage() {
  const { mqttConnected } = useIoTSocket();

  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modal States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [selectedPackage, setSelectedPackage] = useState<PackageItem | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    volumeMl: number | string;
    price: number | string;
    code: string;
    isActive: boolean;
  }>({
    name: "",
    volumeMl: 600,
    price: 6000,
    code: "",
    isActive: true,
  });

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch("/api/packages?all=true");
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
      }
    } catch (e) {
      console.error(e);
      showFeedback("error", "Gagal memuat daftar paket.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // 1. Toggle Status Aktif (Instant)
  const handleToggleActive = async (pkg: PackageItem) => {
    try {
      const res = await fetch("/api/packages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pkg.id,
          isActive: !pkg.isActive,
        }),
      });

      if (res.ok) {
        showFeedback("success", `Status paket "${pkg.name}" diperbarui & disinkronkan ke ESP32!`);
        fetchPackages();
      } else {
        showFeedback("error", "Gagal memperbarui status paket.");
      }
    } catch (e) {
      console.error(e);
      showFeedback("error", "Terjadi kesalahan koneksi.");
    }
  };

  // 2. Submit Tambah Paket Baru
  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.volumeMl || !formData.price) {
      showFeedback("error", "Mohon isi semua field yang wajib.");
      return;
    }

    try {
      const res = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          volumeMl: Number(formData.volumeMl),
          price: Number(formData.price),
          code: formData.code.trim() || undefined,
        }),
      });

      if (res.ok) {
        showFeedback("success", "Paket baru berhasil ditambahkan dan disiarkan ke LCD ESP32!");
        setIsAddOpen(false);
        setFormData({ name: "", volumeMl: 600, price: 6000, code: "", isActive: true });
        fetchPackages();
      } else {
        const err = await res.json();
        showFeedback("error", err.error || "Gagal menambahkan paket.");
      }
    } catch (e) {
      console.error(e);
      showFeedback("error", "Terjadi kesalahan server.");
    }
  };

  // 3. Submit Update Paket
  const handleUpdatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) return;

    try {
      const res = await fetch("/api/packages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPackage.id,
          name: formData.name,
          volumeMl: Number(formData.volumeMl),
          price: Number(formData.price),
          code: formData.code.trim() || undefined,
          isActive: formData.isActive,
        }),
      });

      if (res.ok) {
        showFeedback("success", "Paket berhasil diperbarui dan disiarkan ke LCD ESP32!");
        setIsEditOpen(false);
        setSelectedPackage(null);
        fetchPackages();
      } else {
        const err = await res.json();
        showFeedback("error", err.error || "Gagal memperbarui paket.");
      }
    } catch (e) {
      console.error(e);
      showFeedback("error", "Terjadi kesalahan server.");
    }
  };

  // 4. Hapus Paket
  const handleDeletePackage = async () => {
    if (!selectedPackage) return;

    try {
      const res = await fetch(`/api/packages?id=${selectedPackage.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const data = await res.json();
        showFeedback("success", data.message || "Paket berhasil dihapus / disinkronkan!");
        setIsDeleteOpen(false);
        setSelectedPackage(null);
        fetchPackages();
      } else {
        const err = await res.json();
        showFeedback("error", err.error || "Gagal menghapus paket.");
      }
    } catch (e) {
      console.error(e);
      showFeedback("error", "Terjadi kesalahan server.");
    }
  };

  // 5. Manual Sync ke ESP32
  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/packages/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        showFeedback("success", `Berhasil: ${data.count} paket aktif disiarkan ke LCD ESP32!`);
      } else {
        showFeedback("error", data.error || "Gagal menyiarkan paket via MQTT.");
      }
    } catch (e) {
      console.error(e);
      showFeedback("error", "Koneksi ke server gagal.");
    } finally {
      setSyncing(false);
    }
  };

  const openEditModal = (pkg: PackageItem) => {
    setSelectedPackage(pkg);
    setFormData({
      name: pkg.name,
      volumeMl: pkg.volumeMl,
      price: pkg.price,
      code: pkg.code,
      isActive: pkg.isActive,
    });
    setIsEditOpen(true);
  };

  const openDeleteModal = (pkg: PackageItem) => {
    setSelectedPackage(pkg);
    setIsDeleteOpen(true);
  };

  // Hitung paket aktif untuk badge layar LCD ESP32
  const activePackages = packages.filter((p) => p.isActive);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header Halaman & Aksi Cepat */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manajemen Paket Menu Air</h1>
          <p className="text-sm text-slate-500 mt-1">
            Atur pilihan menu, volume air, dan tarif pembayaran. Data otomatis disinkronisasi ke Layar LCD ESP32 via MQTT.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className={syncing ? "animate-spin inline-block" : ""}>🔄</span>
            <span>{syncing ? "Menyiarkan..." : "Sinkronkan ke ESP32"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFormData({ name: "", volumeMl: 600, price: 6000, code: "", isActive: true });
              setIsAddOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <span>+ Tambah Paket</span>
          </button>
        </div>
      </div>

      {/* Bar Notifikasi Status Feedback */}
      {feedback && (
        <div
          className={`mb-6 p-4 rounded-lg border text-sm flex items-center justify-between ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-bold underline cursor-pointer ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Info Banner & Status MQTT */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 text-sm text-blue-900">
          <span className="text-lg">ℹ️</span>
          <div>
            <p className="font-semibold mb-1">Tata Letak Menu LCD TFT ESP32 (Resolusi 240x320)</p>
            <p className="text-blue-800 text-xs leading-relaxed">
              Layar fisik dispenser ESP32 menampilkan maksimal <strong>3 paket aktif pertama</strong> (diurutkan berdasarkan volume terkecil). Paket ke-4 dan seterusnya tetap aktif dan dapat dipilih oleh konsumen melalui Web Kiosk browser.
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status Sync MQTT</span>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`w-3 h-3 rounded-full ${
                mqttConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span className="text-sm font-bold text-slate-800">
              {mqttConnected ? "MQTT Broker Terhubung" : "Menghubungkan Broker..."}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {mqttConnected
              ? "Perubahan akan disiarkan otomatis ke LCD"
              : "Pesan akan masuk antrian broker"}
          </p>
        </div>
      </div>

      {/* Tabel Daftar Paket */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-base">Daftar Paket Presets</h2>
          <span className="text-xs text-slate-500 font-medium">
            Total {packages.length} paket ({activePackages.length} aktif)
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Memuat data paket...</div>
        ) : packages.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Belum ada paket menu. Silakan klik tombol <strong>"+ Tambah Paket"</strong> di atas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold text-xs border-b border-slate-200 uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">Nama Menu & Kode</th>
                  <th className="py-3 px-4">Volume (mL)</th>
                  <th className="py-3 px-4">Harga (Rp)</th>
                  <th className="py-3 px-4">Tampilan LCD ESP32</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {packages.map((pkg, idx) => {
                  const activeIdx = activePackages.findIndex((p) => p.id === pkg.id);
                  const isShownOnLcd = pkg.isActive && activeIdx >= 0 && activeIdx < 3;

                  return (
                    <tr key={pkg.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 text-center text-slate-400 font-mono text-xs">
                        {idx + 1}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{pkg.name}</div>
                        <div className="font-mono text-xs text-slate-400">{pkg.code}</div>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {pkg.volumeMl.toLocaleString("id-ID")} mL
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-emerald-700">
                        Rp {pkg.price.toLocaleString("id-ID")}
                      </td>

                      <td className="py-3.5 px-4">
                        {isShownOnLcd ? (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                              activeIdx === 0
                                ? "bg-cyan-50 text-cyan-800 border-cyan-300"
                                : activeIdx === 1
                                ? "bg-blue-50 text-blue-800 border-blue-300"
                                : "bg-emerald-50 text-emerald-800 border-emerald-300"
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            Slot LCD #{activeIdx + 1}
                          </span>
                        ) : pkg.isActive ? (
                          <span className="text-xs text-slate-400 italic">
                            Hanya di Kiosk Web (#{activeIdx + 1})
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">Non-Aktif</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(pkg)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            pkg.isActive ? "bg-blue-600" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              pkg.isActive ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(pkg)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteModal(pkg)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Tambah Paket Baru */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Tambah Paket Air Baru</h3>
            <p className="text-xs text-slate-500 mb-4">
              Paket baru akan langsung disinkronkan ke ESP32 dan muncul di LCD secara otomatis.
            </p>

            <form onSubmit={handleCreatePackage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Menu Paket <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Botol Sedang, Gelas Jumbo"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Volume (mL) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    required
                    placeholder="600"
                    value={formData.volumeMl}
                    onChange={(e) => setFormData({ ...formData, volumeMl: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Harga (Rp) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    required
                    placeholder="6000"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode Preset (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. BOTTLE_600ML (Otomatis dibuat jika kosong)"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs cursor-pointer"
                >
                  Simpan & Siarkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Paket */}
      {isEditOpen && selectedPackage && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Edit Paket Menu</h3>
            <p className="text-xs text-slate-500 mb-4">
              Perubahan nama, volume, harga, atau status aktif akan langsung terupdate di LCD dispenser.
            </p>

            <form onSubmit={handleUpdatePackage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Menu Paket <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Volume (mL) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    required
                    value={formData.volumeMl}
                    onChange={(e) => setFormData({ ...formData, volumeMl: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Harga (Rp) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode Preset
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="editIsActive" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Paket Aktif & Muncul untuk Konsumen
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditOpen(false);
                    setSelectedPackage(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs cursor-pointer"
                >
                  Perbarui & Siarkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Konfirmasi Hapus */}
      {isDeleteOpen && selectedPackage && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-lg mb-3">
              🗑️
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Hapus Paket Menu?</h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Anda akan menghapus <strong>"{selectedPackage.name}"</strong> ({selectedPackage.volumeMl} mL).
              Jika paket pernah digunakan dalam riwayat transaksi, paket akan dinonaktifkan secara aman (soft-delete).
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setSelectedPackage(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeletePackage}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                Ya, Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
