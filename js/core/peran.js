/* peran.js — mode peran perangkat: Pemilik, Sales, dan Agen/Reseller.
   Data tersimpan lokal di perangkat, jadi ini pembatasan tampilan
   (menu, halaman, dan angka sensitif) — bukan autentikasi jaringan. */
import { db, get, setSesi } from './store.js';
import { nowISO } from './utils.js';

export const PERAN = {
  owner: { label: 'Pemilik', ikon: '👑', warna: '', ket: 'Akses penuh ke seluruh menu' },
  sales: { label: 'Sales', ikon: '🧑‍💼', warna: 'info', ket: 'Hanya mitra binaan & komisi sendiri' },
  mitra: { label: 'Agen / Reseller', ikon: '🏪', warna: 'violet', ket: 'Hanya titipan, nota, dan tagihan sendiri' },
};

/** halaman yang boleh dibuka tiap peran ('*' = semua) */
const AKSES = {
  owner: '*',
  sales: ['dashboard', 'kasir', 'penjualan', 'konsinyasi', 'mitra', 'komisi', 'produk', 'stok', 'piutang'],
  mitra: ['dashboard', 'produk', 'konsinyasi', 'penjualan', 'piutang'],
};

/* ---------- keadaan sesi ---------- */
export const sesi = () => db.sesi || { peran: 'owner', salesId: '', mitraId: '' };
export const peranAktif = () => sesi().peran || 'owner';
export const adalah = p => peranAktif() === p;
export const isOwner = () => adalah('owner');

/** objek sales / mitra yang sedang memakai perangkat (null bila Pemilik) */
export const salesAktif = () => (adalah('sales') ? get('sales', sesi().salesId) : null);
export const mitraAktif = () => (adalah('mitra') ? get('mitra', sesi().mitraId) : null);

/** nama yang ditampilkan pada lencana peran */
export function namaPengguna() {
  if (adalah('sales')) return salesAktif()?.nama || 'Sales';
  if (adalah('mitra')) return mitraAktif()?.nama || 'Mitra';
  return db.pengaturan.pemilik || 'Pemilik';
}

export function gantiPeran({ peran, salesId = '', mitraId = '' }) {
  return setSesi({ peran, salesId, mitraId, sejak: nowISO() });
}

export const keluarKePemilik = () => gantiPeran({ peran: 'owner' });

/* ---------- kewenangan ---------- */
export const bolehBuka = nama => {
  const a = AKSES[peranAktif()] || [];
  return a === '*' || a.includes(nama);
};

/** ubah data induk (produk, mitra, sales, pengaturan) — hanya Pemilik */
export const bolehUbah = () => isOwner();

/** angka rahasia usaha: harga beli, HPP, laba, margin, nilai persediaan */
export const bolehLihatModal = () => isOwner();

/** kas, pembelian, hutang supplier, laporan laba rugi */
export const bolehLihatKas = () => isOwner();

/** mencatat transaksi baru (penjualan, konsinyasi, laporan konsinyasi) */
export const bolehTransaksi = () => isOwner() || adalah('sales');

/* ---------- penyaringan data ---------- */
/** mitra yang boleh dilihat peran aktif */
export function filterMitra(arr) {
  const s = sesi();
  if (adalah('sales')) return arr.filter(m => m.salesId === s.salesId);
  if (adalah('mitra')) return arr.filter(m => m.id === s.mitraId);
  return arr;
}

export function filterPenjualan(arr) {
  const s = sesi();
  if (adalah('sales')) return arr.filter(j => j.salesId === s.salesId);
  if (adalah('mitra')) return arr.filter(j => j.mitraId === s.mitraId);
  return arr;
}

export function filterKonsinyasi(arr) {
  const s = sesi();
  if (adalah('sales')) return arr.filter(k => k.salesId === s.salesId);
  if (adalah('mitra')) return arr.filter(k => k.mitraId === s.mitraId);
  return arr;
}

/** apakah satu catatan boleh dibuka peran aktif */
export const bolehLihatPenjualan = j => filterPenjualan([j]).length > 0;
export const bolehLihatKonsinyasi = k => filterKonsinyasi([k]).length > 0;
export const bolehLihatMitra = m => filterMitra([m]).length > 0;

/* ---------- PIN pemilik ---------- */
export const pinDipasang = () => !!String(db.pengaturan.pinOwner || '').trim();
export const cocokPin = pin => String(db.pengaturan.pinOwner || '') === String(pin || '').trim();
