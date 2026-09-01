/* pages/pengaturan.js — identitas toko, tema, cadangan data */
import { db, setPengaturan, exportDB, importDB, resetDB, kosongkanTransaksi, VERSI } from '../core/store.js';
import { setJudul, setTopbar, setFab, formModal, konfirmasi, sukses, gagal, statTile, badge } from '../core/ui.js';
import { segarkan } from '../core/router.js';
import { PERAN, peranAktif, namaPengguna, pinDipasang } from '../core/peran.js';
import { dialogGantiPeran } from '../core/ganti-peran.js';
import { terapkanTema } from '../app.js';
import { esc, rp, num, unduh, todayISO } from '../core/utils.js';
import { statusPenyimpanan, mintaPenyimpananTetap, onJaringan, onBisaDipasang,
         pasangAplikasi, versiAplikasi, periksaPembaruan, terapkanPembaruan } from '../core/luring.js';
import { onSinkron, jalankan, keluar as keluarSinkron, akunTersimpan, tokoTersimpan,
         ALAMAT_SERVER, KEADAAN, daftarPengguna, tambahPengguna, ubahAkses } from '../core/sinkron.js';

/* Kartu kelola akun.

   Endpoint-nya sudah ada di server sejak awal, tetapi tanpa layar ini pemilik
   tidak punya cara membuatkan akun untuk sales dan agennya — dan tanpa akun,
   pembatasan peran tidak pernah benar-benar terpakai. */
const PERAN_AKUN = { owner: 'Pemilik', sales: 'Sales', mitra: 'Agen / Reseller' };

async function gambarAkun(view) {
  const bungkus = view.querySelector('#kartuAkunWrap');
  const kotak = view.querySelector('#kartuAkun');
  if (!bungkus || !kotak) return;

  const saya = await akunTersimpan();
  if (saya?.peran !== 'owner') { bungkus.hidden = true; return; }
  bungkus.hidden = false;
  kotak.innerHTML = '<div class="hint">Memuat daftar akun…</div>';

  let daftar;
  try {
    daftar = await daftarPengguna();
  } catch (e) {
    kotak.innerHTML = `<div class="hint warn">Gagal memuat: ${esc(e.message)}.
      Daftar akun hanya bisa dibaca saat ada jaringan.</div>`;
    return;
  }

  const baris = (daftar || []).map(u => {
    const mati = u.nonaktif === true;
    const ini = u._id === saya._id;
    return `<div class="row-item">
      <div class="avatar ${u.peran === 'sales' ? 'i' : u.peran === 'mitra' ? 'v' : ''}">
        ${u.peran === 'owner' ? '👑' : u.peran === 'sales' ? '🧑‍💼' : '🏪'}</div>
      <div class="ri-main">
        <div class="ri-title">${esc(u.nama || '-')}
          ${mati ? badge('Dicabut', 'bad') : ''}${ini ? badge('Anda', 'ok') : ''}</div>
        <div class="ri-sub">${esc(PERAN_AKUN[u.peran] || u.peran)} · ${esc(u.phone || '')}</div>
      </div>
      ${ini ? '' : `<button class="btn btn-sm ${mati ? '' : 'btn-danger'}"
        data-akses="${esc(u._id)}" data-mati="${mati ? '1' : ''}">${mati ? 'Pulihkan' : 'Cabut'}</button>`}
    </div>`;
  }).join('');

  kotak.innerHTML = `
    <div class="card mb12"><div class="list">${baris || '<div class="hint">Belum ada akun lain.</div>'}</div></div>
    <button class="btn btn-primary btn-block" id="akTambah">＋ Buatkan Akun Sales / Agen</button>
    <div class="hint mt8">Akun sales hanya bisa membaca dan menyetor data miliknya
      sendiri — ditegakkan server, bukan sekadar disembunyikan di tampilan.
      Mencabut akses berlaku seketika, bahkan pada perangkat yang sudah terlanjur masuk.</div>`;

  kotak.querySelectorAll('[data-akses]').forEach(b => {
    b.onclick = async () => {
      const mati = b.dataset.mati === '1';
      const ya = await konfirmasi({
        judul: mati ? 'Pulihkan akses?' : 'Cabut akses?',
        bahaya: !mati, ok: mati ? 'Ya, pulihkan' : 'Ya, cabut',
        pesan: mati
          ? 'Akun ini bisa masuk dan menyetor data lagi.'
          : `Perangkat yang sudah terlanjur masuk <b>langsung ditolak</b>, tanpa
             menunggu sesinya berakhir. Data yang sudah tersetor tidak dihapus.`,
      });
      if (!ya) return;
      try {
        await ubahAkses(b.dataset.akses, !mati);
        sukses(mati ? 'Akses dipulihkan' : 'Akses dicabut');
        gambarAkun(view);
      } catch (e) { gagal(e.message); }
    };
  });

  kotak.querySelector('#akTambah').onclick = () => formAkunBaru(view);
}

