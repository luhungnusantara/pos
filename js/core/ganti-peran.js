/* ganti-peran.js — dialog pemilihan peran perangkat */
import { db } from './store.js';
import { PERAN, peranAktif, gantiPeran, pinDipasang, cocokPin, namaPengguna } from './peran.js';
import { peranTerkunci, sesiTersimpan } from './sesi.js';
import { modal, pilihItem, konfirmasi, sukses, gagal, badge, avatarEl } from './ui.js';
import { esc, num, sortBy } from './utils.js';
import { stokKonsinyasi, totalPiutang } from './domain.js';

const mulaiUlang = pesan => {
  sukses(pesan);
  setTimeout(() => { location.hash = '#/dashboard'; location.reload(); }, 450);
};

/* ---------- gerbang PIN untuk kembali menjadi Pemilik ---------- */
function mintaPin(lanjut) {
  modal({
    judul: '🔒 PIN Pemilik',
    isi: `
      <p class="sm muted mb12">Masukkan PIN untuk kembali ke peran <b>Pemilik</b>.</p>
      <div class="field mb0">
        <input class="input num" id="pin" type="password" inputmode="numeric" autocomplete="off"
               maxlength="8" placeholder="••••" style="font-size:22px;letter-spacing:.4em;text-align:center">
      </div>
      <div class="err" id="salah" hidden>PIN salah</div>`,
    tombol: [
      { teks: 'Batal', kelas: 'btn-ghost' },
      {
        teks: 'Masuk', kelas: 'btn-primary', aksi: h => {
          const nilai = h.body.querySelector('#pin').value;
          if (!cocokPin(nilai)) {
            h.body.querySelector('#salah').hidden = false;
            h.body.querySelector('#pin').value = '';
            h.body.querySelector('#pin').classList.add('invalid');
            return;
          }
          h.tutup();
          lanjut();
        },
      },
    ],
    onBuka: body => {
      const inp = body.querySelector('#pin');
      setTimeout(() => inp.focus(), 80);
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.querySelector('#modalRoot .modal-foot .btn:last-child')?.click();
      });
    },
  });
}

/* ---------- pemilih sales / mitra ---------- */
async function pilihSales() {
  const daftar = sortBy(db.sales.filter(s => s.aktif !== false), s => s.nama.toLowerCase());
  if (!daftar.length) return gagal('Belum ada data sales. Tambahkan lebih dulu lewat menu Data Sales.');
  const s = await pilihItem({
    judul: 'Masuk sebagai Sales',
    items: daftar,
    cariPada: x => `${x.nama} ${x.kode}`,
    render: x => `${avatarEl(x.nama, 'i')}
      <div class="ri-main"><div class="ri-title">${esc(x.nama)}</div>
        <div class="ri-sub">${esc(x.kode)} · ${db.mitra.filter(m => m.salesId === x.id).length} mitra binaan</div></div>`,
  });
  if (s) { gantiPeran({ peran: 'sales', salesId: s.id }); mulaiUlang(`Masuk sebagai sales ${s.nama}`); }
}

async function pilihMitra() {
  const daftar = sortBy(db.mitra.filter(m => m.aktif !== false), m => m.nama.toLowerCase());
  if (!daftar.length) return gagal('Belum ada agen/reseller terdaftar.');
  const m = await pilihItem({
    judul: 'Masuk sebagai Agen / Reseller',
    items: daftar,
    cariPada: x => `${x.nama} ${x.kode} ${x.telp || ''}`,
    render: x => {
      const titip = stokKonsinyasi(null, x.id);
      const piutang = totalPiutang(x.id);
      return `${avatarEl(x.nama, x.tipe === 'agen' ? 'i' : 'v')}
        <div class="ri-main"><div class="ri-title">${esc(x.nama)}
          ${badge(x.tipe === 'agen' ? 'Agen' : 'Reseller', x.tipe === 'agen' ? 'info' : 'violet')}</div>
          <div class="ri-sub">${esc(x.kode)}${titip > 0 ? ` · titipan ${num(titip)}` : ''}${piutang > 0 ? ' · ada tagihan' : ''}</div></div>`;
    },
  });
  if (m) { gantiPeran({ peran: 'mitra', mitraId: m.id }); mulaiUlang(`Masuk sebagai ${m.nama}`); }
}

