/* pages/kasir.js — layar penjualan (POS) */
import { db, get } from '../core/store.js';
import { hargaUntuk, simpanPenjualan, totalPiutang, stokGudang } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, modal, konfirmasi, sukses, gagal, ingat,
  kosongState, badge, pasangRupiah, pilihItem, avatarEl,
} from '../core/ui.js';
import { tampilkanStruk } from '../core/struk.js';
import { pergi, segarkan } from '../core/router.js';
import {
  esc, rp, num, toNum, cocok, sum, debounce, todayISO, tambahHari, sortBy, round2,
} from '../core/utils.js';

let trx = null;
let el = null;

const baru = () => ({
  tanggal: todayISO(),
  mitraId: '',
  salesId: '',
  items: [],
  diskon: 0,
  bayar: 'tunai',
  metode: 'tunai',
  dibayar: 0,
  jatuhTempo: '',
  catatan: '',
});

const mitraAktif = () => (trx.mitraId ? get('mitra', trx.mitraId) : null);
const subtotal = () => round2(sum(trx.items, i => toNum(i.qty) * toNum(i.harga)));
const total = () => round2(Math.max(0, subtotal() - toNum(trx.diskon)));
const labaEstimasi = () => round2(total() - sum(trx.items, i => toNum(i.qty) * toNum(get('produk', i.produkId)?.hargaBeli)));

/* ---------- pemilih mitra ---------- */
async function pilihMitra() {
  const items = [
    { id: '', nama: 'Pelanggan Umum', tipe: 'umum', kode: '—' },
    ...sortBy(db.mitra.filter(m => m.aktif !== false), m => m.nama.toLowerCase()),
  ];
  const m = await pilihItem({
    judul: 'Pilih Pelanggan',
    items,
    cariPada: x => `${x.nama} ${x.kode} ${x.telp || ''}`,
    render: x => {
      const piutang = x.id ? totalPiutang(x.id) : 0;
      return `${avatarEl(x.nama, x.tipe === 'agen' ? 'i' : x.tipe === 'reseller' ? 'v' : '')}
        <div class="ri-main"><div class="ri-title">${esc(x.nama)}
          ${x.tipe !== 'umum' ? badge(x.tipe === 'agen' ? 'Agen' : 'Reseller', x.tipe === 'agen' ? 'info' : 'violet') : ''}</div>
          <div class="ri-sub">${esc(x.kode)}${x.telp ? ' · ' + esc(x.telp) : ''}</div></div>
        ${piutang > 0 ? `<div class="ri-right"><div class="ri-val neg">${rp(piutang)}</div><div class="ri-note">piutang</div></div>` : ''}`;
    },
    aksiTambah: { teks: 'Daftarkan mitra baru', aksi: () => pergi('mitra') },
  });
  if (!m) return;
  trx.mitraId = m.id;
  trx.salesId = m.salesId || trx.salesId;
  if (m.tempoHari) trx.jatuhTempo = tambahHari(trx.tanggal, toNum(m.tempoHari));
  // sesuaikan harga item ke tipe mitra baru
  trx.items.forEach(i => { i.harga = hargaUntuk(get('produk', i.produkId), m); });
  gambar();
}

