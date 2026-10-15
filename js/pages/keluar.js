/* pages/keluar.js — barang / stok keluar selain penjualan (rusak, sampel, retur supplier) */
import { db, get } from '../core/store.js';
import { simpanKeluar, batalkanKeluar, stokGudang, ALASAN_KELUAR, labelAlasanKeluar } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, modal, konfirmasi, sukses, ingat, gagal, kosongState, statTile, badge,
} from '../core/ui.js';
import { htmlPeriode, pasangPeriode, hitungPeriode } from '../core/periode.js';
import { segarkan, pergi } from '../core/router.js';
import { bolehKelola, bolehLihatModal } from '../core/peran.js';
import {
  esc, rp, num, toNum, cocok, sum, debounce, fmtTgl, fmtTglPendek, sortBy, todayISO,
} from '../core/utils.js';

let f = { kode: '30hari', dari: todayISO(), sampai: todayISO(), q: '', alasan: 'semua' };

const ikonAlasan = id => ALASAN_KELUAR[id]?.ikon || '📤';
const unitKeluar = k => sum(k.items, i => i.qty);

/* =========================================================
   DAFTAR
   ========================================================= */
function halamanDaftar(view) {
  const { dari, sampai, label } = hitungPeriode(f.kode, f);
  const semua = db.keluar.filter(k => (!dari || k.tanggal >= dari) && (!sampai || k.tanggal <= sampai));
  const aktif = semua.filter(k => k.status !== 'batal');
  const modalTampil = bolehLihatModal();

  setJudul('Barang / Stok Keluar', `${label} · ${aktif.length} dokumen`);
  setTopbar(bolehKelola() ? [{ teks: 'Keluarkan', ikon: '＋', onClick: () => pergi('keluar/baru') }] : []);
  setFab(bolehKelola() ? { ikon: '＋', teks: 'Stok keluar baru', onClick: () => pergi('keluar/baru') } : null);

  const rugi = aktif.filter(k => ALASAN_KELUAR[k.alasan]?.rugi !== false);
  const retur = aktif.filter(k => k.alasan === 'retur');

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: 'Unit Keluar', nilai: num(sum(aktif, unitKeluar)), sub: `${aktif.length} dokumen · ${label}`, warna: 'info', ikon: '📤' })}
      ${modalTampil
        ? statTile({ label: 'Nilai Kerugian', nilai: rp(sum(rugi, k => k.nilai)), sub: 'harga beli · masuk laba rugi', warna: 'bad', ikon: '💔' })
        : statTile({ label: 'Rusak / Hilang', nilai: num(sum(rugi, unitKeluar)), sub: 'unit', warna: 'bad', ikon: '💔' })}
      ${statTile({ label: 'Retur ke Supplier', nilai: num(sum(retur, unitKeluar)), sub: `${retur.length} dokumen`, ikon: '↩️' })}
      ${statTile({ label: 'Sampel / Promosi', nilai: num(sum(aktif.filter(k => k.alasan === 'sampel'), unitKeluar)), sub: 'unit', warna: 'warn', ikon: '🎁' })}
    </div>

    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari no. dokumen / tujuan / catatan..." value="${esc(f.q)}"></div>
      ${htmlPeriode(f.kode, f)}
    </div>
    <div class="chips mb12" id="chipAlasan">
      ${[['semua', 'Semua'], ...Object.entries(ALASAN_KELUAR).map(([v, a]) => [v, `${a.ikon} ${a.label}`]), ['batal', 'Dibatalkan']]
        .map(([v, t]) => `<button class="chip ${f.alasan === v ? 'active' : ''}" data-v="${v}">${t}</button>`).join('')}
    </div>
    <div class="card"><div class="list" id="daftar"></div></div>`;

  const box = view.querySelector('#daftar');
  const gambar = () => {
    let arr = semua.filter(k => cocok(`${k.noRef} ${k.penerima || ''} ${k.catatan || ''} ${labelAlasanKeluar(k.alasan)}`, f.q));
    arr = f.alasan === 'batal' ? arr.filter(k => k.status === 'batal') : arr.filter(k => k.status !== 'batal');
    if (f.alasan !== 'semua' && f.alasan !== 'batal') arr = arr.filter(k => k.alasan === f.alasan);
    arr = sortBy(arr, k => `${k.tanggal}${k.dibuat}`, true);

    if (!arr.length) {
      box.innerHTML = kosongState('📤', 'Belum ada stok keluar',
        'Catat barang yang keluar gudang bukan karena dijual — rusak, hilang, sampel, pemakaian sendiri, atau retur ke supplier.',
        bolehKelola() ? '<a class="btn btn-primary" href="#/keluar/baru">＋ Stok Keluar Baru</a>' : '');
      return;
    }
    box.innerHTML = arr.map(k => {
      const batal = k.status === 'batal';
      return `<div class="row-item" data-id="${k.id}">
        <div class="avatar ${ALASAN_KELUAR[k.alasan]?.rugi !== false && !batal ? 'w' : ''}">${ikonAlasan(k.alasan)}</div>
        <div class="ri-main">
          <div class="ri-title">${esc(labelAlasanKeluar(k.alasan))}${k.penerima ? ` · ${esc(k.penerima)}` : ''}
            ${batal ? badge('Batal', 'bad') : ''}</div>
          <div class="ri-sub">${esc(k.noRef)} · ${fmtTglPendek(k.tanggal)} · ${k.items.length} item${k.catatan ? ` · ${esc(k.catatan)}` : ''}</div>
        </div>
        <div class="ri-right">
          <div class="ri-val neg" ${batal ? 'style="text-decoration:line-through"' : ''}>−${num(unitKeluar(k))} unit</div>
          <div class="ri-note">${batal ? 'dibatalkan' : modalTampil ? rp(k.nilai) : ''}</div>
        </div>
      </div>`;
    }).join('');
  };
  gambar();

  view.querySelector('#cari').addEventListener('input', debounce(e => { f.q = e.target.value; gambar(); }, 180));
  pasangPeriode(view, f, () => segarkan());
  view.querySelector('#chipAlasan').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    f.alasan = c.dataset.v; segarkan();
  });
  box.addEventListener('click', e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const k = get('keluar', row.dataset.id);
    if (k) detail(k);
  });
}

function detail(k) {
  const batal = k.status === 'batal';
  const modalTampil = bolehLihatModal();
  const a = ALASAN_KELUAR[k.alasan];
  modal({
    judul: k.noRef, lebar: 'wide',
    isi: `
      <div class="flex flex-wrap mb12">
        ${badge(fmtTgl(k.tanggal))}
        ${badge(`${ikonAlasan(k.alasan)} ${labelAlasanKeluar(k.alasan)}`, a?.rugi === false ? 'info' : 'warn')}
        ${batal ? badge('DIBATALKAN', 'bad') : ''}
      </div>
      ${k.penerima || k.catatan ? `<div class="card mb12"><div class="card-body">
        ${k.penerima ? `<div class="kv"><span class="k">Tujuan / Penerima</span><span class="v">${esc(k.penerima)}</span></div>` : ''}
        ${k.catatan ? `<div class="kv"><span class="k">Catatan</span><span class="v">${esc(k.catatan)}</span></div>` : ''}
      </div></div>` : ''}
      <div class="card mb12"><div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Produk</th><th class="num">Qty</th>${modalTampil ? '<th class="num">Harga Beli</th><th class="num">Nilai</th>' : ''}</tr></thead>
        <tbody>${k.items.map(i => {
          const p = get('produk', i.produkId);
          return `<tr>
            <td data-l="Produk"><span>${esc(p?.nama || '-')}</span></td>
            <td data-l="Qty" class="num"><span>${num(i.qty)} ${esc(p?.satuan || '')}</span></td>
            ${modalTampil ? `<td data-l="Harga Beli" class="num"><span>${rp(i.hargaBeli)}</span></td>
            <td data-l="Nilai" class="num strong"><span>${rp(toNum(i.qty) * toNum(i.hargaBeli))}</span></td>` : ''}</tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="card-body">
        <div class="kv total"><span class="k">Total keluar</span><span class="v">${num(unitKeluar(k))} unit</span></div>
        ${modalTampil ? `<div class="kv"><span class="k">${a?.rugi === false ? 'Nilai barang (bukan kerugian)' : 'Nilai kerugian'}</span>
          <span class="v ${a?.rugi === false ? '' : 'neg'}">${rp(k.nilai)}</span></div>` : ''}
      </div></div>`,
    tombol: batal || !bolehKelola() ? [{ teks: 'Tutup', kelas: 'btn-ghost' }] : [
      {
        teks: '⛔ Batalkan', kelas: 'btn-ghost', aksi: async h => {
          const ya = await konfirmasi({
            judul: 'Batalkan stok keluar?', bahaya: true, ok: 'Ya, batalkan',
            pesan: `Dokumen <b>${esc(k.noRef)}</b> dibatalkan dan <b>${num(unitKeluar(k))} unit</b> dikembalikan ke stok gudang.`,
          });
          if (ya) { batalkanKeluar(k.id); h.tutup(); sukses('Stok keluar dibatalkan, stok kembali'); segarkan(); }
        },
      },
      { teks: 'Tutup', kelas: 'btn-primary' },
    ],
  });
}

