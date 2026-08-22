/* domain.js — aturan bisnis: stok, konsinyasi, kas, piutang, komisi */
import { db, update, get, batch } from './store.js';
import { toNum, sum, round2, uid, nowISO, todayISO, noUrut, dalamRentang, groupBy } from './utils.js';

/* =========================================================
   1. STOK & KARTU STOK
   ========================================================= */

export const TIPE_MUTASI = {
  'saldo-awal': { label: 'Saldo Awal', arah: 1 },
  'beli': { label: 'Pembelian', arah: 1 },
  'jual': { label: 'Penjualan', arah: -1 },
  'titip': { label: 'Titip Konsinyasi', arah: -1 },
  'retur-titip': { label: 'Retur Konsinyasi', arah: 1 },
  'retur-jual': { label: 'Retur Penjualan', arah: 1 },
  'opname': { label: 'Penyesuaian Opname', arah: 0 },
  'batal': { label: 'Pembatalan', arah: 0 },
};

/** catat pergerakan stok gudang + kartu stok. qty bertanda (+ masuk / - keluar) */
export function catatMutasi({ produkId, tanggal, tipe, qty, ref = '', ket = '' }) {
  const p = get('produk', produkId);
  if (!p) return null;
  const sebelum = toNum(p.stok);
  const sesudah = round2(sebelum + toNum(qty));
  p.stok = sesudah;
  db.mutasi.unshift({
    id: uid('mut_'), dibuat: nowISO(),
    tanggal: tanggal || todayISO(),
    produkId, tipe, qty: toNum(qty), sebelum, sesudah, ref, ket,
  });
  return sesudah;
}

/** hapus jejak mutasi milik satu transaksi (dipakai saat pembatalan) */
export const hapusMutasiRef = ref => {
  db.mutasi = db.mutasi.filter(m => m.ref !== ref);
};

export const stokGudang = produkId => toNum(get('produk', produkId)?.stok);

/** sisa barang yang masih dititipkan (belum terjual/retur) */
export function stokKonsinyasi(produkId = null, mitraId = null) {
  let total = 0;
  for (const k of db.konsinyasi) {
    if (k.status === 'batal') continue;
    if (mitraId && k.mitraId !== mitraId) continue;
    for (const it of k.items) {
      if (produkId && it.produkId !== produkId) continue;
      total += toNum(it.qty) - toNum(it.terjual) - toNum(it.retur);
    }
  }
  return round2(total);
}

/** rincian titipan per mitra: [{mitraId, produkId, sisa, ...}] */
export function rincianKonsinyasi({ mitraId = null, produkId = null, hanyaSisa = true } = {}) {
  const out = [];
  for (const k of db.konsinyasi) {
    if (k.status === 'batal') continue;
    if (mitraId && k.mitraId !== mitraId) continue;
    for (const it of k.items) {
      if (produkId && it.produkId !== produkId) continue;
      const sisa = toNum(it.qty) - toNum(it.terjual) - toNum(it.retur);
      if (hanyaSisa && sisa <= 0) continue;
      out.push({
        konsinyasiId: k.id, noRef: k.noRef, tanggal: k.tanggal, mitraId: k.mitraId,
        salesId: k.salesId, produkId: it.produkId, harga: toNum(it.harga),
        qty: toNum(it.qty), terjual: toNum(it.terjual), retur: toNum(it.retur), sisa,
      });
    }
  }
  return out;
}

/** total stok fisik yang dimiliki toko (gudang + titipan di mitra) */
export const stokTotal = produkId => round2(stokGudang(produkId) + stokKonsinyasi(produkId));

export const produkMenipis = () =>
  db.produk.filter(p => p.aktif !== false && toNum(p.minStok) > 0 && toNum(p.stok) <= toNum(p.minStok));

/** nilai persediaan gudang berdasarkan harga beli */
export const nilaiPersediaan = () => sum(db.produk, p => toNum(p.stok) * toNum(p.hargaBeli));

/* =========================================================
   2. HARGA & KOMISI
   ========================================================= */

