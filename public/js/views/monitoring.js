// monitoring.js — nama file dipertahankan, tapi tampilan ini sekarang adalah
// "Work In Progress Assessment" (Tahap 2): checklist kondisi lapangan
// (termasuk item Izin Kerja/PTW, hasil MCU pekerja, dan kepatuhan
// fasilitas/workshop) plus pencatatan temuan & tindakan korektif yang
// tertaut ke tiap WIP. Hanya proyek dengan PJA Approved yang bisa diajukan.
import { api, fileToBase64 } from '../api.js';
import { esc, statusBadge, fmtDate, toast, openModal, closeModal } from '../ui.js';

function urgensiBadge(level) {
  const color = level === 'Tinggi' ? 'red' : level === 'Sedang' ? 'amber' : 'green';
  return `<span class="badge ${color}">${esc(level)}</span>`;
}

export async function renderMonitoring(root, user, opts) {
  root.innerHTML = `<div class="empty-state">Memuat Work In Progress Assessment…</div>`;
  await load(root, user, (opts && opts.tab) || 'wip');
}

async function load(root, user, tab) {
  const canCreate = ['Admin HSE', 'PIC', 'Admin Sistem'].includes(user.peran);
  const [{ data: wipRows }, { data: proyekList }, md] = await Promise.all([
    api.get('/api/wip'),
    api.get('/api/proyek'),
    api.get('/api/admin/masterdata'),
  ]);
  const eligible = proyekList.filter((p) => p.pja_status === 'Approved');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Work In Progress Assessment (WIP)</h1>
        <p>Tahap 2 — checklist kondisi lapangan berjalan, mencakup Izin Kerja, hasil MCU pekerja, dan kepatuhan fasilitas/workshop, plus temuan &amp; tindakan korektif.</p>
      </div>
      ${canCreate && tab === 'wip' ? '<button class="btn-primary" id="btn-new-wip">+ Ajukan WIP</button>' : ''}
      ${canCreate && tab === 'ca' ? '<button class="btn-primary" id="btn-new-ca">+ Catat temuan</button>' : ''}
    </div>
    <div class="tabs no-print">
      <button class="tab-btn ${tab === 'wip' ? 'active' : ''}" data-view-tab="wip">Assessment</button>
      <button class="tab-btn ${tab === 'ca' ? 'active' : ''}" data-view-tab="ca">Temuan &amp; Tindakan Korektif</button>
    </div>
    <div id="tab-body"></div>
  `;

  root.querySelectorAll('[data-view-tab]').forEach((btn) => {
    btn.onclick = () => load(root, user, btn.dataset.viewTab);
  });

  if (canCreate && tab === 'wip') root.querySelector('#btn-new-wip').onclick = () => openNewWIP(eligible, md.checklist_wip, user, () => load(root, user, 'wip'));

  const body = root.querySelector('#tab-body');
  if (tab === 'wip') {
    renderWipTab(body, wipRows, user, () => load(root, user, 'wip'));
  } else {
    await renderCaTab(body, proyekList, wipRows, user);
    if (canCreate) root.querySelector('#btn-new-ca').onclick = () => openNewCA(proyekList, wipRows, () => load(root, user, 'ca'));
  }
}

function renderWipTab(body, rows, user, refresh) {
  body.innerHTML = `
    <div class="panel" style="padding:0;">
      ${rows.length === 0 ? '<div class="empty-state">Belum ada Work In Progress Assessment.</div>' : `
      <table>
        <tr><th>Proyek</th><th>Tanggal</th><th>Compliance</th><th>Status</th><th></th></tr>
        ${rows.map((w) => `
          <tr>
            <td class="company-name">${esc(w.nama_proyek || w.id_proyek)}</td>
            <td class="mono">${fmtDate(w.tanggal_assessment)}</td>
            <td class="mono">${w.compliance_percent}%</td>
            <td>${statusBadge(w.status)}</td>
            <td><button class="action-link" data-wip-detail="${esc(w.id_wip)}">Detail</button></td>
          </tr>`).join('')}
      </table>`}
    </div>
  `;
  body.querySelectorAll('[data-wip-detail]').forEach((btn) => {
    btn.onclick = () => openWipDetail(btn.dataset.wipDetail, refresh);
  });
}

async function openWipDetail(id, refresh) {
  const { data: w, temuan } = await api.get(`/api/wip/${id}`);
  const box = openModal(`
    <div class="modal-head"><h2>WIP ${esc(w.nama_proyek || w.id_proyek)}</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <div class="form-grid" style="margin-bottom:14px; font-size:13px;">
      <div><div class="small-dim">Tanggal assessment</div><div class="mono">${fmtDate(w.tanggal_assessment)}</div></div>
      <div><div class="small-dim">Compliance</div><div class="mono">${w.compliance_percent}%</div></div>
      <div><div class="small-dim">Status</div><div>${statusBadge(w.status)}</div></div>
      ${w.catatan_review ? `<div class="full"><div class="small-dim">Catatan reviewer</div><div>${esc(w.catatan_review)}</div></div>` : ''}
    </div>
    <div class="section-title">Checklist</div>
    ${(w.checklist || []).map((c) => `<div class="doc-row"><div>${esc(c.item)}</div><div>${c.terpenuhi ? '✅ Terpenuhi' : '❌ Belum'}</div></div>`).join('')}
    <div class="section-title">Temuan tertaut (${temuan.length})</div>
    ${temuan.length === 0 ? '<div class="empty-state">Tidak ada temuan tertaut WIP ini.</div>' : temuan.map((t) => `
      <div class="doc-row"><div>${esc(t.kategori_temuan)}<div class="small-dim">${esc(t.deskripsi_temuan)}</div></div>${statusBadge(t.status)}</div>
    `).join('')}
    ${(w.lampiran || []).length > 0 ? `
    <div class="section-title">Lampiran</div>
    ${w.lampiran.map((d) => `<div class="doc-row"><div>${esc(d.nama_file)}</div><a href="${esc(d.file_path)}" target="_blank" class="action-link">Lihat</a></div>`).join('')}` : ''}
  `, { wide: true });
  box.querySelector('[data-close-modal]').onclick = closeModal;
}

function openNewWIP(proyekList, checklistItems, user, onDone) {
  const scoped = user.peran === 'PIC' ? proyekList.filter((p) => p.id_proyek === user.id_proyek) : proyekList;
  if (scoped.length === 0) return toast('Tidak ada proyek dengan PJA Approved yang bisa diajukan WIP saat ini.', 'error');
  const box = openModal(`
    <div class="modal-head"><h2>Ajukan Work In Progress Assessment</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="wip-form">
      <div class="field" style="margin-bottom:14px;">
        <label>Proyek</label>
        <select name="id_proyek" required>
          <option value="">Pilih proyek…</option>
          ${scoped.map((p) => `<option value="${esc(p.id_proyek)}">${esc(p.nama_proyek)}</option>`).join('')}
        </select>
      </div>
      <div id="live-status"></div>
      <div class="section-title">Checklist kondisi lapangan (Izin Kerja, MCU, Fasilitas/Workshop, dsb.)</div>
      <div class="field-hint" style="margin-bottom:8px;">Cek status PTW &amp; MCU terkini di atas sebelum mencentang item terkait di bawah.</div>
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
        <button type="submit" class="btn-primary">Ajukan WIP</button>
      </div>
    </form>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);

  const proyekSelect = box.querySelector('[name=id_proyek]');
  const liveStatus = box.querySelector('#live-status');
  const loadLiveStatus = async (id_proyek) => {
    if (!id_proyek) { liveStatus.innerHTML = ''; return; }
    liveStatus.innerHTML = '<div class="field-hint">Memuat status PTW & MCU…</div>';
    try {
      const [{ data: ptwRows }, { data: mcuRows }] = await Promise.all([
        api.get(`/api/ptw?proyek_id=${encodeURIComponent(id_proyek)}&status=Aktif`),
        api.get(`/api/mcu?proyek_id=${encodeURIComponent(id_proyek)}`),
      ]);
      const mcuPerhatian = mcuRows.filter((m) => m.tier_reminder && m.tier_reminder !== 'Hijau').length;
      liveStatus.innerHTML = `
        <div class="doc-row"><div>Izin Kerja (PTW) berstatus Aktif</div><span class="badge ${ptwRows.length > 0 ? 'green' : 'gray'}">${ptwRows.length} aktif</span></div>
        <div class="doc-row"><div>Pekerja dengan MCU perlu perhatian (Kuning/Merah/Kedaluwarsa)</div><span class="badge ${mcuPerhatian > 0 ? 'red' : 'green'}">${mcuPerhatian} pekerja</span></div>
      `;
    } catch (e) { liveStatus.innerHTML = '<div class="field-hint">Gagal memuat status PTW/MCU.</div>'; }
  };
  proyekSelect.addEventListener('change', (e) => loadLiveStatus(e.target.value));
  if (proyekSelect.value) loadLiveStatus(proyekSelect.value);

  box.querySelector('#wip-form').addEventListener('submit', async (e) => {
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
      await api.post('/api/wip', payload);
      toast('WIP Assessment diajukan, menunggu review.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function renderCaTab(body, proyekList, wipRows, user) {
  const { data: rows } = await api.get('/api/monitoring');
  body.innerHTML = `
    <div class="panel" style="padding:0;">
      ${rows.length === 0 ? '<div class="empty-state">Belum ada temuan.</div>' : `
      <table>
        <tr><th>Proyek</th><th>Kategori</th><th>Urgensi</th><th>PIC</th><th>Tenggat</th><th>Status</th><th></th></tr>
        ${rows.map((c) => `
          <tr>
            <td class="company-name">${esc(c.nama_proyek || c.id_proyek)}</td>
            <td>${esc(c.kategori_temuan)}<div class="small-dim">${esc(c.deskripsi_temuan)}</div></td>
            <td>${urgensiBadge(c.tingkat_urgensi)}</td>
            <td>${esc(c.pic_tindak_lanjut)}</td>
            <td class="mono">${fmtDate(c.tenggat_waktu)}</td>
            <td>${statusBadge(c.status)}</td>
            <td><button class="action-link" data-detail="${esc(c.id_ca)}">Kelola</button></td>
          </tr>`).join('')}
      </table>`}
    </div>
  `;
  body.querySelectorAll('[data-detail]').forEach((btn) => {
    const row = rows.find((r) => r.id_ca === btn.dataset.detail);
    btn.onclick = () => openManage(row, user, async () => {
      const { data: fresh } = await api.get('/api/monitoring');
      renderCaTab(body, proyekList, fresh, user);
    });
  });
}

function openNewCA(proyekList, wipRows, onDone) {
  const box = openModal(`
    <div class="modal-head"><h2>Catat temuan lapangan</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="ca-form">
      <div class="form-grid">
        <div class="field full"><label>Proyek</label>
          <select name="id_proyek" id="ca-proyek" required>
            <option value="">Pilih proyek…</option>
            ${proyekList.map((p) => `<option value="${esc(p.id_proyek)}">${esc(p.nama_proyek)}</option>`).join('')}
          </select>
        </div>
        <div class="field full"><label>Tertaut ke WIP (opsional)</label>
          <select name="id_wip" id="ca-wip">
            <option value="">Tidak tertaut WIP tertentu</option>
          </select>
        </div>
        <div class="field"><label>Kategori temuan</label>
          <select name="kategori_temuan" required>
            ${['Izin Kerja/PTW', 'Medical Checkup (MCU)', 'Fasilitas/Workshop', 'APD', 'Prosedur Kerja', 'Alat & Peralatan', 'Lingkungan Kerja', 'Lainnya'].map((c) => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Tingkat urgensi</label>
          <select name="tingkat_urgensi" required>
            <option value="Rendah">Rendah (tenggat 14 hari)</option>
            <option value="Sedang">Sedang (tenggat 14 hari)</option>
            <option value="Tinggi">Tinggi (tenggat 7 hari)</option>
          </select>
        </div>
        <div class="field full"><label>Deskripsi temuan</label><textarea name="deskripsi_temuan" required></textarea></div>
        <div class="field full"><label>PIC tindak lanjut</label><input name="pic_tindak_lanjut" required></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Simpan Temuan</button>
      </div>
    </form>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);

  const wipSelect = box.querySelector('#ca-wip');
  box.querySelector('#ca-proyek').addEventListener('change', (e) => {
    const list = wipRows.filter((w) => w.id_proyek === e.target.value);
    wipSelect.innerHTML = '<option value="">Tidak tertaut WIP tertentu</option>' +
      list.map((w) => `<option value="${esc(w.id_wip)}">${fmtDate(w.tanggal_assessment)} — ${statusBadge(w.status).replace(/<[^>]+>/g, '')}</option>`).join('');
  });

  box.querySelector('#ca-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    if (!payload.id_wip) delete payload.id_wip;
    try {
      await api.post('/api/monitoring', payload);
      toast('Temuan tersimpan.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openManage(ca, user, onDone) {
  const canEditStatus = user.peran === 'PIC' || ['Admin HSE', 'Admin Sistem'].includes(user.peran);
  const box = openModal(`
    <div class="modal-head"><h2>${esc(ca.kategori_temuan)} — ${esc(ca.nama_proyek || ca.id_proyek)}</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <div style="font-size:13px; margin-bottom:14px;">
      <div class="small-dim">Deskripsi temuan</div><div style="margin-bottom:10px;">${esc(ca.deskripsi_temuan)}</div>
      <div class="form-grid">
        <div><div class="small-dim">Urgensi</div><div>${esc(ca.tingkat_urgensi)}</div></div>
        <div><div class="small-dim">PIC</div><div>${esc(ca.pic_tindak_lanjut)}</div></div>
        <div><div class="small-dim">Tanggal temuan</div><div class="mono">${fmtDate(ca.tanggal_temuan)}</div></div>
        <div><div class="small-dim">Tenggat waktu</div><div class="mono">${fmtDate(ca.tenggat_waktu)}</div></div>
        <div><div class="small-dim">Status saat ini</div><div>${statusBadge(ca.status)}</div></div>
        <div><div class="small-dim">Bukti penyelesaian</div><div>${ca.bukti_penyelesaian ? `<a href="${esc(ca.bukti_penyelesaian)}" target="_blank" class="action-link">Lihat berkas</a>` : '—'}</div></div>
      </div>
    </div>
    ${canEditStatus && ca.status !== 'Closed' ? `
    <form id="ca-update-form">
      <div class="section-title">Perbarui status</div>
      <div class="form-grid">
        <div class="field"><label>Status baru</label>
          <select name="status">
            <option value="Open" ${ca.status === 'Open' ? 'selected' : ''}>Open</option>
            <option value="In Progress" ${ca.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Overdue" ${ca.status === 'Overdue' ? 'selected' : ''} disabled>Overdue (otomatis)</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div class="field"><label>Bukti penyelesaian (wajib jika Closed)</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Tutup</button>
        <button type="submit" class="btn-primary">Simpan</button>
      </div>
    </form>` : ''}
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);

  const form = box.querySelector('#ca-update-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = { status: fd.get('status') };
      const file = fd.get('file');
      if (file && file.size > 0) {
        payload.file_name = file.name;
        payload.file_base64 = await fileToBase64(file);
      }
      try {
        await api.put(`/api/monitoring/${ca.id_ca}`, payload);
        toast('Status corrective action diperbarui.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast(err.message, 'error'); }
    });
  }
}