/* ---------- pemilih produk (bisa tambah banyak sekaligus) ---------- */
function modalProduk() {
  const mitra = mitraAktif();
  const h = modal({
    judul: 'Tambah Produk',
    isi: `
      <div class="toolbar" style="margin-bottom:10px">
        <div class="search-wrap grow"><input class="input" id="cariP" placeholder="Cari nama / kode produk..." autocomplete="off"></div>
      </div>
      <div class="hint mb8">Harga mengikuti tipe pelanggan: <b>${mitra ? (mitra.tipe === 'agen' ? 'Agen' : 'Reseller') : 'Umum/Ecer'}</b></div>
      <div class="card"><div class="list" id="listP"></div></div>`,
    tombol: [{ teks: 'Selesai', kelas: 'btn-primary', aksi: x => x.tutup() }],
    onTutup: () => gambar(),
  });

  const listP = h.body.querySelector('#listP');
  const gambarList = (q = '') => {
    const arr = sortBy(db.produk.filter(p => p.aktif !== false && cocok(`${p.nama} ${p.kode} ${p.merk}`, q)),
      p => p.nama.toLowerCase());
    if (!arr.length) {
      listP.innerHTML = kosongState('🔍', 'Produk tidak ditemukan');
      return;
    }
    listP.innerHTML = arr.map(p => {
      const di = trx.items.find(i => i.produkId === p.id);
      const stok = stokGudang(p.id);
      const harga = hargaUntuk(p, mitra);
      return `<div class="row-item" data-p="${p.id}">
        <div class="avatar ${stok <= 0 ? 'w' : ''}">${esc(p.kode.slice(0, 3))}</div>
        <div class="ri-main">
          <div class="ri-title">${esc(p.nama)} ${stok <= 0 ? badge('Stok habis', 'bad') : ''}</div>
          <div class="ri-sub">${rp(harga)} / ${esc(p.satuan || 'Slop')} · stok ${num(stok)}</div>
        </div>
        <div class="ri-right">
          ${di
            ? `<div class="stepper" style="width:126px"><button type="button" data-d="-1">−</button>
                 <input type="number" inputmode="decimal" value="${num(di.qty)}" data-q="${p.id}">
                 <button type="button" data-d="1">+</button></div>`
            : `<button class="btn btn-soft btn-sm" data-add="${p.id}">＋ Tambah</button>`}
        </div>
      </div>`;
    }).join('');
  };
  gambarList();

  h.body.querySelector('#cariP').addEventListener('input', debounce(e => gambarList(e.target.value), 150));

  const ubahQty = (produkId, qty) => {
    const idx = trx.items.findIndex(i => i.produkId === produkId);
    if (qty <= 0) { if (idx >= 0) trx.items.splice(idx, 1); }
    else if (idx >= 0) trx.items[idx].qty = qty;
    gambarList(h.body.querySelector('#cariP').value);
  };

  listP.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const p = get('produk', add.dataset.add);
      trx.items.push({ produkId: p.id, qty: 1, harga: hargaUntuk(p, mitraAktif()) });
      gambarList(h.body.querySelector('#cariP').value);
      return;
    }
    const btn = e.target.closest('.stepper button');
    if (btn) {
      const inp = btn.parentElement.querySelector('[data-q]');
      ubahQty(inp.dataset.q, Math.max(0, toNum(inp.value) + toNum(btn.dataset.d)));
    }
  });
  listP.addEventListener('change', e => {
    const inp = e.target.closest('[data-q]');
    if (inp) ubahQty(inp.dataset.q, Math.max(0, toNum(inp.value)));
  });
}

/* ---------- ubah harga / qty satu baris ---------- */
function ubahBaris(idx) {
  const it = trx.items[idx];
  const p = get('produk', it.produkId);
  modal({
    judul: p?.nama || 'Item',
    isi: `
      <div class="form-row">
        <div class="field"><label>Jumlah (${esc(p?.satuan || 'unit')})</label>
          <input class="input num" id="q" type="number" inputmode="decimal" min="0" step="any" value="${it.qty}"></div>
        <div class="field"><label>Harga Satuan</label>
          <input class="input num" id="hrg" inputmode="numeric" data-rupiah value="${num(it.harga)}"></div>
      </div>
      <div class="card"><div class="card-body">
        <div class="kv"><span class="k">Harga beli</span><span class="v">${rp(p?.hargaBeli)}</span></div>
        <div class="kv"><span class="k">Harga agen</span><span class="v">${rp(p?.hargaAgen)}</span></div>
        <div class="kv"><span class="k">Harga reseller</span><span class="v">${rp(p?.hargaReseller)}</span></div>
        <div class="kv"><span class="k">Stok gudang</span><span class="v">${num(stokGudang(it.produkId))}</span></div>
      </div></div>`,
    tombol: [
      { teks: '🗑️ Hapus', kelas: 'btn-danger', aksi: h => { trx.items.splice(idx, 1); h.tutup(); gambar(); } },
      {
        teks: 'Simpan', kelas: 'btn-primary', aksi: h => {
          const q = toNum(h.body.querySelector('#q').value);
          const hr = toNum(h.body.querySelector('#hrg').value);
          if (q <= 0) { trx.items.splice(idx, 1); } else { it.qty = q; it.harga = hr; }
          h.tutup(); gambar();
        },
      },
    ],
    onBuka: body => pasangRupiah(body),
  });
}

