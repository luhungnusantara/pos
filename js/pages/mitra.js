/* pages/mitra.js — master agen & reseller */
import { db, add, update, remove, get } from '../core/store.js';
import { totalPiutang, stokKonsinyasi, rincianKonsinyasi, daftarPiutang, penjualanAktif } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, formModal, konfirmasi, sukses, gagal,
  kosongState, statTile, badge, modal, avatarEl,
} from '../core/ui.js';
import { segarkan, pergi } from '../core/router.js';
import { esc, rp, num, toNum, cocok, sum, debounce, sortBy, fmtTgl } from '../core/utils.js';

let filter = { q: '', tipe: 'semua' };

const fieldsMitra = () => [
  { name: 'kode', label: 'Kode Mitra', wajib: true, placeholder: 'AG-01' },
  { name: 'nama', label: 'Nama Mitra / Toko', wajib: true, placeholder: 'Agen Barokah Jaya', lebar: 'full' },
  {
    name: 'tipe', label: 'Tipe Mitra', tipe: 'select', wajib: true,
    opsi: [{ value: 'agen', label: 'Agen (harga agen)' }, { value: 'reseller', label: 'Reseller (harga reseller)' }],
  },
  { name: 'telp', label: 'No. HP / WhatsApp', tipe: 'tel', placeholder: '08123456789' },
  { name: 'alamat', label: 'Alamat', tipe: 'textarea', lebar: 'full', placeholder: 'Jl. ...' },
  {
    name: 'salesId', label: 'Sales Penanggung Jawab', tipe: 'select',
    opsi: [{ value: '', label: '— Tanpa sales —' }, ...db.sales.filter(s => s.aktif !== false).map(s => ({ value: s.id, label: s.nama }))],
  },
  { name: 'plafon', label: 'Plafon Kredit', tipe: 'rupiah', hint: 'Batas maksimal piutang. 0 = tanpa batas' },
  { name: 'tempoHari', label: 'Tempo (hari)', tipe: 'number', min: 0, nilai: 14 },
  { name: 'aktif', label: 'Mitra aktif', tipe: 'check', nilai: true, lebar: 'full' },
];

function formMitra(data = null) {
  const fields = fieldsMitra();
  formModal({
    judul: data ? 'Ubah Mitra' : 'Mitra Baru',
    fields, lebar: 'wide',
    data: data || { tipe: 'reseller', aktif: true, tempoHari: db.pengaturan.tempoDefault || 14 },
    onSimpan: nilai => {
      if (db.mitra.some(m => m.kode.toLowerCase() === nilai.kode.toLowerCase() && m.id !== data?.id)) {
        gagal(`Kode "${nilai.kode}" sudah dipakai`); return false;
      }
      if (data) { update('mitra', data.id, nilai); sukses('Data mitra diperbarui'); }
      else { add('mitra', nilai); sukses('Mitra ditambahkan'); }
      segarkan();
    },
  });
}

