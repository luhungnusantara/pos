/* pages/dashboard.js — ringkasan harian & pintasan */
import { db, get } from '../core/store.js';
import {
  ringkasan, omzetHarian, produkTerlaris, saldoKas, totalPiutang, totalHutang,
  produkMenipis, piutangJatuhTempo, komisiTertunda, stokKonsinyasi, nilaiPersediaan,
  penjualanAktif, sisaPiutang,
} from '../core/domain.js';
import { setJudul, setTopbar, setFab, kosongState, statTile, badge } from '../core/ui.js';
import { tampilkanStruk } from '../core/struk.js';
import { pergi } from '../core/router.js';
import {
  esc, rp, rpShort, num, sum, sortBy, fmtTgl, fmtTglPendek, fmtJam,
  todayISO, awalBulan, akhirBulan, selisihHari,
} from '../core/utils.js';

const salam = () => {
  const j = new Date().getHours();
  return j < 11 ? 'Selamat pagi' : j < 15 ? 'Selamat siang' : j < 18 ? 'Selamat sore' : 'Selamat malam';
};

const PINTASAN = [
  { ke: 'kasir', ikon: '🧾', teks: 'Jual', warna: 'var(--primary-soft)', ink: 'var(--primary)' },
  { ke: 'konsinyasi/baru', ikon: '🤝', teks: 'Titip', warna: 'var(--violet-soft)', ink: 'var(--violet)' },
  { ke: 'pembelian/baru', ikon: '📥', teks: 'Stok Masuk', warna: 'var(--info-soft)', ink: 'var(--info)' },
  { ke: 'opname/baru', ikon: '📋', teks: 'Opname', warna: 'var(--warn-soft)', ink: 'var(--warn)' },
  { ke: 'kas', ikon: '🏦', teks: 'Kas', warna: 'var(--ok-soft)', ink: 'var(--ok)' },
  { ke: 'komisi', ikon: '🎯', teks: 'Komisi', warna: 'var(--bad-soft)', ink: 'var(--bad)' },
];

