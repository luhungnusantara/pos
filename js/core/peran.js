/* peran.js — peran perangkat: Pusat, Pemilik, Keuangan, Investor, Sales, dan Agen/Reseller.
   Data tersimpan lokal di perangkat, jadi ini pembatasan tampilan
   (menu, halaman, dan angka sensitif) — bukan autentikasi jaringan. */
import { db, get, setSesi } from './store.js';
import { nowISO } from './utils.js';

export const PERAN = {
  pusat: { label: 'Pusat', ikon: '🏛️', warna: '', ket: 'Seluruh cabang, satu per satu' },
  owner: { label: 'Pemilik', ikon: '👑', warna: '', ket: 'Akses penuh ke seluruh menu' },
  keuangan: { label: 'Keuangan', ikon: '💼', warna: 'info', ket: 'Lihat semua angka; catat kas & pembayaran' },
  investor: { label: 'Investor', ikon: '📈', warna: 'violet', ket: 'Hanya melihat dashboard & laporan' },
  sales: { label: 'Sales', ikon: '🧑‍💼', warna: 'info', ket: 'Hanya mitra binaan & komisi sendiri' },
  mitra: { label: 'Agen / Reseller', ikon: '🏪', warna: 'violet', ket: 'Hanya titipan, nota, dan tagihan sendiri' },
};

/** halaman yang boleh dibuka tiap peran ('*' = semua) */
const AKSES = {
  pusat: '*',
  owner: '*',
  sales: ['dashboard', 'kasir', 'penjualan', 'konsinyasi', 'mitra', 'komisi', 'produk', 'stok', 'piutang'],
  mitra: ['dashboard', 'produk', 'konsinyasi', 'penjualan', 'piutang'],
  // keuangan melihat hampir semuanya, tetapi tidak menjual, tidak mengubah
  // data induk, dan tidak mengelola akun (Pengaturan)
  keuangan: ['dashboard', 'penjualan', 'konsinyasi', 'pembelian', 'keluar', 'piutang',
    'produk', 'stok', 'mitra', 'komisi', 'kas', 'laporan'],
  investor: ['dashboard', 'laporan'],
};

/* ---------- keadaan sesi ---------- */
export const sesi = () => db.sesi || { peran: 'owner', salesId: '', mitraId: '' };
export const peranAktif = () => sesi().peran || 'owner';
export const adalah = p => peranAktif() === p;
export const isOwner = () => adalah('owner');

export const isPusat = () => adalah('pusat');

/**
 * Berwenang mengelola cabang yang sedang dibuka.
 *
 * Dipakai halaman untuk menentukan apa yang boleh ditampilkan. Sengaja terpisah
 * dari isOwner(): pusat berwenang sama dengan pemilik atas cabang yang sedang
 * dibukanya, jadi memakai isOwner() di halaman akan menyembunyikan fitur dari
 * pusat tanpa alasan.
 */
export const bolehKelola = () => isOwner() || isPusat();
const setaraPemilik = bolehKelola;

/** objek sales / mitra yang sedang memakai perangkat (null bila Pemilik) */
export const salesAktif = () => (adalah('sales') ? get('sales', sesi().salesId) : null);
export const mitraAktif = () => (adalah('mitra') ? get('mitra', sesi().mitraId) : null);

/** nama yang ditampilkan pada lencana peran */
export function namaPengguna() {
  if (isPusat()) return db.sesi?.namaPusat || 'Pusat';
  if (adalah('sales')) return salesAktif()?.nama || 'Sales';
  if (adalah('mitra')) return mitraAktif()?.nama || 'Mitra';
  if (adalah('keuangan') || adalah('investor')) return db.sesi?.namaAkun || PERAN[peranAktif()].label;
  return db.pengaturan.pemilik || 'Pemilik';
}

export function gantiPeran({ peran, salesId = '', mitraId = '' }) {
  return setSesi({ peran, salesId, mitraId, sejak: nowISO() });
}

export const keluarKePemilik = () => gantiPeran({ peran: 'owner' });

/* ---------- kewenangan ---------- */
/** halaman yang hanya masuk akal bagi pusat, walau peran lain berakses '*' */
const HANYA_PUSAT = new Set(['pusat']);

export const bolehBuka = nama => {
  if (HANYA_PUSAT.has(nama)) return isPusat();
  const a = AKSES[peranAktif()] || [];
  return a === '*' || a.includes(nama);
};

/** ubah data induk (produk, mitra, sales, pengaturan) — hanya Pemilik */
export const bolehUbah = () => setaraPemilik();

/** melihat seluruh angka toko — keuangan dan investor memang dibuatkan akun untuk ini */
const lihatSemuaAngka = () => setaraPemilik() || adalah('keuangan') || adalah('investor');

/** angka rahasia usaha: harga beli, HPP, laba, margin, nilai persediaan */
export const bolehLihatModal = () => lihatSemuaAngka();

/** kas, pembelian, hutang supplier, laporan laba rugi */
export const bolehLihatKas = () => lihatSemuaAngka();

/** mencatat transaksi baru (penjualan, konsinyasi, laporan konsinyasi) */
export const bolehTransaksi = () => setaraPemilik() || adalah('sales');

/** mencatat uang: kas manual, membayar hutang supplier, membayar komisi */
export const bolehKeuangan = () => setaraPemilik() || adalah('keuangan');

/** menerima pelunasan piutang mitra */
export const bolehTerimaBayar = () => bolehTransaksi() || adalah('keuangan');

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