/* ---------- dialog utama ---------- */
export function dialogGantiPeran() {
  // Saat masuk lewat akun server, peran berasal dari akun yang terverifikasi.
  // Membiarkannya diganti manual akan membatalkan seluruh gunanya login.
  if (peranTerkunci()) return dialogAkun();

  const aktif = peranAktif();
  const kartu = (kunci, aksi) => {
    const p = PERAN[kunci];
    const ini = kunci === aktif;
    return `<button class="row-item" data-p="${kunci}" ${ini ? 'style="background:var(--primary-soft)"' : ''}>
      <div class="avatar ${p.warna === 'info' ? 'i' : p.warna === 'violet' ? 'v' : ''}" style="font-size:18px">${p.ikon}</div>
      <div class="ri-main">
        <div class="ri-title">${esc(p.label)} ${ini ? badge('sedang aktif', 'ok') : ''}</div>
        <div class="ri-sub">${esc(p.ket)}</div>
      </div>
      <span class="muted">›</span>
    </button>`;
  };

  modal({
    judul: 'Ganti Peran Perangkat',
    isi: `
      <div class="card mb12"><div class="card-body">
        <div class="kv" style="border:0;padding:0">
          <span class="k">Sedang masuk sebagai</span>
          <span class="v">${PERAN[aktif].ikon} ${esc(namaPengguna())}</span>
        </div>
      </div></div>
      <div class="card"><div class="list">
        ${kartu('owner')}${kartu('sales')}${kartu('mitra')}
      </div></div>
      <div class="hint mt12">ℹ️ Peran membatasi menu dan menyembunyikan angka rahasia usaha
        (harga beli, laba, kas) dari Sales dan Mitra. Data tetap tersimpan di perangkat ini,
        jadi gunakan <b>PIN Pemilik</b> di menu Pengaturan agar peran tidak bisa dikembalikan sembarangan.</div>`,
    onBuka: (body, h) => body.addEventListener('click', e => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      const target = b.dataset.p;
      if (target === aktif) return h.tutup();
      h.tutup();
      if (target === 'owner') {
        const masuk = () => { gantiPeran({ peran: 'owner' }); mulaiUlang('Masuk sebagai Pemilik'); };
        return pinDipasang() ? mintaPin(masuk) : masuk();
      }
      if (target === 'sales') return pilihSales();
      if (target === 'mitra') return pilihMitra();
    }),
  });
}

/* ---------- kartu akun (saat masuk lewat server) ---------- */
async function dialogAkun() {
  const s = await sesiTersimpan();
  const p = PERAN[peranAktif()];
  const sisa = s?.sisaHari;

  modal({
    judul: 'Akun',
    isi: `
      <div class="card mb12"><div class="card-body">
        <div class="kv"><span class="k">Masuk sebagai</span>
          <span class="v">${p.ikon} ${esc(s?.akun?.nama || namaPengguna())}</span></div>
        <div class="kv"><span class="k">Peran</span><span class="v">${esc(p.label)}</span></div>
        ${s?.toko?.nama ? `<div class="kv"><span class="k">Toko</span>
          <span class="v">${esc(s.toko.nama)}</span></div>` : ''}
        ${s?.akun?.phone ? `<div class="kv"><span class="k">Nomor HP</span>
          <span class="v">${esc(s.akun.phone)}</span></div>` : ''}
        ${sisa === null || sisa === undefined ? '' : `<div class="kv"><span class="k">Sesi berakhir</span>
          <span class="v ${sisa < 7 ? 'warn' : ''}">${Math.max(0, Math.floor(sisa))} hari lagi</span></div>`}
      </div></div>
      <div class="hint">🔒 Peran ditentukan oleh akun ini dan tidak bisa diganti dari
        perangkat. Server juga menolak data di luar wewenangnya, jadi pembatasan ini
        berlaku sungguhan — bukan sekadar menyembunyikan menu.</div>`,
    tombol: [
      { teks: 'Tutup', kelas: 'btn-ghost' },
      {
        teks: 'Keluar', kelas: 'btn-danger', aksi: async h => {
          const ya = await konfirmasi({
            judul: 'Keluar dari akun?', ok: 'Ya, keluar', bahaya: true,
            pesan: `Data di perangkat ini <b>tetap utuh</b>. Yang dihapus hanya
                    sesi dan antrean kiriman.<br><br>Anda perlu jaringan untuk masuk kembali.`,
          });
          if (!ya) return;
          h.tutup();
          const { keluar } = await import('./sinkron.js');
          await keluar();
          sukses('Sudah keluar');
          setTimeout(() => location.reload(), 400);
        },
      },
    ],
  });
}
