import { api, qs, fileToBase64 } from '../api.js';
import { esc, riskBadge, statusBadge, fmtDate, toast, openModal, closeModal, confirmAction } from '../ui.js';

export async function renderFacility(root, user) {
  root.innerHTML = `<div class="empty-state">Memuat temuan kepatuhan fasilitas/workshop…</div>`;
  await load(root, user, '');
}

async function load(root, user, statusFilter) {
  const { data: rows, master_fasilitas, tingkat_risiko_options } = await api.get('/api/facility' + qs({ status: statusFilter }));
  const canCreate = ['Admin HSE', 'Admin Sistem'].includes(user.peran);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Base Facility / Workshop Compliance</h1>
        <p>Temuan kepatuhan internal fasilitas &amp; workshop (bukan milik kontraktor) — status "Overdue" otomatis bila tenggat terlewati</p>
      </div>
      ${canCreate ? '<button class="btn-primary" id="btn-new-finding">+ Laporkan temuan</button>' : ''}
    </div>
    <div class="tabs no-print">
      ${['', 'Open', 'In Progress', 'Closed', 'Overdue'].map((s) => `<button class="tab-btn ${statusFilter === s ? 'active' : ''}" data-tab="${s}">${s || 'Semua'}</button>`).join('')}
    </div>
    <div class="panel" style="padding:0;">
      ${rows.length === 0 ? '<div class="empty-state">Tidak ada temuan pada status ini.</div>' : `
      <table>
        <tr><th>Fasilitas/Workshop</th><th>Temuan</th><th>Risiko</th><th>PJ</th><th>Tenggat</th><th>Status</th><th></th></tr>
        ${rows.map((f) => `
          <tr>
            <td class="company-name">${esc(f.lokasi_fasilitas)}</td>
            <td>${esc(f.judul_temuan)}<div class="small-dim">${esc(f.deskripsi_temuan)}</div></td>
            <td>${riskBadge(f.tingkat_risiko)}</td>
            <td>${esc(f.penanggung_jawab)}</td>
            <td class="mono">${fmtDate(f.tenggat_waktu)}</td>
            <td>${statusBadge(f.status)}</td>
            <td><button class="action-link" data-detail="${esc(f.id_finding)}">Kelola</button></td>
          </tr>`).join('')}
      </table>`}
    </div>
  `;

  root.querySelectorAll('[data-tab]').forEach((btn) => btn.onclick = () => load(root, user, btn.dataset.tab));
  root.querySelectorAll('[data-detail]').forEach((btn) => {
    const row = rows.find((r) => r.id_finding === btn.dataset.detail);
    btn.onclick = () => openManage(row, user, () => load(root, user, statusFilter));
  });
  if (canCreate) root.querySelector('#btn-new-finding').onclick = () => openNewFinding(master_fasilitas, tingkat_risiko_options, () => load(root, user, statusFilter));
}

function openNewFinding(masterFasilitas, riskOptions, onDone) {
  const box = openModal(`
    <div class="modal-head"><h2>Laporkan temuan fasilitas/workshop</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="finding-form">
      <div class="form-grid">
        <div class="field"><label>Fasilitas/Workshop</label>
          ${masterFasilitas.length ? `
          <select name="lokasi_fasilitas" required>
            <option value="">Pilih lokasi…</option>
            ${masterFasilitas.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}
          </select>` : `<input name="lokasi_fasilitas" required placeholder="Nama fasilitas/workshop">`}
        </div>
        <div class="field"><label>Tingkat risiko</label>
          <select name="tingkat_risiko" required>${riskOptions.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>
        </div>
        <div class="field full"><label>Judul temuan</label><input name="judul_temuan" required></div>
        <div class="field full"><label>Deskripsi temuan</label><textarea name="deskripsi_temuan" required></textarea></div>
        <div class="field"><label>Penanggung jawab</label><input name="penanggung_jawab" required></div>
        <div class="field"><label>Tenggat waktu</label><input type="date" name="tenggat_waktu" required></div>
        <div class="field"><label>Foto sebelum perbaikan (opsional)</label><input type="file" name="file" accept=".jpg,.jpeg,.png,.pdf"></div>
        <div class="field"><label>Foto sesudah perbaikan (opsional, kalau sudah selesai diperbaiki)</label><input type="file" name="file_sesudah" accept=".jpg,.jpeg,.png,.pdf"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Simpan Temuan</button>
      </div>
    </form>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);
  box.querySelector('#finding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    delete payload.file;
    delete payload.file_sesudah;
    const file = fd.get('file');
    if (file && file.size > 0) {
      payload.file_name = file.name;
      payload.file_base64 = await fileToBase64(file);
    }
    const fileSesudah = fd.get('file_sesudah');
    if (fileSesudah && fileSesudah.size > 0) {
      payload.file_name_sesudah = fileSesudah.name;
      payload.file_base64_sesudah = await fileToBase64(fileSesudah);
    }
    try {
      await api.post('/api/facility', payload);
      toast('Temuan tersimpan.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openManage(f, user, onDone) {
  const canEdit = ['Admin HSE', 'Admin Sistem'].includes(user.peran);
  const box = openModal(`
    <div class="modal-head"><h2>${esc(f.judul_temuan)} — ${esc(f.lokasi_fasilitas)}</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <div style="font-size:13px; margin-bottom:14px;">
      <div class="small-dim">Deskripsi temuan</div><div style="margin-bottom:10px;">${esc(f.deskripsi_temuan)}</div>
      <div class="form-grid">
        <div><div class="small-dim">Tingkat risiko</div><div>${riskBadge(f.tingkat_risiko)}</div></div>
        <div><div class="small-dim">Penanggung jawab</div><div>${esc(f.penanggung_jawab)}</div></div>
        <div><div class="small-dim">Tanggal lapor</div><div class="mono">${fmtDate(f.tanggal_lapor)}</div></div>
        <div><div class="small-dim">Tenggat waktu</div><div class="mono">${fmtDate(f.tenggat_waktu)}</div></div>
        <div><div class="small-dim">Status saat ini</div><div>${statusBadge(f.status)}</div></div>
        <div><div class="small-dim">Foto sebelum perbaikan</div><div>${f.foto_sebelum ? `<a href="${esc(f.foto_sebelum)}" target="_blank" class="action-link">Lihat berkas</a>` : '—'}</div></div>
        <div><div class="small-dim">Foto sesudah perbaikan</div><div>${f.foto_sesudah ? `<a href="${esc(f.foto_sesudah)}" target="_blank" class="action-link">Lihat berkas</a>` : '—'}</div></div>
        ${f.catatan_penutupan ? `<div class="full"><div class="small-dim">Catatan penutupan</div><div>${esc(f.catatan_penutupan)}</div></div>` : ''}
      </div>
      ${(f.foto_sebelum || f.foto_sesudah) ? `
      <div class="form-grid" style="margin-top:12px;">
        ${f.foto_sebelum ? `<div><div class="small-dim" style="margin-bottom:4px;">Sebelum</div><img src="${esc(f.foto_sebelum)}" style="width:100%; border-radius:8px; border:1px solid var(--border);"></div>` : '<div></div>'}
        ${f.foto_sesudah ? `<div><div class="small-dim" style="margin-bottom:4px;">Sesudah</div><img src="${esc(f.foto_sesudah)}" style="width:100%; border-radius:8px; border:1px solid var(--border);"></div>` : '<div></div>'}
      </div>` : ''}
    </div>
    ${canEdit && f.status !== 'Closed' ? `
    <form id="finding-update-form">
      <div class="section-title">Perbarui status</div>
      <div class="form-grid">
        <div class="field"><label>Status baru</label>
          <select name="status">
            <option value="Open" ${f.status === 'Open' ? 'selected' : ''}>Open</option>
            <option value="In Progress" ${f.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Overdue" ${f.status === 'Overdue' ? 'selected' : ''} disabled>Overdue (otomatis)</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div class="field"><label>Catatan penutupan (wajib jika Closed)</label><input name="catatan_penutupan"></div>
        <div class="field full"><label>Foto sesudah perbaikan (wajib jika Closed)</label><input type="file" name="file_sesudah" accept=".jpg,.jpeg,.png,.pdf"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Tutup</button>
        <button type="submit" class="btn-primary">Simpan</button>
      </div>
    </form>` : ''}
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);
  const form = box.querySelector('#finding-update-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const status = fd.get('status');
      if (status === 'Closed' && !fd.get('catatan_penutupan')) return toast('Catatan penutupan wajib diisi.', 'error');
      const payload = { status, catatan_penutupan: fd.get('catatan_penutupan') };
      const file = fd.get('file_sesudah');
      if (file && file.size > 0) {
        payload.file_name_sesudah = file.name;
        payload.file_base64_sesudah = await fileToBase64(file);
      } else if (status === 'Closed' && !f.foto_sesudah) {
        return toast('Foto sesudah perbaikan wajib diunggah saat menutup temuan.', 'error');
      }
      try {
        await api.put(`/api/facility/${f.id_finding}`, payload);
        toast('Status temuan diperbarui.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast(err.message, 'error'); }
    });
  }
}
