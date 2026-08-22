/* bayar.js — dialog pelunasan piutang & hutang (dipakai beberapa halaman) */

import { bayarPiutang, bayarHutang, sisaPiutang } from './domain.js';
import { modal, sukses, gagal, pasangRupiah } from './ui.js';
import { esc, rp, num, toNum, todayISO, fmtTgl } from './utils.js';

export function modalBayarPiutang(jual, onSelesai) {
  const sisa = sisaPiutang(jual);
  if (sisa <= 0) return gagal('Nota ini sudah lunas');

  modal({
    judul: 'Terima Pembayaran',
    isi: `
      <div class="card mb12"><div class="card-body">
        <div class="kv"><span class="k">No. Nota</span><span class="v mono">${esc(jual.noRef)}</span></div>
        <div class="kv"><span class="k">Pelanggan</span><span class="v">${esc(jual.mitraNama)}</span></div>
        <div class="kv"><span class="k">Total Nota</span><span class="v">${rp(jual.total)}</span></div>
        <div class="kv"><span class="k">Sudah Dibayar</span><span class="v pos">${rp(jual.dibayar)}</span></div>
        <div class="kv total"><span class="k">Sisa Piutang</span><span class="v">${rp(sisa)}</span></div>
      </div></div>
      <div class="form-row">
        <div class="field"><label>Jumlah Bayar</label>
          <input class="input num" id="jml" inputmode="numeric" data-rupiah value="${num(sisa)}"></div>
        <div class="field"><label>Tanggal</label>
          <input class="input" type="date" id="tgl" value="${todayISO()}"></div>
        <div class="field"><label>Metode</label>
          <select class="select" id="metode"><option value="tunai">Tunai</option><option value="transfer">Transfer</option></select></div>
        <div class="field"><label>Catatan</label><input class="input" id="ket" placeholder="Opsional"></div>
      </div>
      <button class="btn btn-soft btn-block" id="lunasi">Bayar Lunas ${rp(sisa)}</button>`,
    tombol: [
      { teks: 'Batal', kelas: 'btn-ghost' },
      {
        teks: 'Simpan Pembayaran', kelas: 'btn-primary', aksi: h => {
          const jumlah = toNum(h.body.querySelector('#jml').value);
          if (jumlah <= 0) return gagal('Jumlah bayar harus lebih dari nol');
          bayarPiutang({
            penjualanId: jual.id, jumlah,
            tanggal: h.body.querySelector('#tgl').value || todayISO(),
            metode: h.body.querySelector('#metode').value,
            catatan: h.body.querySelector('#ket').value,
          });
          h.tutup();
          sukses(`Pembayaran ${rp(Math.min(jumlah, sisa))} tercatat`);
          onSelesai?.();
        },
      },
    ],
    onBuka: (body, h) => {
      pasangRupiah(body);
      body.querySelector('#lunasi').onclick = () => {
        body.querySelector('#jml').value = num(sisa);
      };
    },
  });
}

export function modalBayarHutang(beli, onSelesai) {
  const sisa = Math.max(0, toNum(beli.total) - toNum(beli.dibayar));
  if (sisa <= 0) return gagal('Pembelian ini sudah lunas');

  modal({
    judul: 'Bayar Hutang Supplier',
    isi: `
      <div class="card mb12"><div class="card-body">
        <div class="kv"><span class="k">No. Faktur</span><span class="v mono">${esc(beli.noRef)}</span></div>
        <div class="kv"><span class="k">Supplier</span><span class="v">${esc(beli.supplier)}</span></div>
        <div class="kv"><span class="k">Tanggal</span><span class="v">${fmtTgl(beli.tanggal)}</span></div>
        <div class="kv"><span class="k">Total</span><span class="v">${rp(beli.total)}</span></div>
        <div class="kv total"><span class="k">Sisa Hutang</span><span class="v">${rp(sisa)}</span></div>
      </div></div>
      <div class="form-row">
        <div class="field"><label>Jumlah Bayar</label>
          <input class="input num" id="jml" inputmode="numeric" data-rupiah value="${num(sisa)}"></div>
        <div class="field"><label>Tanggal</label>
          <input class="input" type="date" id="tgl" value="${todayISO()}"></div>
        <div class="field"><label>Metode</label>
          <select class="select" id="metode"><option value="tunai">Tunai</option><option value="transfer">Transfer</option></select></div>
        <div class="field"><label>Catatan</label><input class="input" id="ket" placeholder="Opsional"></div>
      </div>`,
    tombol: [
      { teks: 'Batal', kelas: 'btn-ghost' },
      {
        teks: 'Simpan', kelas: 'btn-primary', aksi: h => {
          const jumlah = toNum(h.body.querySelector('#jml').value);
          if (jumlah <= 0) return gagal('Jumlah bayar harus lebih dari nol');
          bayarHutang({
            pembelianId: beli.id, jumlah,
            tanggal: h.body.querySelector('#tgl').value || todayISO(),
            metode: h.body.querySelector('#metode').value,
            catatan: h.body.querySelector('#ket').value,
          });
          h.tutup();
          sukses('Pembayaran hutang tercatat');
          onSelesai?.();
        },
      },
    ],
    onBuka: body => pasangRupiah(body),
  });
}
