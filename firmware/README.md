# Panduan Firmware ESP32 MicroPython (WaterVend IoT)

Firmware ini merupakan konversi 100% dari `esp32_dispenser.ino` ke bahasa **Python (MicroPython)** di file [`main.py`](file:///d:/Kerja/mandiri/project-air-minum-otomatis-berbayar/firmware/main.py).

Kelebihan utama menggunakan MicroPython:
- **Tanpa Kompilasi Lambat**: Tidak perlu menunggu Arduino IDE yang berat dan lama melakukan *compile*.
- **Upload 1 Detik**: Mengirim kode langsung ke chip ESP32 seketika.
- **Bisa langsung di VS Code / Antigravity**: Menggunakan terminal atau extension MicroPico.

---

## 1. Pin Hardware (Sama Persis dengan Versi Arduino)

| Komponen | Pin ESP32 | Keterangan |
| :--- | :--- | :--- |
| **HX711 DT (Data)** | **GPIO 16 (D16)** | Data serial dari Load Cell |
| **HX711 SCK (Clock)** | **GPIO 4 (D4)** | Clock serial Load Cell |
| **Relay Ch 1 (Pompa)** | **GPIO 5 (D5)** | Active LOW (Pompa BR314) |
| **Relay Ch 2 (Spare)** | **GPIO 19 (D19)** | Cadangan (Pindah dari 18 karena 18 dipakai TFT SCK) |
| **TFT SPI SCL / SCK** | **GPIO 18** | VSPI SCK bawaan ESP32 |
| **TFT SPI SDA / MOSI** | **GPIO 23** | VSPI MOSI bawaan ESP32 |
| **TFT SPI DC** | **GPIO 2** | Data / Command LCD |
| **TFT SPI RES / RST** | **GPIO 15** | Reset LCD |
| **TFT SPI CS** | **GPIO 17** | Chip Select LCD (None jika modul 7-pin tanpa CS) |
| **TFT VCC & BLK** | **3.3V / 5V** | Power & Backlight (BLK ke 3.3V) |
| **TFT GND** | **GND** | Ground |
| **Tombol BOOT** | **GPIO 0** | Reset config ke default |


---

## 2. Pengaturan WiFi & Broker ([`config.json`](file:///d:/Kerja/mandiri/project-air-minum-otomatis-berbayar/firmware/config.json))

Sebelum menjalankan program, buka [`firmware/config.json`](file:///d:/Kerja/mandiri/project-air-minum-otomatis-berbayar/firmware/config.json) dan sesuaikan:

```json
{
  "wifi_ssid": "NAMA_WIFI_ATAU_HOTSPOT_ANDA",
  "wifi_password": "PASSWORD_WIFI_ANDA",
  "mqtt_broker": "10.10.4.229",
  "mqtt_port": 1883,
  "device_id": "DISPENSER-01",
  "cal_factor": -420.0,
  "max_weight": 2500.0,
  "flow_rate_ml_per_sec": 25.0
}
```

---

## 3. Cara Flashing MicroPython ke ESP32 (Hanya Perlu 1 Kali)

Jika ESP32 Anda belum terinstal firmware MicroPython:

1. Unduh firmware MicroPython ESP32 resmi (.bin):
   - [MicroPython ESP32 Generic Release](https://micropython.org/download/esp32/) (pilih versi standard .bin terbaru)
2. Hapus flash lama dan pasang MicroPython via Terminal:
   ```powershell
   # 1. Hapus memori flash lama
   esptool --chip esp32 --port COM3 erase_flash

   # 2. Flash binary MicroPython
   esptool --chip esp32 --port COM3 --baud 460800 write_flash -z 0x1000 ESP32_GENERIC-xxxx.bin
   ```

---

## 4. Cara Upload & Jalankan `main.py` Cepat (Tanpa Arduino IDE)

### Opsi A: Menggunakan `mpremote` (Paling Cepat via Terminal)
Cukup install `mpremote`:
```powershell
pip install mpremote
```

Kirim file ke ESP32:
```powershell
cd firmware
mpremote connect COM3 cp config.json :config.json
mpremote connect COM3 cp uQR.py :uQR.py
mpremote connect COM3 cp st7789py.py :st7789py.py
mpremote connect COM3 cp vga2_8x8.py :vga2_8x8.py
mpremote connect COM3 cp vga2_16x16.py :vga2_16x16.py
mpremote connect COM3 cp main.py :main.py
mpremote connect COM3 reset

```
ESP32 akan langsung me-reboot dan menjalankan `main.py` secara otomatis!

Untuk memantau serial monitor langsung di terminal:
```powershell
mpremote connect COM3 repl
```

---

### Opsi B: Menggunakan VS Code Extension (`MicroPico`)
1. Di VS Code, buka menu **Extensions** (Ctrl+Shift+X).
2. Cari dan pasang ekstensi **MicroPico** (oleh Paul Obermuller).
3. Sambungkan ESP32 di port USB.
4. Klik tombol **Upload project to device** di status bar bawah VS Code. File akan ditransfer dalam hitungan detik.

---

### Opsi C: Menggunakan Thonny IDE (Sangat Ringan, ~20MB)
1. Unduh dan buka [Thonny](https://thonny.org/).
2. Di pojok kanan bawah, pilih **MicroPython (ESP32)** pada port **COM3**.
3. Buka file [`firmware/main.py`](file:///d:/Kerja/mandiri/project-air-minum-otomatis-berbayar/firmware/main.py).
4. Klik tombol ikon Hijau (**Run**) atau simpan sebagai `main.py` di ESP32.