/** harga jual sesuai tipe mitra */
export function hargaUntuk(produk, mitra) {
  if (!produk) return 0;
  const tipe = typeof mitra === 'string' ? mitra : mitra?.tipe;
  if (tipe === 'agen') return toNum(produk.hargaAgen) || toNum(produk.hargaReseller);
  if (tipe === 'reseller') return toNum(produk.hargaReseller) || toNum(produk.hargaAgen);
  return toNum(produk.hargaEcer) || toNum(produk.hargaReseller) || toNum(produk.hargaAgen);
}

export const SKEMA_KOMISI = {
  persen_omzet: { label: '% dari omzet', satuan: '%' },
  persen_laba: { label: '% dari laba kotor', satuan: '%' },
  nominal_unit: { label: 'Rp per unit terjual', satuan: 'Rp' },
};

/**
 * Hitung komisi satu transaksi penjualan.
 * Prioritas: komisi per unit yang disetel pada produk → skema milik sales.
 * items: [{produkId, qty, harga, hargaBeli, diskon?}]
 */
export function hitungKomisi(sales, items, { diskonNota = 0 } = {}) {
  if (!sales) return { nilai: 0, rincian: [] };
  const skema = sales.skema || 'persen_omzet';
  const nilaiSkema = toNum(sales.nilai);
  const bruto = sum(items, i => toNum(i.qty) * toNum(i.harga));
  const rasio = bruto > 0 ? 1 - toNum(diskonNota) / bruto : 1; // diskon nota dialokasikan proporsional

  const rincian = items.map(i => {
    const p = get('produk', i.produkId);
    const qty = toNum(i.qty);
    const omzet = round2(qty * toNum(i.harga) * rasio);
    const hpp = qty * toNum(i.hargaBeli ?? p?.hargaBeli);
    const laba = round2(omzet - hpp);
    const perUnit = toNum(p?.komisiUnit);

    let nilai = 0, dasar = '';
    if (perUnit > 0) {
      nilai = round2(perUnit * qty);
      dasar = `Rp${perUnit}/unit (produk)`;
    } else if (skema === 'nominal_unit') {
      nilai = round2(nilaiSkema * qty);
      dasar = `Rp${nilaiSkema}/unit`;
    } else if (skema === 'persen_laba') {
      nilai = round2(Math.max(0, laba) * nilaiSkema / 100);
      dasar = `${nilaiSkema}% laba`;
    } else {
      nilai = round2(omzet * nilaiSkema / 100);
      dasar = `${nilaiSkema}% omzet`;
    }
    return { produkId: i.produkId, qty, omzet, laba, nilai, dasar };
  });

  return { nilai: round2(sum(rincian, r => r.nilai)), rincian };
}

/* =========================================================
   3. KAS
   ========================================================= */

export const KATEGORI_KAS = {
  masuk: ['Penjualan Tunai', 'Pelunasan Piutang', 'Setoran Konsinyasi', 'Modal Masuk', 'Pendapatan Lain'],
  keluar: ['Pembelian Stok', 'Bayar Hutang', 'Komisi Sales', 'Operasional', 'Gaji', 'Sewa', 'Prive', 'Biaya Lain'],
};

export function catatKas({ tanggal, arah, kategori, jumlah, keterangan = '', metode = 'tunai', sumber = null }) {
  if (toNum(jumlah) <= 0) return null;
  const item = {
    id: uid('kas_'), dibuat: nowISO(),
    tanggal: tanggal || todayISO(),
    arah, kategori, jumlah: round2(jumlah), keterangan, metode, sumber,
  };
  db.kas.unshift(item);
  return item;
}

export const hapusKasSumber = (tipe, id) => {
  db.kas = db.kas.filter(k => !(k.sumber?.tipe === tipe && k.sumber?.id === id));
};

export const saldoKas = (sampai = null) => round2(
  toNum(db.pengaturan.saldoAwalKas) +
  sum(db.kas.filter(k => !sampai || k.tanggal <= sampai), k => (k.arah === 'masuk' ? 1 : -1) * toNum(k.jumlah))
);

/* =========================================================
   4. PIUTANG & HUTANG
   ========================================================= */

export const sisaPiutang = jual => round2(toNum(jual.total) - toNum(jual.dibayar));

