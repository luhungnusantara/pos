/* struk.js — tampilan & cetak nota, surat titip barang, dan bukti pembayaran */
import { db, get } from './store.js';
import { modal, sukses, gagal } from './ui.js';
import { esc, rp, num, toNum, sum, round2, fmtTgl, fmtJam, unduh, terbilang } from './utils.js';

/* Setiap dokumen disusun sebagai daftar baris. Satu sumber untuk tampilan di
   layar (HTML) dan untuk gambar yang dibagikan (canvas), supaya foto yang
   terkirim sama dengan pratinjaunya.

   Jenis baris: { logo }, { garis }, { tengah }, { kiri, kanan },
   { produk, kiri, kanan, bawah? } dan { ttd: [{ label, nama }] }. */

const namaToko = () => db.pengaturan.namaToko || 'LUHUNG NUSANTARA';

function kepala(judulDokumen = '') {
  const p = db.pengaturan;
  return [
    { logo: true },
    { tengah: namaToko(), tebal: true, ukuran: 14 },
    p.alamat && { tengah: p.alamat },
    p.telp && { tengah: `Telp: ${p.telp}` },
    { garis: true },
    judulDokumen && { tengah: judulDokumen, tebal: true, ukuran: 13 },
  ];
}

function barisStruk(jual) {
  const p = db.pengaturan;
  const sales = jual.salesId ? get('sales', jual.salesId) : null;
  const sisa = toNum(jual.total) - toNum(jual.dibayar);
  return [
    ...kepala(),
    { kiri: 'No', kanan: jual.noRef },
    { kiri: 'Tanggal', kanan: `${fmtTgl(jual.tanggal)} ${fmtJam(jual.dibuat)}` },
    { kiri: 'Pelanggan', kanan: jual.mitraNama },
    { kiri: 'Tipe', kanan: jual.tipeMitra === 'agen' ? 'Agen' : jual.tipeMitra === 'reseller' ? 'Reseller' : 'Umum' },
    sales && { kiri: 'Sales', kanan: sales.nama },
    jual.promo && { kiri: 'Harga', kanan: 'PROMO', tebal: true },
    { garis: true },
    ...jual.items.map(i => {
      const pr = get('produk', i.produkId);
      return {
        produk: pr?.nama || '-',
        kiri: [num(i.qty), pr?.satuan, '×', num(i.harga)].filter(Boolean).join(' '),
        kanan: num(toNum(i.qty) * toNum(i.harga)),
      };
    }),
    { garis: true },
    { kiri: 'Subtotal', kanan: num(jual.subtotal) },
    toNum(jual.diskon) && { kiri: 'Diskon', kanan: `-${num(jual.diskon)}` },
    { kiri: 'TOTAL', kanan: rp(jual.total), tebal: true, ukuran: 13 },
    { kiri: `Bayar (${jual.metode || 'tunai'})`, kanan: num(jual.dibayar) },
    ...(sisa > 0
      ? [{ kiri: 'SISA / PIUTANG', kanan: num(sisa), tebal: true },
         jual.jatuhTempo && { kiri: 'Jatuh tempo', kanan: fmtTgl(jual.jatuhTempo) }]
      : [{ kiri: 'Status', kanan: 'LUNAS' }]),
    { garis: true },
    { tengah: p.catatanStruk || 'Terima kasih' },
    jual.catatan && { tengah: jual.catatan, jarak: 4 },
  ].filter(Boolean);
}

/* ---------- surat titip barang (bukti konsinyasi) ---------- */
const sisaTitip = it => round2(toNum(it.qty) - toNum(it.terjual) - toNum(it.retur));