/* =========================================================
   FORM STOK KELUAR
   ========================================================= */
function halamanBaru(view) {
  const form = { tanggal: todayISO(), alasan: 'rusak', penerima: '', items: [], catatan: '' };
  const modalTampil = bolehLihatModal();

  setJudul('Stok Keluar Baru', 'Barang keluar gudang selain penjualan');
  setTopbar([{ teks: 'Kembali', ikon: '←', kelas: 'btn-ghost btn-sm', onClick: () => pergi('keluar') }]);
  setFab(null);

  const nilai = () => sum(form.items, i => toNum(i.qty) * toNum(get('produk', i.produkId)?.hargaBeli));
  /** jumlah tidak boleh melebihi stok gudang */
  const batasi = (produkId, qty) => {
    const stok = stokGudang(produkId);
    if (qty > stok) {
      ingat(`Stok ${get('produk', produkId)?.nama || ''} hanya ${num(stok)}`);
      return stok;
    }
    return Math.max(0, qty);
  };

  const gambar = () => {
    const unit = sum(form.items, i => i.qty);
    const penerimaLama = [...new Set(db.keluar.map(k => k.penerima).filter(Boolean))];
    const a = ALASAN_KELUAR[form.alasan];

    view.innerHTML = `
    <div class="trx-layout">
      <div>
        <div class="card">
          <div class="card-head"><h2>📤 Alasan Keluar</h2></div>
          <div class="card-body">
            <div class="chips" id="chipAlasan" style="flex-wrap:wrap">
              ${Object.entries(ALASAN_KELUAR).map(([v, x]) =>
                `<button type="button" class="chip ${form.alasan === v ? 'active' : ''}" data-v="${v}">${x.ikon} ${x.label}</button>`).join('')}
            </div>
            <div class="form-row mt12">
              <div class="field mb0"><label>Tanggal</label><input class="input" type="date" id="tgl" value="${form.tanggal}"></div>
              <div class="field mb0"><label>${form.alasan === 'retur' ? 'Supplier' : 'Tujuan / Penerima'}</label>
                <input class="input" id="penerima" list="dsPenerima" value="${esc(form.penerima)}"
                  placeholder="${form.alasan === 'retur' ? 'PT Sumber Niaga' : form.alasan === 'sampel' ? 'Mis. Toko Berkah' : 'Opsional'}">
                <datalist id="dsPenerima">${penerimaLama.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
              <div class="field mb0" style="grid-column:1/-1"><label>Catatan</label>
                <input class="input" id="catatan" value="${esc(form.catatan)}" placeholder="Mis. bungkus basah kena hujan"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>📦 Barang Keluar</h2>
            <span class="muted xs">${form.items.length} item · ${num(unit)} unit</span></div>
          <div class="card-body">
            ${form.items.length ? form.items.map((i, idx) => {
              const p = get('produk', i.produkId);
              return `<div class="cart-line">
                <div class="cl-main">
                  <div class="cl-name">${esc(p?.nama || '-')}</div>
                  <div class="cl-meta">stok gudang ${num(stokGudang(i.produkId))} ${esc(p?.satuan || '')}
                    → sisa ${num(stokGudang(i.produkId) - toNum(i.qty))}</div>
                  <div class="stepper mt8" data-idx="${idx}" style="width:132px">
                    <button type="button" data-d="-1">−</button>
                    <input type="number" inputmode="decimal" value="${num(i.qty)}" data-qty="${idx}">
                    <button type="button" data-d="1">+</button></div>
                </div>
                <div class="cl-right">
                  ${modalTampil ? `<div class="b tabular">${rp(toNum(i.qty) * toNum(p?.hargaBeli))}</div>` : ''}
                  <button class="btn btn-xs btn-ghost mt8" data-hapus="${idx}">🗑️</button>
                </div></div>`;
            }).join('') : kosongState('📦', 'Belum ada barang', 'Tambahkan produk yang keluar dari gudang.')}
          </div>
          <div class="card-foot"><button class="btn btn-soft btn-block" id="btnTambah">＋ Tambah Produk</button></div>
        </div>
      </div>

      <div class="kolom-kanan">
        <div class="card">
          <div class="card-head"><h2>🧮 Ringkasan</h2></div>
          <div class="card-body">
            <div class="kv"><span class="k">Alasan</span><span class="v">${a.ikon} ${esc(a.label)}</span></div>
            <div class="kv total"><span class="k">Total keluar</span><span class="v">${num(unit)} unit</span></div>
            ${modalTampil ? `<div class="kv"><span class="k">Nilai (harga beli)</span><span class="v ${a.rugi ? 'neg' : ''}">${rp(nilai())}</span></div>` : ''}
            <div class="hint mt12">${a.rugi
              ? 'ℹ️ Stok gudang berkurang. Nilainya (harga beli) dihitung sebagai <b>kerugian</b> di Laporan Laba Rugi. Tidak ada kas yang tercatat.'
              : 'ℹ️ Stok gudang berkurang, tetapi <b>tidak dihitung kerugian</b>. Bila supplier mengembalikan uang, catat di <b>Kas Masuk</b>; bila memotong hutang, catat lewat pembayaran hutang.'}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="sticky-bar">
      <div class="sb-info"><div class="sb-lbl">Total keluar</div><div class="sb-val">${num(unit)} unit</div></div>
      <button class="btn btn-primary" id="btnSimpan" ${form.items.length ? '' : 'disabled'}>✔ Simpan</button>
    </div>`;

    const q = s => view.querySelector(s);
    q('#tgl').onchange = e => { form.tanggal = e.target.value || todayISO(); };
    q('#penerima').oninput = e => { form.penerima = e.target.value; };
    q('#catatan').oninput = e => { form.catatan = e.target.value; };
    q('#chipAlasan').onclick = e => {
      const c = e.target.closest('[data-v]'); if (!c) return;
      form.alasan = c.dataset.v; gambar();
    };
    q('#btnTambah').onclick = () => pilihProduk();

    view.querySelectorAll('[data-hapus]').forEach(b => b.onclick = () => { form.items.splice(+b.dataset.hapus, 1); gambar(); });
    const ubahQty = (idx, v) => {
      v = batasi(form.items[idx].produkId, v);
      if (v <= 0) form.items.splice(idx, 1); else form.items[idx].qty = v;
      gambar();
    };
    view.querySelectorAll('.stepper[data-idx] button').forEach(b => b.onclick = () => {
      const idx = +b.closest('[data-idx]').dataset.idx;
      ubahQty(idx, toNum(form.items[idx].qty) + toNum(b.dataset.d));
    });
    view.querySelectorAll('[data-qty]').forEach(inp => inp.onchange = () => ubahQty(+inp.dataset.qty, toNum(inp.value)));

    q('#btnSimpan').onclick = async () => {
      if (!form.items.length) return ingat('Belum ada barang');
      if (form.alasan === 'retur' && !form.penerima.trim()) return ingat('Isi nama supplier tujuan retur');
      const ya = await konfirmasi({
        judul: 'Simpan stok keluar?', ok: 'Ya, keluarkan',
        pesan: `<b>${num(unit)} unit</b> dikeluarkan dari gudang sebagai <b>${esc(a.label)}</b>.`,
      });
      if (!ya) return;
      try {
        const k = simpanKeluar(form);
        sukses(`${k.noRef} tersimpan, stok gudang berkurang`);
        pergi('keluar');
      } catch (e) {
        gagal(e.message);
      }
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
        const stok = stokGudang(p.id);
        return `<div class="row-item">
          <div class="avatar">${esc(p.kode.slice(0, 3))}</div>
          <div class="ri-main"><div class="ri-title">${esc(p.nama)}</div>
            <div class="ri-sub">stok gudang ${num(stok)} ${esc(p.satuan || '')}</div></div>
          <div class="ri-right">${di
            ? `<div class="stepper" style="width:126px"><button type="button" data-d="-1" data-p="${p.id}">−</button>
                <input type="number" inputmode="decimal" value="${num(di.qty)}" data-q="${p.id}">
                <button type="button" data-d="1" data-p="${p.id}">+</button></div>`
            : stok > 0 ? `<button class="btn btn-soft btn-sm" data-add="${p.id}">＋ Tambah</button>`
              : '<span class="muted xs">stok habis</span>'}</div></div>`;
      }).join('') : kosongState('🔍', 'Produk tidak ditemukan');
    };
    gambarList();
    h.body.querySelector('#cariP').addEventListener('input', debounce(e => gambarList(e.target.value), 150));
    const setQty = (id, qty) => {
      const idx = form.items.findIndex(i => i.produkId === id);
      qty = batasi(id, qty);
      if (qty <= 0) { if (idx >= 0) form.items.splice(idx, 1); }
      else if (idx >= 0) form.items[idx].qty = qty;
      gambarList(h.body.querySelector('#cariP').value);
    };
    listP.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) {
        form.items.push({ produkId: add.dataset.add, qty: 1 });
        return gambarList(h.body.querySelector('#cariP').value);
      }
      const b = e.target.closest('[data-p]');
      if (b) {
        const inp = listP.querySelector(`[data-q="${b.dataset.p}"]`);
        setQty(b.dataset.p, toNum(inp.value) + toNum(b.dataset.d));
      }
    });
    listP.addEventListener('change', e => {
      const inp = e.target.closest('[data-q]');
      if (inp) setQty(inp.dataset.q, toNum(inp.value));
    });
  }

  gambar();
}

export function render(view, params = []) {
  if (params[0] === 'baru' && bolehKelola()) return halamanBaru(view);
  return halamanDaftar(view);
}
