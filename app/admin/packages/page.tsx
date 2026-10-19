"use client";

import { useEffect, useState, useCallback } from "react";
import { useIoTSocket } from "@/lib/use-iot-socket";
import LcdInfoBanner from "@/components/admin/packages/lcd-info-banner";
import PackageTable, { PackageItem } from "@/components/admin/packages/package-table";
import PackageFormModal, { PackageFormData } from "@/components/admin/packages/package-form-modal";
import DeleteConfirmModal from "@/components/admin/packages/delete-confirm-modal";

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
  const [formData, setFormData] = useState<PackageFormData>({
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

  const activePackages = packages.filter((p) => p.isActive);

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
      {/* Header Halaman & Aksi Cepat */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Manajemen Paket Menu Air</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
            Atur pilihan menu, volume air, dan tarif pembayaran. Data otomatis disinkronisasi ke Layar LCD ESP32 via MQTT.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
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
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <span>+ Tambah Paket</span>
          </button>
        </div>
      </div>

      {/* Bar Notifikasi Status Feedback */}
      {feedback && (
        <div
          className={`p-3 sm:p-4 rounded-lg border text-xs sm:text-sm flex items-center justify-between gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-bold underline cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Info Banner & Status MQTT */}
      <LcdInfoBanner mqttConnected={mqttConnected} />

      {/* Tabel Daftar Paket */}
      <PackageTable
        packages={packages}
        activePackages={activePackages}
        loading={loading}
        onToggleActive={handleToggleActive}
        onOpenEdit={openEditModal}
        onOpenDelete={openDeleteModal}
      />

      {/* MODAL 1: Tambah Paket Baru */}
      <PackageFormModal
        isOpen={isAddOpen}
        isEdit={false}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleCreatePackage}
        onClose={() => setIsAddOpen(false)}
      />

      {/* MODAL 2: Edit Paket */}
      <PackageFormModal
        isOpen={isEditOpen}
        isEdit={true}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleUpdatePackage}
        onClose={() => {
          setIsEditOpen(false);
          setSelectedPackage(null);
        }}
      />

      {/* MODAL 3: Konfirmasi Hapus */}
      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        selectedPackage={selectedPackage}
        onConfirm={handleDeletePackage}
        onClose={() => {
          setIsDeleteOpen(false);
          setSelectedPackage(null);
        }}
      />
    </div>
  );
}
