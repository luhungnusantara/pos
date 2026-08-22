/* pages/komisi.js — perhitungan & pembayaran komisi sales */
import { db, get } from '../core/store.js';
import { rekapKomisi, komisiSales, komisiTertunda, bayarKomisi, SKEMA_KOMISI } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, modal, konfirmasi, sukses, gagal, ingat, kosongState, statTile, badge, avatarEl,
} from '../core/ui.js';
import { htmlPeriode, pasangPeriode, hitungPeriode } from '../core/periode.js';
import { segarkan, pergi } from '../core/router.js';
import { isOwner, adalah, salesAktif } from '../core/peran.js';
import { esc, rp, num, toNum, sum, fmtTgl, fmtTglPendek, sortBy, todayISO, unduh, toCSV } from '../core/utils.js';

let f = { kode: 'bulan', dari: todayISO(), sampai: todayISO(), status: 'semua' };

const jelaskanSkema = s => {
  const n = toNum(s?.nilai);
  if (!s) return '-';
  if (s.skema === 'nominal_unit') return `${rp(n)}/unit`;
  if (s.skema === 'persen_laba') return `${num(n, 2)}% laba`;
  return `${num(n, 2)}% omzet`;
};

/* =========================================================
   REKAP SELURUH SALES
   ========================================================= */