function detailMitra(m) {
  const piutang = totalPiutang(m.id);
  const titipan = rincianKonsinyasi({ mitraId: m.id });
  const trx = penjualanAktif().filter(j => j.mitraId === m.id);
  const omzet = sum(trx, j => j.total);
  const sales = m.salesId ? get('sales', m.salesId) : null;
  const nota = daftarPiutang(m.id);
  const pakaiPlafon = toNum(m.plafon) > 0 ? Math.min(100, piutang / toNum(m.plafon) * 100) : 0;

  modal({
    judul: m.nama, lebar: 'wide',
    isi: `
      <div class="flex flex-wrap mb12">
        ${badge(m.kode)} ${badge(m.tipe === 'agen' ? 'Agen' : 'Reseller', m.tipe === 'agen' ? 'info' : 'violet')}
        ${m.aktif === false ? badge('Nonaktif', 'bad') : ''}
        ${sales ? badge('Sales: ' + sales.nama) : ''}
      </div>
      <div class="grid g2 mb12">
        ${statTile({ label: 'Total Omzet', nilai: rp(omzet), sub: `${trx.length} transaksi`, warna: 'ok' })}
        ${statTile({ label: 'Piutang Berjalan', nilai: rp(piutang), sub: `${nota.length} nota belum lunas`, warna: piutang > 0 ? 'bad' : '' })}
      </div>
      ${toNum(m.plafon) > 0 ? `
        <div class="card mb12"><div class="card-body">
          <div class="flex between"><span class="sm b">Pemakaian Plafon Kredit</span>
            <span class="sm">${rp(piutang)} / ${rp(m.plafon)}</span></div>
          <div class="bar"><i class="${pakaiPlafon > 90 ? 'bad' : pakaiPlafon > 70 ? 'warn' : 'ok'}" style="width:${pakaiPlafon}%"></i></div>
          <div class="hint">${pakaiPlafon >= 100 ? '⛔ Plafon terlampaui' : `Sisa plafon ${rp(Math.max(0, toNum(m.plafon) - piutang))}`}</div>
        </div></div>` : ''}
      <div class="card mb12"><div class="card-body">
        <div class="kv"><span class="k">Kontak</span><span class="v">${esc(m.telp || '-')}</span></div>
        <div class="kv"><span class="k">Alamat</span><span class="v" style="max-width:60%">${esc(m.alamat || '-')}</span></div>
        <div class="kv"><span class="k">Tempo Kredit</span><span class="v">${num(m.tempoHari)} hari</span></div>
        <div class="kv"><span class="k">Barang Dititipkan</span><span class="v">${num(stokKonsinyasi(null, m.id))} unit</span></div>
      </div></div>
      ${titipan.length ? `
        <div class="section-title">Titipan Berjalan</div>
        <div class="card"><div class="table-wrap"><table class="tbl stack">
          <thead><tr><th>Produk</th><th class="num">Titip</th><th class="num">Terjual</th><th class="num">Sisa</th></tr></thead>
          <tbody>${titipan.map(t => `<tr>
            <td data-l="Produk"><span>${esc(get('produk', t.produkId)?.nama || '-')}</span></td>
            <td data-l="Titip" class="num"><span>${num(t.qty)}</span></td>
            <td data-l="Terjual" class="num"><span>${num(t.terjual)}</span></td>
            <td data-l="Sisa" class="num strong"><span>${num(t.sisa)}</span></td>
          </tr>`).join('')}</tbody>
        </table></div></div>` : ''}
      ${nota.length ? `
        <div class="section-title">Nota Belum Lunas</div>
        <div class="card"><div class="table-wrap"><table class="tbl stack">
          <thead><tr><th>No. Nota</th><th>Tanggal</th><th class="num">Total</th><th class="num">Sisa</th></tr></thead>
          <tbody>${nota.map(j => `<tr>
            <td data-l="Nota"><span class="mono">${esc(j.noRef)}</span></td>
            <td data-l="Tanggal"><span>${fmtTgl(j.tanggal)}</span></td>
            <td data-l="Total" class="num"><span>${rp(j.total)}</span></td>
            <td data-l="Sisa" class="num strong"><span class="neg">${rp(toNum(j.total) - toNum(j.dibayar))}</span></td>
          </tr>`).join('')}</tbody>
        </table></div></div>` : ''}`,
    tombol: [
      { teks: '🧾 Jual', kelas: 'btn-ghost', aksi: h => { h.tutup(); pergi(`kasir/${m.id}`); } },
      { teks: '✏️ Ubah', kelas: 'btn-primary', aksi: h => { h.tutup(); formMitra(m); } },
    ],
  });
}

async function hapusMitra(m) {
  const dipakai = db.penjualan.some(j => j.mitraId === m.id) || db.konsinyasi.some(k => k.mitraId === m.id);
  if (dipakai) {
    const ya = await konfirmasi({
      judul: 'Mitra punya riwayat transaksi',
      pesan: `<b>${esc(m.nama)}</b> sudah memiliki transaksi. Sebaiknya dinonaktifkan saja agar riwayat tetap utuh.`,
      ok: 'Nonaktifkan',
    });
    if (ya) { update('mitra', m.id, { aktif: false }); sukses('Mitra dinonaktifkan'); segarkan(); }
    return;
  }
  const ya = await konfirmasi({ judul: 'Hapus mitra?', bahaya: true, ok: 'Hapus', pesan: `<b>${esc(m.nama)}</b> akan dihapus permanen.` });
  if (ya) { remove('mitra', m.id); sukses('Mitra dihapus'); segarkan(); }
}

