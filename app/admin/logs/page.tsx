"use client";

import { useEffect, useState, useCallback } from "react";
import AuditTrailTable, { LogItem } from "@/components/admin/logs/audit-trail-table";

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

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Log Aktivitas Sistem
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Audit trail peristiwa sistem, login, pembayaran, dan aksi pompa
          </p>
        </div>

        {/* Filter Tingkat Urgensi */}
        <div className="flex items-center gap-2 text-xs self-start sm:self-auto">
          <label htmlFor="filter-level" className="text-slate-600 font-medium">
            Tingkat:
          </label>
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
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-lg font-semibold text-slate-700 shadow-xs cursor-pointer"
          >
            Segarkan
          </button>
        </div>
      </div>

      {/* Tabel Log */}
      <AuditTrailTable logs={logs} loading={loading} />
    </div>
  );
}
