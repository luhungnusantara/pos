/* sinkron.js — menyetor data lapangan ke server dan menarik perubahan.

   Aplikasi tetap bekerja penuh tanpa server. Sinkronisasi hanya menambahkan
   satu hal: perangkat lain bisa ikut melihat. Karena itu seluruh modul ini
   dirancang agar kegagalan jaringan tidak pernah menghalangi pencatatan —
   yang gagal terkirim hanya tinggal di antrean sampai sinyal kembali ada. */

import { db, save } from './store.js';
import { nowISO, uid } from './utils.js';
import { daring } from './luring.js';
import {
  antre, ambilAntrean, hapusAntrean, jumlahTertunda, kosongkanAntrean,
  simpanKunci, bacaKunci, hapusKunci, bacaBayangan, tulisBayangan,
} from './antrean.js';

/** koleksi yang ikut disinkronkan — sama persis dengan daftar di server */
const KOLEKSI = [
  'produk', 'mitra', 'sales', 'pembelian', 'opname', 'konsinyasi',
  'penjualan', 'pembayaran', 'kas', 'komisi', 'bayarKomisi', 'mutasi',
];

/* ---------- keadaan yang dipantau antarmuka ---------- */
export const KEADAAN = {
  mati: 'mati',           // server belum diatur
  siap: 'siap',           // semua sudah tersetor
  tertunda: 'tertunda',   // ada antrean menunggu sinyal
  kirim: 'kirim',         // sedang menyetor
  galat: 'galat',         // percobaan terakhir gagal
};

let keadaan = KEADAAN.mati;
let tertunda = 0;
let pesanGalat = '';
const pendengar = new Set();

function siarkan() {
  const info = { keadaan, tertunda, pesan: pesanGalat };
  pendengar.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } });
}

export function onSinkron(fn) {
  pendengar.add(fn);
  fn({ keadaan, tertunda, pesan: pesanGalat });
  return () => pendengar.delete(fn);
}

async function perbaruiJumlah() {
  try { tertunda = await jumlahTertunda(); } catch { tertunda = 0; }
}

function setKeadaan(k, pesan = '') {
  keadaan = k;
  pesanGalat = pesan;
  siarkan();
}

/* ---------- pengaturan sambungan ---------- */
export const alamatServer = () => String(db.pengaturan.server || '').replace(/\/+$/, '');
export const aktif = () => !!alamatServer();

export const bacaToken = () => bacaKunci('token');
export const bacaKursor = async () => (await bacaKunci('kursor')) || 0;

/** id perangkat, dipakai server untuk menandai asal setoran */
async function idPerangkat() {
  let id = await bacaKunci('perangkat');
  if (!id) { id = uid('dev_'); await simpanKunci('perangkat', id); }
  return id;
}

async function panggil(jalur, { metode = 'GET', body, token } = {}) {
  const alamat = alamatServer();
  if (!alamat) throw new Error('Alamat server belum diatur');
  const kepala = { 'Content-Type': 'application/json' };
  const t = token ?? (await bacaToken());
  if (t) kepala.Login = t;

  const res = await fetch(alamat + jalur, {
    method: metode,
    headers: kepala,
    body: body ? JSON.stringify(body) : undefined,
  });
  const teks = await res.text();
  let isi = teks;
  if (teks && (teks[0] === '{' || teks[0] === '[')) {
    try { isi = JSON.parse(teks); } catch { /* biarkan sebagai teks */ }
  }
  if (!res.ok) {
    const e = new Error(isi?.error || `Server menolak (${res.status})`);
    e.status = res.status;
    // 401/403 berarti sesi tidak lagi diterima — bukan gangguan jaringan,
    // jadi mencoba ulang tidak akan menolong sampai pengguna masuk lagi.
    e.sesiDitolak = res.status === 401 || res.status === 403;
    throw e;
  }
  return isi;
}

/* ---------- akun ---------- */
export async function masuk(phone, password) {
  const hasil = await panggil('/pos/masuk', { metode: 'POST', body: { phone, password }, token: '' });
  await simpanKunci('token', hasil.token);
  await simpanKunci('akun', hasil.user);
  await simpanKunci('toko', hasil.toko);
  await tandaiSeluruhnyaBaru();   // setoran pertama: kirim semua yang sudah ada
  return hasil;
}

export async function daftar({ nama_toko, nama, phone, password }) {
  const hasil = await panggil('/pos/daftar', {
    metode: 'POST', token: '',
    body: { nama_toko, nama, phone, password },
  });
  await simpanKunci('token', hasil.token);
  await simpanKunci('akun', hasil.user);
  await simpanKunci('toko', hasil.toko);
  await tandaiSeluruhnyaBaru();
  return hasil;
}

