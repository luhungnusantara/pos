/* pages/kas.js — buku kas masuk & keluar */
import { db, save, setPengaturan } from '../core/store.js';
import { catatKas, saldoKas, KATEGORI_KAS } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, modal, konfirmasi, sukses, gagal, kosongState, statTile, badge, formModal,
} from '../core/ui.js';
import { htmlPeriode, pasangPeriode, hitungPeriode } from '../core/periode.js';
import { segarkan } from '../core/router.js';
import {
  esc, rp, toNum, cocok, sum, debounce, fmtTgl, sortBy, todayISO, groupBy, unduh, toCSV,
} from '../core/utils.js';

let f = { kode: 'bulan', dari: todayISO(), sampai: todayISO(), q: '', arah: 'semua' };

function formKas(arah) {
  const fields = [
    { name: 'tanggal', label: 'Tanggal', tipe: 'date', wajib: true, nilai: todayISO() },
    { name: 'jumlah', label: 'Jumlah', tipe: 'rupiah', wajib: true, min: 1 },
    {
      name: 'kategori', label: 'Kategori', tipe: 'select', wajib: true,
      opsi: KATEGORI_KAS[arah].map(k => ({ value: k, label: k })),
    },
    {
      name: 'metode', label: 'Metode', tipe: 'select',
      opsi: [{ value: 'tunai', label: 'Tunai' }, { value: 'transfer', label: 'Transfer' }],
    },
    { name: 'keterangan', label: 'Keterangan', wajib: true, lebar: 'full', placeholder: arah === 'masuk' ? 'Mis. setoran modal' : 'Mis. bayar listrik gudang' },
  ];
  formModal({
    judul: arah === 'masuk' ? '💵 Kas Masuk' : '💸 Kas Keluar',
    fields, simpanTeks: 'Simpan',
    onSimpan: nilai => {
      if (toNum(nilai.jumlah) <= 0) { gagal('Jumlah harus lebih dari nol'); return false; }
      catatKas({ ...nilai, arah });
      save(true);
      sukses(`Kas ${arah} ${rp(nilai.jumlah)} tercatat`);
      segarkan();
    },
  });
}

function detailKas(k) {
  const otomatis = !!k.sumber;
  modal({
    judul: k.arah === 'masuk' ? 'Kas Masuk' : 'Kas Keluar',
    isi: `
      <div class="flex flex-wrap mb12">
        ${badge(fmtTgl(k.tanggal))} ${badge(k.kategori, k.arah === 'masuk' ? 'ok' : 'warn')}
        ${badge(k.metode || 'tunai')} ${otomatis ? badge('Otomatis dari transaksi', 'info') : badge('Input manual')}
      </div>
      <div class="card"><div class="card-body">
        <div class="kv total"><span class="k">Jumlah</span>
          <span class="v ${k.arah === 'masuk' ? 'pos' : 'neg'}">${k.arah === 'masuk' ? '+' : '−'} ${rp(k.jumlah)}</span></div>
        <div class="kv"><span class="k">Keterangan</span><span class="v" style="max-width:60%">${esc(k.keterangan || '-')}</span></div>
      </div></div>
      ${otomatis ? '<div class="hint mt12">ℹ️ Catatan ini dibuat otomatis dari transaksi. Untuk mengubahnya, batalkan atau ubah transaksi asalnya.</div>' : ''}`,
    tombol: otomatis ? [{ teks: 'Tutup', kelas: 'btn-primary' }] : [
      {
        teks: '🗑️ Hapus', kelas: 'btn-danger', aksi: async h => {
          const ya = await konfirmasi({ judul: 'Hapus catatan kas?', bahaya: true, ok: 'Hapus', pesan: `${esc(k.keterangan)} — ${rp(k.jumlah)}` });
          if (!ya) return;
          db.kas = db.kas.filter(x => x.id !== k.id);
          save(true); h.tutup(); sukses('Catatan kas dihapus'); segarkan();
        },
      },
      { teks: 'Tutup', kelas: 'btn-ghost' },
    ],
  });
}

