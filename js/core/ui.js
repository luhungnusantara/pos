/* ui.js — komponen antarmuka: toast, modal, form, pemilih item */
import { esc, toNum, toInt, num, $, $$, cocok, debounce, initial } from './utils.js';

/* =========================================================
   TOAST
   ========================================================= */
const toastRoot = () => document.getElementById('toastRoot');

export function toast(pesan, tipe = '', ms = 2600, aksi = null) {
  const el = document.createElement('div');
  el.className = `toast ${tipe}${aksi ? ' toast-aksi' : ''}`;
  const ikon = { ok: '✅', bad: '⛔', warn: '⚠️' }[tipe] || 'ℹ️';
  el.innerHTML = `<span>${ikon}</span><span>${esc(pesan)}</span>`;
  if (aksi) {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    const jalan = () => { el.remove(); aksi(); };
    el.addEventListener('click', jalan);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jalan(); } });
  }
  toastRoot().appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 220);
  }, ms);
}

export const sukses = m => toast(m, 'ok');
export const gagal = m => toast(m, 'bad');
export const ingat = m => toast(m, 'warn');

/* =========================================================
   MODAL
   ========================================================= */
const modalRoot = () => document.getElementById('modalRoot');
const tumpukan = [];

function pasangEsc() {
  if (pasangEsc.dipasang) return;
  pasangEsc.dipasang = true;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && tumpukan.length) {
      const t = tumpukan[tumpukan.length - 1];
      if (t.opsi.tutupEsc !== false) t.tutup();
    }
  });
}

/**
 * modal({judul, isi, tombol:[{teks,kelas,aksi(handle)}], lebar:'wide', onBuka(el,handle)})
 */
export function modal(opsi = {}) {
  pasangEsc();
  const root = modalRoot();
  root.hidden = false;
  document.body.style.overflow = 'hidden';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:inherit;justify-content:center;padding:inherit';
  wrap.innerHTML = `
    <div class="modal-back" data-tutup></div>
    <div class="modal ${opsi.lebar === 'wide' ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${esc(opsi.judul || '')}</h3>
        <button class="icon-btn" data-tutup aria-label="Tutup">✕</button>
      </div>
      <div class="modal-body">${opsi.isi || ''}</div>
      ${opsi.tombol?.length ? '<div class="modal-foot"></div>' : ''}
    </div>`;
  root.appendChild(wrap);

  const handle = {
    el: wrap.querySelector('.modal'),
    body: wrap.querySelector('.modal-body'),
    foot: wrap.querySelector('.modal-foot'),
    tutup() {
      const i = tumpukan.indexOf(handle);
      if (i >= 0) tumpukan.splice(i, 1);
      wrap.remove();
      if (!tumpukan.length) {
        root.hidden = true;
        document.body.style.overflow = '';
      }
      opsi.onTutup?.();
    },
    setJudul(t) { wrap.querySelector('.modal-head h3').textContent = t; },
    setIsi(html) { handle.body.innerHTML = html; },
  };

  (opsi.tombol || []).forEach(b => {
    const btn = document.createElement('button');
    btn.className = `btn ${b.kelas || ''}`;
    btn.innerHTML = b.teks;
    btn.onclick = () => b.aksi ? b.aksi(handle) : handle.tutup();
    handle.foot.appendChild(btn);
  });

  $$('[data-tutup]', wrap).forEach(el => el.onclick = () => {
    if (opsi.tutupLuar === false && el.classList.contains('modal-back')) return;
    handle.tutup();
  });

  tumpukan.push(handle);
  opsi.onBuka?.(handle.body, handle);

  // fokus pada input pertama (hanya layar lebar, agar keyboard mobile tidak langsung muncul)
  if (window.innerWidth >= 900) setTimeout(() => handle.body.querySelector('input,select,textarea')?.focus(), 60);
  return handle;
}

export function konfirmasi({ judul = 'Konfirmasi', pesan = '', ok = 'Ya, lanjut', batal = 'Batal', bahaya = false } = {}) {
  return new Promise(resolve => {
    let jawab = false;
    modal({
      judul,
      isi: `<p style="font-size:14px;color:var(--text-2);line-height:1.6">${pesan}</p>`,
      tombol: [
        { teks: batal, kelas: 'btn-ghost', aksi: h => h.tutup() },
        { teks: ok, kelas: bahaya ? 'btn-danger' : 'btn-primary', aksi: h => { jawab = true; h.tutup(); } },
      ],
      onTutup: () => resolve(jawab),
    });
  });
}

