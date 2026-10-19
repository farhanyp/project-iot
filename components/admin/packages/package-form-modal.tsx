"use client";

export interface PackageFormData {
  name: string;
  volumeMl: number | string;
  price: number | string;
  code: string;
  isActive: boolean;
}

export interface PackageFormModalProps {
  isOpen: boolean;
  isEdit: boolean;
  formData: PackageFormData;
  setFormData: React.Dispatch<React.SetStateAction<PackageFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export default function PackageFormModal({
  isOpen,
  isEdit,
  formData,
  setFormData,
  onSubmit,
  onClose,
}: PackageFormModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1">
          {isEdit ? "Edit Paket Menu" : "Tambah Paket Air Baru"}
        </h3>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          {isEdit
            ? "Perubahan nama, volume, harga, atau status aktif akan langsung terupdate di LCD dispenser."
            : "Paket baru akan langsung disinkronkan ke ESP32 dan muncul di LCD secara otomatis."}
        </p>

        <form onSubmit={onSubmit} className="space-y-3.5 sm:space-y-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              Kode Preset {isEdit ? "" : "(Opsional)"}
            </label>
            <input
              type="text"
              required={isEdit}
              placeholder="e.g. BOTTLE_600ML (Otomatis dibuat jika kosong)"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isEdit && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="editIsActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <label
                htmlFor="editIsActive"
                className="text-xs sm:text-sm font-medium text-slate-700 cursor-pointer"
              >
                Paket Aktif & Muncul untuk Konsumen
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 sm:px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-3.5 sm:px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs sm:text-sm font-semibold shadow-xs cursor-pointer"
            >
              {isEdit ? "Perbarui & Siarkan" : "Simpan & Siarkan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
