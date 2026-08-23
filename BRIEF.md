### 📋 Brief Request: Implementasi PWA & Offline Auto-Sync untuk Web POS

**Tujuan Utama:**
Memastikan aplikasi web POS bisa diakses 100% saat tidak ada sinyal (offline) dan dapat mengirim data transaksi secara otomatis ke server begitu perangkat kembali mendapatkan koneksi internet.

**Kebutuhan Teknis (To-Do List untuk Developer):**

**1. Konfigurasi PWA (Progressive Web App)**

* Buat dan pasang file **`manifest.json`** agar aplikasi memunculkan prompt *"Add to Home Screen"* di Android dan bisa berjalan *fullscreen* layaknya aplikasi *native*.
* Implementasikan **App Shell Architecture**. Gunakan *Service Worker* untuk men-*cache* semua aset statis (HTML, CSS, JS, logo, ikon). Tujuannya agar saat web dibuka tanpa internet, halaman utama tetap termuat sempurna tanpa memunculkan halaman error "No Internet/Dinosaurus".

**2. Manajemen Database Lokal (Offline Queue)**

* Gunakan **IndexedDB** di browser untuk menyimpan data transaksi secara lokal saat perangkat offline. (Mengingat keterangan di *footer* aplikasi saat ini sudah tertulis *"data tersimpan di perangkat"*, mohon pastikan strukturnya mendukung sistem antrean/queue).
* Berikan status `pending_sync` untuk setiap transaksi baru yang diinput saat jaringan terputus.

**3. Trigger Sinkronisasi Otomatis (Auto-Sync)**

* Implementasikan **Background Sync API** via *Service Worker*.
* Sebagai *fallback* (cadangan jika browser tidak mendukung), tambahkan script `window.addEventListener('online', ...)` untuk mendeteksi kapan perangkat kembali terhubung ke internet.
* Begitu status berubah *online*, buat *script* agar aplikasi otomatis memproses (*push*) semua data berstatus `pending_sync` ke API server utama di latar belakang tanpa mengharuskan agen menekan tombol manual.

**4. Indikator Status di Antarmuka (UI)**

* Tambahkan *feedback* visual pada halaman riwayat penjualan agar agen tahu status datanya:
* ⏳/🔴 **Pending:** Data tersimpan lokal, belum masuk server.
* 🔄/🟡 **Syncing:** Sedang proses kirim ke server.
* ✅/🟢 **Success:** Data sukses tersimpan di *database* pusat.



**5. Penyesuaian Timestamp & Konflik Data (Backend/API)**

* Pastikan *payload* yang dikirim dari lokal ke server membawa parameter **waktu aktual (timestamp lokal)** saat transaksi terjadi di lapangan, BUKAN waktu saat data berhasil masuk ke server.
* Ini sangat penting agar perhitungan omzet dan **Komisi Sales** (untuk target pencapaian Budi, Siti, Agus, dsb.) di sistem tetap akurat dan adil berdasarkan waktu jualan aslinya.

