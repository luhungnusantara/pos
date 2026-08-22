/* pages/produk.js — master data produk rokok */
import { db, add, update, remove, get } from '../core/store.js';
import { stokKonsinyasi, nilaiPersediaan, produkMenipis } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, formModal, konfirmasi, sukses, gagal, ingat, kosongState, statTile, badge, modal,
} from '../core/ui.js';
import { segarkan, pergi } from '../core/router.js';
import { esc, rp, num, toNum, cocok, debounce, sortBy } from '../core/utils.js';

let filter = { q: '', tampil: 'aktif', urut: 'nama' };

const fields = [
  { name: 'kode', label: 'Kode Produk', wajib: true, placeholder: 'SM16', hint: 'Kode unik, mis. SM16' },
  { name: 'nama', label: 'Nama Produk', wajib: true, placeholder: 'Sampoerna A Mild', lebar: 'full' },
  { name: 'merk', label: 'Merk / Pabrikan', placeholder: 'Sampoerna' },
  { name: 'isi', label: 'Isi per Bungkus', placeholder: '16 batang' },
  { name: 'satuan', label: 'Satuan Jual', tipe: 'select', opsi: ['Slop', 'Bungkus', 'Bal', 'Pack', 'Dus'] },
  { name: 'isiPerSatuan', label: 'Bungkus / Satuan', tipe: 'number', min: 1, nilai: 10, hint: '1 slop = 10 bungkus' },
  { name: 'hargaBeli', label: 'Harga Beli', tipe: 'rupiah', wajib: true },
  { name: 'hargaAgen', label: 'Harga Agen', tipe: 'rupiah', wajib: true },
  { name: 'hargaReseller', label: 'Harga Reseller', tipe: 'rupiah', wajib: true },
  { name: 'hargaEcer', label: 'Harga Ecer/Umum', tipe: 'rupiah' },
  { name: 'komisiUnit', label: 'Komisi Sales /unit', tipe: 'rupiah', hint: 'Kosongkan bila mengikuti skema sales' },
  { name: 'minStok', label: 'Stok Minimum', tipe: 'number', min: 0, hint: 'Peringatan bila stok ≤ nilai ini' },
  { name: 'aktif', label: 'Produk aktif dijual', tipe: 'check', nilai: true, lebar: 'full' },
];

function formProduk(data = null) {
  formModal({
    judul: data ? 'Ubah Produk' : 'Produk Baru',
    fields,
    data: data || { aktif: true, satuan: 'Slop', isiPerSatuan: 10, minStok: 10 },
    lebar: 'wide',
    onSimpan: nilai => {
      const kodeDipakai = db.produk.some(p =>
        p.kode.toLowerCase() === nilai.kode.toLowerCase() && p.id !== data?.id);
      if (kodeDipakai) { gagal(`Kode "${nilai.kode}" sudah dipakai produk lain`); return false; }
      if (toNum(nilai.hargaReseller) < toNum(nilai.hargaBeli) || toNum(nilai.hargaAgen) < toNum(nilai.hargaBeli))
        ingat('Perhatian: ada harga jual di bawah harga beli');

      if (data) { update('produk', data.id, nilai); sukses('Produk diperbarui'); }
      else { add('produk', { ...nilai, stok: 0 }); sukses('Produk ditambahkan'); }
      segarkan();
    },
  });
}