function halamanRekap(view) {
  const { dari, sampai, label } = hitungPeriode(f.kode, f);
  const rekap = sortBy(rekapKomisi({ dari, sampai }), r => r.total, true);
  const totalKomisi = sum(rekap, r => r.total);
  const totalPending = komisiTertunda();

  setJudul('Komisi Sales', `${label} · ${rp(totalKomisi)}`);
  setTopbar([{ teks: 'Ekspor', ikon: '⬇️', kelas: 'btn-ghost btn-sm', onClick: () => ekspor(dari, sampai) }]);
  setFab(null);

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: `Komisi ${label}`, nilai: rp(totalKomisi), sub: `${sum(rekap, r => r.trx)} transaksi`, warna: 'info', ikon: '🎯' })}
      ${statTile({ label: 'Belum Dibayar', nilai: rp(totalPending), sub: 'seluruh periode', warna: totalPending > 0 ? 'warn' : 'ok', ikon: '⏳' })}
      ${statTile({ label: 'Sudah Dibayar', nilai: rp(sum(rekap, r => r.dibayar)), sub: label, warna: 'ok', ikon: '✅' })}
      ${statTile({ label: 'Omzet Tim Sales', nilai: rp(sum(rekap, r => r.omzet)), sub: label, ikon: '💰' })}
    </div>

    <div class="toolbar">${htmlPeriode(f.kode, f)}</div>

    <div class="card mb12"><div class="card-body">
      <div class="lbl-t">ℹ️ Cara kerja komisi</div>
      <div class="xs muted" style="line-height:1.7">
        Komisi dihitung otomatis saat penjualan tersimpan — termasuk penjualan konsinyasi ketika mitra melaporkan barang terjual
        (bukan saat barang dititipkan). Bila produk memiliki nilai <b>komisi per unit</b> sendiri, nilai itu yang dipakai;
        selain itu mengikuti skema masing-masing sales.
      </div>
    </div></div>

    <div class="section-title">Rekap per Sales</div>
    <div id="daftar"></div>`;

  const box = view.querySelector('#daftar');
  if (!db.sales.length) {
    box.innerHTML = `<div class="card">${kosongState('👤', 'Belum ada sales',
      'Tambahkan data sales beserta skema komisinya.',
      '<a class="btn btn-primary" href="#/sales">＋ Tambah Sales</a>')}</div>`;
  } else {
    box.innerHTML = rekap.map(r => {
      const s = r.sales;
      return `
      <div class="card mb12" data-id="${s.id}" style="cursor:pointer">
        <div class="card-head">
          ${avatarEl(s.nama)}
          <div class="grow" style="min-width:130px">
            <h3 style="margin-bottom:2px">${esc(s.nama)} ${s.aktif === false ? badge('Nonaktif', 'bad') : ''}</h3>
            <div class="xs muted">${esc(s.kode)} · ${esc(jelaskanSkema(s))}</div>
          </div>
          <div style="text-align:right">
            <div class="b" style="font-size:16px">${rp(r.total)}</div>
            <div class="xs muted">${r.trx} transaksi</div>
          </div>
        </div>
        <div class="card-body">
          <div class="grid g4" style="gap:8px">
            ${statTile({ label: 'Omzet', nilai: rp(r.omzet) })}
            ${statTile({ label: 'Laba Kotor', nilai: rp(r.laba) })}
            ${statTile({ label: 'Belum Dibayar', nilai: rp(r.pending), warna: r.pending > 0 ? 'warn' : '' })}
            ${statTile({ label: 'Unit Terjual', nilai: num(r.qty) })}
          </div>
          ${r.capaian != null ? `
            <div class="mt12">
              <div class="flex between"><span class="xs muted">Capaian target ${rp(s.target)}</span><span class="xs b">${num(r.capaian, 1)}%</span></div>
              <div class="bar"><i class="${r.capaian >= 100 ? 'ok' : r.capaian >= 60 ? '' : 'warn'}" style="width:${Math.min(100, r.capaian)}%"></i></div>
            </div>` : ''}
        </div>
        ${r.pending > 0 ? `<div class="card-foot">
          <button class="btn btn-primary btn-block" data-bayar="${s.id}">💵 Bayar Komisi ${rp(r.pending)}</button></div>` : ''}
      </div>`;
    }).join('');
  }

  pasangPeriode(view, f, () => segarkan());
  box.addEventListener('click', e => {
    const bayar = e.target.closest('[data-bayar]');
    if (bayar) { e.stopPropagation(); return modalBayar(get('sales', bayar.dataset.bayar)); }
    const kartu = e.target.closest('[data-id]');
    if (kartu) pergi(`komisi/${kartu.dataset.id}`);
  });
}

/* =========================================================
   RINCIAN PER SALES
   ========================================================= */
function halamanDetail(view, salesId) {
  const s = get('sales', salesId);
  if (!s) {
    view.innerHTML = kosongState('❓', 'Sales tidak ditemukan', '', '<a class="btn btn-primary" href="#/komisi">Kembali</a>');
    return;
  }
  const { dari, sampai, label } = hitungPeriode(f.kode, f);
  let arr = komisiSales(s.id, { dari, sampai });
  if (f.status !== 'semua') arr = arr.filter(k => k.status === f.status);
  arr = sortBy(arr, k => `${k.tanggal}${k.dibuat}`, true);

  const pending = komisiTertunda(s.id);
  const riwayatBayar = db.bayarKomisi.filter(b => b.salesId === s.id);

  setJudul(`Komisi ${s.nama}`, `${label} · ${esc(jelaskanSkema(s))}`);
  setTopbar(isOwner() ? [{ teks: 'Kembali', ikon: '←', kelas: 'btn-ghost btn-sm', onClick: () => pergi('komisi') }] : []);
  setFab(pending > 0 && isOwner() ? { ikon: '💵', teks: 'Bayar komisi', onClick: () => modalBayar(s) } : null);

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: `Komisi ${label}`, nilai: rp(sum(arr, k => k.nilai)), sub: `${arr.length} transaksi`, warna: 'info', ikon: '🎯' })}
      ${statTile({ label: 'Belum Dibayar', nilai: rp(pending), sub: 'seluruh periode', warna: pending > 0 ? 'warn' : 'ok', ikon: '⏳' })}
      ${statTile({ label: 'Omzet', nilai: rp(sum(arr, k => k.omzet)), sub: label, warna: 'ok', ikon: '💰' })}
      ${statTile({ label: 'Unit Terjual', nilai: num(sum(arr, k => k.qty)), sub: label, ikon: '📦' })}
    </div>

    <div class="toolbar">
      ${htmlPeriode(f.kode, f)}
      ${pending > 0 && isOwner() ? '<button class="btn btn-sm btn-primary" id="bayar">💵 Bayar Komisi</button>' : ''}
      <button class="btn btn-sm btn-ghost" id="ekspor">⬇️</button>
    </div>
    <div class="chips mb12" id="chipStatus">
      ${[['semua', 'Semua'], ['pending', 'Belum Dibayar'], ['dibayar', 'Sudah Dibayar']]
        .map(([v, t]) => `<button class="chip ${f.status === v ? 'active' : ''}" data-v="${v}">${t}</button>`).join('')}
    </div>

    <div class="card mb12">
      <div class="card-head"><h2>Rincian Komisi</h2><span class="muted xs">${arr.length} baris</span></div>
      <div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Tanggal</th><th>Nota / Mitra</th><th class="num">Omzet</th><th class="num">Laba</th><th class="num">Qty</th><th class="num">Komisi</th><th>Status</th></tr></thead>
        <tbody>${arr.length ? arr.map(k => {
          const m = k.mitraId ? get('mitra', k.mitraId) : null;
          return `<tr data-nota="${k.penjualanId}" style="cursor:pointer">
            <td data-l="Tanggal"><span class="nowrap">${fmtTglPendek(k.tanggal)}</span></td>
            <td data-l="Nota"><div><div class="sm strong">${esc(k.noRef || '-')}</div>
              <div class="xs muted">${esc(m?.nama || '-')}</div></div></td>
            <td data-l="Omzet" class="num"><span>${rp(k.omzet)}</span></td>
            <td data-l="Laba" class="num"><span>${rp(k.laba)}</span></td>
            <td data-l="Qty" class="num"><span>${num(k.qty)}</span></td>
            <td data-l="Komisi" class="num strong"><span>${rp(k.nilai)}</span></td>
            <td data-l="Status"><span>${k.status === 'dibayar' ? badge('Dibayar', 'ok') : badge('Pending', 'warn')}</span></td>
          </tr>`;
        }).join('') : `<tr><td colspan="7">${kosongState('🎯', 'Belum ada komisi', `Tidak ada komisi pada ${label}.`)}</td></tr>`}</tbody>
        ${arr.length ? `<tfoot><tr><td colspan="5">Total</td><td class="num">${rp(sum(arr, k => k.nilai))}</td><td></td></tr></tfoot>` : ''}
      </table></div>
    </div>

    ${riwayatBayar.length ? `
      <div class="section-title">Riwayat Pembayaran Komisi</div>
      <div class="card"><div class="list">
        ${sortBy(riwayatBayar, b => b.tanggal, true).map(b => `
          <div class="row-item"><div class="avatar" style="background:var(--ok-soft);color:var(--ok)">✅</div>
            <div class="ri-main"><div class="ri-title">${esc(b.noRef)}</div>
              <div class="ri-sub">${fmtTgl(b.tanggal)} · ${b.jumlahTrx} transaksi · ${esc(b.metode)}${b.catatan ? ' · ' + esc(b.catatan) : ''}</div></div>
            <div class="ri-right"><div class="ri-val">${rp(b.total)}</div></div></div>`).join('')}
      </div></div>` : ''}`;

  pasangPeriode(view, f, () => segarkan());
  view.querySelector('#bayar')?.addEventListener('click', () => modalBayar(s));
  view.querySelector('#chipStatus').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    f.status = c.dataset.v; segarkan();
  });
  view.querySelector('#ekspor').onclick = () => ekspor(dari, sampai, s.id);
  view.addEventListener('click', e => {
    const tr = e.target.closest('[data-nota]');
    if (!tr) return;
    const j = get('penjualan', tr.dataset.nota);
    if (j) import('../core/struk.js').then(m => m.tampilkanStruk(j));
  });
}

