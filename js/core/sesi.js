/* sesi.js — gerbang masuk aplikasi.

   Sebelum ini, peran perangkat hanya menyembunyikan menu: siapa pun yang
   memegang perangkat bisa berpindah menjadi Pemilik lewat dialog. Dengan
   kredensial server, peran menjadi nyata — ia berasal dari akun yang
   terverifikasi, dan server menolak setoran di luar wewenangnya.

   Aplikasi tetap harus bisa dipakai tanpa sinyal, jadi login penuh hanya
   dibutuhkan sekali. Setelah itu sesi disimpan di perangkat dan berlaku
   sampai tokennya kedaluwarsa (60 hari), sehingga kasir di lapangan tidak
   pernah terkunci hanya karena tidak ada jaringan. */

import { setSesi } from './store.js';
import { bacaToken, akunTersimpan, tokoTersimpan, pusatTersimpan } from './sinkron.js';

/* ---------- membaca token PASETO v4.public ----------
   Hanya untuk keperluan tampilan: mengetahui kapan sesi habis agar bisa
   meminta login ulang sebelum setoran mulai gagal. Keabsahan tanda tangan
   tetap diperiksa server pada setiap permintaan — pemeriksaan di sisi klien
   tidak akan pernah menjadi pengaman, karena klien memang bisa diubah. */
function muatanToken(token) {
  try {
    const bagian = String(token || '').split('.');
    if (bagian.length < 3 || bagian[0] !== 'v4' || bagian[1] !== 'public') return null;

    let b64 = bagian[2].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const mentah = atob(b64);

    // muatan JSON diikuti tanda tangan Ed25519 sepanjang 64 bita
    if (mentah.length <= 64) return null;
    return JSON.parse(mentah.slice(0, mentah.length - 64));
  } catch {
    return null;
  }
}

/** sisa masa berlaku token dalam milidetik; null bila tidak terbaca */
export function sisaMasaToken(token) {
  const m = muatanToken(token);
  if (!m?.exp) return null;
  const habis = new Date(m.exp).getTime();
  return Number.isFinite(habis) ? habis - Date.now() : null;
}

export const tokenKedaluwarsa = token => {
  const sisa = sisaMasaToken(token);
  return sisa !== null && sisa <= 0;
};

/* ---------- keadaan sesi ---------- */

/**
 * Sesi yang tersimpan di perangkat.
 * @returns {Promise<{akun,toko,token,sisaHari}|null>}
 */
export async function sesiTersimpan() {
  try {
    const token = await bacaToken();
    if (!token) return null;
    const akun = await akunTersimpan();
    if (!akun) return null;
    const sisa = sisaMasaToken(token);
    return {
      token,
      akun,
      toko: await tokoTersimpan(),
      pusat: await pusatTersimpan(),
      sisaHari: sisa === null ? null : sisa / 86400000,
    };
  } catch (e) {
    // Penyimpanan tidak bisa dibaca (mode privat, kuota, izin dicabut).
    // Diperlakukan sebagai "belum masuk" — aplikasi tetap harus terbuka,
    // dan bila server diatur pengguna akan diminta masuk lagi.
    console.warn('Sesi tidak terbaca:', e.message);
    return null;
  }
}

/** sesi yang masih boleh dipakai (ada dan belum kedaluwarsa) */
export async function sesiSah() {
  const s = await sesiTersimpan();
  if (!s) return null;
  return tokenKedaluwarsa(s.token) ? null : s;
}

/**
 * Apakah layar masuk harus ditampilkan sebelum aplikasi terbuka.
 *
 * Jawabannya tunggal: selama belum ada sesi yang sah, aplikasi terkunci.
 * Tidak ada jalan pintas. Pintu darurat apa pun di layar ini akan membatalkan
 * seluruh gunanya mengunci aplikasi, karena siapa pun yang memegang perangkat
 * tinggal memakainya untuk mendapat akses penuh.
 */
export async function perluLogin() {
  return (await sesiSah()) === null;
}

/** peran perangkat mengikuti akun yang masuk, bukan pilihan manual */
/* ObjectID nol bukan id yang sah, tetapi truthy di JavaScript. Sempat lolos
   dan membuat akun pusat dianggap sudah memilih cabang, sehingga terkunci
   tidak bisa berpindah ke cabang mana pun. */
const idSah = v => !!v && !/^0+$/.test(String(v));

export function terapkanPeranDariAkun(akun, toko = null, pusat = null) {
  if (!akun?.peran) return null;
  const patch = { peran: akun.peran, salesId: '', mitraId: '' };
  if (akun.peran === 'sales') patch.salesId = akun.ref_id || '';
  if (akun.peran === 'mitra') patch.mitraId = akun.ref_id || '';
  if (akun.peran === 'pusat' && pusat?.nama) patch.namaPusat = pusat.nama;
  if (idSah(toko?._id)) { patch.cabangId = toko._id; patch.cabangNama = toko.nama || ''; }
  return setSesi(patch);
}

/** true bila peran ditentukan akun server sehingga tidak boleh diganti manual */
let terkunci = false;
export const peranTerkunci = () => terkunci;
export const setPeranTerkunci = v => { terkunci = !!v; };

/**
 * Selaraskan peran perangkat dengan sesi yang tersimpan.
 * Dipanggil saat aplikasi mulai, sebelum menu digambar.
 */
export async function selaraskanPeran() {
  const s = await sesiSah();
  if (!s) { setPeranTerkunci(false); return null; }
  terapkanPeranDariAkun(s.akun, s.toko, s.pusat);
  setPeranTerkunci(true);
  return s;
}