/* =========================================================
   FORM BUILDER
   ========================================================= */
/**
 * field: {name,label,tipe,opsi,wajib,hint,nilai,lebar:'full',min,max,step,placeholder,readonly}
 * tipe: text | number | rupiah | date | select | textarea | check | tel | hidden
 */
export function renderField(f, data = {}) {
  const v = data[f.name] ?? f.nilai ?? '';
  const id = `f_${f.name}`;
  const lbl = f.tipe === 'check' ? '' :
    `<label for="${id}" class="${f.wajib ? 'req' : ''}">${esc(f.label || '')}</label>`;
  const attr = [
    `id="${id}"`, `name="${f.name}"`,
    f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
    f.wajib ? 'required' : '',
    f.readonly ? 'readonly' : '',
    f.min != null ? `min="${f.min}"` : '',
    f.max != null ? `max="${f.max}"` : '',
    f.step != null ? `step="${f.step}"` : '',
  ].filter(Boolean).join(' ');

  let kontrol = '';
  switch (f.tipe) {
    case 'hidden':
      return `<input type="hidden" name="${f.name}" value="${esc(v)}">`;
    case 'select':
      kontrol = `<select class="select" ${attr}>${(f.opsi || []).map(o => {
        const val = o.value ?? o.id ?? o;
        const teks = o.label ?? o.nama ?? o;
        return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(teks)}</option>`;
      }).join('')}</select>`;
      break;
    case 'textarea':
      kontrol = `<textarea class="textarea" ${attr}>${esc(v)}</textarea>`;
      break;
    case 'check':
      kontrol = `<label class="check"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
      break;
    case 'rupiah':
      kontrol = `<input type="text" inputmode="numeric" class="input num" data-rupiah ${attr} value="${v === '' ? '' : num(v)}">`;
      break;
    case 'number':
      kontrol = `<input type="number" inputmode="decimal" class="input num" ${attr} value="${esc(v)}">`;
      break;
    case 'date':
      kontrol = `<input type="date" class="input" ${attr} value="${esc(String(v).slice(0, 10))}">`;
      break;
    case 'tel':
      kontrol = `<input type="tel" inputmode="tel" class="input" ${attr} value="${esc(v)}">`;
      break;
    case 'password':
      kontrol = `<input type="password" class="input" autocomplete="off" ${attr} value="${esc(v)}">`;
      break;
    default:
      kontrol = `<input type="text" class="input" ${attr} value="${esc(v)}">`;
  }
  return `<div class="field" data-field="${f.name}" ${f.lebar === 'full' ? 'style="grid-column:1/-1"' : ''}>
    ${lbl}${kontrol}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}
  </div>`;
}

export const renderForm = (fields, data = {}) =>
  `<div class="form-row">${fields.map(f => renderField(f, data)).join('')}</div>`;

/** baca nilai form sesuai definisi field */
export function bacaForm(root, fields) {
  const out = {};
  fields.forEach(f => {
    const el = root.querySelector(`[name="${f.name}"]`);
    if (!el) return;
    if (f.tipe === 'check') out[f.name] = el.checked;
    else if (f.tipe === 'rupiah') out[f.name] = toInt(el.value);
    else if (f.tipe === 'number') out[f.name] = toNum(el.value);
    else out[f.name] = el.value.trim();
  });
  return out;
}

export function validasiForm(root, fields, data) {
  let ok = true;
  $$('.err', root).forEach(e => e.remove());
  $$('.invalid', root).forEach(e => e.classList.remove('invalid'));
  fields.forEach(f => {
    if (!f.wajib) return;
    const nilai = data[f.name];
    const kosong = nilai === '' || nilai == null || (f.tipe === 'number' && !nilai && f.min > 0);
    if (kosong) {
      ok = false;
      const wrap = root.querySelector(`[data-field="${f.name}"]`);
      const el = root.querySelector(`[name="${f.name}"]`);
      el?.classList.add('invalid');
      wrap?.insertAdjacentHTML('beforeend', `<div class="err">${esc(f.label)} wajib diisi</div>`);
    }
  });
  if (!ok) root.querySelector('.invalid')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return ok;
}