export function render(view) {
  const { dari, sampai, label } = hitungPeriode(f.kode, f);
  const semua = db.kas.filter(k => (!dari || k.tanggal >= dari) && (!sampai || k.tanggal <= sampai));
  const masuk = sum(semua.filter(k => k.arah === 'masuk'), k => k.jumlah);
  const keluar = sum(semua.filter(k => k.arah === 'keluar'), k => k.jumlah);

  setJudul('Buku Kas', `${label} · saldo ${rp(saldoKas())}`);
  setTopbar([
    { teks: 'Masuk', ikon: '💵', kelas: 'btn-sm btn-soft', onClick: () => formKas('masuk') },
    { teks: 'Keluar', ikon: '💸', kelas: 'btn-sm btn-primary', onClick: () => formKas('keluar') },
  ]);
  setFab({
    ikon: '＋', teks: 'Catat kas', onClick: () => modal({
      judul: 'Catat Kas',
      isi: `<div class="list">
        <button class="row-item" data-a="masuk"><span class="ico" style="font-size:20px">💵</span>
          <div class="ri-main"><div class="ri-title">Kas Masuk</div><div class="ri-sub">Modal, pendapatan lain</div></div></button>
        <button class="row-item" data-a="keluar"><span class="ico" style="font-size:20px">💸</span>
          <div class="ri-main"><div class="ri-title">Kas Keluar</div><div class="ri-sub">Operasional, gaji, sewa</div></div></button>
      </div>`,
      onBuka: (body, h) => body.addEventListener('click', e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        h.tutup(); formKas(b.dataset.a);
      }),
    }),
  });

  // rekap kategori pengeluaran
  const perKategori = Object.entries(groupBy(semua.filter(k => k.arah === 'keluar'), 'kategori'))
    .map(([kat, arr]) => ({ kat, total: sum(arr, k => k.jumlah) }))
    .sort((a, b) => b.total - a.total);
  const maxKat = perKategori[0]?.total || 1;

  view.innerHTML = `
    <div class="grid g4 mb12">
      ${statTile({ label: 'Saldo Kas Saat Ini', nilai: rp(saldoKas()), sub: 'termasuk saldo awal', warna: saldoKas() >= 0 ? 'ok' : 'bad', ikon: '🏦' })}
      ${statTile({ label: `Kas Masuk (${label})`, nilai: rp(masuk), sub: `${semua.filter(k => k.arah === 'masuk').length} transaksi`, warna: 'ok', ikon: '💵' })}
      ${statTile({ label: `Kas Keluar (${label})`, nilai: rp(keluar), sub: `${semua.filter(k => k.arah === 'keluar').length} transaksi`, warna: 'bad', ikon: '💸' })}
      ${statTile({ label: 'Arus Kas Bersih', nilai: rp(masuk - keluar), sub: label, warna: masuk - keluar >= 0 ? 'ok' : 'bad', ikon: '📊' })}
    </div>

    ${perKategori.length ? `
      <div class="card mb12">
        <div class="card-head"><h2>Pengeluaran per Kategori</h2><span class="muted xs">${label}</span></div>
        <div class="card-body">
          ${perKategori.slice(0, 6).map(k => `
            <div class="mb12">
              <div class="flex between"><span class="sm">${esc(k.kat)}</span><span class="sm b">${rp(k.total)}</span></div>
              <div class="bar"><i class="warn" style="width:${k.total / maxKat * 100}%"></i></div>
            </div>`).join('')}
        </div>
      </div>` : ''}

    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari keterangan / kategori..." value="${esc(f.q)}"></div>
      ${htmlPeriode(f.kode, f)}
      <button class="btn btn-sm btn-ghost" id="ekspor">⬇️</button>
    </div>
    <div class="chips mb12" id="chipArah">
      ${[['semua', 'Semua'], ['masuk', 'Masuk'], ['keluar', 'Keluar']]
        .map(([v, t]) => `<button class="chip ${f.arah === v ? 'active' : ''}" data-v="${v}">${t}</button>`).join('')}
      <button class="chip" id="saldoAwal">⚙️ Saldo awal: ${rp(db.pengaturan.saldoAwalKas)}</button>
    </div>

    <div id="daftar"></div>`;

  const box = view.querySelector('#daftar');
  const gambar = () => {
    let arr = semua.filter(k => cocok(`${k.keterangan} ${k.kategori}`, f.q));
    if (f.arah !== 'semua') arr = arr.filter(k => k.arah === f.arah);
    arr = sortBy(arr, k => `${k.tanggal}${k.dibuat}`, true);

    if (!arr.length) {
      box.innerHTML = `<div class="card">${kosongState('🏦', 'Belum ada catatan kas', `Tidak ada arus kas pada ${label}.`)}</div>`;
      return;
    }

    const perHari = groupBy(arr, 'tanggal');
    box.innerHTML = sortBy(Object.keys(perHari), t => t, true).map(tgl => {
      const isi = perHari[tgl];
      const net = sum(isi, k => (k.arah === 'masuk' ? 1 : -1) * toNum(k.jumlah));
      return `
      <div class="card mb12">
        <div class="card-head">
          <h3>${fmtTgl(tgl)}</h3>
          <span class="badge ${net >= 0 ? 'ok' : 'bad'}">${net >= 0 ? '+' : '−'} ${rp(Math.abs(net))}</span>
        </div>
        <div class="list">
          ${isi.map(k => `<div class="row-item" data-id="${k.id}">
            <div class="avatar ${k.arah === 'masuk' ? '' : 'w'}" style="${k.arah === 'masuk' ? 'background:var(--ok-soft);color:var(--ok)' : 'background:var(--bad-soft);color:var(--bad)'}">
              ${k.arah === 'masuk' ? '↓' : '↑'}</div>
            <div class="ri-main">
              <div class="ri-title">${esc(k.kategori)} ${k.sumber ? '' : badge('manual')}</div>
              <div class="ri-sub">${esc(k.keterangan || '-')} · ${esc(k.metode || 'tunai')}</div>
            </div>
            <div class="ri-right">
              <div class="ri-val ${k.arah === 'masuk' ? 'pos' : 'neg'}">${k.arah === 'masuk' ? '+' : '−'}${rp(k.jumlah)}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');
  };
  gambar();

  view.querySelector('#cari').addEventListener('input', debounce(e => { f.q = e.target.value; gambar(); }, 180));
  pasangPeriode(view, f, () => segarkan());
  view.querySelector('#chipArah').addEventListener('click', e => {
    const c = e.target.closest('.chip[data-v]'); if (!c) return;
    f.arah = c.dataset.v;
    view.querySelectorAll('#chipArah .chip[data-v]').forEach(x => x.classList.toggle('active', x === c));
    gambar();
  });
  view.querySelector('#saldoAwal').onclick = () => {
    formModal({
      judul: 'Saldo Awal Kas',
      fields: [{ name: 'saldoAwalKas', label: 'Saldo Awal', tipe: 'rupiah', hint: 'Uang kas sebelum aplikasi ini dipakai' }],
      data: { saldoAwalKas: db.pengaturan.saldoAwalKas },
      onSimpan: nilai => { setPengaturan(nilai); sukses('Saldo awal diperbarui'); segarkan(); },
    });
  };
  view.querySelector('#ekspor').onclick = () => {
    if (!semua.length) return gagal('Tidak ada data kas untuk diekspor');
    unduh(`kas-${todayISO()}.csv`, toCSV(sortBy(semua, k => k.tanggal).map(k => ({
      Tanggal: k.tanggal, Arah: k.arah, Kategori: k.kategori, Keterangan: k.keterangan,
      Metode: k.metode, Masuk: k.arah === 'masuk' ? k.jumlah : 0, Keluar: k.arah === 'keluar' ? k.jumlah : 0,
      Sumber: k.sumber?.tipe || 'manual',
    }))), 'text/csv');
    sukses('Buku kas diekspor');
  };
  box.addEventListener('click', e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const k = db.kas.find(x => x.id === row.dataset.id);
    if (k) detailKas(k);
  });
}
