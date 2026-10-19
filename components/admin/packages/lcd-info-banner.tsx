"use client";

export interface LcdInfoBannerProps {
  mqttConnected: boolean;
}

export default function LcdInfoBanner({ mqttConnected }: LcdInfoBannerProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div className="md:col-span-2 bg-blue-50 border border-blue-200 rounded-xl p-3.5 sm:p-4 flex items-start gap-2.5 sm:gap-3 text-xs sm:text-sm text-blue-900">
        <span className="text-base sm:text-lg shrink-0">ℹ️</span>
        <div>
          <p className="font-semibold mb-1">Tata Letak Menu LCD TFT ESP32 (Resolusi 240x320)</p>
          <p className="text-blue-800 text-xs leading-relaxed">
            Layar fisik dispenser ESP32 menampilkan maksimal{" "}
            <strong>3 paket aktif pertama</strong> (diurutkan berdasarkan volume terkecil).
            Paket ke-4 dan seterusnya tetap aktif dan dapat dipilih oleh konsumen melalui Web
            Kiosk browser.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-xs">
        <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Status Sync MQTT
        </span>
        <div className="flex items-center gap-2 mt-1.5 sm:mt-2">
          <span
            className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 ${
              mqttConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            }`}
          />
          <span className="text-xs sm:text-sm font-bold text-slate-800">
            {mqttConnected ? "MQTT Terhubung" : "Menghubungkan Broker..."}
          </span>
        </div>
        <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
          {mqttConnected
            ? "Perubahan disiarkan otomatis ke LCD"
            : "Pesan masuk antrian broker"}
        </p>
      </div>
    </div>
  );
}