function barisTitip(k) {
  const m = get('mitra', k.mitraId);
  const sales = k.salesId ? get('sales', k.salesId) : null;
  const adaLaporan = k.items.some(it => toNum(it.terjual) || toNum(it.retur));
  const unitLaku = sum(k.items, it => it.terjual);
  const unitSisa = sum(k.items, sisaTitip);
  return [
    ...kepala('SURAT TITIP BARANG'),
    { tengah: '(Konsinyasi)' },
    { garis: true },
    { kiri: 'No', kanan: k.noRef },
    { kiri: 'Tanggal', kanan: fmtTgl(k.tanggal) },
    { kiri: 'Penerima', kanan: m?.nama || '-' },
    m && { kiri: 'Tipe', kanan: m.tipe === 'agen' ? 'Agen' : 'Reseller' },
    m?.alamat && { kiri: 'Alamat', kanan: m.alamat },
    sales && { kiri: 'Sales', kanan: sales.nama },
    k.jatuhTempo && { kiri: 'Batas laporan', kanan: fmtTgl(k.jatuhTempo) },
    { garis: true },
    ...k.items.map(it => {
      const pr = get('produk', it.produkId);
      return {
        produk: pr?.nama || '-',
        kiri: [num(it.qty), pr?.satuan, '×', num(it.harga)].filter(Boolean).join(' '),
        kanan: num(toNum(it.qty) * toNum(it.harga)),
        bawah: adaLaporan && `laku ${num(it.terjual)} · retur ${num(it.retur)} · sisa ${num(sisaTitip(it))}`,
      };
    }),
    { garis: true },
    { kiri: 'Total titip', kanan: `${num(sum(k.items, it => it.qty))} unit` },
    { kiri: 'NILAI TITIPAN', kanan: rp(sum(k.items, it => toNum(it.qty) * toNum(it.harga))), tebal: true, ukuran: 13 },
    adaLaporan && { kiri: 'Laku', kanan: `${num(unitLaku)} unit · ${num(sum(k.items, it => toNum(it.terjual) * toNum(it.harga)))}` },
    adaLaporan && { kiri: 'Sisa di mitra', kanan: `${num(unitSisa)} unit · ${num(sum(k.items, it => sisaTitip(it) * toNum(it.harga)))}` },
    { kiri: 'Status', kanan: k.status === 'batal' ? 'DIBATALKAN' : k.status === 'selesai' ? 'SELESAI' : 'BERJALAN', tebal: true },
    { garis: true },
    { tengah: 'Barang di atas DITITIPKAN, bukan dibeli putus. Pembayaran sesuai barang yang laku; sisa yang tidak laku dikembalikan.' },
    k.catatan && { tengah: k.catatan, jarak: 4 },
    { ttd: [{ label: 'Penerima', nama: m?.nama }, { label: 'Pengirim', nama: sales?.nama || namaToko() }] },
  ].filter(Boolean);
}

/* ---------- bukti pembayaran piutang / hutang ---------- */

/** pembayaran lama belum punya nomor sendiri; pakai potongan id-nya */
export const noBukti = byr => byr.noBukti || `BY-${String(byr.id).replace(/^byr_/, '').slice(-6).toUpperCase()}`;

function barisBayar(byr) {
  const piutang = byr.tipe !== 'hutang';
  const induk = get(piutang ? 'penjualan' : 'pembelian', byr.refId);
  const pihak = piutang
    ? induk?.mitraNama || get('mitra', byr.mitraId)?.nama || '-'
    : byr.supplier || induk?.supplier || '-';
  // `dibayar` pada nota sudah memuat pembayaran ini dan yang sesudahnya;
  // sisanya adalah uang muka + pembayaran sebelum yang ini
  const sesudahnya = sum(db.pembayaran.filter(x => x.refId === byr.refId && x.dibuat >= byr.dibuat), x => x.jumlah);
  const sebelum = Math.max(0, round2(toNum(induk?.dibayar) - sesudahnya));
  const sisa = round2(toNum(induk?.total) - sebelum - toNum(byr.jumlah));
  const kata = terbilang(byr.jumlah);
  return [
    ...kepala('BUKTI PEMBAYARAN'),
    { tengah: piutang ? '(Pelunasan Piutang)' : '(Pembayaran Hutang)' },
    { garis: true },
    { kiri: 'No', kanan: noBukti(byr) },
    { kiri: 'Tanggal', kanan: `${fmtTgl(byr.tanggal)} ${fmtJam(byr.dibuat)}` },
    { kiri: piutang ? 'Diterima dari' : 'Dibayar kepada', kanan: pihak },
    { kiri: piutang ? 'Untuk nota' : 'Untuk faktur', kanan: byr.noRef },
    { garis: true },
    induk && { kiri: piutang ? 'Total nota' : 'Total faktur', kanan: num(induk.total) },
    induk && { kiri: 'Dibayar sebelumnya', kanan: num(sebelum) },
    { kiri: 'JUMLAH BAYAR', kanan: rp(byr.jumlah), tebal: true, ukuran: 13 },
    { kiri: 'Metode', kanan: byr.metode === 'transfer' ? 'Transfer' : 'Tunai' },
    induk?.status === 'batal' ? { kiri: 'Status', kanan: 'NOTA DIBATALKAN', tebal: true }
      : induk && (sisa > 0 ? { kiri: 'SISA', kanan: num(sisa), tebal: true } : { kiri: 'Status', kanan: 'LUNAS', tebal: true }),
    { tengah: `Terbilang: ${kata[0].toUpperCase()}${kata.slice(1)} rupiah`, jarak: 4 },
    byr.catatan && { tengah: byr.catatan, jarak: 4 },
    { garis: true },
    { ttd: piutang
      ? [{ label: 'Penyetor', nama: pihak }, { label: 'Penerima', nama: namaToko() }]
      : [{ label: 'Penerima', nama: pihak }, { label: 'Pembayar', nama: namaToko() }] },
  ].filter(Boolean);
}

