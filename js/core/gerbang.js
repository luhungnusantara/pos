/* gerbang.js — layar masuk yang menutup aplikasi sampai pengguna terverifikasi.

   Sengaja dibuat sebagai lapisan penuh di atas segalanya, bukan sekadar
   pengalihan halaman: router dan menu tidak boleh sempat menggambar data
   sebelum diketahui siapa yang memegang perangkat. */

import { db, setPengaturan } from './store.js';
import { esc } from './utils.js';
import { masuk, daftar, alamatServer } from './sinkron.js';
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
 * Tampilkan layar masuk. Promise selesai ketika pengguna berhasil masuk,
 * atau memilih memakai aplikasi tanpa server.
 *
 * @param {{sebabKedaluwarsa?: boolean}} opsi
 * @returns {Promise<'masuk'|'lokal'>}
 */
export function bukaGerbang({ sebabKedaluwarsa = false } = {}) {
  return new Promise(selesai => {
    const el = akar();
    document.body.classList.add('terkunci');
    const adaServer = !!alamatServer();

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

        ${adaServer ? '' : `<div class="hint warn mb12">⚠️ Alamat server belum diatur.
          Tanpa server, tidak ada yang bisa memeriksa kata sandi.</div>`}

        <div class="field">
          <label class="lbl">Nomor HP</label>
          <input class="input" id="gPhone" type="tel" inputmode="tel"
                 autocomplete="username" placeholder="628xxxxxxxxx">
        </div>
        <div class="field">
          <label class="lbl">Kata sandi</label>
          <input class="input" id="gSandi" type="password" autocomplete="current-password">
        </div>
        ${adaServer ? '' : `
        <div class="field">
          <label class="lbl">Alamat server</label>
          <input class="input" id="gServer" type="url" inputmode="url" placeholder="https://api.contoh.id">
        </div>`}

        <div class="err mb12" id="gGalat" hidden></div>

        <button class="btn btn-primary btn-block" id="gMasuk">Masuk</button>
        <button class="btn btn-ghost btn-block mt8" id="gDaftar">Daftarkan Toko Baru</button>

        <div class="gerbang-kaki">
          <button class="tautan" id="gLokal">Pakai tanpa server di perangkat ini</button>
          <div class="hint mt8">Data hanya tersimpan di perangkat ini dan tidak
            dibagikan ke siapa pun. Cocok untuk mencoba, tetapi peran tidak bisa
            ditegakkan tanpa server.</div>
        </div>
      </div>`;

    const galat = pesan => {
      const g = el.querySelector('#gGalat');
      g.textContent = pesan;
      g.hidden = !pesan;
    };
    const sibuk = on => {
      el.querySelectorAll('button,input').forEach(b => { b.disabled = on; });
      el.querySelector('#gMasuk').textContent = on ? 'Memeriksa…' : 'Masuk';
    };

    const simpanServerBila = () => {
      const s = el.querySelector('#gServer');
      if (!s) return true;
      const nilai = s.value.trim().replace(/\/+$/, '');
      if (!nilai) { galat('Alamat server wajib diisi.'); return false; }
      setPengaturan({ server: nilai });
      return true;
    };

    const sukses = async () => {
      const s = await sesiTersimpan();
      if (s?.akun) {
        terapkanPeranDariAkun(s.akun);
        setPeranTerkunci(true);
      }
      tutupGerbang();
      selesai('masuk');
    };

    el.querySelector('#gMasuk').onclick = async () => {
      const phone = el.querySelector('#gPhone').value.trim();
      const sandi = el.querySelector('#gSandi').value;
      if (!phone || !sandi) return galat('Nomor HP dan kata sandi wajib diisi.');
      if (!simpanServerBila()) return;
      galat('');
      sibuk(true);
      try {
        const hasil = await masuk(phone, sandi);
        const p = PERAN_TEKS[hasil.user?.peran] || hasil.user?.peran || '';
        console.info(`masuk sebagai ${hasil.user?.nama} (${p})`);
        await sukses();
      } catch (e) {
        sibuk(false);
        galat(e.message || 'Gagal masuk.');
      }
    };

    el.querySelector('#gDaftar').onclick = async () => {
      const phone = el.querySelector('#gPhone').value.trim();
      const sandi = el.querySelector('#gSandi').value;
      if (!phone || sandi.length < 6)
        return galat('Isi nomor HP dan kata sandi minimal 6 karakter, lalu tekan Daftarkan.');
      if (!simpanServerBila()) return;
      const namaToko = prompt('Nama toko / distributor:', db.pengaturan.namaToko || '');
      if (!namaToko) return;
      const nama = prompt('Nama pemilik:', db.pengaturan.pemilik || '');
      if (!nama) return;
      galat('');
      sibuk(true);
      try {
        await daftar({ nama_toko: namaToko, nama, phone, password: sandi });
        await sukses();
      } catch (e) {
        sibuk(false);
        galat(e.message || 'Gagal mendaftar.');
      }
    };

    el.querySelector('#gLokal').onclick = () => {
      setPeranTerkunci(false);
      tutupGerbang();
      selesai('lokal');
    };

    el.querySelector('#gPhone').focus();
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') el.querySelector('#gMasuk').click();
    });
  });
}