export const statusBayar = trx => {
  const sisa = round2(toNum(trx.total) - toNum(trx.dibayar));
  if (sisa <= 0) return 'lunas';
  return toNum(trx.dibayar) > 0 ? 'sebagian' : 'belum';
};

export const daftarPiutang = (mitraId = null) =>
  db.penjualan.filter(j =>
    j.status !== 'batal' && sisaPiutang(j) > 0.5 && (!mitraId || j.mitraId === mitraId));

export const totalPiutang = (mitraId = null) => round2(sum(daftarPiutang(mitraId), sisaPiutang));

export const daftarHutang = () =>
  db.pembelian.filter(b => b.status !== 'batal' && round2(toNum(b.total) - toNum(b.dibayar)) > 0.5);

export const totalHutang = () =>
  round2(sum(daftarHutang(), b => toNum(b.total) - toNum(b.dibayar)));

/** piutang jatuh tempo / lewat tempo */
export const piutangJatuhTempo = (tgl = todayISO()) =>
  daftarPiutang().filter(j => j.jatuhTempo && j.jatuhTempo <= tgl);

/* =========================================================
   5. TRANSAKSI — PEMBELIAN (STOK MASUK)
   ========================================================= */

export function simpanPembelian(data) {
  return batch(() => {
    const noRef = data.noRef || noUrut('BL', db.pembelian);
    const total = round2(sum(data.items, i => toNum(i.qty) * toNum(i.harga)) - toNum(data.diskon));
    const dibayar = data.bayar === 'tunai' ? total : round2(toNum(data.dibayar));

    const trx = {
      id: uid('beli_'), dibuat: nowISO(), noRef,
      tanggal: data.tanggal || todayISO(),
      supplier: data.supplier || 'Umum',
      items: data.items.map(i => ({ produkId: i.produkId, qty: toNum(i.qty), harga: toNum(i.harga) })),
      diskon: toNum(data.diskon), total, bayar: data.bayar || 'tunai', dibayar,
      jatuhTempo: data.jatuhTempo || '', catatan: data.catatan || '', status: 'aktif',
    };
    db.pembelian.unshift(trx);

    trx.items.forEach(i => {
      catatMutasi({
        produkId: i.produkId, tanggal: trx.tanggal, tipe: 'beli', qty: i.qty,
        ref: trx.noRef, ket: `Beli dari ${trx.supplier}`,
      });
      // perbarui harga beli terakhir (moving cost sederhana)
      if (toNum(i.harga) > 0) update('produk', i.produkId, { hargaBeli: toNum(i.harga) });
    });

    if (dibayar > 0) {
      catatKas({
        tanggal: trx.tanggal, arah: 'keluar', kategori: 'Pembelian Stok', jumlah: dibayar,
        keterangan: `${trx.noRef} — ${trx.supplier}`, sumber: { tipe: 'pembelian', id: trx.id },
      });
    }
    return trx;
  });
}

export function batalkanPembelian(id) {
  const trx = get('pembelian', id);
  if (!trx || trx.status === 'batal') return false;
  return batch(() => {
    trx.items.forEach(i => catatMutasi({
      produkId: i.produkId, tanggal: todayISO(), tipe: 'batal', qty: -toNum(i.qty),
      ref: trx.noRef, ket: 'Pembatalan pembelian',
    }));
    hapusKasSumber('pembelian', trx.id);
    db.pembayaran = db.pembayaran.filter(p => p.refId !== trx.id);
    trx.status = 'batal';
    return true;
  });
}

/* =========================================================
   6. TRANSAKSI — STOK OPNAME
   ========================================================= */