/* ---------- dokumen siap tampil ----------
   { judul, baris, berkas, teks } — dipakai bersama oleh modal pratinjau,
   gambar PNG, dan menu berbagi. */
const namaBerkas = (awalan, noRef) => `${awalan}-${String(noRef).replace(/[^\w-]+/g, '-')}.png`;

const dokNota = jual => ({
  judul: 'Nota ' + jual.noRef, baris: barisStruk(jual),
  berkas: namaBerkas('nota', jual.noRef), teks: () => teksStruk(jual),
});
const dokTitip = k => {
  const baris = barisTitip(k);
  return { judul: 'Surat Titip ' + k.noRef, baris, berkas: namaBerkas('titip', k.noRef), teks: () => teksBaris(baris) };
};
const dokBayar = byr => {
  const baris = barisBayar(byr);
  return { judul: 'Bukti Bayar ' + noBukti(byr), baris, berkas: namaBerkas('bukti-bayar', noBukti(byr)), teks: () => teksBaris(baris) };
};

/** versi teks untuk WhatsApp, diturunkan langsung dari baris dokumen */
function teksBaris(baris) {
  return baris.map(b => {
    if (b.logo || b.ttd) return null;
    if (b.garis) return '';
    if (b.tengah) return b.tebal ? `*${b.tengah}*` : b.tengah;
    if (b.produk) return `• ${b.produk}\n  ${b.kiri} = ${b.kanan}${b.bawah ? `\n  (${b.bawah})` : ''}`;
    return b.tebal ? `*${b.kiri}: ${b.kanan}*` : `${b.kiri}: ${b.kanan}`;
  }).filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function htmlBaris(baris) {
  return `
  <div class="receipt" id="areaStruk">${baris.map(b => {
    if (b.logo) return '<img class="r-logo" src="img/logo.svg" alt="">';
    if (b.garis) return '<div class="r-line"></div>';
    if (b.ttd) return `<div class="r-ttd">${b.ttd.map(t =>
      `<div><div>${esc(t.label)}</div><div class="r-ttd-ruang"></div><div>${esc(t.nama || '')}</div></div>`).join('')}</div>`;
    const gaya = [b.ukuran && `font-size:${b.ukuran}px`, b.jarak && `margin-top:${b.jarak}px`].filter(Boolean).join(';');
    const attr = `class="${b.tengah ? 'r-c' : 'r-row'}${b.tebal ? ' r-b' : ''}"${gaya ? ` style="${gaya}"` : ''}`;
    if (b.tengah) return `<div ${attr}>${esc(b.tengah)}</div>`;
    const baris = `<div ${attr}><span>${esc(b.kiri)}</span><span>${esc(b.kanan)}</span></div>`;
    return b.produk
      ? `<div style="margin-bottom:4px"><div>${esc(b.produk)}</div>${baris}${b.bawah ? `<div class="r-sub">${esc(b.bawah)}</div>` : ''}</div>`
      : baris;
  }).join('\n    ')}
  </div>`;
}

export const htmlStruk = jual => htmlBaris(barisStruk(jual));

/* ---------- gambar nota (PNG) ----------
   Digambar sendiri di canvas, bukan memotret DOM: tanpa pustaka tambahan,
   tetap jalan tanpa internet, dan hasilnya sama di semua peramban.
   Ukuran & jarak mengikuti .receipt di style.css. */
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

let logoSiap = null;
function muatLogo() {
  logoSiap ||= fetch('img/logo.svg')
    .then(r => r.text())
    .then(svg => new Promise((ok, gagal) => {
      // sebagian peramban menolak menggambar SVG yang tidak punya width/height
      const src = /<svg[^>]*\swidth=/.test(svg) ? svg : svg.replace('<svg', '<svg width="512" height="512"');
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = gagal;
      img.src = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml' }));
    }))
    .catch(() => { logoSiap = null; return null; }); // nota tetap jadi, hanya tanpa logo
  return logoSiap;
}

/** pecah teks per kata agar muat selebar `lebar` (kata kepanjangan dipotong) */
function bungkus(ctx, teks, lebar) {
  const hasil = [];
  let baris = '';
  for (const kata of String(teks ?? '').split(/\s+/).filter(Boolean)) {
    const coba = baris ? `${baris} ${kata}` : kata;
    if (ctx.measureText(coba).width <= lebar) { baris = coba; continue; }
    if (baris) hasil.push(baris);
    baris = kata;
    while (baris.length > 1 && ctx.measureText(baris).width > lebar) {
      let n = baris.length - 1;
      while (n > 1 && ctx.measureText(baris.slice(0, n)).width > lebar) n--;
      hasil.push(baris.slice(0, n));
      baris = baris.slice(n);
    }
  }
  hasil.push(baris);
  return hasil;
}

async function gambarBaris(daftar, skala = 3) {
  const LEBAR = 300, TEPI = 16, CELAH = 8, DASAR = 12, SPASI = 1.45;
  const logo = await muatLogo();
  const ctx = document.createElement('canvas').getContext('2d');
  const font = b => `${b.tebal ? 700 : 400} ${b.ukuran || DASAR}px ${MONO}`;

  // tahap 1: susun yang akan digambar sekaligus menghitung tinggi nota
  const tugas = [];
  let y = TEPI;
  const tulis = (baris, x, rata, f, tinggi) => baris.forEach(teks => {
    tugas.push({ teks, x, y: y + tinggi / 2, rata, f });
    y += tinggi;
  });
  for (const b of daftar) {
    if (b.logo) {
      if (logo) { tugas.push({ logo, x: TEPI + (LEBAR - 54) / 2, y: y + 2 }); y += 2 + 54 + 7; }
      continue;
    }
    if (b.garis) { tugas.push({ garis: y + 6.5 }); y += 13; continue; }
    if (b.ttd) {
      // kolom tanda tangan: label, ruang kosong bergaris, lalu nama — seperti .r-ttd
      const f = font({}), tinggi = DASAR * SPASI, JEDA = 16;
      const w = (LEBAR - JEDA * (b.ttd.length - 1)) / b.ttd.length;
      ctx.font = f;
      const y0 = y + 8;
      let yAkhir = y0;
      b.ttd.forEach((t, i) => {
        const tengah = TEPI + i * (w + JEDA) + w / 2;
        y = y0;
        tulis([t.label], tengah, 'center', f, tinggi);
        y += 40;
        tugas.push({ garisTtd: y, x1: tengah - w / 2 + 6, x2: tengah + w / 2 - 6 });
        y += 4;
        tulis(bungkus(ctx, t.nama || '', w), tengah, 'center', f, tinggi);
        yAkhir = Math.max(yAkhir, y);
      });
      y = yAkhir;
      continue;
    }
    const f = font(b), tinggi = (b.ukuran || DASAR) * SPASI;
    y += b.jarak || 0;
    ctx.font = f;
    if (b.tengah) { tulis(bungkus(ctx, b.tengah, LEBAR), TEPI + LEBAR / 2, 'center', f, tinggi); continue; }
    if (b.produk) tulis(bungkus(ctx, b.produk, LEBAR), TEPI, 'left', f, tinggi);
    // kiri & kanan berbagi satu baris; bila tidak muat, keduanya menyempit
    // sebanding lebarnya lalu turun baris — seperti flex di layar
    const wk = ctx.measureText(b.kiri).width, wn = ctx.measureText(b.kanan).width;
    const muat = wk + CELAH + wn <= LEBAR;
    const kiri = muat ? [b.kiri] : bungkus(ctx, b.kiri, (LEBAR - CELAH) * wk / (wk + wn));
    const kanan = muat ? [b.kanan] : bungkus(ctx, b.kanan, (LEBAR - CELAH) * wn / (wk + wn));
    const y0 = y;
    tulis(kanan, TEPI + LEBAR, 'right', f, tinggi);
    const yKanan = y;
    y = y0;
    tulis(kiri, TEPI, 'left', f, tinggi);
    y = Math.max(y, yKanan);
    if (b.bawah) {
      const fk = `400 11px ${MONO}`;
      ctx.font = fk;
      tulis(bungkus(ctx, b.bawah, LEBAR), TEPI, 'left', fk, 11 * SPASI);
    }
    y += b.produk ? 4 : 0;
  }
  y += TEPI;

  // tahap 2: gambar
  const kanvas = ctx.canvas;
  kanvas.width = Math.ceil((LEBAR + TEPI * 2) * skala);
  kanvas.height = Math.ceil(y * skala);
  ctx.scale(skala, skala);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, LEBAR + TEPI * 2, y);
  ctx.fillStyle = '#0f172a';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (const t of tugas) {
    if (t.logo) { ctx.drawImage(t.logo, t.x, t.y, 54, 54); continue; }
    if (t.garis) {
      ctx.beginPath(); ctx.moveTo(TEPI, t.garis); ctx.lineTo(TEPI + LEBAR, t.garis); ctx.stroke();
      continue;
    }
    if (t.garisTtd) {
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(t.x1, t.garisTtd); ctx.lineTo(t.x2, t.garisTtd); ctx.stroke();
      ctx.setLineDash([3, 3]);
      continue;
    }
    ctx.font = t.f;
    ctx.textAlign = t.rata;
    ctx.fillText(t.teks, t.x, t.y);
  }
  return new Promise((ok, gagal) => kanvas.toBlob(b => (b ? ok(b) : gagal(new Error('Gagal membuat gambar'))), 'image/png'));
}

