/* struk.js — tampilan & cetak nota */
import { db, get } from './store.js';
import { modal, sukses } from './ui.js';
import { esc, rp, num, toNum, fmtTgl, fmtJam } from './utils.js';

export function htmlStruk(jual) {
  const p = db.pengaturan;
  const sales = jual.salesId ? get('sales', jual.salesId) : null;
  const sisa = toNum(jual.total) - toNum(jual.dibayar);
  return `
  <div class="receipt" id="areaStruk">
    <div class="r-c r-b" style="font-size:14px">${esc(p.namaToko || 'POS ROKOK')}</div>
    ${p.alamat ? `<div class="r-c">${esc(p.alamat)}</div>` : ''}
    ${p.telp ? `<div class="r-c">Telp: ${esc(p.telp)}</div>` : ''}
    <div class="r-line"></div>
    <div class="r-row"><span>No</span><span>${esc(jual.noRef)}</span></div>
    <div class="r-row"><span>Tanggal</span><span>${fmtTgl(jual.tanggal)} ${fmtJam(jual.dibuat)}</span></div>
    <div class="r-row"><span>Pelanggan</span><span>${esc(jual.mitraNama)}</span></div>
    <div class="r-row"><span>Tipe</span><span>${jual.tipeMitra === 'agen' ? 'Agen' : jual.tipeMitra === 'reseller' ? 'Reseller' : 'Umum'}</span></div>
    ${sales ? `<div class="r-row"><span>Sales</span><span>${esc(sales.nama)}</span></div>` : ''}
    <div class="r-line"></div>
    ${jual.items.map(i => {
      const pr = get('produk', i.produkId);
      return `<div style="margin-bottom:4px">
        <div>${esc(pr?.nama || '-')}</div>
        <div class="r-row"><span>${num(i.qty)} ${esc(pr?.satuan || '')} × ${num(i.harga)}</span><span>${num(toNum(i.qty) * toNum(i.harga))}</span></div>
      </div>`;
    }).join('')}
    <div class="r-line"></div>
    <div class="r-row"><span>Subtotal</span><span>${num(jual.subtotal)}</span></div>
    ${toNum(jual.diskon) ? `<div class="r-row"><span>Diskon</span><span>-${num(jual.diskon)}</span></div>` : ''}
    <div class="r-row r-b" style="font-size:13px"><span>TOTAL</span><span>${rp(jual.total)}</span></div>
    <div class="r-row"><span>Bayar (${esc(jual.metode || 'tunai')})</span><span>${num(jual.dibayar)}</span></div>
    ${sisa > 0
      ? `<div class="r-row r-b"><span>SISA / PIUTANG</span><span>${num(sisa)}</span></div>
         ${jual.jatuhTempo ? `<div class="r-row"><span>Jatuh tempo</span><span>${fmtTgl(jual.jatuhTempo)}</span></div>` : ''}`
      : `<div class="r-row"><span>Status</span><span>LUNAS</span></div>`}
    <div class="r-line"></div>
    <div class="r-c">${esc(p.catatanStruk || 'Terima kasih')}</div>
    ${jual.catatan ? `<div class="r-c" style="margin-top:4px">${esc(jual.catatan)}</div>` : ''}
  </div>`;
}

export function tampilkanStruk(jual, { onTutup } = {}) {
  return modal({
    judul: 'Nota ' + jual.noRef,
    isi: htmlStruk(jual),
    onTutup,
    tombol: [
      { teks: '📤 Bagikan', kelas: 'btn-ghost', aksi: () => bagikanStruk(jual) },
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
  return `*${p.namaToko || 'POS ROKOK'}*
Nota: ${jual.noRef}
Tanggal: ${fmtTgl(jual.tanggal)}
Pelanggan: ${jual.mitraNama}

${baris}

Subtotal: ${rp(jual.subtotal)}${toNum(jual.diskon) ? `\nDiskon: -${rp(jual.diskon)}` : ''}
*TOTAL: ${rp(jual.total)}*
Dibayar: ${rp(jual.dibayar)}${sisa > 0 ? `\nSisa: ${rp(sisa)}${jual.jatuhTempo ? ` (tempo ${fmtTgl(jual.jatuhTempo)})` : ''}` : '\nStatus: LUNAS'}

${p.catatanStruk || 'Terima kasih'}`;
}

export async function bagikanStruk(jual) {
  const teks = teksStruk(jual);
  if (navigator.share) {
    try { await navigator.share({ title: 'Nota ' + jual.noRef, text: teks }); return; } catch { /* dibatalkan */ }
  }
  try {
    await navigator.clipboard.writeText(teks);
    sukses('Teks nota disalin ke clipboard');
  } catch {
    modal({ judul: 'Salin Nota', isi: `<textarea class="textarea" rows="14" readonly>${esc(teks)}</textarea>` });
  }
}
