/* pages/sales.js — master sales & skema komisi */
import { db, add, update, remove, get } from '../core/store.js';
import { SKEMA_KOMISI, rekapKomisi, komisiTertunda, komisiSales, penjualanAktif } from '../core/domain.js';
import {
  setJudul, setTopbar, setFab, formModal, konfirmasi, sukses, gagal, kosongState, statTile, badge, modal, avatarEl,
} from '../core/ui.js';
import { segarkan, pergi } from '../core/router.js';
import { esc, rp, num, toNum, cocok, sum, debounce, sortBy, awalBulan, akhirBulan } from '../core/utils.js';

let filter = { q: '', periode: 'bulan' };

const rentang = () => filter.periode === 'bulan'
  ? { dari: awalBulan(), sampai: akhirBulan(), label: 'bulan ini' }
  : { dari: null, sampai: null, label: 'semua periode' };

const fields = [
  { name: 'kode', label: 'Kode Sales', wajib: true, placeholder: 'SLS-01' },
  { name: 'nama', label: 'Nama Sales', wajib: true, placeholder: 'Budi Santoso' },
  { name: 'telp', label: 'No. HP', tipe: 'tel' },
  {
    name: 'skema', label: 'Skema Komisi', tipe: 'select', wajib: true, lebar: 'full',
    opsi: Object.entries(SKEMA_KOMISI).map(([v, o]) => ({ value: v, label: o.label })),
  },
  { name: 'nilai', label: 'Nilai Komisi', tipe: 'number', min: 0, step: 'any', wajib: true, hint: 'Isi 2 untuk 2%, atau 2000 untuk Rp2.000/unit' },
  { name: 'target', label: 'Target Omzet /bulan', tipe: 'rupiah', hint: 'Opsional, untuk memantau capaian' },
  { name: 'aktif', label: 'Sales aktif', tipe: 'check', nilai: true, lebar: 'full' },
];

const jelaskanSkema = s => {
  const n = toNum(s.nilai);
  if (s.skema === 'nominal_unit') return `${rp(n)} per unit terjual`;
  if (s.skema === 'persen_laba') return `${num(n, 2)}% dari laba kotor`;
  return `${num(n, 2)}% dari omzet`;
};

function formSales(data = null) {
  formModal({
    judul: data ? 'Ubah Sales' : 'Sales Baru',
    fields, lebar: 'wide',
    data: data || { skema: 'persen_omzet', nilai: 2, aktif: true },
    extra: `<div class="card mt8"><div class="card-body">
      <div class="lbl-t">ℹ️ Cara komisi dihitung</div>
      <ul class="sm muted" style="margin:0;padding-left:18px;line-height:1.7">
        <li><b>% dari omzet</b> — komisi = persentase × nilai penjualan (setelah diskon).</li>
        <li><b>% dari laba kotor</b> — komisi = persentase × (penjualan − harga beli). Aman untuk margin tipis.</li>
        <li><b>Rp per unit</b> — komisi = nominal × jumlah unit terjual.</li>
        <li>Bila sebuah produk punya <b>Komisi /unit</b> sendiri, nilai produk itu yang dipakai.</li>
      </ul>
    </div></div>`,
    onSimpan: nilai => {
      if (db.sales.some(s => s.kode.toLowerCase() === nilai.kode.toLowerCase() && s.id !== data?.id)) {
        gagal(`Kode "${nilai.kode}" sudah dipakai`); return false;
      }
      if (data) { update('sales', data.id, nilai); sukses('Data sales diperbarui'); }
      else { add('sales', nilai); sukses('Sales ditambahkan'); }
      segarkan();
    },
  });
}

