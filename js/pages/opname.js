/* pages/opname.js — stok opname (pencocokan stok fisik vs sistem) */
import { db, get } from '../core/store.js';
import { simpanOpname, stokGudang, stokKonsinyasi } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, modal, konfirmasi, sukses, ingat, kosongState, statTile, badge,
} from '../core/ui.js';
import { pergi } from '../core/router.js';
import {
  esc, rp, num, toNum, cocok, sum, debounce, fmtTgl, fmtTglPendek, sortBy, todayISO, round2, unduh, toCSV,
} from '../core/utils.js';

/* =========================================================
   DAFTAR RIWAYAT
   ========================================================= */
function halamanDaftar(view) {
  setJudul('Stok Opname', `${db.opname.length} riwayat opname`);
  setTopbar([{ teks: 'Opname Baru', ikon: '＋', onClick: () => pergi('opname/baru') }]);
  setFab({ ikon: '📋', teks: 'Opname baru', onClick: () => pergi('opname/baru') });

  const terakhir = db.opname[0];
  const selisihTerakhir = terakhir ? terakhir.nilaiSelisih : 0;

  view.innerHTML = `
    <div class="grid g3 mb12">
      ${statTile({ label: 'Opname Terakhir', nilai: terakhir ? fmtTglPendek(terakhir.tanggal) : '—', sub: terakhir ? terakhir.noRef : 'belum pernah', ikon: '📋' })}
      ${statTile({
        label: 'Selisih Terakhir', nilai: rp(Math.abs(selisihTerakhir)),
        sub: selisihTerakhir < 0 ? 'kekurangan fisik' : selisihTerakhir > 0 ? 'kelebihan fisik' : 'sesuai',
        warna: selisihTerakhir < 0 ? 'bad' : selisihTerakhir > 0 ? 'warn' : 'ok', ikon: '⚖️',
      })}
      ${statTile({ label: 'Total Susut', nilai: rp(sum(db.opname, o => Math.max(0, -toNum(o.nilaiSelisih)))), sub: 'akumulasi kekurangan', warna: 'bad', ikon: '📉' })}
    </div>

    <div class="card mb12"><div class="card-body">
      <div class="flex between flex-wrap" style="gap:10px">
        <div><div class="b sm">Apa itu stok opname?</div>
          <div class="xs muted" style="max-width:520px">Menghitung stok fisik di gudang lalu membandingkannya dengan catatan sistem.
          Selisihnya dicatat sebagai penyesuaian sehingga laporan stok dan laba tetap akurat.</div></div>
        <button class="btn btn-primary" id="mulai">📋 Mulai Opname</button>
      </div>
    </div></div>

    <div class="section-title">Riwayat Opname</div>
    <div class="card"><div class="list" id="daftar"></div></div>`;

  view.querySelector('#mulai').onclick = () => pergi('opname/baru');

  const box = view.querySelector('#daftar');
  if (!db.opname.length) {
    box.innerHTML = kosongState('📋', 'Belum ada opname',
      'Lakukan stok opname berkala agar catatan stok selalu sesuai dengan barang di gudang.');
  } else {
    box.innerHTML = sortBy(db.opname, o => o.tanggal, true).map(o => {
      const beda = o.items.filter(i => i.selisih !== 0).length;
      return `<div class="row-item" data-id="${o.id}">
        <div class="avatar ${o.nilaiSelisih < 0 ? 'w' : ''}">📋</div>
        <div class="ri-main">
          <div class="ri-title">${esc(o.noRef)}
            ${beda === 0 ? badge('Sesuai', 'ok') : badge(`${beda} selisih`, o.nilaiSelisih < 0 ? 'bad' : 'warn')}</div>
          <div class="ri-sub">${fmtTgl(o.tanggal)} · ${o.items.length} produk diperiksa${o.petugas ? ' · ' + esc(o.petugas) : ''}</div>
        </div>
        <div class="ri-right">
          <div class="ri-val ${o.nilaiSelisih < 0 ? 'neg' : o.nilaiSelisih > 0 ? 'pos' : ''}">${o.nilaiSelisih === 0 ? '—' : rp(o.nilaiSelisih)}</div>
          <div class="ri-note">nilai selisih</div>
        </div>
      </div>`;
    }).join('');
    box.addEventListener('click', e => {
      const row = e.target.closest('[data-id]'); if (!row) return;
      const o = get('opname', row.dataset.id);
      if (o) detail(o);
    });
  }
}

