// mcu.js — Roster Medical Checkup (MCU) pekerja per proyek. Kolom Email &
// No. WA disiapkan untuk pengiriman reminder eksternal di fase berikutnya —
// untuk saat ini badge warna 90/60/30 hari (Hijau/Kuning/Merah) + Kedaluwarsa
// dihitung otomatis dari tanggal_berlaku_sampai.
import { api, qs, fileToBase64 } from '../api.js';
import { esc, statusBadge, fmtDate, toast, openModal, closeModal } from '../ui.js';

function tierBadge(tier) {
  if (!tier) return '<span class="badge green">Aktif</span>';
  const map = {
    Hijau: ['badge-mcu-hijau', 'H-90'],
    Kuning: ['badge-mcu-kuning', 'H-60'],
    Merah: ['badge-mcu-merah', 'H-30'],
    Kedaluwarsa: ['badge-mcu-kedaluwarsa', 'Kedaluwarsa'],
  };
  const [cls, label] = map[tier] || ['badge gray', tier];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

export async function renderMCU(root, user) {
  root.innerHTML = `<div class="empty-state">Memuat roster medical checkup (MCU)…</div>`;
  await load(root, user, '');
}

async function load(root, user, q) {
  const [{ data: rows, hasil_options }, pResp] = await Promise.all([
    api.get('/api/mcu' + qs({ q })),
    ['Admin HSE', 'Admin Sistem', 'Reviewer', 'Manajemen'].includes(user.peran) ? api.get('/api/proyek') : Promise.resolve({ data: [] }),
  ]);
  const canCreate = ['Admin HSE', 'PIC', 'Admin Sistem'].includes(user.peran);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Medical Checkup (MCU)</h1>
        <p>Roster pekerja per proyek — reminder otomatis 90/60/30 hari sebelum masa berlaku MCU habis</p>
      </div>
      ${canCreate ? '<button class="btn-primary" id="btn-new-mcu">+ Tambah Pekerja MCU</button>' : ''}
    </div>
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-box" id="f-search" placeholder="Cari nama pekerja..." value="${esc(q || '')}">
      </div>
    </div>
    <div class="panel" style="padding:0;">
      ${rows.length === 0 ? '<div class="empty-state">Belum ada pekerja pada roster MCU.</div>' : `
      <table>
        <tr><th>Proyek</th><th>Nama pekerja</th><th>Kontak</th><th>Tanggal MCU</th><th>Hasil</th><th>Berlaku sampai</th><th>Reminder</th><th></th></tr>
        ${rows.map((m) => `
          <tr>
            <td class="company-name">${esc(m.nama_proyek || m.id_proyek)}</td>
            <td>${esc(m.nama)}${m.no_identitas ? `<div class="company-sub mono">${esc(m.no_identitas)}</div>` : ''}</td>
            <td class="small-dim">${m.email ? esc(m.email) : '<span class="small-dim">email belum diisi</span>'}${m.no_wa ? `<div class="small-dim">${esc(m.no_wa)}</div>` : '<div class="small-dim">WA belum diisi</div>'}</td>
            <td class="mono">${fmtDate(m.tanggal_mcu)}</td>
            <td>${statusBadge(m.hasil)}</td>
            <td class="mono">${fmtDate(m.tanggal_berlaku_sampai)}</td>
            <td>${tierBadge(m.tier_reminder)}</td>
            <td>${canCreate ? `<button class="action-link" data-edit="${esc(m.id_pekerja_mcu)}">Edit</button>` : ''}</td>
          </tr>`).join('')}
      </table>`}
    </div>
  `;

  root.querySelector('#f-search').addEventListener('input', debounce((e) => load(root, user, e.target.value), 350));
  if (canCreate) {
    root.querySelector('#btn-new-mcu').onclick = () => openNewMCU(pResp.data, hasil_options, user, () => load(root, user, q));
    root.querySelectorAll('[data-edit]').forEach((btn) => {
      const row = rows.find((r) => r.id_pekerja_mcu === btn.dataset.edit);
      btn.onclick = () => openEditMCU(row, hasil_options, () => load(root, user, q));
    });
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function openNewMCU(proyekList, hasilOptions, user, onDone) {
  const isPic = user.peran === 'PIC';
  const box = openModal(`
    <div class="modal-head"><h2>Tambah Pekerja MCU</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="mcu-form">
      <div class="form-grid">
        ${isPic ? '' : `
        <div class="field full"><label>Proyek</label>
          <select name="id_proyek" required>
            <option value="">Pilih proyek…</option>
            ${proyekList.map((p) => `<option value="${esc(p.id_proyek)}">${esc(p.nama_proyek)}</option>`).join('')}
          </select>
        </div>`}
        <div class="field"><label>Nama pekerja</label><input name="nama" required></div>
        <div class="field"><label>No. identitas (opsional)</label><input name="no_identitas"></div>
        <div class="field"><label>Email (opsional, untuk reminder nanti)</label><input type="email" name="email" placeholder="Bisa diisi menyusul"></div>
        <div class="field"><label>No. WhatsApp (opsional, untuk reminder nanti)</label><input name="no_wa" placeholder="mis. 0812xxxxxxx"></div>
        <div class="field"><label>Tanggal MCU</label><input type="date" name="tanggal_mcu" required></div>
        <div class="field"><label>Hasil</label>
          <select name="hasil" required>${hasilOptions.map((h) => `<option value="${esc(h)}">${esc(h)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Berlaku sampai</label><input type="date" name="tanggal_berlaku_sampai" required></div>
        <div class="field full"><label>Berkas hasil MCU (opsional, PDF/JPG maks 5MB)</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png"></div>
        <div class="field full"><label>Catatan</label><textarea name="catatan" placeholder="Opsional"></textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Simpan</button>
      </div>
    </form>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);
  box.querySelector('#mcu-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      id_proyek: isPic ? user.id_proyek : fd.get('id_proyek'),
      nama: fd.get('nama'),
      no_identitas: fd.get('no_identitas'),
      email: fd.get('email'),
      no_wa: fd.get('no_wa'),
      tanggal_mcu: fd.get('tanggal_mcu'),
      hasil: fd.get('hasil'),
      tanggal_berlaku_sampai: fd.get('tanggal_berlaku_sampai'),
      catatan: fd.get('catatan'),
    };
    const file = fd.get('file');
    if (file && file.size > 0) {
      payload.file_name = file.name;
      payload.file_base64 = await fileToBase64(file);
    }
    try {
      await api.post('/api/mcu', payload);
      toast('Pekerja ditambahkan ke roster MCU.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openEditMCU(m, hasilOptions, onDone) {
  const box = openModal(`
    <div class="modal-head"><h2>Edit Data MCU — ${esc(m.nama)}</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="mcu-edit-form">
      <div class="form-grid">
        <div class="field"><label>Email</label><input type="email" name="email" value="${esc(m.email || '')}" placeholder="Bisa diisi menyusul"></div>
        <div class="field"><label>No. WhatsApp</label><input name="no_wa" value="${esc(m.no_wa || '')}" placeholder="mis. 0812xxxxxxx"></div>
        <div class="field"><label>Hasil</label>
          <select name="hasil">${hasilOptions.map((h) => `<option value="${esc(h)}" ${m.hasil === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Berlaku sampai</label><input type="date" name="tanggal_berlaku_sampai" value="${esc(m.tanggal_berlaku_sampai)}"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Simpan Perubahan</button>
      </div>
    </form>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);
  box.querySelector('#mcu-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.put(`/api/mcu/${m.id_pekerja_mcu}`, Object.fromEntries(fd.entries()));
      toast('Data MCU diperbarui.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}