function formAkunBaru(view) {
  /* ref_id ditautkan lewat pilihan, bukan diketik: id yang salah ketik akan
     membuat penyaringan data diam-diam meleset tanpa pesan galat apa pun. */
  const opsiSales = db.sales.filter(x => x.aktif !== false)
    .map(x => ({ value: `sales:${x.id}`, label: `Sales — ${x.nama}` }));
  const opsiMitra = db.mitra.filter(x => x.aktif !== false)
    .map(x => ({ value: `mitra:${x.id}`, label: `${x.tipe === 'agen' ? 'Agen' : 'Reseller'} — ${x.nama}` }));
  const opsi = [...opsiSales, ...opsiMitra];

  if (!opsi.length) {
    return gagal('Tambahkan data Sales atau Mitra terlebih dahulu, lalu buat akunnya di sini.');
  }

  formModal({
    judul: 'Buatkan Akun',
    field: [
      { name: 'tautan', label: 'Untuk siapa', tipe: 'select', opsi, wajib: true, lebar: 'full',
        hint: 'Akun akan ditautkan ke data ini — hanya datanya yang bisa dia lihat.' },
      { name: 'nama', label: 'Nama pemegang akun', wajib: true, lebar: 'full' },
      { name: 'phone', label: 'Nomor HP (dipakai untuk masuk)', tipe: 'tel', wajib: true, lebar: 'full',
        hint: 'Format 628xxxxxxxxx' },
      { name: 'password', label: 'Kata sandi (min. 6 karakter)', tipe: 'password', wajib: true, lebar: 'full' },
    ],
    onSimpan: async d => {
      if (String(d.password).length < 6) { gagal('Kata sandi minimal 6 karakter'); throw new Error('pendek'); }
      const [peran, refId] = String(d.tautan).split(':');
      try {
        await tambahPengguna({
          nama: d.nama, phone: String(d.phone).trim(),
          password: d.password, peran, refId,
        });
        sukses(`Akun ${d.nama} dibuat — berikan nomor HP dan sandinya kepada yang bersangkutan`);
        gambarAkun(view);
      } catch (e) { gagal(e.message); throw e; }
    },
  });
}

/* Kartu sinkronisasi. Ditulis dengan satu pesan utama: menyalakan server itu
   pilihan, bukan keharusan — tanpa server pun aplikasi tetap berfungsi penuh. */
async function gambarSinkron(view) {
  const kotak = view.querySelector('#kartuSinkron');
  if (!kotak) return;
  const akun = await akunTersimpan();
  const toko = await tokoTersimpan();

  const PERAN_TEKS = { owner: 'Pemilik', sales: 'Sales', mitra: 'Agen / Reseller' };

  kotak.innerHTML = `
    <div class="kv"><span class="k">Server</span>
      <span class="v" style="font-size:12px">${esc(ALAMAT_SERVER.replace(/^https?:\/\//, ''))}</span></div>
    ${akun ? `
      <div class="kv"><span class="k">Masuk sebagai</span>
        <span class="v">${esc(akun.nama || '-')} · ${esc(PERAN_TEKS[akun.peran] || akun.peran || '')}</span></div>
      <div class="kv"><span class="k">Toko</span>
        <span class="v">${esc(toko?.nama || '-')}${toko?.kode ? ` (${esc(toko.kode)})` : ''}</span></div>
      <div class="kv"><span class="k">Status</span><span class="v" id="snStatus">—</span></div>
      <div class="btn-row mt12">
        <button class="btn btn-primary grow" id="snSekarang">🔄 Sinkronkan Sekarang</button>
        <button class="btn grow" id="snKeluar">Keluar</button>
      </div>` : `
      <div class="hint warn mt12">Belum masuk. Muat ulang halaman untuk membuka layar masuk.</div>`}
    <div class="hint mt12">Data selalu dicatat di perangkat lebih dulu, lalu disetor
      ke server saat ada sinyal. <b>Tidak ada transaksi yang hilang</b> kalau jaringan
      mati di tengah jalan.</div>`;

  if (akun) {
    onSinkron(({ keadaan, tertunda, pesan }) => {
      const el = kotak.querySelector('#snStatus');
      if (!el) return;
      const teks = {
        [KEADAAN.kirim]: '🔄 Sedang mengirim',
        [KEADAAN.tertunda]: `⏳ ${tertunda} catatan menunggu sinyal`,
        [KEADAAN.galat]: `⚠️ ${pesan || 'gagal'} — akan dicoba lagi otomatis`,
        [KEADAAN.siap]: '✅ Semua sudah tersimpan di server',
      }[keadaan] || '—';
      el.textContent = teks;
      el.className = `v ${keadaan === KEADAAN.galat ? 'warn' : keadaan === KEADAAN.siap ? 'ok' : ''}`;
    });
    kotak.querySelector('#snSekarang').onclick = async () => {
      (await jalankan({ paksa: true })) ? sukses('Sinkronisasi selesai')
                                        : gagal('Belum berhasil — akan dicoba lagi otomatis');
    };
    kotak.querySelector('#snKeluar').onclick = async () => {
      const ya = await konfirmasi({
        judul: 'Keluar dari server?', ok: 'Ya, keluar',
        pesan: 'Data di perangkat ini <b>tetap utuh</b>. Yang dihapus hanya token dan antrean kiriman.',
      });
      if (!ya) return;
      await keluarSinkron();
      sukses('Sudah keluar');
      gambarSinkron(view);
    };
  }
}