function detailSales(s) {
  const { dari, sampai, label } = rentang();
  const kom = komisiSales(s.id, { dari, sampai });
  const binaan = db.mitra.filter(m => m.salesId === s.id);
  const trx = penjualanAktif(dari, sampai).filter(j => j.salesId === s.id);
  const omzet = sum(trx, j => j.total);
  const capaian = toNum(s.target) > 0 ? omzet / toNum(s.target) * 100 : null;

  modal({
    judul: s.nama, lebar: 'wide',
    isi: `
      <div class="flex flex-wrap mb12">
        ${badge(s.kode)} ${badge(jelaskanSkema(s), 'info')} ${s.aktif === false ? badge('Nonaktif', 'bad') : badge('Aktif', 'ok')}
      </div>
      <div class="grid g2 mb12">
        ${statTile({ label: `Omzet (${label})`, nilai: rp(omzet), sub: `${trx.length} transaksi`, warna: 'ok' })}
        ${statTile({ label: 'Komisi Belum Dibayar', nilai: rp(komisiTertunda(s.id)), sub: 'seluruh periode', warna: 'warn' })}
      </div>
      ${capaian != null ? `
        <div class="card mb12"><div class="card-body">
          <div class="flex between"><span class="sm b">Capaian Target ${label}</span><span class="sm">${num(capaian, 1)}%</span></div>
          <div class="bar"><i class="${capaian >= 100 ? 'ok' : capaian >= 60 ? '' : 'warn'}" style="width:${Math.min(100, capaian)}%"></i></div>
          <div class="hint">${rp(omzet)} dari target ${rp(s.target)}</div>
        </div></div>` : ''}
      <div class="card mb12"><div class="card-body">
        <div class="kv"><span class="k">Skema komisi</span><span class="v">${esc(jelaskanSkema(s))}</span></div>
        <div class="kv"><span class="k">Komisi periode ini</span><span class="v">${rp(sum(kom, k => k.nilai))}</span></div>
        <div class="kv"><span class="k">Sudah dibayar</span><span class="v pos">${rp(sum(kom.filter(k => k.status === 'dibayar'), k => k.nilai))}</span></div>
        <div class="kv"><span class="k">Mitra binaan</span><span class="v">${binaan.length} mitra</span></div>
        <div class="kv"><span class="k">Kontak</span><span class="v">${esc(s.telp || '-')}</span></div>
      </div></div>
      ${binaan.length ? `<div class="section-title">Mitra Binaan</div>
        <div class="card"><div class="list">
          ${binaan.map(m => `<div class="row-item">${avatarEl(m.nama, m.tipe === 'agen' ? 'i' : 'v')}
            <div class="ri-main"><div class="ri-title">${esc(m.nama)}</div>
            <div class="ri-sub">${esc(m.kode)} · ${m.tipe === 'agen' ? 'Agen' : 'Reseller'}</div></div></div>`).join('')}
        </div></div>` : ''}`,
    tombol: [
      { teks: '🎯 Rincian Komisi', kelas: 'btn-ghost', aksi: h => { h.tutup(); pergi(`komisi/${s.id}`); } },
      { teks: '✏️ Ubah', kelas: 'btn-primary', aksi: h => { h.tutup(); formSales(s); } },
    ],
  });
}

async function hapusSales(s) {
  const dipakai = db.komisi.some(k => k.salesId === s.id) || db.penjualan.some(j => j.salesId === s.id);
  if (dipakai) {
    const ya = await konfirmasi({
      judul: 'Sales punya riwayat',
      pesan: `<b>${esc(s.nama)}</b> sudah memiliki transaksi/komisi. Sebaiknya dinonaktifkan saja.`, ok: 'Nonaktifkan',
    });
    if (ya) { update('sales', s.id, { aktif: false }); sukses('Sales dinonaktifkan'); segarkan(); }
    return;
  }
  const ya = await konfirmasi({ judul: 'Hapus sales?', bahaya: true, ok: 'Hapus', pesan: `<b>${esc(s.nama)}</b> akan dihapus permanen.` });
  if (ya) { remove('sales', s.id); sukses('Sales dihapus'); segarkan(); }
}