export function render(view) {
  const hari = todayISO();
  const rHari = ringkasan(hari, hari);
  const rBulan = ringkasan(awalBulan(), akhirBulan());
  const menipis = produkMenipis();
  const tempo = piutangJatuhTempo();
  const komPending = komisiTertunda();
  const konsTelat = db.konsinyasi.filter(k => k.status === 'aktif' && k.jatuhTempo && k.jatuhTempo < hari);
  const terakhir = sortBy(penjualanAktif(), j => `${j.tanggal}${j.dibuat}`, true).slice(0, 6);

  setJudul(`${salam()}${db.pengaturan.pemilik ? ', ' + db.pengaturan.pemilik.split(' ')[0] : ''}!`, fmtTgl(hari));
  setTopbar([{ teks: 'Jual', ikon: '🧾', onClick: () => pergi('kasir') }]);
  setFab({ ikon: '🧾', teks: 'Penjualan baru', onClick: () => pergi('kasir') });

  const belumAdaData = !db.produk.length;

  view.innerHTML = `
    ${belumAdaData ? `
      <div class="card mb12" style="border-color:var(--primary)">
        <div class="card-body">
          <h2 style="font-size:16px;margin-bottom:6px">👋 Mulai dari sini</h2>
          <p class="sm muted mb12">Aplikasi masih kosong. Ikuti langkah berikut untuk mulai berjualan:</p>
          <div class="list" style="margin:0 -14px">
            <a class="row-item" href="#/produk"><div class="avatar">1</div>
              <div class="ri-main"><div class="ri-title">Tambahkan Produk</div>
              <div class="ri-sub">Rokok beserta harga agen &amp; reseller</div></div><span class="muted">›</span></a>
            <a class="row-item" href="#/mitra"><div class="avatar i">2</div>
              <div class="ri-main"><div class="ri-title">Daftarkan Agen &amp; Reseller</div>
              <div class="ri-sub">Lengkap dengan plafon dan tempo</div></div><span class="muted">›</span></a>
            <a class="row-item" href="#/sales"><div class="avatar v">3</div>
              <div class="ri-main"><div class="ri-title">Isi Data Sales</div>
              <div class="ri-sub">Pilih skema komisi tiap sales</div></div><span class="muted">›</span></a>
            <a class="row-item" href="#/pembelian/baru"><div class="avatar w">4</div>
              <div class="ri-main"><div class="ri-title">Masukkan Stok Awal</div>
              <div class="ri-sub">Lewat menu pembelian</div></div><span class="muted">›</span></a>
          </div>
          <button class="btn btn-soft btn-block mt12" id="muatContoh">🧪 Atau muat data contoh dulu</button>
        </div>
      </div>` : ''}

    <div class="grid g4 mb12">
      ${statTile({ label: 'Omzet Hari Ini', nilai: rp(rHari.omzet), sub: `${rHari.trx} transaksi · ${num(rHari.qty)} unit`, warna: 'ok', ikon: '💰' })}
      ${statTile({ label: 'Laba Kotor Hari Ini', nilai: rp(rHari.labaKotor), sub: rHari.omzet ? `margin ${num(rHari.marginPersen, 1)}%` : '—', warna: 'info', ikon: '📈' })}
      ${statTile({ label: 'Saldo Kas', nilai: rp(saldoKas()), sub: 'posisi terkini', warna: saldoKas() >= 0 ? 'ok' : 'bad', ikon: '🏦' })}
      ${statTile({ label: 'Piutang Beredar', nilai: rp(totalPiutang()), sub: `${tempo.length} nota lewat tempo`, warna: totalPiutang() > 0 ? 'bad' : 'ok', ikon: '📌' })}
    </div>

    <div class="card mb12">
      <div class="card-head"><h2>⚡ Aksi Cepat</h2></div>
      <div class="card-body tight">
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">
          ${PINTASAN.map(a => `
            <button class="btn" data-ke="${a.ke}" style="flex-direction:column;height:auto;padding:12px 6px;gap:5px;background:${a.warna};border-color:transparent;color:${a.ink}">
              <span style="font-size:22px;line-height:1">${a.ikon}</span>
              <span style="font-size:12px;font-weight:700">${a.teks}</span>
            </button>`).join('')}
        </div>
      </div>
    </div>

    ${(menipis.length || tempo.length || komPending > 0 || konsTelat.length) ? `
      <div class="section-title">Perlu Perhatian</div>
      <div class="grid gauto mb12">
        ${menipis.length ? kartuPeringatan('⚠️', 'Stok Menipis', `${menipis.length} produk`,
          menipis.slice(0, 3).map(p => `${esc(p.nama)} (${num(p.stok)})`).join(', '), 'stok', 'warn') : ''}
        ${tempo.length ? kartuPeringatan('⏰', 'Piutang Jatuh Tempo', rp(sum(tempo, sisaPiutang)),
          tempo.slice(0, 3).map(j => `${esc(j.mitraNama)} (${selisihHari(j.jatuhTempo)} hari)`).join(', '), 'piutang', 'bad') : ''}
        ${konsTelat.length ? kartuPeringatan('🤝', 'Konsinyasi Lewat Tempo', `${konsTelat.length} titipan`,
          konsTelat.slice(0, 3).map(k => esc(get('mitra', k.mitraId)?.nama || '-')).join(', '), 'konsinyasi', 'violet') : ''}
        ${komPending > 0 ? kartuPeringatan('🎯', 'Komisi Belum Dibayar', rp(komPending),
          'Bayarkan komisi sales agar catatan kas akurat', 'komisi', 'info') : ''}
      </div>` : ''}

    <div class="grid gauto mb12">
      <div class="card">
        <div class="card-head"><h2>📊 Kinerja Bulan Ini</h2>
          <a class="btn btn-xs btn-ghost" href="#/laporan">Detail ›</a></div>
        <div class="card-body">
          <div class="kv"><span class="k">Omzet</span><span class="v">${rp(rBulan.omzet)}</span></div>
          <div class="kv"><span class="k">Laba kotor</span><span class="v pos">${rp(rBulan.labaKotor)}</span></div>
          <div class="kv"><span class="k">Komisi sales</span><span class="v neg">− ${rp(rBulan.komisi)}</span></div>
          <div class="kv"><span class="k">Biaya operasional</span><span class="v neg">− ${rp(rBulan.biaya)}</span></div>
          <div class="kv total"><span class="k">Laba bersih</span>
            <span class="v" style="color:${rBulan.labaBersih >= 0 ? 'var(--ok)' : 'var(--bad)'}">${rp(rBulan.labaBersih)}</span></div>
          <div class="divider"></div>
          <div class="kv"><span class="k">Penjualan putus</span><span class="v">${rp(rBulan.putus)}</span></div>
          <div class="kv"><span class="k">Hasil konsinyasi</span><span class="v">${rp(rBulan.konsinyasi)}</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>📦 Posisi Persediaan</h2>
          <a class="btn btn-xs btn-ghost" href="#/stok">Detail ›</a></div>
        <div class="card-body">
          <div class="kv"><span class="k">Nilai stok gudang</span><span class="v">${rp(nilaiPersediaan())}</span></div>
          <div class="kv"><span class="k">Unit di gudang</span><span class="v">${num(sum(db.produk, p => p.stok))}</span></div>
          <div class="kv"><span class="k">Unit dititipkan ke mitra</span><span class="v">${num(stokKonsinyasi())}</span></div>
          <div class="kv"><span class="k">Produk aktif</span><span class="v">${num(db.produk.filter(p => p.aktif !== false).length)}</span></div>
          <div class="kv"><span class="k">Hutang supplier</span><span class="v neg">${rp(totalHutang())}</span></div>
        </div>
      </div>
    </div>

    ${grafik(omzetHarian(14))}

    <div class="grid gauto">
      <div class="card">
        <div class="card-head"><h2>🏆 Produk Terlaris</h2><span class="muted xs">bulan ini</span></div>
        <div class="list" id="terlaris"></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>🕒 Transaksi Terakhir</h2>
          <a class="btn btn-xs btn-ghost" href="#/penjualan">Semua ›</a></div>
        <div class="list" id="terakhir"></div>
      </div>
    </div>`;

  // produk terlaris
  const top = produkTerlaris(awalBulan(), akhirBulan(), 5);
  view.querySelector('#terlaris').innerHTML = top.length ? top.map((m, i) => `
    <div class="row-item" data-ke="stok/${m.produkId}">
      <div class="avatar ${i === 0 ? '' : 'i'}">${i + 1}</div>
      <div class="ri-main"><div class="ri-title">${esc(m.produk?.nama || '-')}</div>
        <div class="ri-sub">${num(m.qty)} unit · laba ${rp(m.laba)}</div></div>
      <div class="ri-right"><div class="ri-val">${rpShort(m.omzet)}</div></div>
    </div>`).join('')
    : kosongState('🏆', 'Belum ada penjualan', 'Data terlaris muncul setelah ada transaksi.');

  // transaksi terakhir
  view.querySelector('#terakhir').innerHTML = terakhir.length ? terakhir.map(j => {
    const sisa = sisaPiutang(j);
    return `<div class="row-item" data-nota="${j.id}">
      <div class="avatar ${j.jenis === 'konsinyasi' ? 'v' : ''}">${j.jenis === 'konsinyasi' ? '🤝' : '🧾'}</div>
      <div class="ri-main"><div class="ri-title">${esc(j.mitraNama)} ${sisa > 0 ? badge('piutang', 'warn') : ''}</div>
        <div class="ri-sub">${esc(j.noRef)} · ${fmtTglPendek(j.tanggal)} ${fmtJam(j.dibuat)}</div></div>
      <div class="ri-right"><div class="ri-val">${rp(j.total)}</div></div>
    </div>`;
  }).join('') : kosongState('🧾', 'Belum ada transaksi', 'Mulai penjualan pertama Anda.',
    '<a class="btn btn-primary btn-sm" href="#/kasir">＋ Jual Sekarang</a>');

  view.addEventListener('click', e => {
    const ke = e.target.closest('[data-ke]');
    if (ke) return pergi(ke.dataset.ke);
    const nota = e.target.closest('[data-nota]');
    if (nota) {
      const j = get('penjualan', nota.dataset.nota);
      if (j) tampilkanStruk(j);
    }
  });

  view.querySelector('#muatContoh')?.addEventListener('click', async () => {
    const { isiContoh } = await import('../core/seed.js');
    isiContoh();
    location.reload();
  });
}

