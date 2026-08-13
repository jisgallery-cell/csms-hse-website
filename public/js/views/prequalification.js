// prequalification.js — nama file dipertahankan, tapi tampilan ini sekarang
// adalah "Pre Job Assessment" (Tahap 1).
import { api, fileToBase64 } from '../api.js';
import { esc, riskBadge, statusBadge, fmtDate, toast, openModal, closeModal } from '../ui.js';

export async function renderPQ(root, user) {
  root.innerHTML = `<div class="empty-state">Memuat Pre Job Assessment…</div>`;
  await load(root, user);
}

async function load(root, user) {
  const [{ data: rows }, { data: proyekList }, md] = await Promise.all([
    api.get('/api/pja'),
    api.get('/api/proyek'),
    api.get('/api/admin/masterdata'),
  ]);
  const canCreate = ['Admin HSE', 'PIC', 'Admin Sistem'].includes(user.peran);
  // proyek yang belum punya PJA Approved bisa ajukan/ajukan ulang
  const pjaByProyek = Object.fromEntries(rows.map((r) => [r.id_proyek, r]));
  const eligible = proyekList.filter((p) => {
    const existing = pjaByProyek[p.id_proyek];
    return !existing || existing.status !== 'Approved';
  });

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Pre Job Assessment (PJA)</h1>
        <p>Tahap 1 — checklist kesiapan sebelum pekerjaan dimulai. Proyek butuh PJA Approved sebelum lanjut ke WIP Assessment.</p>
      </div>
      ${canCreate ? '<button class="btn-primary" id="btn-new-pja">+ Ajukan PJA</button>' : ''}
    </div>
    <div class="panel" style="padding:0;">
      ${rows.length === 0 ? '<div class="empty-state">Belum ada Pre Job Assessment.</div>' : `
      <table>
        <tr><th>Proyek</th><th>Compliance</th><th>Risiko</th><th>Status</th><th>Diajukan</th></tr>
        ${rows.map((r) => `
          <tr>
            <td class="company-name">${esc(r.nama_proyek || r.id_proyek)}</td>
            <td class="mono">${r.compliance_percent}%</td>
            <td>${riskBadge(r.level_risiko)}</td>
            <td>${statusBadge(r.status)}</td>
            <td class="mono">${fmtDate(r.tanggal_submit)}</td>
          </tr>`).join('')}
      </table>`}
    </div>
  `;

  if (canCreate) {
    root.querySelector('#btn-new-pja').onclick = () => openNewPJA(eligible, md.checklist_pja, user, () => load(root, user));
  }
}

function openNewPJA(proyekList, checklistItems, user, onDone) {
  const scoped = user.peran === 'PIC' ? proyekList.filter((p) => p.id_proyek === user.id_proyek) : proyekList;
  if (scoped.length === 0) return toast('Tidak ada proyek yang perlu diajukan PJA saat ini.', 'error');
  const box = openModal(`
    <div class="modal-head"><h2>Ajukan Pre Job Assessment</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="pja-form">
      <div class="field" style="margin-bottom:14px;">
        <label>Proyek</label>
        <select name="id_proyek" required ${scoped.length === 1 ? 'disabled' : ''}>
          ${scoped.length !== 1 ? '<option value="">Pilih proyek…</option>' : ''}
          ${scoped.map((p) => `<option value="${esc(p.id_proyek)}" ${scoped.length === 1 ? 'selected' : ''}>${esc(p.nama_proyek)}</option>`).join('')}
        </select>
        ${scoped.length === 1 ? `<input type="hidden" name="id_proyek_hidden" value="${esc(scoped[0].id_proyek)}">` : ''}
      </div>
      <div class="section-title">Checklist kesiapan</div>
      ${checklistItems.map((item, i) => `
        <div class="doc-row">
          <div>${esc(item)}</div>
          <label style="display:flex; align-items:center; gap:6px;"><input type="checkbox" data-checklist="${i}" checked> Terpenuhi</label>
        </div>
      `).join('')}
      <div class="section-title">Estimasi risiko pekerjaan</div>
      <div class="form-grid">
        <div class="field"><label>Likelihood (1-5)</label><input type="number" name="likelihood" min="1" max="5" required></div>
        <div class="field"><label>Severity (1-5)</label><input type="number" name="severity" min="1" max="5" required></div>
      </div>
      <div class="field-hint" id="preview-level" style="margin-top:6px;"></div>
      <div class="field" style="margin-top:14px;"><label>Lampiran dokumen pendukung (opsional)</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png"></div>
      <div class="field" style="margin-top:10px;"><label>Catatan pengaju</label><textarea name="catatan_pengaju" placeholder="Opsional"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Ajukan PJA</button>
      </div>
    </form>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);

  const preview = () => {
    const l = Number(box.querySelector('[name=likelihood]').value || 0);
    const s = Number(box.querySelector('[name=severity]').value || 0);
    if (!l || !s) { box.querySelector('#preview-level').textContent = ''; return; }
    const score = l * s;
    let level = 'Rendah';
    if (score >= 15) level = 'Kritis'; else if (score >= 9) level = 'Tinggi'; else if (score >= 4) level = 'Sedang';
    box.querySelector('#preview-level').textContent = `Estimasi skor: ${score} → level risiko ${level}.`;
  };
  box.querySelectorAll('[name=likelihood], [name=severity]').forEach((el) => el.addEventListener('input', preview));

  box.querySelector('#pja-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id_proyek = fd.get('id_proyek') || fd.get('id_proyek_hidden');
    if (!id_proyek) return toast('Pilih proyek terlebih dahulu.', 'error');
    const checklist = checklistItems.map((item, i) => ({
      item, terpenuhi: box.querySelector(`[data-checklist="${i}"]`).checked,
    }));
    const payload = {
      id_proyek, checklist,
      likelihood: Number(fd.get('likelihood')), severity: Number(fd.get('severity')),
      catatan_pengaju: fd.get('catatan_pengaju'), lampiran: [],
    };
    const file = fd.get('file');
    if (file && file.size > 0) {
      payload.lampiran = [{ nama_file: file.name, file_base64: await fileToBase64(file) }];
    }
    try {
      const res = await api.post('/api/pja', payload);
      toast(`PJA diajukan — level risiko ${res.data.level_risiko}, menunggu review.`, 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}
