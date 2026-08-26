/* sw.js — dukungan luring (offline).

   Strategi: cache lebih dulu, perbarui di latar belakang.
   Aset aplikasi disajikan langsung dari cache sehingga halaman tetap terbuka
   seketika walau sinyal lemah atau hilang sama sekali — kasus yang paling
   sering terjadi di lapangan bukan "tidak ada sinyal" melainkan "sinyal satu
   bar", dan di situ strategi jaringan-dulu justru menggantung sampai time-out.
   Salinan baru diambil diam-diam untuk dipakai pada pemuatan berikutnya. */

const VERSI = 'v3';
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
  './js/core/luring.js',
  './js/pages/dashboard.js', './js/pages/kasir.js', './js/pages/penjualan.js',
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
  if (e.data?.tipe === 'versi') e.source?.postMessage({ tipe: 'versi', versi: VERSI });
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
