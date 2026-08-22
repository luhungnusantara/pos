/* pages/pembelian.js — pembelian / stok masuk dari supplier */
import { db, get } from '../core/store.js';
import { simpanPembelian, batalkanPembelian, stokGudang, totalHutang } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, modal, konfirmasi, sukses, ingat, kosongState, statTile, badge, pasangRupiah,
} from '../core/ui.js';
import { modalBayarHutang } from '../core/bayar.js';
import { htmlPeriode, pasangPeriode, hitungPeriode } from '../core/periode.js';
import { segarkan, pergi } from '../core/router.js';
import {
  esc, rp, num, toNum, cocok, sum, debounce, fmtTgl, fmtTglPendek, sortBy, todayISO, tambahHari, round2,
} from '../core/utils.js';

let f = { kode: '30hari', dari: todayISO(), sampai: todayISO(), q: '', status: 'semua' };

/* =========================================================
   DAFTAR
   ========================================================= */
function halamanDaftar(view) {
  const { dari, sampai, label } = hitungPeriode(f.kode, f);
  const semua = db.pembelian.filter(b => (!dari || b.tanggal >= dari) && (!sampai || b.tanggal <= sampai));

  setJudul('Pembelian / Stok Masuk', `${label} · ${semua.filter(b => b.status !== 'batal').length} faktur`);
  setTopbar([{ teks: 'Beli', ikon: '＋', onClick: () => pergi('pembelian/baru') }]);
  setFab({ ikon: '＋', teks: 'Pembelian baru', onClick: () => pergi('pembelian/baru') });

  const aktif = semua.filter(b => b.status !== 'batal');
  const nilai = sum(aktif, b => b.total);
  const hutang = sum(aktif, b => Math.max(0, toNum(b.total) - toNum(b.dibayar)));

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: 'Nilai Pembelian', nilai: rp(nilai), sub: label, warna: 'info', ikon: '📥' })}
      ${statTile({ label: 'Faktur', nilai: num(aktif.length), sub: `${num(sum(aktif, b => sum(b.items, i => i.qty)))} unit masuk`, ikon: '🧾' })}
      ${statTile({ label: 'Hutang Periode', nilai: rp(hutang), sub: 'belum dibayar', warna: hutang > 0 ? 'warn' : 'ok', ikon: '📌' })}
      ${statTile({ label: 'Total Hutang', nilai: rp(totalHutang()), sub: 'seluruh periode', warna: 'bad', ikon: '🏦' })}
    </div>

    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari supplier / no. faktur..." value="${esc(f.q)}"></div>
      ${htmlPeriode(f.kode, f)}
    </div>
    <div class="chips mb12" id="chipStatus">
      ${[['semua', 'Semua'], ['hutang', 'Belum Lunas'], ['lunas', 'Lunas'], ['batal', 'Dibatalkan']]
        .map(([v, t]) => `<button class="chip ${f.status === v ? 'active' : ''}" data-v="${v}">${t}</button>`).join('')}
    </div>
    <div class="card"><div class="list" id="daftar"></div></div>`;

  const box = view.querySelector('#daftar');
  const gambar = () => {
    let arr = semua.filter(b => cocok(`${b.noRef} ${b.supplier} ${b.catatan || ''}`, f.q));
    if (f.status !== 'batal') arr = arr.filter(b => b.status !== 'batal');
    if (f.status === 'hutang') arr = arr.filter(b => toNum(b.total) - toNum(b.dibayar) > 0.5);
    if (f.status === 'lunas') arr = arr.filter(b => toNum(b.total) - toNum(b.dibayar) <= 0.5);
    if (f.status === 'batal') arr = arr.filter(b => b.status === 'batal');
    arr = sortBy(arr, b => `${b.tanggal}${b.dibuat}`, true);

    if (!arr.length) {
      box.innerHTML = kosongState('📥', 'Belum ada pembelian',
        'Catat pembelian stok dari supplier agar stok gudang dan hutang tercatat rapi.',
        '<a class="btn btn-primary" href="#/pembelian/baru">＋ Pembelian Baru</a>');
      return;
    }
    box.innerHTML = arr.map(b => {
      const sisa = round2(toNum(b.total) - toNum(b.dibayar));
      const batal = b.status === 'batal';
      return `<div class="row-item" data-id="${b.id}">
        <div class="avatar ${sisa > 0 && !batal ? 'w' : ''}">📥</div>
        <div class="ri-main">
          <div class="ri-title">${esc(b.supplier)}
            ${batal ? badge('Batal', 'bad') : sisa > 0 ? badge('Hutang', 'warn') : badge('Lunas', 'ok')}</div>
          <div class="ri-sub">${esc(b.noRef)} · ${fmtTglPendek(b.tanggal)} · ${b.items.length} item · ${num(sum(b.items, i => i.qty))} unit</div>
        </div>
        <div class="ri-right">
          <div class="ri-val" ${batal ? 'style="text-decoration:line-through"' : ''}>${rp(b.total)}</div>
          <div class="ri-note ${sisa > 0 && !batal ? 'neg' : ''}">${batal ? 'dibatalkan' : sisa > 0 ? `sisa ${rp(sisa)}` : 'lunas'}</div>
        </div>
      </div>`;
    }).join('');
  };
  gambar();

  view.querySelector('#cari').addEventListener('input', debounce(e => { f.q = e.target.value; gambar(); }, 180));
  pasangPeriode(view, f, () => segarkan());
  view.querySelector('#chipStatus').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    f.status = c.dataset.v; segarkan();
  });
  box.addEventListener('click', e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const b = get('pembelian', row.dataset.id);
    if (b) detail(b);
  });
}

function detail(b) {
  const sisa = round2(toNum(b.total) - toNum(b.dibayar));
  const batal = b.status === 'batal';
  modal({
    judul: b.noRef, lebar: 'wide',
    isi: `
      <div class="flex flex-wrap mb12">
        ${badge(fmtTgl(b.tanggal))}
        ${batal ? badge('DIBATALKAN', 'bad') : sisa > 0 ? badge('Belum Lunas', 'warn') : badge('Lunas', 'ok')}
        ${b.jatuhTempo ? badge('Tempo ' + fmtTgl(b.jatuhTempo)) : ''}
      </div>
      <div class="card mb12"><div class="card-body">
        <div class="kv"><span class="k">Supplier</span><span class="v">${esc(b.supplier)}</span></div>
        ${b.catatan ? `<div class="kv"><span class="k">Catatan</span><span class="v">${esc(b.catatan)}</span></div>` : ''}
      </div></div>
      <div class="card mb12"><div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Produk</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Jumlah</th></tr></thead>
        <tbody>${b.items.map(i => {
          const p = get('produk', i.produkId);
          return `<tr>
            <td data-l="Produk"><span>${esc(p?.nama || '-')}</span></td>
            <td data-l="Qty" class="num"><span>${num(i.qty)} ${esc(p?.satuan || '')}</span></td>
            <td data-l="Harga" class="num"><span>${rp(i.harga)}</span></td>
            <td data-l="Jumlah" class="num strong"><span>${rp(toNum(i.qty) * toNum(i.harga))}</span></td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="card-body">
        ${toNum(b.diskon) ? `<div class="kv"><span class="k">Diskon</span><span class="v neg">-${rp(b.diskon)}</span></div>` : ''}
        <div class="kv total"><span class="k">Total</span><span class="v">${rp(b.total)}</span></div>
        <div class="kv"><span class="k">Dibayar</span><span class="v pos">${rp(b.dibayar)}</span></div>
        ${sisa > 0 ? `<div class="kv"><span class="k">Sisa hutang</span><span class="v neg">${rp(sisa)}</span></div>` : ''}
      </div></div>`,
    tombol: batal ? [{ teks: 'Tutup', kelas: 'btn-ghost' }] : [
      {
        teks: '⛔ Batalkan', kelas: 'btn-ghost', aksi: async h => {
          const ya = await konfirmasi({
            judul: 'Batalkan pembelian?', bahaya: true, ok: 'Ya, batalkan',
            pesan: `Faktur <b>${esc(b.noRef)}</b> dibatalkan. Stok yang masuk akan dikurangi kembali dan kas keluar dihapus.`,
          });
          if (ya) { batalkanPembelian(b.id); h.tutup(); sukses('Pembelian dibatalkan'); segarkan(); }
        },
      },
      ...(sisa > 0 ? [{ teks: '💵 Bayar Hutang', kelas: 'btn-primary', aksi: h => { h.tutup(); modalBayarHutang(b, segarkan); } }] : []),
    ],
  });
}

