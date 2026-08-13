// ptw.js — PTW Digital: replika penuh form "Permit to Work / Izin Untuk
// Bekerja" (10 bagian) yang dipakai tim lapangan Expro di lokasi client.
import { api, qs } from '../api.js';
import { esc, statusBadge, fmtDate, fmtDateTime, toast, openModal, closeModal, confirmAction } from '../ui.js';

const HAZARD_ITEMS = [
  ['cairan_gas_bertekanan', 'Cairan/gas bertekanan'], ['bahan_beracun', 'Bahan beracun'],
  ['bahan_korosif', 'Bahan korosif'], ['bahan_mudah_terbakar', 'Bahan mudah terbakar'],
  ['operasi_pengangkatan', 'Operasi pengangkatan'], ['penanganan_manual', 'Penanganan manual'],
  ['bekerja_ketinggian', 'Bekerja di ketinggian'], ['ruang_terbatas', 'Ruang terbatas (confined space)'],
  ['partikel_percikan', 'Partikel/percikan terbang'], ['peralatan_percikan', 'Peralatan penghasil percikan'],
  ['mesin_bergerak', 'Mesin bergerak'], ['listrik', 'Listrik'],
  ['segel_lsa', 'Segel LSA'], ['api_busur_terbuka', 'Api/busur terbuka'],
  ['bahan_panas', 'Bahan panas'], ['cuaca_ekstrem', 'Cuaca ekstrem'],
  ['tumpahan_saluran', 'Tumpahan ke saluran'], ['lingkungan', 'Dampak lingkungan'],
  ['pekerjaan_berdekatan', 'Pekerjaan berdekatan terpengaruh'], ['penggalian', 'Pekerjaan penggalian'],
  ['pengujian_gas', 'Pengujian gas diperlukan'],
];
const SITE_PREP_REF = [
  ['toolbox_talk', 'Toolbox Talk / Site Brief'], ['ra_reviewed', 'Risk Assessment ditinjau'],
  ['coshh_reviewed', 'COSHH Assessment ditinjau'], ['lift_plan', 'Lift Plan diperlukan'],
  ['rescue_plan', 'Rescue Plan diperlukan'],
];
const SITE_PREP_BOOL = [
  ['trained_persons', 'Personel terlatih/kompeten'], ['emergency_systems', 'Sistem darurat tersedia'],
  ['earthing', 'Sistem pembumian (grounding)'], ['tools_inspected', 'Alat/peralatan diperiksa'],
  ['environment_reviewed', 'Isu lingkungan ditinjau'], ['spill_kit', 'Spill kit tersedia'],
  ['communication_agreed', 'Jalur komunikasi disepakati'], ['ventilation_required', 'Ventilasi area diperlukan'],
  ['gas_detection_required', 'Deteksi gas diperlukan'],
];
const SITE_PREP_ATTACHED = [
  ['trac', 'TRAC terlampir'], ['ra', 'Risk Assessment terlampir'], ['coshh', 'COSHH Assessment terlampir'],
  ['lift_plan', 'Lift Plan terlampir'], ['rescue_plan', 'Rescue Plan terlampir'],
];
const APD_ITEMS = [
  ['dust_mask', 'Masker debu'], ['face_shield', 'Pelindung wajah'], ['hearing_protection', 'Pelindung pendengaran'],
  ['full_chemical_suit', 'Baju kimia lengkap'], ['safety_harness', 'Safety harness/lanyard'],
  ['inertia_reel', 'Inertia reel'], ['respirator', 'Respirator'], ['breathing_apparatus', 'Breathing Apparatus (BA)'],
];
const KONTROL_ITEMS = [
  ['fire_watcher', 'Fire watcher tersedia'], ['fire_extinguisher', 'Alat pemadam api'], ['lifeline', 'Lifeline/garis hidup'],
  ['radio', 'Radio'], ['hose_reel', 'Selang air (hose reel)'], ['torch_light', 'Lampu/senter'],
  ['isolations_lockouts', 'Isolasi/LOTO'], ['warning_signs', 'Rambu/pembatas peringatan'],
];

