/* pages/pengaturan.js — identitas toko, tema, cadangan data */
import { db, setPengaturan, exportDB, importDB, resetDB, kosongkanTransaksi, VERSI } from '../core/store.js';
import { setJudul, setTopbar, setFab, formModal, konfirmasi, sukses, gagal, statTile } from '../core/ui.js';
import { segarkan } from '../core/router.js';
import { terapkanTema } from '../app.js';
import { esc, rp, num, unduh, todayISO } from '../core/utils.js';

const ukuranData = () => {
  const b = new Blob([exportDB()]).size;
  return b > 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`;
};

function formToko() {
  formModal({
    judul: 'Identitas Toko',
    lebar: 'wide',
    fields: [
      { name: 'namaToko', label: 'Nama Toko / Distributor', wajib: true, lebar: 'full' },
      { name: 'pemilik', label: 'Nama Pemilik' },
      { name: 'telp', label: 'Telepon / WhatsApp', tipe: 'tel' },
      { name: 'alamat', label: 'Alamat', tipe: 'textarea', lebar: 'full' },
      { name: 'catatanStruk', label: 'Catatan pada Nota', tipe: 'textarea', lebar: 'full', hint: 'Tampil di bagian bawah nota' },
    ],
    data: db.pengaturan,
    onSimpan: nilai => { setPengaturan(nilai); sukses('Identitas toko diperbarui'); segarkan(); },
  });
}

function formTransaksi() {
  formModal({
    judul: 'Preferensi Transaksi',
    fields: [
      { name: 'saldoAwalKas', label: 'Saldo Awal Kas', tipe: 'rupiah', hint: 'Uang kas sebelum aplikasi dipakai' },
      { name: 'tempoDefault', label: 'Tempo Kredit Default (hari)', tipe: 'number', min: 0 },
      { name: 'peringatanStok', label: 'Tampilkan peringatan stok menipis', tipe: 'check', lebar: 'full' },
    ],
    data: db.pengaturan,
    onSimpan: nilai => { setPengaturan(nilai); sukses('Preferensi disimpan'); segarkan(); },
  });
}

function imporData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const ya = await konfirmasi({
      judul: '⚠️ Pulihkan cadangan?', bahaya: true, ok: 'Ya, timpa data',
      pesan: `Seluruh data saat ini akan <b>diganti</b> dengan isi berkas <b>${esc(file.name)}</b>.<br><br>Sebaiknya ekspor cadangan data sekarang terlebih dahulu.`,
    });
    if (!ya) return;
    try {
      importDB(await file.text());
      sukses('Data berhasil dipulihkan');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      gagal('Gagal memulihkan: ' + e.message);
    }
  };
  input.click();
}

export function render(view) {
  setJudul('Pengaturan', `Versi data ${VERSI} · ${ukuranData()}`);
  setTopbar([]);
  setFab(null);

  const p = db.pengaturan;
  const jumlah = {
    produk: db.produk.length, mitra: db.mitra.length, sales: db.sales.length,
    penjualan: db.penjualan.length, konsinyasi: db.konsinyasi.length,
    pembelian: db.pembelian.length, opname: db.opname.length, kas: db.kas.length,
  };

  view.innerHTML = `
    <div class="card mb12">
      <div class="card-head"><h2>🏬 Identitas Toko</h2>
        <button class="btn btn-sm" id="editToko">✏️ Ubah</button></div>
      <div class="card-body">
        <div class="kv"><span class="k">Nama</span><span class="v">${esc(p.namaToko || '-')}</span></div>
        <div class="kv"><span class="k">Pemilik</span><span class="v">${esc(p.pemilik || '-')}</span></div>
        <div class="kv"><span class="k">Telepon</span><span class="v">${esc(p.telp || '-')}</span></div>
        <div class="kv"><span class="k">Alamat</span><span class="v" style="max-width:60%">${esc(p.alamat || '-')}</span></div>
        <div class="kv"><span class="k">Catatan nota</span><span class="v" style="max-width:60%">${esc(p.catatanStruk || '-')}</span></div>
      </div>
    </div>

    <div class="card mb12">
      <div class="card-head"><h2>⚙️ Preferensi Transaksi</h2>
        <button class="btn btn-sm" id="editTrx">✏️ Ubah</button></div>
      <div class="card-body">
        <div class="kv"><span class="k">Saldo awal kas</span><span class="v">${rp(p.saldoAwalKas)}</span></div>
        <div class="kv"><span class="k">Tempo kredit default</span><span class="v">${num(p.tempoDefault)} hari</span></div>
        <div class="kv"><span class="k">Peringatan stok menipis</span><span class="v">${p.peringatanStok === false ? 'Nonaktif' : 'Aktif'}</span></div>
      </div>
    </div>

    <div class="card mb12">
      <div class="card-head"><h2>🎨 Tampilan</h2></div>
      <div class="card-body">
        <div class="lbl-t">Tema</div>
        <div class="seg" id="segTema">
          ${[['auto', '🌗 Ikuti Sistem'], ['terang', '☀️ Terang'], ['gelap', '🌙 Gelap']]
            .map(([v, t]) => `<button type="button" data-v="${v}" class="${(p.tema || 'auto') === v ? 'active' : ''}">${t}</button>`).join('')}
        </div>
        <div class="hint mt8">Aplikasi menyesuaikan diri untuk layar ponsel Android maupun iPhone, tablet, dan desktop.</div>
      </div>
    </div>

    <div class="card mb12">
      <div class="card-head"><h2>💾 Data & Cadangan</h2></div>
      <div class="card-body">
        <div class="grid g4 mb12">
          ${statTile({ label: 'Produk', nilai: num(jumlah.produk) })}
          ${statTile({ label: 'Mitra', nilai: num(jumlah.mitra) })}
          ${statTile({ label: 'Penjualan', nilai: num(jumlah.penjualan) })}
          ${statTile({ label: 'Konsinyasi', nilai: num(jumlah.konsinyasi) })}
        </div>
        <div class="hint mb12">📱 Data tersimpan di penyimpanan browser perangkat ini (${ukuranData()}).
          Data <b>tidak terkirim ke server manapun</b>. Ekspor cadangan secara berkala, terutama sebelum mengganti perangkat
          atau membersihkan data browser.</div>
        <div class="btn-row">
          <button class="btn btn-primary grow" id="ekspor">⬇️ Ekspor Cadangan (JSON)</button>
          <button class="btn grow" id="impor">⬆️ Pulihkan dari Cadangan</button>
        </div>
      </div>
    </div>

    <div class="card mb12">
      <div class="card-head"><h2>🧪 Data Contoh</h2></div>
      <div class="card-body">
        <div class="hint mb12">Muat data contoh berisi produk rokok, agen, reseller, sales, stok, konsinyasi, dan transaksi
          untuk mencoba seluruh fitur. <b>Seluruh data saat ini akan diganti.</b></div>
        <button class="btn btn-block" id="contoh">🧪 Muat Data Contoh</button>
      </div>
    </div>

    <div class="card mb12" style="border-color:var(--bad)">
      <div class="card-head"><h2 style="color:var(--bad)">⚠️ Zona Berbahaya</h2></div>
      <div class="card-body">
        <div class="btn-row">
          <button class="btn grow" id="hapusTrx">🧹 Hapus Semua Transaksi</button>
          <button class="btn btn-danger grow" id="reset">🗑️ Reset Total</button>
        </div>
        <div class="hint mt8">“Hapus Semua Transaksi” mempertahankan produk, mitra, dan sales — hanya menghapus transaksi dan menolkan stok.
          “Reset Total” mengosongkan seluruh data.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>ℹ️ Tentang Aplikasi</h2></div>
      <div class="card-body">
        <div class="kv"><span class="k">Aplikasi</span><span class="v">POS Rokok — Agen &amp; Reseller</span></div>
        <div class="kv"><span class="k">Teknologi</span><span class="v">HTML · CSS · JavaScript Module (tanpa framework)</span></div>
        <div class="kv"><span class="k">Penyimpanan</span><span class="v">localStorage (offline)</span></div>
        <div class="kv"><span class="k">Versi struktur data</span><span class="v">${VERSI}</span></div>
      </div>
    </div>`;

  view.querySelector('#editToko').onclick = formToko;
  view.querySelector('#editTrx').onclick = formTransaksi;

  view.querySelector('#segTema').onclick = e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    setPengaturan({ tema: b.dataset.v });
    terapkanTema(b.dataset.v);
    view.querySelectorAll('#segTema button').forEach(x => x.classList.toggle('active', x === b));
    sukses('Tema diperbarui');
  };

  view.querySelector('#ekspor').onclick = () => {
    unduh(`cadangan-pos-${todayISO()}.json`, exportDB());
    sukses('Cadangan berhasil diunduh');
  };
  view.querySelector('#impor').onclick = imporData;

  view.querySelector('#contoh').onclick = async () => {
    const ya = await konfirmasi({
      judul: 'Muat data contoh?', bahaya: true, ok: 'Ya, muat contoh',
      pesan: 'Seluruh data saat ini akan <b>dihapus dan diganti</b> dengan data contoh.',
    });
    if (!ya) return;
    const { isiContoh } = await import('../core/seed.js');
    isiContoh();
    sukses('Data contoh dimuat');
    setTimeout(() => location.reload(), 500);
  };

  view.querySelector('#hapusTrx').onclick = async () => {
    const ya = await konfirmasi({
      judul: 'Hapus semua transaksi?', bahaya: true, ok: 'Ya, hapus transaksi',
      pesan: 'Penjualan, pembelian, konsinyasi, opname, kas, dan komisi akan dihapus. Stok produk dikembalikan ke 0.<br><br>Data produk, mitra, dan sales tetap ada.',
    });
    if (!ya) return;
    kosongkanTransaksi();
    sukses('Seluruh transaksi dihapus');
    setTimeout(() => location.reload(), 500);
  };

  view.querySelector('#reset').onclick = async () => {
    const ya = await konfirmasi({
      judul: '⚠️ Reset total?', bahaya: true, ok: 'Ya, hapus semuanya',
      pesan: 'Seluruh data (produk, mitra, sales, dan semua transaksi) akan dihapus permanen.<br><br>Pastikan Anda sudah mengekspor cadangan.',
    });
    if (!ya) return;
    const lagi = await konfirmasi({
      judul: 'Yakin sekali lagi?', bahaya: true, ok: 'Hapus permanen',
      pesan: 'Tindakan ini <b>tidak dapat dibatalkan</b>.',
    });
    if (!lagi) return;
    resetDB();
    localStorage.removeItem('pos_tolak_contoh');
    sukses('Data direset');
    setTimeout(() => location.reload(), 500);
  };
}
