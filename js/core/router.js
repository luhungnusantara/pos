/* router.js — navigasi berbasis hash + pemuatan halaman dinamis */
import { setJudul, setTopbar, setFab, gagal } from './ui.js';
import { bolehBuka, PERAN, peranAktif } from './peran.js';

const rute = {
  dashboard: () => import('../pages/dashboard.js'),
  pusat: () => import('../pages/pusat.js'),
  kasir: () => import('../pages/kasir.js'),
  penjualan: () => import('../pages/penjualan.js'),
  konsinyasi: () => import('../pages/konsinyasi.js'),
  produk: () => import('../pages/produk.js'),
  stok: () => import('../pages/stok.js'),
  opname: () => import('../pages/opname.js'),
  pembelian: () => import('../pages/pembelian.js'),
  mitra: () => import('../pages/mitra.js'),
  sales: () => import('../pages/sales.js'),
  komisi: () => import('../pages/komisi.js'),
  kas: () => import('../pages/kas.js'),
  piutang: () => import('../pages/piutang.js'),
  laporan: () => import('../pages/laporan.js'),
  pengaturan: () => import('../pages/pengaturan.js'),
};

let aktif = { nama: '', params: [], modul: null };
const pendengarRute = new Set();

export const onRute = fn => { pendengarRute.add(fn); return () => pendengarRute.delete(fn); };
export const ruteAktif = () => aktif.nama;

export const pergi = (path, ganti = false) => {
  const url = `#/${String(path).replace(/^#?\/?/, '')}`;
  if (location.hash === url) return muat();
  ganti ? location.replace(url) : (location.hash = url);
};

/** render ulang halaman yang sedang aktif */
export const segarkan = () => muat(true);

export async function muat(paksa = false) {
  const hash = location.hash.replace(/^#\/?/, '');
  const bagian = hash.split('/').filter(Boolean);
  const nama = bagian[0] || 'dashboard';
  const params = bagian.slice(1).map(decodeURIComponent);

  const view = document.getElementById('view');
  const pemuat = rute[nama];
  if (!pemuat) {
    view.innerHTML = `<div class="empty"><div class="em-ico">🧭</div><h3>Halaman tidak ditemukan</h3>
      <p>Menu <b>${nama}</b> belum tersedia.</p>
      <a class="btn btn-primary" href="#/dashboard">Kembali ke Dashboard</a></div>`;
    setJudul('404');
    return;
  }

  // gerbang peran: halaman di luar kewenangan tidak dirender sama sekali
  if (!bolehBuka(nama)) {
    const p = PERAN[peranAktif()];
    setTopbar([]);
    setFab(null);
    setJudul('Akses Dibatasi', `Peran ${p.label}`);
    view.innerHTML = `<div class="empty">
      <div class="em-ico">🔒</div>
      <h3>Menu ini hanya untuk Pemilik</h3>
      <p>Anda sedang masuk sebagai <b>${p.ikon} ${p.label}</b>, sehingga halaman
         <b>${nama}</b> tidak tersedia. Ganti peran lewat tombol di bagian bawah menu.</p>
      <a class="btn btn-primary" href="#/dashboard">Kembali ke Beranda</a>
    </div>`;
    return;
  }

  const pindahHalaman = aktif.nama !== nama;
  try {
    setTopbar([]);
    setFab(null);
    const modul = await pemuat();
    aktif = { nama, params, modul };
    view.innerHTML = '';
    await modul.render(view, params);
    if (pindahHalaman || !paksa) {
      view.scrollTop = 0;
      window.scrollTo({ top: 0 });
    }
    pendengarRute.forEach(fn => fn(nama, params));
  } catch (e) {
    console.error(e);
    gagal('Gagal memuat halaman: ' + e.message);
    view.innerHTML = `<div class="empty"><div class="em-ico">⚠️</div><h3>Terjadi kesalahan</h3>
      <p>${e.message}</p></div>`;
  }
}

export function mulaiRouter() {
  window.addEventListener('hashchange', () => muat());
  if (!location.hash) location.replace('#/dashboard');
  muat();
}
