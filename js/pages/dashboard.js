/* pages/dashboard.js — ringkasan harian & pintasan, menyesuaikan peran perangkat */
import { db, get } from '../core/store.js';
import {
  ringkasan, omzetHarian, produkTerlaris, saldoKas, totalPiutang, totalHutang, produkMenipis, piutangJatuhTempo, komisiTertunda, stokKonsinyasi, nilaiPersediaan, penjualanAktif, sisaPiutang, rincianKonsinyasi, komisiSales,
} from '../core/domain.js';
import { setJudul, setTopbar, setFab, kosongState, statTile, badge } from '../core/ui.js';
import { tampilkanStruk } from '../core/struk.js';
import { pergi } from '../core/router.js';
import {
  adalah, isOwner, salesAktif, mitraAktif, filterPenjualan, filterMitra, filterKonsinyasi,
} from '../core/peran.js';
import {
  esc, rp, rpShort, num, toNum, sum, sortBy, fmtTgl, fmtTglPendek, fmtJam, todayISO, awalBulan, akhirBulan, selisihHari,
} from '../core/utils.js';

const salam = () => {
  const j = new Date().getHours();
  return j < 11 ? 'Selamat pagi' : j < 15 ? 'Selamat siang' : j < 18 ? 'Selamat sore' : 'Selamat malam';
};

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

