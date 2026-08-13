// evaluasi.js — nama file dipertahankan, tapi tampilan ini sekarang adalah
// "Final Evaluation" (Tahap 3, terakhir). Hanya proyek dengan WIP Assessment
// terakhir berstatus Approved yang bisa diajukan; Approved di sini menutup
// proyek (status_proyek -> Selesai).
import { api, fileToBase64 } from '../api.js';
import { esc, statusBadge, fmtDate, toast, openModal, closeModal } from '../ui.js';

export async function renderEvaluasi(root, user) {
  root.innerHTML = `<div class="empty-state">Memuat Final Evaluation…</div>`;
  await load(root, user);
}

async function load(root, user) {
  const [{ data: rows }, { data: proyekList }, md] = await Promise.all([
    api.get('/api/evaluasi'),
    api.get('/api/proyek'),
    api.get('/api/admin/masterdata'),
  ]);
  const canCreate = ['Admin HSE', 'PIC', 'Admin Sistem'].includes(user.peran);
  const finalByProyek = Object.fromEntries(rows.map((r) => [r.id_proyek, r]));
  const eligible = proyekList.filter((p) => {
    const existing = finalByProyek[p.id_proyek];
    return p.wip_terakhir_status === 'Approved' && (!existing || existing.status !== 'Approved');
  });

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Final Evaluation</h1>
        <p>Tahap 3 — evaluasi penutup proyek. Butuh WIP Assessment terakhir berstatus Approved. Approved di sini menandai proyek Selesai.</p>
      </div>
      ${canCreate ? '<button class="btn-primary" id="btn-new-final">+ Ajukan Final Evaluation</button>' : ''}
    </div>
    <div class="panel" style="padding:0;">
      ${rows.length === 0 ? '<div class="empty-state">Belum ada Final Evaluation.</div>' : `
      <table>
        <tr><th>Proyek</th><th>Compliance</th><th>Status</th><th>Diajukan</th><th></th></tr>
        ${rows.map((r) => `
          <tr>
            <td class="company-name">${esc(r.nama_proyek || r.id_proyek)}</td>
            <td class="mono">${r.compliance_percent}%</td>
            <td>${statusBadge(r.status)}</td>
            <td class="mono">${fmtDate(r.tanggal_submit)}</td>
            <td><button class="action-link" data-detail="${esc(r.id_final)}">Detail</button></td>
          </tr>`).join('')}
      </table>`}
    </div>
  `;

  root.querySelectorAll('[data-detail]').forEach((btn) => {
    const row = rows.find((r) => r.id_final === btn.dataset.detail);
    btn.onclick = () => openDetail(row);
  });
  if (canCreate) {
    root.querySelector('#btn-new-final').onclick = () => openNewFinal(eligible, md.checklist_final, user, () => load(root, user));
  }
}

function openDetail(r) {
  const box = openModal(`
    <div class="modal-head"><h2>Final Evaluation — ${esc(r.nama_proyek || r.id_proyek)}</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <div class="form-grid" style="margin-bottom:14px; font-size:13px;">
      <div><div class="small-dim">Diajukan</div><div class="mono">${fmtDate(r.tanggal_submit)}</div></div>
      <div><div class="small-dim">Compliance</div><div class="mono">${r.compliance_percent}%</div></div>
      <div><div class="small-dim">Status</div><div>${statusBadge(r.status)}</div></div>
      ${r.catatan_review ? `<div class="full"><div class="small-dim">Catatan reviewer</div><div>${esc(r.catatan_review)}</div></div>` : ''}
    </div>
    <div class="section-title">Checklist</div>
    ${(r.checklist || []).map((c) => `<div class="doc-row"><div>${esc(c.item)}</div><div>${c.terpenuhi ? '✅ Terpenuhi' : '❌ Belum'}</div></div>`).join('')}
    ${(r.lampiran || []).length > 0 ? `
    <div class="section-title">Lampiran</div>
    ${r.lampiran.map((d) => `<div class="doc-row"><div>${esc(d.nama_file)}</div><a href="${esc(d.file_path)}" target="_blank" class="action-link">Lihat</a></div>`).join('')}` : ''}
  `, { wide: true });
  box.querySelector('[data-close-modal]').onclick = closeModal;
}

function openNewFinal(proyekList, checklistItems, user, onDone) {
  const scoped = user.peran === 'PIC' ? proyekList.filter((p) => p.id_proyek === user.id_proyek) : proyekList;
  if (scoped.length === 0) return toast('Tidak ada proyek yang siap diajukan Final Evaluation saat ini (WIP terakhir harus Approved).', 'error');
  const box = openModal(`
    <div class="modal-head"><h2>Ajukan Final Evaluation</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="final-form">
      <div class="field" style="margin-bottom:14px;">
        <label>Proyek</label>
        <select name="id_proyek" required>
          <option value="">Pilih proyek…</option>
          ${scoped.map((p) => `<option value="${esc(p.id_proyek)}">${esc(p.nama_proyek)}</option>`).join('')}
        </select>
      </div>
      <div class="section-title">Checklist evaluasi akhir</div>
      ${checklistItems.map((item, i) => `
        <div class="doc-row">
          <div>${esc(item)}</div>
          <label style="display:flex; align-items:center; gap:6px;"><input type="checkbox" data-checklist="${i}" checked> Terpenuhi</label>
        </div>
      `).join('')}
      <div class="field" style="margin-top:14px;"><label>Lampiran dokumen pendukung (opsional)</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png"></div>
      <div class="field" style="margin-top:10px;"><label>Catatan pengaju</label><textarea name="catatan_pengaju" placeholder="Opsional"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Ajukan Final Evaluation</button>
      </div>
    </form>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);

  box.querySelector('#final-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id_proyek = fd.get('id_proyek');
    if (!id_proyek) return toast('Pilih proyek terlebih dahulu.', 'error');
    const checklist = checklistItems.map((item, i) => ({
      item, terpenuhi: box.querySelector(`[data-checklist="${i}"]`).checked,
    }));
    const payload = { id_proyek, checklist, catatan_pengaju: fd.get('catatan_pengaju'), lampiran: [] };
    const file = fd.get('file');
    if (file && file.size > 0) {
      payload.lampiran = [{ nama_file: file.name, file_base64: await fileToBase64(file) }];
    }
    try {
      await api.post('/api/evaluasi', payload);
      toast('Final Evaluation diajukan, menunggu review.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}