function detail(o) {
  const beda = o.items.filter(i => i.selisih !== 0);
  modal({
    judul: o.noRef, lebar: 'wide',
    isi: `
      <div class="flex flex-wrap mb12">
        ${badge(fmtTgl(o.tanggal))}
        ${o.petugas ? badge('Petugas: ' + o.petugas) : ''}
        ${badge(`${o.items.length} produk`, 'info')}
        ${beda.length ? badge(`${beda.length} selisih`, 'warn') : badge('Semua sesuai', 'ok')}
      </div>
      ${o.catatan ? `<div class="card mb12"><div class="card-body sm">${esc(o.catatan)}</div></div>` : ''}
      <div class="grid g3 mb12">
        ${statTile({ label: 'Kelebihan', nilai: rp(sum(o.items.filter(i => i.selisih > 0), i => i.selisih * i.hargaBeli)), warna: 'ok' })}
        ${statTile({ label: 'Kekurangan', nilai: rp(sum(o.items.filter(i => i.selisih < 0), i => -i.selisih * i.hargaBeli)), warna: 'bad' })}
        ${statTile({ label: 'Selisih Bersih', nilai: rp(o.nilaiSelisih), warna: o.nilaiSelisih < 0 ? 'bad' : 'ok' })}
      </div>
      <div class="card"><div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Produk</th><th class="num">Sistem</th><th class="num">Fisik</th><th class="num">Selisih</th><th class="num">Nilai</th></tr></thead>
        <tbody>${(beda.length ? beda : o.items).map(i => {
          const p = get('produk', i.produkId);
          return `<tr>
            <td data-l="Produk"><span>${esc(p?.nama || '-')}</span></td>
            <td data-l="Sistem" class="num"><span>${num(i.sistem)}</span></td>
            <td data-l="Fisik" class="num"><span>${num(i.fisik)}</span></td>
            <td data-l="Selisih" class="num strong"><span class="${i.selisih < 0 ? 'neg' : i.selisih > 0 ? 'pos' : ''}">${i.selisih > 0 ? '+' : ''}${num(i.selisih)}</span></td>
            <td data-l="Nilai" class="num"><span class="${i.selisih < 0 ? 'neg' : ''}">${rp(i.selisih * i.hargaBeli)}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div></div>`,
    tombol: [
      {
        teks: '⬇️ Ekspor CSV', kelas: 'btn-ghost', aksi: () => {
          unduh(`opname-${o.noRef.replace(/\//g, '-')}.csv`, toCSV(o.items.map(i => ({
            Produk: get('produk', i.produkId)?.nama || '', Sistem: i.sistem, Fisik: i.fisik,
            Selisih: i.selisih, HargaBeli: i.hargaBeli, NilaiSelisih: i.selisih * i.hargaBeli,
          }))), 'text/csv');
          sukses('Data opname diekspor');
        },
      },
      { teks: 'Tutup', kelas: 'btn-primary' },
    ],
  });
}

/* =========================================================
   FORM OPNAME
   ========================================================= */
