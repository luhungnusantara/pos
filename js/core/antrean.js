/* antrean.js — antrean sinkronisasi di IndexedDB.

   Kenapa IndexedDB dan bukan localStorage: antrean harus selamat walau tab
   ditutup paksa di tengah kiriman, boleh besar, dan harus bisa dibaca juga
   oleh service worker saat Background Sync berjalan tanpa halaman terbuka —
   dan service worker tidak punya akses ke localStorage sama sekali. */

const NAMA_DB = 'pos_sinkron';
const VERSI = 1;
export const TOKO_ANTREAN = 'antrean';
export const TOKO_KUNCI = 'kunci';
export const TOKO_BAYANGAN = 'bayangan';

let janjiDB = null;

export function bukaDB() {
  if (janjiDB) return janjiDB;
  janjiDB = new Promise((selesai, gagal) => {
    // Mode privat pada sebagian peramban, atau penyimpanan yang diblokir,
    // membuat IndexedDB tidak ada sama sekali. Ditolak dengan pesan yang jelas
    // supaya pemanggil bisa memilih tetap berjalan tanpa antrean.
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      gagal(new Error('IndexedDB tidak tersedia di peramban ini'));
      return;
    }
    const p = indexedDB.open(NAMA_DB, VERSI);
    p.onupgradeneeded = () => {
      const d = p.result;
      if (!d.objectStoreNames.contains(TOKO_ANTREAN)) {
        d.createObjectStore(TOKO_ANTREAN, { keyPath: 'no', autoIncrement: true });
      }
      if (!d.objectStoreNames.contains(TOKO_KUNCI)) d.createObjectStore(TOKO_KUNCI);
      if (!d.objectStoreNames.contains(TOKO_BAYANGAN)) d.createObjectStore(TOKO_BAYANGAN);
    };
    p.onsuccess = () => selesai(p.result);
    p.onerror = () => gagal(p.error);
  });
  return janjiDB;
}

/** Bungkus satu transaksi IndexedDB menjadi Promise.
    Hasil diambil lewat onsuccess, bukan dibaca langsung dari permintaan:
    membaca `.result` sebelum transaksi selesai memberi undefined, dan
    mengembalikan objek permintaannya sendiri sebagai ganti nilai akan
    menyelundupkan struktur melingkar ke pemanggil. */
function tx(nama, mode, kerja) {
  return bukaDB().then(d => new Promise((selesai, gagal) => {
    const t = d.transaction(nama, mode);
    let nilai;
    const minta = kerja(t.objectStore(nama));
    if (minta && typeof minta === 'object' && 'onsuccess' in minta) {
      minta.onsuccess = () => { nilai = minta.result; };
    }
    t.oncomplete = () => selesai(nilai);
    t.onerror = () => gagal(t.error);
    t.onabort = () => gagal(t.error);
  }));
}

/* ---------- kunci sederhana: token, kursor, id perangkat ---------- */
export const simpanKunci = (k, v) => tx(TOKO_KUNCI, 'readwrite', s => s.put(v, k));
export const bacaKunci = k => tx(TOKO_KUNCI, 'readonly', s => s.get(k));
export const hapusKunci = k => tx(TOKO_KUNCI, 'readwrite', s => s.delete(k));

/* ---------- antrean kiriman ---------- */
/**
 * Masukkan perubahan ke antrean.
 * Satu rekaman per (koleksi, id): kalau baris yang sama diubah tiga kali
 * sebelum sempat terkirim, yang perlu disetor hanya keadaan terakhirnya.
 */
export async function antre(perubahan) {
  if (!perubahan.length) return 0;
  const d = await bukaDB();
  return new Promise((selesai, gagal) => {
    const t = d.transaction(TOKO_ANTREAN, 'readwrite');
    const s = t.objectStore(TOKO_ANTREAN);
    const perlu = new Map(perubahan.map(p => [`${p.koleksi}/${p.id}`, p]));

    // buang entri lama untuk kunci yang sama
    const kursor = s.openCursor();
    kursor.onsuccess = () => {
      const c = kursor.result;
      if (c) {
        const k = `${c.value.koleksi}/${c.value.id}`;
        if (perlu.has(k)) c.delete();
        c.continue();
        return;
      }
      perlu.forEach(p => s.add(p));
    };
    t.oncomplete = () => selesai(perlu.size);
    t.onerror = () => gagal(t.error);
  });
}

export function ambilAntrean(batas = 500) {
  return bukaDB().then(d => new Promise((selesai, gagal) => {
    const t = d.transaction(TOKO_ANTREAN, 'readonly');
    const s = t.objectStore(TOKO_ANTREAN);
    const keluar = [];
    const kursor = s.openCursor();
    kursor.onsuccess = () => {
      const c = kursor.result;
      if (c && keluar.length < batas) { keluar.push(c.value); c.continue(); }
    };
    t.oncomplete = () => selesai(keluar);
    t.onerror = () => gagal(t.error);
  }));
}

export const hapusAntrean = nomor =>
  tx(TOKO_ANTREAN, 'readwrite', s => nomor.forEach(n => s.delete(n)));

export const jumlahTertunda = () => tx(TOKO_ANTREAN, 'readonly', s => s.count());

export const kosongkanAntrean = () => tx(TOKO_ANTREAN, 'readwrite', s => s.clear());

/* ---------- bayangan: sidik jari tiap rekaman yang sudah tercatat ----------
   Dipakai membandingkan isi database sekarang dengan keadaan terakhir yang
   sudah diantrekan, sehingga hanya baris yang benar-benar berubah yang
   disetor — bukan seluruh isi database setiap kali menyimpan. */
export const bacaBayangan = () => tx(TOKO_BAYANGAN, 'readonly', s => s.get('sidik'));
export const tulisBayangan = peta => tx(TOKO_BAYANGAN, 'readwrite', s => s.put(peta, 'sidik'));