export async function keluar() {
  await hapusKunci('token');
  await hapusKunci('akun');
  await hapusKunci('toko');
  await hapusKunci('kursor');
  await kosongkanAntrean();
  await tulisBayangan({});
  await perbaruiJumlah();
  setKeadaan(aktif() ? KEADAAN.siap : KEADAAN.mati);
}

export const akunTersimpan = () => bacaKunci('akun');
export const tokoTersimpan = () => bacaKunci('toko');

/* ---------- kelola akun (hanya pemilik) ---------- */
export const daftarPengguna = () => panggil('/pos/pengguna');

export const tambahPengguna = ({ nama, phone, password, peran, refId }) =>
  panggil('/pos/pengguna', {
    metode: 'POST',
    body: { nama, phone, password, peran, ref_id: refId },
  });

export const ubahAkses = (id, nonaktif) =>
  panggil(`/pos/pengguna/${encodeURIComponent(id)}/akses`, {
    metode: 'POST', body: { nonaktif },
  });

/* ---------- deteksi perubahan ----------
   domain.js menulis langsung ke array db di belasan tempat, jadi menyadap
   fungsi CRUD saja akan melewatkan justru transaksi yang paling penting.
   Karena itu perubahan dikenali dengan membandingkan sidik jari isi database
   terhadap keadaan terakhir yang sudah diantrekan. */

/** sidik jari murah untuk satu rekaman (FNV-1a 32 bit atas JSON-nya) */
function sidik(obj) {
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36) + s.length.toString(36);
}

let sedangGabung = false;   // cegah data tarikan ikut terantre balik

export async function periksaPerubahan() {
  if (!aktif() || sedangGabung) return 0;
  const lama = (await bacaBayangan()) || {};
  const baru = {};
  const perubahan = [];

  for (const koleksi of KOLEKSI) {
    for (const rec of db[koleksi] || []) {
      if (!rec?.id) continue;
      const kunci = `${koleksi}/${rec.id}`;
      const s = sidik(rec);
      baru[kunci] = s;
      if (lama[kunci] !== s) {
        perubahan.push({
          koleksi, id: rec.id, data: rec,
          waktu_lokal: rec.tanggal || rec.dibuat || nowISO(),
          diubah: rec.diubah || rec.dibuat || nowISO(),
          dihapus: false,
        });
      }
    }
  }

  // pengaturan bukan array — diperlakukan sebagai satu rekaman tunggal
  const sPengaturan = sidik(db.pengaturan);
  baru['pengaturan/pengaturan'] = sPengaturan;
  if (lama['pengaturan/pengaturan'] !== sPengaturan) {
    perubahan.push({
      koleksi: 'pengaturan', id: 'pengaturan', data: db.pengaturan,
      waktu_lokal: nowISO(), diubah: nowISO(), dihapus: false,
    });
  }

  // baris yang hilang dari database berarti dihapus
  for (const kunci of Object.keys(lama)) {
    if (baru[kunci] !== undefined) continue;
    const [koleksi, id] = kunci.split('/');
    perubahan.push({ koleksi, id, data: null, waktu_lokal: nowISO(), diubah: nowISO(), dihapus: true });
  }

  if (perubahan.length) {
    await antre(perubahan);
    await tulisBayangan(baru);
    await perbaruiJumlah();
    if (keadaan !== KEADAAN.kirim) setKeadaan(KEADAAN.tertunda);
  }
  return perubahan.length;
}

/** lupakan bayangan sehingga seluruh isi database dianggap perlu disetor */
export async function tandaiSeluruhnyaBaru() {
  await tulisBayangan({});
  await periksaPerubahan();
}

/* ---------- setor & tarik ---------- */
let sedangJalan = false;

export async function dorong() {
  const antrean = await ambilAntrean(500);
  if (!antrean.length) return { disimpan: 0 };

  const hasil = await panggil('/pos/sinkron/kirim', {
    metode: 'POST',
    body: {
      perangkat: await idPerangkat(),
      rekaman: antrean.map(a => ({
        koleksi: a.koleksi, id: a.id, data: a.data,
        waktu_lokal: a.waktu_lokal, diubah: a.diubah, dihapus: a.dihapus,
      })),
    },
  });

  // Rekaman yang ditolak karena wewenang atau kalah baru tidak akan pernah
  // diterima berapa kali pun diulang, jadi ikut dikeluarkan dari antrean
  // supaya tidak menyumbat setoran berikutnya.
  await hapusAntrean(antrean.map(a => a.no));
  await perbaruiJumlah();
  return hasil;
}

export async function tarik() {
  let kursor = await bacaKursor();
  let masuk = 0;
  for (let putaran = 0; putaran < 20; putaran++) {
    const hasil = await panggil(`/pos/sinkron/ambil?sejak=${kursor}`);
    if (!hasil.rekaman?.length) break;
    gabungkan(hasil.rekaman);
    masuk += hasil.rekaman.length;
    kursor = hasil.kursor;
    await simpanKunci('kursor', kursor);
    if (!hasil.lagi) break;
  }
  return masuk;
}