const kartuPeringatan = (ikon, judul, nilai, sub, ke, warna) => `
  <div class="card" data-ke="${ke}" style="cursor:pointer;border-left:3px solid var(--${warna})">
    <div class="card-body">
      <div class="flex" style="align-items:flex-start">
        <span style="font-size:22px">${ikon}</span>
        <div class="grow">
          <div class="b sm">${esc(judul)}</div>
          <div style="font-size:16px;font-weight:750;margin:2px 0;color:var(--${warna})">${nilai}</div>
          <div class="xs muted">${sub}</div>
        </div>
        <span class="muted">›</span>
      </div>
    </div>
  </div>`;

function grafik(data) {
  const maks = Math.max(...data.map(d => d.omzet), 1);
  const W = 100, H = 40, lebar = W / data.length;
  return `
  <div class="card mb12">
    <div class="card-head"><h2>📈 Omzet 14 Hari Terakhir</h2>
      <span class="muted xs">total ${rpShort(sum(data, d => d.omzet))}</span></div>
    <div class="card-body">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:130px" role="img" aria-label="Grafik omzet 14 hari">
        ${data.map((d, i) => {
          const t = Math.max(d.omzet / maks * (H - 4), 0.5);
          return `<rect x="${i * lebar + lebar * 0.18}" y="${H - t}" width="${lebar * 0.64}" height="${t}" rx="0.5"
            fill="var(--primary)" opacity="${0.4 + 0.6 * (d.omzet / maks)}">
            <title>${fmtTgl(d.tanggal)}: ${rp(d.omzet)}</title></rect>`;
        }).join('')}
      </svg>
      <div class="flex between mt8">
        <span class="xs muted">${fmtTglPendek(data[0].tanggal)}</span>
        <span class="xs muted">tertinggi ${rpShort(maks)}</span>
        <span class="xs muted">hari ini</span>
      </div>
    </div>
  </div>`;
}
