/* pages/konsinyasi.js — barang titipan ke agen & reseller */
import { db, get } from '../core/store.js';
import {
  simpanKonsinyasi, laporKonsinyasi, tutupKonsinyasi, tambahTitipan,
  hargaUntuk, stokGudang, stokKonsinyasi,
} from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, modal, konfirmasi, sukses, gagal, ingat,
  kosongState, statTile, badge, pasangRupiah, pilihItem, avatarEl,
} from '../core/ui.js';
import { tampilkanStruk } from '../core/struk.js';
import { segarkan, pergi } from '../core/router.js';
import {
  esc, rp, num, toNum, cocok, sum, debounce, fmtTgl, fmtTglPendek, sortBy,
  todayISO, tambahHari, selisihHari, round2,
} from '../core/utils.js';

let f = { q: '', status: 'aktif' };

const sisaItem = it => round2(toNum(it.qty) - toNum(it.terjual) - toNum(it.retur));
const sisaKons = k => round2(sum(k.items, sisaItem));
const nilaiSisa = k => round2(sum(k.items, it => sisaItem(it) * toNum(it.harga)));
const nilaiTerjual = k => round2(sum(k.items, it => toNum(it.terjual) * toNum(it.harga)));

/* =========================================================
   DAFTAR
   ========================================================= */
