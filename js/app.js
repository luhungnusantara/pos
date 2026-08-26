/* app.js — titik masuk aplikasi */
import { db, sub } from './core/store.js';
import { mulaiRouter, pergi, onRute, ruteAktif } from './core/router.js';
import { toast, konfirmasi } from './core/ui.js';
import { $, esc } from './core/utils.js';
import { komisiTertunda } from './core/domain.js';
import { PERAN, peranAktif, bolehBuka, namaPengguna, adalah, salesAktif } from './core/peran.js';
import { dialogGantiPeran } from './core/ganti-peran.js';
import { daftarkanServiceWorker, onJaringan, mintaPenyimpananTetap } from './core/luring.js';

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
      { id: 'komisi', teks: 'Komisi Sales', ikon: '🎯', lencana: () => (adalah('sales') ? komisiTertunda(salesAktif()?.id) : komisiTertunda()) > 0 ? '!' : '' },
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

/* navigasi bawah disesuaikan dengan peran perangkat */
const BOTTOM_PERAN = {
  owner: [
    { id: 'dashboard', teks: 'Beranda', ikon: '📊' },
    { id: 'kasir', teks: 'Jual', ikon: '🧾' },
    { id: 'konsinyasi', teks: 'Titipan', ikon: '🤝' },
    { id: 'stok', teks: 'Stok', ikon: '📦' },
    { id: '_menu', teks: 'Menu', ikon: '☰' },
  ],
  sales: [
    { id: 'dashboard', teks: 'Beranda', ikon: '📊' },
    { id: 'kasir', teks: 'Jual', ikon: '🧾' },
    { id: 'konsinyasi', teks: 'Titipan', ikon: '🤝' },
    { id: 'komisi', teks: 'Komisi', ikon: '🎯' },
    { id: '_menu', teks: 'Menu', ikon: '☰' },
  ],
  mitra: [
    { id: 'dashboard', teks: 'Beranda', ikon: '📊' },
    { id: 'konsinyasi', teks: 'Titipan', ikon: '🤝' },
    { id: 'penjualan', teks: 'Nota', ikon: '🧾' },
    { id: 'piutang', teks: 'Tagihan', ikon: '📌' },
    { id: '_menu', teks: 'Menu', ikon: '☰' },
  ],
};

/* ---------- sidebar / drawer ---------- */
const sidebar = () => $('#sidebar');
const backdrop = () => $('#drawerBackdrop');

function bukaDrawer(buka) {
  sidebar().classList.toggle('open', buka);
  backdrop().hidden = !buka;
  document.body.style.overflow = buka && window.innerWidth < 900 ? 'hidden' : '';
}

function gambarMenu() {
  // hanya tampilkan grup & menu yang boleh dibuka peran aktif
  const grupTampil = MENU
    .map(g => ({ ...g, item: g.item.filter(it => bolehBuka(it.id)) }))
    .filter(g => g.item.length);

  $('#mainNav').innerHTML = grupTampil.map(g => `
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

  const bawah = (BOTTOM_PERAN[peranAktif()] || BOTTOM_PERAN.owner)
    .filter(it => it.id === '_menu' || bolehBuka(it.id));
  const nav = $('#bottomNav');
  nav.style.gridTemplateColumns = `repeat(${bawah.length}, 1fr)`;
  nav.innerHTML = bawah.map(it =>
    `<button class="bn-item" data-go="${it.id}"><span class="ico">${it.ikon}</span><span>${esc(it.teks)}</span></button>`
  ).join('');

  gambarPeran();
  tandaiAktif(ruteAktif());
}

/** lencana peran + tombol ganti peran di kaki sidebar */
function gambarPeran() {
  const p = PERAN[peranAktif()];
  const kaki = document.querySelector('.sidebar-foot');
  if (!kaki) return;
  kaki.innerHTML = `
    <button class="btn btn-sm btn-block" id="btnPeran" style="justify-content:flex-start;gap:9px">
      <span style="font-size:16px">${p.ikon}</span>
      <span class="grow" style="text-align:left;min-width:0">
        <span style="display:block;font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(namaPengguna())}</span>
        <span class="xs muted">${esc(p.label)}</span>
      </span>
      <span class="muted">⇄</span>
    </button>
    <div class="muted xs mt8">v1.0 &middot; data tersimpan di perangkat</div>`;
  kaki.querySelector('#btnPeran').onclick = dialogGantiPeran;
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

  siapkanLuring();
}

/* ---------- mode luring ---------- */
function siapkanLuring() {
  const pil = $('#pilLuring');
  onJaringan(ada => { if (pil) pil.hidden = ada; });

  // minta izin penyimpanan tetap agar data tidak dibuang browser saat ruang menipis
  mintaPenyimpananTetap();

  daftarkanServiceWorker({
    onPembaruan: terapkan => toast('Versi baru tersedia. Ketuk untuk memuat ulang.', 'warn', 8000, terapkan),
  });
}

document.addEventListener('DOMContentLoaded', mulai);