export function render(view) {
  setJudul('Data Sales', `${db.sales.filter(s => s.aktif !== false).length} sales aktif`);
  setTopbar([{ teks: 'Sales Baru', ikon: '＋', onClick: () => formSales() }]);
  setFab({ ikon: '＋', teks: 'Sales baru', onClick: () => formSales() });

  const { dari, sampai, label } = rentang();
  const rekap = rekapKomisi({ dari, sampai });
  const totalKomisi = sum(rekap, r => r.total);
  const totalOmzet = sum(rekap, r => r.omzet);

  view.innerHTML = `
    <div class="grid g3 mb12">
      ${statTile({ label: 'Sales Aktif', nilai: num(db.sales.filter(s => s.aktif !== false).length), sub: 'tim penjualan', ikon: '👤' })}
      ${statTile({ label: `Omzet Sales (${label})`, nilai: rp(totalOmzet), sub: 'seluruh sales', warna: 'ok', ikon: '💰' })}
      ${statTile({ label: 'Komisi Belum Dibayar', nilai: rp(komisiTertunda()), sub: 'menunggu pembayaran', warna: 'warn', ikon: '🎯' })}
    </div>

    <div class="toolbar">
      <div class="search-wrap grow"><input class="input" id="cari" placeholder="Cari sales..." value="${esc(filter.q)}"></div>
      <select class="select" id="periode" style="max-width:170px">
        <option value="bulan">Bulan ini</option>
        <option value="semua">Semua periode</option>
      </select>
    </div>
    <div class="card"><div class="list" id="daftar"></div></div>`;

  view.querySelector('#periode').value = filter.periode;

  const daftar = view.querySelector('#daftar');
  const gambar = () => {
    const arr = sortBy(
      rekap.filter(r => cocok(`${r.sales.nama} ${r.sales.kode}`, filter.q)),
      r => r.omzet, true);

    if (!arr.length) {
      daftar.innerHTML = kosongState('👤', 'Belum ada sales',
        'Tambahkan sales beserta skema komisinya untuk mulai menghitung komisi otomatis.',
        '<button class="btn btn-primary" id="tk">＋ Tambah Sales</button>');
      daftar.querySelector('#tk')?.addEventListener('click', () => formSales());
      return;
    }

    daftar.innerHTML = arr.map(r => {
      const s = r.sales;
      return `<div class="row-item" data-id="${s.id}">
        ${avatarEl(s.nama)}
        <div class="ri-main">
          <div class="ri-title">${esc(s.nama)} ${s.aktif === false ? badge('Nonaktif', 'bad') : ''}
            ${r.pending > 0 ? badge(rp(r.pending) + ' pending', 'warn') : ''}</div>
          <div class="ri-sub">${esc(jelaskanSkema(s))} · ${r.trx} trx · omzet ${rp(r.omzet)}</div>
          ${r.capaian != null ? `<div class="bar" style="max-width:220px"><i class="${r.capaian >= 100 ? 'ok' : r.capaian >= 60 ? '' : 'warn'}" style="width:${Math.min(100, r.capaian)}%"></i></div>` : ''}
        </div>
        <div class="ri-right">
          <div class="ri-val">${rp(r.total)}</div>
          <div class="ri-note">komisi ${label}</div>
        </div>
        <button class="icon-btn" data-menu>⋮</button>
      </div>`;
    }).join('');
  };
  gambar();

  view.querySelector('#cari').addEventListener('input', debounce(e => { filter.q = e.target.value; gambar(); }, 180));
  view.querySelector('#periode').addEventListener('change', e => { filter.periode = e.target.value; segarkan(); });

  daftar.addEventListener('click', e => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const s = get('sales', row.dataset.id); if (!s) return;
    if (e.target.closest('[data-menu]')) {
      modal({
        judul: s.nama,
        isi: `<div class="list">
          <button class="row-item" data-a="detail"><span class="ico">👁️</span><div class="ri-main"><div class="ri-title">Detail & capaian</div></div></button>
          <button class="row-item" data-a="komisi"><span class="ico">🎯</span><div class="ri-main"><div class="ri-title">Rincian & bayar komisi</div></div></button>
          <button class="row-item" data-a="ubah"><span class="ico">✏️</span><div class="ri-main"><div class="ri-title">Ubah data</div></div></button>
          <button class="row-item" data-a="hapus"><span class="ico">🗑️</span><div class="ri-main"><div class="ri-title" style="color:var(--bad)">Hapus sales</div></div></button>
        </div>`,
        onBuka: (body, h) => body.addEventListener('click', ev => {
          const b = ev.target.closest('[data-a]'); if (!b) return;
          h.tutup();
          ({ detail: () => detailSales(s), ubah: () => formSales(s), hapus: () => hapusSales(s), komisi: () => pergi(`komisi/${s.id}`) })[b.dataset.a]();
        }),
      });
      return;
    }
    detailSales(s);
  });
}
