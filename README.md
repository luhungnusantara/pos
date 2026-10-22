# POS Luhung Nusantara

Aplikasi Point of Sales untuk **penjualan rokok ke agen dan reseller**, mulai dari stok masuk,
stok keluar, stok opname, **konsinyasi (barang titipan)**, penjualan, kas, piutang/hutang, sampai
**perhitungan komisi per sales**.

Dibangun dengan **HTML + CSS + JavaScript Module murni** — tanpa framework, tanpa proses build,
tanpa server backend. Seluruh data tersimpan di perangkat (localStorage) sehingga aplikasi tetap
jalan tanpa internet. Tampilannya responsif dan nyaman dipakai di **Android maupun iPhone**,
juga di tablet dan desktop.

---

## Menjalankan

Karena memakai ES Module, aplikasi harus dibuka lewat HTTP (bukan `file://`):

```bash
# pilih salah satu
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

Lalu buka `http://localhost:8000`.

Saat pertama kali dibuka, aplikasi menawarkan **data contoh** (produk rokok, agen, reseller,
sales, stok, konsinyasi, dan transaksi sebulan terakhir) agar seluruh fitur bisa langsung dicoba.
Data contoh dapat dimuat ulang atau dihapus kapan saja lewat menu **Pengaturan**.

### Memasang di ponsel

Buka alamat aplikasi di ponsel, lalu:

- **Android (Chrome):** menu ⋮ → *Tambahkan ke layar utama* / *Instal aplikasi*
- **iPhone (Safari):** tombol Bagikan → *Tambahkan ke Layar Utama*

Aplikasi akan terbuka layar penuh seperti aplikasi biasa dan tetap dapat dibuka saat offline
(memerlukan HTTPS atau `localhost`).

---

## Alur kerja utama

### 1. Persiapan
`Data Produk` → isi rokok beserta **harga beli, harga agen, harga reseller, harga ecer**,
stok minimum, dan (opsional) **harga promo**.
`Agen & Reseller` → daftarkan mitra, tipe (agen/reseller), plafon kredit, tempo, dan sales penanggung jawab.
`Data Sales` → daftarkan sales beserta target omzetnya. Tarif komisi diatur sekali untuk semua
sales di `Pengaturan → Preferensi Transaksi`.

### 2. Stok masuk
`Pembelian / Stok Masuk` → catat faktur dari supplier. Stok gudang bertambah, harga beli
diperbarui otomatis, dan pembayaran tercatat sebagai kas keluar (tunai) atau hutang (tempo).

### 2b. Stok keluar (bukan penjualan)
`Barang / Stok Keluar` → catat barang yang keluar gudang **tanpa dijual**: pilih alasannya, isi
tujuan/penerima (opsional), lalu tambahkan produk. Jumlahnya tidak bisa melebihi stok gudang.

| Alasan | Akibat |
|---|---|
| Rusak / Cacat, Kedaluwarsa, Hilang, Sampel / Promosi, Pemakaian Sendiri, Lainnya | Stok gudang berkurang; nilainya (harga beli) dihitung **kerugian** di Laporan Laba Rugi |
| Retur ke Supplier | Stok gudang berkurang, **bukan kerugian**. Uang kembali dicatat di Kas Masuk |

Tidak ada kas yang tercatat otomatis. Setiap dokumen bernomor `BK/yymm/nnnn` dan tampil di kartu
stok sebagai *Stok Keluar*. Dokumen yang salah catat bisa dibatalkan pemilik lewat **⛔ Batalkan**,
dan barangnya kembali ke gudang.

