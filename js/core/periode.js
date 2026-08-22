/* periode.js — pemilih rentang tanggal yang dipakai bersama */
import { todayISO, tambahHari, awalBulan, akhirBulan, fmtTgl } from './utils.js';

export const OPSI_PERIODE = [
  { value: 'hari', label: 'Hari Ini' },
  { value: '7hari', label: '7 Hari' },
  { value: '30hari', label: '30 Hari' },
  { value: 'bulan', label: 'Bulan Ini' },
  { value: 'bulanlalu', label: 'Bulan Lalu' },
  { value: 'semua', label: 'Semua' },
  { value: 'custom', label: 'Pilih Tanggal…' },
];

export function hitungPeriode(kode, custom = {}) {
  const hari = todayISO();
  switch (kode) {
    case 'hari': return { dari: hari, sampai: hari, label: 'hari ini' };
    case '7hari': return { dari: tambahHari(hari, -6), sampai: hari, label: '7 hari terakhir' };
    case '30hari': return { dari: tambahHari(hari, -29), sampai: hari, label: '30 hari terakhir' };
    case 'bulan': return { dari: awalBulan(), sampai: akhirBulan(), label: 'bulan ini' };
    case 'bulanlalu': {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
      return { dari: awalBulan(d), sampai: akhirBulan(d), label: 'bulan lalu' };
    }
    case 'custom': return {
      dari: custom.dari || hari, sampai: custom.sampai || hari,
      label: `${fmtTgl(custom.dari || hari)} – ${fmtTgl(custom.sampai || hari)}`,
    };
    default: return { dari: null, sampai: null, label: 'semua periode' };
  }
}

/** HTML select + input tanggal custom */
export const htmlPeriode = (kode, custom = {}, id = 'periode') => `
  <select class="select" id="${id}" style="max-width:180px">
    ${OPSI_PERIODE.map(o => `<option value="${o.value}" ${o.value === kode ? 'selected' : ''}>${o.label}</option>`).join('')}
  </select>
  <div class="flex" id="${id}Custom" ${kode === 'custom' ? '' : 'hidden'} style="gap:6px">
    <input class="input" type="date" id="${id}Dari" value="${custom.dari || todayISO()}" style="max-width:150px">
    <span class="muted">–</span>
    <input class="input" type="date" id="${id}Sampai" value="${custom.sampai || todayISO()}" style="max-width:150px">
  </div>`;

/** pasang event; onUbah({kode, dari, sampai}) */
export function pasangPeriode(root, state, onUbah, id = 'periode') {
  const sel = root.querySelector(`#${id}`);
  const box = root.querySelector(`#${id}Custom`);
  const dari = root.querySelector(`#${id}Dari`);
  const sampai = root.querySelector(`#${id}Sampai`);
  if (!sel) return;
  sel.onchange = () => {
    state.kode = sel.value;
    box.hidden = sel.value !== 'custom';
    if (sel.value !== 'custom') onUbah(state);
  };
  const ubahCustom = () => {
    state.dari = dari.value; state.sampai = sampai.value;
    onUbah(state);
  };
  if (dari) dari.onchange = ubahCustom;
  if (sampai) sampai.onchange = ubahCustom;
}
