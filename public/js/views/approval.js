// approval.js — daftar & keputusan Reviewer untuk PJA / WIP / Final Evaluation.
import { api } from '../api.js';
import { esc, statusBadge, fmtDateTime, toast, openModal, closeModal } from '../ui.js';

const TIPE_ICON = { 'PJA': 'PJA', 'WIP': 'WIP', 'Final Evaluation': 'FIN' };

export async function renderApproval(root, user) {
  root.innerHTML = `<div class="empty-state">Memuat data approval…</div>`;
  await load(root, user, 'Menunggu');
}

async function load(root, user, statusFilter) {
  const { data: rows } = await api.get('/api/approval' + (statusFilter ? `?status=${statusFilter}` : ''));
  const canDecide = ['Reviewer', 'Admin Sistem'].includes(user.peran);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Approval</h1>
        <p>Pengajuan Pre Job Assessment, WIP Assessment, dan Final Evaluation yang menunggu keputusan Reviewer</p>
      </div>
    </div>
    <div class="tabs no-print">
      ${['Menunggu', 'Approved', 'Rework', ''].map((s) => `<button class="tab-btn ${statusFilter === s ? 'active' : ''}" data-tab="${s}">${s || 'Semua'}</button>`).join('')}
    </div>
    <div id="approval-list">
      ${rows.length === 0 ? '<div class="empty-state">Tidak ada pengajuan pada status ini.</div>' : rows.map((a) => `
        <div class="approval-card">
          <div class="approval-left">
            <div class="approval-icon">${esc(TIPE_ICON[a.tipe_referensi] || a.tipe_referensi)}</div>
            <div>
              <div class="approval-title">${esc(a.proyek_nama)} — ${esc(a.ref_label)}</div>
              <div class="approval-meta mono">Diajukan ${fmtDateTime(a.tanggal_submit)} · Reviewer: ${esc(a.approver_nama)}</div>
              ${a.catatan_keputusan ? `<div class="approval-meta">Catatan: ${esc(a.catatan_keputusan)}</div>` : ''}
            </div>
          </div>
          <div class="approval-actions">
            ${a.status !== 'Menunggu' ? statusBadge(a.status) : (canDecide && (user.peran === 'Admin Sistem' || user.id_user === a.approver) ? `
              <button class="btn-reject" data-decide="${esc(a.id_approval)}" data-action="Rework">Rework</button>
              <button class="btn-approve" data-decide="${esc(a.id_approval)}" data-action="Approved">Approve</button>
            ` : statusBadge(a.status))}
          </div>
        </div>`).join('')}
    </div>
  `;

  root.querySelectorAll('[data-tab]').forEach((btn) => btn.onclick = () => load(root, user, btn.dataset.tab));
  root.querySelectorAll('[data-decide]').forEach((btn) => {
    btn.onclick = () => decide(btn.dataset.decide, btn.dataset.action, () => load(root, user, statusFilter));
  });
}

function decide(id, action, onDone) {
  if (action === 'Approved') {
    return confirmAndSend(id, 'Approved', '', onDone);
  }
  const box = openModal(`
    <div class="modal-head"><h2>Minta Rework</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="reject-form">
      <div class="field"><label>Catatan Rework (wajib)</label><textarea name="catatan" required placeholder="Jelaskan apa yang perlu diperbaiki…"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-reject">Kirim Rework</button>
      </div>
    </form>
  `);
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);
  box.querySelector('#reject-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    closeModal();
    await confirmAndSend(id, 'Rework', fd.get('catatan'), onDone);
  });
}

async function confirmAndSend(id, status, catatan, onDone) {
  try {
    await api.put(`/api/approval/${id}/decision`, { status, catatan });
    toast(`Pengajuan ${status === 'Approved' ? 'disetujui' : 'dikembalikan untuk Rework'}.`, status === 'Approved' ? 'success' : 'error');
    onDone();
  } catch (err) { toast(err.message, 'error'); }
}
