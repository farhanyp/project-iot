"use client";

import { useEffect, useState, useCallback } from "react";

interface LogItem {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  action: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  device?: { code: string };
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [level, setLevel] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/logs?level=${level}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [level]);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/admin/logs?level=${level}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.logs) {
          setLogs(data.logs);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [level]);

  const getLevelBadge = (lvl: LogItem["level"]) => {
    switch (lvl) {
      case "ERROR":
        return "bg-red-50 text-red-700 border-red-300";
      case "WARN":
        return "bg-amber-50 text-amber-700 border-amber-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Log Aktivitas Sistem</h1>
          <p className="text-sm text-slate-500">Audit trail peristiwa sistem, login, pembayaran, dan aksi pompa</p>
        </div>

        {/* Filter Tingkat Urgensi */}
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="filter-level" className="text-slate-600 font-medium">Tingkat:</label>
          <select
            id="filter-level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 font-medium text-slate-700 cursor-pointer shadow-xs"
          >
            <option value="ALL">Semua Level</option>
            <option value="INFO">INFO Saja</option>
            <option value="WARN">WARN Saja</option>
            <option value="ERROR">ERROR Saja</option>
          </select>

          <button
            type="button"
            onClick={fetchLogs}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg font-semibold text-slate-700 shadow-xs cursor-pointer"
          >
            Segarkan
          </button>
        </div>
      </div>

      {/* Tabel Log */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Level</th>
                <th className="py-3 px-4">Kategori Aksi</th>
                <th className="py-3 px-4">Deskripsi Peristiwa</th>
                <th className="py-3 px-4">Perangkat</th>
                <th className="py-3 px-4">Metadata</th>
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
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("id-ID")}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className={`px-2 py-0.5 rounded font-bold border ${getLevelBadge(log.level)}`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-700 max-w-sm">
                      {log.message}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-sans">
                      {log.device?.code || "-"}
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate" title={JSON.stringify(log.metadata)}>
                      {log.metadata ? JSON.stringify(log.metadata) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