export const gambarStruk = (jual, skala = 3) => gambarBaris(barisStruk(jual), skala);

function tampilkanDok(dok, { onTutup } = {}) {
  // Gambar disiapkan begitu dokumen dibuka. navigator.share hanya mau jalan
  // sesaat setelah pengguna mengetuk, jadi gambar harus sudah jadi saat
  // tombol Bagikan ditekan, bukan baru mulai dibuat.
  const gambar = gambarBaris(dok.baris).catch(e => { console.warn(e); return null; });
  return modal({
    judul: dok.judul,
    isi: htmlBaris(dok.baris),
    onTutup,
    tombol: [
      { teks: '📤 Bagikan', kelas: 'btn-ghost', aksi: () => bagikanDok(dok, gambar) },
      { teks: '🖨️ Cetak', kelas: 'btn-primary', aksi: () => window.print() },
    ],
  });
}

export const tampilkanStruk = (jual, opsi) => tampilkanDok(dokNota(jual), opsi);
/** surat titip barang: bukti serah terima barang konsinyasi ke mitra */
export const tampilkanSuratTitip = (k, opsi) => tampilkanDok(dokTitip(k), opsi);
/** bukti pembayaran satu rekaman `pembayaran` (piutang maupun hutang) */
export const tampilkanBuktiBayar = (byr, opsi) => tampilkanDok(dokBayar(byr), opsi);

