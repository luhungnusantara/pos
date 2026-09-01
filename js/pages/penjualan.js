/* pages/penjualan.js — riwayat & detail penjualan */
import { db, get } from '../core/store.js';
import { sisaPiutang, statusBayar, batalkanPenjualan } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, modal, konfirmasi, sukses, gagal, kosongState, statTile, badge,
} from '../core/ui.js';
import { tampilkanStruk, bagikanStruk } from '../core/struk.js';
import { modalBayarPiutang } from '../core/bayar.js';
import { htmlPeriode, pasangPeriode, hitungPeriode } from '../core/periode.js';
import { segarkan, pergi } from '../core/router.js';
import { isOwner, bolehLihatModal, bolehTransaksi, filterPenjualan } from '../core/peran.js';
import { kunciTertunda, onSinkron } from '../core/sinkron.js';
import {
  esc, rp, num, toNum, cocok, sum, debounce, fmtTgl, fmtTglPendek, sortBy, unduh, toCSV, todayISO,
} from '../core/utils.js';

let f = { kode: '30hari', dari: todayISO(), sampai: todayISO(), q: '', jenis: 'semua', status: 'semua' };

function daftar() {
  const { dari, sampai } = hitungPeriode(f.kode, f);
  let arr = filterPenjualan(db.penjualan).filter(j =>
    (!dari || j.tanggal >= dari) && (!sampai || j.tanggal <= sampai));

  if (f.status !== 'batal') arr = arr.filter(j => j.status !== 'batal');
  if (f.jenis !== 'semua') arr = arr.filter(j => (j.jenis || 'putus') === f.jenis);
  if (f.status === 'lunas') arr = arr.filter(j => sisaPiutang(j) <= 0);
  if (f.status === 'piutang') arr = arr.filter(j => sisaPiutang(j) > 0);
  if (f.status === 'batal') arr = arr.filter(j => j.status === 'batal');
  if (f.q) arr = arr.filter(j => cocok(`${j.noRef} ${j.mitraNama} ${j.catatan}`, f.q));

  return sortBy(arr, j => `${j.tanggal}${j.dibuat}`, true);
}

