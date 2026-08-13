// admin.js — Administrasi: pengguna, master data (Area, Kontraktor/Vendor,
// Jenis Pekerjaan, Checklist PJA/WIP/Final, Risk Kategori, Kategori Temuan),
// konfigurasi ambang batas, dan log aktivitas.
import { api } from '../api.js';
import { esc, statusBadge, fmtDateTime, toast, openModal, closeModal } from '../ui.js';

let activeTab = 'users';
let masterSubTab = 'area';

const MASTER_LISTS = [
  ['area', 'Area', 'area'],
  ['kontraktor_vendor', 'Kontraktor/Vendor', 'kontraktor-vendor'],
  ['jenis_pekerjaan', 'Jenis Pekerjaan', 'jenis-pekerjaan'],
  ['checklist_pja', 'Checklist PJA', 'checklist-pja'],
  ['checklist_wip', 'Checklist WIP', 'checklist-wip'],
  ['checklist_final', 'Checklist Final Evaluation', 'checklist-final'],
  ['risk_kategori', 'Risk Kategori', 'risk-kategori'],
  ['kategori_temuan', 'Kategori Temuan', 'kategori-temuan'],
];

export async function renderAdmin(root, user) {
  root.innerHTML = `<div class="empty-state">Memuat administrasi & pengaturan…</div>`;
  await load(root, user);
}