const mb = b => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`);

/* Status luring. Ditulis apa adanya: aplikasi ini memang berjalan penuh tanpa
   internet, yang perlu dijaga justru agar browser tidak membuang datanya. */
async function gambarLuring(view) {
  const kotak = view.querySelector('#kartuLuring');
  if (!kotak) return;
  const s = await statusPenyimpanan();

  const barisTetap = s.tetap === true
    ? ['ok', '🔒 Aman', 'Browser tidak akan menghapus data ini sendiri.']
    : s.tetap === false
      ? ['warn', '⚠️ Belum dikunci',
         'Browser boleh membuang data ini saat ruang penyimpanan menipis.']
      : ['', '— Tidak diketahui', 'Peramban ini tidak melaporkan status penyimpanan.'];

  kotak.innerHTML = `
    <div class="kv"><span class="k">Versi aplikasi</span>
      <span class="v" id="lrVersi">memeriksa…</span></div>
    <div class="kv"><span class="k">Jaringan</span>
      <span class="v" id="lrJaringan">—</span></div>
    <div class="kv"><span class="k">Dipasang di layar utama</span>
      <span class="v">${s.dipasang ? 'Ya' : 'Belum'}</span></div>
    <div class="kv"><span class="k">Penyimpanan tetap</span>
      <span class="v ${barisTetap[0]}">${barisTetap[1]}</span></div>
    ${s.kuota ? `<div class="kv"><span class="k">Terpakai</span>
      <span class="v">${mb(s.pakai)} dari ${mb(s.kuota)}</span></div>` : ''}
    <div class="hint mt12">${barisTetap[2]}</div>
    ${s.iOS && !s.dipasang ? `<div class="hint warn mt8">📱 <b>Pengguna iPhone/iPad:</b>
      selama aplikasi belum ditambahkan ke Layar Utama, iOS membersihkan datanya
      otomatis setelah <b>7 hari</b> tidak dibuka. Buka menu Bagikan → <b>Add to Home Screen</b>.</div>` : ''}
    <div class="btn-row mt12">
      ${s.tetap === false ? '<button class="btn grow" id="lrKunci">🔒 Kunci Penyimpanan</button>' : ''}
      <button class="btn btn-primary grow" id="lrPasang" hidden>📲 Pasang ke Layar Utama</button>
      <button class="btn grow" id="lrPembaruan">🔄 Periksa Pembaruan</button>
    </div>
    <div class="hint mt8">Seluruh fitur — kasir, konsinyasi, stok, laporan — berjalan
      tanpa internet karena data diolah di perangkat ini, bukan di server.</div>`;

  onJaringan(ada => {
    const el = kotak.querySelector('#lrJaringan');
    if (el) { el.textContent = ada ? 'Terhubung' : 'Luring'; el.className = `v ${ada ? 'ok' : ''}`; }
  });

  const tPasang = kotak.querySelector('#lrPasang');
  onBisaDipasang(bisa => { if (tPasang) tPasang.hidden = !bisa; });
  if (tPasang) tPasang.onclick = async () => {
    (await pasangAplikasi()) ? sukses('Aplikasi dipasang ke layar utama') : null;
  };

  versiAplikasi().then(v => {
    const el = kotak.querySelector('#lrVersi');
    if (el) el.textContent = v || 'tidak diketahui (service worker belum aktif)';
  });

  kotak.querySelector('#lrPembaruan').onclick = async () => {
    const ada = await periksaPembaruan();
    ada ? sukses('Versi baru tersedia — memuat ulang…') : sukses('Sudah versi terbaru');
    if (ada) setTimeout(terapkanPembaruan, 600);
  };

  const tKunci = kotak.querySelector('#lrKunci');
  if (tKunci) tKunci.onclick = async () => {
    const hasil = await mintaPenyimpananTetap();
    hasil ? sukses('Penyimpanan dikunci — data aman dari pembersihan otomatis')
          : gagal('Peramban menolak. Pasang aplikasi ke layar utama lalu coba lagi.');
    gambarLuring(view);
  gambarSinkron(view);
  gambarAkun(view);
  };
}

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

function formPin() {
  formModal({
    judul: '🔒 PIN Pemilik',
    fields: [
      {
        name: 'pinOwner', label: 'PIN (4–8 angka)', lebar: 'full', placeholder: 'kosongkan untuk menonaktifkan',
        hint: 'Diminta setiap kali perangkat dikembalikan ke peran Pemilik',
      },
    ],
    data: { pinOwner: db.pengaturan.pinOwner || '' },
    onSimpan: nilai => {
      const pin = String(nilai.pinOwner || '').trim();
      if (pin && !/^\d{4,8}$/.test(pin)) { gagal('PIN harus 4–8 angka'); return false; }
      setPengaturan({ pinOwner: pin });
      sukses(pin ? 'PIN pemilik diaktifkan' : 'PIN pemilik dinonaktifkan');
      segarkan();
    },
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
      <div class="card-head"><h2>👥 Peran Perangkat</h2>
        <button class="btn btn-sm" id="gantiPeran">⇄ Ganti</button></div>
      <div class="card-body">
        <div class="kv"><span class="k">Sedang aktif</span>
          <span class="v">${PERAN[peranAktif()].ikon} ${esc(namaPengguna())} — ${esc(PERAN[peranAktif()].label)}</span></div>
        <div class="kv"><span class="k">PIN Pemilik</span>
          <span class="v">${pinDipasang() ? '🔒 Aktif' : 'Tidak aktif'}
            <button class="btn btn-xs btn-ghost" id="ubahPin">${pinDipasang() ? 'Ubah' : 'Pasang'}</button></span></div>
        <div class="hint mt8">Mode <b>Sales</b> hanya menampilkan mitra binaan dan komisinya sendiri.
          Mode <b>Agen/Reseller</b> hanya menampilkan titipan, nota, dan tagihan mitra itu sendiri.
          Harga beli, laba, dan kas disembunyikan dari keduanya.
          Pasang PIN agar perangkat tidak bisa dikembalikan ke mode Pemilik oleh orang lain.</div>
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
      <div class="card-head"><h2>☁️ Sinkronisasi Server</h2></div>
      <div class="card-body" id="kartuSinkron">
        <div class="hint">Memuat…</div>
      </div>
    </div>

    <div class="card mb12" id="kartuAkunWrap" hidden>
      <div class="card-head"><h2>👥 Akun Pengguna</h2></div>
      <div class="card-body" id="kartuAkun"></div>
    </div>

    <div class="card mb12">
      <div class="card-head"><h2>📶 Mode Luring (Offline)</h2></div>
      <div class="card-body" id="kartuLuring">
        <div class="hint">Memeriksa status penyimpanan…</div>
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
        <div class="kv"><span class="k">Aplikasi</span><span class="v">POS Luhung Nusantara</span></div>
        <div class="kv"><span class="k">Teknologi</span><span class="v">HTML · CSS · JavaScript Module (tanpa framework)</span></div>
        <div class="kv"><span class="k">Penyimpanan</span><span class="v">localStorage (offline)</span></div>
        <div class="kv"><span class="k">Versi struktur data</span><span class="v">${VERSI}</span></div>
      </div>
    </div>`;

  view.querySelector('#editToko').onclick = formToko;
  view.querySelector('#editTrx').onclick = formTransaksi;
  view.querySelector('#gantiPeran').onclick = dialogGantiPeran;
  view.querySelector('#ubahPin').onclick = formPin;

  view.querySelector('#segTema').onclick = e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    setPengaturan({ tema: b.dataset.v });
    terapkanTema(b.dataset.v);
    view.querySelectorAll('#segTema button').forEach(x => x.classList.toggle('active', x === b));
    sukses('Tema diperbarui');
  };

  gambarLuring(view);
  gambarSinkron(view);
  gambarAkun(view);

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