function detail(j) {
  const sales = j.salesId ? get('sales', j.salesId) : null;
  const kom = db.komisi.find(k => k.penjualanId === j.id);
  const sisa = sisaPiutang(j);
  const st = statusBayar(j);
  const dibatalkan = j.status === 'batal';

  const h = modal({
    judul: j.noRef, lebar: 'wide',
    isi: `
      <div class="flex flex-wrap mb12">
        ${badge(fmtTgl(j.tanggal))}
        ${badge(j.jenis === 'konsinyasi' ? 'Konsinyasi' : 'Putus', j.jenis === 'konsinyasi' ? 'violet' : 'info')}
        ${dibatalkan ? badge('DIBATALKAN', 'bad')
          : badge(st === 'lunas' ? 'Lunas' : st === 'sebagian' ? 'Bayar Sebagian' : 'Belum Bayar',
                  st === 'lunas' ? 'ok' : st === 'sebagian' ? 'warn' : 'bad')}
        ${sales ? badge('Sales: ' + sales.nama) : ''}
      </div>
      <div class="card mb12"><div class="card-body">
        <div class="kv"><span class="k">Pelanggan</span><span class="v">${esc(j.mitraNama)}</span></div>
        <div class="kv"><span class="k">Tipe</span><span class="v">${j.tipeMitra === 'agen' ? 'Agen' : j.tipeMitra === 'reseller' ? 'Reseller' : 'Umum'}</span></div>
        ${j.jatuhTempo ? `<div class="kv"><span class="k">Jatuh tempo</span><span class="v">${fmtTgl(j.jatuhTempo)}</span></div>` : ''}
        ${j.catatan ? `<div class="kv"><span class="k">Catatan</span><span class="v">${esc(j.catatan)}</span></div>` : ''}
      </div></div>

      <div class="card mb12"><div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Produk</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Jumlah</th></tr></thead>
        <tbody>${j.items.map(i => {
          const p = get('produk', i.produkId);
          return `<tr>
            <td data-l="Produk"><span>${esc(p?.nama || '-')}</span></td>
            <td data-l="Qty" class="num"><span>${num(i.qty)} ${esc(p?.satuan || '')}</span></td>
            <td data-l="Harga" class="num"><span>${rp(i.harga)}</span></td>
            <td data-l="Jumlah" class="num strong"><span>${rp(toNum(i.qty) * toNum(i.harga))}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="card-body">
        <div class="kv"><span class="k">Subtotal</span><span class="v">${rp(j.subtotal)}</span></div>
        ${toNum(j.diskon) ? `<div class="kv"><span class="k">Diskon</span><span class="v neg">-${rp(j.diskon)}</span></div>` : ''}
        <div class="kv total"><span class="k">Total</span><span class="v">${rp(j.total)}</span></div>
        <div class="kv"><span class="k">Dibayar (${esc(j.metode || 'tunai')})</span><span class="v pos">${rp(j.dibayar)}</span></div>
        ${sisa > 0 ? `<div class="kv"><span class="k">Sisa piutang</span><span class="v neg">${rp(sisa)}</span></div>` : ''}
        ${bolehLihatModal() ? `
        <div class="divider"></div>
        <div class="kv"><span class="k">HPP</span><span class="v">${rp(j.hpp)}</span></div>
        <div class="kv"><span class="k">Laba kotor</span><span class="v pos">${rp(j.laba)}</span></div>` : ''}
        ${kom && (isOwner() || kom.salesId === j.salesId) ? `<div class="kv"><span class="k">Komisi ${esc(sales?.nama || '')}</span>
          <span class="v">${rp(kom.nilai)} ${badge(kom.status === 'dibayar' ? 'dibayar' : 'pending', kom.status === 'dibayar' ? 'ok' : 'warn')}</span></div>` : ''}
      </div></div>

      ${db.pembayaran.filter(p => p.refId === j.id).length ? `
        <div class="section-title">Riwayat Pembayaran</div>
        <div class="card"><div class="list">
          ${db.pembayaran.filter(p => p.refId === j.id).map(p => `
            <div class="row-item"><div class="ri-main">
              <div class="ri-title">${rp(p.jumlah)}</div>
              <div class="ri-sub">${fmtTgl(p.tanggal)} · ${esc(p.metode)}${p.catatan ? ' · ' + esc(p.catatan) : ''}</div>
            </div></div>`).join('')}
        </div></div>` : ''}`,
    tombol: dibatalkan ? [{ teks: 'Tutup', kelas: 'btn-ghost' }] : [
      { teks: '🧾 Nota', kelas: 'btn-ghost', aksi: () => tampilkanStruk(j) },
      ...(sisa > 0 && bolehTransaksi() ? [{ teks: '💵 Terima Bayar', kelas: 'btn-primary', aksi: x => { x.tutup(); modalBayarPiutang(j, segarkan); } }] : []),
      { teks: '⋯', kelas: 'btn-ghost', aksi: () => menuLain(j, h) },
    ],
  });
}

function menuLain(j, indukModal) {
  modal({
    judul: 'Aksi Lain',
    isi: `<div class="list">
      <button class="row-item" data-a="bagikan"><span class="ico">📤</span><div class="ri-main"><div class="ri-title">Bagikan / salin nota</div></div></button>
      <button class="row-item" data-a="cetak"><span class="ico">🖨️</span><div class="ri-main"><div class="ri-title">Cetak nota</div></div></button>
      ${j.konsinyasiId ? `<button class="row-item" data-a="kons"><span class="ico">🤝</span><div class="ri-main"><div class="ri-title">Lihat konsinyasi asal</div></div></button>` : ''}
      ${isOwner() ? `<button class="row-item" data-a="batal"><span class="ico">⛔</span><div class="ri-main">
        <div class="ri-title" style="color:var(--bad)">Batalkan transaksi</div>
        <div class="ri-sub">Stok, kas, dan komisi dikembalikan</div></div></button>` : ''}
    </div>`,
    onBuka: (body, h) => body.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-a]'); if (!b) return;
      h.tutup();
      if (b.dataset.a === 'bagikan') return bagikanStruk(j);
      if (b.dataset.a === 'cetak') return tampilkanStruk(j);
      if (b.dataset.a === 'kons') { indukModal?.tutup(); return pergi(`konsinyasi/detail/${j.konsinyasiId}`); }
      if (b.dataset.a === 'batal') {
        const ya = await konfirmasi({
          judul: 'Batalkan transaksi?', bahaya: true, ok: 'Ya, batalkan',
          pesan: `Nota <b>${esc(j.noRef)}</b> senilai <b>${rp(j.total)}</b> akan dibatalkan.<br><br>
                  Stok dikembalikan, kas masuk dihapus, dan komisi yang belum dibayar dibatalkan.`,
        });
        if (ya) {
          batalkanPenjualan(j.id);
          indukModal?.tutup();
          sukses('Transaksi dibatalkan');
          segarkan();
        }
      }
    }),
  });
}

export function render(view) {
  const { dari, sampai, label } = hitungPeriode(f.kode, f);
  const arr = daftar();
  const aktif = arr.filter(j => j.status !== 'batal');

  setJudul('Riwayat Penjualan', `${label} · ${aktif.length} transaksi`);
  setTopbar([
    { teks: 'Ekspor', ikon: '⬇️', kelas: 'btn-ghost btn-sm', onClick: () => eksporCSV(arr) },
    ...(bolehTransaksi() ? [{ teks: 'Jual', ikon: '＋', onClick: () => pergi('kasir') }] : []),
  ]);
  setFab(bolehTransaksi() ? { ikon: '＋', teks: 'Penjualan baru', onClick: () => pergi('kasir') } : null);

  const omzet = sum(aktif, j => j.total);
  const laba = sum(aktif, j => j.laba);
  const piutang = sum(aktif, sisaPiutang);

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: 'Omzet', nilai: rp(omzet), sub: label, warna: 'ok', ikon: '💰' })}
      ${bolehLihatModal()
        ? statTile({ label: 'Laba Kotor', nilai: rp(laba), sub: omzet ? `margin ${num(laba / omzet * 100, 1)}%` : '—', warna: 'info', ikon: '📈' })
        : statTile({ label: 'Unit Terjual', nilai: num(sum(aktif, j => sum(j.items, i => i.qty))), sub: label, warna: 'info', ikon: '📦' })}
      ${statTile({ label: 'Transaksi', nilai: num(aktif.length), sub: `${num(sum(aktif, j => sum(j.items, i => i.qty)))} unit`, ikon: '🧾' })}
      ${statTile({ label: 'Piutang', nilai: rp(piutang), sub: 'belum tertagih', warna: piutang > 0 ? 'bad' : '', ikon: '📌' })}
    </div>

    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari no. nota / pelanggan..." value="${esc(f.q)}"></div>
      ${htmlPeriode(f.kode, f)}
    </div>
    <div class="chips mb12" id="chipJenis">
      ${[['semua', 'Semua'], ['putus', 'Putus'], ['konsinyasi', 'Konsinyasi']]
        .map(([v, t]) => `<button class="chip ${f.jenis === v ? 'active' : ''}" data-j="${v}">${t}</button>`).join('')}
      <span style="width:6px"></span>
      ${[['semua', 'Semua status'], ['lunas', 'Lunas'], ['piutang', 'Piutang'], ['batal', 'Dibatalkan']]
        .map(([v, t]) => `<button class="chip ${f.status === v ? 'active' : ''}" data-s="${v}">${t}</button>`).join('')}
    </div>

    <div class="card"><div class="list" id="daftar"></div></div>`;

  const box = view.querySelector('#daftar');

  /* Penanda apakah tiap nota sudah tersetor ke server (BRIEF poin 4).
     Sengaja tidak memakai warna merah untuk yang masih mengantre: catatannya
     sudah aman di perangkat, hanya belum sampai ke pusat. */
  async function tandaiSetoran(kotak) {
    const menunggu = await kunciTertunda();
    kotak.querySelectorAll('[data-setor]').forEach(el => {
      const antre = menunggu.has(`penjualan/${el.dataset.setor}`);
      el.textContent = antre ? ' · ⏳ belum tersetor' : ' · ✅ tersetor';
      el.className = `tanda-setor ${antre ? 'antre' : 'sudah'}`;
      el.title = antre
        ? 'Sudah tersimpan di perangkat, menunggu dikirim ke server.'
        : 'Sudah tersimpan di server pusat.';
    });
  }
  onSinkron(() => { if (view.isConnected) tandaiSetoran(box); });

  const gambar = () => {
    const list = daftar();
    if (!list.length) {
      box.innerHTML = kosongState('🧾', 'Belum ada penjualan', `Tidak ada transaksi pada ${label}.`,
        bolehTransaksi() ? '<a class="btn btn-primary" href="#/kasir">＋ Buat Penjualan</a>' : '');
      return;
    }
    box.innerHTML = list.map(j => {
      const sisa = sisaPiutang(j);
      const st = j.status === 'batal' ? 'batal' : statusBayar(j);
      return `<div class="row-item" data-id="${j.id}">
        <div class="avatar ${j.jenis === 'konsinyasi' ? 'v' : st === 'lunas' ? '' : 'w'}">${j.jenis === 'konsinyasi' ? '🤝' : '🧾'}</div>
        <div class="ri-main">
          <div class="ri-title">${esc(j.mitraNama)}
            ${st === 'batal' ? badge('Batal', 'bad') : st === 'lunas' ? badge('Lunas', 'ok') : badge(st === 'sebagian' ? 'Sebagian' : 'Piutang', 'warn')}
            ${j.jenis === 'konsinyasi' ? badge('Konsinyasi', 'violet') : ''}
          </div>
          <div class="ri-sub">${esc(j.noRef)} · ${fmtTglPendek(j.tanggal)} · ${j.items.length} item · ${num(sum(j.items, i => i.qty))} unit${
            `<span class="tanda-setor" data-setor="${j.id}"></span>`}</div>
        </div>
        <div class="ri-right">
          <div class="ri-val ${st === 'batal' ? 'muted' : ''}" ${st === 'batal' ? 'style="text-decoration:line-through"' : ''}>${rp(j.total)}</div>
          <div class="ri-note ${sisa > 0 && st !== 'batal' ? 'neg' : ''}">${st === 'batal' ? 'dibatalkan' : sisa > 0 ? `sisa ${rp(sisa)}` : 'lunas'}</div>
        </div>
      </div>`;
    }).join('');
    tandaiSetoran(box);
  };
  gambar();

  view.querySelector('#cari').addEventListener('input', debounce(e => { f.q = e.target.value; gambar(); }, 180));
  pasangPeriode(view, f, () => segarkan());
  view.querySelector('#chipJenis').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (c.dataset.j) f.jenis = c.dataset.j;
    if (c.dataset.s) f.status = c.dataset.s;
    segarkan();
  });
  box.addEventListener('click', e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const j = get('penjualan', row.dataset.id);
    if (j) detail(j);
  });
}

function eksporCSV(arr) {
  if (!arr.length) return gagal('Tidak ada data untuk diekspor');
  const baris = arr.flatMap(j => j.items.map(i => {
    const p = get('produk', i.produkId);
    return {
      Tanggal: j.tanggal, NoNota: j.noRef, Jenis: j.jenis || 'putus',
      Pelanggan: j.mitraNama, TipeMitra: j.tipeMitra,
      Sales: get('sales', j.salesId)?.nama || '',
      Produk: p?.nama || '', Kode: p?.kode || '',
      Qty: i.qty, Harga: i.harga, Jumlah: toNum(i.qty) * toNum(i.harga),
      ...(bolehLihatModal()
        ? { HargaBeli: i.hargaBeli, LabaItem: (toNum(i.harga) - toNum(i.hargaBeli)) * toNum(i.qty) }
        : {}),
      TotalNota: j.total, Dibayar: j.dibayar, Sisa: sisaPiutang(j), Status: j.status,
    };
  }));
  unduh(`penjualan-${todayISO()}.csv`, toCSV(baris), 'text/csv');
  sukses('Data penjualan diekspor');
}
