"use client";

export interface LogItem {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  action: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  device?: { code: string };
}

export interface AuditTrailTableProps {
  logs: LogItem[];
  loading: boolean;
}

export function getLogLevelBadge(lvl: LogItem["level"]) {
  switch (lvl) {
    case "ERROR":
      return "bg-red-50 text-red-700 border-red-300";
    case "WARN":
      return "bg-amber-50 text-amber-700 border-amber-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

export default function AuditTrailTable({ logs, loading }: AuditTrailTableProps) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center justify-between sm:hidden">
        <span className="text-xs text-slate-500 font-medium">Tabel Audit Trail</span>
        <span className="text-[11px] text-blue-600 font-medium">(geser horizontal →)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700 min-w-[620px]">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
            <tr>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Waktu</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Level</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Kategori Aksi</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Deskripsi Peristiwa</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Perangkat</th>
              <th className="py-2.5 sm:py-3 px-3 sm:px-4">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400 font-sans">
                  Memuat log aktivitas...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400 font-sans">
                  Tidak ada log tercatat untuk filter ini.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-slate-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("id-ID")}
                  </td>
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-sans">
                    <span
                      className={`px-2 py-0.5 rounded font-bold border ${getLogLevelBadge(
                        log.level
                      )}`}
                    >
                      {log.level}
                    </span>
                  </td>
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-bold text-slate-800">
                    {log.action}
                  </td>
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-sans text-slate-700 max-w-sm">
                    {log.message}
                  </td>
                  <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-slate-500 font-sans">
                    {log.device?.code || "-"}
                  </td>
                  <td
                    className="py-2.5 sm:py-3 px-3 sm:px-4 text-slate-400 max-w-xs truncate"
                    title={JSON.stringify(log.metadata)}
                  >
                    {log.metadata ? JSON.stringify(log.metadata) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