function halamanBaru(view) {
  const produk = sortBy(db.produk.filter(p => p.aktif !== false), p => p.nama.toLowerCase());
  if (!produk.length) {
    view.innerHTML = kosongState('🚬', 'Belum ada produk', 'Tambahkan produk terlebih dahulu.',
      '<a class="btn btn-primary" href="#/produk">Kelola Produk</a>');
    return;
  }

  const form = {
    tanggal: todayISO(),
    petugas: '',
    catatan: '',
    fisik: Object.fromEntries(produk.map(p => [p.id, null])), // null = belum dihitung
    q: '',
  };

  setJudul('Stok Opname Baru', 'Isi jumlah fisik hasil hitung gudang');
  setTopbar([{ teks: 'Kembali', ikon: '←', kelas: 'btn-ghost btn-sm', onClick: () => pergi('opname') }]);
  setFab(null);

  const hitung = () => {
    let selisihNilai = 0, jumlahBeda = 0, terisi = 0;
    produk.forEach(p => {
      const f = form.fisik[p.id];
      if (f === null || f === '') return;
      terisi++;
      const s = round2(toNum(f) - stokGudang(p.id));
      if (s !== 0) { jumlahBeda++; selisihNilai += s * toNum(p.hargaBeli); }
    });
    return { selisihNilai: round2(selisihNilai), jumlahBeda, terisi };
  };

  const gambar = () => {
    const { selisihNilai, jumlahBeda, terisi } = hitung();
    view.innerHTML = `
      <div class="card mb12"><div class="card-body">
        <div class="form-row">
          <div class="field mb0"><label>Tanggal Opname</label><input class="input" type="date" id="tgl" value="${form.tanggal}"></div>
          <div class="field mb0"><label>Petugas</label><input class="input" id="petugas" value="${esc(form.petugas)}" placeholder="Nama petugas"></div>
          <div class="field mb0" style="grid-column:1/-1"><label>Catatan</label>
            <input class="input" id="catatan" value="${esc(form.catatan)}" placeholder="Mis. opname akhir bulan"></div>
        </div>
      </div></div>

      <div class="grid g3 mb12">
        ${statTile({ label: 'Sudah Dihitung', nilai: `${num(terisi)}/${num(produk.length)}`, sub: 'produk', ikon: '✅' })}
        ${statTile({ label: 'Produk Berselisih', nilai: num(jumlahBeda), sub: jumlahBeda ? 'perlu penyesuaian' : 'sesuai catatan', warna: jumlahBeda ? 'warn' : 'ok', ikon: '⚖️' })}
        ${statTile({ label: 'Nilai Selisih', nilai: rp(selisihNilai), sub: selisihNilai < 0 ? 'kekurangan' : selisihNilai > 0 ? 'kelebihan' : 'nihil', warna: selisihNilai < 0 ? 'bad' : selisihNilai > 0 ? 'warn' : 'ok', ikon: '💸' })}
      </div>

      <div class="toolbar">
        <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari produk..." value="${esc(form.q)}"></div>
        <button class="btn btn-sm" id="samakan">Samakan semua</button>
        <button class="btn btn-sm btn-ghost" id="kosongkan">Kosongkan</button>
      </div>

      <div class="card"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Produk</th><th class="num">Sistem</th><th class="num" style="width:110px">Fisik</th><th class="num">Selisih</th></tr></thead>
        <tbody id="tbody"></tbody>
      </table></div></div>

      <div class="sticky-bar">
        <div class="sb-info"><div class="sb-lbl">${jumlahBeda} produk berselisih</div>
          <div class="sb-val ${selisihNilai < 0 ? 'neg' : ''}">${rp(selisihNilai)}</div></div>
        <button class="btn btn-primary" id="btnSimpan" ${terisi ? '' : 'disabled'}>✔ Simpan Opname</button>
      </div>`;

    gambarBaris();

    const q = s => view.querySelector(s);
    q('#tgl').onchange = e => { form.tanggal = e.target.value || todayISO(); };
    q('#petugas').oninput = e => { form.petugas = e.target.value; };
    q('#catatan').oninput = e => { form.catatan = e.target.value; };
    q('#cari').addEventListener('input', debounce(e => { form.q = e.target.value; gambarBaris(); }, 180));
    q('#samakan').onclick = () => { produk.forEach(p => { form.fisik[p.id] = stokGudang(p.id); }); gambar(); };
    q('#kosongkan').onclick = () => { produk.forEach(p => { form.fisik[p.id] = null; }); gambar(); };
    q('#btnSimpan').onclick = simpan;
  };

  const gambarBaris = () => {
    const tbody = view.querySelector('#tbody');
    const arr = produk.filter(p => cocok(`${p.nama} ${p.kode} ${p.merk}`, form.q));
    tbody.innerHTML = arr.length ? arr.map(p => {
      const sistem = stokGudang(p.id);
      const f = form.fisik[p.id];
      const ada = f !== null && f !== '';
      const selisih = ada ? round2(toNum(f) - sistem) : 0;
      const titip = stokKonsinyasi(p.id);
      return `<tr>
        <td><div class="strong sm">${esc(p.nama)}</div>
          <div class="xs muted">${esc(p.kode)}${titip > 0 ? ` · ${num(titip)} di mitra` : ''}</div></td>
        <td class="num">${num(sistem)}</td>
        <td class="num"><input class="input num" type="number" inputmode="decimal" min="0" step="any"
             data-fisik="${p.id}" value="${ada ? f : ''}" placeholder="—" style="min-height:38px;padding:6px 8px"></td>
        <td class="num strong ${selisih < 0 ? 'neg' : selisih > 0 ? 'pos' : 'muted'}">
          ${ada ? (selisih > 0 ? '+' : '') + num(selisih) : '—'}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="4">${kosongState('🔍', 'Produk tidak ditemukan')}</td></tr>`;

    tbody.querySelectorAll('[data-fisik]').forEach(inp => {
      inp.oninput = debounce(() => {
        form.fisik[inp.dataset.fisik] = inp.value === '' ? null : Math.max(0, toNum(inp.value));
        perbaruiRingkas();
        const tr = inp.closest('tr');
        const sistem = stokGudang(inp.dataset.fisik);
        const ada = inp.value !== '';
        const s = ada ? round2(toNum(inp.value) - sistem) : 0;
        const sel = tr.lastElementChild;
        sel.textContent = ada ? (s > 0 ? '+' : '') + num(s) : '—';
        sel.className = `num strong ${s < 0 ? 'neg' : s > 0 ? 'pos' : 'muted'}`;
      }, 250);
    });
  };

  const perbaruiRingkas = () => {
    const { selisihNilai, jumlahBeda, terisi } = hitung();
    const bar = view.querySelector('.sticky-bar');
    if (!bar) return;
    bar.querySelector('.sb-lbl').textContent = `${jumlahBeda} produk berselisih`;
    const val = bar.querySelector('.sb-val');
    val.textContent = rp(selisihNilai);
    val.className = `sb-val ${selisihNilai < 0 ? 'neg' : ''}`;
    bar.querySelector('#btnSimpan').disabled = !terisi;
  };

  async function simpan() {
    const items = produk
      .filter(p => form.fisik[p.id] !== null && form.fisik[p.id] !== '')
      .map(p => ({ produkId: p.id, sistem: stokGudang(p.id), fisik: toNum(form.fisik[p.id]) }));
    if (!items.length) return ingat('Belum ada produk yang dihitung');

    const beda = items.filter(i => round2(i.fisik - i.sistem) !== 0);
    const nilai = round2(sum(beda, i => (i.fisik - i.sistem) * toNum(get('produk', i.produkId)?.hargaBeli)));

    const ya = await konfirmasi({
      judul: 'Simpan hasil opname?',
      pesan: beda.length
        ? `<b>${beda.length}</b> produk berselisih dengan nilai <b class="${nilai < 0 ? 'neg' : ''}">${rp(nilai)}</b>.<br><br>
           Stok sistem akan disesuaikan mengikuti hasil hitung fisik. Tindakan ini tidak dapat dibatalkan.`
        : `Semua ${items.length} produk sesuai dengan catatan sistem. Simpan sebagai bukti opname?`,
      ok: 'Ya, simpan',
    });
    if (!ya) return;

    const o = simpanOpname({ ...form, items });
    sukses(`Opname ${o.noRef} tersimpan`);
    pergi('opname');
  }

  gambar();
}

export function render(view, params = []) {
  if (params[0] === 'baru') return halamanBaru(view);
  return halamanDaftar(view);
}
