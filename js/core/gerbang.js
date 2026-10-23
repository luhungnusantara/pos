/* gerbang.js — layar masuk yang menutup aplikasi sampai pengguna terverifikasi.

   Sengaja dibuat sebagai lapisan penuh di atas segalanya, bukan sekadar
   pengalihan halaman: router dan menu tidak boleh sempat menggambar data
   sebelum diketahui siapa yang memegang perangkat. */

import { db } from './store.js';
import { esc } from './utils.js';
import { masuk } from './sinkron.js';
import { sesiTersimpan, terapkanPeranDariAkun, setPeranTerkunci } from './sesi.js';

const PERAN_TEKS = { owner: 'Pemilik', sales: 'Sales', mitra: 'Agen / Reseller' };

function akar() {
  let el = document.getElementById('gerbangRoot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gerbangRoot';
    el.className = 'gerbang';
    document.body.appendChild(el);
  }
  return el;
}

export function tutupGerbang() {
  document.getElementById('gerbangRoot')?.remove();
  document.body.classList.remove('terkunci');
}

/**
 * Tampilkan layar masuk. Promise selesai hanya ketika pengguna berhasil masuk.
 *
 * Tidak ada jalan keluar lain dari layar ini — itu memang maksudnya.
 *
 * @param {{sebabKedaluwarsa?: boolean}} opsi
 * @returns {Promise<'masuk'>}
 */
export function bukaGerbang({ sebabKedaluwarsa = false } = {}) {
  return new Promise(selesai => {
    const el = akar();
    document.body.classList.add('terkunci');

    /* Hanya ada jalan masuk. Pendaftaran mandiri ditutup di server: akun baru
       dibuatkan pemilik (Pengaturan → Akun Pengguna) atau pusat (Buka Cabang). */
    const gambar = () => {
      el.innerHTML = `
        <div class="gerbang-kotak">
          <div class="gerbang-kepala">
            <div class="brand-logo"><img src="img/mark-putih.svg" alt="" width="26" height="26"></div>
            <div>
              <strong>${esc(db.pengaturan.namaToko || 'POS')}</strong>
              <div class="muted xs">Masuk untuk mulai mencatat</div>
            </div>
          </div>

          ${sebabKedaluwarsa ? `<div class="hint warn mb12">⏳ Sesi Anda sudah berakhir.
            Data di perangkat ini <b>tetap utuh</b> — masuk lagi untuk melanjutkan.</div>` : ''}

          <div class="field">
            <label class="lbl">Nomor HP</label>
            <input class="input" id="gPhone" type="tel" inputmode="tel"
                   autocomplete="username" placeholder="0812xxxxxxxx">
          </div>
          <div class="field">
            <label class="lbl">Kata sandi</label>
            <input class="input" id="gSandi" type="password" autocomplete="current-password">
          </div>

          <div class="err mb12" id="gGalat" hidden></div>

          <button class="btn btn-primary btn-block" id="gKirim">Masuk</button>

          <div class="gerbang-kaki">
            <div class="hint"><b>Belum punya akun?</b> Minta pemilik toko membuatkannya untuk Anda.</div>
            <div class="hint mt8">Butuh jaringan untuk masuk pertama kali. Sesudah itu aplikasi tetap bisa dipakai tanpa sinyal.</div>
          </div>
        </div>`;

      pasang();
    };

    const galat = pesan => {
      const g = el.querySelector('#gGalat');
      if (!g) return;
      g.textContent = pesan;
      g.hidden = !pesan;
    };

    const sibuk = on => {
      el.querySelectorAll('button,input').forEach(b => { b.disabled = on; });
      const t = el.querySelector('#gKirim');
      if (t) t.textContent = on ? 'Memeriksa…' : 'Masuk';
    };

    const sukses = async () => {
      const s = await sesiTersimpan();
      if (s?.akun) {
        terapkanPeranDariAkun(s.akun);
        setPeranTerkunci(true);
        console.info(`masuk sebagai ${s.akun.nama} (${PERAN_TEKS[s.akun.peran] || s.akun.peran})`);
      }
      tutupGerbang();
      selesai('masuk');
    };

    function pasang() {
      el.querySelector('#gKirim').onclick = async () => {
        const phone = el.querySelector('#gPhone').value.trim();
        const sandi = el.querySelector('#gSandi').value;
        if (!phone || !sandi) return galat('Nomor HP dan kata sandi wajib diisi.');

        galat('');
        sibuk(true);
        try {
          await masuk(phone, sandi);
          await sukses();
        } catch (e) {
          sibuk(false);
          galat(e.message || 'Gagal masuk.');
        }
      };

      el.querySelector('#gPhone').focus();
      el.onkeydown = e => { if (e.key === 'Enter') el.querySelector('#gKirim').click(); };
    }

    gambar();
  });
}