function detailProduk(p) {
  const titip = stokKonsinyasi(p.id);
  const marginAgen = toNum(p.hargaAgen) - toNum(p.hargaBeli);
  const marginRes = toNum(p.hargaReseller) - toNum(p.hargaBeli);
  modal({
    judul: p.nama,
    isi: `
      <div class="flex flex-wrap mb12">
        ${badge(p.kode)} ${badge(p.satuan || 'Slop', 'info')}
        ${p.merk ? badge(p.merk) : ''} ${p.aktif === false ? badge('Nonaktif', 'bad') : badge('Aktif', 'ok')}
      </div>
      <div class="grid g2 mb12">
        ${statTile({ label: 'Stok Gudang', nilai: num(p.stok), sub: p.satuan || 'Slop', warna: toNum(p.stok) <= toNum(p.minStok) ? 'bad' : 'ok' })}
        ${statTile({ label: 'Dititipkan', nilai: num(titip), sub: 'di agen/reseller', warna: 'violet' })}
      </div>
      <div class="card"><div class="card-body">
        <div class="kv"><span class="k">Harga Beli</span><span class="v">${rp(p.hargaBeli)}</span></div>
        <div class="kv"><span class="k">Harga Agen</span><span class="v">${rp(p.hargaAgen)} <span class="xs pos">(+${rp(marginAgen)})</span></span></div>
        <div class="kv"><span class="k">Harga Reseller</span><span class="v">${rp(p.hargaReseller)} <span class="xs pos">(+${rp(marginRes)})</span></span></div>
        ${toNum(p.hargaEcer) ? `<div class="kv"><span class="k">Harga Ecer</span><span class="v">${rp(p.hargaEcer)}</span></div>` : ''}
        <div class="kv"><span class="k">Isi per ${p.satuan || 'satuan'}</span><span class="v">${num(p.isiPerSatuan) || '-'} bungkus${p.isi ? ` &middot; ${esc(p.isi)}` : ''}</span></div>
        <div class="kv"><span class="k">Komisi sales /unit</span><span class="v">${toNum(p.komisiUnit) ? rp(p.komisiUnit) : '— ikut skema sales'}</span></div>
        <div class="kv"><span class="k">Stok minimum</span><span class="v">${num(p.minStok)}</span></div>
        <div class="kv"><span class="k">Nilai persediaan</span><span class="v">${rp(toNum(p.stok) * toNum(p.hargaBeli))}</span></div>
      </div></div>`,
    tombol: [
      { teks: '📦 Kartu Stok', kelas: 'btn-ghost', aksi: h => { h.tutup(); pergi(`stok/${p.id}`); } },
      { teks: '✏️ Ubah', kelas: 'btn-primary', aksi: h => { h.tutup(); formProduk(p); } },
    ],
  });
}

async function hapusProduk(p) {
  const dipakai = db.penjualan.some(j => j.items.some(i => i.produkId === p.id)) ||
    db.pembelian.some(b => b.items.some(i => i.produkId === p.id)) ||
    db.konsinyasi.some(k => k.items.some(i => i.produkId === p.id));
  if (dipakai) {
    const ya = await konfirmasi({
      judul: 'Produk sudah dipakai',
      pesan: `<b>${esc(p.nama)}</b> sudah tercatat pada transaksi. Menghapusnya akan membuat riwayat tidak lengkap.<br><br>Sebaiknya <b>nonaktifkan</b> saja produk ini.`,
      ok: 'Nonaktifkan', batal: 'Batal',
    });
    if (ya) { update('produk', p.id, { aktif: false }); sukses('Produk dinonaktifkan'); segarkan(); }
    return;
  }
  const ya = await konfirmasi({
    judul: 'Hapus produk?', bahaya: true, ok: 'Hapus',
    pesan: `Produk <b>${esc(p.nama)}</b> akan dihapus permanen.`,
  });
  if (ya) { remove('produk', p.id); sukses('Produk dihapus'); segarkan(); }
}

