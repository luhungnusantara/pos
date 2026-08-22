/* app.js — titik masuk aplikasi */
import { db, sub } from './core/store.js';
import { mulaiRouter, pergi, onRute, ruteAktif } from './core/router.js';
import { toast, konfirmasi } from './core/ui.js';
import { $, esc } from './core/utils.js';
import { komisiTertunda } from './core/domain.js';

/* ---------- daftar menu ---------- */
const MENU = [
  {
    grup: 'Utama', item: [
      { id: 'dashboard', teks: 'Dashboard', ikon: '📊' },
      { id: 'kasir', teks: 'Penjualan Baru', ikon: '🧾' },
    ],
  },
  {
    grup: 'Transaksi', item: [
      { id: 'penjualan', teks: 'Riwayat Penjualan', ikon: '💰' },
      { id: 'konsinyasi', teks: 'Konsinyasi', ikon: '🤝' },
      { id: 'pembelian', teks: 'Pembelian / Stok Masuk', ikon: '📥' },
      { id: 'piutang', teks: 'Piutang & Hutang', ikon: '📌' },
    ],
  },
  {
    grup: 'Persediaan', item: [
      { id: 'produk', teks: 'Data Produk', ikon: '🚬' },
      { id: 'stok', teks: 'Kartu Stok', ikon: '📦' },
      { id: 'opname', teks: 'Stok Opname', ikon: '📋' },
    ],
  },
  {
    grup: 'Mitra & Sales', item: [
      { id: 'mitra', teks: 'Agen & Reseller', ikon: '🏪' },
      { id: 'sales', teks: 'Data Sales', ikon: '👤' },
      { id: 'komisi', teks: 'Komisi Sales', ikon: '🎯', lencana: () => komisiTertunda() > 0 ? '!' : '' },
    ],
  },
  {
    grup: 'Keuangan', item: [
      { id: 'kas', teks: 'Kas Masuk & Keluar', ikon: '🏦' },
      { id: 'laporan', teks: 'Laporan', ikon: '📈' },
    ],
  },
  {
    grup: 'Lainnya', item: [
      { id: 'pengaturan', teks: 'Pengaturan', ikon: '⚙️' },
    ],
  },
];

const BOTTOM = [
  { id: 'dashboard', teks: 'Beranda', ikon: '📊' },
  { id: 'kasir', teks: 'Jual', ikon: '🧾' },
  { id: 'konsinyasi', teks: 'Titipan', ikon: '🤝' },
  { id: 'stok', teks: 'Stok', ikon: '📦' },
  { id: '_menu', teks: 'Menu', ikon: '☰' },
];

/* ---------- sidebar / drawer ---------- */
const sidebar = () => $('#sidebar');
const backdrop = () => $('#drawerBackdrop');

function bukaDrawer(buka) {
  sidebar().classList.toggle('open', buka);
  backdrop().hidden = !buka;
  document.body.style.overflow = buka && window.innerWidth < 900 ? 'hidden' : '';
}

function gambarMenu() {
  $('#mainNav').innerHTML = MENU.map(g => `
    <div class="nav-group">
      <div class="nav-label">${esc(g.grup)}</div>
      ${g.item.map(it => {
        const l = it.lencana?.() || '';
        return `<button class="nav-item" data-go="${it.id}">
          <span class="ico">${it.ikon}</span><span>${esc(it.teks)}</span>
          ${l ? `<span class="pill">${l}</span>` : ''}
        </button>`;
      }).join('')}
    </div>`).join('');

  $('#bottomNav').innerHTML = BOTTOM.map(it =>
    `<button class="bn-item" data-go="${it.id}"><span class="ico">${it.ikon}</span><span>${esc(it.teks)}</span></button>`
  ).join('');

  tandaiAktif(ruteAktif());
}

function tandaiAktif(nama) {
  document.querySelectorAll('.nav-item[data-go]').forEach(b =>
    b.classList.toggle('active', b.dataset.go === nama));
  document.querySelectorAll('.bn-item[data-go]').forEach(b =>
    b.classList.toggle('active', b.dataset.go === nama));
}

/* ---------- tema ---------- */
export function terapkanTema(tema) {
  const t = tema || db.pengaturan.tema || 'auto';
  const gelap = t === 'gelap' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', gelap ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', gelap ? '#111a2b' : '#0f766e');
}

/* ---------- identitas toko ---------- */
function gambarBrand() {
  $('#brandName').textContent = db.pengaturan.namaToko || 'POS Rokok';
  $('#brandSub').textContent = db.pengaturan.alamat || 'Agen & Reseller';
}

/* ---------- data contoh untuk pengguna baru ---------- */
async function tawarkanContoh() {
  if (db.produk.length || localStorage.getItem('pos_tolak_contoh')) return;
  const ya = await konfirmasi({
    judul: '👋 Selamat datang!',
    pesan: `Database masih kosong. Muat <b>data contoh</b> (produk rokok, agen, reseller, sales, stok, dan beberapa transaksi) agar Anda bisa langsung mencoba semua fitur?<br><br>
            Data contoh bisa dihapus kapan saja lewat menu <b>Pengaturan</b>.`,
    ok: 'Ya, muat contoh',
    batal: 'Mulai kosong',
  });
  if (ya) {
    const { isiContoh } = await import('./core/seed.js');
    isiContoh();
    toast('Data contoh berhasil dimuat', 'ok');
    location.hash = '#/dashboard';
    location.reload();
  } else {
    localStorage.setItem('pos_tolak_contoh', '1');
  }
}

/* ---------- bootstrap ---------- */
function mulai() {
  terapkanTema();
  gambarBrand();
  gambarMenu();

  // navigasi
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    const id = b.dataset.go;
    if (id === '_menu') { bukaDrawer(true); return; }
    pergi(id);
    if (window.innerWidth < 900) bukaDrawer(false);
  });

  $('#menuBtn').onclick = () => bukaDrawer(true);
  $('#drawerClose').onclick = () => bukaDrawer(false);
  backdrop().onclick = () => bukaDrawer(false);
  window.addEventListener('resize', () => { if (window.innerWidth >= 900) bukaDrawer(false); });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((db.pengaturan.tema || 'auto') === 'auto') terapkanTema();
  });

  onRute(nama => { tandaiAktif(nama); bukaDrawer(false); });
  sub(() => { gambarBrand(); tandaiAktif(ruteAktif()); });

  mulaiRouter();
  tawarkanContoh();

  // cegah zoom ganda-ketuk pada iOS untuk elemen tombol
  document.addEventListener('dblclick', e => {
    if (e.target.closest('button,.btn,.nav-item,.bn-item')) e.preventDefault();
  }, { passive: false });

  daftarkanServiceWorker();
}

/* agar aplikasi bisa dipasang di layar utama & tetap terbuka saat offline */
function daftarkanServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker tidak aktif:', e.message));
  });
}

document.addEventListener('DOMContentLoaded', mulai);
