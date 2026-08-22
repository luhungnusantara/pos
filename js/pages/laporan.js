/* pages/laporan.js — laporan penjualan, laba rugi, produk, mitra & sales */
import { get } from '../core/store.js';
import {
  ringkasan, omzetHarian, produkTerlaris, rekapMitra, rekapKomisi, saldoKas, totalPiutang, totalHutang, nilaiPersediaan, stokKonsinyasi, penjualanAktif,
} from '../core/domain.js';
import { setJudul, setTopbar, setFab, kosongState, statTile, badge, sukses, gagal } from '../core/ui.js';
import { htmlPeriode, pasangPeriode, hitungPeriode } from '../core/periode.js';
import { segarkan } from '../core/router.js';
import {
  esc, rp, rpShort, num, toNum, sum, sortBy, fmtTgl, fmtTglPendek, todayISO, unduh, toCSV,
} from '../core/utils.js';

let f = { kode: 'bulan', dari: todayISO(), sampai: todayISO(), tab: 'ringkas' };

/* grafik batang sederhana (SVG, tanpa pustaka luar) */
function grafikOmzet(data) {
  if (!data.length) return '';
  const maks = Math.max(...data.map(d => d.omzet), 1);
  const W = 100, H = 42, lebar = W / data.length;
  return `
  <div class="card mb12">
    <div class="card-head"><h2>Omzet Harian</h2><span class="muted xs">${data.length} hari terakhir</span></div>
    <div class="card-body">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:150px;overflow:visible" role="img" aria-label="Grafik omzet harian">
        ${data.map((d, i) => {
          const t = d.omzet / maks * (H - 6);
          return `<rect x="${i * lebar + lebar * 0.15}" y="${H - t}" width="${lebar * 0.7}" height="${Math.max(t, 0.6)}"
            rx="0.6" fill="var(--primary)" opacity="${0.45 + 0.55 * (d.omzet / maks)}">
            <title>${fmtTgl(d.tanggal)}: ${rp(d.omzet)} (${d.trx} trx)</title></rect>`;
        }).join('')}
      </svg>
      <div class="flex between mt8">
        <span class="xs muted">${fmtTglPendek(data[0].tanggal)}</span>
        <span class="xs muted">Tertinggi ${rpShort(maks)}</span>
        <span class="xs muted">${fmtTglPendek(data[data.length - 1].tanggal)}</span>
      </div>
    </div>
  </div>`;
}

