"use client";

export interface DeviceItem {
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

export interface DeviceCardProps {
  device: DeviceItem;
  onToggleActive: (device: DeviceItem) => void;
  onUpdatePrice: (id: string, newPrice: number) => void;
  onSwitchPump: (deviceCode: string, action: "ON" | "OFF") => void;
}

export default function DeviceCard({
  device,
  onToggleActive,
  onUpdatePrice,
  onSwitchPump,
}: DeviceCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-base sm:text-lg text-slate-900 font-mono">{device.code}</h2>
            <span
              className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-semibold border ${
                device.isActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-red-50 text-red-700 border-red-300"
              }`}
            >
              {device.isActive ? "Operasional Aktif" : "Maintenance / Nonaktif"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {device.name} • {device.location || "Lokasi Belum Diatur"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggleActive(device)}
          className={`self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors active:scale-95 ${
            device.isActive
              ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
          }`}
        >
          {device.isActive ? "Nonaktifkan Kios" : "Aktifkan Kios"}
        </button>
      </div>

      {/* Status & Metrik */}
      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 sm:p-3 rounded-lg border border-slate-100 text-xs text-slate-600 font-mono">
        <div>
          <span className="text-[9px] sm:text-[10px] text-slate-400 block uppercase">Status</span>
          <strong className="text-slate-800 text-[11px] sm:text-xs truncate block">{device.status}</strong>
        </div>
        <div>
          <span className="text-[9px] sm:text-[10px] text-slate-400 block uppercase">Pesanan</span>
          <strong className="text-slate-800 text-[11px] sm:text-xs">{device._count?.transactions || 0}</strong>
        </div>
        <div>
          <span className="text-[9px] sm:text-[10px] text-slate-400 block uppercase">Tarif/L</span>
          <strong className="text-slate-800 text-[11px] sm:text-xs">
            {(device.pricePerMl * 1000).toLocaleString("id-ID")}
          </strong>
        </div>
      </div>

      {/* Form Ubah Tarif */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 text-xs">
        <label className="text-slate-700 font-medium shrink-0">
          Ubah Tarif per mL (Rp):
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            step="0.001"
            defaultValue={device.pricePerMl}
            onBlur={(e) => {
              const val = parseFloat(e.target.value);
              if (val && val !== device.pricePerMl) onUpdatePrice(device.id, val);
            }}
            className="w-24 border border-slate-300 rounded px-2 py-1 font-mono text-xs"
          />
          <span className="text-slate-400">
            (Rp {(device.pricePerMl * 1000).toFixed(0)}/L)
          </span>
        </div>
      </div>

      {/* Remote Control Pompa Manual */}
      <div className="pt-2 border-t border-slate-100 space-y-2">
        <span className="text-xs font-semibold text-slate-700 block">
          Uji Coba Remote Pompa (Maintenance)
        </span>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => onSwitchPump(device.code, "ON")}
            className="flex-1 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-medium py-2 px-3 rounded text-xs transition-colors cursor-pointer text-center"
          >
            Nyalakan Pompa (Uji 500mL)
          </button>
          <button
            type="button"
            onClick={() => onSwitchPump(device.code, "OFF")}
            className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium py-2 px-4 rounded text-xs transition-colors cursor-pointer text-center"
          >
            Paksa Matikan Pompa
          </button>
        </div>
      </div>
    </div>
  );
}
