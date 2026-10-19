"use client";

export interface StatsData {
  todayRevenue: number;
  weekRevenue: number;
  totalRevenue: number;
  totalDispensedLiters: string;
  totalTransactions: number;
}

export interface MetricCardsProps {
  stats: StatsData | null;
}

export default function MetricCards({ stats }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
        <span className="text-[10px] sm:text-xs uppercase font-semibold text-slate-500 tracking-wider">
          Omset Hari Ini
        </span>
        <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono truncate">
          Rp {(stats?.todayRevenue || 0).toLocaleString("id-ID")}
        </div>
        <p className="text-[10px] sm:text-[11px] text-slate-400">Sejak 00:00 WIB</p>
      </div>

      <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
        <span className="text-[10px] sm:text-xs uppercase font-semibold text-slate-500 tracking-wider">
          Omset 7 Hari
        </span>
        <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono truncate">
          Rp {(stats?.weekRevenue || 0).toLocaleString("id-ID")}
        </div>
        <p className="text-[10px] sm:text-[11px] text-slate-400">Minggu berjalan</p>
      </div>

      <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
        <span className="text-[10px] sm:text-xs uppercase font-semibold text-slate-500 tracking-wider">
          Total Pendapatan
        </span>
        <div className="text-lg sm:text-2xl font-bold text-emerald-700 font-mono truncate">
          Rp {(stats?.totalRevenue || 0).toLocaleString("id-ID")}
        </div>
        <p className="text-[10px] sm:text-[11px] text-slate-400">Seluruh transaksi lunas</p>
      </div>

      <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-1">
        <span className="text-[10px] sm:text-xs uppercase font-semibold text-slate-500 tracking-wider">
          Air Terjual
        </span>
        <div className="text-lg sm:text-2xl font-bold text-blue-700 font-mono truncate">
          {stats?.totalDispensedLiters || 0}{" "}
          <span className="text-xs sm:text-sm font-normal text-slate-500">Liter</span>
        </div>
        <p className="text-[10px] sm:text-[11px] text-slate-400">
          {stats?.totalTransactions || 0} total transaksi
        </p>
      </div>
    </div>
  );
}
