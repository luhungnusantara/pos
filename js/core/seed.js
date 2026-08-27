/* seed.js — data contoh siap pakai */
import { db, resetDB, save, batch } from './store.js';
import {
  simpanPembelian, simpanKonsinyasi, simpanPenjualan, laporKonsinyasi, catatKas, bayarPiutang, bayarHutang, hargaUntuk,
} from './domain.js';
import { nowISO, todayISO, tambahHari, toNum } from './utils.js';

/* pengacak deterministik agar data contoh selalu sama */
let benih = 20260822;
const acak = () => ((benih = (benih * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const acakInt = (a, b) => a + Math.floor(acak() * (b - a + 1));
const ambil = arr => arr[acakInt(0, arr.length - 1)];

const PRODUK = [
  // kode, nama, isi, merk, hargaBeli, hargaAgen, hargaReseller, hargaEcer, komisiUnit, minStok
  ['SM16', 'Sampoerna A Mild', '16 batang', 'Sampoerna', 335000, 348500, 355000, 375000, 1500, 20],
  ['GGF12', 'Gudang Garam Filter Intl', '12 batang', 'Gudang Garam', 235000, 244500, 249000, 265000, 0, 24],
  ['DJS16', 'Djarum Super', '16 batang', 'Djarum', 300000, 312000, 318000, 335000, 0, 20],
  ['MRB20', 'Marlboro Merah', '20 batang', 'Philip Morris', 390000, 405500, 413500, 435000, 2000, 14],
  ['LAB16', 'LA Bold', '16 batang', 'Djarum', 265000, 275500, 281000, 297000, 0, 16],
  ['SRY12', 'Surya 12', '12 batang', 'Gudang Garam', 290000, 301500, 307500, 325000, 0, 16],
  ['DJ76', 'Djarum 76', '12 batang', 'Djarum', 215000, 223500, 228000, 242000, 0, 16],
  ['ESC16', 'Esse Change', '16 batang', 'KT&G', 310000, 322500, 328500, 347000, 0, 10],
  ['MAG16', 'Magnum Filter', '16 batang', 'Sampoerna', 275000, 286000, 291500, 308000, 0, 12],
  ['SMB16', 'Sampoerna Mild Menthol', '16 batang', 'Sampoerna', 340000, 353500, 360500, 380000, 0, 10],
];

const MITRA = [
  ['AG-01', 'Agen Barokah Jaya', 'agen', '081234567801', 'Jl. Raya Cibiru No. 12, Bandung', 25000000, 14],
  ['AG-02', 'Agen Sumber Rejeki', 'agen', '081234567802', 'Jl. Soekarno Hatta No. 88, Bandung', 30000000, 14],
  ['AG-03', 'Agen Mitra Abadi', 'agen', '081234567803', 'Jl. Ahmad Yani No. 45, Cimahi', 20000000, 7],
  ['AG-04', 'Agen Putra Mandiri', 'agen', '081234567804', 'Jl. Kopo No. 210, Bandung', 15000000, 14],
  ['RS-01', 'Warung Bu Tuti', 'reseller', '081234567811', 'Jl. Melati No. 3, Cileunyi', 3000000, 7],
  ['RS-02', 'Toko Pak Deden', 'reseller', '081234567812', 'Jl. Kaliurang No. 17, Bandung', 5000000, 7],
  ['RS-03', 'Kios Rizky', 'reseller', '081234567813', 'Pasar Ujungberung Blok C-4', 2500000, 7],
  ['RS-04', 'Warung Sinar Pagi', 'reseller', '081234567814', 'Jl. Cigadung Raya No. 9', 3000000, 7],
  ['RS-05', 'Toko Amanah', 'reseller', '081234567815', 'Jl. Antapani No. 55, Bandung', 4000000, 14],
  ['RS-06', 'Kios Berkah 24 Jam', 'reseller', '081234567816', 'Jl. Terusan Buah Batu No. 2', 2000000, 7],
];

const SALES = [
  ['SLS-01', 'Budi Santoso', '081298760001', 'persen_omzet', 2, 150000000],
  ['SLS-02', 'Siti Rahmawati', '081298760002', 'persen_laba', 25, 100000000],
  ['SLS-03', 'Agus Prasetyo', '081298760003', 'nominal_unit', 2000, 80000000],
];

export function isiContoh() {
  benih = 20260822;
  resetDB();

  batch(() => {
    db.pengaturan = {
      ...db.pengaturan,
      namaToko: 'Luhung Nusantara',
      pemilik: 'H. Suryana',
      alamat: 'Jl. Raya Cibiru No. 45, Bandung',
      telp: '0812-3456-7890',
      saldoAwalKas: 60000000,
      tempoDefault: 14,
    };

    PRODUK.forEach(([kode, nama, isi, merk, hb, ha, hr, he, kom, min], i) => {
      db.produk.push({
        id: `prd_${kode.toLowerCase()}`, dibuat: nowISO(),
        kode, nama, merk, isi, satuan: 'Slop', isiPerSatuan: 10,
        hargaBeli: hb, hargaAgen: ha, hargaReseller: hr, hargaEcer: he,
        komisiUnit: kom, stok: 0, minStok: min, aktif: true,
      });
    });

    SALES.forEach(([kode, nama, telp, skema, nilai, target]) => {
      db.sales.push({
        id: `sls_${kode.toLowerCase().replace('-', '')}`, dibuat: nowISO(),
        kode, nama, telp, skema, nilai, target, aktif: true,
      });
    });

    const idSales = db.sales.map(s => s.id);
    MITRA.forEach(([kode, nama, tipe, telp, alamat, plafon, tempo], i) => {
      db.mitra.push({
        id: `mtr_${kode.toLowerCase().replace('-', '')}`, dibuat: nowISO(),
        kode, nama, tipe, telp, alamat, plafon, tempoHari: tempo,
        salesId: idSales[i % idSales.length], aktif: true,
      });
    });
  });

  /* ---- stok awal: 2 kali pembelian besar ---- */
  const beli1 = simpanPembelian({
    tanggal: tambahHari(todayISO(), -28),
    supplier: 'PT Sumber Niaga Tobacco',
    items: db.produk.map(p => ({ produkId: p.id, qty: acakInt(70, 110), harga: p.hargaBeli })),
    bayar: 'kredit',
    dibayar: 0,
    jatuhTempo: tambahHari(todayISO(), 2),
    catatan: 'Stok awal periode, tempo 30 hari',
  });
  // DP 60% dibayar beberapa hari kemudian
  bayarHutang({
    pembelianId: beli1.id,
    jumlah: Math.round(beli1.total * 0.6 / 100000) * 100000,
    tanggal: tambahHari(todayISO(), -21),
    metode: 'transfer',
    catatan: 'Pembayaran sebagian faktur stok awal',
  });
  simpanPembelian({
    tanggal: tambahHari(todayISO(), -12),
    supplier: 'CV Rokok Nusantara',
    items: db.produk.slice(0, 6).map(p => ({ produkId: p.id, qty: acakInt(30, 60), harga: p.hargaBeli })),
    bayar: 'kredit',
    dibayar: 0,
    jatuhTempo: tambahHari(todayISO(), 5),
    catatan: 'Pembelian tempo 30 hari',
  });

  /* ---- penjualan putus selama 25 hari terakhir ---- */
  const mitraAgen = db.mitra.filter(m => m.tipe === 'agen');
  const mitraReseller = db.mitra.filter(m => m.tipe === 'reseller');

  for (let h = 25; h >= 0; h--) {
    const tgl = tambahHari(todayISO(), -h);
    const jumlahTrx = acakInt(2, 4);
    for (let t = 0; t < jumlahTrx; t++) {
      const mitra = acak() > 0.45 ? ambil(mitraReseller) : ambil(mitraAgen);
      const nProduk = acakInt(1, 3);
      const dipakai = new Set();
      const items = [];
      for (let k = 0; k < nProduk; k++) {
        const p = ambil(db.produk);
        if (dipakai.has(p.id)) continue;
        dipakai.add(p.id);
        const qty = mitra.tipe === 'agen' ? acakInt(4, 14) : acakInt(1, 5);
        if (toNum(p.stok) < qty) continue;
        items.push({ produkId: p.id, qty, harga: hargaUntuk(p, mitra) });
      }
      if (!items.length) continue;
      const kredit = mitra.tipe === 'agen' ? acak() > 0.45 : acak() > 0.8;
      simpanPenjualan({
        tanggal: tgl,
        jenis: 'putus',
        mitraId: mitra.id,
        salesId: mitra.salesId,
        items,
        diskon: acak() > 0.8 ? acakInt(1, 5) * 10000 : 0,
        bayar: kredit ? 'kredit' : 'tunai',
        dibayar: kredit && acak() > 0.6 ? acakInt(1, 3) * 500000 : 0,
        jatuhTempo: kredit ? tambahHari(tgl, mitra.tempoHari) : '',
        metode: acak() > 0.7 ? 'transfer' : 'tunai',
      });
    }
  }

  /* ---- konsinyasi ---- */
  const titipan = [
    [mitraReseller[0], -20], [mitraReseller[1], -16], [mitraAgen[0], -14],
    [mitraReseller[3], -9], [mitraAgen[2], -6], [mitraReseller[4], -3],
  ];
  titipan.forEach(([mitra, hariLalu]) => {
    const items = [];
    const dipakai = new Set();
    for (let k = 0; k < acakInt(2, 4); k++) {
      const p = ambil(db.produk);
      if (dipakai.has(p.id)) continue;
      dipakai.add(p.id);
      const qty = mitra.tipe === 'agen' ? acakInt(8, 16) : acakInt(3, 8);
      if (toNum(p.stok) < qty) continue;
      items.push({ produkId: p.id, qty, harga: hargaUntuk(p, mitra) });
    }
    if (!items.length) return;
    const k = simpanKonsinyasi({
      tanggal: tambahHari(todayISO(), hariLalu),
      mitraId: mitra.id,
      salesId: mitra.salesId,
      jatuhTempo: tambahHari(todayISO(), hariLalu + 30),
      items,
      catatan: 'Barang titipan, laporan setiap 2 minggu',
    });

    // sebagian titipan lama sudah dilaporkan terjual
    if (hariLalu <= -9) {
      const baris = k.items.map(it => ({
        produkId: it.produkId,
        terjual: Math.max(1, Math.floor(it.qty * (0.4 + acak() * 0.45))),
        retur: acak() > 0.8 ? 1 : 0,
      }));
      laporKonsinyasi(k.id, baris, {
        tanggal: tambahHari(todayISO(), hariLalu + 8),
        bayar: acak() > 0.5 ? 'tunai' : 'kredit',
        dibayar: 0,
        jatuhTempo: tambahHari(todayISO(), hariLalu + 15),
      });
    }
  });

  /* ---- biaya operasional & pelunasan piutang ---- */
  batch(() => {
    [
      ['Operasional', 'BBM & tol pengiriman', 420000, -22],
      ['Gaji', 'Gaji 1 karyawan gudang', 1800000, -20],
      ['Sewa', 'Sewa gudang bulanan', 1200000, -20],
      ['Operasional', 'Servis motor operasional', 280000, -14],
      ['Biaya Lain', 'ATK & nota', 150000, -9],
      ['Operasional', 'BBM & tol pengiriman', 380000, -5],
      ['Operasional', 'Listrik & internet', 450000, -3],
    ].forEach(([kat, ket, jml, hari]) => catatKas({
      tanggal: tambahHari(todayISO(), hari), arah: 'keluar',
      kategori: kat, jumlah: jml, keterangan: ket,
    }));
  });

  // beberapa piutang dilunasi sebagian
  db.penjualan.filter(j => j.bayar === 'kredit').slice(0, 5).forEach((j, i) => {
    const sisa = toNum(j.total) - toNum(j.dibayar);
    if (sisa <= 0) return;
    bayarPiutang({
      penjualanId: j.id,
      jumlah: i % 2 === 0 ? sisa : Math.round(sisa * 0.5 / 50000) * 50000,
      tanggal: tambahHari(j.tanggal, 5),
      metode: 'transfer',
      catatan: 'Pelunasan via transfer',
    });
  });

  save(true);
  return db;
}
