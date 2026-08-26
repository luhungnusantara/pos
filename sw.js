/* sw.js — cache offline sederhana.
   Strategi: jaringan lebih dulu (selalu versi terbaru), cache dipakai
   hanya saat perangkat sedang offline. */
const CACHE = 'pos-rokok-v2';
const ASET = [
  './', './index.html', './css/style.css', './manifest.json',
  './icon.svg', './favicon.svg', './apple-touch-icon.png',
  './img/mark-putih.svg', './img/logo.svg',
  './img/icon-192.png', './img/icon-512.png', './img/icon-maskable-512.png',
  './js/app.js',
  './js/core/store.js', './js/core/domain.js', './js/core/ui.js', './js/core/utils.js',
  './js/core/router.js', './js/core/seed.js', './js/core/struk.js', './js/core/bayar.js',
  './js/core/periode.js', './js/core/peran.js', './js/core/ganti-peran.js',
  './js/pages/dashboard.js', './js/pages/kasir.js', './js/pages/penjualan.js',
  './js/pages/konsinyasi.js', './js/pages/produk.js', './js/pages/stok.js',
  './js/pages/opname.js', './js/pages/pembelian.js', './js/pages/mitra.js',
  './js/pages/sales.js', './js/pages/komisi.js', './js/pages/kas.js',
  './js/pages/piutang.js', './js/pages/laporan.js', './js/pages/pengaturan.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASET.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(request)
      .then(res => {
        const salinan = res.clone();
        caches.open(CACHE).then(c => c.put(request, salinan)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
  );
});
