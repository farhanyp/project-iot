"use client";

import React, { useState } from "react";
import { IconTerminal, IconChevronDown } from "@/components/icons";
import { IoTEvent } from "@/lib/use-iot-socket";

interface EventLogCardProps {
  events: IoTEvent[];
}

export function EventLogCard({ events }: EventLogCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="bg-[#086288]/10 border border-[#4D8DBA]/25 rounded-2xl p-6 space-y-4 backdrop-blur-md shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#086288]/20 border border-[#4D8DBA]/30 flex items-center justify-center text-[#97D7FF]">
            <IconTerminal className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Live MQTT & WebSocket Stream
              </h3>
              <span className="w-2 h-2 rounded-full bg-[#97D7FF] animate-pulse" />
            </div>
            <p className="text-[11px] text-[#97D7FF]/70">Log telemetri real-time mikrokontroler</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[#4D8DBA]">
            {events.length} Event Terakhir
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg hover:bg-[#086288]/30 text-[#97D7FF] transition-colors cursor-pointer"
            title={isExpanded ? "Sembunyikan log" : "Tampilkan log"}
          >
            <IconChevronDown
              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="bg-[#06121a]/95 rounded-xl border border-[#4D8DBA]/20 p-3 h-48 overflow-y-auto font-mono text-xs space-y-2 select-text scrollbar-thin scrollbar-thumb-[#4D8DBA]/30">
          {events.length === 0 ? (
            <div className="text-[#4D8DBA]/60 text-center py-16 text-xs font-sans">
              Belum ada pesan MQTT masuk. Menunggu event dari broker Mosquitto...
            </div>
          ) : (
            events.map((ev, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 border-b border-[#4D8DBA]/10 pb-1.5 text-slate-300 hover:bg-[#086288]/15 px-1 rounded transition-colors"
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[#4D8DBA] text-[10px]">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#086288]/30 text-[#FFEFC4] border border-[#4D8DBA]/30 font-medium">
                    {ev.eventType || ev.type}
                  </span>
                </div>
                <span className="text-[#97D7FF]/80 text-[11px] truncate">{ev.topic || "-"}</span>
                <span className="text-slate-200 sm:ml-auto truncate max-w-sm text-[11px] font-sans">
                  {JSON.stringify(ev.data || {})}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
