"use client";

export interface GallonStats {
  capacityMl: number;
  usedMl: number;
  usedLiters: string;
  remainingMl: number;
  remainingLiters: string;
  remainingPercent: number;
  estimatedBottles600ml: number;
  estimatedCups200ml: number;
  lastResetAt: string | null;
}

export interface StatsData {
  todayRevenue: number;
  todayTransactions: number;
  weekRevenue: number;
  weekTransactions: number;
  totalRevenue: number;
  totalTransactions: number;
  totalDispensedLiters: string;
  gallon?: GallonStats;
}

export interface MetricCardsProps {
  stats: StatsData | null;
}

export default function MetricCards({ stats }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Transaksi Hari Ini */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">
            Hari Ini
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono">
            {stats?.todayTransactions || 0} Tx
          </span>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono truncate">
            Rp {(stats?.todayRevenue || 0).toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {stats?.todayTransactions || 0} transaksi sejak 00:00 WIB
          </p>
        </div>
      </div>

      {/* Transaksi Minggu Ini (7 Hari) */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">
            Minggu Ini (7 Hari)
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-mono">
            {stats?.weekTransactions || 0} Tx
          </span>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono truncate">
            Rp {(stats?.weekRevenue || 0).toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {stats?.weekTransactions || 0} transaksi dalam 7 hari
          </p>
        </div>
      </div>

      {/* Total Transaksi Dari Awal */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">
            Total Dari Awal
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono">
            {stats?.totalTransactions || 0} Tx
          </span>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-700 font-mono truncate">
            Rp {(stats?.totalRevenue || 0).toLocaleString("id-ID")}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Seluruh transaksi lunas tercatat
          </p>
        </div>
      </div>

      {/* Total Air Terjual */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">
            Total Air Terjual
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700">
            Dispensed
          </span>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-bold text-blue-700 font-mono truncate">
            {stats?.totalDispensedLiters || 0}{" "}
            <span className="text-xs sm:text-sm font-normal text-slate-500">Liter</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Akumulasi debit air dari dispenser
          </p>
        </div>
      </div>
    </div>
  );
}
