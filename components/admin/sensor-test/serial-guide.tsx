"use client";

export default function SerialGuide() {
  return (
    <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-3 text-xs text-slate-700">
      <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
        <span>⚙️</span>
        <span>Cara Pakai & Perintah Serial Offline</span>
      </h3>

      <p className="text-slate-600 leading-relaxed">
        Selain melalui web ini, Anda juga dapat mengatur jarak tumbler secara instan via{" "}
        <strong>Serial Monitor</strong> (Baudrate 115200):
      </p>

      <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 font-mono text-[11px] space-y-1.5 text-slate-800">
        <div>
          <span className="text-blue-600 font-bold">DIST:10.5</span> &rarr; Ubah jarak acuan ke 10.5 cm
        </div>
        <div>
          <span className="text-blue-600 font-bold">DIST?</span> &rarr; Cek jarak live riil & status tumbler
        </div>
        <div>
          <span className="text-blue-600 font-bold">ALARM:1</span> &rarr; Aktifkan bunyi alarm wadah kosong
        </div>
        <div>
          <span className="text-blue-600 font-bold">ALARM:0</span> &rarr; Matikan bunyi alarm (senyap)
        </div>
        <div>
          <span className="text-blue-600 font-bold">BEEP</span> &rarr; Uji coba bunyi buzzer
        </div>
      </div>

      <div className="pt-1 text-slate-600">
        <strong>Pin Hardware:</strong>
        <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] sm:text-xs">
          <li>
            <strong>TRIG</strong> &rarr; GPIO 25 ESP32
          </li>
          <li>
            <strong>ECHO</strong> &rarr; GPIO 26 ESP32
          </li>
          <li>
            <strong>BUZZER</strong> &rarr; GPIO 27 ESP32
          </li>
          <li>
            <strong>VCC/GND</strong> &rarr; 5V (VIN) &amp; GND
          </li>
        </ul>
      </div>
    </div>
  );
}