function tabRingkas(dari, sampai, label) {
  const r = ringkasan(dari, sampai);
  const biayaLain = r.biaya;
  return `
    <div class="grid g4 mb12">
      ${statTile({ label: 'Omzet', nilai: rp(r.omzet), sub: `${r.trx} transaksi · ${num(r.qty)} unit`, warna: 'ok', ikon: '💰' })}
      ${statTile({ label: 'Laba Kotor', nilai: rp(r.labaKotor), sub: `margin ${num(r.marginPersen, 1)}%`, warna: 'info', ikon: '📈' })}
      ${statTile({ label: 'Laba Bersih', nilai: rp(r.labaBersih), sub: 'setelah komisi & biaya', warna: r.labaBersih >= 0 ? 'ok' : 'bad', ikon: '🏆' })}
      ${statTile({ label: 'Saldo Kas', nilai: rp(saldoKas()), sub: 'posisi terkini', warna: saldoKas() >= 0 ? 'ok' : 'bad', ikon: '🏦' })}
    </div>

    ${grafikOmzet(omzetHarian(f.kode === 'hari' ? 7 : 14))}

    <div class="card mb12">
      <div class="card-head"><h2>Laba Rugi Ringkas</h2><span class="badge">${label}</span></div>
      <div class="card-body">
        <div class="kv"><span class="k">Penjualan (omzet)</span><span class="v">${rp(r.omzet)}</span></div>
        <div class="kv"><span class="k">Harga Pokok Penjualan (HPP)</span><span class="v neg">− ${rp(r.hpp)}</span></div>
        <div class="kv" style="border-top:1px solid var(--border);padding-top:9px">
          <span class="k b">Laba Kotor</span><span class="v pos">${rp(r.labaKotor)}</span></div>
        <div class="kv"><span class="k">Komisi Sales</span><span class="v neg">− ${rp(r.komisi)}</span></div>
        <div class="kv"><span class="k">Biaya Operasional</span><span class="v neg">− ${rp(biayaLain)}</span></div>
        <div class="kv"><span class="k">Susut Stok (opname)</span><span class="v neg">− ${rp(r.susut)}</span></div>
        <div class="kv total"><span class="k">Laba Bersih</span>
          <span class="v" style="color:${r.labaBersih >= 0 ? 'var(--ok)' : 'var(--bad)'}">${rp(r.labaBersih)}</span></div>
      </div>
    </div>

    <div class="grid gauto mb12">
      <div class="card">
        <div class="card-head"><h3>Komposisi Penjualan</h3></div>
        <div class="card-body">
          <div class="kv"><span class="k">Penjualan putus</span><span class="v">${rp(r.putus)}</span></div>
          <div class="kv"><span class="k">Hasil konsinyasi</span><span class="v">${rp(r.konsinyasi)}</span></div>
          <div class="kv"><span class="k">Dibayar tunai/transfer</span><span class="v pos">${rp(r.tunai)}</span></div>
          <div class="kv"><span class="k">Kredit / tempo</span><span class="v neg">${rp(r.kredit)}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Posisi Keuangan</h3></div>
        <div class="card-body">
          <div class="kv"><span class="k">Saldo kas</span><span class="v">${rp(saldoKas())}</span></div>
          <div class="kv"><span class="k">Piutang mitra</span><span class="v">${rp(totalPiutang())}</span></div>
          <div class="kv"><span class="k">Nilai persediaan gudang</span><span class="v">${rp(nilaiPersediaan())}</span></div>
          <div class="kv"><span class="k">Barang di mitra (konsinyasi)</span><span class="v">${num(stokKonsinyasi())} unit</span></div>
          <div class="kv"><span class="k">Hutang supplier</span><span class="v neg">${rp(totalHutang())}</span></div>
          <div class="kv total"><span class="k">Perkiraan Aset Lancar</span>
            <span class="v">${rp(saldoKas() + totalPiutang() + nilaiPersediaan() - totalHutang())}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Arus Kas</h3></div>
        <div class="card-body">
          <div class="kv"><span class="k">Kas masuk</span><span class="v pos">${rp(r.kasMasuk)}</span></div>
          <div class="kv"><span class="k">Kas keluar</span><span class="v neg">${rp(r.kasKeluar)}</span></div>
          <div class="kv total"><span class="k">Arus kas bersih</span>
            <span class="v" style="color:${r.kasMasuk - r.kasKeluar >= 0 ? 'var(--ok)' : 'var(--bad)'}">${rp(r.kasMasuk - r.kasKeluar)}</span></div>
          <div class="kv"><span class="k">Pembelian stok</span><span class="v">${rp(r.pembelian)}</span></div>
        </div>
      </div>
    </div>`;
}