/* ---------- simpan ---------- */
async function simpan() {
  if (!trx.items.length) return ingat('Belum ada item yang ditambahkan');

  const kurang = trx.items
    .map(i => ({ p: get('produk', i.produkId), qty: toNum(i.qty), stok: stokGudang(i.produkId) }))
    .filter(x => x.qty > x.stok);
  if (kurang.length) {
    const ya = await konfirmasi({
      judul: '⚠️ Stok tidak mencukupi',
      pesan: kurang.map(x => `<b>${esc(x.p.nama)}</b>: diminta ${num(x.qty)}, stok ${num(x.stok)}`).join('<br>') +
        '<br><br>Lanjutkan tetap? Stok akan menjadi minus dan perlu diperbaiki lewat stok opname.',
      ok: 'Tetap simpan', bahaya: true,
    });
    if (!ya) return;
  }

  const t = total();
  const mitra = mitraAktif();
  const dibayar = trx.bayar === 'tunai' ? t : Math.min(toNum(trx.dibayar), t);
  const sisa = round2(t - dibayar);

  if (sisa > 0 && !trx.mitraId)
    return gagal('Penjualan kredit harus memilih mitra (agen/reseller) terlebih dahulu');

  if (sisa > 0 && mitra && toNum(mitra.plafon) > 0) {
    const setelah = totalPiutang(mitra.id) + sisa;
    if (setelah > toNum(mitra.plafon)) {
      const ya = await konfirmasi({
        judul: '⚠️ Plafon kredit terlampaui',
        pesan: `Piutang <b>${esc(mitra.nama)}</b> akan menjadi ${rp(setelah)} dari plafon ${rp(mitra.plafon)}.`,
        ok: 'Tetap simpan', bahaya: true,
      });
      if (!ya) return;
    }
  }

  const jual = simpanPenjualan({
    ...trx,
    jenis: 'putus',
    dibayar,
    jatuhTempo: sisa > 0 ? (trx.jatuhTempo || tambahHari(trx.tanggal, toNum(mitra?.tempoHari) || toNum(db.pengaturan.tempoDefault) || 14)) : '',
  });

  trx = baru();
  sukses(`Penjualan ${jual.noRef} tersimpan`);
  tampilkanStruk(jual, { onTutup: () => segarkan() });
}

