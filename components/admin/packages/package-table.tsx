"use client";

export interface PackageItem {
  id: string;
  code: string;
  name: string;
  volumeMl: number;
  price: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PackageTableProps {
  packages: PackageItem[];
  activePackages: PackageItem[];
  loading: boolean;
  onToggleActive: (pkg: PackageItem) => void;
  onOpenEdit: (pkg: PackageItem) => void;
  onOpenDelete: (pkg: PackageItem) => void;
}

export default function PackageTable({
  packages,
  activePackages,
  loading,
  onToggleActive,
  onOpenEdit,
  onOpenDelete,
}: PackageTableProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <h2 className="font-bold text-slate-800 text-sm sm:text-base">Daftar Paket Presets</h2>
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
        <>
          {/* TAMPILAN MOBILE: Card List (Tampil hanya di layar kecil < md) */}
          <div className="block md:hidden divide-y divide-slate-100 p-2 sm:p-3 space-y-3">
            {packages.map((pkg, idx) => {
              const activeIdx = activePackages.findIndex((p) => p.id === pkg.id);
              const isShownOnLcd = pkg.isActive && activeIdx >= 0 && activeIdx < 3;

              return (
                <div
                  key={pkg.id}
                  className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-2xs"
                >
                  {/* Baris Atas: Nama, Kode & Switch Aktif */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          #{idx + 1}
                        </span>
                        <h3 className="font-bold text-slate-900 text-sm">{pkg.name}</h3>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 block mt-0.5">
                        {pkg.code}
                      </span>
                    </div>

                    {/* Toggle Switch Aktif */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {pkg.isActive ? "Aktif" : "Off"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleActive(pkg)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          pkg.isActive ? "bg-blue-600" : "bg-slate-300"
                        }`}
                        title={pkg.isActive ? "Nonaktifkan paket" : "Aktifkan paket"}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            pkg.isActive ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Baris Tengah: Info Volume, Harga & Badge Slot LCD */}
                  <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-medium">
                        Volume Takaran
                      </span>
                      <strong className="text-slate-800 text-sm font-semibold">
                        {pkg.volumeMl.toLocaleString("id-ID")} mL
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-medium">
                        Tarif Harga
                      </span>
                      <strong className="text-emerald-700 text-sm font-bold">
                        Rp {pkg.price.toLocaleString("id-ID")}
                      </strong>
                    </div>
                  </div>

                  {/* Status Tampilan Slot LCD */}
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className="text-slate-500 text-[11px]">Tampilan Layar:</span>
                    <div>
                      {isShownOnLcd ? (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
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
                        <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-medium">
                          Hanya Kiosk Web (#{activeIdx + 1})
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          Non-Aktif
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Baris Bawah: Tombol Aksi Edit & Hapus */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => onOpenEdit(pkg)}
                      className="flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 cursor-pointer text-center transition-colors"
                    >
                      ✏️ Edit Paket
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDelete(pkg)}
                      className="flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 active:bg-red-200 cursor-pointer text-center transition-colors"
                    >
                      🗑️ Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* TAMPILAN DESKTOP: Traditional Table (Tampil di layar md ke atas >= 768px) */}
          <div className="hidden md:block overflow-x-auto">
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
                          onClick={() => onToggleActive(pkg)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            pkg.isActive ? "bg-blue-600" : "bg-slate-300"
                          }`}
                          title={pkg.isActive ? "Nonaktifkan paket" : "Aktifkan paket"}
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
                            onClick={() => onOpenEdit(pkg)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenDelete(pkg)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 cursor-pointer transition-colors"
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
        </>
      )}
    </div>
  );
}
