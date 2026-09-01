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

    // 'masuk' untuk akun yang sudah ada, 'daftar' untuk toko baru
    let mode = 'masuk';

    const gambar = () => {
      const adaServer = !!alamatServer();
      const daftarMode = mode === 'daftar';

      el.innerHTML = `
        <div class="gerbang-kotak">
          <div class="gerbang-kepala">
            <div class="brand-logo"><img src="img/mark-putih.svg" alt="" width="26" height="26"></div>
            <div>
              <strong>${esc(db.pengaturan.namaToko || 'POS')}</strong>
              <div class="muted xs">${daftarMode
                ? 'Daftarkan toko & buat akun pemilik'
                : 'Masuk untuk mulai mencatat'}</div>
            </div>
          </div>

          ${sebabKedaluwarsa && !daftarMode ? `<div class="hint warn mb12">⏳ Sesi Anda sudah berakhir.
            Data di perangkat ini <b>tetap utuh</b> — masuk lagi untuk melanjutkan.</div>` : ''}

          ${adaServer ? '' : `<div class="field">
            <label class="lbl">Alamat server</label>
            <input class="input" id="gServer" type="url" inputmode="url"
                   autocomplete="off" placeholder="https://api.contoh.id">
            <div class="hint">Tanpa server, tidak ada yang bisa memeriksa kata sandi.</div>
          </div>`}

          ${daftarMode ? `
          <div class="field">
            <label class="lbl">Nama toko / distributor</label>
            <input class="input" id="gToko" autocomplete="organization"
                   value="${esc(db.pengaturan.namaToko || '')}">
          </div>
          <div class="field">
            <label class="lbl">Nama pemilik</label>
            <input class="input" id="gNama" autocomplete="name"
                   value="${esc(db.pengaturan.pemilik || '')}">
          </div>` : ''}

          <div class="field">
            <label class="lbl">Nomor HP</label>
            <input class="input" id="gPhone" type="tel" inputmode="tel"
                   autocomplete="username" placeholder="628xxxxxxxxx">
            ${daftarMode ? '<div class="hint">Nomor ini yang dipakai untuk masuk nanti.</div>' : ''}
          </div>
          <div class="field">
            <label class="lbl">Kata sandi${daftarMode ? ' (min. 6 karakter)' : ''}</label>
            <input class="input" id="gSandi" type="password"
                   autocomplete="${daftarMode ? 'new-password' : 'current-password'}">
          </div>

          <div class="err mb12" id="gGalat" hidden></div>

          <button class="btn btn-primary btn-block" id="gKirim">${
            daftarMode ? 'Daftarkan Toko' : 'Masuk'}</button>

          <div class="gerbang-kaki">
            <button class="tautan" id="gTukar">${daftarMode
              ? 'Sudah punya akun? Masuk'
              : 'Belum punya akun? Daftarkan toko baru'}</button>
            <div class="hint mt8">${daftarMode
              ? 'Akun pertama otomatis menjadi <b>Pemilik</b>. Akun untuk sales dan agen dibuat setelah masuk, lewat Pengaturan → Akun Pengguna.'
              : 'Butuh jaringan untuk masuk pertama kali. Sesudah itu aplikasi tetap bisa dipakai tanpa sinyal.'}</div>
            <button class="tautan mt12" id="gLokal">Pakai tanpa server di perangkat ini</button>
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
      if (t) t.textContent = on ? 'Memeriksa…' : (mode === 'daftar' ? 'Daftarkan Toko' : 'Masuk');
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
      setPengaturan({ tanpaServer: false });
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
      el.querySelector('#gTukar').onclick = () => {
        mode = mode === 'masuk' ? 'daftar' : 'masuk';
        gambar();
      };

      el.querySelector('#gLokal').onclick = () => {
        // Disimpan agar tidak ditanyakan lagi setiap kali aplikasi dibuka.
        // Mengisi alamat server di Pengaturan akan membatalkan pilihan ini.
        setPengaturan({ tanpaServer: true });
        setPeranTerkunci(false);
        tutupGerbang();
        selesai('lokal');
      };

      el.querySelector('#gKirim').onclick = async () => {
        const phone = el.querySelector('#gPhone').value.trim();
        const sandi = el.querySelector('#gSandi').value;
        if (!phone || !sandi) return galat('Nomor HP dan kata sandi wajib diisi.');

        const daftarMode = mode === 'daftar';
        let namaToko = '', nama = '';
        if (daftarMode) {
          namaToko = el.querySelector('#gToko').value.trim();
          nama = el.querySelector('#gNama').value.trim();
          if (!namaToko || !nama) return galat('Nama toko dan nama pemilik wajib diisi.');
          if (sandi.length < 6) return galat('Kata sandi minimal 6 karakter.');
        }
        if (!simpanServerBila()) return;

        galat('');
        sibuk(true);
        try {
          if (daftarMode) await daftar({ nama_toko: namaToko, nama, phone, password: sandi });
          else await masuk(phone, sandi);
          await sukses();
        } catch (e) {
          sibuk(false);
          galat(e.message || (daftarMode ? 'Gagal mendaftar.' : 'Gagal masuk.'));
        }
      };

      el.querySelector('#gPhone').focus();
      el.onkeydown = e => { if (e.key === 'Enter') el.querySelector('#gKirim').click(); };
    }

    gambar();
  });
}