export function render(view) {
  const agen = db.mitra.filter(m => m.tipe === 'agen');
  const reseller = db.mitra.filter(m => m.tipe === 'reseller');
  setJudul('Agen & Reseller', `${agen.length} agen · ${reseller.length} reseller`);
  setTopbar([{ teks: 'Mitra Baru', ikon: '＋', onClick: () => formMitra() }]);
  setFab({ ikon: '＋', teks: 'Mitra baru', onClick: () => formMitra() });

  view.innerHTML = `
    <div class="grid g3 mb12">
      ${statTile({ label: 'Agen', nilai: num(agen.length), sub: 'harga agen', warna: 'info', ikon: '🏬' })}
      ${statTile({ label: 'Reseller', nilai: num(reseller.length), sub: 'harga reseller', warna: 'violet', ikon: '🏪' })}
      ${statTile({ label: 'Total Piutang', nilai: rp(totalPiutang()), sub: 'seluruh mitra', warna: 'bad', ikon: '📌' })}
    </div>
    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari mitra..." value="${esc(filter.q)}"></div>
    </div>
    <div class="chips mb12" id="chipTipe">
      ${[['semua', 'Semua'], ['agen', 'Agen'], ['reseller', 'Reseller'], ['piutang', 'Punya Piutang'], ['titipan', 'Ada Titipan']]
        .map(([v, t]) => `<button class="chip ${filter.tipe === v ? 'active' : ''}" data-v="${v}">${t}</button>`).join('')}
    </div>
    <div class="card"><div class="list" id="daftar"></div></div>`;

  const daftar = view.querySelector('#daftar');
  const gambar = () => {
    let arr = db.mitra.filter(m => cocok(`${m.nama} ${m.kode} ${m.telp} ${m.alamat}`, filter.q));
    if (filter.tipe === 'agen' || filter.tipe === 'reseller') arr = arr.filter(m => m.tipe === filter.tipe);
    if (filter.tipe === 'piutang') arr = arr.filter(m => totalPiutang(m.id) > 0);
    if (filter.tipe === 'titipan') arr = arr.filter(m => stokKonsinyasi(null, m.id) > 0);
    arr = sortBy(arr, m => m.nama.toLowerCase());

    if (!arr.length) {
      daftar.innerHTML = kosongState('🏪', 'Belum ada mitra',
        'Daftarkan agen dan reseller Anda untuk mulai mencatat penjualan dan konsinyasi.',
        '<button class="btn btn-primary" id="tk">＋ Tambah Mitra</button>');
      daftar.querySelector('#tk')?.addEventListener('click', () => formMitra());
      return;
    }

    daftar.innerHTML = arr.map(m => {
      const piutang = totalPiutang(m.id);
      const titip = stokKonsinyasi(null, m.id);
      return `<div class="row-item" data-id="${m.id}">
        ${avatarEl(m.nama, m.tipe === 'agen' ? 'i' : 'v')}
        <div class="ri-main">
          <div class="ri-title">${esc(m.nama)}
            ${badge(m.tipe === 'agen' ? 'Agen' : 'Reseller', m.tipe === 'agen' ? 'info' : 'violet')}
            ${m.aktif === false ? badge('Nonaktif', 'bad') : ''}
            ${titip > 0 ? badge(`Titip ${num(titip)}`, 'warn') : ''}
          </div>
          <div class="ri-sub">${esc(m.kode)}${m.telp ? ' · ' + esc(m.telp) : ''}${m.alamat ? ' · ' + esc(m.alamat) : ''}</div>
        </div>
        <div class="ri-right">
          <div class="ri-val ${piutang > 0 ? 'neg' : 'muted'}">${piutang > 0 ? rp(piutang) : '—'}</div>
          <div class="ri-note">piutang</div>
        </div>
        <button class="icon-btn" data-menu>⋮</button>
      </div>`;
    }).join('');
  };
  gambar();

  view.querySelector('#cari').addEventListener('input', debounce(e => { filter.q = e.target.value; gambar(); }, 180));
  view.querySelector('#chipTipe').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    filter.tipe = c.dataset.v;
    view.querySelectorAll('#chipTipe .chip').forEach(x => x.classList.toggle('active', x === c));
    gambar();
  });

  daftar.addEventListener('click', e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const m = get('mitra', row.dataset.id); if (!m) return;
    if (e.target.closest('[data-menu]')) {
      modal({
        judul: m.nama,
        isi: `<div class="list">
          <button class="row-item" data-a="detail"><span class="ico">👁️</span><div class="ri-main"><div class="ri-title">Detail & riwayat</div></div></button>
          <button class="row-item" data-a="jual"><span class="ico">🧾</span><div class="ri-main"><div class="ri-title">Buat penjualan</div></div></button>
          <button class="row-item" data-a="titip"><span class="ico">🤝</span><div class="ri-main"><div class="ri-title">Titip barang (konsinyasi)</div></div></button>
          <button class="row-item" data-a="ubah"><span class="ico">✏️</span><div class="ri-main"><div class="ri-title">Ubah data</div></div></button>
          ${m.telp ? `<a class="row-item" href="https://wa.me/62${esc(String(m.telp).replace(/^0|\D/g, ''))}" target="_blank" rel="noopener"><span class="ico">💬</span><div class="ri-main"><div class="ri-title">Hubungi via WhatsApp</div></div></a>` : ''}
          <button class="row-item" data-a="hapus"><span class="ico">🗑️</span><div class="ri-main"><div class="ri-title" style="color:var(--bad)">Hapus mitra</div></div></button>
        </div>`,
        onBuka: (body, h) => body.addEventListener('click', ev => {
          const b = ev.target.closest('[data-a]'); if (!b) return;
          h.tutup();
          ({
            detail: () => detailMitra(m), ubah: () => formMitra(m), hapus: () => hapusMitra(m),
            jual: () => pergi(`kasir/${m.id}`), titip: () => pergi(`konsinyasi/baru/${m.id}`),
          })[b.dataset.a]();
        }),
      });
      return;
    }
    detailMitra(m);
  });
}