/** modal form generik untuk data master */
export function formModal({ judul, fields, data = {}, simpanTeks = 'Simpan', onSimpan, lebar, extra = '' }) {
  return modal({
    judul, lebar,
    isi: renderForm(fields, data) + extra,
    tombol: [
      { teks: 'Batal', kelas: 'btn-ghost' },
      {
        teks: simpanTeks, kelas: 'btn-primary', aksi: h => {
          const nilai = bacaForm(h.body, fields);
          if (!validasiForm(h.body, fields, nilai)) return;
          if (onSimpan(nilai, h) !== false) h.tutup();
        },
      },
    ],
    onBuka: body => pasangRupiah(body),
  });
}

/**
 * Format otomatis input bertanda data-rupiah.
 * Nilai dibaca dari digitnya langsung (toInt), bukan dari teks yang sudah
 * berformat — kalau tidak, pemisah ribuan yang baru disisipkan akan terbaca
 * ulang sebagai titik desimal dan angkanya runtuh saat digit ke-5 diketik.
 * Posisi kursor dijaga berdasarkan jumlah digit di sebelah kirinya, sehingga
 * menyunting di tengah angka tetap terasa wajar.
 */
export function pasangRupiah(root = document) {
  $$('[data-rupiah]', root).forEach(el => {
    if (el.dataset.siap) return;
    el.dataset.siap = '1';

    el.addEventListener('input', () => {
      const sebelum = el.value;
      const caret = el.selectionStart ?? sebelum.length;
      const digitKiri = sebelum.slice(0, caret).replace(/[^\d]/g, '').length;

      const n = toInt(sebelum);
      el.value = sebelum.replace(/[^\d]/g, '') === '' ? '' : num(n);

      // kembalikan kursor ke posisi setelah digit ke-N yang sama
      let hitung = 0, posisi = el.value.length;
      for (let i = 0; i < el.value.length; i++) {
        if (/\d/.test(el.value[i])) hitung++;
        if (hitung === digitKiri) { posisi = i + 1; break; }
      }
      if (digitKiri === 0) posisi = 0;
      try { el.setSelectionRange(posisi, posisi); } catch { /* input tersembunyi */ }

      el.dispatchEvent(new CustomEvent('nilai', { detail: n, bubbles: true }));
    });

    // pilih seluruh isi saat difokuskan agar mudah diganti, kecuali masih kosong
    el.addEventListener('focus', () => { if (el.value) el.select(); });
  });
}

/* =========================================================
   PEMILIH ITEM (bottom sheet dengan pencarian)
   ========================================================= */
/**
 * pilihItem({judul, items, render(item)->html, cariPada(item)->string, kosong})
 * → Promise<item|null>
 */
export function pilihItem({ judul = 'Pilih', items = [], render, cariPada, kosong = 'Data tidak ditemukan.', aksiTambah = null }) {
  return new Promise(resolve => {
    let hasil = null;
    const h = modal({
      judul,
      isi: `
        <div class="toolbar" style="margin-bottom:10px">
          <div class="search-wrap grow"><input class="input" id="cariPilih" placeholder="Cari..." autocomplete="off"></div>
        </div>
        <div class="card"><div class="list" id="daftarPilih"></div></div>
        ${aksiTambah ? `<button class="btn btn-soft btn-block mt12" id="tambahBaru">＋ ${esc(aksiTambah.teks)}</button>` : ''}`,
      onTutup: () => resolve(hasil),
    });

    const daftar = h.body.querySelector('#daftarPilih');
    const gambar = (q = '') => {
      const cocokList = items.filter(it => cocok(cariPada ? cariPada(it) : JSON.stringify(it), q));
      daftar.innerHTML = cocokList.length
        ? cocokList.map((it, i) => `<button class="row-item" data-i="${items.indexOf(it)}">${render(it)}</button>`).join('')
        : `<div class="empty"><div class="em-ico">🔍</div><p>${esc(kosong)}</p></div>`;
    };
    gambar();

    h.body.querySelector('#cariPilih').addEventListener('input', debounce(e => gambar(e.target.value), 150));
    daftar.addEventListener('click', e => {
      const btn = e.target.closest('[data-i]');
      if (!btn) return;
      hasil = items[+btn.dataset.i];
      h.tutup();
    });
    h.body.querySelector('#tambahBaru')?.addEventListener('click', () => {
      h.tutup();
      aksiTambah.aksi();
    });
  });
}