/** teks ringkas untuk WhatsApp */
export function teksStruk(jual) {
  const p = db.pengaturan;
  const sisa = toNum(jual.total) - toNum(jual.dibayar);
  const baris = jual.items.map(i => {
    const pr = get('produk', i.produkId);
    return `• ${pr?.nama || '-'}\n  ${num(i.qty)} × ${rp(i.harga)} = ${rp(toNum(i.qty) * toNum(i.harga))}`;
  }).join('\n');
  return `*${p.namaToko || 'LUHUNG NUSANTARA'}*
Nota: ${jual.noRef}
Tanggal: ${fmtTgl(jual.tanggal)}
Pelanggan: ${jual.mitraNama}${jual.promo ? '\nHarga: PROMO' : ''}

${baris}

Subtotal: ${rp(jual.subtotal)}${toNum(jual.diskon) ? `\nDiskon: -${rp(jual.diskon)}` : ''}
*TOTAL: ${rp(jual.total)}*
Dibayar: ${rp(jual.dibayar)}${sisa > 0 ? `\nSisa: ${rp(sisa)}${jual.jatuhTempo ? ` (tempo ${fmtTgl(jual.jatuhTempo)})` : ''}` : '\nStatus: LUNAS'}

${p.catatanStruk || 'Terima kasih'}`;
}

