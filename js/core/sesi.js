/* sesi.js — gerbang masuk aplikasi.

   Sebelum ini, peran perangkat hanya menyembunyikan menu: siapa pun yang
   memegang perangkat bisa berpindah menjadi Pemilik lewat dialog. Dengan
   kredensial server, peran menjadi nyata — ia berasal dari akun yang
   terverifikasi, dan server menolak setoran di luar wewenangnya.

   Aplikasi tetap harus bisa dipakai tanpa sinyal, jadi login penuh hanya
   dibutuhkan sekali. Setelah itu sesi disimpan di perangkat dan berlaku
   sampai tokennya kedaluwarsa (60 hari), sehingga kasir di lapangan tidak
   pernah terkunci hanya karena tidak ada jaringan. */

import { db, setSesi } from './store.js';
import { bacaToken, akunTersimpan, tokoTersimpan, aktif as serverDiatur } from './sinkron.js';

export { serverDiatur };

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
 * Urutannya penting:
 *
 * 1. Sudah ada sesi sah         -> langsung masuk.
 * 2. Alamat server sudah diisi  -> wajib masuk.
 * 3. Pengguna pernah memilih
 *    "pakai tanpa server"       -> hormati pilihannya, jangan tanya lagi.
 * 4. Perangkat masih baru       -> tampilkan.
 *
 * Butir keempat mudah terlewat dan sempat salah di sini: layar masuk adalah
 * satu-satunya tempat alamat server bisa diisi, jadi melewatinya ketika server
 * belum diatur membuat pengguna baru tidak punya jalan masuk sama sekali.
 */
export async function perluLogin() {
  if (await sesiSah()) return false;
  if (serverDiatur()) return true;
  return db.pengaturan.tanpaServer !== true;
}

/** peran perangkat mengikuti akun yang masuk, bukan pilihan manual */
export function terapkanPeranDariAkun(akun) {
  if (!akun?.peran) return null;
  const patch = { peran: akun.peran, salesId: '', mitraId: '' };
  if (akun.peran === 'sales') patch.salesId = akun.ref_id || '';
  if (akun.peran === 'mitra') patch.mitraId = akun.ref_id || '';
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
  terapkanPeranDariAkun(s.akun);
  setPeranTerkunci(true);
  return s;
}
