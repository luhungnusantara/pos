/* store.js — penyimpanan data (localStorage) + CRUD + event */
import { uid, nowISO } from './utils.js';

const KEY = 'pos_rokok_v1';
export const VERSI = 1;

/** struktur database awal */
const kosong = () => ({
  versi: VERSI,
  // sesi: peran yang sedang aktif di perangkat ini (owner / sales / mitra)
  sesi: { peran: 'owner', salesId: '', mitraId: '', sejak: '' },
  pengaturan: {
    namaToko: 'Luhung Nusantara',
    pemilik: '',
    alamat: '',
    telp: '',
    tema: 'auto',
    catatanStruk: 'Terima kasih. Barang yang sudah dibeli tidak dapat ditukar.',
    saldoAwalKas: 0,
    tempoDefault: 14,
    peringatanStok: true,
    pinOwner: '',           // bila diisi, kembali ke peran Pemilik butuh PIN
    server: '',             // alamat API sinkronisasi; kosong = hanya perangkat ini
    tanpaServer: false,     // pengguna sengaja memilih tanpa server; jangan tanya lagi
  },
  produk: [],
  mitra: [],       // agen & reseller
  sales: [],
  pembelian: [],   // stok masuk dari supplier
  opname: [],      // stok opname
  konsinyasi: [],  // barang titipan
  penjualan: [],
  pembayaran: [],  // pelunasan piutang / hutang
  kas: [],
  komisi: [],
  bayarKomisi: [],
  mutasi: [],      // kartu stok
});

/* ---------- state ----------
   `db` sengaja tidak pernah di-assign ulang: isinya diganti di tempat agar
   referensi yang sudah dipegang modul lain tidak pernah menjadi basi. */
export const db = kosong();

function isiUlang(data) {
  Object.keys(db).forEach(k => { delete db[k]; });
  Object.assign(db, migrasi({
    ...kosong(), ...data,
    pengaturan: { ...kosong().pengaturan, ...(data?.pengaturan || {}) },
  }));
  return db;
}

function muat() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) isiUlang(JSON.parse(raw));
  } catch (e) {
    console.error('Gagal memuat data:', e);
    isiUlang({});
  }
  return db;
}
muat();

function migrasi(data) {
  // titik masuk migrasi antar versi di masa depan
  data.versi = VERSI;
  return data;
}

/* ---------- simpan + event ---------- */
const pendengar = new Set();
let timer = null;
let hemat = false; // saat true, simpan/emit ditunda (untuk transaksi batch)

export const sub = fn => { pendengar.add(fn); return () => pendengar.delete(fn); };

export function emit() {
  if (hemat) return;
  pendengar.forEach(fn => { try { fn(db); } catch (e) { console.error(e); } });
}

export function save(langsung = false) {
  if (hemat) return;
  clearTimeout(timer);
  const tulis = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      console.error('Gagal menyimpan:', e);
      alert('Penyimpanan penuh atau diblokir browser. Ekspor cadangan data Anda melalui menu Pengaturan.');
    }
    // penanda bagi modul sinkronisasi bahwa ada yang perlu diperiksa
    try { window.dispatchEvent(new CustomEvent('pos:tersimpan')); } catch { /* di luar peramban */ }
  };
  langsung ? tulis() : (timer = setTimeout(tulis, 180));
  emit();
}

/** jalankan beberapa perubahan sebagai satu transaksi (1x simpan + 1x render) */
export function batch(fn) {
  hemat = true;
  try { return fn(); }
  finally { hemat = false; save(true); }
}

/* ---------- CRUD generik ---------- */
export const list = koleksi => db[koleksi] || [];
export const get = (koleksi, id) => list(koleksi).find(x => x.id === id) || null;

export function add(koleksi, data) {
  const item = { id: uid(koleksi.slice(0, 3) + '_'), dibuat: nowISO(), ...data };
  (db[koleksi] ||= []).unshift(item);
  save();
  return item;
}

export function update(koleksi, id, patch) {
  const arr = db[koleksi] || [];
  const i = arr.findIndex(x => x.id === id);
  if (i < 0) return null;
  arr[i] = { ...arr[i], ...patch, diubah: nowISO() };
  save();
  return arr[i];
}

export function remove(koleksi, id) {
  const arr = db[koleksi] || [];
  const i = arr.findIndex(x => x.id === id);
  if (i < 0) return false;
  arr.splice(i, 1);
  save();
  return true;
}

export const setPengaturan = patch => {
  db.pengaturan = { ...db.pengaturan, ...patch };
  save();
  return db.pengaturan;
};

export const setSesi = patch => {
  db.sesi = { ...(db.sesi || {}), ...patch };
  save(true);
  return db.sesi;
};

/* ---------- cadangan ---------- */
export const exportDB = () => JSON.stringify(db, null, 2);

export function importDB(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object' || !Array.isArray(data.produk))
    throw new Error('Format berkas cadangan tidak dikenali.');
  isiUlang(data);
  save(true);
  return db;
}

export function resetDB() {
  isiUlang({});
  save(true);
  return db;
}

/** ganti seluruh isi database (dipakai oleh seed data contoh) */
export function setDB(data) {
  isiUlang(data);
  save(true);
  return db;
}

export const kosongkanTransaksi = () => {
  ['pembelian', 'opname', 'konsinyasi', 'penjualan', 'pembayaran', 'kas', 'komisi', 'bayarKomisi', 'mutasi']
    .forEach(k => { db[k] = []; });
  db.produk.forEach(p => { p.stok = 0; });
  save(true);
};
