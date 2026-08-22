/* pages/piutang.js — piutang mitra & hutang supplier */
import { get } from '../core/store.js';
import { daftarPiutang, totalPiutang, daftarHutang, totalHutang, sisaPiutang } from '../core/domain.js';
import { modalBayarPiutang, modalBayarHutang } from '../core/bayar.js';
import { setJudul, setTopbar, setFab, sukses, gagal, kosongState, statTile, badge, avatarEl } from '../core/ui.js';
import { tampilkanStruk } from '../core/struk.js';
import { segarkan } from '../core/router.js';
import {
  esc, rp, toNum, cocok, sum, debounce, fmtTglPendek, sortBy, todayISO, selisihHari, groupBy, unduh, toCSV,
} from '../core/utils.js';

let f = { tab: 'piutang', q: '', umur: 'semua' };

const umurNota = j => (j.jatuhTempo ? selisihHari(j.jatuhTempo) : selisihHari(j.tanggal) - 14);

const kelompokUmur = hari =>
  hari <= 0 ? { kode: 'belum', label: 'Belum jatuh tempo', kelas: 'ok' }
    : hari <= 7 ? { kode: '1-7', label: '1–7 hari', kelas: 'warn' }
      : hari <= 30 ? { kode: '8-30', label: '8–30 hari', kelas: 'warn' }
        : { kode: '30+', label: '> 30 hari', kelas: 'bad' };

