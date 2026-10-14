/* struk.js — tampilan & cetak nota */
import { db, get } from './store.js';
import { modal, sukses, gagal } from './ui.js';
import { esc, rp, num, toNum, fmtTgl, fmtJam, unduh } from './utils.js';

/* Isi nota sebagai daftar baris. Satu sumber untuk tampilan di layar (HTML)
   dan untuk gambar yang dibagikan (canvas), supaya foto nota yang terkirim
   sama dengan pratinjaunya. */
function barisStruk(jual) {
  const p = db.pengaturan;
  const sales = jual.salesId ? get('sales', jual.salesId) : null;
  const sisa = toNum(jual.total) - toNum(jual.dibayar);
  return [
    { logo: true },
    { tengah: p.namaToko || 'LUHUNG NUSANTARA', tebal: true, ukuran: 14 },
    p.alamat && { tengah: p.alamat },
    p.telp && { tengah: `Telp: ${p.telp}` },
    { garis: true },
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

export function htmlStruk(jual) {
  return `
  <div class="receipt" id="areaStruk">${barisStruk(jual).map(b => {
    if (b.logo) return '<img class="r-logo" src="img/logo.svg" alt="">';
    if (b.garis) return '<div class="r-line"></div>';
    const gaya = [b.ukuran && `font-size:${b.ukuran}px`, b.jarak && `margin-top:${b.jarak}px`].filter(Boolean).join(';');
    const attr = `class="${b.tengah ? 'r-c' : 'r-row'}${b.tebal ? ' r-b' : ''}"${gaya ? ` style="${gaya}"` : ''}`;
    if (b.tengah) return `<div ${attr}>${esc(b.tengah)}</div>`;
    const baris = `<div ${attr}><span>${esc(b.kiri)}</span><span>${esc(b.kanan)}</span></div>`;
    return b.produk ? `<div style="margin-bottom:4px"><div>${esc(b.produk)}</div>${baris}</div>` : baris;
  }).join('\n    ')}
  </div>`;
}

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

export async function gambarStruk(jual, skala = 3) {
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
  for (const b of barisStruk(jual)) {
    if (b.logo) {
      if (logo) { tugas.push({ logo, x: TEPI + (LEBAR - 54) / 2, y: y + 2 }); y += 2 + 54 + 7; }
      continue;
    }
    if (b.garis) { tugas.push({ garis: y + 6.5 }); y += 13; continue; }
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
    y = Math.max(y, yKanan) + (b.produk ? 4 : 0);
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
    ctx.font = t.f;
    ctx.textAlign = t.rata;
    ctx.fillText(t.teks, t.x, t.y);
  }
  return new Promise((ok, gagal) => kanvas.toBlob(b => (b ? ok(b) : gagal(new Error('Gagal membuat gambar nota'))), 'image/png'));
}

const namaBerkas = jual => `nota-${String(jual.noRef).replace(/[^\w-]+/g, '-')}.png`;

export function tampilkanStruk(jual, { onTutup } = {}) {
  // Gambar disiapkan begitu nota dibuka. navigator.share hanya mau jalan
  // sesaat setelah pengguna mengetuk, jadi gambar harus sudah jadi saat
  // tombol Bagikan ditekan, bukan baru mulai dibuat.
  const gambar = gambarStruk(jual).catch(e => { console.warn(e); return null; });
  return modal({
    judul: 'Nota ' + jual.noRef,
    isi: htmlStruk(jual),
    onTutup,
    tombol: [
      { teks: '📤 Bagikan', kelas: 'btn-ghost', aksi: () => bagikanStruk(jual, gambar) },
      { teks: '🖨️ Cetak', kelas: 'btn-primary', aksi: () => window.print() },
    ],
  });
}

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
export async function bagikanStruk(jual, gambar = null) {
  const blob = await (gambar || gambarStruk(jual).catch(() => null));
  const berkas = blob && new File([blob], namaBerkas(jual), { type: 'image/png' });
  if (berkas && navigator.canShare?.({ files: [berkas] })) {
    try { await navigator.share({ files: [berkas] }); return; } catch (e) {
      if (e.name === 'AbortError') return; // pengguna menutup menu berbagi
    }
  }
  modalBagikan(jual, blob, berkas);
}

/** cadangan bila perangkat tidak bisa membagikan berkas (umumnya PC) */
function modalBagikan(jual, blob, berkas) {
  const teks = teksStruk(jual);
  const url = blob ? URL.createObjectURL(blob) : '';
  const bisaBagikan = berkas && navigator.canShare?.({ files: [berkas] });
  const bisaSalin = blob && window.ClipboardItem && navigator.clipboard?.write;
  modal({
    judul: 'Bagikan Nota ' + jual.noRef,
    isi: blob
      ? `<img src="${url}" alt="Nota ${esc(jual.noRef)}" style="display:block;max-width:100%;max-height:52vh;margin:0 auto 12px;border:1px solid var(--border);border-radius:8px">
         <div class="hint">${bisaSalin
           ? 'Ketuk <b>Salin Gambar</b>, lalu tempel (Ctrl+V) di chat WhatsApp. Atau unduh gambarnya lalu lampirkan.'
           : 'Unduh gambar nota, lalu lampirkan di chat WhatsApp.'}</div>`
      : `<textarea class="textarea" rows="14" readonly>${esc(teks)}</textarea>`,
    onTutup: () => url && URL.revokeObjectURL(url),
    tombol: [
      { teks: 'Salin Teks', kelas: 'btn-ghost', aksi: () => salinTeks(teks) },
      blob && { teks: '⬇️ Unduh', kelas: bisaSalin || bisaBagikan ? '' : 'btn-primary', aksi: () => unduh(namaBerkas(jual), blob, 'image/png') },
      bisaSalin && {
        teks: '📋 Salin Gambar', kelas: bisaBagikan ? '' : 'btn-primary', aksi: async () => {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            sukses('Gambar nota disalin — tempel di chat WhatsApp');
          } catch { gagal('Gambar tidak bisa disalin, pakai Unduh'); }
        },
      },
      bisaBagikan && { teks: '📤 Bagikan', kelas: 'btn-primary', aksi: () => navigator.share({ files: [berkas] }).catch(() => {}) },
    ].filter(Boolean),
  });
}

async function salinTeks(teks) {
  try {
    await navigator.clipboard.writeText(teks);
    sukses('Teks nota disalin ke clipboard');
  } catch {
    modal({ judul: 'Salin Nota', isi: `<textarea class="textarea" rows="14" readonly>${esc(teks)}</textarea>` });
  }
}
