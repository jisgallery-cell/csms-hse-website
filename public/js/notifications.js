// notifications.js — bell icon in the topbar: polls for new notifications
// and lets the user open a dropdown, read items, and mark them read.
import { api } from './api.js';
import { esc, timeAgo } from './ui.js';

let pollTimer = null;

export function initNotifications() {
  const bell = document.getElementById('notif-bell');
  const panel = document.getElementById('notif-panel');
  if (!bell || !panel) return;

  bell.onclick = async (e) => {
    e.stopPropagation();
    const isHidden = panel.classList.contains('hidden');
    if (isHidden) {
      await refresh();
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  };

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== bell) panel.classList.add('hidden');
  });

  refresh();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 30000); // poll every 30s for new submissions
}

export function stopNotifications() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function refresh() {
  try {
    const { data, unread_count } = await api.get('/api/notifications');
    renderBadge(unread_count);
    renderPanel(data);
  } catch (e) {
    // not fatal — e.g. session expired; leave bell as-is
  }
}

function renderBadge(count) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderPanel(items) {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="notif-head">
      <span>Notifikasi</span>
      <button class="action-link" id="notif-mark-all">Tandai semua dibaca</button>
    </div>
    <div class="notif-list">
      ${items.length === 0 ? '<div class="empty-state" style="padding:24px 14px;">Belum ada notifikasi.</div>' : items.map((n) => `
        <div class="notif-item ${n.dibaca ? '' : 'unread'}" data-id="${esc(n.id)}">
          <div class="notif-title">${esc(n.judul)}</div>
          <div class="notif-msg">${esc(n.pesan)}</div>
          <div class="notif-time">${timeAgo(n.waktu)}</div>
        </div>`).join('')}
    </div>
  `;

  const markAllBtn = panel.querySelector('#notif-mark-all');
  if (markAllBtn) {
    markAllBtn.onclick = async (e) => {
      e.stopPropagation();
      try { await api.put('/api/notifications/read-all'); await refresh(); } catch (err) { /* noop */ }
    };
  }
  panel.querySelectorAll('[data-id]').forEach((el) => {
    el.onclick = async () => {
      try { await api.put(`/api/notifications/${el.dataset.id}/read`); await refresh(); } catch (err) { /* noop */ }
    };
  });
}
