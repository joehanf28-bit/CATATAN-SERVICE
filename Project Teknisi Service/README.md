# Catatan Servis - PWA Pembukuan Teknisi HP (Gaya Apple iOS/macOS)

Aplikasi web progresif (PWA) responsif dan offline-first yang dirancang khusus untuk mempermudah teknisi servis HP mencatat pekerjaan, modal, harga jual, dan laba bersih (profit) harian tanpa kerumitan login/password. Tampilan mengusung estetika Apple Human Interface Guidelines (iOS & macOS) dengan dukungan tema otomatis (Terang/Gelap).

Backend terhubung langsung ke **Google Sheets** menggunakan **Google Apps Script Web App** (1 tab per bulan otomatis, rumus profit otomatis, kolom rincian tersembunyi untuk multi-item).

---

## 📁 Struktur Direktori

```text
Project Teknisi Service/
├── index.html              # Halaman antarmuka utama (HTML murni)
├── manifest.webmanifest    # Konfigurasi PWA (ikon, nama, display standalone)
├── sw.js                   # Service Worker untuk caching aset & mode offline
├── Code.gs                 # Kode backend Google Apps Script
├── README.md               # Dokumentasi lengkap & panduan deployment
├── css/
│   └── style.css           # Desain ala Apple iOS/macOS, Glassmorphism & Responsif
├── js/
│   ├── app.js              # Logika UI, dynamic item form, pintasan keyboard
│   ├── storage.js          # Pengelola data lokal, antrean offline & sinkronisasi
│   └── charts.js           # Visualisasi grafik Chart.js (Profit harian & Komposisi)
└── icons/
    ├── icon-192.png        # Ikon PWA 192x192
    ├── icon-512.png        # Ikon PWA 512x512
    ├── apple-touch-icon.png# Ikon Apple iOS Homescreen
    ├── favicon.ico         # Favicon browser
    └── icon.svg            # Master vektor ikon
```

---

## ⚙️ 1. Panduan Deploy Backend Google Apps Script (Code.gs)

Aplikasi menggunakan Google Sheets sebagai basis data cloud gratis Anda. Ikuti langkah mudah berikut:

