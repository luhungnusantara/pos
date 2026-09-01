/* pages/pusat.js — daftar cabang untuk akun pusat.

   Database lokal aplikasi hanya memuat satu cabang, jadi halaman ini bekerja
   sebagai pemilih: pilih cabang, lalu seluruh aplikasi bekerja persis seperti
   pemilik cabang itu. Daftar cabangnya sendiri diambil langsung dari server,
   tidak disimpan lokal, supaya tidak ada dua sumber kebenaran. */

import { setJudul, setTopbar, setFab, formModal, konfirmasi, modal,
         sukses, gagal, badge, kosongState, avatarEl } from '../core/ui.js';
import { esc } from '../core/utils.js';
import { isPusat } from '../core/peran.js';
import { daring } from '../core/luring.js';
import { daftarCabang, tambahCabang, gantiCabang, cabangAktif } from '../core/sinkron.js';

export function render(view) {
  setJudul('Cabang', 'Seluruh cabang di bawah pusat');
  setTopbar([]);
  setFab(null);

  if (!isPusat()) {
    view.innerHTML = kosongState('🏛️', 'Halaman khusus pusat',
      'Masuk dengan akun pusat untuk membuka daftar cabang.');
    return;
  }

  setTopbar([{ teks: 'Muat ulang', ikon: '🔄', kelas: 'btn-ghost btn-sm', onClick: () => gambar() }]);
  setFab({ ikon: '＋', teks: 'Buka cabang', onClick: () => formCabang(gambar) });

  view.innerHTML = '<div class="card"><div class="card-body"><div class="hint">Memuat daftar cabang…</div></div></div>';
  gambar();

  async function gambar() {
    if (!daring()) {
      view.innerHTML = kosongState('📶', 'Perlu jaringan',
        'Daftar cabang diambil langsung dari server, jadi tidak tersedia saat luring. ' +
        'Cabang yang sedang dibuka tetap bisa dipakai seperti biasa.');
      return;
    }

    let cabang;
    try {
      cabang = await daftarCabang();
    } catch (e) {
      view.innerHTML = kosongState('⚠️', 'Gagal memuat', esc(e.message));
      return;
    }

    const aktif = cabangAktif();
    if (!cabang.length) {
      view.innerHTML = kosongState('🏢', 'Belum ada cabang',
        'Buka cabang pertama Anda. Akun pemiliknya dibuat sekaligus.',
        '<button class="btn btn-primary" id="pertama">＋ Buka Cabang</button>');
      view.querySelector('#pertama')?.addEventListener('click', () => formCabang(gambar));
      return;
    }

    view.innerHTML = `
      <div class="hint mb12">Pilih cabang untuk membukanya. Seluruh menu lalu bekerja
        pada cabang itu — kasir, stok, laporan, semuanya.</div>
      <div class="card"><div class="list">
        ${cabang.map(c => {
          const ini = c._id === aktif;
          return `<button class="row-item" data-buka="${esc(c._id)}" data-nama="${esc(c.nama)}"
                          ${ini ? 'style="background:var(--primary-soft)"' : ''}>
            ${avatarEl(c.nama)}
            <div class="ri-main">
              <div class="ri-title">${esc(c.nama)} ${ini ? badge('sedang dibuka', 'ok') : ''}</div>
              <div class="ri-sub">Kode ${esc(c.kode || '-')}</div>
            </div>
            <span class="muted">${ini ? '' : '›'}</span>
          </button>`;
        }).join('')}
      </div></div>
      <div class="hint mt12">⚠️ Berpindah cabang mengganti seluruh isi data di perangkat ini.
        Catatan yang belum tersetor harus dikirim lebih dulu, supaya tidak masuk
        ke cabang yang keliru.</div>`;

    view.querySelectorAll('[data-buka]').forEach(b => {
      b.onclick = () => bukaCabang(b.dataset.buka, b.dataset.nama, gambar);
    });
  }
}

async function bukaCabang(id, nama, ulang) {
  if (id === cabangAktif()) return;

  const ya = await konfirmasi({
    judul: `Buka cabang ${nama}?`,
    ok: 'Ya, buka cabang',
    pesan: `Seluruh data di perangkat ini akan diganti dengan data <b>${esc(nama)}</b>.
            <br><br>Data cabang yang sekarang <b>tidak hilang</b> — ia tetap tersimpan
            di server dan akan ditarik lagi bila cabangnya dibuka kembali.`,
  });
  if (!ya) return;

  const h = modal({
    judul: 'Membuka cabang',
    isi: `<div class="hint">Menyetor sisa catatan, lalu menarik data ${esc(nama)}.
            Jangan tutup halaman ini.</div>`,
    tombol: [],
  });

  const hasil = await gantiCabang(id, nama);
  h?.tutup?.();

  if (!hasil.ok) return gagal(hasil.pesan || 'Gagal berpindah cabang');
  sukses(`Cabang ${nama} dibuka`);
  // Muat ulang agar seluruh halaman menggambar dari data cabang yang baru.
  setTimeout(() => location.reload(), 500);
  ulang?.();
}

function formCabang(ulang) {
  formModal({
    judul: 'Buka Cabang Baru',
    field: [
      { name: 'namaToko', label: 'Nama cabang / distributor', wajib: true, lebar: 'full' },
      { name: 'nama', label: 'Nama pemilik cabang', wajib: true, lebar: 'full' },
      { name: 'phone', label: 'Nomor HP pemilik', tipe: 'tel', wajib: true, lebar: 'full',
        hint: 'Dipakai untuk masuk. Format 628xxxxxxxxx' },
      { name: 'password', label: 'Kata sandi (min. 6 karakter)', tipe: 'password', wajib: true, lebar: 'full' },
    ],
    onSimpan: async d => {
      if (String(d.password).length < 6) { gagal('Kata sandi minimal 6 karakter'); throw new Error('pendek'); }
      try {
        await tambahCabang({
          namaToko: d.namaToko, nama: d.nama,
          phone: String(d.phone).trim(), password: d.password,
        });
        sukses(`Cabang ${d.namaToko} dibuka — berikan nomor HP dan sandinya kepada pemiliknya`);
        ulang?.();
      } catch (e) { gagal(e.message); throw e; }
    },
  });
}
