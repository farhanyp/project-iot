"use client";

import { PackageItem } from "./package-table";

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  selectedPackage: PackageItem | null;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DeleteConfirmModal({
  isOpen,
  selectedPackage,
  onConfirm,
  onClose,
}: DeleteConfirmModalProps) {
  if (!isOpen || !selectedPackage) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4 sm:p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-base sm:text-lg mb-3">
          🗑️
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Hapus Paket Menu?</h3>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Anda akan menghapus <strong>"{selectedPackage.name}"</strong> (
          {selectedPackage.volumeMl} mL). Jika paket pernah digunakan dalam riwayat
          transaksi, paket akan dinonaktifkan secara aman (soft-delete).
        </p>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 sm:px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 sm:px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            Ya, Hapus Sekarang
          </button>
        </div>
      </div>
    </div>
  );
}