/** items: [{produkId, sistem, fisik}] */
export function simpanOpname(data) {
  return batch(() => {
    const items = data.items.map(i => {
      const p = get('produk', i.produkId);
      const sistem = toNum(i.sistem), fisik = toNum(i.fisik);
      return {
        produkId: i.produkId, sistem, fisik, selisih: round2(fisik - sistem),
        hargaBeli: toNum(p?.hargaBeli), catatan: i.catatan || '',
      };
    });
    const trx = {
      id: uid('opn_'), dibuat: nowISO(),
      noRef: data.noRef || noUrut('SO', db.opname),
      tanggal: data.tanggal || todayISO(),
      petugas: data.petugas || '',
      items,
      nilaiSelisih: round2(sum(items, i => i.selisih * i.hargaBeli)),
      catatan: data.catatan || '',
      status: 'posted',
    };
    db.opname.unshift(trx);

    items.filter(i => i.selisih !== 0).forEach(i => {
      catatMutasi({
        produkId: i.produkId, tanggal: trx.tanggal, tipe: 'opname', qty: i.selisih,
        ref: trx.noRef, ket: i.selisih > 0 ? 'Kelebihan fisik' : 'Kekurangan fisik',
      });
    });

    // selisih kurang dicatat sebagai kerugian (biaya) agar kas & laba realistis
    const rugi = round2(sum(items.filter(i => i.selisih < 0), i => -i.selisih * i.hargaBeli));
    if (rugi > 0 && data.catatKerugian !== false) {
      trx.kerugian = rugi;
    }
    return trx;
  });
}

/* =========================================================
   7. TRANSAKSI — KONSINYASI (TITIP BARANG)
   ========================================================= */

/** items: [{produkId, qty, harga}] */
export function simpanKonsinyasi(data) {
  return batch(() => {
    const mitra = get('mitra', data.mitraId);
    const trx = {
      id: uid('kons_'), dibuat: nowISO(),
      noRef: data.noRef || noUrut('KS', db.konsinyasi),
      tanggal: data.tanggal || todayISO(),
      mitraId: data.mitraId,
      salesId: data.salesId || mitra?.salesId || '',
      jatuhTempo: data.jatuhTempo || '',
      items: data.items.map(i => ({
        produkId: i.produkId, qty: toNum(i.qty), harga: toNum(i.harga),
        hargaBeli: toNum(get('produk', i.produkId)?.hargaBeli),
        terjual: 0, retur: 0,
      })),
      catatan: data.catatan || '',
      status: 'aktif',
    };
    trx.nilaiTitip = round2(sum(trx.items, i => i.qty * i.harga));
    db.konsinyasi.unshift(trx);

    trx.items.forEach(i => catatMutasi({
      produkId: i.produkId, tanggal: trx.tanggal, tipe: 'titip', qty: -i.qty,
      ref: trx.noRef, ket: `Titip ke ${mitra?.nama || '-'}`,
    }));
    return trx;
  });
}

/** tambah stok titipan pada konsinyasi yang masih aktif */
export function tambahTitipan(konsinyasiId, items) {
  const k = get('konsinyasi', konsinyasiId);
  if (!k || k.status !== 'aktif') return null;
  const mitra = get('mitra', k.mitraId);
  return batch(() => {
    items.forEach(i => {
      const ada = k.items.find(x => x.produkId === i.produkId && toNum(x.harga) === toNum(i.harga));
      if (ada) ada.qty = round2(toNum(ada.qty) + toNum(i.qty));
      else k.items.push({
        produkId: i.produkId, qty: toNum(i.qty), harga: toNum(i.harga),
        hargaBeli: toNum(get('produk', i.produkId)?.hargaBeli), terjual: 0, retur: 0,
      });
      catatMutasi({
        produkId: i.produkId, tanggal: todayISO(), tipe: 'titip', qty: -toNum(i.qty),
        ref: k.noRef, ket: `Tambah titipan ke ${mitra?.nama || '-'}`,
      });
    });
    k.nilaiTitip = round2(sum(k.items, i => i.qty * i.harga));
    return k;
  });
}

/**
 * Laporan hasil konsinyasi: mitra melaporkan berapa yang terjual & berapa diretur.
 * baris: [{produkId, terjual, retur}]
 * Yang terjual → menjadi transaksi penjualan (piutang / kas masuk) + komisi sales.
 * Yang diretur → stok kembali ke gudang.
 */
