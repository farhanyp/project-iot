// ==============================================================================
// KONFIGURASI TFT_eSPI UNTUK DISPENSER AIR MINUM OTOMATIS (WATERVEND IOT)
// Hardware: ESP32 Dev Module + LCD ST7789 240x320 + Touch Screen XPT2046
// ==============================================================================
// 
// PETUNJUK INSTALASI:
// 1. Install library "TFT_eSPI" oleh Bodmer melalui Arduino Library Manager.
// 2. Buka folder library TFT_eSPI Anda:
//    (Windows: Dokumen/Arduino/libraries/TFT_eSPI/)
// 3. Opsi A: Ganti isi file "User_Setup.h" dengan seluruh isi file ini.
//    ATAU
//    Opsi B: Salin file ini ke folder "TFT_eSPI/User_Setups/", lalu di "User_Setup_Select.h",
//    aktifkan: #include <User_Setups/User_Setup_ST7789_ESP32.h>
// ==============================================================================

#define USER_SETUP_INFO "User_Setup_ST7789_ESP32_WaterVend"

// 1. TIPE DRIVER LCD
#define ST7789_DRIVER      // Driver untuk LCD TFT ST7789 240x320 / 240x240

// 2. RESOLUSI LAYAR
#define TFT_WIDTH  240
#define TFT_HEIGHT 320

// 3. PINOUT HARDWARE ESP32 (Hardware VSPI Default)
// Pin SPI Bersama (Layar & Touch)
#define TFT_MOSI 23  // SDA / D1 pada LCD & T_DIN pada Touch
#define TFT_SCLK 18  // SCL / SCK pada LCD & T_CLK pada Touch
#define TFT_MISO 19  // T_DO pada Touch XPT2046 (Wajib untuk baca koordinat sentuh)

// Pin Kontrol Khusus Layar LCD
#define TFT_CS   17  // Chip Select LCD (GPIO 17)
#define TFT_DC    2  // Data/Command (GPIO 2)
#define TFT_RST  15  // Reset LCD (GPIO 15)

// Pin Kontrol Khusus Touch Screen XPT2046
#define TOUCH_CS 21  // T_CS pada modul touch (GPIO 21)

// 4. DAFTAR FONT YANG DIAKTIFKAN
#define LOAD_GLCD   // Font standar 8-pixel
#define LOAD_FONT2  // Font kecil 16-pixel
#define LOAD_FONT4  // Font sedang 26-pixel
#define LOAD_FONT6  // Font angka besar 48-pixel
#define LOAD_FONT7  // Font angka 7-segment 48-pixel
#define LOAD_FONT8  // Font angka besar 75-pixel
#define LOAD_GFXFF  // Dukungan FreeFonts Adafruit
#define SMOOTH_FONT // Anti-aliased fonts

// 5. KECEPATAN SPI BUS (SANGAT KRUSIAL UNTUK MENGHILANGKAN LAG & GLITCH!)
// Kecepatan SPI Layar ST7789 (40MHz = Sangat cepat, mulus, dan stabil)
#define SPI_FREQUENCY       40000000 

// Kecepatan SPI Touch Screen XPT2046
// (Maksimal chip XPT2046 adalah 2.5MHz. TFT_eSPI akan otomatis beralih ke 2.5MHz
// saat membaca sentuhan, lalu kembali ke 40MHz saat menggambar layar)
#define SPI_TOUCH_FREQUENCY  2500000

// Aktifkan transaksi SPI terisolasi agar tidak tabrakan di bus bersama
#define SUPPORT_TRANSACTIONS