### 3. Penjualan putus
`Penjualan Baru` → pilih pelanggan (harga menyesuaikan tipe mitra secara otomatis), tambahkan
produk, tentukan diskon, lalu bayar **tunai** atau **kredit/tempo**. Aplikasi memperingatkan bila
stok kurang atau plafon kredit mitra terlampaui. Nota bisa dicetak atau dibagikan via WhatsApp
**sebagai foto nota** (sama persis dengan pratinjaunya). Di HP, tombol **Bagikan** membuka menu berbagi
dan WhatsApp menerima gambar PNG. Di perangkat yang belum bisa berbagi berkas (umumnya PC), muncul pilihan
**Salin Gambar** (lalu Ctrl+V di WhatsApp Web/Desktop), **Unduh**, atau **Salin Teks**.

**Harga promo.** Di kartu Pembayaran, pilih **Harga → 🏷️ Promo** untuk menjual dengan harga promo
yang diisi di Data Produk. Produk yang tidak punya harga promo tetap memakai harga normal (aplikasi
menyebutkan berapa produk yang begitu). Pelanggan tetap membayar tunai atau kredit seperti biasa.
Nota promo ditandai **PROMO** di nota cetak/WhatsApp, diberi lencana di Riwayat Penjualan, bisa
disaring lewat chip **Promo**, dan totalnya tampil di Laporan sebagai *Dengan harga promo*.

### 4. Konsinyasi (barang titipan)
`Konsinyasi` → **Titip Barang**: stok keluar dari gudang, tetapi **belum dihitung sebagai penjualan**.

Ketika mitra melapor, buka titipan → **Lapor Hasil Penjualan**, isi jumlah **terjual** dan **retur**:

| Kejadian | Akibat |
|---|---|
| Terjual | Menjadi nota penjualan → kas masuk / piutang → **komisi sales dihitung** |
| Retur | Stok kembali ke gudang |
| Sisa | Tetap tercatat sebagai barang di mitra |

Titipan otomatis berstatus *selesai* bila seluruh barang sudah terjual atau diretur. Tersedia juga
**Tutup & Retur Sisa** untuk menutup titipan sekaligus menarik sisa barang.

Titipan yang salah catat atau dobel dibatalkan pemilik lewat **Batalkan Titipan** di halaman
detailnya: sisa barang kembali ke gudang (tercatat sebagai *Pembatalan* di kartu stok) dan
titipan pindah ke filter *Dibatalkan*. Titipan yang sudah punya setoran baru bisa dibatalkan
setelah nota setorannya dibatalkan di Riwayat Penjualan.

**Surat Titip Barang (bukti konsinyasi).** Begitu titipan disimpan, aplikasi langsung menampilkan
surat titip bernomor `KS/yymm/nnnn`: penerima, sales, batas laporan, rincian barang × harga,
nilai titipan, dan kolom tanda tangan **Penerima** & **Pengirim**. Surat bisa dibuka lagi kapan saja
lewat tombol **🧾 Surat Titip Barang** di detail titipan. Setelah ada laporan, surat ikut memuat
jumlah laku, retur, dan sisa per produk — jadi bisa dipakai sebagai berita acara saat menagih.
Seperti nota, surat ini dicetak atau **dibagikan ke WhatsApp sebagai foto**.

### 5. Stok opname
`Stok Opname` → isi jumlah fisik hasil hitung gudang. Aplikasi menampilkan selisih terhadap
catatan sistem beserta nilai rupiahnya, lalu menyesuaikan stok. Kekurangan fisik dihitung sebagai
susut pada laporan laba rugi.

### 6. Kas, piutang & komisi
- `Kas Masuk & Keluar` — kas dari penjualan, pelunasan, pembelian, dan komisi tercatat otomatis;
  biaya operasional bisa diinput manual.
- `Piutang & Hutang` — dikelompokkan per mitra lengkap dengan umur piutang dan penerimaan pembayaran.
  Setiap pembayaran menghasilkan **Bukti Pembayaran** bernomor `BY/yymm/nnnn` yang langsung tampil
  setelah disimpan: total nota, dibayar sebelumnya, jumlah bayar beserta terbilangnya, metode, sisa
  atau LUNAS, dan kolom tanda tangan. Bukti lama dibuka lagi dari **Riwayat Pembayaran** di detail
  nota penjualan (piutang) atau detail pembelian (hutang). Bisa dicetak atau dibagikan sebagai foto.