/** bagikan nota sebagai foto lewat menu berbagi perangkat (WhatsApp, dll.) */
export const bagikanStruk = (jual, gambar = null) => bagikanDok(dokNota(jual), gambar);

async function bagikanDok(dok, gambar = null) {
  const blob = await (gambar || gambarBaris(dok.baris).catch(() => null));
  const berkas = blob && new File([blob], dok.berkas, { type: 'image/png' });
  if (berkas && navigator.canShare?.({ files: [berkas] })) {
    try { await navigator.share({ files: [berkas] }); return; } catch (e) {
      if (e.name === 'AbortError') return; // pengguna menutup menu berbagi
    }
  }
  modalBagikan(dok, blob, berkas);
}

/** cadangan bila perangkat tidak bisa membagikan berkas (umumnya PC) */
function modalBagikan(dok, blob, berkas) {
  const teks = dok.teks();
  const url = blob ? URL.createObjectURL(blob) : '';
  const bisaBagikan = berkas && navigator.canShare?.({ files: [berkas] });
  const bisaSalin = blob && window.ClipboardItem && navigator.clipboard?.write;
  modal({
    judul: 'Bagikan ' + dok.judul,
    isi: blob
      ? `<img src="${url}" alt="${esc(dok.judul)}" style="display:block;max-width:100%;max-height:52vh;margin:0 auto 12px;border:1px solid var(--border);border-radius:8px">
         <div class="hint">${bisaSalin
           ? 'Ketuk <b>Salin Gambar</b>, lalu tempel (Ctrl+V) di chat WhatsApp. Atau unduh gambarnya lalu lampirkan.'
           : 'Unduh gambarnya, lalu lampirkan di chat WhatsApp.'}</div>`
      : `<textarea class="textarea" rows="14" readonly>${esc(teks)}</textarea>`,
    onTutup: () => url && URL.revokeObjectURL(url),
    tombol: [
      { teks: 'Salin Teks', kelas: 'btn-ghost', aksi: () => salinTeks(teks) },
      blob && { teks: '⬇️ Unduh', kelas: bisaSalin || bisaBagikan ? '' : 'btn-primary', aksi: () => unduh(dok.berkas, blob, 'image/png') },
      bisaSalin && {
        teks: '📋 Salin Gambar', kelas: bisaBagikan ? '' : 'btn-primary', aksi: async () => {
          try {
            await salinGambar(blob);
            sukses(`${dok.judul} disalin — tempel (Ctrl+V) di chat WhatsApp`);
          } catch { gagal('Gambar tidak bisa disalin, pakai Unduh'); }
        },
      },
      bisaBagikan && { teks: '📤 Bagikan', kelas: 'btn-primary', aksi: () => navigator.share({ files: [berkas] }).catch(() => {}) },
    ].filter(Boolean),
  });
}

/* Chrome di Windows hanya mencoba membuka clipboard 5 × 5 ms. Bila saat itu
   clipboard sedang dipegang aplikasi lain (WhatsApp sesaat setelah menempel,
   riwayat clipboard Windows, pengelola clipboard, remote desktop), penulisan
   dibatalkan diam-diam namun janjinya tetap sukses — yang tertempel lalu masih
   nota sebelumnya. Karena kegagalan itu tidak bisa dideteksi, gambar ditulis
   sekali lagi setelah jeda singkat; isinya sama, jadi tidak ada ruginya. */
async function salinGambar(blob) {
  const tulis = () => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  await tulis(); // galat percobaan pertama diteruskan ke pemanggil
  await new Promise(r => setTimeout(r, 300));
  await tulis().catch(() => {});
}

async function salinTeks(teks) {
  try {
    await navigator.clipboard.writeText(teks);
    sukses('Teks disalin ke clipboard');
  } catch {
    modal({ judul: 'Salin Teks', isi: `<textarea class="textarea" rows="14" readonly>${esc(teks)}</textarea>` });
  }
}