/* ---------- render ---------- */
function gambar() {
  const mitra = mitraAktif();
  const sub = subtotal();
  const t = total();
  const sisa = round2(t - (trx.bayar === 'tunai' ? t : Math.min(toNum(trx.dibayar), t)));
  const kembali = trx.bayar === 'tunai' ? round2(toNum(trx.dibayar) - t) : 0;

  el.innerHTML = `
  <div class="trx-layout">
    <div class="kolom-kiri">

      <div class="card">
        <div class="card-head"><h2>🧑 Pelanggan</h2>
          <span class="badge ${mitra ? (mitra.tipe === 'agen' ? 'info' : 'violet') : ''}">
            Harga ${mitra ? (mitra.tipe === 'agen' ? 'Agen' : 'Reseller') : 'Umum'}</span>
        </div>
        <div class="card-body">
          <button class="btn btn-block" id="btnMitra" style="justify-content:flex-start;height:auto;padding:10px 12px;min-height:56px">
            ${avatarEl(mitra?.nama || 'Umum', mitra?.tipe === 'agen' ? 'i' : mitra?.tipe === 'reseller' ? 'v' : '')}
            <span class="grow" style="text-align:left">
              <span style="display:block;font-weight:700">${esc(mitra?.nama || 'Pelanggan Umum')}</span>
              <span class="xs muted">${mitra ? esc(mitra.kode) + (totalPiutang(mitra.id) > 0 ? ` · piutang ${rp(totalPiutang(mitra.id))}` : '') : 'Ketuk untuk memilih agen / reseller'}</span>
            </span>
            <span class="muted">▾</span>
          </button>
          <div class="form-row mt12">
            <div class="field mb0"><label>Sales</label>
              <select class="select" id="selSales">
                <option value="">— Tanpa sales —</option>
                ${db.sales.filter(s => s.aktif !== false).map(s =>
                  `<option value="${s.id}" ${s.id === trx.salesId ? 'selected' : ''}>${esc(s.nama)}</option>`).join('')}
              </select>
            </div>
            <div class="field mb0"><label>Tanggal</label>
              <input class="input" type="date" id="inpTgl" value="${trx.tanggal}"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>🛒 Item Penjualan</h2>
          <span class="muted xs">${trx.items.length} item · ${num(sum(trx.items, i => i.qty))} unit</span>
        </div>
        <div class="card-body" id="isiKeranjang">
          ${trx.items.length ? trx.items.map((i, idx) => {
            const p = get('produk', i.produkId);
            const stok = stokGudang(i.produkId);
            const kurang = toNum(i.qty) > stok;
            return `<div class="cart-line">
              <div class="cl-main">
                <div class="cl-name">${esc(p?.nama || '-')} ${kurang ? badge('stok ' + num(stok), 'bad') : ''}</div>
                <div class="cl-meta">${rp(i.harga)} / ${esc(p?.satuan || 'unit')}</div>
                <div class="mt8"><div class="stepper" style="width:132px" data-idx="${idx}">
                  <button type="button" data-d="-1">−</button>
                  <input type="number" inputmode="decimal" value="${num(i.qty)}" data-qty="${idx}">
                  <button type="button" data-d="1">+</button>
                </div></div>
              </div>
              <div class="cl-right">
                <div class="b tabular">${rp(toNum(i.qty) * toNum(i.harga))}</div>
                <button class="btn btn-xs btn-ghost mt8" data-edit="${idx}">✏️ ubah</button>
              </div>
            </div>`;
          }).join('') : kosongState('🛒', 'Keranjang kosong', 'Ketuk tombol di bawah untuk menambahkan produk.')}
        </div>
        <div class="card-foot">
          <button class="btn btn-soft btn-block" id="btnTambahProduk">＋ Tambah Produk</button>
        </div>
      </div>
    </div>

    <div class="kolom-kanan">
      <div class="card">
        <div class="card-head"><h2>💳 Pembayaran</h2></div>
        <div class="card-body">
          <div class="kv"><span class="k">Subtotal</span><span class="v">${rp(sub)}</span></div>
          <div class="field mt8"><label>Diskon Nota</label>
            <input class="input num" id="inpDiskon" inputmode="numeric" data-rupiah value="${trx.diskon ? num(trx.diskon) : ''}" placeholder="0"></div>
          <div class="kv total"><span class="k">TOTAL</span><span class="v">${rp(t)}</span></div>

          <div class="lbl-t mt12">Metode Bayar</div>
          <div class="seg" id="segBayar">
            <button type="button" data-v="tunai" class="${trx.bayar === 'tunai' ? 'active' : ''}">💵 Lunas</button>
            <button type="button" data-v="kredit" class="${trx.bayar === 'kredit' ? 'active' : ''}">📌 Kredit / Tempo</button>
          </div>

          <div class="form-row mt12">
            <div class="field mb0"><label>Cara Bayar</label>
              <select class="select" id="selMetode">
                <option value="tunai" ${trx.metode === 'tunai' ? 'selected' : ''}>Tunai</option>
                <option value="transfer" ${trx.metode === 'transfer' ? 'selected' : ''}>Transfer</option>
              </select>
            </div>
            <div class="field mb0"><label>${trx.bayar === 'tunai' ? 'Uang Diterima' : 'DP / Bayar Sebagian'}</label>
              <input class="input num" id="inpBayar" inputmode="numeric" data-rupiah value="${trx.dibayar ? num(trx.dibayar) : ''}" placeholder="0"></div>
          </div>

          ${trx.bayar === 'tunai'
            ? `<div class="kv mt8"><span class="k">Kembalian</span><span class="v ${kembali < 0 ? 'neg' : 'pos'}">${rp(Math.max(0, kembali))}</span></div>
               <div class="btn-row mt8">
                 ${[t, Math.ceil(t / 50000) * 50000, Math.ceil(t / 100000) * 100000, Math.ceil(t / 500000) * 500000]
                   .filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4)
                   .map(v => `<button class="btn btn-xs" data-cepat="${v}">${rp(v)}</button>`).join('')}
               </div>`
            : `<div class="kv mt8"><span class="k">Sisa Piutang</span><span class="v neg">${rp(sisa)}</span></div>
               <div class="field mt8 mb0"><label>Jatuh Tempo</label>
                 <input class="input" type="date" id="inpTempo" value="${trx.jatuhTempo || tambahHari(trx.tanggal, toNum(mitra?.tempoHari) || 14)}"></div>`}

          <div class="field mt12 mb0"><label>Catatan</label>
            <input class="input" id="inpCatatan" value="${esc(trx.catatan)}" placeholder="Opsional"></div>

          <div class="divider"></div>
          <div class="kv"><span class="k">Estimasi laba kotor</span><span class="v pos">${rp(labaEstimasi())}</span></div>
        </div>
      </div>
    </div>
  </div>

  <div class="sticky-bar">
    <div class="sb-info">
      <div class="sb-lbl">${trx.items.length} item · ${num(sum(trx.items, i => i.qty))} unit</div>
      <div class="sb-val">${rp(t)}</div>
    </div>
    <button class="btn btn-primary" id="btnSimpan" ${trx.items.length ? '' : 'disabled'}>✔ Simpan</button>
  </div>`;

  pasangRupiah(el);
  ikat();
}