/* =========================================================
   FORM PEMBELIAN
   ========================================================= */
function halamanBaru(view) {
  const form = {
    tanggal: todayISO(), supplier: '', items: [], diskon: 0,
    bayar: 'tunai', dibayar: 0, jatuhTempo: tambahHari(todayISO(), 30), catatan: '',
  };

  setJudul('Pembelian Baru', 'Stok masuk dari supplier');
  setTopbar([{ teks: 'Kembali', ikon: '←', kelas: 'btn-ghost btn-sm', onClick: () => pergi('pembelian') }]);
  setFab(null);

  /** perbarui angka saja; menggambar ulang saat mengetik akan merebut fokus kolom */
  const perbaruiAngka = () => {
    const sub = round2(sum(form.items, i => toNum(i.qty) * toNum(i.harga)));
    const tot = round2(Math.max(0, sub - toNum(form.diskon)));
    const isi = (sel, teks) => { const n = view.querySelector(sel); if (n) n.textContent = teks; };
    isi('#nSubtotal', rp(sub));
    isi('#nTotal', rp(tot));
    isi('#sbTotal', rp(tot));
    isi('#nHutang', rp(Math.max(0, tot - toNum(form.dibayar))));
    form.items.forEach((i, idx) => isi(`#nBaris${idx}`, rp(toNum(i.qty) * toNum(i.harga))));
    const simpan = view.querySelector('#btnSimpan');
    if (simpan) simpan.disabled = !form.items.length;
  };

  const gambar = () => {
    const subtotal = round2(sum(form.items, i => toNum(i.qty) * toNum(i.harga)));
    const total = round2(Math.max(0, subtotal - toNum(form.diskon)));
    const supplierLama = [...new Set(db.pembelian.map(b => b.supplier).filter(Boolean))];

    view.innerHTML = `
    <div class="trx-layout">
      <div>
        <div class="card">
          <div class="card-head"><h2>🏭 Supplier</h2></div>
          <div class="card-body">
            <div class="form-row">
              <div class="field mb0" style="grid-column:1/-1"><label class="req">Nama Supplier</label>
                <input class="input" id="supplier" list="dsSupplier" value="${esc(form.supplier)}" placeholder="PT Sumber Niaga">
                <datalist id="dsSupplier">${supplierLama.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
              <div class="field mb0"><label>Tanggal Faktur</label><input class="input" type="date" id="tgl" value="${form.tanggal}"></div>
              <div class="field mb0"><label>Catatan</label><input class="input" id="catatan" value="${esc(form.catatan)}" placeholder="Opsional"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>📦 Barang Masuk</h2>
            <span class="muted xs">${form.items.length} item · ${num(sum(form.items, i => i.qty))} unit</span></div>
          <div class="card-body">
            ${form.items.length ? form.items.map((i, idx) => {
              const p = get('produk', i.produkId);
              return `<div class="cart-line">
                <div class="cl-main">
                  <div class="cl-name">${esc(p?.nama || '-')}</div>
                  <div class="cl-meta">stok kini ${num(stokGudang(i.produkId))} ${esc(p?.satuan || '')}</div>
                  <div class="form-row mt8" style="grid-template-columns:132px 1fr">
                    <div class="stepper" data-idx="${idx}">
                      <button type="button" data-d="-1">−</button>
                      <input type="number" inputmode="decimal" value="${num(i.qty)}" data-qty="${idx}">
                      <button type="button" data-d="1">+</button></div>
                    <input class="input num" inputmode="numeric" data-rupiah data-harga="${idx}" value="${num(i.harga)}" placeholder="Harga beli">
                  </div>
                </div>
                <div class="cl-right">
                  <div class="b tabular" id="nBaris${idx}">${rp(toNum(i.qty) * toNum(i.harga))}</div>
                  <button class="btn btn-xs btn-ghost mt8" data-hapus="${idx}">🗑️</button>
                </div></div>`;
            }).join('') : kosongState('📦', 'Belum ada barang', 'Tambahkan produk yang dibeli.')}
          </div>
          <div class="card-foot"><button class="btn btn-soft btn-block" id="btnTambah">＋ Tambah Produk</button></div>
        </div>
      </div>

      <div class="kolom-kanan">
        <div class="card">
          <div class="card-head"><h2>💳 Pembayaran</h2></div>
          <div class="card-body">
            <div class="kv"><span class="k">Subtotal</span><span class="v" id="nSubtotal">${rp(subtotal)}</span></div>
            <div class="field mt8"><label>Diskon</label>
              <input class="input num" id="diskon" inputmode="numeric" data-rupiah value="${form.diskon ? num(form.diskon) : ''}" placeholder="0"></div>
            <div class="kv total"><span class="k">TOTAL</span><span class="v" id="nTotal">${rp(total)}</span></div>

            <div class="lbl-t mt12">Cara Bayar</div>
            <div class="seg" id="segBayar">
              <button type="button" data-v="tunai" class="${form.bayar === 'tunai' ? 'active' : ''}">💵 Tunai / Lunas</button>
              <button type="button" data-v="kredit" class="${form.bayar === 'kredit' ? 'active' : ''}">📌 Tempo</button>
            </div>
            ${form.bayar === 'kredit' ? `
              <div class="form-row mt12">
                <div class="field mb0"><label>DP / Dibayar</label>
                  <input class="input num" id="dibayar" inputmode="numeric" data-rupiah value="${form.dibayar ? num(form.dibayar) : ''}" placeholder="0"></div>
                <div class="field mb0"><label>Jatuh Tempo</label>
                  <input class="input" type="date" id="tempo" value="${form.jatuhTempo}"></div>
              </div>
              <div class="kv mt8"><span class="k">Hutang</span><span class="v neg" id="nHutang">${rp(Math.max(0, total - toNum(form.dibayar)))}</span></div>` : ''}
            <div class="hint mt12">ℹ️ Harga beli terakhir akan otomatis memperbarui harga beli produk untuk perhitungan laba.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="sticky-bar">
      <div class="sb-info"><div class="sb-lbl">Total pembelian</div><div class="sb-val" id="sbTotal">${rp(total)}</div></div>
      <button class="btn btn-primary" id="btnSimpan" ${form.items.length ? '' : 'disabled'}>✔ Simpan</button>
    </div>`;

    pasangRupiah(view);
    const q = s => view.querySelector(s);
    q('#supplier').oninput = e => { form.supplier = e.target.value; };
    q('#tgl').onchange = e => { form.tanggal = e.target.value || todayISO(); };
    q('#catatan').oninput = e => { form.catatan = e.target.value; };
    q('#tempo') && (q('#tempo').onchange = e => { form.jatuhTempo = e.target.value; });
    q('#diskon').addEventListener('nilai', e => { form.diskon = e.detail; perbaruiAngka(); });
    q('#dibayar')?.addEventListener('nilai', e => { form.dibayar = e.detail; perbaruiAngka(); });
    q('#segBayar').onclick = e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      form.bayar = b.dataset.v; gambar();
    };
    q('#btnTambah').onclick = () => pilihProduk();

    view.querySelectorAll('[data-hapus]').forEach(b => b.onclick = () => { form.items.splice(+b.dataset.hapus, 1); gambar(); });
    view.querySelectorAll('.stepper[data-idx] button').forEach(b => b.onclick = () => {
      const idx = +b.closest('[data-idx]').dataset.idx;
      const v = Math.max(0, toNum(form.items[idx].qty) + toNum(b.dataset.d));
      if (v <= 0) form.items.splice(idx, 1); else form.items[idx].qty = v;
      gambar();
    });
    view.querySelectorAll('[data-qty]').forEach(inp => inp.onchange = () => {
      const idx = +inp.dataset.qty, v = Math.max(0, toNum(inp.value));
      if (v <= 0) form.items.splice(idx, 1); else form.items[idx].qty = v;
      gambar();
    });
    view.querySelectorAll('[data-harga]').forEach(inp => inp.addEventListener('nilai', e => {
      form.items[+inp.dataset.harga].harga = e.detail;
      perbaruiAngka();
    }));

    q('#btnSimpan').onclick = () => {
      if (!form.supplier.trim()) return ingat('Isi nama supplier terlebih dahulu');
      if (!form.items.length) return ingat('Belum ada barang');
      if (form.items.some(i => toNum(i.harga) <= 0)) return ingat('Ada item dengan harga beli kosong');
      const b = simpanPembelian(form);
      sukses(`Pembelian ${b.noRef} tersimpan, stok bertambah`);
      pergi('pembelian');
    };
  };

  function pilihProduk() {
    const h = modal({
      judul: 'Tambah Produk',
      isi: `<div class="toolbar" style="margin-bottom:10px">
          <div class="search-wrap grow"><input class="input" id="cariP" placeholder="Cari produk..." autocomplete="off"></div></div>
        <div class="card"><div class="list" id="listP"></div></div>`,
      tombol: [{ teks: 'Selesai', kelas: 'btn-primary', aksi: x => x.tutup() }],
      onTutup: gambar,
    });
    const listP = h.body.querySelector('#listP');
    const gambarList = (kw = '') => {
      const arr = sortBy(db.produk.filter(p => cocok(`${p.nama} ${p.kode} ${p.merk}`, kw)), p => p.nama.toLowerCase());
      listP.innerHTML = arr.length ? arr.map(p => {
        const di = form.items.find(i => i.produkId === p.id);
        return `<div class="row-item">
          <div class="avatar">${esc(p.kode.slice(0, 3))}</div>
          <div class="ri-main"><div class="ri-title">${esc(p.nama)}</div>
            <div class="ri-sub">beli ${rp(p.hargaBeli)} · stok ${num(stokGudang(p.id))}</div></div>
          <div class="ri-right">${di
            ? `<div class="stepper" style="width:126px"><button type="button" data-d="-1" data-p="${p.id}">−</button>
                <input type="number" inputmode="decimal" value="${num(di.qty)}" data-q="${p.id}">
                <button type="button" data-d="1" data-p="${p.id}">+</button></div>`
            : `<button class="btn btn-soft btn-sm" data-add="${p.id}">＋ Tambah</button>`}</div></div>`;
      }).join('') : kosongState('🔍', 'Produk tidak ditemukan');
    };
    gambarList();
    h.body.querySelector('#cariP').addEventListener('input', debounce(e => gambarList(e.target.value), 150));
    const setQty = (id, qty) => {
      const idx = form.items.findIndex(i => i.produkId === id);
      if (qty <= 0) { if (idx >= 0) form.items.splice(idx, 1); }
      else if (idx >= 0) form.items[idx].qty = qty;
      gambarList(h.body.querySelector('#cariP').value);
    };
    listP.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) {
        const p = get('produk', add.dataset.add);
        form.items.push({ produkId: p.id, qty: 1, harga: toNum(p.hargaBeli) });
        return gambarList(h.body.querySelector('#cariP').value);
      }
      const b = e.target.closest('[data-p]');
      if (b) {
        const inp = listP.querySelector(`[data-q="${b.dataset.p}"]`);
        setQty(b.dataset.p, Math.max(0, toNum(inp.value) + toNum(b.dataset.d)));
      }
    });
    listP.addEventListener('change', e => {
      const inp = e.target.closest('[data-q]');
      if (inp) setQty(inp.dataset.q, Math.max(0, toNum(inp.value)));
    });
  }

  gambar();
}

export function render(view, params = []) {
  if (params[0] === 'baru') return halamanBaru(view);
  return halamanDaftar(view);
}