1. **Buat Google Sheets Baru**:
   - Buka browser dan kunjungi: [https://sheets.new](https://sheets.new)
   - Beri nama spreadsheet Anda di pojok kiri atas, contoh: `Database Catatan Servis`.

2. **Buka Editor Apps Script**:
   - Pada menu atas Google Sheets, klik **Ekstensi** > **Apps Script** (*Extensions > Apps Script*).

3. **Salin Kode Backend**:
   - Buka file [`Code.gs`](file:///c:/Users/LENOVO%20THINKPAD/Documents/Project%20Teknisi%20Service/Code.gs) di proyek ini.
   - Salin seluruh isi file tersebut.
   - Di tab editor Apps Script browser Anda, hapus fungsi default `function myFunction() {}` dan tempelkan kode dari `Code.gs`.

4. **Atur Token Pengaman (Opsional tapi Disarankan)**:
   - Pada baris ke-24 file `Code.gs`:
     ```javascript
     var SECRET_TOKEN = "ServisAman2026";
     ```
   - Anda dapat mengganti `"ServisAman2026"` dengan kata sandi rahasia Anda sendiri.

5. **Simpan & Deploy sebagai Web App**:
   - Klik ikon **Disket / Simpan** (Ctrl+S).
   - Klik tombol **Deploy** berwarna biru di pojok kanan atas > pilih **Deployment baru** (*New deployment*).
   - Pada jendela pop-up, klik ikon **Roda Gigi (Pilih jenis)** > pilih **Aplikasi Web** (*Web app*).
   - Atur pengaturan berikut:
     - **Deskripsi**: `Catatan Servis API v1`
     - **Jalankan sebagai** (*Execute as*): **Saya (email Anda)**
     - **Yang memiliki akses** (*Who has access*): **Siapa saja** (*Anyone*) *(PENTING: harus Anyone agar web Anda bisa mengirim data tanpa OAuth yang rumit)*
   - Klik tombol **Deploy**.

6. **Otorisasi Izin Google**:
   - Google akan meminta izin akses Spreadsheet.
   - Klik **Tinjau izin** (*Review Permissions*) > pilih akun Google Anda.
   - Jika muncul peringatan *"Google belum memverifikasi aplikasi ini"*, klik **Lanjutan** (*Advanced*) di kiri bawah > klik **Buka Catatan Servis (tidak aman)**.
   - Klik **Izinkan** (*Allow*).

7. **Salin URL Web App**:
   - Setelah selesai, Anda akan mendapatkan **URL Aplikasi Web** yang berakhiran `/exec`.
   - Contoh format: `https://script.google.com/macros/s/AKfycbx.../exec`
   - Salin URL tersebut!

8. **Hubungkan di Aplikasi Web**:
   - Buka web PWA Catatan Servis.
   - Masuk ke tab **Pengaturan**.
   - Tempel **URL Web App** dan isi **Token Rahasia** Anda.
   - Klik **Simpan Pengaturan**, lalu klik **Uji Koneksi**. Jika muncul notifikasi tanda centang hijau `✅ Koneksi berhasil!`, maka database Anda telah siap digunakan!

---

## 🌐 2. Panduan Hosting Gratis (GitHub Pages, Netlify, atau Vercel)

Karena aplikasi ini murni dibangun dengan HTML, CSS, dan JavaScript tanpa *build step*, Anda bisa menempatkannya di hosting statis gratis mana saja.

### Opsi A: GitHub Pages (Paling Direkomendasikan)
1. Buat repositori baru di [GitHub](https://github.com/new), beri nama misalnya `catatan-servis`.
2. Unggah seluruh file proyek ini ke repositori tersebut.
3. Masuk ke menu **Settings** repositori > pilih menu samping **Pages**.
4. Di bagian **Build and deployment**:
   - Source: `Deploy from a branch`
   - Branch: `main` / `master`, folder `/ (root)`
   - Klik **Save**.
5. Tunggu 1-2 menit, URL web HTTPS Anda akan aktif (contoh: `https://username.github.io/catatan-servis/`).

### Opsi B: Netlify (Tinggal Drag-and-Drop)
1. Buka [https://app.netlify.com/drop](https://app.netlify.com/drop).
2. Seret (*drag & drop*) folder `Project Teknisi Service` ke halaman tersebut.
3. Web Anda langsung aktif dalam hitungan detik dengan sertifikat SSL HTTPS gratis.

---

## 📱 3. Panduan Memasang ke Layar Utama Android & iOS (PWA Install)

Aplikasi ini memenuhi standar Progressive Web App (PWA) penuh sehingga dapat dipasang dan berjalan seperti aplikasi Android/iOS asli:

### Di HP Android (Google Chrome / Edge):
1. Buka link web Anda di Google Chrome.
2. Biasanya akan muncul bar notifikasi di bawah: **"Tambahkan Catatan Servis ke Layar Utama"**.
3. Jika tidak muncul otomatis:
   - Ketuk menu titik tiga (⋮) di kanan atas browser Chrome.
   - Pilih **Pasang aplikasi** (*Install app*) atau **Tambahkan ke Layar Utama** (*Add to Home screen*).
4. Ikon aplikasi "Catatan Servis" akan muncul di layar menu HP Anda. Saat dibuka, aplikasi tampil layar penuh (*standalone*) tanpa bilah alamat browser.

### Di iPhone / iPad (Safari):
1. Buka link web di peramban **Safari**.
2. Ketuk tombol **Bagikan** (*Share* - ikon kotak dengan panah ke atas di bagian bawah).
3. Gulir ke bawah dan pilih **Tambahkan ke Layar Utama** (*Add to Home Screen*).
4. Ketuk **Tambah** di kanan atas.

---

## 💡 4. Fitur-Fitur Utama

- **Penyimpanan Multi-Item dalam Satu Baris**:
  Satu pelanggan bisa memiliki beberapa perbaikan (misal: "Ganti LCD" + "Pasang Tempered Glass"). Di Google Sheets tetap tercatat rapi sebagai **1 baris**:
  - Kolom *Perbaikan* memuat teks dipisah baris baru (*alt+enter* otomatis).
  - Kolom *Modal* dan *Harga Jual* menjumlahkan semua item.
  - Kolom *Profit* menggunakan rumus Google Sheets otomatis (`=E{row}-D{row}`).
  - Kolom *Rincian* (ke-7) disembunyikan otomatis oleh script dan memuat JSON agar entri bisa diedit per item sewaktu-waktu.
- **Mode Offline & Antrean Lokal**:
  Tetap bisa mencatat saat tidak ada sinyal internet. Data disimpan di penyimpanan lokal perangkat dan otomatis disinkronkan saat terhubung kembali. Status sinkronisasi ditampilkan pada indikator kapsul:
  - 🟢 **Tersinkron**
  - 🔵 **Menyinkronkan...**
  - 🟠 **Belum terkirim (n)**
  - 🔴 **Offline**
- **Grafik Finansial (Chart.js)**:
  - **Grafik Batang Profit Harian**: Tanggal tanpa transaksi tetap terdeteksi dan bernilai Rp 0.
  - **Grafik Donat Komposisi Modal vs Profit**.
  - Pada layar HP, grafik tersembunyi secara default agar hemat ruang, dan dapat dinyalakan dengan saklar *"Tampilkan grafik"* (pilihan diingat).
- **Pintasan Keyboard di Komputer / Laptop**:
  - Tekan tombol **`N`** untuk membuka form entri baru dengan cepat.
  - Tekan tombol **`Enter`** saat berada di form untuk langsung menyimpan.
  - Tekan tombol **`Esc`** untuk membatalkan / menutup modal.
- **Warna Aksen Kustom iOS**:
  Pilihan warna aksen khas Apple: Biru iOS (default), Hijau, Oranye, Merah, Ungu, dan Merah Muda. Tema gelap dan terang berganti otomatis mengikuti setelan perangkat (*prefers-color-scheme*).
- **Ekspor Cadangan CSV**:
  Dapat mengunduh arsip pembukuan bulan berjalan dalam file CSV kapan saja dengan 1 klik.
- **Mode Demo**:
  Sudah terisi dengan beberapa transaksi contoh pekerjaan teknisi servis HP sehingga tampilan dan grafik dapat langsung dicoba. Data contoh dapat dihapus atau dimuat ulang kapan saja di menu Pengaturan.