function ikat() {
  const q = s => el.querySelector(s);

  q('#btnMitra').onclick = pilihMitra;
  q('#btnTambahProduk').onclick = modalProduk;
  q('#btnSimpan').onclick = simpan;
  q('#selSales').onchange = e => { trx.salesId = e.target.value; };
  q('#inpTgl').onchange = e => { trx.tanggal = e.target.value || todayISO(); };
  q('#selMetode').onchange = e => { trx.metode = e.target.value; };
  q('#inpCatatan').oninput = e => { trx.catatan = e.target.value; };
  q('#inpTempo') && (q('#inpTempo').onchange = e => { trx.jatuhTempo = e.target.value; });

  q('#inpDiskon').addEventListener('nilai', e => { trx.diskon = e.detail; gambar(); });
  q('#inpBayar').addEventListener('nilai', debounce(e => { trx.dibayar = e.detail; gambar(); }, 400));

  q('#segBayar').onclick = e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    trx.bayar = b.dataset.v;
    trx.dibayar = b.dataset.v === 'tunai' ? 0 : trx.dibayar;
    gambar();
  };

  el.querySelectorAll('[data-cepat]').forEach(b => b.onclick = () => {
    trx.dibayar = toNum(b.dataset.cepat);
    gambar();
  });

  el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => ubahBaris(+b.dataset.edit));

  el.querySelectorAll('.stepper[data-idx] button').forEach(b => b.onclick = () => {
    const idx = +b.closest('[data-idx]').dataset.idx;
    const baruQty = Math.max(0, toNum(trx.items[idx].qty) + toNum(b.dataset.d));
    if (baruQty <= 0) trx.items.splice(idx, 1); else trx.items[idx].qty = baruQty;
    gambar();
  });
  el.querySelectorAll('[data-qty]').forEach(inp => inp.onchange = () => {
    const idx = +inp.dataset.qty;
    const v = Math.max(0, toNum(inp.value));
    if (v <= 0) trx.items.splice(idx, 1); else trx.items[idx].qty = v;
    gambar();
  });
}

export function render(view, params = []) {
  el = view;
  if (!trx) trx = baru();

  // pra-pilih mitra dari parameter rute (#/kasir/<mitraId>)
  if (params[0]) {
    const m = get('mitra', params[0]);
    if (m) {
      trx.mitraId = m.id;
      trx.salesId = m.salesId || '';
      trx.jatuhTempo = tambahHari(trx.tanggal, toNum(m.tempoHari) || 14);
      trx.items.forEach(i => { i.harga = hargaUntuk(get('produk', i.produkId), m); });
    }
  }

  setJudul('Penjualan Baru', 'Transaksi putus ke agen / reseller');
  setTopbar([
    {
      teks: 'Kosongkan', ikon: '🗑️', kelas: 'btn-ghost btn-sm', onClick: async () => {
        if (!trx.items.length) return;
        if (await konfirmasi({ judul: 'Kosongkan keranjang?', pesan: 'Semua item akan dihapus.', ok: 'Kosongkan', bahaya: true })) {
          trx = baru(); gambar();
        }
      },
    },
  ]);
  setFab(null);

  if (!db.produk.length) {
    view.innerHTML = kosongState('🚬', 'Belum ada produk',
      'Tambahkan data produk terlebih dahulu sebelum melakukan penjualan.',
      '<a class="btn btn-primary" href="#/produk">Kelola Produk</a>');
    return;
  }
  gambar();
}