async function load(root, user) {
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Administrasi &amp; Pengaturan</h1><p>Manajemen pengguna, master data, ambang batas sistem, dan log aktivitas (append-only)</p></div>
    </div>
    <div class="tabs no-print">
      ${[['users', 'Pengguna'], ['master', 'Master Data'], ['config', 'Konfigurasi'], ['qr', 'QR Barcode Safety'], ['audit', 'Log Aktivitas']].map(([k, l]) =>
        `<button class="tab-btn ${activeTab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}
    </div>
    <div id="admin-tab-body"><div class="empty-state">Memuat…</div></div>
  `;
  root.querySelectorAll('[data-tab]').forEach((btn) => btn.onclick = () => { activeTab = btn.dataset.tab; load(root, user); });
  const body = root.querySelector('#admin-tab-body');
  if (activeTab === 'users') return renderUsers(body);
  if (activeTab === 'master') return renderMaster(body);
  if (activeTab === 'config') return renderConfig(body);
  if (activeTab === 'qr') return renderQR(body);
  if (activeTab === 'audit') return renderAudit(body);
}

async function renderUsers(body) {
  const [{ data: users }, { data: proyekList }] = await Promise.all([api.get('/api/admin/users'), api.get('/api/proyek')]);
  const pMap = Object.fromEntries(proyekList.map((p) => [p.id_proyek, p]));
  body.innerHTML = `
    <div class="toolbar"><div></div><button class="btn-primary" id="btn-new-user">+ Tambah pengguna</button></div>
    <div class="panel" style="padding:0;">
      <table>
        <tr><th>Nama</th><th>Email</th><th>Peran</th><th>Proyek</th><th>Status</th><th>Login terakhir</th><th></th></tr>
        ${users.map((u) => `
          <tr>
            <td class="company-name">${esc(u.nama)}</td>
            <td class="mono">${esc(u.email)}</td>
            <td>${esc(u.peran)}</td>
            <td>${u.id_proyek ? esc((pMap[u.id_proyek] || {}).nama_proyek || u.id_proyek) : '—'}</td>
            <td>${statusBadge(u.status_akun)}</td>
            <td class="mono">${u.log_login_terakhir ? fmtDateTime(u.log_login_terakhir) : '—'}</td>
            <td><button class="action-link" data-toggle="${esc(u.id_user)}" data-status="${u.status_akun}">${u.status_akun === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
          </tr>`).join('')}
      </table>
    </div>
  `;
  body.querySelector('#btn-new-user').onclick = () => openNewUser(proyekList, () => renderUsers(body));
  body.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.onclick = async () => {
      const newStatus = btn.dataset.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
      try {
        await api.put(`/api/admin/users/${btn.dataset.toggle}`, { status_akun: newStatus });
        toast('Status pengguna diperbarui.', 'success');
        renderUsers(body);
      } catch (err) { toast(err.message, 'error'); }
    };
  });
}

function openNewUser(proyekList, onDone) {
  const box = openModal(`
    <div class="modal-head"><h2>Tambah pengguna</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="user-form">
      <div class="form-grid">
        <div class="field"><label>Nama</label><input name="nama" required></div>
        <div class="field"><label>Email</label><input type="email" name="email" required></div>
        <div class="field"><label>Peran</label>
          <select name="peran" required>
            ${['Admin HSE', 'PIC', 'Reviewer', 'Manajemen', 'Admin Sistem'].map((p) => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="proyek-field" style="display:none;"><label>Proyek yang ditugaskan</label>
          <select name="id_proyek">
            <option value="">Pilih proyek…</option>
            ${proyekList.map((p) => `<option value="${esc(p.id_proyek)}">${esc(p.nama_proyek)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Password awal</label><input type="password" name="password" required minlength="8"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Simpan</button>
      </div>
    </form>
  `);
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);
  const proyekField = box.querySelector('#proyek-field');
  box.querySelector('[name=peran]').addEventListener('change', (e) => {
    proyekField.style.display = e.target.value === 'PIC' ? 'block' : 'none';
  });
  box.querySelector('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.post('/api/admin/users', Object.fromEntries(fd.entries()));
      toast('Pengguna baru dibuat.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function renderMaster(body) {
  const md = await api.get('/api/admin/masterdata');
  body.innerHTML = `
    <div class="tabs no-print" style="margin-bottom:14px;">
      ${MASTER_LISTS.map(([k, label]) => `<button class="tab-btn ${masterSubTab === k ? 'active' : ''}" data-master-tab="${k}">${label}</button>`).join('')}
    </div>
    <div id="master-list-body"></div>
  `;
  body.querySelectorAll('[data-master-tab]').forEach((btn) => {
    btn.onclick = () => { masterSubTab = btn.dataset.masterTab; renderMaster(body); };
  });
  renderMasterList(body.querySelector('#master-list-body'), md);
}

function renderMasterList(listBody, md) {
  const entry = MASTER_LISTS.find(([k]) => k === masterSubTab);
  const [key, label, endpoint] = entry;
  const items = md[key] || [];
  listBody.innerHTML = `
    <div class="panel">
      <h3>${esc(label)}</h3>
      ${items.length === 0 ? '<div class="empty-state">Belum ada data.</div>' : items.map((it) => `<div class="doc-row"><div>${esc(it)}</div></div>`).join('')}
      <form id="master-add-form" style="display:flex; gap:8px; margin-top:12px;">
        <input class="input-box" name="nama" placeholder="Tambah ${esc(label.toLowerCase())} baru…" style="flex:1;" required>
        <button class="btn-ghost" type="submit">Tambah</button>
      </form>
    </div>
  `;
  listBody.querySelector('#master-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await api.post(`/api/admin/masterdata/${endpoint}`, { nama: fd.get('nama') });
      toast(`${label} ditambahkan.`, 'success');
      md[key] = res.data;
      renderMasterList(listBody, md);
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function renderConfig(body) {
  const { data: cfg } = await api.get('/api/admin/config');
  body.innerHTML = `
    <div class="panel" style="max-width:640px;">
      <h3>Ambang batas sistem</h3>
      <form id="config-form" class="form-grid">
        <div class="field"><label>Tenggat CA urgensi Tinggi (hari)</label><input type="number" name="ca_deadline_tinggi_hari" value="${cfg.ca_deadline_tinggi_hari}"></div>
        <div class="field"><label>Tenggat CA default (hari)</label><input type="number" name="ca_deadline_default_hari" value="${cfg.ca_deadline_default_hari}"></div>
        <div class="field"><label>Interval pengingat WIP Assessment (hari)</label><input type="number" name="wip_reminder_interval_hari" value="${cfg.wip_reminder_interval_hari}"></div>
        <div class="field-hint full">Sistem akan mengingatkan Admin HSE &amp; PIC bila belum ada WIP Assessment baru melewati interval ini sejak PJA Approved / WIP terakhir.</div>
        <div class="form-actions full"><button type="submit" class="btn-primary">Simpan Konfigurasi</button></div>
      </form>
    </div>
  `;
  body.querySelector('#config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    Object.keys(payload).forEach((k) => payload[k] = Number(payload[k]));
    try {
      await api.put('/api/admin/config', payload);
      toast('Konfigurasi disimpan.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function renderQR(body) {
  const { data: proyekList } = await api.get('/api/proyek');
  const aktif = proyekList.filter((p) => p.status_proyek === 'Aktif');
  body.innerHTML = `
    <div class="field-hint" style="margin-bottom:14px;">Cetak/tempel QR ini di lokasi kerja masing-masing proyek. Pekerja scan → langsung masuk halaman lapor safety tanpa perlu login, otomatis tertaut ke proyek yang benar.</div>
    <div class="grid-2" id="qr-grid" style="grid-template-columns:repeat(auto-fill, minmax(220px,1fr));">
      ${aktif.length === 0 ? '<div class="empty-state">Tidak ada proyek aktif.</div>' : aktif.map((p) => `
        <div class="panel" style="text-align:center;">
          <h3 style="margin-bottom:10px;">${esc(p.nama_proyek)}</h3>
          <div id="qr-${esc(p.id_proyek)}" style="display:flex; justify-content:center; margin-bottom:10px;"></div>
          <div class="mono small-dim" style="word-break:break-all;">${esc(location.origin)}/report/${esc(p.id_proyek)}</div>
          <button class="btn-ghost" data-copy="${esc(p.id_proyek)}" style="margin-top:10px;">Salin Link</button>
        </div>
      `).join('')}
    </div>
  `;
  aktif.forEach((p) => {
    const url = `${location.origin}/report/${p.id_proyek}`;
    const target = body.querySelector(`#qr-${CSS.escape(p.id_proyek)}`);
    if (window.QRCode && target) {
      const canvas = document.createElement('canvas');
      target.appendChild(canvas);
      window.QRCode.toCanvas(canvas, url, { width: 160, margin: 1 }, (err) => { if (err) target.innerHTML = '<div class="small-dim">Gagal membuat QR</div>'; });
    } else if (target) {
      target.innerHTML = '<div class="small-dim">Library QR belum termuat</div>';
    }
  });
  body.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.onclick = () => {
      const url = `${location.origin}/report/${btn.dataset.copy}`;
      navigator.clipboard.writeText(url).then(() => toast('Link disalin.', 'success')).catch(() => toast(url, 'info'));
    };
  });
}

async function renderAudit(body) {
  const { data: logs } = await api.get('/api/admin/auditlog?limit=200');
  body.innerHTML = `
    <div class="panel" style="padding:0;">
      <table>
        <tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Target</th></tr>
        ${logs.map((l) => `<tr><td class="mono">${fmtDateTime(l.waktu)}</td><td>${esc(l.actor_nama)}</td><td>${esc(l.aksi)}</td><td>${esc(l.target)}</td></tr>`).join('')}
      </table>
    </div>
    <div class="field-hint" style="margin-top:10px;">Log aktivitas bersifat append-only untuk keperluan audit dan tidak dapat diubah atau dihapus.</div>
  `;
}
