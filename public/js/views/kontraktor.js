// kontraktor.js — nama file dipertahankan agar import di app.js tidak berubah,
// tapi tampilan ini sekarang adalah "Data Proyek" (Yard Cibitung) — pintu
// masuk ke alur Pre Job Assessment -> WIP Assessment -> Final Evaluation.
import { api, qs } from '../api.js';
import { esc, riskBadge, statusBadge, fmtDate, toast, openModal, closeModal } from '../ui.js';

export async function renderProyek(root, user, opts) {
  root.innerHTML = `<div class="empty-state">Memuat data proyek…</div>`;
  await load(root, user, { status: (opts && opts.status) || '' });
}

async function load(root, user, filters) {
  const [{ data }, md] = await Promise.all([
    api.get('/api/proyek' + qs(filters)),
    api.get('/api/admin/masterdata'),
  ]);
  const canCreate = ['Admin HSE', 'Admin Sistem'].includes(user.peran);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Data Proyek</h1>
        <p>Proyek internal PT Expro Yard Cibitung — status tahap Pre Job Assessment, WIP Assessment, dan Final Evaluation</p>
      </div>
      ${canCreate ? '<button class="btn-primary" id="btn-new-proyek">+ Proyek baru</button>' : ''}
    </div>
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-box" id="f-search" placeholder="Cari nama proyek atau client..." value="${esc(filters.q || '')}">
        <select class="select-box" id="f-status">
          <option value="">Semua status</option>
          ${['Aktif', 'Selesai', 'Ditunda'].map((s) => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="panel" style="padding:0;">
      ${data.length === 0 ? '<div class="empty-state">Belum ada proyek yang cocok dengan filter.</div>' : `
      <table>
        <tr><th>Proyek</th><th>Client / Area</th><th>PJA</th><th>WIP</th><th>Final</th><th>Status</th><th>Risiko</th><th></th></tr>
        ${data.map((p) => `
          <tr>
            <td><div class="company-name">${esc(p.nama_proyek)}</div><div class="company-sub mono">${esc(p.id_proyek)}</div></td>
            <td>${esc(p.nama_client)}<div class="small-dim">${esc(p.area)}</div></td>
            <td>${statusBadge(p.pja_status)}</td>
            <td>${statusBadge(p.wip_terakhir_status)}<div class="small-dim">${p.wip_count} kali</div></td>
            <td>${statusBadge(p.final_status)}</td>
            <td>${statusBadge(p.status_proyek)}</td>
            <td>${riskBadge(p.tingkat_risiko_terkini)}</td>
            <td><button class="action-link" data-detail="${esc(p.id_proyek)}">Detail</button></td>
          </tr>`).join('')}
      </table>`}
    </div>
  `;

  root.querySelector('#f-search').addEventListener('input', debounce((e) => load(root, user, { ...filters, q: e.target.value }), 350));
  root.querySelector('#f-status').addEventListener('change', (e) => load(root, user, { ...filters, status: e.target.value }));
  root.querySelectorAll('[data-detail]').forEach((btn) => {
    btn.onclick = () => openDetail(btn.dataset.detail, user, () => load(root, user, filters));
  });
  if (canCreate) root.querySelector('#btn-new-proyek').onclick = () => openNewProyek(md, () => load(root, user, filters));
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function openNewProyek(md, onDone) {
  const box = openModal(`
    <div class="modal-head"><h2>Proyek baru</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="proyek-form">
      <div class="form-grid">
        <div class="field"><label>Nama proyek</label><input name="nama_proyek" required placeholder="mis. Maintenance Rig Cibitung"></div>
        <div class="field"><label>Nama client</label><input name="nama_client" required placeholder="mis. PT Client Migas"></div>
        <div class="field"><label>Area</label>
          <select name="area" required>
            <option value="">Pilih area…</option>
            ${md.area.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Jenis pekerjaan</label>
          <select name="jenis_pekerjaan" required>
            <option value="">Pilih jenis…</option>
            ${md.jenis_pekerjaan.map((j) => `<option value="${esc(j)}">${esc(j)}</option>`).join('')}
          </select>
        </div>
        <div class="field full"><label>Lokasi detail</label><input name="lokasi_detail" placeholder="Detail lokasi di dalam area (opsional)"></div>
        <div class="field"><label>Kontraktor/Vendor terlibat</label>
          <select name="kontraktor_vendor">
            <option value="">Tidak ada / internal</option>
            ${md.kontraktor_vendor.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}
          </select>
        </div>
        <div></div>
        <div class="field"><label>PIC proyek</label><input name="pic_nama" required></div>
        <div class="field"><label>Kontak PIC</label><input name="kontak_pic" required placeholder="08xx-xxxx-xxxx"></div>
        <div class="field"><label>Tanggal mulai</label><input type="date" name="tanggal_mulai" required></div>
        <div class="field"><label>Rencana selesai</label><input type="date" name="tanggal_selesai_rencana"></div>
        <div class="field full"><label>Catatan</label><textarea name="catatan" placeholder="Opsional"></textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Simpan Proyek</button>
      </div>
    </form>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);
  box.querySelector('#proyek-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.post('/api/proyek', Object.fromEntries(fd.entries()));
      toast('Proyek baru berhasil dibuat.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function openDetail(id, user, refresh) {
  const { data: p, pja, wip_list, final_evaluation, riwayat_dokumen } = await api.get(`/api/proyek/${id}`);
  const canEditStatus = ['Admin HSE', 'Admin Sistem'].includes(user.peran);

  const box = openModal(`
    <div class="modal-head">
      <h2>${esc(p.nama_proyek)} <span class="mono small-dim">${esc(p.id_proyek)}</span></h2>
      <button class="modal-close" data-close-modal>&times;</button>
    </div>
    <div class="form-grid" style="margin-bottom:18px; font-size:13px;">
      <div><div class="small-dim">Client</div><div>${esc(p.nama_client)}</div></div>
      <div><div class="small-dim">Area</div><div>${esc(p.area)}</div></div>
      <div class="full"><div class="small-dim">Lokasi detail</div><div>${esc(p.lokasi_detail || '—')}</div></div>
      <div><div class="small-dim">Jenis pekerjaan</div><div>${esc(p.jenis_pekerjaan)}</div></div>
      <div><div class="small-dim">Kontraktor/Vendor</div><div>${esc(p.kontraktor_vendor || '—')}</div></div>
      <div><div class="small-dim">PIC</div><div>${esc(p.pic_nama)} · ${esc(p.kontak_pic)}</div></div>
      <div><div class="small-dim">Periode</div><div class="mono">${fmtDate(p.tanggal_mulai)} – ${p.tanggal_selesai_rencana ? fmtDate(p.tanggal_selesai_rencana) : 'berjalan'}</div></div>
      <div><div class="small-dim">Status proyek</div><div>${statusBadge(p.status_proyek)}</div></div>
      <div><div class="small-dim">Tingkat risiko terkini</div><div>${riskBadge(p.tingkat_risiko_terkini)}</div></div>
      ${p.catatan ? `<div class="full"><div class="small-dim">Catatan</div><div>${esc(p.catatan)}</div></div>` : ''}
    </div>
    ${canEditStatus ? `
    <form id="status-form" style="display:flex; gap:8px; align-items:flex-end; margin-bottom:18px;">
      <div class="field" style="flex:1;"><label>Ubah status proyek</label>
        <select name="status_proyek">
          ${['Aktif', 'Selesai', 'Ditunda'].map((s) => `<option value="${s}" ${p.status_proyek === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <button type="submit" class="btn-ghost">Simpan Status</button>
    </form>` : ''}

    <div class="section-title">Tahap 1 — Pre Job Assessment</div>
    ${!pja ? '<div class="empty-state">Belum diajukan.</div>' : `
      <div class="doc-row"><div>Diajukan ${fmtDate(pja.tanggal_submit)} · Compliance ${pja.compliance_percent}% · Risiko ${esc(pja.level_risiko)}</div>${statusBadge(pja.status)}</div>
      ${pja.catatan_review ? `<div class="small-dim" style="margin-top:4px;">Catatan reviewer: ${esc(pja.catatan_review)}</div>` : ''}
    `}

    <div class="section-title">Tahap 2 — Work In Progress Assessment (${wip_list.length}x)</div>
    ${wip_list.length === 0 ? '<div class="empty-state">Belum ada WIP Assessment.</div>' : wip_list.map((w) => `
      <div class="doc-row"><div>${fmtDate(w.tanggal_assessment)} · Compliance ${w.compliance_percent}%</div>${statusBadge(w.status)}</div>
    `).join('')}

    <div class="section-title">Tahap 3 — Final Evaluation</div>
    ${!final_evaluation ? '<div class="empty-state">Belum diajukan.</div>' : `
      <div class="doc-row"><div>Diajukan ${fmtDate(final_evaluation.tanggal_submit)} · Compliance ${final_evaluation.compliance_percent}%</div>${statusBadge(final_evaluation.status)}</div>
    `}

    <div class="section-title">Riwayat Dokumen</div>
    ${riwayat_dokumen.length === 0 ? '<div class="empty-state">Belum ada dokumen/lampiran.</div>' : riwayat_dokumen.map((d) => `
      <div class="doc-row"><div>${esc(d.nama_file)}<div class="small-dim">${esc(d.sumber)}</div></div><a href="${esc(d.file_path)}" target="_blank" class="action-link">Lihat</a></div>
    `).join('')}
  `, { wide: true });
  box.querySelector('[data-close-modal]').onclick = closeModal;

  const statusForm = box.querySelector('#status-form');
  if (statusForm) {
    statusForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.put(`/api/proyek/${id}`, { status_proyek: fd.get('status_proyek') });
        toast('Status proyek diperbarui.', 'success');
        closeModal();
        refresh();
      } catch (err) { toast(err.message, 'error'); }
    });
  }
}