- `Komisi Sales` — rekap per sales, rincian per transaksi, dan pembayaran komisi (otomatis jadi kas keluar).

---

## Mode luring (offline)

Aplikasi berjalan **penuh tanpa internet** — kasir, konsinyasi, stok, sampai
laporan — karena semua data diolah di perangkat, bukan di server.

| Keadaan | Yang terjadi |
| --- | --- |
| Tidak ada sinyal | Aplikasi tetap terbuka dari cache; muncul penanda **Luring** di kepala halaman |
| Sinyal satu bar | Halaman tetap tampil seketika — aset disajikan dari cache lebih dulu, tidak menunggu jaringan |
| Kembali online | Versi baru diambil diam-diam; muncul tawaran *"Versi baru tersedia"* yang bisa diketuk |

### Bagaimana pembaruan sampai ke pengguna

Aplikasi disajikan dari cache, jadi versi baru tidak otomatis terlihat begitu
berkas di server berganti. Alurnya:

1. `sw.js` diperiksa ulang ke server pada **tiga** pemicu: aplikasi dibuka lagi,
   sinyal baru pulih, dan tiap 30 menit selama aplikasi dibiarkan terbuka.
   Ketiganya diperlukan — kasir sering membiarkan aplikasi terbuka seharian, dan
   dalam keadaan itu peramban tidak pernah memeriksa dengan sendirinya.
2. Bila isi `sw.js` berbeda, versi baru diunduh diam-diam di latar belakang.
3. Muncul tawaran **"Versi baru tersedia. Ketuk untuk memuat ulang."**
4. Versi baru baru dipakai setelah pengguna setuju — supaya berkas lama dan baru
   tidak tercampur di tengah transaksi yang sedang diketik.

Versi yang benar-benar sedang dipakai bisa dilihat di kaki sidebar dan di
**Pengaturan → Mode Luring**, lengkap dengan tombol **Periksa Pembaruan**.
Angkanya diambil dari service worker, bukan ditulis di halaman, jadi ia
menggambarkan berkas yang nyata dipakai — bukan yang seharusnya.

> ⚠️ **Naikkan `VERSI` di `sw.js` setiap kali menerbitkan perubahan.** Peramban
> membandingkan isi `sw.js` apa adanya. Bila berkas itu tidak berubah, tidak ada
> service worker baru yang dipasang dan tawaran pembaruan tidak akan pernah
> muncul. Perubahan tetap sampai lewat penyegaran latar belakang, tetapi
> tertunda satu kali pemuatan dan tanpa pemberitahuan.

### Menjaga data tidak terhapus browser

Karena seluruh data ada di perangkat, yang justru perlu dijaga bukan koneksinya
melainkan penyimpanannya:

- Aplikasi otomatis meminta izin **penyimpanan tetap** (`storage.persist()`) agar
  browser tidak membuang data saat ruang menipis.
- **Pengguna iPhone/iPad wajib menambahkan aplikasi ke Layar Utama.** Selama masih
  dibuka lewat tab Safari biasa, iOS membersihkan datanya otomatis setelah
  **7 hari** tidak dibuka.
- Status penyimpanan, ruang terpakai, dan tombol pasang ada di **Pengaturan →
  Mode Luring**.
- Tetap **ekspor cadangan JSON** secara berkala. Ini satu-satunya pengaman kalau
  perangkat hilang atau rusak.

---

## Sinkronisasi antar perangkat (opsional)

Secara bawaan aplikasi bekerja sendiri di satu perangkat. Bila alamat server diisi
di **Pengaturan → Sinkronisasi Server**, transaksi ikut disetor ke server pusat
sehingga pemilik bisa melihat catatan seluruh sales dan agen.

