import { api } from './api.js';
import { esc, toast, confirmAction } from './ui.js';
import { renderAuth } from './views/auth.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProyek } from './views/kontraktor.js';
import { renderPQ } from './views/prequalification.js';
import { renderApproval } from './views/approval.js';
import { renderMonitoring } from './views/monitoring.js';
import { renderEvaluasi } from './views/evaluasi.js';
import { renderAdmin } from './views/admin.js';
import { renderPTW } from './views/ptw.js';
import { renderMCU } from './views/mcu.js';
import { renderFacility } from './views/facility.js';
import { initNotifications } from './notifications.js';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', group: 'Utama', roles: null, render: renderDashboard, breadcrumb: 'CSMS / OVERVIEW' },
  { key: 'proyek', label: 'Data Proyek', group: 'Utama', roles: ['Admin HSE', 'Admin Sistem', 'Manajemen', 'Reviewer', 'PIC'], render: renderProyek, breadcrumb: 'CSMS / PROYEK' },
  { key: 'pja', label: 'Pre Job Assessment', group: 'Utama', roles: ['Admin HSE', 'Admin Sistem', 'Reviewer', 'Manajemen', 'PIC'], render: renderPQ, breadcrumb: 'CSMS / PRE JOB ASSESSMENT' },
  { key: 'wip', label: 'Work In Progress Assessment', group: 'Utama', roles: ['Admin HSE', 'Admin Sistem', 'Reviewer', 'Manajemen', 'PIC'], render: renderMonitoring, breadcrumb: 'CSMS / WIP ASSESSMENT' },
  { key: 'evaluasi', label: 'Final Evaluation', group: 'Utama', roles: ['Admin HSE', 'Admin Sistem', 'Reviewer', 'Manajemen', 'PIC'], render: renderEvaluasi, breadcrumb: 'CSMS / FINAL EVALUATION' },
  { key: 'approval', label: 'Approval', group: 'Utama', roles: ['Admin HSE', 'Admin Sistem', 'Reviewer', 'Manajemen', 'PIC'], render: renderApproval, breadcrumb: 'CSMS / APPROVAL' },
  { key: 'ptw', label: 'PTW Digital', group: 'Lainnya', roles: ['Admin HSE', 'Admin Sistem', 'Reviewer', 'Manajemen', 'PIC'], render: renderPTW, breadcrumb: 'CSMS / PTW DIGITAL' },
  { key: 'mcu', label: 'Medical Checkup (MCU)', group: 'Lainnya', roles: ['Admin HSE', 'Admin Sistem', 'Reviewer', 'Manajemen', 'PIC'], render: renderMCU, breadcrumb: 'CSMS / MEDICAL CHECKUP' },
  { key: 'facility', label: 'Facility/Workshop Compliance', group: 'Lainnya', roles: ['Admin HSE', 'Admin Sistem', 'Manajemen'], render: renderFacility, breadcrumb: 'CSMS / FACILITY COMPLIANCE' },
  { key: 'admin', label: 'Administrasi & Pengaturan', group: 'Lainnya', roles: ['Admin Sistem'], render: renderAdmin, breadcrumb: 'CSMS / ADMINISTRASI' },
];

let currentUser = null;
let currentKey = 'dashboard';

async function boot() {
  try {
    const { user } = await api.get('/api/auth/me');
    enterApp(user);
  } catch (e) {
    showAuth();
  }
}

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
  renderAuth(enterApp);
}

function enterApp(user) {
  currentUser = user;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';

  document.getElementById('user-name').textContent = user.nama;
  document.getElementById('user-role').textContent = user.peran;
  document.getElementById('user-avatar').textContent = user.nama.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('brand-sub').textContent = 'PT EXPRO YARD CIBITUNG · PRE JOB · WIP · FINAL EVALUATION';

  buildNav(user);
  const first = NAV.find((n) => !n.roles || n.roles.includes(user.peran));
  navigate(first ? first.key : 'dashboard');
  initNotifications();

  document.getElementById('user-chip').onclick = async () => {
    if (!confirmAction('Keluar dari CSMS HSE?')) return;
    try { await api.post('/api/auth/logout'); } catch (e) { /* noop */ }
    location.reload();
  };
}

function buildNav(user) {
  const nav = document.getElementById('nav-list');
  const visible = NAV.filter((n) => !n.roles || n.roles.includes(user.peran));
  const groups = [...new Set(visible.map((n) => n.group))];
  nav.innerHTML = groups.map((g) => `
    <div class="nav-group-label">${esc(g)}</div>
    ${visible.filter((n) => n.group === g).map((n) => `
      <div class="nav-item" data-key="${n.key}"><span class="dot"></span>${esc(n.label)}</div>
    `).join('')}
  `).join('');
  nav.querySelectorAll('[data-key]').forEach((el) => {
    el.onclick = () => navigate(el.dataset.key);
  });
}

export async function navigate(key, opts) {
  const entry = NAV.find((n) => n.key === key);
  if (!entry) return;
  if (entry.roles && !entry.roles.includes(currentUser.peran)) {
    return toast('Anda tidak memiliki akses ke halaman ini.', 'error');
  }
  currentKey = key;
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.key === key));
  document.getElementById('topbar-title').textContent = entry.label;
  document.getElementById('topbar-breadcrumb').textContent = entry.breadcrumb;
  const root = document.getElementById('view-root');
  try {
    await entry.render(root, currentUser, opts);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty-state">Gagal memuat halaman: ${esc(err.message)}</div>`;
    if (err.status === 401) showAuth();
  }
}

boot();
