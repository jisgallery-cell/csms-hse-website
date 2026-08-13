// ui.js — small shared UI helpers (toasts, modal, formatting, badges)

export function toast(message, type = 'info') {
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

export function openModal(html, opts = {}) {
  const overlay = document.getElementById('modal-overlay');
  const box = document.getElementById('modal-box');
  box.className = 'modal' + (opts.wide ? ' wide' : '');
  box.innerHTML = html;
  overlay.classList.remove('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  const closeBtn = box.querySelector('[data-close-modal]');
  if (closeBtn) closeBtn.onclick = closeModal;
  return box;
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-box').innerHTML = '';
}

export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(d) {
  if (!d) return '—';
  const diffMs = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Kemarin';
  if (days < 7) return `${days} hari lalu`;
  return fmtDate(d);
}

const RISK_COLOR = { Rendah: 'green', Sedang: 'amber', Tinggi: 'orange', Kritis: 'red' };
export function riskBadge(level) {
  if (!level) return '<span class="badge gray">Belum dinilai</span>';
  return `<span class="badge ${RISK_COLOR[level] || 'gray'}">${esc(level)}</span>`;
}

const STATUS_COLOR = {
  'Aktif': 'green', 'Approved': 'green', 'Closed': 'green', 'Selesai': 'green', 'Fit': 'green',
  'Menunggu': 'amber', 'Menunggu Review': 'amber', 'Menunggu Approval': 'amber', 'Draft': 'gray', 'In Progress': 'blue', 'Open': 'blue', 'Ditunda': 'amber',
  'Fit dengan Catatan': 'amber',
  'Belum Diajukan': 'gray', 'Belum Ada': 'gray',
  'Tidak Aktif': 'red', 'Rework': 'red', 'Overdue': 'red', 'Ditolak': 'red', 'Kadaluwarsa': 'red', 'Tidak Fit': 'red',
};
export function statusBadge(status) {
  return `<span class="badge ${STATUS_COLOR[status] || 'gray'}">${esc(status)}</span>`;
}

export function ratingChip(rating) {
  return `<div class="rating-chip ${esc(rating)}">${esc(rating)}</div>`;
}

export function confirmAction(message) {
  return window.confirm(message);
}
