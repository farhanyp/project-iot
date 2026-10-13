# -*- coding: utf-8 -*-
"""
Firmware ESP32 Dispenser Air Minum Otomatis Berbayar (WaterVend IoT)
MicroPython - Self-Contained, Memory-Optimized & Built-in ST7789 Display Driver

Hardware:
- ESP32 DevKit V1
- Load Cell 5kg + Modul HX711 (DT: GPIO 16, SCK: GPIO 4)
- Relay Pompa BR314: GPIO 5 (Active LOW)
- Relay Cadangan: GPIO 19
- LCD TFT SPI ST7789 240x320:
    - SCL / SCK  : GPIO 18 (VSPI SCK)
    - SDA / MOSI : GPIO 23 (VSPI MOSI)
    - DC         : GPIO 2
    - RES / RST  : GPIO 15
    - CS         : GPIO 17 (atau None jika 7-pin)
    - VCC & BLK  : 3.3V / 5V (BLK ke 3.3V)
    - GND        : GND
"""

import time
import gc
import machine
from machine import Pin, SPI
import network
import ujson as json
import usocket as socket
import ustruct as struct
import framebuf

# Bersihkan memori awal agar RAM selalu lega untuk Wi-Fi
gc.collect()

# ==============================================================================
# 1. KONFIGURASI FLASH (/config.json)
# ==============================================================================
CONFIG_FILE = "config.json"
DEFAULT_CONFIG = {
    "wifi_ssid": "KHUSNUL",
    "wifi_password": "bogan123",
    "mqtt_broker": "192.168.1.4",
    "mqtt_port": 1883,
    "device_id": "DISPENSER-01",
    "cal_factor": -420.0,
    "max_weight": 2500.0,
    "flow_rate_ml_per_sec": 25.0
}

def load_config():
    config = dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_FILE, "r") as f:
            config.update(json.load(f))
            print(f"[CONFIG] Dimuat dari '{CONFIG_FILE}'.")
    except Exception:
        save_config(config)
    return config

def save_config(config):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f)
        print(f"[CONFIG] Disimpan ke flash.")
    except Exception as e:
        print("[CONFIG ERROR]", e)

# ==============================================================================
# 2. DEFINISI PIN & KONTROL RELAY
# ==============================================================================
PIN_HX711_DT        = 16
PIN_HX711_SCK       = 4
PIN_RELAY_PUMP_CH1  = 5
PIN_RELAY_SPARE_CH2 = 19

PIN_TFT_SCK         = 18
PIN_TFT_MOSI        = 23
PIN_TFT_DC          = 2
PIN_TFT_RST         = 15
PIN_TFT_CS          = 17

spare_relay_pin = Pin(PIN_RELAY_SPARE_CH2, Pin.IN)
pump_pin = Pin(PIN_RELAY_PUMP_CH1, Pin.IN)

def start_pump():
    global pump_pin
    pump_pin = Pin(PIN_RELAY_PUMP_CH1, Pin.OUT)
    pump_pin.value(0)
    print("[POMPA] HIDUP (ON) -> Air mengalir.")

def stop_pump():
    global pump_pin
    pump_pin = Pin(PIN_RELAY_PUMP_CH1, Pin.IN)
    print("[POMPA] MATI (OFF) -> Aliran air berhenti.")

# ==============================================================================
# 3. DRIVER SENSOR LOAD CELL HX711 (BITBANG)
# ==============================================================================
def is_adc_valid(raw):
    return (-8300000 < raw < 8300000) and (raw != 0) and (raw != -1)

class HX711:
    def __init__(self, d_out, pd_sck):
        self.p_dout = Pin(d_out, Pin.IN)
        self.p_sck = Pin(pd_sck, Pin.OUT)
        self.p_sck.value(0)
        self.offset = 0
        self.scale = -420.0

    def is_ready(self):
        return self.p_dout.value() == 0

    def wait_ready_timeout(self, timeout_ms=500):
        start = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), start) < timeout_ms:
            if self.is_ready():
                return True
            time.sleep_ms(2)
        return False

    def read_raw(self):
        state = machine.disable_irq()
        try:
            raw = 0
            for _ in range(24):
                self.p_sck.value(1)
                time.sleep_us(1)
                raw = (raw << 1) | self.p_dout.value()
                self.p_sck.value(0)
                time.sleep_us(1)
            # Pulsa 25: Gain 128 Channel A
            self.p_sck.value(1)
            time.sleep_us(1)
            self.p_sck.value(0)
            time.sleep_us(1)
        finally:
            machine.enable_irq(state)

        if raw & 0x800000:
            raw -= 0x1000000
        return raw

    def read_average(self, times=3):
        sum_val, count = 0, 0
        for _ in range(times):
            if self.wait_ready_timeout(80):
                r = self.read_raw()
                if is_adc_valid(r):
                    sum_val += r
                    count += 1
            time.sleep_ms(3)
        return int(sum_val / count) if count > 0 else self.read_raw()

    def tare(self, times=5):
        self.offset = self.read_average(times)
        return self.offset

    def set_scale(self, scale):
        self.scale = float(scale) if scale != 0 else 1.0

    def get_value(self, times=1):
        return self.read_average(times) - self.offset

    def get_units(self, times=1):
        return float(self.get_value(times)) / self.scale