Server: [luhungnusantara/luhungbackend](https://github.com/luhungnusantara/luhungbackend)
(Go + Fiber + MongoDB, jalur `/pos/*`).

**Yang terpenting: menyalakan server tidak mengubah cara aplikasi mencatat.**
Transaksi selalu ditulis ke perangkat lebih dulu, lalu disetor belakangan. Tidak
ada satu pun layar yang menunggu jaringan.

| Keadaan | Yang terjadi |
| --- | --- |
| Ada sinyal | Setoran berjalan otomatis di latar belakang |
| Tidak ada sinyal | Transaksi tetap tercatat, masuk antrean IndexedDB |
| Sinyal kembali | Antrean menyusul sendiri — lewat peristiwa `online`, saat aplikasi dibuka, berkala tiap 3 menit, dan Background Sync |
| Aplikasi ditutup | Background Sync tetap menyetor di latar belakang (belum didukung iOS) |

Penanda status ada di kepala halaman (⏳ menunggu · 🔄 mengirim · ✅ tersimpan)
dan per-nota di daftar Riwayat Penjualan.

### Tiga hal yang membuatnya tidak merusak data

**Tidak ada transaksi ganda.** Tiap rekaman dikenali dari id buatan perangkat,
bukan urutan kedatangan. Antrean yang sama boleh dikirim ulang berapa kali pun —
kejadian biasa saat sinyal putus di tengah kiriman.

**Komisi tetap adil.** Yang dikirim adalah waktu jualan asli di lapangan, dan
server tidak pernah menimpanya dengan waktu terima. Setoran yang tertahan tiga
hari tetap masuk ke tanggal jualan aslinya.

**Peran ditegakkan di server.** Sales dan agen hanya bisa membaca dan menyetor
data miliknya sendiri. Ini berbeda dari mode peran perangkat di bawah, yang hanya
menyembunyikan menu.

---

## Masuk dengan kredensial

Bila alamat server diisi, aplikasi **terkunci sampai pengguna masuk**. Layar
masuk tampil sebelum menu dan halaman digambar, jadi tidak ada data yang sempat
terlihat oleh orang yang tidak berhak.

| Keadaan | Perilaku |
| --- | --- |
| Server diatur, belum masuk | aplikasi terkunci di layar masuk |
| Sudah masuk | peran diambil dari akun, berlaku sampai token habis (60 hari) |
| Tidak ada sinyal | tetap terbuka memakai sesi tersimpan — kasir tidak pernah terkunci di lapangan |
| Sesi berakhir / akses dicabut | layar masuk muncul lagi; **antrean dan data tetap utuh** |
| Belum pernah masuk | terkunci — tidak ada jalan pintas |

Login penuh hanya dibutuhkan **sekali**. Setelah itu sesi disimpan di perangkat,
sehingga aplikasi tetap bisa dipakai berhari-hari tanpa jaringan.

Alamat server ditulis sebagai konstanta di `js/core/sinkron.js`, bukan setelan.
Hanya ada satu backend, jadi tidak ada kolom URL untuk diisi siapa pun — dan
tidak ada perangkat yang bisa diarahkan ke server lain.

### Membuat akun

Belum ada akun bawaan — akun pertama dibuat sendiri:

1. Di layar masuk, tekan **"Belum punya akun? Daftarkan toko baru"**. Isi alamat
   server, nama toko, nama pemilik, nomor HP, dan kata sandi. Nomor HP dan kata
   sandi itulah kredensial **Pemilik** Anda.
2. Setelah masuk, buka **Pengaturan → Akun Pengguna** untuk membuatkan akun
   Sales, Agen, Keuangan, atau Investor. Akun sales dan agen ditautkan ke data
   Sales/Mitra yang sudah ada, dipilih dari daftar — bukan diketik — supaya
   penyaringan datanya tidak diam-diam meleset karena id salah ketik.
3. Berikan nomor HP dan kata sandinya kepada yang bersangkutan.

**Nomor yang pernah mendaftar sendiri.** Sering terjadi: calon investor atau sales mencoba aplikasi
dengan mendaftarkan toko sendiri, lalu belakangan pemilik hendak membuatkan akunnya dan nomornya
ditolak karena *sudah terdaftar*. Bila toko hasil daftar sendiri itu **masih kosong** — belum ada
data apa pun, tidak ada akun lain, dan tidak bernaung di bawah pusat — aplikasi menawarkan untuk
**memindahkan akun itu** ke toko Anda dengan peran yang dipilih. Setelah disetujui, toko kosongnya
dihapus dan kata sandinya diganti dengan yang Anda isi. Toko yang sudah berisi data tidak pernah
ditawarkan; nomor itu tetap dianggap milik orang lain. Nomor HP harus diketik **persis sama**
dengan saat ia mendaftar (server belum menyeragamkan format `08…`/`628…`/`+62…`).

Akses bisa **dicabut dan dipulihkan** kapan saja dari kartu yang sama.
Pencabutan berlaku seketika, bahkan pada perangkat yang sudah terlanjur masuk —
berguna saat HP sales hilang.

### Akun Keuangan & Investor

Untuk pihak yang perlu melihat angka toko tanpa ikut berjualan:

| | 💼 Keuangan | 📈 Investor |
|---|---|---|
| Menu | Dashboard, Riwayat Penjualan, Konsinyasi, Pembelian, Stok Keluar, Piutang & Hutang, Produk, Kartu Stok, Agen & Reseller, Komisi, Kas, Laporan | Dashboard, Laporan |
| Angka yang tampil | seluruh toko, termasuk HPP, laba, dan kas | seluruh toko, termasuk HPP, laba, dan kas |
| Boleh mencatat | kas masuk/keluar, pelunasan piutang, pembayaran hutang, pembayaran komisi | tidak ada |
| Tidak boleh | menjual, menitip, stok masuk/keluar/opname, mengubah produk/harga/mitra/sales, mengelola akun | — |

Pembatasan ini **ditegakkan server**. Akun keuangan hanya bisa mengubah kolom
pembayaran (`dibayar`, status komisi) pada transaksi yang sudah ada — membuat
penjualan baru atau mengubah totalnya ditolak, walaupun aplikasinya diutak-atik.
Akun investor tidak bisa menyetor apa pun.

> ⚠️ Seperti peran lain, seluruh data toko tetap terunduh ke HP investor supaya
> aplikasi bisa dibuka tanpa sinyal. Di layar yang tampil hanya Dashboard dan
> Laporan, tetapi data mentahnya (nama pelanggan, tiap nota) ada di perangkat.

Tawaran **data contoh** pada perangkat yang masih kosong hanya muncul untuk
Pemilik. Perangkat peran lain kosong karena belum selesai menarik data tokonya,
dan data contoh yang dimuat di sana akan ikut tersetor ke toko sungguhan.

### Yang berubah dari mode peran perangkat

Setelah masuk lewat akun, **peran tidak bisa lagi diganti dari perangkat.** Ia
berasal dari akun yang terverifikasi, dan server menolak data di luar
wewenangnya. Pembatasan peran menjadi sungguhan, bukan sekadar menyembunyikan
menu. Lencana di kaki sidebar berubah dari ⇄ menjadi 🔒.

> ⚠️ **Yang tetap perlu dipahami.** Data tetap tersimpan di perangkat
> (localStorage), tidak terenkripsi. Layar masuk mencegah orang lain memakai
> aplikasi, tetapi seseorang yang menguasai perangkat dan paham peramban masih
> bisa membaca berkas datanya langsung. Yang dijaga sungguhan adalah **data di
> server**: tanpa kredensial yang sah, tidak ada yang bisa membaca atau mengubah
> data toko dari perangkat lain.

## Pusat & cabang

Akun **pusat** menaungi banyak **cabang/distributor**. Menu **Cabang** berisi
daftar cabang, tombol membuka cabang baru beserta akun pemiliknya, dan pemilih
cabang aktif.

Database di perangkat hanya memuat **satu cabang**, jadi memilih cabang berarti
mengganti seluruh isinya. Setelah dipilih, seluruh aplikasi bekerja persis
seperti pemilik cabang itu — kasir, stok, laporan, semuanya.

Dua penjagaan sebelum berpindah:

1. **Antrean harus kosong.** Rekaman dalam antrean tidak membawa identitas
   cabang; yang dipakai adalah cabang aktif saat disetor. Berpindah dengan
   antrean terisi akan mengirim transaksi cabang lama ke cabang baru.
2. **Harus ada jaringan**, karena isi cabang baru ditarik dari server.

Kursor sinkronisasi disimpan **per cabang**. Satu kursor bersama akan membuat
cabang yang baru dibuka dianggap sudah pernah ditarik, sehingga sebagian
transaksinya tidak akan pernah muncul.

Data cabang yang ditinggalkan **tidak hilang** — ia tetap di server dan ditarik
kembali saat cabangnya dibuka lagi.

## Mode peran perangkat

Aplikasi punya **tiga tampilan** yang dipilih lewat tombol peran di bagian bawah menu
(atau menu Pengaturan). Peran membatasi menu **dan menyembunyikan angka rahasia usaha**:

| | 👑 Pemilik | 🧑‍💼 Sales | 🏪 Agen / Reseller |
|---|---|---|---|
| Menu tersedia | seluruhnya (16) | 9 menu | 5 menu |
| Kasir & konsinyasi | ✅ catat | ✅ catat | 👁️ lihat saja |
| Data yang tampil | semua | hanya mitra binaan | hanya miliknya sendiri |
| Harga beli, HPP, laba, margin | ✅ | ❌ | ❌ |
| Kas, pembelian, hutang, laporan | ✅ | ❌ | ❌ |
| Stok keluar, stok opname & data induk | ✅ | ❌ | ❌ |
| Komisi | semua sales + bayar | hanya miliknya | ❌ |

Beranda pun berbeda: **Sales** melihat omzet dan komisinya sendiri beserta capaian target,
sedangkan **Agen/Reseller** melihat tagihan, barang titipan yang belum terjual, sisa plafon,
dan riwayat notanya.

Pasang **PIN Pemilik** lewat `Pengaturan → Peran Perangkat` agar perangkat tidak bisa
dikembalikan ke mode Pemilik oleh orang lain.

> ⚠️ **Batas yang perlu dipahami.** Data tersimpan di perangkat (localStorage), jadi ini
> pembatasan tampilan pada satu perangkat — **bukan autentikasi jaringan**. Agen yang membuka
> aplikasi dari HP-nya sendiri akan mulai dengan data kosong. Untuk portal agen sungguhan
> (tiap mitra masuk dari HP masing-masing dan melihat data live) dibutuhkan server: API,
> basis data, dan autentikasi.

---

## Perhitungan komisi

Komisi dihitung **otomatis saat penjualan tersimpan**, termasuk penjualan konsinyasi — yaitu ketika
mitra melaporkan barang terjual, **bukan** ketika barang dititipkan.

Rumusnya satu untuk semua sales dan semua produk:

```
komisi = tarif × jumlah terjual × bungkus per satuan      (tarif bawaan Rp300 per bungkus)
```

- **Bungkus per satuan** diambil dari kolom *Bungkus / Satuan* di Data Produk: jual 1 slop isi
  10 bungkus = 10 × Rp300 = Rp3.000. Produk yang satuannya *Bungkus* selalu dihitung 1, walaupun
  kolomnya terisi (formulir produk mengisi 10 secara bawaan). Kolom kosong pada produk *Slop*
  dianggap 10. Detail produk menampilkan komisi per satuannya, jadi isian yang salah terlihat.
- Harga jual, harga promo, dan diskon nota **tidak memengaruhi** komisi; yang dihitung hanya bungkusnya.
- Tarif diubah pemilik lewat `Pengaturan → Preferensi Transaksi → Komisi Sales per Bungkus Terjual`.
  Isi `0` bila tidak ada komisi. Perubahan tarif hanya berlaku untuk penjualan **berikutnya** —
  komisi yang sudah tercatat tidak dihitung ulang.
- Rekaman komisi menyimpan jumlah bungkusnya (`bungkus`) dan skema `per_bungkus`; ikut di ekspor CSV.
  Komisi yang tercatat sebelumnya tetap menyimpan skema lamanya (`% dari omzet`, `% dari laba kotor`,
  `Rp per unit`).

---

## Struktur berkas

```
index.html            kerangka aplikasi (sidebar, topbar, bottom nav)
manifest.json         agar bisa dipasang di layar utama
sw.js                 cache offline (jaringan lebih dulu)
icon.svg              ikon aplikasi (emblem penuh di kotak teal)
favicon.svg           ikon tab peramban (hanya glif tengah, tetap jelas di 16px)
apple-touch-icon.png  ikon layar utama iPhone (180px, opaque)
img/                  berkas logo — lihat bagian Logo & ikon
css/style.css         seluruh gaya, mobile-first + tema terang/gelap
js/app.js             titik masuk: menu, tema, drawer, router
js/core/
  store.js            penyimpanan localStorage + CRUD + event
  peran.js            kewenangan & penyaringan data per peran
  ganti-peran.js      dialog pemilihan peran + gerbang PIN
  domain.js           aturan bisnis: stok, konsinyasi, kas, piutang, komisi
  ui.js               modal, toast, form, pemilih item, komponen
  router.js           navigasi hash + pemuatan halaman dinamis
  utils.js            format rupiah/tanggal, nomor transaksi, CSV
  struk.js            tampilan, cetak, dan berbagi nota, surat titip barang, bukti pembayaran
  bayar.js            dialog pelunasan piutang & hutang
  periode.js          pemilih rentang tanggal
  luring.js           status jaringan, penyimpanan tetap, pembaruan aplikasi
  sesi.js             gerbang masuk: sesi tersimpan, masa token, peran dari akun
  gerbang.js          layar masuk yang mengunci aplikasi
  antrean.js          antrean setoran di IndexedDB (tahan tutup paksa)
  sinkron.js          setor & tarik data ke server, deteksi perubahan
  seed.js             data contoh
js/pages/             satu berkas per halaman (15 halaman)
```

Setiap halaman mengekspor `render(view, params)`; router memuatnya secara dinamis
(`import()`) sehingga hanya kode halaman yang dibuka saja yang diunduh.

### Logo & ikon

Logo memakai emblem **Gelar Linuhung Nusantara**, ditelusuri jadi vektor dari berkas
sumber sehingga tajam di segala ukuran (kemiripan dengan sumber IoU 0,995).

| Berkas | Isi | Dipakai di |
| --- | --- | --- |
| `img/logo.svg` / `logo-putih.svg` | emblem penuh + teks melingkar | tampilan besar, cetak |
| `img/mark.svg` / `mark-putih.svg` | hanya glif tengah | lencana sidebar, favicon |
| `img/icon-192.png`, `icon-512.png` | emblem putih di kotak teal | ikon PWA Android |
| `img/icon-maskable-512.png` | versi *maskable* (ruang aman 80%) | ikon adaptif Android |
| `img/logo.png` / `logo-putih.png` | emblem 512px latar transparan | keperluan umum |

Teks melingkar tidak terbaca di bawah ±64px, jadi ukuran kecil (tab peramban, lencana
sidebar 38px) sengaja memakai **mark** — glif tengahnya saja.

---

## Catatan penting

- **Data tersimpan di browser perangkat**, tidak dikirim ke server mana pun. Membersihkan data
  situs akan menghapusnya — ekspor cadangan berkala lewat `Pengaturan → Ekspor Cadangan (JSON)`.
- Satuan jual mengikuti pengaturan produk (Slop / Bungkus / Bal). Kolom *Bungkus / Satuan*
  menentukan komisi sales — pastikan isinya benar untuk setiap produk.
- Kolom rupiah menerima angka polos; pemisah ribuan ditambahkan otomatis saat mengetik.
- Semua laporan dapat diekspor ke **CSV** (pemisah `;`, siap dibuka di Excel Indonesia).

---

## Lampiran: ruang lingkup awal

Daftar fitur yang menjadi acuan ruang lingkup ketika repositori ini dibuat:

<details>
<summary>Lihat daftar fitur acuan</summary>

FITUR PROGRAM :

Master Data :

- Master Item.

- Master Supplier.

- Master Pelanggan dan Grup Pelanggan.

- Master Sales.

- Master Satuan, Jenis, Gudang.

- Multi Satuan Konversi (Pak->Dus->Pcs) dll.

- Multi Harga Jual (1 Harga/Harga berdasar - Quantity/Harga Berdasar Level/Harga Berdasar Satuan).

- Diskon Bertingkat pada Item (Dapat Setting Diskon bertingkat pada masing-masing item, Contoh diskon 10+5+2).

- Cetak Barcode (Bisa membuat disain barcode : ukuran sendiri) Bisa dicetak pada printer barcode, Ink Jet, Laser).

