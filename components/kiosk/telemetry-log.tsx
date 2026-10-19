"use client";

export interface TelemetryEvent {
  timestamp: string;
  eventType?: string;
  type?: string;
  data?: unknown;
}

export interface TelemetryLogProps {
  events: TelemetryEvent[];
}

export default function TelemetryLog({ events }: TelemetryLogProps) {
  return (
    <details className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 text-xs sm:text-sm text-slate-700 shadow-sm">
      <summary className="font-semibold cursor-pointer text-slate-900 text-sm sm:text-base select-none flex items-center justify-between">
        <span>Live MQTT & WebSocket Log ({events.length} event)</span>
        <span className="text-xs text-slate-400 font-normal">Tekan untuk buka/tutup</span>
      </summary>
      <div className="mt-3 p-2.5 sm:p-3 bg-slate-950 text-slate-200 rounded-lg font-mono text-[10px] sm:text-xs md:text-sm h-36 sm:h-40 overflow-y-auto space-y-1 sm:space-y-1.5">
        {events.length === 0 ? (
          <div className="text-slate-500 text-center py-10 sm:py-12">Menunggu data MQTT...</div>
        ) : (
          events.map((ev, i) => (
            <div key={i} className="flex gap-1.5 sm:gap-2 border-b border-slate-800/60 pb-1 leading-relaxed">
              <span className="text-slate-400 shrink-0">
                {new Date(ev.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-cyan-400 shrink-0">
                [{ev.eventType || ev.type}]
              </span>
              <span className="truncate">{JSON.stringify(ev.data || {})}</span>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