function tabProduk(dari, sampai) {
  const arr = produkTerlaris(dari, sampai, 100);
  if (!arr.length) return `<div class="card">${kosongState('🚬', 'Belum ada penjualan produk', 'Tidak ada data pada periode ini.')}</div>`;
  const maks = arr[0].qty || 1;
  return `
    <div class="card">
      <div class="card-head"><h2>Penjualan per Produk</h2><span class="muted xs">${arr.length} produk</span></div>
      <div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Produk</th><th class="num">Qty</th><th class="num">Omzet</th><th class="num">Laba</th><th class="num">Margin</th></tr></thead>
        <tbody>${arr.map(m => `<tr>
          <td data-l="Produk"><div><div class="sm strong">${esc(m.produk?.nama || '-')}</div>
            <div class="bar" style="max-width:160px"><i style="width:${m.qty / maks * 100}%"></i></div></div></td>
          <td data-l="Qty" class="num"><span>${num(m.qty)}</span></td>
          <td data-l="Omzet" class="num"><span>${rp(m.omzet)}</span></td>
          <td data-l="Laba" class="num"><span class="pos">${rp(m.laba)}</span></td>
          <td data-l="Margin" class="num"><span>${m.omzet ? num(m.laba / m.omzet * 100, 1) : 0}%</span></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td>
          <td class="num">${num(sum(arr, m => m.qty))}</td>
          <td class="num">${rp(sum(arr, m => m.omzet))}</td>
          <td class="num">${rp(sum(arr, m => m.laba))}</td><td></td></tr></tfoot>
      </table></div>
    </div>`;
}

function tabMitra(dari, sampai) {
  const arr = rekapMitra(dari, sampai);
  if (!arr.length) return `<div class="card">${kosongState('🏪', 'Belum ada transaksi mitra', 'Tidak ada data pada periode ini.')}</div>`;
  return `
    <div class="card">
      <div class="card-head"><h2>Penjualan per Mitra</h2><span class="muted xs">${arr.length} mitra</span></div>
      <div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Mitra</th><th>Tipe</th><th class="num">Trx</th><th class="num">Omzet</th><th class="num">Laba</th><th class="num">Piutang</th><th class="num">Titipan</th></tr></thead>
        <tbody>${arr.map(m => `<tr>
          <td data-l="Mitra"><span class="strong">${esc(m.mitra?.nama || 'Umum')}</span></td>
          <td data-l="Tipe"><span>${m.mitra ? badge(m.mitra.tipe === 'agen' ? 'Agen' : 'Reseller', m.mitra.tipe === 'agen' ? 'info' : 'violet') : '-'}</span></td>
          <td data-l="Trx" class="num"><span>${m.trx}</span></td>
          <td data-l="Omzet" class="num strong"><span>${rp(m.omzet)}</span></td>
          <td data-l="Laba" class="num"><span class="pos">${rp(m.laba)}</span></td>
          <td data-l="Piutang" class="num"><span class="${m.piutang > 0 ? 'neg' : 'muted'}">${m.piutang > 0 ? rp(m.piutang) : '—'}</span></td>
          <td data-l="Titipan" class="num"><span>${m.titipan > 0 ? num(m.titipan) : '—'}</span></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total</td>
          <td class="num">${rp(sum(arr, m => m.omzet))}</td>
          <td class="num">${rp(sum(arr, m => m.laba))}</td>
          <td class="num">${rp(sum(arr, m => m.piutang))}</td>
          <td class="num">${num(sum(arr, m => m.titipan))}</td></tr></tfoot>
      </table></div>
    </div>`;
}

function tabSales(dari, sampai) {
  const arr = sortBy(rekapKomisi({ dari, sampai }), r => r.omzet, true);
  if (!arr.length) return `<div class="card">${kosongState('👤', 'Belum ada data sales')}</div>`;
  return `
    <div class="card">
      <div class="card-head"><h2>Kinerja Sales</h2><span class="muted xs">${arr.length} sales</span></div>
      <div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Sales</th><th class="num">Trx</th><th class="num">Unit</th><th class="num">Omzet</th><th class="num">Laba</th><th class="num">Komisi</th><th class="num">Capaian</th></tr></thead>
        <tbody>${arr.map(r => `<tr>
          <td data-l="Sales"><span class="strong">${esc(r.sales.nama)}</span></td>
          <td data-l="Trx" class="num"><span>${r.trx}</span></td>
          <td data-l="Unit" class="num"><span>${num(r.qty)}</span></td>
          <td data-l="Omzet" class="num strong"><span>${rp(r.omzet)}</span></td>
          <td data-l="Laba" class="num"><span class="pos">${rp(r.laba)}</span></td>
          <td data-l="Komisi" class="num"><span>${rp(r.total)}${r.pending > 0 ? ` <span class="xs" style="color:var(--warn)">(${rp(r.pending)} pending)</span>` : ''}</span></td>
          <td data-l="Capaian" class="num"><span>${r.capaian != null ? num(r.capaian, 1) + '%' : '—'}</span></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total</td>
          <td class="num">${rp(sum(arr, r => r.omzet))}</td>
          <td class="num">${rp(sum(arr, r => r.laba))}</td>
          <td class="num">${rp(sum(arr, r => r.total))}</td><td></td></tr></tfoot>
      </table></div>
    </div>`;
}

export function render(view) {
  const { dari, sampai, label } = hitungPeriode(f.kode, f);

  setJudul('Laporan', label);
  setTopbar([
    { teks: 'Cetak', ikon: '🖨️', kelas: 'btn-ghost btn-sm', onClick: () => window.print() },
    { teks: 'Ekspor', ikon: '⬇️', onClick: () => ekspor(dari, sampai) },
  ]);
  setFab(null);

  const TAB = [
    ['ringkas', '📊 Ringkasan'], ['produk', '🚬 Per Produk'],
    ['mitra', '🏪 Per Mitra'], ['sales', '👤 Per Sales'],
  ];

  view.innerHTML = `
    <div class="toolbar no-print">${htmlPeriode(f.kode, f)}</div>
    <div class="seg mb12 no-print" id="segTab">
      ${TAB.map(([v, t]) => `<button type="button" data-v="${v}" class="${f.tab === v ? 'active' : ''}">${t}</button>`).join('')}
    </div>
    <div id="isi">${
      f.tab === 'produk' ? tabProduk(dari, sampai)
        : f.tab === 'mitra' ? tabMitra(dari, sampai)
          : f.tab === 'sales' ? tabSales(dari, sampai)
            : tabRingkas(dari, sampai, label)
    }</div>`;

  pasangPeriode(view, f, () => segarkan());
  view.querySelector('#segTab').onclick = e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    f.tab = b.dataset.v; segarkan();
  };

  function ekspor(dari, sampai) {
    let rows = [], nama = '';
    if (f.tab === 'produk') {
      nama = 'laporan-produk';
      rows = produkTerlaris(dari, sampai, 500).map(m => ({
        Kode: m.produk?.kode || '', Produk: m.produk?.nama || '', Qty: m.qty,
        Omzet: m.omzet, Laba: m.laba, MarginPersen: m.omzet ? (m.laba / m.omzet * 100).toFixed(2) : 0,
      }));
    } else if (f.tab === 'mitra') {
      nama = 'laporan-mitra';
      rows = rekapMitra(dari, sampai).map(m => ({
        Mitra: m.mitra?.nama || 'Umum', Tipe: m.mitra?.tipe || '', Transaksi: m.trx,
        Omzet: m.omzet, Laba: m.laba, Piutang: m.piutang, UnitTitipan: m.titipan,
      }));
    } else if (f.tab === 'sales') {
      nama = 'laporan-sales';
      rows = rekapKomisi({ dari, sampai }).map(r => ({
        Sales: r.sales.nama, Transaksi: r.trx, Unit: r.qty, Omzet: r.omzet, Laba: r.laba,
        Komisi: r.total, KomisiPending: r.pending, KomisiDibayar: r.dibayar,
        Target: r.sales.target || 0, CapaianPersen: r.capaian != null ? r.capaian.toFixed(2) : '',
      }));
    } else {
      nama = 'laporan-penjualan';
      rows = sortBy(penjualanAktif(dari, sampai), j => j.tanggal).map(j => ({
        Tanggal: j.tanggal, NoNota: j.noRef, Jenis: j.jenis, Mitra: j.mitraNama,
        Sales: get('sales', j.salesId)?.nama || '', Subtotal: j.subtotal, Diskon: j.diskon,
        Total: j.total, HPP: j.hpp, Laba: j.laba, Dibayar: j.dibayar,
        Sisa: toNum(j.total) - toNum(j.dibayar),
      }));
    }
    if (!rows.length) return gagal('Tidak ada data untuk diekspor');
    unduh(`${nama}-${todayISO()}.csv`, toCSV(rows), 'text/csv');
    sukses('Laporan diekspor');
  }
}
