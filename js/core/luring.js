/* luring.js — dukungan mode luring (offline).

   Aplikasi ini menyimpan seluruh datanya di perangkat, jadi luring adalah
   keadaan normal, bukan kegagalan. Modul ini mengurus tiga hal yang tetap
   perlu diperhatikan agar data tidak hilang dan aplikasi tetap bisa dibuka:

   1. status jaringan   — memberi tahu pengguna, tanpa menakut-nakuti
   2. penyimpanan tetap — mencegah browser menghapus data saat ruang menipis
   3. pembaruan aplikasi — karena aset kini disajikan dari cache lebih dulu */

/* ---------- status jaringan ---------- */
export const daring = () => navigator.onLine !== false;

const pendengar = new Set();

function siarkan() {
  pendengar.forEach(fn => { try { fn(daring()); } catch (e) { console.error(e); } });
}

/** pantau status jaringan; pemanggil langsung menerima keadaan saat ini */
export function onJaringan(fn) {
  pendengar.add(fn);
  fn(daring());
  return () => pendengar.delete(fn);
}

window.addEventListener('online', siarkan);
window.addEventListener('offline', siarkan);

/* ---------- lingkungan ---------- */
/** aplikasi dibuka dari layar utama, bukan dari tab peramban */
export const dipasang = () =>
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  window.navigator.standalone === true;

export const iOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

/* ---------- penyimpanan tetap ----------
   Tanpa izin ini, browser boleh membuang data situs saat ruang penyimpanan
   menipis. Di iOS, situs yang belum dipasang ke Layar Utama bahkan dibersihkan
   otomatis setelah tujuh hari tidak dibuka — risiko nyata bagi aplikasi yang
   seluruh datanya ada di perangkat. */
export async function mintaPenyimpananTetap() {
  if (!navigator.storage?.persist) return null;   // tidak didukung peramban
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function statusPenyimpanan() {
  const s = { tetap: null, pakai: 0, kuota: 0, dipasang: dipasang(), iOS: iOS() };
  try {
    if (navigator.storage?.persisted) s.tetap = await navigator.storage.persisted();
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      s.pakai = e.usage || 0;
      s.kuota = e.quota || 0;
    }
  } catch { /* peramban lama atau mode privat */ }
  return s;
}

/* ---------- pemasangan ke layar utama ---------- */
let tawaranPasang = null;
const pendengarPasang = new Set();

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();                       // tampilkan lewat tombol kita sendiri
  tawaranPasang = e;
  pendengarPasang.forEach(fn => fn(true));
});
window.addEventListener('appinstalled', () => {
  tawaranPasang = null;
  pendengarPasang.forEach(fn => fn(false));
});

export const bisaDipasang = () => !!tawaranPasang;

export function onBisaDipasang(fn) {
  pendengarPasang.add(fn);
  fn(bisaDipasang());
  return () => pendengarPasang.delete(fn);
}

/** tampilkan dialog pasang bawaan peramban; true bila pengguna menerima */
export async function pasangAplikasi() {
  if (!tawaranPasang) return false;
  tawaranPasang.prompt();
  const { outcome } = await tawaranPasang.userChoice;
  tawaranPasang = null;
  pendengarPasang.forEach(fn => fn(false));
  return outcome === 'accepted';
}

/* ---------- service worker & pembaruan ---------- */
let menunggu = null;   // service worker versi baru yang siap dipakai

/** muat ulang halaman memakai versi baru yang sudah terunduh */
export function terapkanPembaruan() {
  if (!menunggu) return location.reload();
  // muat ulang begitu versi baru mengambil alih kendali
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  menunggu.postMessage({ tipe: 'lewati-tunggu' });
}

/**
 * Daftarkan service worker.
 * @param {(terapkan:Function)=>void} onPembaruan dipanggil saat versi baru siap
 */
export function daftarkanServiceWorker({ onPembaruan } = {}) {
  if (!('serviceWorker' in navigator)) return;
  // service worker hanya berjalan di konteks aman
  const aman = location.protocol === 'https:' ||
               ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!aman) return;

  const tandai = reg => {
    if (!reg.waiting || !navigator.serviceWorker.controller) return;
    menunggu = reg.waiting;
    onPembaruan?.(terapkanPembaruan);
  };

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      tandai(reg);
      reg.addEventListener('updatefound', () => {
        const baru = reg.installing;
        baru?.addEventListener('statechange', () => {
          if (baru.state === 'installed') tandai(reg);
        });
      });
      // periksa pembaruan tiap kali aplikasi kembali dibuka
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && daring()) reg.update().catch(() => {});
      });
    } catch (e) {
      console.warn('Service worker tidak aktif:', e.message);
    }
  });
}