export function render(view) {
  setJudul('Data Produk', `${db.produk.length} produk terdaftar`);
  setTopbar([{ teks: 'Produk Baru', ikon: '＋', onClick: () => formProduk() }]);
  setFab({ ikon: '＋', teks: 'Produk baru', onClick: () => formProduk() });

  const menipis = produkMenipis();

  view.innerHTML = `
    <div class="grid g3 mb12">
      ${statTile({ label: 'Total Produk', nilai: num(db.produk.filter(p => p.aktif !== false).length), sub: 'aktif dijual', ikon: '🚬' })}
      ${statTile({ label: 'Nilai Persediaan', nilai: rp(nilaiPersediaan()), sub: 'harga beli × stok', warna: 'info', ikon: '📦' })}
      ${statTile({ label: 'Stok Menipis', nilai: num(menipis.length), sub: menipis.length ? 'perlu restok' : 'aman', warna: menipis.length ? 'bad' : 'ok', ikon: '⚠️' })}
    </div>

    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari nama / kode / merk..." value="${esc(filter.q)}"></div>
      <select class="select" id="urut" style="max-width:170px">
        <option value="nama">Urut: Nama</option>
        <option value="stok">Urut: Stok terendah</option>
        <option value="harga">Urut: Harga tertinggi</option>
      </select>
    </div>
    <div class="chips mb12" id="chipTampil">
      ${[['aktif', 'Aktif'], ['semua', 'Semua'], ['menipis', 'Stok menipis'], ['nonaktif', 'Nonaktif']]
        .map(([v, t]) => `<button class="chip ${filter.tampil === v ? 'active' : ''}" data-v="${v}">${t}</button>`).join('')}
    </div>

    <div class="card"><div class="list" id="daftar"></div></div>`;

  view.querySelector('#urut').value = filter.urut;

  const daftar = view.querySelector('#daftar');
  const gambar = () => {
    let arr = db.produk.filter(p => cocok(`${p.nama} ${p.kode} ${p.merk}`, filter.q));
    if (filter.tampil === 'aktif') arr = arr.filter(p => p.aktif !== false);
    if (filter.tampil === 'nonaktif') arr = arr.filter(p => p.aktif === false);
    if (filter.tampil === 'menipis') arr = arr.filter(p => toNum(p.minStok) > 0 && toNum(p.stok) <= toNum(p.minStok));

    arr = filter.urut === 'stok' ? sortBy(arr, p => toNum(p.stok))
      : filter.urut === 'harga' ? sortBy(arr, p => toNum(p.hargaAgen), true)
        : sortBy(arr, p => p.nama.toLowerCase());

    if (!arr.length) {
      daftar.innerHTML = kosongState('🚬', 'Belum ada produk',
        'Tambahkan produk rokok yang Anda jual beserta harga agen dan reseller.',
        '<button class="btn btn-primary" id="tambahKosong">＋ Tambah Produk</button>');
      daftar.querySelector('#tambahKosong')?.addEventListener('click', () => formProduk());
      return;
    }

    daftar.innerHTML = arr.map(p => {
      const stok = toNum(p.stok);
      const kritis = toNum(p.minStok) > 0 && stok <= toNum(p.minStok);
      const titip = stokKonsinyasi(p.id);
      return `
        <div class="row-item" data-id="${p.id}">
          <div class="avatar ${kritis ? 'w' : ''}">${esc(p.kode.slice(0, 3))}</div>
          <div class="ri-main" data-detail>
            <div class="ri-title">${esc(p.nama)}
              ${p.aktif === false ? badge('Nonaktif', 'bad') : ''}
              ${kritis ? badge('Menipis', 'warn') : ''}
              ${titip > 0 ? badge(`Titip ${num(titip)}`, 'violet') : ''}
            </div>
            <div class="ri-sub">${esc(p.kode)} · ${esc(p.merk || '-')} · Agen ${rp(p.hargaAgen)} / Reseller ${rp(p.hargaReseller)}</div>
          </div>
          <div class="ri-right" data-detail>
            <div class="ri-val ${kritis ? 'neg' : ''}">${num(stok)}</div>
            <div class="ri-note">${esc(p.satuan || 'Slop')}</div>
          </div>
          <button class="icon-btn" data-menu title="Aksi">⋮</button>
        </div>`;
    }).join('');
  };
  gambar();

  view.querySelector('#cari').addEventListener('input', debounce(e => { filter.q = e.target.value; gambar(); }, 180));
  view.querySelector('#urut').addEventListener('change', e => { filter.urut = e.target.value; gambar(); });
  view.querySelector('#chipTampil').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    filter.tampil = c.dataset.v;
    view.querySelectorAll('#chipTampil .chip').forEach(x => x.classList.toggle('active', x === c));
    gambar();
  });

  daftar.addEventListener('click', e => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const p = get('produk', row.dataset.id);
    if (!p) return;
    if (e.target.closest('[data-menu]')) {
      modal({
        judul: p.nama,
        isi: `<div class="list">
          <button class="row-item" data-a="detail"><span class="ico">👁️</span><div class="ri-main"><div class="ri-title">Lihat detail</div></div></button>
          <button class="row-item" data-a="ubah"><span class="ico">✏️</span><div class="ri-main"><div class="ri-title">Ubah produk</div></div></button>
          <button class="row-item" data-a="stok"><span class="ico">📦</span><div class="ri-main"><div class="ri-title">Kartu stok</div></div></button>
          <button class="row-item" data-a="hapus"><span class="ico">🗑️</span><div class="ri-main"><div class="ri-title" style="color:var(--bad)">Hapus produk</div></div></button>
        </div>`,
        onBuka: (body, h) => body.addEventListener('click', ev => {
          const b = ev.target.closest('[data-a]');
          if (!b) return;
          h.tutup();
          ({ detail: () => detailProduk(p), ubah: () => formProduk(p), stok: () => pergi(`stok/${p.id}`), hapus: () => hapusProduk(p) })[b.dataset.a]();
        }),
      });
      return;
    }
    detailProduk(p);
  });
}