export function laporKonsinyasi(konsinyasiId, baris, opsi = {}) {
  const k = get('konsinyasi', konsinyasiId);
  if (!k) return null;
  const mitra = get('mitra', k.mitraId);

  return batch(() => {
    const itemJual = [];
    baris.forEach(b => {
      const it = k.items.find(x => x.produkId === b.produkId);
      if (!it) return;
      const sisa = toNum(it.qty) - toNum(it.terjual) - toNum(it.retur);
      const terjual = Math.min(toNum(b.terjual), sisa);
      const retur = Math.min(toNum(b.retur), sisa - terjual);

      if (terjual > 0) {
        it.terjual = round2(toNum(it.terjual) + terjual);
        itemJual.push({ produkId: it.produkId, qty: terjual, harga: toNum(it.harga), hargaBeli: toNum(it.hargaBeli) });
      }
      if (retur > 0) {
        it.retur = round2(toNum(it.retur) + retur);
        catatMutasi({
          produkId: it.produkId, tanggal: opsi.tanggal || todayISO(), tipe: 'retur-titip', qty: retur,
          ref: k.noRef, ket: `Retur dari ${mitra?.nama || '-'}`,
        });
      }
    });

    let jual = null;
    if (itemJual.length) {
      jual = simpanPenjualan({
        tanggal: opsi.tanggal || todayISO(),
        jenis: 'konsinyasi',
        mitraId: k.mitraId,
        salesId: k.salesId,
        items: itemJual,
        diskon: toNum(opsi.diskon),
        bayar: opsi.bayar || 'tunai',
        dibayar: opsi.dibayar,
        jatuhTempo: opsi.jatuhTempo || '',
        metode: opsi.metode || 'tunai',
        catatan: `Setoran konsinyasi ${k.noRef}`,
        konsinyasiId: k.id,
        _tanpaKurangStok: true, // stok sudah keluar saat penitipan
      }, { luarBatch: true });
    }

    // tutup otomatis bila seluruh titipan sudah selesai
    const sisaTotal = sum(k.items, i => toNum(i.qty) - toNum(i.terjual) - toNum(i.retur));
    if (sisaTotal <= 0) k.status = 'selesai';
    k.laporanTerakhir = opsi.tanggal || todayISO();

    return { konsinyasi: k, penjualan: jual };
  });
}

export function tutupKonsinyasi(id, returSisa = true) {
  const k = get('konsinyasi', id);
  if (!k || k.status !== 'aktif') return false;
  const mitra = get('mitra', k.mitraId);
  return batch(() => {
    if (returSisa) {
      k.items.forEach(it => {
        const sisa = toNum(it.qty) - toNum(it.terjual) - toNum(it.retur);
        if (sisa > 0) {
          it.retur = round2(toNum(it.retur) + sisa);
          catatMutasi({
            produkId: it.produkId, tanggal: todayISO(), tipe: 'retur-titip', qty: sisa,
            ref: k.noRef, ket: `Penutupan titipan ${mitra?.nama || '-'}`,
          });
        }
      });
    }
    k.status = 'selesai';
    return true;
  });
}

/* =========================================================
   8. TRANSAKSI — PENJUALAN
   ========================================================= */