# ==============================================================================
# 4. DRIVER LCD TFT SPI ST7789 BUILT-IN (240x320 & 0-RAM FONT)
# ==============================================================================
# Definisi Warna RGB565 Standar
BLACK      = const(0x0000)
WHITE      = const(0xFFFF)
RED        = const(0xF800)
GREEN      = const(0x07E0)
BLUE       = const(0x001F)
CYAN       = const(0x07FF)
YELLOW     = const(0xFFE0)
NAVY       = const(0x10E8)
QRIS_RED   = const(0xD800)

_char_buf = bytearray(8)
_fb_char = framebuf.FrameBuffer(_char_buf, 8, 8, framebuf.MONO_HLSB)

class BuiltinST7789:
    """Driver ringan ST7789 SPI mandiri tanpa perlu file modul eksternal."""
    def __init__(self, sck=18, mosi=23, dc=2, rst=15, cs=17):
        self.width = 240
        self.height = 320
        self.dc = Pin(dc, Pin.OUT)
        self.cs = Pin(cs, Pin.OUT) if cs is not None else None
        self.rst = Pin(rst, Pin.OUT) if rst is not None else None
        self.spi = SPI(2, baudrate=30000000, sck=Pin(sck), mosi=Pin(mosi))
        self.init()

    def _cmd(self, c, data=None):
        self.dc.value(0)
        if self.cs: self.cs.value(0)
        self.spi.write(bytearray([c]))
        if data:
            self.dc.value(1)
            self.spi.write(data)
        if self.cs: self.cs.value(1)

    def init(self):
        if self.rst:
            self.rst.value(0)
            time.sleep_ms(30)
            self.rst.value(1)
            time.sleep_ms(120)
        self._cmd(0x11)          # Sleep out
        time.sleep_ms(120)
        self._cmd(0x36, b'\x00') # MADCTL (Portrait 240x320)
        self._cmd(0x3A, b'\x55') # COLMOD (16-bit RGB565)
        self._cmd(0x21)          # Inversion ON
        self._cmd(0x29)          # Display ON
        time.sleep_ms(20)

    def set_window(self, x0, y0, x1, y1):
        self._cmd(0x2A, struct.pack(">HH", x0, x1))
        self._cmd(0x2B, struct.pack(">HH", y0, y1))
        self._cmd(0x2C)

    def fill_rect(self, x, y, w, h, color):
        if w <= 0 or h <= 0: return
        x = max(0, min(x, self.width - 1))
        y = max(0, min(y, self.height - 1))
        w = min(w, self.width - x)
        h = min(h, self.height - y)
        self.set_window(x, y, x + w - 1, y + h - 1)
        chunk = struct.pack(">H", color) * 64
        total = w * h
        self.dc.value(1)
        if self.cs: self.cs.value(0)
        for _ in range(total // 64):
            self.spi.write(chunk)
        rem = total % 64
        if rem:
            self.spi.write(struct.pack(">H", color) * rem)
        if self.cs: self.cs.value(1)

    def fill(self, color):
        self.fill_rect(0, 0, self.width, self.height, color)

    def rect(self, x, y, w, h, color):
        self.fill_rect(x, y, w, 1, color)
        self.fill_rect(x, y + h - 1, w, 1, color)
        self.fill_rect(x, y, 1, h, color)
        self.fill_rect(x + w - 1, y, 1, h, color)

    def text(self, s, x, y, fg=WHITE, bg=None, size=1):
        """Gambar teks menggunakan framebuf bawaan C (size 1=8x8, size 2=16x16)"""
        if bg is not None:
            self.fill_rect(x, y, len(s) * 8 * size, 8 * size, bg)
        for char in s:
            _fb_char.fill(0)
            _fb_char.text(char, 0, 0, 1)
            for r in range(8):
                b = _char_buf[r]
                if not b: continue
                c = 0
                while c < 8:
                    if (b >> (7 - c)) & 1:
                        start_c = c
                        while c < 8 and ((b >> (7 - c)) & 1):
                            c += 1
                        self.fill_rect(x + start_c * size, y + r * size, (c - start_c) * size, size, fg)
                    else:
                        c += 1
            x += 8 * size

class DisplayUI:
    """Manajer Halaman Layar LCD Dispenser & QRIS"""
    def __init__(self):
        self.tft = None
        self.enabled = False
        self.current_screen = "BOOT"
        self.last_weight = -999.0
        self.last_ml = -1
        self.last_bar_w = -1
        self.reset_timer = 0

    def init_display(self):
        try:
            self.tft = BuiltinST7789(PIN_TFT_SCK, PIN_TFT_MOSI, PIN_TFT_DC, PIN_TFT_RST, PIN_TFT_CS)
            self.tft.fill(BLACK)
            self.enabled = True
            print("[TFT LCD] [OK] Driver Layar ST7789 240x320 Aktif!")
        except Exception as err:
            print(f"[TFT LCD INFO] LCD belum aktif / modul belum dipasang: {err}")
            self.enabled = False

    def show_boot(self, msg="Memulai Sistem..."):
        if not self.enabled: return
        self.current_screen = "BOOT"
        self.tft.fill(BLACK)
        self.tft.fill_rect(0, 0, 240, 40, BLUE)
        self.tft.text("WATERVEND IoT", 20, 12, WHITE, BLUE, size=2)
        self.tft.text("Dispenser Air Mandiri", 25, 70, CYAN, size=1)
        self.tft.text(msg[:22], 15, 140, YELLOW, size=1)
        self.tft.text("Menghubungkan Jaringan...", 15, 260, WHITE, size=1)

    def show_standby_menu(self, weight_g=0.0, is_ready=True):
        if not self.enabled: return
        self.current_screen = "STANDBY"
        self.last_weight = -999.0
        self.tft.fill(BLACK)

        # Header Banner
        self.tft.fill_rect(0, 0, 240, 36, BLUE)
        self.tft.text("WATERVEND IoT", 20, 10, WHITE, BLUE, size=2)

        # Kotak Menu 1: Gelas 250 mL
        self.tft.rect(10, 44, 220, 50, CYAN)
        self.tft.text("1. Gelas (250 mL)", 20, 52, WHITE, size=2)
        self.tft.text("Tarif: Rp 2.500", 20, 74, GREEN, size=1)

        # Kotak Menu 2: Botol 600 mL
        self.tft.rect(10, 100, 220, 50, CYAN)
        self.tft.text("2. Botol (600 mL)", 20, 108, WHITE, size=2)
        self.tft.text("Tarif: Rp 6.000", 20, 130, GREEN, size=1)

        # Kotak Menu 3: Teko 1500 mL
        self.tft.rect(10, 156, 220, 50, CYAN)
        self.tft.text("3. Teko (1500 mL)", 20, 164, WHITE, size=2)
        self.tft.text("Tarif: Rp 15.000", 20, 186, GREEN, size=1)

        # Footer Status Timbangan
        self.tft.fill_rect(0, 216, 240, 104, NAVY)
        self.tft.fill_rect(0, 216, 240, 2, CYAN)
        self.update_standby_weight(weight_g, is_ready, force=True)
        self.tft.text("Pilih Menu di Layar / Web", 20, 268, WHITE, size=1)
        self.tft.text("WiFi: OK | MQTT: OK", 35, 292, CYAN, size=1)

    def update_standby_weight(self, weight_g, is_ready=True, force=False):
        if not self.enabled or self.current_screen != "STANDBY": return
        if not force and abs(weight_g - self.last_weight) < 0.5: return

        self.last_weight = weight_g
        self.tft.fill_rect(10, 228, 220, 30, NAVY)
        if is_ready:
            self.tft.text(f"Beban: {weight_g:.1f} g", 20, 234, YELLOW, size=2)
            self.tft.text("[SIAP]", 180, 238, GREEN, size=1)
        else:
            self.tft.text("Beban: -- g", 20, 234, RED, size=2)
            self.tft.text("[CEK HX]", 165, 238, RED, size=1)

    def show_qris(self, nominal_str, qr_payload):
        if not self.enabled: return
        self.current_screen = "QRIS"
        self.tft.fill(BLACK)
        self.tft.fill_rect(0, 0, 240, 36, QRIS_RED)
        self.tft.text("BAYAR VIA QRIS", 15, 10, WHITE, QRIS_RED, size=2)

        # Coba generate QR jika modul uQR ada di ESP32
        qr_drawn = False
        try:
            from uQR import QRCode
            qr = QRCode()
            qr.add_data(qr_payload)
            qr.make()
            m = qr.get_matrix()
            n = len(m)
            scale = 3 if n <= 45 else 2
            if n <= 29: scale = 4
            qr_w = n * scale
            x_off = (240 - qr_w) // 2
            y_off = 45

            self.tft.fill_rect(x_off - 6, y_off - 6, qr_w + 12, qr_w + 12, WHITE)
            for r in range(n):
                row = m[r]
                c = 0
                while c < n:
                    if row[c]:
                        start_c = c
                        while c < n and row[c]:
                            c += 1
                        self.tft.fill_rect(x_off + start_c * scale, y_off + r * scale, (c - start_c) * scale, scale, BLACK)
                    else:
                        c += 1
            qr_drawn = True
            bottom_y = y_off + qr_w + 12
        except Exception:
            qr_drawn = False

        if not qr_drawn:
            self.tft.rect(20, 55, 200, 110, WHITE)
            self.tft.text("SCAN QRIS DI WEB", 30, 90, YELLOW, size=1)
            self.tft.text("Dashboard Aktif", 40, 120, CYAN, size=1)
            bottom_y = 180

        self.tft.text(f"Rp {nominal_str}", 30, bottom_y, YELLOW, size=2)
        self.tft.text("Gopay / OVO / Dana / BCA", 20, bottom_y + 26, WHITE, size=1)
        self.tft.text("Menunggu Pembayaran...", 20, bottom_y + 44, GREEN, size=1)

    def show_dispensing(self, target_ml):
        if not self.enabled: return
        self.current_screen = "DISPENSING"
        self.last_ml = -1
        self.last_bar_w = -1
        self.tft.fill(BLACK)

        self.tft.fill_rect(0, 0, 240, 36, BLUE)
        self.tft.text("PENGISIAN AIR", 20, 10, WHITE, BLUE, size=2)

        self.tft.text(f"Target: {target_ml} mL", 20, 50, CYAN, size=2)
        self.tft.text("Volume Terisi:", 20, 80, WHITE, size=1)
        self.tft.text("Berat Real-Time:", 20, 146, WHITE, size=1)

        self.tft.rect(20, 218, 200, 24, WHITE)
        self.tft.text("Pompa Aktif | [STOP] di Web", 15, 260, RED, size=1)
        self.update_dispensing(0, 0.0, target_ml)

    def update_dispensing(self, dispensed_ml, weight_g, target_ml):
        if not self.enabled or self.current_screen != "DISPENSING": return
        if dispensed_ml == self.last_ml: return
        self.last_ml = dispensed_ml

        # Angka volume
        self.tft.fill_rect(20, 98, 200, 36, BLACK)
        self.tft.text(f"{dispensed_ml} mL", 20, 104, YELLOW, size=2)

        # Angka berat
        self.tft.fill_rect(20, 164, 200, 36, BLACK)
        self.tft.text(f"{weight_g:.1f} g", 20, 170, GREEN, size=2)

        # Bar grafik
        pct = min(1.0, max(0.0, float(dispensed_ml) / float(target_ml) if target_ml > 0 else 0.0))
        target_w = int(pct * 196)
        if target_w > self.last_bar_w:
            start_x = 22 + max(0, self.last_bar_w)
            draw_w = target_w - max(0, self.last_bar_w)
            self.tft.fill_rect(start_x, 220, draw_w, 20, CYAN)
            self.last_bar_w = target_w

    def show_complete(self, status, dispensed_ml, weight_g, message=""):
        if not self.enabled: return
        self.current_screen = "COMPLETE"
        self.reset_timer = time.ticks_add(time.ticks_ms(), 5000)
        self.tft.fill(BLACK)

        if status == "COMPLETED":
            self.tft.fill_rect(0, 0, 240, 40, GREEN)
            self.tft.text("SELESAI !", 60, 12, WHITE, GREEN, size=2)
            self.tft.text(f"Total: {dispensed_ml} mL", 25, 75, YELLOW, size=2)
            self.tft.text(f"Berat: {weight_g:.1f} g", 25, 115, WHITE, size=2)
            self.tft.text("Silakan ambil wadah Anda.", 15, 170, GREEN, size=1)
            self.tft.text("Terima Kasih!", 35, 215, CYAN, size=2)
        else:
            self.tft.fill_rect(0, 0, 240, 40, RED)
            self.tft.text("STOP DARURAT !", 15, 12, WHITE, RED, size=2)
            self.tft.text(f"Terisi: {dispensed_ml} mL", 25, 75, YELLOW, size=2)
            self.tft.text(f"Berat : {weight_g:.1f} g", 25, 115, WHITE, size=2)
            self.tft.text(message[:28] if message else "Pengisian dihentikan", 10, 170, RED, size=1)
            self.tft.text("Pompa telah dimatikan.", 15, 200, WHITE, size=1)

    def check_auto_reset(self, weight_g, is_ready):
        if not self.enabled: return
        if self.current_screen == "COMPLETE" and time.ticks_diff(time.ticks_ms(), self.reset_timer) >= 0:
            self.show_standby_menu(weight_g, is_ready)

tft_ui = DisplayUI()

# ==============================================================================
# 5. EMBEDDED MQTT CLIENT (LIGHTWEIGHT 3.1.1)
# ==============================================================================
class MiniMQTTClient:
    def __init__(self, client_id, server, port=1883, keepalive=60):
        self.client_id = client_id
        self.server = server
        self.port = port
        self.keepalive = keepalive
        self.sock = None
        self.pid = 0
        self.cb = None
        self.lw_topic = None
        self.lw_msg = None

    def set_callback(self, f):
        self.cb = f

    def set_last_will(self, topic, msg, retain=False):
        self.lw_topic = topic
        self.lw_msg = msg

    def connect(self, clean_session=True):
        addr = socket.getaddrinfo(self.server, self.port)[0][-1]
        self.sock = socket.socket()
        self.sock.settimeout(8.0)
        self.sock.connect(addr)

        client_id_bytes = self.client_id.encode("utf-8")
        msg = bytearray(b"\x00\x04MQTT\x04\x00\x00\x00")
        msg[7] = clean_session << 1
        msg[8] = self.keepalive >> 8
        msg[9] = self.keepalive & 0xFF

        lw_topic_bytes = self.lw_topic.encode("utf-8") if self.lw_topic else None
        lw_msg_bytes = self.lw_msg.encode("utf-8") if self.lw_msg else None
        if lw_topic_bytes:
            msg[7] |= 0x4 | (1 << 3)

        payload = bytearray()
        payload.extend(struct.pack("!H", len(client_id_bytes)) + client_id_bytes)
        if lw_topic_bytes:
            payload.extend(struct.pack("!H", len(lw_topic_bytes)) + lw_topic_bytes)
            payload.extend(struct.pack("!H", len(lw_msg_bytes)) + lw_msg_bytes)

        remaining_length = len(msg) + len(payload)
        packet = bytearray([0x10])
        while remaining_length > 0:
            encoded_byte = remaining_length % 128
            remaining_length //= 128
            if remaining_length > 0: encoded_byte |= 128
            packet.append(encoded_byte)

        packet.extend(msg)
        packet.extend(payload)
        self.sock.write(packet)
        resp = self.sock.read(4)
        if resp[0] != 0x20 or resp[3] != 0x00:
            raise OSError(f"MQTT Connect gagal: {resp[3]}")

    def publish(self, topic, msg, retain=False, qos=0):
        if not self.sock: return
        topic_bytes = topic.encode("utf-8")
        msg_bytes = msg.encode("utf-8")
        packet_type = 0x30 | (retain & 1)
        remaining_len = 2 + len(topic_bytes) + len(msg_bytes)
        packet = bytearray([packet_type])
        while remaining_len > 0:
            b = remaining_len % 128
            remaining_len //= 128
            if remaining_len > 0: b |= 128
            packet.append(b)
        packet.extend(struct.pack("!H", len(topic_bytes)) + topic_bytes)
        packet.extend(msg_bytes)
        self.sock.write(packet)

    def subscribe(self, topic, qos=0):
        if not self.sock: return
        topic_bytes = topic.encode("utf-8")
        self.pid += 1
        rem_len = 2 + 2 + len(topic_bytes) + 1
        packet = bytearray([0x82, rem_len])
        packet.extend(struct.pack("!H", self.pid))
        packet.extend(struct.pack("!H", len(topic_bytes)) + topic_bytes)
        packet.append(qos)
        self.sock.write(packet)
        self.sock.read(5)

    def check_msg(self):
        if not self.sock: return
        self.sock.settimeout(0.02)
        try:
            res = self.sock.read(1)
        except OSError:
            return
        if not res: return
        op = res[0]
        if op == 0xD0: # PINGRESP
            self.sock.read(1)
            return
        if op & 0xF0 == 0x30: # PUBLISH
            sz = self._recv_len()
            topic_len = struct.unpack("!H", self.sock.read(2))[0]
            topic = self.sock.read(topic_len).decode("utf-8")
            sz -= (2 + topic_len)
            msg = self.sock.read(sz).decode("utf-8") if sz > 0 else ""
            if self.cb: self.cb(topic, msg)

    def _recv_len(self):
        n, sh = 0, 0
        while True:
            b = self.sock.read(1)[0]
            n |= (b & 0x7F) << sh
            if not (b & 0x80): return n
            sh += 7

    def ping(self):
        if self.sock:
            try: self.sock.write(b"\xC0\0")
            except Exception: pass

# ==============================================================================
# 6. INISIALISASI VARIABEL GLOBAL
# ==============================================================================
config = load_config()

DEVICE_ID            = config["device_id"]
MQTT_BROKER          = config["mqtt_broker"]
MQTT_PORT            = config["mqtt_port"]
calibration_factor   = float(config["cal_factor"])
max_weight_limit     = float(config["max_weight"])
pump_flow_rate       = float(config["flow_rate_ml_per_sec"])

TOPIC_STATUS    = f"water/dispenser/{DEVICE_ID}/status"
TOPIC_COMMAND   = f"water/dispenser/{DEVICE_ID}/command"
TOPIC_TELEMETRY = f"water/dispenser/{DEVICE_ID}/telemetry"
TOPIC_COMPLETE  = f"water/dispenser/{DEVICE_ID}/complete"

scale = HX711(PIN_HX711_DT, PIN_HX711_SCK)
scale.set_scale(calibration_factor)

is_scale_ready          = False
last_raw_adc            = 0
last_net_value          = 0
initial_container_weight = 0.0
dispensed_weight_grams  = 0.0
dispensed_ml            = 0
current_live_weight     = 0.0

is_dispensing           = False
target_ml               = 0
dispense_start_time     = 0
last_telemetry_time     = 0
last_ping_time          = 0
current_transaction_id  = ""

mqtt_client = None

def setup_load_cell():
    global is_scale_ready, last_raw_adc, last_net_value, scale, calibration_factor
    print("\n[HX711] Inisialisasi sensor timbangan (DT: D16, SCK: D4)...")
    if scale.wait_ready_timeout(600):
        last_raw_adc = scale.read_raw()
        if is_adc_valid(last_raw_adc):
            is_scale_ready = True
            scale.set_scale(calibration_factor)
            scale.tare(5)
            last_net_value = scale.get_value(1)
            print(f"[HX711] [OK] Normal! Raw ADC: {last_raw_adc} | Faktor: {calibration_factor:.2f}")
        else:
            is_scale_ready = False
            print(f"[HX711 PERINGATAN] Raw ADC ({last_raw_adc})! Cek VCC HX711 wajib ke 5V.")
    else:
        is_scale_ready = False
        print("[HX711] Modul belum merespon. Menunggu secara non-blocking.")

# ==============================================================================
# 7. KONEKSI WI-FI (OPTIMAL, BEBAS OUT OF MEMORY)
# ==============================================================================
def connect_wifi(timeout_sec=15):
    global config
    ssid = config.get("wifi_ssid", "")
    password = config.get("wifi_password", "")
    if not ssid or ssid in ("YOUR_WIFI_SSID", "NAMA_WIFI_ATAU_HOTSPOT_ANDA"):
        print("[Wi-Fi] SSID belum disetel di config.json.")
        return False

    gc.collect() # Bersihkan RAM sebelum meminta buffer WiFi ke ESP-IDF
    wlan = network.WLAN(network.STA_IF)
    if not wlan.active():
        wlan.active(True)
        time.sleep_ms(200)

    if wlan.isconnected():
        print(f"[Wi-Fi] [OK] Sudah terhubung! IP: {wlan.ifconfig()[0]}")
        return True

    print(f"[Wi-Fi] Menghubungkan ke '{ssid}'...")
    try:
        wlan.connect(ssid, password)
    except OSError:
        pass

    start = time.ticks_ms()
    while not wlan.isconnected():
        if time.ticks_diff(time.ticks_ms(), start) > timeout_sec * 1000:
            print(f"\n[Wi-Fi GAGAL] Timeout ke '{ssid}'.")
            return False
        time.sleep_ms(500)
        print(".", end="")

    print("\n[Wi-Fi] [OK] Terhubung! IP:", wlan.ifconfig()[0])
    gc.collect()
    return True

# ==============================================================================
# 8. HANDLER PERINTAH MQTT
# ==============================================================================
def on_mqtt_message(topic, message_str):
    global is_dispensing, target_ml, dispensed_ml, dispensed_weight_grams
    global dispense_start_time, current_transaction_id, initial_container_weight
    global is_scale_ready, last_raw_adc, current_live_weight
    global calibration_factor, max_weight_limit, config

    print(f"\n[MQTT Command]: {message_str}")
    try:
        data = json.loads(message_str)
    except Exception as e:
        print("[MQTT ERROR] Parse JSON gagal:", e)
        return

    action = data.get("action", "")

    if action == "START":
        target_ml = int(data.get("volumeMl", 600))
        if "maxWeight" in data:
            max_weight_limit = float(data["maxWeight"])
        current_transaction_id = str(data.get("transactionId", f"tx-{int(time.time())}"))

        if scale.is_ready() or scale.wait_ready_timeout(150):
            raw = scale.read_raw()
            last_raw_adc = raw
            if is_adc_valid(raw):
                is_scale_ready = True
                scale.set_scale(calibration_factor)
                initial_container_weight = max(0.0, float(raw - scale.get_offset()) / calibration_factor)
                scale.tare(3)
            else:
                is_scale_ready = False
                initial_container_weight = 0.0
        else:
            is_scale_ready = False
            initial_container_weight = 0.0

        dispensed_weight_grams = 0.0
        dispensed_ml = 0
        dispense_start_time = time.ticks_ms()
        is_dispensing = True

        start_pump()
        tft_ui.show_dispensing(target_ml)

        mode_str = "WEIGHT_LOADCELL" if is_scale_ready else "TIME_FALLBACK"
        mqtt_client.publish(TOPIC_TELEMETRY, json.dumps({
            "status": "DISPENSING",
            "dispensedMl": 0,
            "weightGrams": 0.0,
            "grossWeight": round(initial_container_weight, 1),
            "targetMl": target_ml,
            "containerWeight": round(initial_container_weight, 1),
            "maxWeightLimit": round(max_weight_limit, 1),
            "isScaleReady": is_scale_ready,
            "scaleRaw": last_raw_adc,
            "flowRate": round((pump_flow_rate * 60) / 1000, 2),
            "cutOffMode": mode_str,
            "transactionId": current_transaction_id
        }))

    elif action == "STOP":
        is_dispensing = False
        stop_pump()
        tft_ui.show_complete("EMERGENCY_STOPPED", dispensed_ml, dispensed_weight_grams, "Tombol Stop Darurat Ditekan")

        mqtt_client.publish(TOPIC_STATUS, json.dumps({"status": "READY", "message": "Emergency Stopped"}), retain=True)
        mqtt_client.publish(TOPIC_COMPLETE, json.dumps({
            "status": "EMERGENCY_STOPPED",
            "dispensedMl": dispensed_ml,
            "weightGrams": round(dispensed_weight_grams, 1),
            "transactionId": current_transaction_id
        }))

    elif action == "RESET":
        is_dispensing = False
        stop_pump()
        dispensed_weight_grams = 0.0
        dispensed_ml = 0
        target_ml = 0
        initial_container_weight = 0.0
        current_transaction_id = ""

        if scale.is_ready() or scale.wait_ready_timeout(200):
            raw = scale.read_raw()
            last_raw_adc = raw
            if is_adc_valid(raw):
                is_scale_ready = True
                scale.set_scale(calibration_factor)
                scale.tare(5)
                current_live_weight = 0.0

        tft_ui.show_standby_menu(0.0, is_scale_ready)
        mqtt_client.publish(TOPIC_STATUS, json.dumps({"status": "READY", "message": "Reset Berhasil"}), retain=True)

    elif action == "TARE":
        if scale.is_ready() or scale.wait_ready_timeout(400):
            raw = scale.read_raw()
            if is_adc_valid(raw):
                scale.set_scale(calibration_factor)
                scale.tare(5)
                current_live_weight = 0.0
                mqtt_client.publish(TOPIC_STATUS, json.dumps({
                    "status": "READY", "isScaleReady": True, "message": "Tare Berhasil", "currentWeight": 0.0
                }), retain=True)

    elif action == "SHOW_QRIS":
        nominal = str(data.get("nominal", "6.000"))
        qris_payload = str(data.get("qris", "00020101021226600016ID.WATERVEND.WWW520458125303360540660005802ID5913WATERVEND IOT6007BANDUNG6304ABCD"))
        tft_ui.show_qris(nominal, qris_payload)

    elif action == "SHOW_MENU":
        tft_ui.show_standby_menu(current_live_weight, is_scale_ready)

def reconnect_mqtt():
    global mqtt_client
    while True:
        try:
            print(f"[MQTT] Menghubungkan ke Broker ({MQTT_BROKER}:{MQTT_PORT})...")
            client_id = f"ESP32-{DEVICE_ID}"
            mqtt_client = MiniMQTTClient(client_id, MQTT_BROKER, MQTT_PORT, keepalive=60)
            mqtt_client.set_last_will(TOPIC_STATUS, json.dumps({"status": "OFFLINE"}), retain=True)
            mqtt_client.set_callback(on_mqtt_message)
            mqtt_client.connect()
            print("[MQTT] [OK] Terhubung ke Mosquitto Broker!")

            mqtt_client.publish(TOPIC_STATUS, json.dumps({
                "status": "READY",
                "isScaleReady": is_scale_ready,
                "calFactor": round(calibration_factor, 2),
                "maxWeightLimit": round(max_weight_limit, 1)
            }), retain=True)
            mqtt_client.subscribe(TOPIC_COMMAND)
            print(f"[MQTT] Subscribed: {TOPIC_COMMAND}")
            break
        except Exception as e:
            print(f"[MQTT ERROR] Gagal ({e}). Coba lagi dalam 3 detik...")
            time.sleep(3)

# ==============================================================================
# 9. LOOP UTAMA
# ==============================================================================
def main():
    global is_dispensing, dispensed_ml, dispensed_weight_grams
    global last_raw_adc, last_net_value, current_live_weight, is_scale_ready
    global last_telemetry_time, last_ping_time

    print("\n=======================================================")
    print("  WATERVEND IoT - ESP32 DISPENSER AIR MINUM (MICROPYTHON)")
    print(f"  Perangkat ID : {DEVICE_ID}")
    print(f"  Target Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print("=======================================================\n")

    # Inisialisasi awal aman
    stop_pump()
    gc.collect()

    # 1. Sambungkan Wi-Fi TERLEBIH DAHULU selagi heap RAM ESP32 masih bersih maksimal
    while not connect_wifi():
        time.sleep(3)
        gc.collect()

    # 2. Sambungkan MQTT Broker
    reconnect_mqtt()

    # 3. Setup hardware Timbangan & Layar TFT
    setup_load_cell()
    tft_ui.init_display()
    tft_ui.show_standby_menu(current_live_weight, is_scale_ready)

    print("\n[SISTEM] Loop aktif. Siap beroperasi...\n")

    while True:
        try:
            mqtt_client.check_msg()

            now = time.ticks_ms()
            if time.ticks_diff(now, last_ping_time) > 20000:
                last_ping_time = now
                mqtt_client.ping()

            # Baca HX711 non-blocking
            if scale.is_ready():
                raw = scale.read_raw()
                last_raw_adc = raw
                if is_adc_valid(raw):
                    is_scale_ready = True
                    last_net_value = raw - scale.offset
                    calc_weight = float(last_net_value) / calibration_factor
                    if abs(calc_weight) < 0.5: calc_weight = 0.0

                    if is_dispensing:
                        dispensed_weight_grams = max(0.0, calc_weight)
                        dispensed_ml = int(dispensed_weight_grams)
                    else:
                        current_live_weight = calc_weight
                else:
                    is_scale_ready = False
                    current_live_weight = 0.0

            # KASUS 1: PENGISIAN SEDANG BERJALAN
            if is_dispensing:
                if not is_scale_ready:
                    elapsed_s = time.ticks_diff(now, dispense_start_time) / 1000.0
                    dispensed_ml = int(elapsed_s * pump_flow_rate)
                    dispensed_weight_grams = float(dispensed_ml)

                total_gross_weight = initial_container_weight + dispensed_weight_grams
                tft_ui.update_dispensing(dispensed_ml, dispensed_weight_grams, target_ml)

                if time.ticks_diff(now, last_telemetry_time) >= 300:
                    last_telemetry_time = now
                    flow_rate_lpm = (pump_flow_rate * 60.0) / 1000.0
                    cut_mode = "WEIGHT_LOADCELL" if is_scale_ready else "TIME_FALLBACK"

                    mqtt_client.publish(TOPIC_TELEMETRY, json.dumps({
                        "flowRate": round(flow_rate_lpm, 2),
                        "dispensedMl": dispensed_ml,
                        "weightGrams": round(dispensed_weight_grams, 1),
                        "grossWeight": round(total_gross_weight, 1),
                        "scaleRaw": last_raw_adc,
                        "maxWeightLimit": round(max_weight_limit, 1),
                        "isScaleReady": is_scale_ready,
                        "targetMl": target_ml,
                        "status": "DISPENSING",
                        "cutOffMode": cut_mode,
                        "transactionId": current_transaction_id
                    }))

                # CUT-OFF OTOMATIS
                target_reached = (dispensed_weight_grams >= float(target_ml)) if is_scale_ready else (dispensed_ml >= target_ml)
                overweight = (is_scale_ready and (total_gross_weight >= max_weight_limit) and (total_gross_weight < 20000.0))
                max_safety_ms = int(((target_ml / pump_flow_rate) * 1000) + 7000)
                timeout_safety = time.ticks_diff(now, dispense_start_time) > max_safety_ms

                if target_reached or timeout_safety or overweight:
                    is_dispensing = False
                    stop_pump()

                    if overweight:
                        tft_ui.show_complete("STOPPED_OVERWEIGHT", dispensed_ml, dispensed_weight_grams, "Beban Lebih!")
                        status_str = "STOPPED_OVERWEIGHT"
                    elif timeout_safety and not target_reached:
                        tft_ui.show_complete("TIMEOUT_CUTOFF", dispensed_ml, dispensed_weight_grams, "Timeout!")
                        status_str = "TIMEOUT_CUTOFF"
                    else:
                        tft_ui.show_complete("COMPLETED", dispensed_ml, dispensed_weight_grams, "Selesai")
                        status_str = "COMPLETED"

                    mqtt_client.publish(TOPIC_COMPLETE, json.dumps({
                        "status": status_str,
                        "dispensedMl": dispensed_ml,
                        "weightGrams": round(dispensed_weight_grams, 1),
                        "transactionId": current_transaction_id
                    }))
                    mqtt_client.publish(TOPIC_STATUS, json.dumps({"status": "READY"}), retain=True)

            # KASUS 2: STANDBY
            else:
                tft_ui.check_auto_reset(current_live_weight, is_scale_ready)
                tft_ui.update_standby_weight(current_live_weight, is_scale_ready)

                if time.ticks_diff(now, last_telemetry_time) >= 400:
                    last_telemetry_time = now
                    cut_mode = "WEIGHT_LOADCELL" if is_scale_ready else "TIME_FALLBACK"
                    mqtt_client.publish(TOPIC_TELEMETRY, json.dumps({
                        "status": "READY",
                        "currentWeight": round(current_live_weight, 1),
                        "calFactor": round(calibration_factor, 2),
                        "maxWeightLimit": round(max_weight_limit, 1),
                        "isScaleReady": is_scale_ready,
                        "scaleRaw": last_raw_adc,
                        "cutOffMode": cut_mode,
                        "dispensedMl": 0,
                        "targetMl": 0,
                        "flowRate": 0.0
                    }))

            time.sleep_ms(10)

        except Exception as err:
            print("[ERROR LOOP]", err)
            time.sleep(2)
            try: reconnect_mqtt()
            except Exception: pass

if __name__ == "__main__":
    main()