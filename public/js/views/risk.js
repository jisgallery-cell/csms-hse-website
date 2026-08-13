import { api } from '../api.js';
import { esc, riskBadge, statusBadge, fmtDate, toast, openModal, closeModal } from '../ui.js';

export async function renderRisk(root, user) {
  root.innerHTML = `<div class="empty-state">Memuat risk assessment…</div>`;
  await load(root, user);
}

function cellClass(score) {
  if (score >= 15) return 'c-crit';
  if (score >= 9) return 'c-high';
  if (score >= 4) return 'c-mid';
  return 'c-low';
}

function buildMatrix(rows) {
  const counts = {};
  rows.forEach((r) => { const key = `${r.likelihood}-${r.severity}`; counts[key] = (counts[key] || 0) + 1; });
  let html = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const likelihood = 5 - row;
      const severity = col + 1;
      const score = likelihood * severity;
      const n = counts[`${likelihood}-${severity}`] || 0;
      html += `<div class="cell ${cellClass(score)}" title="Likelihood ${likelihood} × Severity ${severity} = ${score}${n ? ` · ${n} assessment` : ''}">${score}${n ? `<sub style="font-size:9px; margin-left:2px;">(${n})</sub>` : ''}</div>`;
    }
  }
  return html;
}

async function load(root, user) {
  const [{ data: rows }, { data: proyekList }] = await Promise.all([
    api.get('/api/riskassessment'),
    api.get('/api/proyek'),
  ]);
  const canCreate = ['Admin HSE', 'Admin Sistem', 'Staf Lapangan'].includes(user.peran);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Risk assessment</h1>
        <p>Matriks kemungkinan (likelihood) × keparahan (severity) sesuai kaidah HSE standar industri, per proyek</p>
      </div>
      ${canCreate ? '<button class="btn-primary" id="btn-new-ra">+ Ajukan penilaian</button>' : ''}
    </div>

    <div class="panel">
      <div class="matrix-wrap">
        <div class="matrix-axis-y">TINGKAT KEMUNGKINAN</div>
        <div>
          <div class="matrix-grid">${buildMatrix(rows)}</div>
          <div style="display:flex; justify-content:space-between; width:340px; margin-top:8px; font-size:11px; color:var(--text-dim); padding-left:2px;">
            <span>Ringan</span><span>Minor</span><span>Sedang</span><span>Berat</span><span>Fatal</span>
          </div>
          <div style="text-align:center; font-size:11px; color:var(--text-dim); margin-top:4px; letter-spacing:0.05em;">TINGKAT KEPARAHAN</div>
        </div>
      </div>
      <div class="matrix-legend">
        <span><span class="legend-dot" style="background:var(--green)"></span>Rendah (1-3) — pantau berkala</span>
        <span><span class="legend-dot" style="background:var(--amber)"></span>Sedang (4-8) — mitigasi terjadwal</span>
        <span><span class="legend-dot" style="background:var(--orange)"></span>Tinggi (9-14) — perlu approval HSE</span>
        <span><span class="legend-dot" style="background:var(--red)"></span>Kritis (15-25) — pekerjaan ditunda</span>
      </div>
    </div>

    <div class="panel" style="padding:0;">
      <h3 style="padding:18px 20px 0;">Riwayat penilaian</h3>
      ${rows.length === 0 ? '<div class="empty-state">Belum ada penilaian risiko.</div>' : `
      <table>
        <tr><th>Proyek</th><th>Aktivitas</th><th>L×S</th><th>Skor</th><th>Level</th><th>Status</th><th>Tanggal</th></tr>
        ${rows.map((r) => `
          <tr>
            <td class="company-name">${esc(r.nama_proyek || r.id_proyek)}</td>
            <td>${esc(r.aktivitas_kerja)}</td>
            <td class="mono">${r.likelihood} × ${r.severity}</td>
            <td class="mono">${r.skor_risiko}</td>
            <td>${riskBadge(r.level_risiko)}</td>
            <td>${statusBadge(r.status)}</td>
            <td class="mono">${fmtDate(r.tanggal_assessment)}</td>
          </tr>`).join('')}
      </table>`}
    </div>
  `;

  if (canCreate) root.querySelector('#btn-new-ra').onclick = () => openNewRA(proyekList, user, () => load(root, user));
}

function openNewRA(proyekList, user, onDone) {
  const scoped = user.peran === 'Staf Lapangan' ? proyekList.filter((p) => p.id_proyek === user.id_proyek) : proyekList.filter((p) => p.status_proyek === 'Aktif');
  const box = openModal(`
    <div class="modal-head"><h2>Pengajuan Risk Assessment</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="ra-form">
      <div class="form-grid">
        <div class="field full"><label>Proyek</label>
          <select name="id_proyek" required ${scoped.length === 1 ? 'disabled' : ''}>
            ${scoped.length !== 1 ? '<option value="">Pilih proyek…</option>' : ''}
            ${scoped.map((p) => `<option value="${esc(p.id_proyek)}" ${scoped.length === 1 ? 'selected' : ''}>${esc(p.nama_proyek)}</option>`).join('')}
          </select>
          ${scoped.length === 1 ? `<input type="hidden" name="id_proyek_hidden" value="${esc(scoped[0].id_proyek)}">` : ''}
        </div>
        <div class="field full"><label>Aktivitas kerja</label><input name="aktivitas_kerja" required placeholder="mis. Pengelasan pipa bertekanan"></div>
        <div class="field full"><label>Bahaya teridentifikasi</label><textarea name="bahaya_teridentifikasi" required placeholder="Deskripsi potensi bahaya"></textarea></div>
        <div class="field"><label>Likelihood (1-5)</label><input type="number" name="likelihood" min="1" max="5" required></div>
        <div class="field"><label>Severity (1-5)</label><input type="number" name="severity" min="1" max="5" required></div>
        <div class="field full"><label>Rencana mitigasi</label><textarea name="rencana_mitigasi" required placeholder="Tindakan pengendalian yang diusulkan"></textarea></div>
      </div>
      <div class="field-hint" id="preview-level" style="margin-top:10px;"></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Ajukan</button>
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
    const needsApr = level === 'Tinggi' || level === 'Kritis';
    box.querySelector('#preview-level').textContent = `Estimasi skor: ${score} → level ${level}.${needsApr ? ' Akan melalui alur approval HSE.' : ' Dapat disetujui otomatis oleh sistem.'}`;
  };
  box.querySelectorAll('[name=likelihood], [name=severity]').forEach((el) => el.addEventListener('input', preview));

  box.querySelector('#ra-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      id_proyek: fd.get('id_proyek') || fd.get('id_proyek_hidden'),
      aktivitas_kerja: fd.get('aktivitas_kerja'),
      bahaya_teridentifikasi: fd.get('bahaya_teridentifikasi'),
      likelihood: Number(fd.get('likelihood')),
      severity: Number(fd.get('severity')),
      rencana_mitigasi: fd.get('rencana_mitigasi'),
    };
    if (!payload.id_proyek) return toast('Pilih proyek terlebih dahulu.', 'error');
    try {
      const res = await api.post('/api/riskassessment', payload);
      toast(`Pengajuan tersimpan — level ${res.data.level_risiko}, status ${res.data.status}.`, 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}