export function render(view) {
  const piutang = daftarPiutang();
  const hutang = daftarHutang();

  setJudul('Piutang & Hutang', `Piutang ${rp(totalPiutang())} · Hutang ${rp(totalHutang())}`);
  setTopbar([{ teks: 'Ekspor', ikon: '⬇️', kelas: 'btn-ghost btn-sm', onClick: ekspor }]);
  setFab(null);

  const jatuhTempo = piutang.filter(j => umurNota(j) > 0);
  const nilaiTempo = sum(jatuhTempo, sisaPiutang);

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: 'Total Piutang', nilai: rp(totalPiutang()), sub: `${piutang.length} nota`, warna: 'bad', ikon: '📌' })}
      ${statTile({ label: 'Lewat Jatuh Tempo', nilai: rp(nilaiTempo), sub: `${jatuhTempo.length} nota`, warna: nilaiTempo > 0 ? 'bad' : 'ok', ikon: '⏰' })}
      ${statTile({ label: 'Total Hutang', nilai: rp(totalHutang()), sub: `${hutang.length} faktur`, warna: 'warn', ikon: '🏭' })}
      ${statTile({ label: 'Posisi Bersih', nilai: rp(totalPiutang() - totalHutang()), sub: 'piutang − hutang', warna: totalPiutang() - totalHutang() >= 0 ? 'ok' : 'bad', ikon: '⚖️' })}
    </div>

    <div class="seg mb12" id="segTab">
      <button type="button" data-v="piutang" class="${f.tab === 'piutang' ? 'active' : ''}">📌 Piutang Mitra (${piutang.length})</button>
      <button type="button" data-v="hutang" class="${f.tab === 'hutang' ? 'active' : ''}">🏭 Hutang Supplier (${hutang.length})</button>
    </div>

    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari nama / no. nota..." value="${esc(f.q)}"></div>
    </div>
    ${f.tab === 'piutang' ? `<div class="chips mb12" id="chipUmur">
      ${[['semua', 'Semua'], ['tempo', 'Lewat Tempo'], ['belum', 'Belum Tempo']]
        .map(([v, t]) => `<button class="chip ${f.umur === v ? 'active' : ''}" data-v="${v}">${t}</button>`).join('')}
    </div>` : ''}

    <div id="isi"></div>`;

  const isi = view.querySelector('#isi');

  const gambarPiutang = () => {
    let arr = piutang.filter(j => cocok(`${j.noRef} ${j.mitraNama}`, f.q));
    if (f.umur === 'tempo') arr = arr.filter(j => umurNota(j) > 0);
    if (f.umur === 'belum') arr = arr.filter(j => umurNota(j) <= 0);

    if (!arr.length) {
      isi.innerHTML = `<div class="card">${kosongState('✅', 'Tidak ada piutang', 'Semua nota sudah lunas atau tidak cocok dengan filter.')}</div>`;
      return;
    }

    const perMitra = groupBy(arr, j => j.mitraId || j.mitraNama);
    isi.innerHTML = sortBy(Object.entries(perMitra), ([, list]) => sum(list, sisaPiutang), true).map(([key, list]) => {
      const m = get('mitra', key);
      const total = sum(list, sisaPiutang);
      const terlama = Math.max(...list.map(umurNota));
      const g = kelompokUmur(terlama);
      return `
      <div class="card mb12">
        <div class="card-head">
          ${avatarEl(m?.nama || list[0].mitraNama, m?.tipe === 'agen' ? 'i' : 'v')}
          <div class="grow" style="min-width:120px">
            <h3 style="margin-bottom:2px">${esc(m?.nama || list[0].mitraNama)}</h3>
            <div class="xs muted">${list.length} nota${m?.telp ? ' · ' + esc(m.telp) : ''}</div>
          </div>
          <div style="text-align:right">
            <div class="b" style="color:var(--bad)">${rp(total)}</div>
            <span class="badge ${g.kelas}">${terlama > 0 ? `telat ${terlama} hari` : 'belum tempo'}</span>
          </div>
        </div>
        <div class="list">
          ${sortBy(list, j => j.tanggal).map(j => {
            const hari = umurNota(j);
            const gg = kelompokUmur(hari);
            return `<div class="row-item" data-id="${j.id}">
              <div class="ri-main">
                <div class="ri-title">${esc(j.noRef)} ${badge(gg.label, gg.kelas)}
                  ${j.jenis === 'konsinyasi' ? badge('Konsinyasi', 'violet') : ''}</div>
                <div class="ri-sub">${fmtTglPendek(j.tanggal)}${j.jatuhTempo ? ` · tempo ${fmtTglPendek(j.jatuhTempo)}` : ''} · total ${rp(j.total)}${toNum(j.dibayar) ? ` · dibayar ${rp(j.dibayar)}` : ''}</div>
              </div>
              <div class="ri-right">
                <div class="ri-val neg">${rp(sisaPiutang(j))}</div>
                <button class="btn btn-xs btn-soft mt8" data-bayar="${j.id}">💵 Bayar</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');
  };

  const gambarHutang = () => {
    const arr = sortBy(hutang.filter(b => cocok(`${b.noRef} ${b.supplier}`, f.q)), b => b.tanggal);
    if (!arr.length) {
      isi.innerHTML = `<div class="card">${kosongState('✅', 'Tidak ada hutang', 'Semua pembelian sudah lunas.')}</div>`;
      return;
    }
    isi.innerHTML = `<div class="card"><div class="list">
      ${arr.map(b => {
        const sisa = toNum(b.total) - toNum(b.dibayar);
        const telat = b.jatuhTempo && b.jatuhTempo < todayISO();
        return `<div class="row-item">
          <div class="avatar ${telat ? 'w' : ''}">🏭</div>
          <div class="ri-main">
            <div class="ri-title">${esc(b.supplier)} ${telat ? badge('Lewat tempo', 'bad') : ''}</div>
            <div class="ri-sub">${esc(b.noRef)} · ${fmtTglPendek(b.tanggal)}${b.jatuhTempo ? ` · tempo ${fmtTglPendek(b.jatuhTempo)}` : ''} · total ${rp(b.total)}</div>
          </div>
          <div class="ri-right">
            <div class="ri-val neg">${rp(sisa)}</div>
            <button class="btn btn-xs btn-soft mt8" data-bayarh="${b.id}">💵 Bayar</button>
          </div>
        </div>`;
      }).join('')}
    </div></div>`;
  };

  const gambar = () => (f.tab === 'piutang' ? gambarPiutang() : gambarHutang());
  gambar();

  view.querySelector('#segTab').onclick = e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    f.tab = b.dataset.v; segarkan();
  };
  view.querySelector('#cari').addEventListener('input', debounce(e => { f.q = e.target.value; gambar(); }, 180));
  view.querySelector('#chipUmur')?.addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    f.umur = c.dataset.v;
    view.querySelectorAll('#chipUmur .chip').forEach(x => x.classList.toggle('active', x === c));
    gambar();
  });

  isi.addEventListener('click', e => {
    const bayar = e.target.closest('[data-bayar]');
    if (bayar) {
      const j = get('penjualan', bayar.dataset.bayar);
      if (j) modalBayarPiutang(j, segarkan);
      return;
    }
    const bayarH = e.target.closest('[data-bayarh]');
    if (bayarH) {
      const b = get('pembelian', bayarH.dataset.bayarh);
      if (b) modalBayarHutang(b, segarkan);
      return;
    }
    const row = e.target.closest('[data-id]');
    if (row) {
      const j = get('penjualan', row.dataset.id);
      if (j) tampilkanStruk(j);
    }
  });

  function ekspor() {
    const rows = f.tab === 'piutang'
      ? daftarPiutang().map(j => ({
        Tanggal: j.tanggal, NoNota: j.noRef, Mitra: j.mitraNama, Tipe: j.tipeMitra,
        JatuhTempo: j.jatuhTempo || '', UmurHari: umurNota(j),
        Total: j.total, Dibayar: j.dibayar, Sisa: sisaPiutang(j),
      }))
      : daftarHutang().map(b => ({
        Tanggal: b.tanggal, NoFaktur: b.noRef, Supplier: b.supplier,
        JatuhTempo: b.jatuhTempo || '', Total: b.total, Dibayar: b.dibayar,
        Sisa: toNum(b.total) - toNum(b.dibayar),
      }));
    if (!rows.length) return gagal('Tidak ada data untuk diekspor');
    unduh(`${f.tab}-${todayISO()}.csv`, toCSV(rows), 'text/csv');
    sukses('Data diekspor');
  }
}
