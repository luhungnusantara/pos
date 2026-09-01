/* sw.js — dukungan luring (offline).

   Strategi: cache lebih dulu, perbarui di latar belakang.
   Aset aplikasi disajikan langsung dari cache sehingga halaman tetap terbuka
   seketika walau sinyal lemah atau hilang sama sekali — kasus yang paling
   sering terjadi di lapangan bukan "tidak ada sinyal" melainkan "sinyal satu
   bar", dan di situ strategi jaringan-dulu justru menggantung sampai time-out.
   Salinan baru diambil diam-diam untuk dipakai pada pemuatan berikutnya. */

/* Penanda versi aplikasi.
   WAJIB dinaikkan setiap kali ada perubahan yang perlu sampai ke pengguna.
   Peramban membandingkan isi berkas sw.js apa adanya: bila berkas ini tidak
   berubah, tidak ada service worker baru yang dipasang dan tawaran "Versi baru
   tersedia" tidak akan pernah muncul. */
const VERSI = 'v6';
const CACHE = `pos-rokok-${VERSI}`;
const KERANGKA = './index.html';

const ASET = [
  './', './index.html', './css/style.css', './manifest.json',
  './icon.svg', './favicon.svg', './apple-touch-icon.png',
  './img/mark-putih.svg', './img/logo.svg',
  './img/icon-192.png', './img/icon-512.png', './img/icon-maskable-512.png',
  './js/app.js',
  './js/core/store.js', './js/core/domain.js', './js/core/ui.js', './js/core/utils.js',
  './js/core/router.js', './js/core/seed.js', './js/core/struk.js', './js/core/bayar.js',
  './js/core/periode.js', './js/core/peran.js', './js/core/ganti-peran.js',
  './js/core/luring.js', './js/core/sinkron.js', './js/core/antrean.js',
  './js/core/sesi.js', './js/core/gerbang.js',
  './js/pages/dashboard.js', './js/pages/pusat.js', './js/pages/kasir.js', './js/pages/penjualan.js',
  './js/pages/konsinyasi.js', './js/pages/produk.js', './js/pages/stok.js',
  './js/pages/opname.js', './js/pages/pembelian.js', './js/pages/mitra.js',
  './js/pages/sales.js', './js/pages/komisi.js', './js/pages/kas.js',
  './js/pages/piutang.js', './js/pages/laporan.js', './js/pages/pengaturan.js',
];

/* Sengaja tanpa skipWaiting(): versi baru menunggu sampai pengguna setuju
   memuat ulang, supaya berkas lama dan baru tidak tercampur di tengah
   transaksi yang sedang diketik. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(ASET.map(u => c.add(u))))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data?.tipe === 'lewati-tunggu') self.skipWaiting();
  if (e.data?.tipe === 'versi') {
    const balas = { tipe: 'versi', versi: VERSI };
    // balas lewat kanal khusus bila halaman menyediakannya, agar jawabannya
    // pasti sampai ke penanya dan bukan ke seluruh klien
    if (e.ports?.[0]) e.ports[0].postMessage(balas);
    else e.source?.postMessage(balas);
  }
});

/** ambil dari jaringan lalu simpan; null bila gagal (dipakai tanpa menunggu) */
async function segarkan(req, cache) {
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type !== 'opaque') await cache.put(req, res.clone());
    return res;
  } catch {
    return null;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  /* Navigasi (buka aplikasi / muat ulang): selalu sajikan kerangka dari cache
     agar tidak pernah muncul halaman "No Internet". */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const simpanan = await cache.match(KERANGKA);
      if (simpanan) {
        e.waitUntil(segarkan(KERANGKA, cache));
        return simpanan;
      }
      return (await segarkan(req, cache)) || Response.error();
    })());
    return;
  }

  /* Aset (modul JS, CSS, gambar): cache dulu, perbarui diam-diam. */
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const simpanan = await cache.match(req);
    if (simpanan) {
      e.waitUntil(segarkan(req, cache));
      return simpanan;
    }
    const baru = await segarkan(req, cache);
    return baru || new Response('', { status: 504, statusText: 'Luring' });
  })());
});

/* ---------- Background Sync ----------
   Browser membangunkan service worker begitu jaringan pulih dan menyetor
   antrean yang tertinggal, bahkan saat aplikasi sudah ditutup. Antrean dan
   token dibaca dari IndexedDB karena service worker tidak punya akses ke
   localStorage. iOS belum mendukung ini, karena itu aplikasi tetap memasang
   pemicu biasa (peristiwa online, aplikasi dibuka, dan berkala). */

const IDB_NAMA = 'pos_sinkron';

function idbBuka() {
  return new Promise((selesai, gagal) => {
    const p = indexedDB.open(IDB_NAMA);
    p.onsuccess = () => selesai(p.result);
    p.onerror = () => gagal(p.error);
  });
}

function idbSemua(d, toko) {
  return new Promise((selesai, gagal) => {
    const t = d.transaction(toko, 'readonly').objectStore(toko).getAll();
    t.onsuccess = () => selesai(t.result || []);
    t.onerror = () => gagal(t.error);
  });
}

function idbAmbil(d, toko, kunci) {
  return new Promise((selesai, gagal) => {
    const t = d.transaction(toko, 'readonly').objectStore(toko).get(kunci);
    t.onsuccess = () => selesai(t.result);
    t.onerror = () => gagal(t.error);
  });
}

function idbHapus(d, toko, kunci) {
  return new Promise((selesai, gagal) => {
    const t = d.transaction(toko, 'readwrite');
    kunci.forEach(k => t.objectStore(toko).delete(k));
    t.oncomplete = () => selesai();
    t.onerror = () => gagal(t.error);
  });
}

async function setorAntrean() {
  const d = await idbBuka();
  const [server, token, perangkat] = await Promise.all([
    idbAmbil(d, 'kunci', 'server'),
    idbAmbil(d, 'kunci', 'token'),
    idbAmbil(d, 'kunci', 'perangkat'),
  ]);
  if (!server || !token) return;

  const antrean = (await idbSemua(d, 'antrean')).slice(0, 500);
  if (!antrean.length) return;

  const res = await fetch(server.replace(/\/+$/, '') + '/pos/sinkron/kirim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Login: token },
    body: JSON.stringify({
      perangkat,
      rekaman: antrean.map(a => ({
        koleksi: a.koleksi, id: a.id, data: a.data,
        waktu_lokal: a.waktu_lokal, diubah: a.diubah, dihapus: a.dihapus,
      })),
    }),
  });
  // Gagal kirim: biarkan antrean utuh dan lempar galat supaya browser
  // menjadwalkan percobaan ulang sendiri.
  if (!res.ok) throw new Error('setoran ditolak: ' + res.status);

  await idbHapus(d, 'antrean', antrean.map(a => a.no));
  const klien = await self.clients.matchAll();
  klien.forEach(c => c.postMessage({ tipe: 'sinkron-selesai' }));
}

self.addEventListener('sync', e => {
  if (e.tag === 'pos-sinkron') e.waitUntil(setorAntrean());
});
