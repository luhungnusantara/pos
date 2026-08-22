/* pages/stok.js — ringkasan stok & kartu stok per produk */
import { db, get } from '../core/store.js';
import { stokKonsinyasi, nilaiPersediaan, produkMenipis, TIPE_MUTASI, rincianKonsinyasi } from '../core/domain.js';
import { setJudul, setTopbar, setFab, kosongState, statTile, badge, sukses, gagal } from '../core/ui.js';
import { htmlPeriode, pasangPeriode, hitungPeriode } from '../core/periode.js';
import { segarkan, pergi } from '../core/router.js';
import { isOwner, bolehLihatModal } from '../core/peran.js';
import {
  esc, rp, num, toNum, cocok, sum, debounce, fmtTglPendek, sortBy, todayISO, unduh, toCSV,
} from '../core/utils.js';

let f = { q: '', tampil: 'semua', kode: '30hari', dari: todayISO(), sampai: todayISO() };

/* =========================================================
   RINGKASAN STOK
   ========================================================= */
function halamanRingkas(view) {
  const menipis = produkMenipis();
  const titipTotal = stokKonsinyasi();

  setJudul('Stok', bolehLihatModal()
    ? `${db.produk.length} produk · nilai ${rp(nilaiPersediaan())}`
    : `${db.produk.length} produk terdaftar`);
  setTopbar([
    { teks: 'Ekspor', ikon: '⬇️', kelas: 'btn-ghost btn-sm', onClick: eksporStok },
    ...(isOwner() ? [{ teks: 'Opname', ikon: '📋', onClick: () => pergi('opname/baru') }] : []),
  ]);
  setFab(isOwner() ? { ikon: '📥', teks: 'Stok masuk', onClick: () => pergi('pembelian/baru') } : null);

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${bolehLihatModal()
        ? statTile({ label: 'Nilai Persediaan', nilai: rp(nilaiPersediaan()), sub: 'gudang (harga beli)', warna: 'info', ikon: '📦' })
        : statTile({ label: 'Produk Aktif', nilai: num(db.produk.filter(p => p.aktif !== false).length), sub: 'siap dijual', warna: 'info', ikon: '🚬' })}
      ${statTile({ label: 'Stok Gudang', nilai: num(sum(db.produk, p => p.stok)), sub: 'unit', ikon: '🏬' })}
      ${statTile({ label: 'Di Mitra', nilai: num(titipTotal), sub: 'barang konsinyasi', warna: 'violet', ikon: '🤝' })}
      ${statTile({ label: 'Stok Menipis', nilai: num(menipis.length), sub: menipis.length ? 'segera restok' : 'aman', warna: menipis.length ? 'bad' : 'ok', ikon: '⚠️' })}
    </div>

    ${menipis.length ? `
      <div class="card mb12" style="border-color:var(--warn)">
        <div class="card-head"><h2>⚠️ Perlu Segera Restok</h2>
          ${isOwner() ? '<a class="btn btn-sm btn-soft" href="#/pembelian/baru">📥 Buat Pembelian</a>' : ''}</div>
        <div class="list">
          ${menipis.slice(0, 6).map(p => `<div class="row-item" data-id="${p.id}">
            <div class="avatar w">${esc(p.kode.slice(0, 3))}</div>
            <div class="ri-main"><div class="ri-title">${esc(p.nama)}</div>
              <div class="ri-sub">minimum ${num(p.minStok)} ${esc(p.satuan || '')}</div></div>
            <div class="ri-right"><div class="ri-val neg">${num(p.stok)}</div><div class="ri-note">tersisa</div></div>
          </div>`).join('')}
        </div>
      </div>` : ''}

    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari produk..." value="${esc(f.q)}"></div>
    </div>
    <div class="chips mb12" id="chipTampil">
      ${[['semua', 'Semua'], ['menipis', 'Menipis'], ['titipan', 'Ada Titipan'], ['habis', 'Habis']]
        .map(([v, t]) => `<button class="chip ${f.tampil === v ? 'active' : ''}" data-v="${v}">${t}</button>`).join('')}
    </div>

    <div class="card">
      <div class="card-head"><h2>Posisi Stok</h2><span class="muted xs">ketuk untuk kartu stok</span></div>
      <div class="table-wrap"><table class="tbl stack" id="tabelStok">
        <thead><tr><th>Produk</th><th class="num">Gudang</th><th class="num">Di Mitra</th><th class="num">Total</th>${bolehLihatModal() ? '<th class="num">Nilai</th>' : ''}</tr></thead>
        <tbody id="tbody"></tbody>
      </table></div>
    </div>`;

  const tbody = view.querySelector('#tbody');
  const gambar = () => {
    let arr = db.produk.filter(p => cocok(`${p.nama} ${p.kode} ${p.merk}`, f.q));
    if (f.tampil === 'menipis') arr = arr.filter(p => toNum(p.minStok) > 0 && toNum(p.stok) <= toNum(p.minStok));
    if (f.tampil === 'habis') arr = arr.filter(p => toNum(p.stok) <= 0);
    if (f.tampil === 'titipan') arr = arr.filter(p => stokKonsinyasi(p.id) > 0);
    arr = sortBy(arr, p => p.nama.toLowerCase());

    if (!arr.length) {
      tbody.innerHTML = `<tr><td colspan="${bolehLihatModal() ? 5 : 4}">${kosongState('📦', 'Tidak ada produk', 'Ubah filter atau tambahkan produk baru.')}</td></tr>`;
      return;
    }
    tbody.innerHTML = arr.map(p => {
      const g = toNum(p.stok), t = stokKonsinyasi(p.id);
      const kritis = toNum(p.minStok) > 0 && g <= toNum(p.minStok);
      return `<tr data-id="${p.id}" style="cursor:pointer">
        <td data-l="Produk"><div><div class="strong sm">${esc(p.nama)} ${kritis ? badge('menipis', 'warn') : ''}</div>
          <div class="xs muted">${esc(p.kode)} · ${esc(p.satuan || 'Slop')}</div></div></td>
        <td data-l="Gudang" class="num"><span class="${g <= 0 ? 'neg' : ''}">${num(g)}</span></td>
        <td data-l="Di Mitra" class="num"><span>${t > 0 ? num(t) : '—'}</span></td>
        <td data-l="Total" class="num strong"><span>${num(g + t)}</span></td>
        ${bolehLihatModal() ? `<td data-l="Nilai" class="num"><span>${rp(g * toNum(p.hargaBeli))}</span></td>` : ''}
      </tr>`;
    }).join('');
  };
  gambar();

  view.querySelector('#cari').addEventListener('input', debounce(e => { f.q = e.target.value; gambar(); }, 180));
  view.querySelector('#chipTampil').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    f.tampil = c.dataset.v;
    view.querySelectorAll('#chipTampil .chip').forEach(x => x.classList.toggle('active', x === c));
    gambar();
  });
  view.addEventListener('click', e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    pergi(`stok/${row.dataset.id}`);
  });
}

function eksporStok() {
  if (!db.produk.length) return gagal('Belum ada produk');
  unduh(`stok-${todayISO()}.csv`, toCSV(db.produk.map(p => ({
    Kode: p.kode, Produk: p.nama, Merk: p.merk || '', Satuan: p.satuan || '',
    StokGudang: toNum(p.stok), DiMitra: stokKonsinyasi(p.id),
    Total: toNum(p.stok) + stokKonsinyasi(p.id),
    StokMinimum: toNum(p.minStok),
    ...(bolehLihatModal()
      ? { HargaBeli: toNum(p.hargaBeli), NilaiPersediaan: toNum(p.stok) * toNum(p.hargaBeli) }
      : {}),
    HargaAgen: toNum(p.hargaAgen), HargaReseller: toNum(p.hargaReseller),
  })), null), 'text/csv');
  sukses('Data stok diekspor');
}

/* =========================================================
   KARTU STOK
   ========================================================= */
function halamanKartu(view, produkId) {
  const p = get('produk', produkId);
  if (!p) {
    view.innerHTML = kosongState('❓', 'Produk tidak ditemukan', '', '<a class="btn btn-primary" href="#/stok">Kembali</a>');
    return;
  }
  const { dari, sampai, label } = hitungPeriode(f.kode, f);
  const mutasi = sortBy(
    db.mutasi.filter(m => m.produkId === p.id && (!dari || m.tanggal >= dari) && (!sampai || m.tanggal <= sampai)),
    m => `${m.tanggal}${m.dibuat}`, true);

  const masuk = sum(mutasi.filter(m => m.qty > 0), m => m.qty);
  const keluar = sum(mutasi.filter(m => m.qty < 0), m => -m.qty);
  const titipan = rincianKonsinyasi({ produkId: p.id });

  setJudul(p.nama, `Kartu stok · ${label}`);
  setTopbar([{ teks: 'Kembali', ikon: '←', kelas: 'btn-ghost btn-sm', onClick: () => pergi('stok') }]);
  setFab(null);

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: 'Stok Gudang', nilai: num(p.stok), sub: p.satuan || 'Slop', warna: toNum(p.stok) <= toNum(p.minStok) ? 'bad' : 'ok', ikon: '🏬' })}
      ${statTile({ label: 'Di Mitra', nilai: num(stokKonsinyasi(p.id)), sub: 'konsinyasi', warna: 'violet', ikon: '🤝' })}
      ${statTile({ label: `Masuk (${label})`, nilai: num(masuk), sub: 'unit', warna: 'info', ikon: '⬆️' })}
      ${statTile({ label: `Keluar (${label})`, nilai: num(keluar), sub: 'unit', warna: 'warn', ikon: '⬇️' })}
    </div>

    <div class="toolbar">
      ${htmlPeriode(f.kode, f)}
      <button class="btn btn-sm btn-ghost" id="ekspor">⬇️ Ekspor</button>
    </div>

    ${titipan.length ? `
      <div class="card mb12">
        <div class="card-head"><h2>🤝 Sedang Dititipkan</h2></div>
        <div class="list">${titipan.map(t => {
          const m = get('mitra', t.mitraId);
          return `<div class="row-item"><div class="avatar v">🤝</div>
            <div class="ri-main"><div class="ri-title">${esc(m?.nama || '-')}</div>
              <div class="ri-sub">${esc(t.noRef)} · titip ${num(t.qty)} · terjual ${num(t.terjual)}</div></div>
            <div class="ri-right"><div class="ri-val">${num(t.sisa)}</div><div class="ri-note">sisa</div></div></div>`;
        }).join('')}</div>
      </div>` : ''}

    <div class="card">
      <div class="card-head"><h2>Riwayat Mutasi</h2><span class="muted xs">${mutasi.length} baris</span></div>
      <div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Referensi</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo</th></tr></thead>
        <tbody>${mutasi.length ? mutasi.map(m => `<tr>
          <td data-l="Tanggal"><span class="nowrap">${fmtTglPendek(m.tanggal)}</span></td>
          <td data-l="Keterangan"><div><div class="sm strong">${esc(TIPE_MUTASI[m.tipe]?.label || m.tipe)}</div>
            <div class="xs muted">${esc(m.ket || '')}</div></div></td>
          <td data-l="Referensi"><span class="mono xs">${esc(m.ref || '-')}</span></td>
          <td data-l="Masuk" class="num"><span class="pos">${m.qty > 0 ? num(m.qty) : ''}</span></td>
          <td data-l="Keluar" class="num"><span class="neg">${m.qty < 0 ? num(-m.qty) : ''}</span></td>
          <td data-l="Saldo" class="num strong"><span>${num(m.sesudah)}</span></td>
        </tr>`).join('') : `<tr><td colspan="6">${kosongState('📭', 'Belum ada mutasi', `Tidak ada pergerakan stok pada ${label}.`)}</td></tr>`}</tbody>
      </table></div>
    </div>`;

  pasangPeriode(view, f, () => segarkan());
  view.querySelector('#ekspor').onclick = () => {
    if (!mutasi.length) return gagal('Tidak ada mutasi untuk diekspor');
    unduh(`kartu-stok-${p.kode}-${todayISO()}.csv`, toCSV(mutasi.map(m => ({
      Tanggal: m.tanggal, Tipe: TIPE_MUTASI[m.tipe]?.label || m.tipe, Keterangan: m.ket,
      Referensi: m.ref, Masuk: m.qty > 0 ? m.qty : 0, Keluar: m.qty < 0 ? -m.qty : 0,
      SaldoSebelum: m.sebelum, SaldoSesudah: m.sesudah,
    }))), 'text/csv');
    sukses('Kartu stok diekspor');
  };
}

export function render(view, params = []) {
  if (params[0]) return halamanKartu(view, params[0]);
  return halamanRingkas(view);
}