/* =========================================================
   POTONGAN HTML SIAP PAKAI
   ========================================================= */
export const kosongState = (ikon, judul, pesan = '', tombol = '') => `
  <div class="empty">
    <div class="em-ico">${ikon}</div>
    <h3>${esc(judul)}</h3>
    ${pesan ? `<p>${esc(pesan)}</p>` : ''}
    ${tombol}
  </div>`;

export const statTile = ({ label, nilai, sub = '', warna = '', ikon = '' }) => `
  <div class="stat ${warna ? warna + ' accent' : ''}">
    <div class="lbl">${ikon ? ikon + ' ' : ''}${esc(label)}</div>
    <div class="val">${nilai}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ''}
  </div>`;

export const avatarEl = (nama, warna = '') => `<div class="avatar ${warna}">${esc(initial(nama))}</div>`;

export const badge = (teks, kelas = '') => `<span class="badge ${kelas}">${esc(teks)}</span>`;

/** stepper qty: <div data-step="idx"> */
export const stepper = (nilai, idx, min = 0) => `
  <div class="stepper" data-step="${idx}">
    <button type="button" data-d="-1" aria-label="Kurangi">−</button>
    <input type="number" inputmode="decimal" value="${nilai}" min="${min}" data-qty>
    <button type="button" data-d="1" aria-label="Tambah">+</button>
  </div>`;

/** ubah nilai stepper lewat delegasi; onUbah(idx, nilaiBaru) */
export function pasangStepper(root, onUbah) {
  root.addEventListener('click', e => {
    const b = e.target.closest('.stepper button');
    if (!b) return;
    const box = b.closest('.stepper');
    const inp = box.querySelector('[data-qty]');
    const baru = Math.max(toNum(inp.min), toNum(inp.value) + toNum(b.dataset.d));
    inp.value = baru;
    onUbah(box.dataset.step, baru);
  });
  root.addEventListener('change', e => {
    const inp = e.target.closest('.stepper [data-qty]');
    if (!inp) return;
    onUbah(inp.closest('.stepper').dataset.step, Math.max(toNum(inp.min), toNum(inp.value)));
  });
}

/** bilah tab sederhana */
export const segmented = (opsi, aktif, nama = 'seg') => `
  <div class="seg" data-seg="${nama}">
    ${opsi.map(o => `<button type="button" data-v="${esc(o.value)}" class="${o.value === aktif ? 'active' : ''}">${o.label}</button>`).join('')}
  </div>`;

/* =========================================================
   SHELL: judul halaman, aksi topbar, tombol mengambang
   ========================================================= */
export function setJudul(judul, sub = '') {
  document.getElementById('pageTitle').textContent = judul;
  const s = document.getElementById('pageSub');
  s.innerHTML = sub;
  s.hidden = !sub;
  document.title = `${judul} — POS Rokok`;
}

/** aksi:[{teks,ikon,kelas,onClick}] ditampilkan di kanan atas */
export function setTopbar(aksi = []) {
  const wrap = document.getElementById('topbarActions');
  wrap.innerHTML = '';
  aksi.forEach(a => {
    const b = document.createElement('button');
    if (a.hanyaIkon) {
      b.className = `icon-btn ${a.kelas || ''}`;
      b.innerHTML = a.ikon;
      b.setAttribute('aria-label', a.teks || '');
    } else {
      b.className = `btn btn-sm ${a.kelas || 'btn-primary'}`;
      b.innerHTML = `${a.ikon ? a.ikon + ' ' : ''}<span class="btn-teks">${esc(a.teks)}</span>`;
    }
    b.onclick = a.onClick;
    wrap.appendChild(b);
  });
}

/** tombol mengambang (mobile) — panggil setFab(null) untuk menyembunyikan */
export function setFab(opsi) {
  document.getElementById('fabBtn')?.remove();
  if (!opsi) return;
  const b = document.createElement('button');
  b.id = 'fabBtn';
  b.className = 'fab';
  b.innerHTML = opsi.ikon || '＋';
  b.setAttribute('aria-label', opsi.teks || 'Tambah');
  b.onclick = opsi.onClick;
  document.body.appendChild(b);
}