function grafik(data, judul = '📈 Omzet 14 Hari Terakhir') {
  const maks = Math.max(...data.map(d => d.omzet), 1);
  const W = 100, H = 40, lebar = W / data.length;
  return `
  <div class="card mb12">
    <div class="card-head"><h2>${judul}</h2>
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

/** omzet harian yang sudah disaring sesuai peran */
function omzetHarianPeran(n = 14) {
  const out = [];
  const hariIni = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hariIni);
    d.setDate(d.getDate() - i);
    const iso = d.toLocaleDateString('sv-SE');
    const j = filterPenjualan(penjualanAktif(iso, iso));
    out.push({ tanggal: iso, omzet: sum(j, x => x.total), trx: j.length });
  }
  return out;
}

function pasangKlik(view) {
  view.addEventListener('click', e => {
    const ke = e.target.closest('[data-ke]');
    if (ke) return pergi(ke.dataset.ke);
    const nota = e.target.closest('[data-nota]');
    if (nota) {
      const j = get('penjualan', nota.dataset.nota);
      if (j) tampilkanStruk(j);
    }
  });
}

/* =========================================================
   BERANDA PEMILIK & SALES
   ========================================================= */
const PINTASAN_OWNER = [
  { ke: 'kasir', ikon: '🧾', teks: 'Jual', warna: 'var(--primary-soft)', ink: 'var(--primary)' },
  { ke: 'konsinyasi/baru', ikon: '🤝', teks: 'Titip', warna: 'var(--violet-soft)', ink: 'var(--violet)' },
  { ke: 'pembelian/baru', ikon: '📥', teks: 'Stok Masuk', warna: 'var(--info-soft)', ink: 'var(--info)' },
  { ke: 'opname/baru', ikon: '📋', teks: 'Opname', warna: 'var(--warn-soft)', ink: 'var(--warn)' },
  { ke: 'kas', ikon: '🏦', teks: 'Kas', warna: 'var(--ok-soft)', ink: 'var(--ok)' },
  { ke: 'komisi', ikon: '🎯', teks: 'Komisi', warna: 'var(--bad-soft)', ink: 'var(--bad)' },
];
const PINTASAN_SALES = [
  { ke: 'kasir', ikon: '🧾', teks: 'Jual', warna: 'var(--primary-soft)', ink: 'var(--primary)' },
  { ke: 'konsinyasi/baru', ikon: '🤝', teks: 'Titip', warna: 'var(--violet-soft)', ink: 'var(--violet)' },
  { ke: 'mitra', ikon: '🏪', teks: 'Mitra', warna: 'var(--info-soft)', ink: 'var(--info)' },
  { ke: 'piutang', ikon: '📌', teks: 'Tagihan', warna: 'var(--warn-soft)', ink: 'var(--warn)' },
  { ke: 'produk', ikon: '🚬', teks: 'Harga', warna: 'var(--ok-soft)', ink: 'var(--ok)' },
  { ke: 'komisi', ikon: '🎯', teks: 'Komisi', warna: 'var(--bad-soft)', ink: 'var(--bad)' },
];

function dashboardKerja(view) {
  const owner = isOwner();
  const sales = salesAktif();
  const hari = todayISO();

  const jualHari = filterPenjualan(penjualanAktif(hari, hari));
  const jualBulan = filterPenjualan(penjualanAktif(awalBulan(), akhirBulan()));
  const omzetHari = sum(jualHari, j => j.total);
  const omzetBulan = sum(jualBulan, j => j.total);
  const qtyHari = sum(jualHari, j => sum(j.items, i => i.qty));

  const rHari = owner ? ringkasan(hari, hari) : null;
  const rBulan = owner ? ringkasan(awalBulan(), akhirBulan()) : null;

  const binaan = filterMitra(db.mitra);
  const piutangSaya = sum(filterPenjualan(db.penjualan.filter(j => j.status !== 'batal')), sisaPiutang);
  const tempo = filterPenjualan(piutangJatuhTempo());
  const menipis = owner ? produkMenipis() : [];
  const komPending = owner ? komisiTertunda() : komisiTertunda(sales?.id);
  const komBulan = sum(komisiSales(owner ? null : sales?.id, { dari: awalBulan(), sampai: akhirBulan() }), k => k.nilai);
  const konsTelat = filterKonsinyasi(db.konsinyasi)
    .filter(k => k.status === 'aktif' && k.jatuhTempo && k.jatuhTempo < hari);
  const terakhir = sortBy(filterPenjualan(penjualanAktif()), j => `${j.tanggal}${j.dibuat}`, true).slice(0, 6);
  const titipanSaya = sum(binaan, m => stokKonsinyasi(null, m.id));

  setJudul(`${salam()}${owner && db.pengaturan.pemilik ? ', ' + db.pengaturan.pemilik.split(' ')[0]
    : sales ? ', ' + sales.nama.split(' ')[0] : ''}!`, fmtTgl(hari));
  setTopbar([{ teks: 'Jual', ikon: '🧾', onClick: () => pergi('kasir') }]);
  setFab({ ikon: '🧾', teks: 'Penjualan baru', onClick: () => pergi('kasir') });

  const pintasan = owner ? PINTASAN_OWNER : PINTASAN_SALES;
  const belumAdaData = owner && !db.produk.length;

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
      ${statTile({ label: 'Omzet Hari Ini', nilai: rp(omzetHari), sub: `${jualHari.length} transaksi · ${num(qtyHari)} unit`, warna: 'ok', ikon: '💰' })}
      ${owner
        ? statTile({ label: 'Laba Kotor Hari Ini', nilai: rp(rHari.labaKotor), sub: rHari.omzet ? `margin ${num(rHari.marginPersen, 1)}%` : '—', warna: 'info', ikon: '📈' })
        : statTile({ label: 'Komisi Bulan Ini', nilai: rp(komBulan), sub: komPending > 0 ? `${rp(komPending)} belum dibayar` : 'semua sudah dibayar', warna: 'info', ikon: '🎯' })}
      ${owner
        ? statTile({ label: 'Saldo Kas', nilai: rp(saldoKas()), sub: 'posisi terkini', warna: saldoKas() >= 0 ? 'ok' : 'bad', ikon: '🏦' })
        : statTile({ label: 'Omzet Bulan Ini', nilai: rp(omzetBulan), sub: `${jualBulan.length} transaksi`, warna: 'violet', ikon: '📅' })}
      ${statTile({
        label: owner ? 'Piutang Beredar' : 'Piutang Mitra Binaan', nilai: rp(owner ? totalPiutang() : piutangSaya),
        sub: `${tempo.length} nota lewat tempo`, warna: (owner ? totalPiutang() : piutangSaya) > 0 ? 'bad' : 'ok', ikon: '📌',
      })}
    </div>

    ${!owner && sales?.target ? `
      <div class="card mb12"><div class="card-body">
        <div class="flex between"><span class="sm b">Capaian Target Bulan Ini</span>
          <span class="sm">${num(omzetBulan / toNum(sales.target) * 100, 1)}%</span></div>
        <div class="bar"><i class="${omzetBulan >= toNum(sales.target) ? 'ok' : ''}" style="width:${Math.min(100, omzetBulan / toNum(sales.target) * 100)}%"></i></div>
        <div class="hint">${rp(omzetBulan)} dari target ${rp(sales.target)}</div>
      </div></div>` : ''}

    <div class="card mb12">
      <div class="card-head"><h2>⚡ Aksi Cepat</h2></div>
      <div class="card-body tight">
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">
          ${pintasan.map(a => `
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
        ${komPending > 0 ? kartuPeringatan('🎯', owner ? 'Komisi Belum Dibayar' : 'Komisi Saya Belum Cair', rp(komPending),
          owner ? 'Bayarkan komisi sales agar catatan kas akurat' : 'Menunggu pembayaran dari pemilik', 'komisi', 'info') : ''}
      </div>` : ''}

    <div class="grid gauto mb12">
      <div class="card">
        <div class="card-head"><h2>📊 Kinerja Bulan Ini</h2>
          ${owner ? '<a class="btn btn-xs btn-ghost" href="#/laporan">Detail ›</a>' : ''}</div>
        <div class="card-body">
          <div class="kv"><span class="k">Omzet</span><span class="v">${rp(owner ? rBulan.omzet : omzetBulan)}</span></div>
          ${owner ? `
            <div class="kv"><span class="k">Laba kotor</span><span class="v pos">${rp(rBulan.labaKotor)}</span></div>
            <div class="kv"><span class="k">Komisi sales</span><span class="v neg">− ${rp(rBulan.komisi)}</span></div>
            <div class="kv"><span class="k">Biaya operasional</span><span class="v neg">− ${rp(rBulan.biaya)}</span></div>
            <div class="kv total"><span class="k">Laba bersih</span>
              <span class="v" style="color:${rBulan.labaBersih >= 0 ? 'var(--ok)' : 'var(--bad)'}">${rp(rBulan.labaBersih)}</span></div>
            <div class="divider"></div>
            <div class="kv"><span class="k">Penjualan putus</span><span class="v">${rp(rBulan.putus)}</span></div>
            <div class="kv"><span class="k">Hasil konsinyasi</span><span class="v">${rp(rBulan.konsinyasi)}</span></div>`
          : `
            <div class="kv"><span class="k">Jumlah transaksi</span><span class="v">${jualBulan.length}</span></div>
            <div class="kv"><span class="k">Unit terjual</span><span class="v">${num(sum(jualBulan, j => sum(j.items, i => i.qty)))}</span></div>
            <div class="kv"><span class="k">Penjualan putus</span><span class="v">${rp(sum(jualBulan.filter(j => j.jenis !== 'konsinyasi'), j => j.total))}</span></div>
            <div class="kv"><span class="k">Hasil konsinyasi</span><span class="v">${rp(sum(jualBulan.filter(j => j.jenis === 'konsinyasi'), j => j.total))}</span></div>
            <div class="kv total"><span class="k">Komisi saya</span><span class="v">${rp(komBulan)}</span></div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>${owner ? '📦 Posisi Persediaan' : '🏪 Mitra Binaan'}</h2>
          <a class="btn btn-xs btn-ghost" href="#/${owner ? 'stok' : 'mitra'}">Detail ›</a></div>
        <div class="card-body">
          ${owner ? `
            <div class="kv"><span class="k">Nilai stok gudang</span><span class="v">${rp(nilaiPersediaan())}</span></div>
            <div class="kv"><span class="k">Unit di gudang</span><span class="v">${num(sum(db.produk, p => p.stok))}</span></div>
            <div class="kv"><span class="k">Unit dititipkan ke mitra</span><span class="v">${num(stokKonsinyasi())}</span></div>
            <div class="kv"><span class="k">Produk aktif</span><span class="v">${num(db.produk.filter(p => p.aktif !== false).length)}</span></div>
            <div class="kv"><span class="k">Hutang supplier</span><span class="v neg">${rp(totalHutang())}</span></div>`
          : `
            <div class="kv"><span class="k">Jumlah mitra binaan</span><span class="v">${binaan.length}</span></div>
            <div class="kv"><span class="k">Agen</span><span class="v">${binaan.filter(m => m.tipe === 'agen').length}</span></div>
            <div class="kv"><span class="k">Reseller</span><span class="v">${binaan.filter(m => m.tipe === 'reseller').length}</span></div>
            <div class="kv"><span class="k">Unit dititipkan</span><span class="v">${num(titipanSaya)}</span></div>
            <div class="kv"><span class="k">Piutang binaan</span><span class="v neg">${rp(piutangSaya)}</span></div>`}
        </div>
      </div>
    </div>

    ${grafik(owner ? omzetHarian(14) : omzetHarianPeran(14), owner ? '📈 Omzet 14 Hari Terakhir' : '📈 Omzet Saya 14 Hari Terakhir')}

    <div class="grid gauto">
      ${owner ? `<div class="card">
        <div class="card-head"><h2>🏆 Produk Terlaris</h2><span class="muted xs">bulan ini</span></div>
        <div class="list" id="terlaris"></div>
      </div>` : ''}
      <div class="card">
        <div class="card-head"><h2>🕒 Transaksi Terakhir</h2>
          <a class="btn btn-xs btn-ghost" href="#/penjualan">Semua ›</a></div>
        <div class="list" id="terakhir"></div>
      </div>
    </div>`;

  if (owner) {
    const top = produkTerlaris(awalBulan(), akhirBulan(), 5);
    view.querySelector('#terlaris').innerHTML = top.length ? top.map((m, i) => `
      <div class="row-item" data-ke="stok/${m.produkId}">
        <div class="avatar ${i === 0 ? '' : 'i'}">${i + 1}</div>
        <div class="ri-main"><div class="ri-title">${esc(m.produk?.nama || '-')}</div>
          <div class="ri-sub">${num(m.qty)} unit · laba ${rp(m.laba)}</div></div>
        <div class="ri-right"><div class="ri-val">${rpShort(m.omzet)}</div></div>
      </div>`).join('')
      : kosongState('🏆', 'Belum ada penjualan', 'Data terlaris muncul setelah ada transaksi.');
  }

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

  pasangKlik(view);
  view.querySelector('#muatContoh')?.addEventListener('click', async () => {
    const { isiContoh } = await import('../core/seed.js');
    isiContoh();
    location.reload();
  });
}

/* =========================================================
   BERANDA AGEN / RESELLER
   ========================================================= */
function dashboardMitra(view) {
  const m = mitraAktif();
  if (!m) {
    view.innerHTML = kosongState('❓', 'Data mitra tidak ditemukan',
      'Peran perangkat menunjuk mitra yang sudah dihapus. Ganti peran lewat menu.');
    return;
  }

  const notaSaya = filterPenjualan(penjualanAktif());
  const belumLunas = notaSaya.filter(j => sisaPiutang(j) > 0.5);
  const tagihan = sum(belumLunas, sisaPiutang);
  const tempo = belumLunas.filter(j => j.jatuhTempo && j.jatuhTempo < todayISO());
  const titipan = rincianKonsinyasi({ mitraId: m.id });
  const nilaiTitipan = sum(titipan, t => t.sisa * t.harga);
  const bulanIni = notaSaya.filter(j => j.tanggal >= awalBulan() && j.tanggal <= akhirBulan());
  const sales = m.salesId ? get('sales', m.salesId) : null;

  setJudul(`${salam()}, ${m.nama.split(' ')[0]}!`, `${m.tipe === 'agen' ? 'Agen' : 'Reseller'} · ${fmtTgl(todayISO())}`);
  setTopbar([]);
  setFab(null);

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: 'Tagihan Saya', nilai: rp(tagihan), sub: `${belumLunas.length} nota belum lunas`, warna: tagihan > 0 ? 'bad' : 'ok', ikon: '📌' })}
      ${statTile({ label: 'Barang Titipan', nilai: num(sum(titipan, t => t.sisa)), sub: `senilai ${rp(nilaiTitipan)}`, warna: 'violet', ikon: '🤝' })}
      ${statTile({ label: 'Pembelian Bulan Ini', nilai: rp(sum(bulanIni, j => j.total)), sub: `${bulanIni.length} nota`, warna: 'info', ikon: '🧾' })}
      ${statTile({ label: 'Lewat Jatuh Tempo', nilai: num(tempo.length), sub: tempo.length ? 'segera dilunasi' : 'aman', warna: tempo.length ? 'bad' : 'ok', ikon: '⏰' })}
    </div>

    ${tempo.length ? `
      <div class="card mb12" style="border-left:3px solid var(--bad)">
        <div class="card-body">
          <div class="b sm" style="color:var(--bad)">⏰ Ada ${tempo.length} nota yang sudah lewat jatuh tempo</div>
          <div class="xs muted mt4">${tempo.slice(0, 3).map(j => `${esc(j.noRef)} (telat ${selisihHari(j.jatuhTempo)} hari)`).join(', ')}</div>
        </div>
      </div>` : ''}

    <div class="card mb12">
      <div class="card-head"><h2>ℹ️ Data Akun</h2></div>
      <div class="card-body">
        <div class="kv"><span class="k">Nama</span><span class="v">${esc(m.nama)}</span></div>
        <div class="kv"><span class="k">Kode mitra</span><span class="v mono">${esc(m.kode)}</span></div>
        <div class="kv"><span class="k">Tipe harga</span><span class="v">${m.tipe === 'agen' ? 'Harga Agen' : 'Harga Reseller'}</span></div>
        <div class="kv"><span class="k">Tempo kredit</span><span class="v">${num(m.tempoHari)} hari</span></div>
        ${toNum(m.plafon) > 0 ? `<div class="kv"><span class="k">Sisa plafon</span>
          <span class="v">${rp(Math.max(0, toNum(m.plafon) - tagihan))} dari ${rp(m.plafon)}</span></div>` : ''}
        ${sales ? `<div class="kv"><span class="k">Sales pendamping</span>
          <span class="v">${esc(sales.nama)}${sales.telp ? ' · ' + esc(sales.telp) : ''}</span></div>` : ''}
      </div>
    </div>

    ${titipan.length ? `
      <div class="section-title">Barang Titipan yang Belum Terjual</div>
      <div class="card mb12"><div class="table-wrap"><table class="tbl stack">
        <thead><tr><th>Produk</th><th class="num">Harga</th><th class="num">Sisa</th><th class="num">Nilai</th></tr></thead>
        <tbody>${titipan.map(t => `<tr>
          <td data-l="Produk"><span class="strong">${esc(get('produk', t.produkId)?.nama || '-')}</span></td>
          <td data-l="Harga" class="num"><span>${rp(t.harga)}</span></td>
          <td data-l="Sisa" class="num strong"><span>${num(t.sisa)}</span></td>
          <td data-l="Nilai" class="num"><span>${rp(t.sisa * t.harga)}</span></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2">Total</td>
          <td class="num">${num(sum(titipan, t => t.sisa))}</td>
          <td class="num">${rp(nilaiTitipan)}</td></tr></tfoot>
      </table></div></div>` : ''}

    ${belumLunas.length ? `
      <div class="section-title">Nota Belum Lunas</div>
      <div class="card mb12"><div class="list">
        ${sortBy(belumLunas, j => j.tanggal).map(j => {
          const telat = j.jatuhTempo && j.jatuhTempo < todayISO();
          return `<div class="row-item" data-nota="${j.id}">
            <div class="avatar ${telat ? 'w' : ''}">🧾</div>
            <div class="ri-main">
              <div class="ri-title">${esc(j.noRef)} ${telat ? badge('lewat tempo', 'bad') : badge('belum lunas', 'warn')}</div>
              <div class="ri-sub">${fmtTgl(j.tanggal)}${j.jatuhTempo ? ` · tempo ${fmtTglPendek(j.jatuhTempo)}` : ''} · total ${rp(j.total)}</div>
            </div>
            <div class="ri-right"><div class="ri-val neg">${rp(sisaPiutang(j))}</div>
              <div class="ri-note">sisa</div></div>
          </div>`;
        }).join('')}
      </div></div>` : ''}

    <div class="card">
      <div class="card-head"><h2>🕒 Nota Terakhir</h2>
        <a class="btn btn-xs btn-ghost" href="#/penjualan">Semua ›</a></div>
      <div class="list">
        ${notaSaya.length ? sortBy(notaSaya, j => `${j.tanggal}${j.dibuat}`, true).slice(0, 6).map(j => `
          <div class="row-item" data-nota="${j.id}">
            <div class="avatar ${j.jenis === 'konsinyasi' ? 'v' : ''}">${j.jenis === 'konsinyasi' ? '🤝' : '🧾'}</div>
            <div class="ri-main"><div class="ri-title">${esc(j.noRef)}
              ${sisaPiutang(j) > 0 ? badge('belum lunas', 'warn') : badge('lunas', 'ok')}</div>
              <div class="ri-sub">${fmtTgl(j.tanggal)} · ${num(sum(j.items, i => i.qty))} unit</div></div>
            <div class="ri-right"><div class="ri-val">${rp(j.total)}</div></div>
          </div>`).join('')
        : kosongState('🧾', 'Belum ada nota', 'Nota pembelian Anda akan muncul di sini.')}
      </div>
    </div>`;

  pasangKlik(view);
}

export function render(view) {
  return adalah('mitra') ? dashboardMitra(view) : dashboardKerja(view);
}