export async function renderPTW(root, user) {
  root.innerHTML = `<div class="empty-state">Memuat data izin kerja (PTW)…</div>`;
  await load(root, user, '');
}

async function load(root, user, statusFilter) {
  const [{ data: rows, jenis_izin_options }, pResp] = await Promise.all([
    api.get('/api/ptw' + qs({ status: statusFilter })),
    ['Admin HSE', 'Admin Sistem'].includes(user.peran) ? api.get('/api/proyek') : Promise.resolve({ data: [] }),
  ]);
  const canCreate = ['Admin HSE', 'PIC', 'Admin Sistem'].includes(user.peran);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>PTW Digital — Izin Kerja</h1>
        <p>Replika digital form Permit to Work — pengajuan, checklist keselamatan, validasi harian, hingga penyelesaian pekerjaan</p>
      </div>
      ${canCreate ? '<button class="btn-primary" id="btn-new-ptw">+ Ajukan izin kerja</button>' : ''}
    </div>
    <div class="tabs no-print">
      ${['', 'Menunggu Approval', 'Aktif', 'Selesai', 'Ditolak', 'Kadaluwarsa'].map((s) => `<button class="tab-btn ${statusFilter === s ? 'active' : ''}" data-tab="${s}">${s || 'Semua'}</button>`).join('')}
    </div>
    <div class="panel" style="padding:0;">
      ${rows.length === 0 ? '<div class="empty-state">Tidak ada izin kerja pada status ini.</div>' : `
      <table>
        <tr><th>No. PTW</th><th>Proyek</th><th>Jenis izin</th><th>Lokasi kerja</th><th>Periode</th><th>Status</th><th></th></tr>
        ${rows.map((p) => `
          <tr>
            <td class="mono">${esc(p.ptw_no || p.id_ptw)}</td>
            <td class="company-name">${esc(p.nama_proyek || p.id_proyek)}</td>
            <td>${esc(p.jenis_izin)}</td>
            <td>${esc(p.lokasi_kerja)}</td>
            <td class="mono">${fmtDate(p.tanggal_mulai)} – ${fmtDate(p.tanggal_berakhir_rencana)}</td>
            <td>${statusBadge(p.status)}</td>
            <td><button class="action-link" data-detail="${esc(p.id_ptw)}">Detail</button></td>
          </tr>`).join('')}
      </table>`}
    </div>
  `;

  root.querySelectorAll('[data-tab]').forEach((btn) => btn.onclick = () => load(root, user, btn.dataset.tab));
  root.querySelectorAll('[data-detail]').forEach((btn) => {
    btn.onclick = () => openDetail(btn.dataset.detail, user, () => load(root, user, statusFilter));
  });
  if (canCreate) root.querySelector('#btn-new-ptw').onclick = () => openNewPTW(pResp.data, jenis_izin_options, user, () => load(root, user, statusFilter));
}

function checkboxGrid(name, items, state) {
  return `<div class="ptw-check-grid">${items.map(([k, label]) => `
    <label class="ptw-check-item">
      <input type="checkbox" data-hazard="${name}.${k}" ${state && state[k] ? 'checked' : ''}> ${esc(label)}
    </label>`).join('')}</div>`;
}

function ynSelect(name, key, value) {
  return `<select data-hazard="${name}.${key}">
    <option value="">—</option>
    <option value="Ya" ${value === 'Ya' ? 'selected' : ''}>Ya</option>
    <option value="Tidak" ${value === 'Tidak' ? 'selected' : ''}>Tidak</option>
  </select>`;
}

function openNewPTW(proyekList, jenisOptions, user, onDone) {
  const isStaf = user.peran === 'PIC';
  const box = openModal(`
    <div class="modal-head"><h2>Ajukan Izin Kerja (PTW)</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="ptw-form">
      <div class="section-title">1. Pekerjaan yang harus dilakukan</div>
      <div class="form-grid">
        ${isStaf ? '' : `
        <div class="field full"><label>Proyek</label>
          <select name="id_proyek" required>
            <option value="">Pilih proyek…</option>
            ${proyekList.filter((p) => p.status_proyek === 'Aktif').map((p) => `<option value="${esc(p.id_proyek)}">${esc(p.nama_proyek)}</option>`).join('')}
          </select>
        </div>`}
        <div class="field"><label>Jenis izin</label>
          <select name="jenis_izin" required>${jenisOptions.map((j) => `<option value="${esc(j)}">${esc(j)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Lokasi kerja</label><input name="lokasi_kerja" required></div>
        <div class="field full"><label>Pekerjaan yang harus dilakukan</label><textarea name="pekerjaan_dilakukan" required></textarea></div>
        <div class="field full"><label>Nama karyawan yang mengerjakan</label><input name="nama_karyawan" required placeholder="Pisahkan dengan koma bila lebih dari satu"></div>
        <div class="field"><label>Tanggal mulai</label><input type="date" name="tanggal_mulai" required></div>
        <div class="field"><label>Waktu mulai</label><input type="time" name="waktu_mulai" required></div>
        <div class="field"><label>Durasi diperkirakan</label><input name="durasi_perkiraan" required placeholder="mis. 3 hari / 8 jam"></div>
        <div class="field"><label>Rencana tanggal berakhir</label><input type="date" name="tanggal_berakhir_rencana" required></div>
        <div class="field"><label>Nama perusahaan kontraktor</label><input name="nama_perusahaan_kontraktor" value="PT Expro"></div>
        <div class="field"><label>Penanggung jawab di lokasi</label><input name="penanggung_jawab_lokasi" required></div>
      </div>

      <div class="section-title">2. Identifikasi bahaya</div>
      ${checkboxGrid('bahaya', HAZARD_ITEMS, {})}
      <div class="field"><label>Bahaya lain (identifikasi)</label><input data-hazard="bahaya.lainnya_text"></div>

      <div class="section-title">3. Persiapan lokasi</div>
      <div class="ptw-siteprep-table">
        ${SITE_PREP_REF.map(([k, label]) => `
          <div class="ptw-siteprep-row">
            <div>${esc(label)}</div>
            <input placeholder="No. referensi" data-hazard="persiapan_lokasi.${k}_ref">
            ${ynSelect('persiapan_lokasi', k + '_yn', null)}
          </div>`).join('')}
      </div>
      ${checkboxGrid('persiapan_lokasi', SITE_PREP_BOOL, {})}
      <div class="field-hint" style="margin:10px 0 4px;">Dokumen terlampir:</div>
      <div class="ptw-siteprep-table">
        ${SITE_PREP_ATTACHED.map(([k, label]) => `
          <div class="ptw-siteprep-row" style="grid-template-columns:1fr auto;">
            <div>${esc(label)}</div>
            ${ynSelect('persiapan_lokasi', k + '_attached', null)}
          </div>`).join('')}
      </div>

      <div class="section-title">4. Peralatan pelindung diri (APD tambahan)</div>
      ${checkboxGrid('apd', APD_ITEMS, {})}
      <div class="field"><label>Sarung tangan (identifikasi)</label><input data-hazard="apd.gloves_text"></div>

      <div class="section-title">5. Kontrol yang diperlukan</div>
      ${checkboxGrid('kontrol', KONTROL_ITEMS, {})}

      <div class="section-title">6. Pengujian atmosfer/gas (ruang terbatas)</div>
      <label class="ptw-check-item"><input type="checkbox" id="gas-diperlukan" data-hazard="gas_testing.diperlukan"> Pengujian gas diperlukan untuk pekerjaan ini</label>
      <div id="gas-fields" style="display:none; margin-top:10px;">
        <div class="form-grid">
          <div class="field"><label>Nama gas tester</label><input data-hazard="gas_testing.nama_tester"></div>
          <div class="field"><label>Perusahaan</label><input data-hazard="gas_testing.nama_perusahaan_tester"></div>
          <div class="field"><label>Tanggal</label><input type="date" data-hazard="gas_testing.tanggal"></div>
          <div class="field"><label>Waktu</label><input type="time" data-hazard="gas_testing.waktu"></div>
        </div>
        <table style="margin-top:8px;">
          <tr><th>Parameter</th><th>Batas diizinkan</th><th>Hasil bacaan</th></tr>
          <tr><td>Oksigen (O2)</td><td class="mono">18 - 23%</td><td><input data-hazard="gas_testing.readings.oksigen.reading" style="width:100px;"></td></tr>
          <tr><td>LEL</td><td class="mono">&lt;10% LEL</td><td><input data-hazard="gas_testing.readings.lel.reading" style="width:100px;"></td></tr>
          <tr><td>H2S</td><td class="mono">&lt;5 ppm</td><td><input data-hazard="gas_testing.readings.h2s.reading" style="width:100px;"></td></tr>
          <tr><td>CO</td><td class="mono">&lt;30 ppm</td><td><input data-hazard="gas_testing.readings.co.reading" style="width:100px;"></td></tr>
        </table>
      </div>

      <div class="section-title">7. Deklarasi untuk melakukan tugas</div>
      <div class="form-grid">
        <div class="field"><label>Performing Authority — Nama</label><input id="pa-nama" required></div>
        <div class="field"><label>Performing Authority — Jabatan</label><input id="pa-jabatan"></div>
        <div class="field full"><label><input type="checkbox" id="pa-konfirmasi" required> Saya menyatakan telah memahami risiko pekerjaan ini dan akan melaksanakannya sesuai izin kerja ini.</label></div>
        <div class="field"><label>Responsible Person — Nama</label><input id="rp-nama" required></div>
        <div class="field"><label>Responsible Person — Jabatan</label><input id="rp-jabatan"></div>
        <div class="field full"><label><input type="checkbox" id="rp-konfirmasi" required> Saya menyatakan telah memeriksa lokasi & peralatan kerja sesuai izin kerja ini.</label></div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Ajukan Izin Kerja</button>
      </div>
    </form>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);

  const gasCheckbox = box.querySelector('#gas-diperlukan');
  const gasFields = box.querySelector('#gas-fields');
  gasCheckbox.addEventListener('change', () => { gasFields.style.display = gasCheckbox.checked ? 'block' : 'none'; });

  box.querySelector('#ptw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    if (isStaf) payload.id_proyek = user.id_proyek;

    const nested = { bahaya: {}, persiapan_lokasi: {}, apd: {}, kontrol: {}, gas_testing: { readings: { oksigen: {}, lel: {}, h2s: {}, co: {} } } };
    box.querySelectorAll('[data-hazard]').forEach((el) => {
      const path = el.dataset.hazard.split('.');
      let obj = nested;
      for (let i = 0; i < path.length - 1; i++) { obj[path[i]] = obj[path[i]] || {}; obj = obj[path[i]]; }
      const leaf = path[path.length - 1];
      obj[leaf] = el.type === 'checkbox' ? el.checked : el.value;
    });
    payload.bahaya = nested.bahaya;
    payload.persiapan_lokasi = nested.persiapan_lokasi;
    payload.apd = nested.apd;
    payload.kontrol = nested.kontrol;
    payload.gas_testing = nested.gas_testing;
    payload.deklarasi_performing_authority = {
      nama: box.querySelector('#pa-nama').value, jabatan: box.querySelector('#pa-jabatan').value,
      konfirmasi: box.querySelector('#pa-konfirmasi').checked,
    };
    payload.deklarasi_responsible_person = {
      nama: box.querySelector('#rp-nama').value, jabatan: box.querySelector('#rp-jabatan').value,
      konfirmasi: box.querySelector('#rp-konfirmasi').checked,
    };
    if (!payload.deklarasi_performing_authority.konfirmasi || !payload.deklarasi_responsible_person.konfirmasi) {
      return toast('Konfirmasi deklarasi Bagian 7 wajib dicentang.', 'error');
    }
    try {
      await api.post('/api/ptw', payload);
      toast('Pengajuan izin kerja terkirim, menunggu approval.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function yn(v) { return v === true ? 'Ya' : v === false ? 'Tidak' : (v || '—'); }

function sectionSummary(title, items, state) {
  const active = items.filter(([k]) => state && state[k]);
  return `
    <div class="section-title">${esc(title)}</div>
    ${active.length === 0 ? '<div class="small-dim">Tidak ada item dicentang.</div>' :
      `<div class="ptw-check-grid">${active.map(([k, label]) => `<div class="ptw-check-item checked-view">✓ ${esc(label)}</div>`).join('')}</div>`}
    ${state && state.lainnya_text ? `<div class="small-dim" style="margin-top:6px;">Lainnya: ${esc(state.lainnya_text)}</div>` : ''}
    ${state && state.gloves_text ? `<div class="small-dim" style="margin-top:6px;">Sarung tangan: ${esc(state.gloves_text)}</div>` : ''}
  `;
}

async function openDetail(id, user, onDone) {
  const { data: p, approvals, hari_options } = await api.get(`/api/ptw/${id}`);
  const canFinish = p.status === 'Aktif' && (user.peran === 'Admin HSE' || user.peran === 'Admin Sistem' || (user.peran === 'PIC' && user.id_proyek === p.id_proyek));
  const canValidasi = p.status === 'Aktif' && (user.peran === 'Admin HSE' || user.peran === 'Admin Sistem' || (user.peran === 'PIC' && user.id_proyek === p.id_proyek));

  const sp = p.persiapan_lokasi || {};
  const box = openModal(`
    <div class="modal-head"><h2>${esc(p.ptw_no)} — ${esc(p.jenis_izin)} · ${esc(p.nama_proyek || p.id_proyek)}</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <div style="font-size:13px;">
      <div class="section-title">1. Pekerjaan yang harus dilakukan</div>
      <div class="form-grid">
        <div><div class="small-dim">Lokasi kerja</div><div>${esc(p.lokasi_kerja)}</div></div>
        <div><div class="small-dim">Penanggung jawab lokasi</div><div>${esc(p.penanggung_jawab_lokasi)}</div></div>
        <div><div class="small-dim">Nama karyawan</div><div>${esc(p.nama_karyawan)}</div></div>
        <div><div class="small-dim">Perusahaan</div><div>${esc(p.nama_perusahaan_kontraktor)}</div></div>
        <div><div class="small-dim">Mulai</div><div class="mono">${fmtDate(p.tanggal_mulai)} ${esc(p.waktu_mulai || '')}</div></div>
        <div><div class="small-dim">Rencana berakhir</div><div class="mono">${fmtDate(p.tanggal_berakhir_rencana)}</div></div>
        <div><div class="small-dim">Durasi diperkirakan</div><div>${esc(p.durasi_perkiraan)}</div></div>
        <div><div class="small-dim">Status</div><div>${statusBadge(p.status)}</div></div>
        <div class="full"><div class="small-dim">Deskripsi pekerjaan</div><div>${esc(p.pekerjaan_dilakukan)}</div></div>
      </div>

      ${sectionSummary('2. Identifikasi bahaya', HAZARD_ITEMS, p.bahaya)}

      <div class="section-title">3. Persiapan lokasi</div>
      <div class="ptw-siteprep-table">
        ${SITE_PREP_REF.map(([k, label]) => `
          <div class="ptw-siteprep-row" style="grid-template-columns:1fr auto auto;">
            <div>${esc(label)}</div><div class="mono small-dim">${esc(sp[k + '_ref'] || '—')}</div><div>${yn(sp[k + '_yn'])}</div>
          </div>`).join('')}
      </div>
      ${sectionSummary('', SITE_PREP_BOOL, sp)}
      <div class="field-hint" style="margin:8px 0 4px;">Dokumen terlampir: ${SITE_PREP_ATTACHED.map(([k, label]) => `${esc(label)}: ${yn(sp[k + '_attached'])}`).join(' · ')}</div>

      ${sectionSummary('4. Peralatan pelindung diri (APD)', APD_ITEMS, p.apd)}
      ${sectionSummary('5. Kontrol yang diperlukan', KONTROL_ITEMS, p.kontrol)}

      <div class="section-title">6. Pengujian atmosfer/gas</div>
      ${!p.gas_testing || !p.gas_testing.diperlukan ? '<div class="small-dim">Tidak diperlukan untuk pekerjaan ini.</div>' : `
      <div class="form-grid">
        <div><div class="small-dim">Gas Tester</div><div>${esc(p.gas_testing.nama_tester)} (${esc(p.gas_testing.nama_perusahaan_tester)})</div></div>
        <div><div class="small-dim">Waktu pengujian</div><div class="mono">${fmtDate(p.gas_testing.tanggal)} ${esc(p.gas_testing.waktu || '')}</div></div>
      </div>
      <table style="margin-top:8px;">
        <tr><th>Parameter</th><th>Batas</th><th>Hasil bacaan</th></tr>
        <tr><td>O2</td><td class="mono">${esc(p.gas_testing.readings.oksigen.limit)}</td><td class="mono">${esc(p.gas_testing.readings.oksigen.reading || '—')}</td></tr>
        <tr><td>LEL</td><td class="mono">${esc(p.gas_testing.readings.lel.limit)}</td><td class="mono">${esc(p.gas_testing.readings.lel.reading || '—')}</td></tr>
        <tr><td>H2S</td><td class="mono">${esc(p.gas_testing.readings.h2s.limit)}</td><td class="mono">${esc(p.gas_testing.readings.h2s.reading || '—')}</td></tr>
        <tr><td>CO</td><td class="mono">${esc(p.gas_testing.readings.co.limit)}</td><td class="mono">${esc(p.gas_testing.readings.co.reading || '—')}</td></tr>
      </table>`}

      <div class="section-title">7. Deklarasi</div>
      <div class="form-grid">
        <div><div class="small-dim">Performing Authority</div><div>${esc(p.deklarasi_performing_authority.nama)} — ${esc(p.deklarasi_performing_authority.jabatan || '—')}</div><div class="small-dim mono">${fmtDateTime(p.deklarasi_performing_authority.waktu_konfirmasi)}</div></div>
        <div><div class="small-dim">Responsible Person</div><div>${esc(p.deklarasi_responsible_person.nama)} — ${esc(p.deklarasi_responsible_person.jabatan || '—')}</div><div class="small-dim mono">${fmtDateTime(p.deklarasi_responsible_person.waktu_konfirmasi)}</div></div>
      </div>

      <div class="section-title">8. Validasi / Sign Off harian</div>
      ${(p.validasi_harian || []).length === 0 ? '<div class="small-dim">Belum ada validasi harian tercatat.</div>' : `
      <table>
        <tr><th>Hari</th><th>Tanggal</th><th>Jam mulai</th><th>PA (mulai)</th><th>RP (mulai)</th><th>Jam selesai</th></tr>
        ${p.validasi_harian.map((v) => `<tr><td>${esc(v.hari)}</td><td class="mono">${fmtDate(v.tanggal)}</td><td class="mono">${esc(v.jam_mulai)}</td><td>${esc(v.ttd_performing_authority_mulai)}</td><td>${esc(v.ttd_responsible_person_mulai)}</td><td class="mono">${esc(v.jam_selesai || '—')}</td></tr>`).join('')}
      </table>`}
      ${canValidasi ? '<button class="action-link" id="btn-add-validasi" style="margin-top:8px;">+ Tambah validasi harian</button>' : ''}

      <div class="section-title">9. Penyelesaian / Pembatalan Pekerjaan</div>
      ${!p.penyelesaian ? '<div class="small-dim">Belum diselesaikan.</div>' : `
      <div class="form-grid">
        <div><div class="small-dim">Performing Authority</div><div>${esc(p.penyelesaian.performing_authority.nama)} — ${fmtDate(p.penyelesaian.performing_authority.tanggal)}</div></div>
        <div><div class="small-dim">Responsible Person</div><div>${esc(p.penyelesaian.responsible_person.nama)} — ${fmtDate(p.penyelesaian.responsible_person.tanggal)}</div></div>
      </div>`}

      <div class="section-title">10. Komentar / Tindak Lanjut</div>
      <div>${esc(p.komentar_tindak_lanjut || '—')}</div>

      ${canFinish ? `
      <form id="ptw-finish-form" style="margin-top:16px;">
        <div class="section-title">Selesaikan izin kerja</div>
        <div class="form-grid">
          <div class="field"><label>Performing Authority — Nama</label><input name="pa_nama" required></div>
          <div class="field"><label>Performing Authority — Jabatan</label><input name="pa_jabatan"></div>
          <div class="field"><label>Responsible Person — Nama</label><input name="rp_nama" required></div>
          <div class="field"><label>Responsible Person — Jabatan</label><input name="rp_jabatan"></div>
          <div class="field full"><label>Komentar/tindak lanjut</label><textarea name="komentar_tindak_lanjut"></textarea></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-ghost" data-close-modal>Tutup</button>
          <button type="submit" class="btn-primary">Tandai Selesai</button>
        </div>
      </form>` : ''}
    </div>
  `, { wide: true });
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);

  const addValidasiBtn = box.querySelector('#btn-add-validasi');
  if (addValidasiBtn) addValidasiBtn.onclick = () => openAddValidasi(p.id_ptw, hari_options, () => { closeModal(); openDetail(id, user, onDone); });

  const form = box.querySelector('#ptw-finish-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!confirmAction('Tandai izin kerja ini sebagai Selesai?')) return;
      const fd = new FormData(e.target);
      try {
        await api.put(`/api/ptw/${p.id_ptw}/selesai`, {
          performing_authority: { nama: fd.get('pa_nama'), jabatan: fd.get('pa_jabatan') },
          responsible_person: { nama: fd.get('rp_nama'), jabatan: fd.get('rp_jabatan') },
          komentar_tindak_lanjut: fd.get('komentar_tindak_lanjut'),
        });
        toast('Izin kerja ditandai selesai.', 'success');
        closeModal();
        onDone();
      } catch (err) { toast(err.message, 'error'); }
    });
  }
}

function openAddValidasi(idPtw, hariOptions, onDone) {
  const box = openModal(`
    <div class="modal-head"><h2>Validasi harian</h2><button class="modal-close" data-close-modal>&times;</button></div>
    <form id="validasi-form">
      <div class="form-grid">
        <div class="field"><label>Hari</label>
          <select name="hari" required>${hariOptions.map((h) => `<option value="${esc(h)}">${esc(h)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Tanggal</label><input type="date" name="tanggal" required></div>
        <div class="field"><label>Jam mulai</label><input type="time" name="jam_mulai" required></div>
        <div class="field"><label>Tanda tangan Performing Authority (ketik nama)</label><input name="ttd_performing_authority_mulai" required></div>
        <div class="field"><label>Tanda tangan Responsible Person (ketik nama)</label><input name="ttd_responsible_person_mulai" required></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Simpan</button>
      </div>
    </form>
  `);
  box.querySelectorAll('[data-close-modal]').forEach((b) => b.onclick = closeModal);
  box.querySelector('#validasi-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.post(`/api/ptw/${idPtw}/validasi-harian`, Object.fromEntries(fd.entries()));
      toast('Validasi harian tersimpan.', 'success');
      closeModal();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
  });
}