/* =========================================================
   BAYAR KOMISI
   ========================================================= */
function modalBayar(s) {
  if (!s) return;
  const pending = sortBy(komisiSales(s.id, { status: 'pending' }), k => k.tanggal, true);
  if (!pending.length) return ingat('Tidak ada komisi yang perlu dibayar');

  const dipilih = new Set(pending.map(k => k.id));

  const h = modal({
    judul: `Bayar Komisi — ${s.nama}`, lebar: 'wide',
    isi: `
      <div class="hint mb12">Pilih transaksi komisi yang akan dibayar. Pembayaran tercatat otomatis sebagai <b>kas keluar</b>.</div>
      <div class="card mb12">
        <div class="card-head"><h3>Komisi Belum Dibayar</h3>
          <button class="btn btn-xs" id="togglePilih">Batal pilih semua</button></div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th style="width:38px"></th><th>Tanggal / Nota</th><th class="num">Omzet</th><th class="num">Komisi</th></tr></thead>
          <tbody>${pending.map(k => {
            const m = k.mitraId ? get('mitra', k.mitraId) : null;
            return `<tr>
              <td><input type="checkbox" checked data-k="${k.id}" style="width:20px;height:20px;accent-color:var(--primary)"></td>
              <td><div class="sm strong">${fmtTglPendek(k.tanggal)} · ${esc(k.noRef || '')}</div>
                <div class="xs muted">${esc(m?.nama || '-')}</div></td>
              <td class="num sm">${rp(k.omzet)}</td>
              <td class="num strong">${rp(k.nilai)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
      <div class="card"><div class="card-body">
        <div class="form-row">
          <div class="field mb0"><label>Tanggal Bayar</label><input class="input" type="date" id="tgl" value="${todayISO()}"></div>
          <div class="field mb0"><label>Metode</label><select class="select" id="metode">
            <option value="tunai">Tunai</option><option value="transfer">Transfer</option></select></div>
          <div class="field mb0" style="grid-column:1/-1"><label>Catatan</label>
            <input class="input" id="catatan" placeholder="Opsional"></div>
        </div>
        <div class="kv total"><span class="k">Total Dibayar</span><span class="v" id="totalBayar">${rp(sum(pending, k => k.nilai))}</span></div>
      </div></div>`,
    tombol: [
      { teks: 'Batal', kelas: 'btn-ghost' },
      {
        teks: '✔ Bayar', kelas: 'btn-primary', aksi: async handle => {
          const ids = [...dipilih];
          if (!ids.length) return gagal('Pilih minimal satu komisi');
          const total = sum(pending.filter(k => dipilih.has(k.id)), k => k.nilai);
          const ya = await konfirmasi({
            judul: 'Konfirmasi pembayaran komisi',
            pesan: `Bayar komisi <b>${esc(s.nama)}</b> sebesar <b>${rp(total)}</b> untuk ${ids.length} transaksi?<br><br>Kas keluar akan dicatat otomatis.`,
            ok: 'Ya, bayar',
          });
          if (!ya) return;
          bayarKomisi({
            salesId: s.id, komisiIds: ids,
            tanggal: handle.body.querySelector('#tgl').value || todayISO(),
            metode: handle.body.querySelector('#metode').value,
            catatan: handle.body.querySelector('#catatan').value,
          });
          handle.tutup();
          sukses(`Komisi ${rp(total)} dibayarkan`);
          segarkan();
        },
      },
    ],
  });

  const perbarui = () => {
    const total = sum(pending.filter(k => dipilih.has(k.id)), k => k.nilai);
    h.body.querySelector('#totalBayar').textContent = rp(total);
  };
  h.body.addEventListener('change', e => {
    const cb = e.target.closest('[data-k]');
    if (!cb) return;
    cb.checked ? dipilih.add(cb.dataset.k) : dipilih.delete(cb.dataset.k);
    perbarui();
  });
  h.body.querySelector('#togglePilih').onclick = () => {
    const semua = dipilih.size === pending.length;
    h.body.querySelectorAll('[data-k]').forEach(cb => {
      cb.checked = !semua;
      semua ? dipilih.delete(cb.dataset.k) : dipilih.add(cb.dataset.k);
    });
    h.body.querySelector('#togglePilih').textContent = semua ? 'Pilih semua' : 'Batal pilih semua';
    perbarui();
  };
}

function ekspor(dari, sampai, salesId = null) {
  const arr = komisiSales(salesId, { dari, sampai });
  if (!arr.length) return gagal('Tidak ada data komisi untuk diekspor');
  unduh(`komisi-${todayISO()}.csv`, toCSV(arr.map(k => ({
    Tanggal: k.tanggal, Sales: get('sales', k.salesId)?.nama || '', NoNota: k.noRef || '',
    Mitra: get('mitra', k.mitraId)?.nama || '', Omzet: k.omzet, Laba: k.laba, Qty: k.qty,
    Skema: SKEMA_KOMISI[k.skema]?.label || k.skema, NilaiSkema: k.nilaiSkema,
    Komisi: k.nilai, Status: k.status, TanggalBayar: k.tglBayar || '',
  }))), 'text/csv');
  sukses('Data komisi diekspor');
}

export function render(view, params = []) {
  // sales hanya boleh melihat komisinya sendiri
  if (adalah('sales')) return halamanDetail(view, salesAktif()?.id || '');
  if (params[0]) return halamanDetail(view, params[0]);
  return halamanRekap(view);
}