/** terapkan rekaman dari server ke database lokal */
function gabungkan(rekaman) {
  sedangGabung = true;
  try {
    for (const r of rekaman) {
      if (r.koleksi === 'pengaturan') {
        if (r.data) db.pengaturan = { ...db.pengaturan, ...r.data };
        continue;
      }
      const arr = (db[r.koleksi] ||= []);
      const i = arr.findIndex(x => x.id === r.id);
      if (r.dihapus) { if (i >= 0) arr.splice(i, 1); continue; }
      if (!r.data) continue;
      if (i >= 0) arr[i] = r.data; else arr.unshift(r.data);
    }
    save(true);
  } finally {
    sedangGabung = false;
  }
  // sesuaikan bayangan agar hasil tarikan tidak ikut terantre balik
  periksaPerubahanDiam();
}

async function periksaPerubahanDiam() {
  const baru = {};
  for (const koleksi of KOLEKSI) {
    for (const rec of db[koleksi] || []) if (rec?.id) baru[`${koleksi}/${rec.id}`] = sidik(rec);
  }
  baru['pengaturan/pengaturan'] = sidik(db.pengaturan);
  const lama = (await bacaBayangan()) || {};
  // hanya tambahkan sidik baru; jangan hapus tanda perubahan yang belum terkirim
  await tulisBayangan({ ...lama, ...baru });
}

/**
 * Jalankan satu putaran sinkronisasi.
 * Aman dipanggil kapan saja: kalau server belum diatur, belum login, atau
 * sedang tidak ada sinyal, fungsi ini diam saja tanpa melempar galat.
 */
export async function jalankan({ paksa = false } = {}) {
  if (!aktif()) { setKeadaan(KEADAAN.mati); return false; }
  if (sedangJalan && !paksa) return false;
  if (!daring()) {
    await perbaruiJumlah();
    setKeadaan(tertunda ? KEADAAN.tertunda : KEADAAN.siap);
    return false;
  }
  if (!(await bacaToken())) { setKeadaan(KEADAAN.mati); return false; }

  sedangJalan = true;
  setKeadaan(KEADAAN.kirim);
  try {
    // service worker tidak bisa membaca localStorage, jadi alamat server
    // dititipkan di IndexedDB untuk dipakai saat Background Sync
    await simpanKunci('server', alamatServer());
    await periksaPerubahan();
    await dorong();
    await tarik();
    await perbaruiJumlah();
    setKeadaan(tertunda ? KEADAAN.tertunda : KEADAAN.siap);
    return true;
  } catch (e) {
    await perbaruiJumlah();
    setKeadaan(KEADAAN.galat, e.message);
    if (e.sesiDitolak) {
      // Data yang belum tersetor tetap aman di antrean; yang hilang hanya izinnya.
      window.dispatchEvent(new CustomEvent('pos:sesi-ditolak', { detail: e.message }));
    }
    return false;
  } finally {
    sedangJalan = false;
  }
}

/** himpunan "koleksi/id" yang masih menunggu giliran setor */
export async function kunciTertunda() {
  try {
    const antrean = await ambilAntrean(2000);
    return new Set(antrean.map(a => `${a.koleksi}/${a.id}`));
  } catch {
    return new Set();
  }
}

/* ---------- pemicu otomatis ---------- */
let sudahDipasang = false;

export function pasangPemicu() {
  if (sudahDipasang) return;
  sudahDipasang = true;

  // 1. begitu jaringan kembali ada
  window.addEventListener('online', () => jalankan());

  // 2. saat aplikasi kembali dibuka
  document.addEventListener('visibilitychange', () => { if (!document.hidden) jalankan(); });

  // 3. berkala selama aplikasi terbuka
  setInterval(() => jalankan(), 3 * 60 * 1000);

  // 4. setiap kali ada perubahan data, catat ke antrean lalu coba setor
  let tunda;
  window.addEventListener('pos:tersimpan', () => {
    clearTimeout(tunda);
    tunda = setTimeout(async () => {
      const n = await periksaPerubahan();
      if (n) { daftarkanBackgroundSync(); jalankan(); }
    }, 600);
  });

  jalankan();
}

/**
 * Background Sync: browser menyetor antrean sendiri begitu jaringan pulih,
 * bahkan saat aplikasi sudah ditutup. Tidak semua peramban mendukungnya
 * (iOS belum), karena itu keempat pemicu di atas tetap menjadi andalan utama.
 */
export async function daftarkanBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.sync) await reg.sync.register('pos-sinkron');
  } catch { /* tidak didukung — pemicu biasa sudah cukup */ }
}
