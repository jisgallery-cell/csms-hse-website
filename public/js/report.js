// report.js — halaman publik "Sistem Barcode Daily Safety Finding", tanpa
// login. Setiap proyek punya URL/QR sendiri: /report/:id_proyek. Pekerja
// cukup memasukkan Employee ID lalu memilih "Lapor Temuan" atau "Tidak Ada
// Temuan Hari Ini" — otomatis tertaut ke proyek/site yang benar dari URL.
import { esc, toast } from './ui.js';

const root = document.getElementById('public-root');
const idProyek = location.pathname.replace(/\/$/, '').split('/').pop();

let state = { proyek: null, employeeId: '', employeeNama: '', lookedUp: false };

async function apiGet(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
  return data;
}
async function apiPost(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
  return data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function boot() {
  if (!idProyek || idProyek === 'report') {
    return renderProyekPicker();
  }
  try {
    const { data } = await apiGet(`/api/public/proyek/${encodeURIComponent(idProyek)}`);
    state.proyek = data;
    renderLanding();
  } catch (err) {
    renderError(err.message);
  }
}

// Diakses lewat tombol "Lapor Temuan Safety" di halaman login (tanpa kode
// proyek di URL, beda dari QR yang sudah spesifik per proyek) — pekerja
// pilih proyeknya sendiri dulu.
async function renderProyekPicker() {
  root.innerHTML = `<div class="empty-state">Memuat daftar proyek…</div>`;
  try {
    const { data: rows } = await apiGet('/api/public/proyek-list');
    if (rows.length === 0) return renderError('Belum ada proyek aktif saat ini.');
    root.innerHTML = `
      <div class="public-proyek-name">Pilih Proyek Anda</div>
      <div class="public-proyek-sub">Pilih proyek tempat Anda bekerja hari ini</div>
      <div class="field" style="margin-top:10px;">
        <select id="proyek-picker">
          <option value="">Pilih proyek…</option>
          ${rows.map((p) => `<option value="${esc(p.id_proyek)}">${esc(p.nama_proyek)}${p.area ? ' — ' + esc(p.area) : ''}</option>`).join('')}
        </select>
      </div>
      <button class="public-btn finding" id="btn-pilih-proyek" style="margin-top:16px;">Lanjutkan</button>
    `;
    root.querySelector('#btn-pilih-proyek').onclick = () => {
      const sel = root.querySelector('#proyek-picker');
      if (!sel.value) return toast('Pilih proyek terlebih dahulu.', 'error');
      const chosen = rows.find((p) => p.id_proyek === sel.value);
      state.proyek = chosen;
      history.replaceState(null, '', `/report/${chosen.id_proyek}`);
      renderLanding();
    };
  } catch (err) {
    renderError(err.message);
  }
}

function renderError(msg) {
  root.innerHTML = `
    <div class="public-confirm">
      <div class="icon">⚠️</div>
      <h2>Tidak dapat memuat halaman</h2>
      <p>${esc(msg)}</p>
    </div>
  `;
}

function renderLanding() {
  root.innerHTML = `
    <div class="public-proyek-name">${esc(state.proyek.nama_proyek)}</div>
    <div class="public-proyek-sub">${esc(state.proyek.area || '')}</div>
    <div class="field" style="margin-bottom:6px;">
      <label>Employee ID</label>
      <input id="employee-id" placeholder="Masukkan Employee ID Anda" value="${esc(state.employeeId)}" autocomplete="off">
    </div>
    <div id="employee-hello"></div>
    <div style="margin-top:20px;">
      <button class="public-btn finding" id="btn-finding" disabled>⚠ Lapor Temuan</button>
      <button class="public-btn clear" id="btn-clear" disabled>✓ Tidak Ada Temuan Hari Ini</button>
    </div>
    <div class="field-hint" style="text-align:center; margin-top:8px;">Tidak perlu login — laporan Anda otomatis tertaut ke proyek ini.</div>
  `;

  const input = root.querySelector('#employee-id');
  const helloBox = root.querySelector('#employee-hello');
  const btnFinding = root.querySelector('#btn-finding');
  const btnClear = root.querySelector('#btn-clear');

  const updateButtons = () => {
    const has = input.value.trim().length > 0;
    btnFinding.disabled = !has;
    btnClear.disabled = !has;
  };
  updateButtons();

  let lookupTimer;
  input.addEventListener('input', () => {
    state.employeeId = input.value.trim();
    state.employeeNama = '';
    helloBox.innerHTML = '';
    updateButtons();
    clearTimeout(lookupTimer);
    if (!state.employeeId) return;
    lookupTimer = setTimeout(async () => {
      try {
        const res = await apiGet(`/api/public/pekerja-lookup?id_proyek=${encodeURIComponent(idProyek)}&employee_id=${encodeURIComponent(state.employeeId)}`);
        if (res.found) {
          state.employeeNama = res.nama;
          helloBox.innerHTML = `<div class="public-hello">Halo, ${esc(res.nama)} 👋</div>`;
        } else {
          helloBox.innerHTML = `<div class="field-hint">Employee ID tidak ditemukan di roster — Anda tetap bisa lanjut melapor.</div>`;
        }
      } catch (e) { /* diamkan, lookup bersifat opsional */ }
    }, 450);
  });

  btnClear.onclick = async () => {
    if (!confirm('Kirim konfirmasi "Tidak Ada Temuan Hari Ini"?')) return;
    try {
      const res = await apiPost('/api/public/checkin', {
        id_proyek: idProyek, employee_id: state.employeeId, employee_nama: state.employeeNama, tipe: 'Aman',
      });
      renderConfirm('Konfirmasi diterima. Terima kasih sudah melakukan pengecekan hari ini.', res.reference);
    } catch (err) { toast(err.message, 'error'); }
  };

  btnFinding.onclick = () => renderFindingForm();
}

async function renderFindingForm() {
  let kategoriOptions = [];
  try {
    const res = await apiGet('/api/public/kategori-temuan');
    kategoriOptions = res.data || [];
  } catch (e) { kategoriOptions = ['APD', 'Prosedur Kerja', 'Alat & Peralatan', 'Lingkungan Kerja', 'Lainnya']; }

  root.innerHTML = `
    <div class="public-proyek-name">Lapor Temuan</div>
    <div class="public-proyek-sub">${esc(state.proyek.nama_proyek)}${state.employeeNama ? ' · ' + esc(state.employeeNama) : ''}</div>
    <form id="finding-form">
      <div class="field" style="margin-bottom:12px;">
        <label>Kategori temuan</label>
        <select name="kategori_temuan" required>
          <option value="">Pilih kategori…</option>
          ${kategoriOptions.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="margin-bottom:12px;">
        <label>Lokasi spesifik (opsional)</label>
        <input name="lokasi" placeholder="mis. Area Piping Unit 3">
      </div>
      <div class="field" style="margin-bottom:12px;">
        <label>Deskripsi temuan</label>
        <textarea name="deskripsi_temuan" required placeholder="Jelaskan temuan Anda secara singkat"></textarea>
      </div>
      <div class="field" style="margin-bottom:16px;">
        <label>Foto (opsional)</label>
        <input type="file" name="foto" accept="image/*" capture="environment">
      </div>
      <button type="submit" class="public-btn finding">Kirim Laporan</button>
      <button type="button" class="btn-ghost" id="btn-back" style="width:100%; margin-top:8px; text-align:center;">Kembali</button>
    </form>
  `;
  root.querySelector('#btn-back').onclick = () => renderLanding();
  root.querySelector('#finding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      id_proyek: idProyek, employee_id: state.employeeId, employee_nama: state.employeeNama, tipe: 'Temuan',
      kategori_temuan: fd.get('kategori_temuan'), lokasi: fd.get('lokasi'), deskripsi_temuan: fd.get('deskripsi_temuan'),
    };
    const file = fd.get('foto');
    if (file && file.size > 0) {
      payload.file_name = file.name;
      payload.file_base64 = await fileToBase64(file);
    }
    try {
      const res = await apiPost('/api/public/checkin', payload);
      renderConfirm('Laporan temuan Anda telah diterima dan akan ditindaklanjuti oleh tim HSE.', res.reference);
    } catch (err) { toast(err.message, 'error'); }
  });
}

function renderConfirm(msg, ref) {
  root.innerHTML = `
    <div class="public-confirm">
      <div class="icon">✅</div>
      <h2>Terima kasih</h2>
      <p>${esc(msg)}</p>
      <div class="public-refno">Ref: ${esc(ref)}</div>
      <div style="margin-top:24px;">
        <button class="btn-ghost" id="btn-again">Lapor lagi</button>
      </div>
    </div>
  `;
  root.querySelector('#btn-again').onclick = () => { state.employeeId = ''; state.employeeNama = ''; renderLanding(); };
}

boot();
