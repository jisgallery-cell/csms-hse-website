import { api } from '../api.js';
import { esc } from '../ui.js';

export function renderAuth(onSuccess) {
  const card = document.getElementById('auth-card');
  card.classList.remove('wide');
  card.innerHTML = loginTpl();
  bindLogin(card, onSuccess);
}

function loginTpl() {
  return `
    <div class="auth-brand">
      <div class="display">CSMS · HSE</div>
      <div class="sub">PT EXPRO YARD CIBITUNG — PRE JOB · WIP · FINAL EVALUATION</div>
    </div>
    <div id="auth-error-slot"></div>
    <form id="login-form">
      <div class="field" style="margin-bottom:12px;">
        <label>Email</label>
        <input type="email" name="email" required placeholder="nama@expro.co.id" autocomplete="username">
      </div>
      <div class="field" style="margin-bottom:16px;">
        <label>Password</label>
        <input type="password" name="password" required placeholder="••••••••" autocomplete="current-password">
      </div>
      <button type="submit" class="btn-primary" style="width:100%; padding:11px;">Masuk</button>
    </form>
    <a href="/report" class="public-btn finding" style="display:flex; margin-top:14px; text-decoration:none; box-sizing:border-box;">⚠ Lapor Temuan Safety (Tanpa Login)</a>
    <div class="field-hint" style="margin-top:14px; text-align:center;">Akun dibuat oleh Admin Sistem — hubungi tim IT internal jika belum memiliki akun.</div>
    <div class="demo-accounts">
      <div style="margin-bottom:6px; font-weight:600; color:var(--text-dim);">AKUN DEMO (password: <code>csms2026</code>)</div>
      <div>Admin HSE — <code>admin.hse@csms.local</code></div>
      <div>Reviewer — <code>reviewer1@csms.local</code></div>
      <div>Manajemen — <code>manajemen@csms.local</code></div>
      <div>Admin Sistem — <code>admin.sistem@csms.local</code></div>
      <div>PIC — <code>pic1@csms.local</code></div>
    </div>
  `;
}

function showError(card, msg) {
  card.querySelector('#auth-error-slot').innerHTML = `<div class="auth-error">${esc(msg)}</div>`;
}

function bindLogin(card, onSuccess) {
  card.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await api.post('/api/auth/login', { email: fd.get('email'), password: fd.get('password') });
      onSuccess(res.user);
    } catch (err) {
      showError(card, err.message);
    }
  });
}