/** items: [{produkId, qty, harga, hargaBeli?}] */
export function simpanPenjualan(data, { luarBatch = false } = {}) {
  const jalan = () => {
    const mitra = data.mitraId ? get('mitra', data.mitraId) : null;
    const items = data.items.map(i => {
      const p = get('produk', i.produkId);
      return {
        produkId: i.produkId, qty: toNum(i.qty), harga: toNum(i.harga),
        hargaBeli: toNum(i.hargaBeli ?? p?.hargaBeli),
      };
    });
    const subtotal = round2(sum(items, i => i.qty * i.harga));
    const diskon = toNum(data.diskon);
    const total = round2(subtotal - diskon);
    const hpp = round2(sum(items, i => i.qty * i.hargaBeli));
    const dibayar = data.bayar === 'tunai' ? total : round2(toNum(data.dibayar));

    const trx = {
      id: uid('jual_'), dibuat: nowISO(),
      noRef: data.noRef || noUrut(data.jenis === 'konsinyasi' ? 'KJ' : 'JL', db.penjualan),
      tanggal: data.tanggal || todayISO(),
      jenis: data.jenis || 'putus',
      mitraId: data.mitraId || '',
      mitraNama: mitra?.nama || data.mitraNama || 'Pelanggan Umum',
      tipeMitra: mitra?.tipe || 'umum',
      salesId: data.salesId || mitra?.salesId || '',
      items, subtotal, diskon, total, hpp,
      laba: round2(total - hpp),
      bayar: data.bayar || 'tunai',
      metode: data.metode || 'tunai',
      dibayar,
      jatuhTempo: data.jatuhTempo || '',
      konsinyasiId: data.konsinyasiId || '',
      catatan: data.catatan || '',
      status: 'aktif',
    };
    db.penjualan.unshift(trx);

    if (!data._tanpaKurangStok) {
      items.forEach(i => catatMutasi({
        produkId: i.produkId, tanggal: trx.tanggal, tipe: 'jual', qty: -i.qty,
        ref: trx.noRef, ket: `Jual ke ${trx.mitraNama}`,
      }));
    }

    if (dibayar > 0) {
      catatKas({
        tanggal: trx.tanggal, arah: 'masuk',
        kategori: trx.jenis === 'konsinyasi' ? 'Setoran Konsinyasi' : 'Penjualan Tunai',
        jumlah: dibayar, metode: trx.metode,
        keterangan: `${trx.noRef} — ${trx.mitraNama}`,
        sumber: { tipe: 'penjualan', id: trx.id },
      });
    }

    // komisi sales
    const sales = trx.salesId ? get('sales', trx.salesId) : null;
    if (sales) {
      const { nilai, rincian } = hitungKomisi(sales, items, { diskonNota: diskon });
      if (nilai > 0) {
        db.komisi.unshift({
          id: uid('kom_'), dibuat: nowISO(),
          tanggal: trx.tanggal, salesId: sales.id, penjualanId: trx.id, noRef: trx.noRef,
          mitraId: trx.mitraId, omzet: total, laba: trx.laba,
          qty: sum(items, i => i.qty),
          skema: sales.skema, nilaiSkema: toNum(sales.nilai),
          nilai, rincian, status: 'pending', bayarId: '',
        });
      }
    }
    return trx;
  };
  return luarBatch ? jalan() : batch(jalan);
}

export function batalkanPenjualan(id) {
  const trx = get('penjualan', id);
  if (!trx || trx.status === 'batal') return false;
  return batch(() => {
    // kembalikan stok (kecuali penjualan konsinyasi — stok sudah di mitra)
    if (trx.jenis !== 'konsinyasi') {
      trx.items.forEach(i => catatMutasi({
        produkId: i.produkId, tanggal: todayISO(), tipe: 'batal', qty: toNum(i.qty),
        ref: trx.noRef, ket: 'Pembatalan penjualan',
      }));
    } else if (trx.konsinyasiId) {
      const k = get('konsinyasi', trx.konsinyasiId);
      if (k) {
        trx.items.forEach(i => {
          const it = k.items.find(x => x.produkId === i.produkId);
          if (it) it.terjual = Math.max(0, round2(toNum(it.terjual) - toNum(i.qty)));
        });
        if (k.status === 'selesai') k.status = 'aktif';
      }
    }
    hapusKasSumber('penjualan', trx.id);
    db.pembayaran = db.pembayaran.filter(p => p.refId !== trx.id);
    db.komisi = db.komisi.filter(k => k.penjualanId !== trx.id || k.status === 'dibayar');
    trx.status = 'batal';
    trx.dibayar = 0;
    return true;
  });
}

/* =========================================================
   9. PEMBAYARAN PIUTANG / HUTANG
   ========================================================= */

export function bayarPiutang({ penjualanId, jumlah, tanggal, metode = 'tunai', catatan = '' }) {
  const jual = get('penjualan', penjualanId);
  if (!jual) return null;
  const nilai = Math.min(round2(jumlah), sisaPiutang(jual));
  if (nilai <= 0) return null;

  return batch(() => {
    jual.dibayar = round2(toNum(jual.dibayar) + nilai);
    const byr = {
      id: uid('byr_'), dibuat: nowISO(), tipe: 'piutang',
      tanggal: tanggal || todayISO(), refId: jual.id, noRef: jual.noRef,
      mitraId: jual.mitraId, jumlah: nilai, metode, catatan,
    };
    db.pembayaran.unshift(byr);
    catatKas({
      tanggal: byr.tanggal, arah: 'masuk', kategori: 'Pelunasan Piutang', jumlah: nilai, metode,
      keterangan: `${jual.noRef} — ${jual.mitraNama}`,
      sumber: { tipe: 'penjualan', id: jual.id },
    });
    return byr;
  });
}

