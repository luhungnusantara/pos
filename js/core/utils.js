/* utils.js — helper umum */

/* ---------- angka & uang ---------- */
export const toNum = v => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null) return 0;
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};

export const num = (n, dec = 0) =>
  (Math.round((toNum(n) + Number.EPSILON) * 10 ** dec) / 10 ** dec)
    .toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const rp = (n, dec = 0) => 'Rp' + num(n, dec);

/** Rp ringkas untuk kartu statistik: Rp1,2 jt */
export const rpShort = n => {
  const v = toNum(n), a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}Rp${num(a / 1e9, 2)} M`;
  if (a >= 1e6) return `${s}Rp${num(a / 1e6, 1)} jt`;
  if (a >= 1e3) return `${s}Rp${num(a / 1e3, 0)} rb`;
  return rp(v);
};

export const round2 = n => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
export const sum = (arr, fn = x => x) => (arr || []).reduce((t, x, i) => t + toNum(fn(x, i)), 0);
export const clamp = (n, min, max) => Math.min(max, Math.max(min, toNum(n)));

/* ---------- tanggal ---------- */
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const nowISO = () => new Date().toISOString();

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const fmtTgl = iso => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
};
export const fmtTglPendek = iso => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
};
export const fmtJam = iso => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const fmtTglJam = iso => `${fmtTgl(iso)} ${fmtJam(iso)}`;
export const namaBulan = m => BULAN_PANJANG[m] || '';

/** selisih hari (b - a) */
export const selisihHari = (a, b = todayISO()) =>
  Math.floor((new Date(b.slice(0, 10)) - new Date(String(a).slice(0, 10))) / 86400000);

export const awalBulan = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE');
export const akhirBulan = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('sv-SE');
export const tambahHari = (iso, n) => {
  const d = new Date(iso.slice(0, 10));
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
/** apakah tanggal iso berada di rentang [dari,sampai] (inklusif) */
export const dalamRentang = (iso, dari, sampai) => {
  const t = String(iso).slice(0, 10);
  return (!dari || t >= dari) && (!sampai || t <= sampai);
};

/* ---------- id & kode ---------- */
export const uid = (pfx = '') =>
  pfx + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Nomor transaksi: PREFIX/YYMM/0001 */
export const noUrut = (prefix, list, field = 'noRef') => {
  const d = new Date();
  const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const pola = `${prefix}/${ym}/`;
  const last = (list || [])
    .map(x => String(x?.[field] || ''))
    .filter(s => s.startsWith(pola))
    .map(s => parseInt(s.slice(pola.length), 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return pola + String(last + 1).padStart(4, '0');
};

/* ---------- string ---------- */
export const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const initial = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export const cocok = (teks, q) =>
  !q || String(teks || '').toLowerCase().includes(String(q).toLowerCase().trim());

export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- array ---------- */
export const groupBy = (arr, key) => (arr || []).reduce((m, x) => {
  const k = typeof key === 'function' ? key(x) : x[key];
  (m[k] ||= []).push(x);
  return m;
}, {});

export const sortBy = (arr, fn, desc = false) =>
  [...(arr || [])].sort((a, b) => {
    const x = fn(a), y = fn(b);
    return (x > y ? 1 : x < y ? -1 : 0) * (desc ? -1 : 1);
  });

/* ---------- dom ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

/** delegasi event: on(root,'click','[data-act]',handler) */
export const on = (root, evt, sel, fn) => {
  root.addEventListener(evt, e => {
    const t = e.target.closest(sel);
    if (t && root.contains(t)) fn(e, t);
  });
};

/* ---------- file ---------- */
export const unduh = (nama, isi, tipe = 'application/json') => {
  const blob = new Blob([isi], { type: `${tipe};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

/** array of object -> CSV (pemisah ; agar ramah Excel Indonesia) */
export const toCSV = (rows, kolom) => {
  if (!rows?.length) return '';
  const keys = kolom || Object.keys(rows[0]);
  const cell = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(';'), ...rows.map(r => keys.map(k => cell(r[k])).join(';'))].join('\n');
};