- Kartu Stok Barang

- DLL



Pembelian :

- Pesanan Barang / PO.

- Pembayaran DP pada saat Pesanan.

- Pembelian.

- Retur Pembelian.

- History Harga Beli.

- Pembayaran Hutang.



Penjualan :

- Pesanan Jual, Saat Cetak dapat Juga untuk Penawaran Harga.

- Pembayaran DP pada saat Pesanan.

- Penjualan (Back Office).

- Kasir (Point Of Sale).

- History Harga Jual.

- Retur Jual.

- Pembayaran Piutang.

- Penjualan dan Kasir dapat menggunakan Multi Diskon.

- Bisa dicantumkan 4 Sales.



Persediaan :

- Item Masuk.

- Item Keluar.

- Opname Stok.

- Transfer Gudang.

- Saldo Awal Item.

- Stok Minimum.

- Kontrol Mutasi Barang.



Akuntansi :

- Kas Masuk.

- Kas Keluar.

- Transfer Kas.

- Jurnal.

- Saldo Awal Perkiraan.

- Saldo Awal Hutang Piutang.

- DLL



Proses Data :



Proses Bulanan dan Tahunan.



Laporan :

- Master Data Barang, Supplier, Pelanggan, Sales.

- Laporan Pesanan Pembelian, Pembelian dan Retur Beli.

- Laporan Pesanan Penjualan, Penjualan, Retur Jual, Penjualan per Item,

Penjualan PerSupplier, Laporan Komisi Sales, Laporan Pembayaran dengan Kartu.

- Laporan Hutang Piutang (Hutang Piutang Beredar, Umur Hutang Piutang,

Buku Bantu Hutang Piutang, Mutasi Hutang Piutang, Pembayaran Hutang Piutang).

- Laporan Persediaan (Item Masuk, Keluar, Transfer, Serial, History Serial, Mutasi Stok).

- Daftar Perkiraan.

- Laporan Kas Masuk, Kas Keluar, Kas Tf.

- Laporan Jurnal.

- Buku Besar.

- Neraca Saldo, Neraca Lajur.

- Neraca Perusahaan, Laba Rugi.



Pengaturan :

- User, Multi Akses User.

- Data Perusahaan (Setelah Aktivasi).

- Pengaturan Umum, Ganti Background.

- Pengaturan Nomor Transaksi sendiri.

- Mini Printer.

- Customer Display (Bisa tambah Tipe Baru).

- Tema Window.

- Import Data.

- Backup dan Restore.

</details>