function halamanDaftar(view) {
  const semua = db.konsinyasi;
  const aktif = semua.filter(k => k.status === 'aktif');

  setJudul('Konsinyasi', `${aktif.length} titipan berjalan`);
  setTopbar([{ teks: 'Titip Barang', ikon: '＋', onClick: () => pergi('konsinyasi/baru') }]);
  setFab({ ikon: '＋', teks: 'Titip barang', onClick: () => pergi('konsinyasi/baru') });

  const totalSisa = sum(aktif, nilaiSisa);
  const unitSisa = sum(aktif, sisaKons);
  const belumSetor = sum(
    db.penjualan.filter(j => j.jenis === 'konsinyasi' && j.status !== 'batal'),
    j => Math.max(0, toNum(j.total) - toNum(j.dibayar)));

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: 'Titipan Berjalan', nilai: num(aktif.length), sub: `${num(unitSisa)} unit di mitra`, warna: 'violet', ikon: '🤝' })}
      ${statTile({ label: 'Nilai Barang Titipan', nilai: rp(totalSisa), sub: 'belum terjual', warna: 'info', ikon: '📦' })}
      ${statTile({ label: 'Belum Disetor', nilai: rp(belumSetor), sub: 'hasil konsinyasi', warna: belumSetor > 0 ? 'bad' : 'ok', ikon: '💵' })}
      ${statTile({ label: 'Total Titipan', nilai: num(semua.length), sub: 'seluruh riwayat', ikon: '📋' })}
    </div>

    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari mitra / no. titipan..." value="${esc(f.q)}"></div>
    </div>
    <div class="chips mb12" id="chipStatus">
      ${[['aktif', 'Berjalan'], ['selesai', 'Selesai'], ['tempo', 'Lewat Tempo'], ['semua', 'Semua']]
        .map(([v, t]) => `<button class="chip ${f.status === v ? 'active' : ''}" data-v="${v}">${t}</button>`).join('')}
    </div>
    <div class="card"><div class="list" id="daftar"></div></div>`;

  const box = view.querySelector('#daftar');
  const gambar = () => {
    let arr = semua.filter(k => {
      const m = get('mitra', k.mitraId);
      return cocok(`${k.noRef} ${m?.nama || ''} ${k.catatan || ''}`, f.q);
    });
    if (f.status === 'aktif') arr = arr.filter(k => k.status === 'aktif');
    if (f.status === 'selesai') arr = arr.filter(k => k.status === 'selesai');
    if (f.status === 'tempo') arr = arr.filter(k => k.status === 'aktif' && k.jatuhTempo && k.jatuhTempo < todayISO());
    arr = sortBy(arr, k => k.tanggal, true);

    if (!arr.length) {
      box.innerHTML = kosongState('🤝', 'Belum ada titipan',
        'Catat barang yang dititipkan ke agen atau reseller, lalu laporkan hasil penjualannya secara berkala.',
        '<a class="btn btn-primary" href="#/konsinyasi/baru">＋ Titip Barang</a>');
      return;
    }
    box.innerHTML = arr.map(k => {
      const m = get('mitra', k.mitraId);
      const sisa = sisaKons(k);
      const terjual = sum(k.items, it => toNum(it.terjual));
      const titip = sum(k.items, it => toNum(it.qty));
      const persen = titip > 0 ? terjual / titip * 100 : 0;
      const telat = k.status === 'aktif' && k.jatuhTempo && k.jatuhTempo < todayISO();
      return `<div class="row-item" data-id="${k.id}">
        ${avatarEl(m?.nama || '?', m?.tipe === 'agen' ? 'i' : 'v')}
        <div class="ri-main">
          <div class="ri-title">${esc(m?.nama || 'Mitra dihapus')}
            ${k.status === 'selesai' ? badge('Selesai', 'ok') : badge('Berjalan', 'violet')}
            ${telat ? badge('Lewat tempo', 'bad') : ''}
          </div>
          <div class="ri-sub">${esc(k.noRef)} · ${fmtTglPendek(k.tanggal)} · titip ${num(titip)} · terjual ${num(terjual)} · sisa ${num(sisa)}</div>
          <div class="bar" style="max-width:240px"><i class="${persen >= 80 ? 'ok' : persen >= 40 ? '' : 'warn'}" style="width:${Math.min(100, persen)}%"></i></div>
        </div>
        <div class="ri-right">
          <div class="ri-val">${rp(nilaiSisa(k))}</div>
          <div class="ri-note">sisa titipan</div>
        </div>
      </div>`;
    }).join('');
  };
  gambar();

  view.querySelector('#cari').addEventListener('input', debounce(e => { f.q = e.target.value; gambar(); }, 180));
  view.querySelector('#chipStatus').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    f.status = c.dataset.v;
    view.querySelectorAll('#chipStatus .chip').forEach(x => x.classList.toggle('active', x === c));
    gambar();
  });
  box.addEventListener('click', e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    pergi(`konsinyasi/detail/${row.dataset.id}`);
  });
}

/* =========================================================
   FORM TITIP BARANG
   ========================================================= */
function halamanBaru(view, mitraId = '') {
  const form = {
    tanggal: todayISO(),
    mitraId: mitraId || '',
    salesId: get('mitra', mitraId)?.salesId || '',
    jatuhTempo: tambahHari(todayISO(), 30),
    items: [],
    catatan: '',
  };

  setJudul('Titip Barang', 'Konsinyasi ke agen / reseller');
  setTopbar([{ teks: 'Kembali', ikon: '←', kelas: 'btn-ghost btn-sm', onClick: () => pergi('konsinyasi') }]);
  setFab(null);

  const mitraDari = () => (form.mitraId ? get('mitra', form.mitraId) : null);

  const gambar = () => {
    const m = mitraDari();
    const totalNilai = round2(sum(form.items, i => toNum(i.qty) * toNum(i.harga)));

    view.innerHTML = `
    <div class="trx-layout">
      <div>
        <div class="card">
          <div class="card-head"><h2>🏪 Mitra Penerima</h2>
            ${m ? badge(m.tipe === 'agen' ? 'Harga Agen' : 'Harga Reseller', m.tipe === 'agen' ? 'info' : 'violet') : ''}</div>
          <div class="card-body">
            <button class="btn btn-block" id="btnMitra" style="justify-content:flex-start;height:auto;padding:10px 12px;min-height:56px">
              ${avatarEl(m?.nama || '?', m?.tipe === 'agen' ? 'i' : 'v')}
              <span class="grow" style="text-align:left">
                <span style="display:block;font-weight:700">${esc(m?.nama || 'Pilih mitra…')}</span>
                <span class="xs muted">${m ? esc(m.kode) + ' · titipan berjalan ' + num(stokKonsinyasi(null, m.id)) + ' unit' : 'Ketuk untuk memilih agen / reseller'}</span>
              </span><span class="muted">▾</span>
            </button>
            <div class="form-row mt12">
              <div class="field mb0"><label>Sales</label>
                <select class="select" id="selSales">
                  <option value="">— Tanpa sales —</option>
                  ${db.sales.filter(s => s.aktif !== false).map(s =>
                    `<option value="${s.id}" ${s.id === form.salesId ? 'selected' : ''}>${esc(s.nama)}</option>`).join('')}
                </select></div>
              <div class="field mb0"><label>Tanggal Titip</label>
                <input class="input" type="date" id="tgl" value="${form.tanggal}"></div>
              <div class="field mb0"><label>Batas Laporan</label>
                <input class="input" type="date" id="tempo" value="${form.jatuhTempo}"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>📦 Barang Dititipkan</h2>
            <span class="muted xs">${form.items.length} item · ${num(sum(form.items, i => i.qty))} unit</span></div>
          <div class="card-body">
            ${form.items.length ? form.items.map((i, idx) => {
              const p = get('produk', i.produkId);
              const stok = stokGudang(i.produkId);
              return `<div class="cart-line">
                <div class="cl-main">
                  <div class="cl-name">${esc(p?.nama || '-')} ${toNum(i.qty) > stok ? badge('stok ' + num(stok), 'bad') : ''}</div>
                  <div class="cl-meta">${rp(i.harga)} / ${esc(p?.satuan || 'unit')} · stok gudang ${num(stok)}</div>
                  <div class="mt8"><div class="stepper" style="width:132px" data-idx="${idx}">
                    <button type="button" data-d="-1">−</button>
                    <input type="number" inputmode="decimal" value="${num(i.qty)}" data-qty="${idx}">
                    <button type="button" data-d="1">+</button></div></div>
                </div>
                <div class="cl-right">
                  <div class="b tabular">${rp(toNum(i.qty) * toNum(i.harga))}</div>
                  <button class="btn btn-xs btn-ghost mt8" data-hapus="${idx}">🗑️ hapus</button>
                </div></div>`;
            }).join('') : kosongState('📦', 'Belum ada barang', 'Tambahkan produk yang akan dititipkan.')}
          </div>
          <div class="card-foot"><button class="btn btn-soft btn-block" id="btnTambah">＋ Tambah Produk</button></div>
        </div>
      </div>

      <div class="kolom-kanan">
        <div class="card">
          <div class="card-head"><h2>📝 Ringkasan</h2></div>
          <div class="card-body">
            <div class="kv"><span class="k">Jumlah item</span><span class="v">${form.items.length}</span></div>
            <div class="kv"><span class="k">Total unit</span><span class="v">${num(sum(form.items, i => i.qty))}</span></div>
            <div class="kv total"><span class="k">Nilai Titipan</span><span class="v">${rp(totalNilai)}</span></div>
            <div class="field mt12 mb0"><label>Catatan</label>
              <textarea class="textarea" id="catatan" placeholder="Mis. laporan setiap 2 minggu">${esc(form.catatan)}</textarea></div>
            <div class="hint mt8">ℹ️ Barang keluar dari gudang saat dititipkan, namun <b>belum dihitung sebagai penjualan</b>. Penjualan tercatat ketika mitra melaporkan hasilnya.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="sticky-bar">
      <div class="sb-info"><div class="sb-lbl">Nilai titipan</div><div class="sb-val">${rp(totalNilai)}</div></div>
      <button class="btn btn-primary" id="btnSimpan" ${form.items.length && form.mitraId ? '' : 'disabled'}>✔ Simpan Titipan</button>
    </div>`;

    const q = s => view.querySelector(s);
    q('#btnMitra').onclick = async () => {
      const m = await pilihItem({
        judul: 'Pilih Mitra',
        items: sortBy(db.mitra.filter(x => x.aktif !== false), x => x.nama.toLowerCase()),
        cariPada: x => `${x.nama} ${x.kode} ${x.telp || ''}`,
        render: x => `${avatarEl(x.nama, x.tipe === 'agen' ? 'i' : 'v')}
          <div class="ri-main"><div class="ri-title">${esc(x.nama)} ${badge(x.tipe === 'agen' ? 'Agen' : 'Reseller', x.tipe === 'agen' ? 'info' : 'violet')}</div>
          <div class="ri-sub">${esc(x.kode)} · titipan ${num(stokKonsinyasi(null, x.id))} unit</div></div>`,
      });
      if (!m) return;
      form.mitraId = m.id;
      form.salesId = m.salesId || form.salesId;
      form.items.forEach(i => { i.harga = hargaUntuk(get('produk', i.produkId), m); });
      gambar();
    };

    q('#btnTambah').onclick = () => modalPilihProduk(form, mitraDari(), gambar);
    q('#selSales').onchange = e => { form.salesId = e.target.value; };
    q('#tgl').onchange = e => { form.tanggal = e.target.value || todayISO(); };
    q('#tempo').onchange = e => { form.jatuhTempo = e.target.value; };
    q('#catatan').oninput = e => { form.catatan = e.target.value; };

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

    q('#btnSimpan').onclick = async () => {
      if (!form.mitraId) return ingat('Pilih mitra penerima terlebih dahulu');
      if (!form.items.length) return ingat('Belum ada barang yang dititipkan');
      const kurang = form.items.filter(i => toNum(i.qty) > stokGudang(i.produkId));
      if (kurang.length) {
        const ya = await konfirmasi({
          judul: '⚠️ Stok gudang kurang',
          pesan: kurang.map(i => `<b>${esc(get('produk', i.produkId)?.nama)}</b>: titip ${num(i.qty)}, stok ${num(stokGudang(i.produkId))}`).join('<br>')
            + '<br><br>Lanjutkan? Stok gudang akan menjadi minus.',
          ok: 'Tetap simpan', bahaya: true,
        });
        if (!ya) return;
      }
      const k = simpanKonsinyasi(form);
      sukses(`Titipan ${k.noRef} tersimpan`);
      pergi(`konsinyasi/detail/${k.id}`);
    };
  };
  gambar();
}

/** pemilih produk untuk form titipan */
function modalPilihProduk(form, mitra, onTutup) {
  const h = modal({
    judul: 'Tambah Produk',
    isi: `<div class="toolbar" style="margin-bottom:10px">
        <div class="search-wrap grow"><input class="input" id="cariP" placeholder="Cari produk..." autocomplete="off"></div></div>
      <div class="card"><div class="list" id="listP"></div></div>`,
    tombol: [{ teks: 'Selesai', kelas: 'btn-primary', aksi: x => x.tutup() }],
    onTutup,
  });
  const listP = h.body.querySelector('#listP');
  const gambarList = (q = '') => {
    const arr = sortBy(db.produk.filter(p => p.aktif !== false && cocok(`${p.nama} ${p.kode} ${p.merk}`, q)), p => p.nama.toLowerCase());
    listP.innerHTML = arr.length ? arr.map(p => {
      const di = form.items.find(i => i.produkId === p.id);
      return `<div class="row-item">
        <div class="avatar">${esc(p.kode.slice(0, 3))}</div>
        <div class="ri-main"><div class="ri-title">${esc(p.nama)}</div>
          <div class="ri-sub">${rp(hargaUntuk(p, mitra))} · stok ${num(stokGudang(p.id))}</div></div>
        <div class="ri-right">${di
          ? `<div class="stepper" style="width:126px"><button type="button" data-d="-1" data-p="${p.id}">−</button>
              <input type="number" inputmode="decimal" value="${num(di.qty)}" data-q="${p.id}">
              <button type="button" data-d="1" data-p="${p.id}">+</button></div>`
          : `<button class="btn btn-soft btn-sm" data-add="${p.id}">＋ Tambah</button>`}</div>
      </div>`;
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
      form.items.push({ produkId: p.id, qty: 1, harga: hargaUntuk(p, mitra) });
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

/* =========================================================
   DETAIL TITIPAN
   ========================================================= */
function halamanDetail(view, id) {
  const k = get('konsinyasi', id);
  if (!k) {
    view.innerHTML = kosongState('❓', 'Titipan tidak ditemukan', '', '<a class="btn btn-primary" href="#/konsinyasi">Kembali</a>');
    return;
  }
  const m = get('mitra', k.mitraId);
  const sales = k.salesId ? get('sales', k.salesId) : null;
  const notaTerkait = db.penjualan.filter(j => j.konsinyasiId === k.id && j.status !== 'batal');
  const telat = k.status === 'aktif' && k.jatuhTempo && k.jatuhTempo < todayISO();

  setJudul(k.noRef, `Titipan ke ${m?.nama || '-'}`);
  setTopbar([{ teks: 'Kembali', ikon: '←', kelas: 'btn-ghost btn-sm', onClick: () => pergi('konsinyasi') }]);
  setFab(k.status === 'aktif' ? { ikon: '📝', teks: 'Lapor penjualan', onClick: () => modalLapor(k) } : null);

  view.innerHTML = `
    <div class="flex flex-wrap mb12">
      ${badge(fmtTgl(k.tanggal))}
      ${k.status === 'selesai' ? badge('Selesai', 'ok') : badge('Berjalan', 'violet')}
      ${telat ? badge(`Lewat tempo ${selisihHari(k.jatuhTempo)} hari`, 'bad') : k.jatuhTempo ? badge('Tempo ' + fmtTgl(k.jatuhTempo)) : ''}
      ${sales ? badge('Sales: ' + sales.nama) : ''}
    </div>

    <div class="grid g4 mb12">
      ${statTile({ label: 'Dititipkan', nilai: num(sum(k.items, i => i.qty)), sub: 'unit', ikon: '📦' })}
      ${statTile({ label: 'Terjual', nilai: num(sum(k.items, i => i.terjual)), sub: rp(nilaiTerjual(k)), warna: 'ok', ikon: '💰' })}
      ${statTile({ label: 'Diretur', nilai: num(sum(k.items, i => i.retur)), sub: 'kembali ke gudang', warna: 'warn', ikon: '↩️' })}
      ${statTile({ label: 'Sisa di Mitra', nilai: num(sisaKons(k)), sub: rp(nilaiSisa(k)), warna: 'violet', ikon: '🤝' })}
    </div>

    <div class="card mb12">
      <div class="card-head"><h2>Rincian Barang</h2></div>
      <div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Produk</th><th class="num">Harga</th><th class="num">Titip</th><th class="num">Terjual</th><th class="num">Retur</th><th class="num">Sisa</th><th class="num">Nilai Sisa</th></tr></thead>
        <tbody>${k.items.map(it => {
          const p = get('produk', it.produkId);
          return `<tr>
            <td data-l="Produk"><span class="strong">${esc(p?.nama || '-')}</span></td>
            <td data-l="Harga" class="num"><span>${rp(it.harga)}</span></td>
            <td data-l="Titip" class="num"><span>${num(it.qty)}</span></td>
            <td data-l="Terjual" class="num"><span class="pos">${num(it.terjual)}</span></td>
            <td data-l="Retur" class="num"><span>${num(it.retur)}</span></td>
            <td data-l="Sisa" class="num strong"><span>${num(sisaItem(it))}</span></td>
            <td data-l="Nilai Sisa" class="num"><span>${rp(sisaItem(it) * toNum(it.harga))}</span></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr>
          <td>Total</td><td></td>
          <td class="num">${num(sum(k.items, i => i.qty))}</td>
          <td class="num">${num(sum(k.items, i => i.terjual))}</td>
          <td class="num">${num(sum(k.items, i => i.retur))}</td>
          <td class="num">${num(sisaKons(k))}</td>
          <td class="num">${rp(nilaiSisa(k))}</td>
        </tr></tfoot>
      </table></div>
    </div>

    ${k.catatan ? `<div class="card mb12"><div class="card-body"><div class="lbl-t">Catatan</div><div class="sm">${esc(k.catatan)}</div></div></div>` : ''}

    ${notaTerkait.length ? `
      <div class="section-title">Setoran / Nota Terkait (${notaTerkait.length})</div>
      <div class="card mb12"><div class="list">
        ${notaTerkait.map(j => {
          const sisa = toNum(j.total) - toNum(j.dibayar);
          return `<div class="row-item" data-nota="${j.id}">
            <div class="avatar">🧾</div>
            <div class="ri-main"><div class="ri-title">${esc(j.noRef)} ${sisa > 0 ? badge('Belum lunas', 'warn') : badge('Lunas', 'ok')}</div>
              <div class="ri-sub">${fmtTgl(j.tanggal)} · ${num(sum(j.items, i => i.qty))} unit</div></div>
            <div class="ri-right"><div class="ri-val">${rp(j.total)}</div>
              ${sisa > 0 ? `<div class="ri-note neg">sisa ${rp(sisa)}</div>` : ''}</div>
          </div>`;
        }).join('')}
      </div></div>` : ''}

    ${k.status === 'aktif' ? `
      <div class="btn-row">
        <button class="btn btn-primary grow" id="btnLapor">📝 Lapor Hasil Penjualan</button>
        <button class="btn" id="btnTambah">＋ Tambah Titipan</button>
        <button class="btn btn-danger" id="btnTutup">✔ Tutup & Retur Sisa</button>
      </div>` : ''}`;

  view.querySelector('#btnLapor')?.addEventListener('click', () => modalLapor(k));
  view.querySelector('#btnTambah')?.addEventListener('click', () => modalTambahTitipan(k));
  view.querySelector('#btnTutup')?.addEventListener('click', async () => {
    const sisa = sisaKons(k);
    const ya = await konfirmasi({
      judul: 'Tutup titipan?',
      pesan: sisa > 0
        ? `Sisa <b>${num(sisa)} unit</b> senilai ${rp(nilaiSisa(k))} akan diretur ke gudang dan titipan ditutup.`
        : 'Titipan ini akan ditandai selesai.',
      ok: 'Ya, tutup',
    });
    if (ya) { tutupKonsinyasi(k.id, true); sukses('Titipan ditutup, sisa diretur ke gudang'); segarkan(); }
  });
  view.querySelectorAll('[data-nota]').forEach(el => el.onclick = () => {
    const j = get('penjualan', el.dataset.nota);
    if (j) tampilkanStruk(j);
  });
}

/* ---------- lapor hasil penjualan ---------- */
function modalLapor(k) {
  const m = get('mitra', k.mitraId);
  const tersedia = k.items.filter(it => sisaItem(it) > 0);
  if (!tersedia.length) return ingat('Tidak ada sisa titipan untuk dilaporkan');

  const h = modal({
    judul: 'Lapor Hasil Konsinyasi', lebar: 'wide',
    isi: `
      <div class="hint mb12">Isi jumlah yang <b>terjual</b> dan yang <b>diretur</b> untuk setiap produk. Barang terjual otomatis menjadi transaksi penjualan${k.salesId ? ' dan komisi sales' : ''}.</div>
      <div class="card mb12"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Produk</th><th class="num">Sisa</th><th class="num" style="width:96px">Terjual</th><th class="num" style="width:96px">Retur</th></tr></thead>
        <tbody>${tersedia.map((it, i) => {
          const p = get('produk', it.produkId);
          return `<tr data-row="${i}" data-pid="${it.produkId}">
            <td><div class="strong sm">${esc(p?.nama || '-')}</div><div class="xs muted">${rp(it.harga)}/${esc(p?.satuan || 'unit')}</div></td>
            <td class="num">${num(sisaItem(it))}</td>
            <td class="num"><input class="input num" type="number" inputmode="decimal" min="0" max="${sisaItem(it)}" value="0" data-jual style="min-height:38px;padding:6px 8px"></td>
            <td class="num"><input class="input num" type="number" inputmode="decimal" min="0" max="${sisaItem(it)}" value="0" data-retur style="min-height:38px;padding:6px 8px"></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="card-body">
        <button class="btn btn-sm btn-soft btn-block" id="semuaTerjual">Tandai semua sisa sebagai terjual</button>
      </div></div>

      <div class="card mb12"><div class="card-body">
        <div class="form-row">
          <div class="field mb0"><label>Tanggal Laporan</label><input class="input" type="date" id="tgl" value="${todayISO()}"></div>
          <div class="field mb0"><label>Diskon / Potongan</label><input class="input num" id="diskon" inputmode="numeric" data-rupiah placeholder="0"></div>
        </div>
        <div class="lbl-t mt12">Setoran Uang</div>
        <div class="seg" id="segBayar">
          <button type="button" data-v="tunai" class="active">💵 Disetor Lunas</button>
          <button type="button" data-v="kredit">📌 Belum / Sebagian</button>
        </div>
        <div class="form-row mt12" id="boxKredit" hidden>
          <div class="field mb0"><label>Jumlah Disetor</label><input class="input num" id="dibayar" inputmode="numeric" data-rupiah placeholder="0"></div>
          <div class="field mb0"><label>Jatuh Tempo</label><input class="input" type="date" id="tempo" value="${tambahHari(todayISO(), toNum(m?.tempoHari) || 14)}"></div>
        </div>
        <div class="divider"></div>
        <div class="kv total"><span class="k">Nilai Terjual</span><span class="v" id="nilaiJual">${rp(0)}</span></div>
      </div></div>`,
    tombol: [
      { teks: 'Batal', kelas: 'btn-ghost' },
      { teks: '✔ Proses Laporan', kelas: 'btn-primary', aksi: proses },
    ],
    onBuka: body => pasangRupiah(body),
  });

  let bayar = 'tunai';
  const body = h.body;

  const hitung = () => {
    let nilai = 0;
    body.querySelectorAll('[data-row]').forEach((tr, i) => {
      const it = tersedia[i];
      const jual = Math.min(toNum(tr.querySelector('[data-jual]').value), sisaItem(it));
      nilai += jual * toNum(it.harga);
    });
    nilai = Math.max(0, nilai - toNum(body.querySelector('#diskon').value));
    body.querySelector('#nilaiJual').textContent = rp(nilai);
    return nilai;
  };

  body.addEventListener('input', hitung);
  body.querySelector('#semuaTerjual').onclick = () => {
    body.querySelectorAll('[data-row]').forEach((tr, i) => {
      tr.querySelector('[data-jual]').value = sisaItem(tersedia[i]);
      tr.querySelector('[data-retur]').value = 0;
    });
    hitung();
  };
  body.querySelector('#segBayar').onclick = e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    bayar = b.dataset.v;
    body.querySelectorAll('#segBayar button').forEach(x => x.classList.toggle('active', x === b));
    body.querySelector('#boxKredit').hidden = bayar === 'tunai';
  };

  function proses(handle) {
    const baris = [];
    body.querySelectorAll('[data-row]').forEach((tr, i) => {
      const it = tersedia[i];
      const jual = Math.max(0, Math.min(toNum(tr.querySelector('[data-jual]').value), sisaItem(it)));
      const retur = Math.max(0, Math.min(toNum(tr.querySelector('[data-retur]').value), sisaItem(it) - jual));
      if (jual > 0 || retur > 0) baris.push({ produkId: it.produkId, terjual: jual, retur });
    });
    if (!baris.length) return gagal('Isi minimal satu jumlah terjual atau retur');

    const hasil = laporKonsinyasi(k.id, baris, {
      tanggal: body.querySelector('#tgl').value || todayISO(),
      diskon: toNum(body.querySelector('#diskon').value),
      bayar,
      dibayar: bayar === 'kredit' ? toNum(body.querySelector('#dibayar')?.value) : undefined,
      jatuhTempo: bayar === 'kredit' ? body.querySelector('#tempo')?.value : '',
      metode: 'tunai',
    });
    handle.tutup();
    sukses('Laporan konsinyasi diproses');
    if (hasil?.penjualan) tampilkanStruk(hasil.penjualan, { onTutup: () => segarkan() });
    else segarkan();
  }
}

/* ---------- tambah titipan pada konsinyasi berjalan ---------- */
function modalTambahTitipan(k) {
  const m = get('mitra', k.mitraId);
  const form = { items: [] };
  const h = modal({
    judul: 'Tambah Titipan',
    isi: `<div id="isi"></div>`,
    tombol: [
      { teks: 'Batal', kelas: 'btn-ghost' },
      {
        teks: 'Simpan', kelas: 'btn-primary', aksi: x => {
          if (!form.items.length) return gagal('Belum ada produk dipilih');
          tambahTitipan(k.id, form.items);
          x.tutup(); sukses('Titipan ditambahkan'); segarkan();
        },
      },
    ],
  });
  const gambar = () => {
    h.body.querySelector('#isi').innerHTML = `
      ${form.items.length ? form.items.map((i, idx) => {
        const p = get('produk', i.produkId);
        return `<div class="cart-line"><div class="cl-main">
          <div class="cl-name">${esc(p?.nama)}</div>
          <div class="cl-meta">${rp(i.harga)} · stok ${num(stokGudang(i.produkId))}</div>
          <div class="mt8"><div class="stepper" style="width:132px" data-idx="${idx}">
            <button type="button" data-d="-1">−</button>
            <input type="number" inputmode="decimal" value="${num(i.qty)}" data-qty="${idx}">
            <button type="button" data-d="1">+</button></div></div>
        </div><div class="cl-right"><div class="b">${rp(toNum(i.qty) * toNum(i.harga))}</div></div></div>`;
      }).join('') : kosongState('📦', 'Belum ada produk dipilih')}
      <button class="btn btn-soft btn-block mt12" id="pilihP">＋ Pilih Produk</button>`;

    h.body.querySelector('#pilihP').onclick = () => modalPilihProduk(form, m, gambar);
    h.body.querySelectorAll('.stepper[data-idx] button').forEach(b => b.onclick = () => {
      const idx = +b.closest('[data-idx]').dataset.idx;
      const v = Math.max(0, toNum(form.items[idx].qty) + toNum(b.dataset.d));
      if (v <= 0) form.items.splice(idx, 1); else form.items[idx].qty = v;
      gambar();
    });
  };
  gambar();
}

/* =========================================================
   ENTRY
   ========================================================= */
export function render(view, params = []) {
  const [mode, arg] = params;
  if (mode === 'baru') return halamanBaru(view, arg || '');
  if (mode === 'detail' && arg) return halamanDetail(view, arg);
  return halamanDaftar(view);
}