export function bayarHutang({ pembelianId, jumlah, tanggal, metode = 'tunai', catatan = '' }) {
  const beli = get('pembelian', pembelianId);
  if (!beli) return null;
  const nilai = Math.min(round2(jumlah), round2(toNum(beli.total) - toNum(beli.dibayar)));
  if (nilai <= 0) return null;

  return batch(() => {
    beli.dibayar = round2(toNum(beli.dibayar) + nilai);
    const byr = {
      id: uid('byr_'), dibuat: nowISO(), tipe: 'hutang',
      tanggal: tanggal || todayISO(), refId: beli.id, noRef: beli.noRef,
      supplier: beli.supplier, jumlah: nilai, metode, catatan,
    };
    db.pembayaran.unshift(byr);
    catatKas({
      tanggal: byr.tanggal, arah: 'keluar', kategori: 'Bayar Hutang', jumlah: nilai, metode,
      keterangan: `${beli.noRef} — ${beli.supplier}`,
      sumber: { tipe: 'pembelian', id: beli.id },
    });
    return byr;
  });
}

/* =========================================================
   10. KOMISI SALES
   ========================================================= */

export const komisiSales = (salesId, { status = null, dari = null, sampai = null } = {}) =>
  db.komisi.filter(k =>
    (!salesId || k.salesId === salesId) &&
    (!status || k.status === status) &&
    dalamRentang(k.tanggal, dari, sampai));

export const komisiTertunda = salesId => round2(sum(komisiSales(salesId, { status: 'pending' }), k => k.nilai));

/** rekap komisi seluruh sales pada periode tertentu */
export function rekapKomisi({ dari = null, sampai = null } = {}) {
  return db.sales.map(s => {
    const semua = komisiSales(s.id, { dari, sampai });
    const pending = semua.filter(k => k.status === 'pending');
    const dibayar = semua.filter(k => k.status === 'dibayar');
    return {
      sales: s,
      trx: semua.length,
      omzet: round2(sum(semua, k => k.omzet)),
      laba: round2(sum(semua, k => k.laba)),
      qty: round2(sum(semua, k => k.qty)),
      total: round2(sum(semua, k => k.nilai)),
      pending: round2(sum(pending, k => k.nilai)),
      dibayar: round2(sum(dibayar, k => k.nilai)),
      capaian: toNum(s.target) > 0 ? round2(sum(semua, k => k.omzet) / toNum(s.target) * 100) : null,
    };
  });
}

export function bayarKomisi({ salesId, komisiIds, tanggal, metode = 'tunai', catatan = '' }) {
  const sales = get('sales', salesId);
  const dipilih = db.komisi.filter(k => komisiIds.includes(k.id) && k.status === 'pending');
  if (!sales || !dipilih.length) return null;
  const total = round2(sum(dipilih, k => k.nilai));

  return batch(() => {
    const byr = {
      id: uid('bkom_'), dibuat: nowISO(),
      noRef: noUrut('KM', db.bayarKomisi),
      tanggal: tanggal || todayISO(),
      salesId, salesNama: sales.nama,
      komisiIds: dipilih.map(k => k.id),
      jumlahTrx: dipilih.length, total, metode, catatan,
    };
    db.bayarKomisi.unshift(byr);
    dipilih.forEach(k => { k.status = 'dibayar'; k.bayarId = byr.id; k.tglBayar = byr.tanggal; });
    catatKas({
      tanggal: byr.tanggal, arah: 'keluar', kategori: 'Komisi Sales', jumlah: total, metode,
      keterangan: `${byr.noRef} — komisi ${sales.nama} (${dipilih.length} transaksi)`,
      sumber: { tipe: 'komisi', id: byr.id },
    });
    return byr;
  });
}

/* =========================================================
   11. LAPORAN & RINGKASAN
   ========================================================= */

export const penjualanAktif = (dari = null, sampai = null) =>
  db.penjualan.filter(j => j.status !== 'batal' && dalamRentang(j.tanggal, dari, sampai));

export function ringkasan(dari = null, sampai = null) {
  const jual = penjualanAktif(dari, sampai);
  const beli = db.pembelian.filter(b => b.status !== 'batal' && dalamRentang(b.tanggal, dari, sampai));
  const kas = db.kas.filter(k => dalamRentang(k.tanggal, dari, sampai));
  const kom = db.komisi.filter(k => dalamRentang(k.tanggal, dari, sampai));
  const opn = db.opname.filter(o => dalamRentang(o.tanggal, dari, sampai));

  const omzet = round2(sum(jual, j => j.total));
  const hpp = round2(sum(jual, j => j.hpp));
  const labaKotor = round2(omzet - hpp);
  const komisi = round2(sum(kom, k => k.nilai));
  const biaya = round2(sum(
    kas.filter(k => k.arah === 'keluar' && !['Pembelian Stok', 'Bayar Hutang', 'Komisi Sales'].includes(k.kategori)),
    k => k.jumlah));
  const susut = round2(sum(opn, o => Math.max(0, -sum(o.items.filter(i => i.selisih < 0), i => i.selisih * i.hargaBeli))));

  return {
    trx: jual.length,
    qty: round2(sum(jual, j => sum(j.items, i => i.qty))),
    omzet, hpp, labaKotor, komisi, biaya, susut,
    labaBersih: round2(labaKotor - komisi - biaya - susut),
    marginPersen: omzet > 0 ? round2(labaKotor / omzet * 100) : 0,
    tunai: round2(sum(jual.filter(j => j.bayar === 'tunai'), j => j.total)),
    kredit: round2(sum(jual.filter(j => j.bayar !== 'tunai'), j => j.total)),
    pembelian: round2(sum(beli, b => b.total)),
    kasMasuk: round2(sum(kas.filter(k => k.arah === 'masuk'), k => k.jumlah)),
    kasKeluar: round2(sum(kas.filter(k => k.arah === 'keluar'), k => k.jumlah)),
    konsinyasi: round2(sum(jual.filter(j => j.jenis === 'konsinyasi'), j => j.total)),
    putus: round2(sum(jual.filter(j => j.jenis !== 'konsinyasi'), j => j.total)),
  };
}

/** omzet harian untuk grafik: n hari terakhir */
export function omzetHarian(n = 14) {
  const out = [];
  const hariIni = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hariIni);
    d.setDate(d.getDate() - i);
    const iso = d.toLocaleDateString('sv-SE');
    const j = penjualanAktif(iso, iso);
    out.push({ tanggal: iso, omzet: round2(sum(j, x => x.total)), trx: j.length });
  }
  return out;
}

/** peringkat produk terlaris */
export function produkTerlaris(dari = null, sampai = null, limit = 10) {
  const map = {};
  penjualanAktif(dari, sampai).forEach(j => j.items.forEach(i => {
    const m = (map[i.produkId] ||= { produkId: i.produkId, qty: 0, omzet: 0, laba: 0 });
    m.qty += toNum(i.qty);
    m.omzet += toNum(i.qty) * toNum(i.harga);
    m.laba += toNum(i.qty) * (toNum(i.harga) - toNum(i.hargaBeli));
  }));
  return Object.values(map)
    .map(m => ({ ...m, produk: get('produk', m.produkId), omzet: round2(m.omzet), laba: round2(m.laba) }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

/** rekap per mitra (agen/reseller) */
export function rekapMitra(dari = null, sampai = null) {
  const byMitra = groupBy(penjualanAktif(dari, sampai).filter(j => j.mitraId), 'mitraId');
  return Object.entries(byMitra).map(([mitraId, arr]) => ({
    mitra: get('mitra', mitraId),
    trx: arr.length,
    omzet: round2(sum(arr, j => j.total)),
    laba: round2(sum(arr, j => j.laba)),
    piutang: totalPiutang(mitraId),
    titipan: stokKonsinyasi(null, mitraId),
  })).sort((a, b) => b.omzet - a.omzet);
}
