const db = require('../db');
const { sendJson, sendError, genId, todayISO, nowISO, computeRiskLevel } = require('../utils');
const { logAudit } = require('../auth');
const { refreshProyekRiskLevel } = require('../business');
const { notify } = require('../notifications');

function scopedProyek(user) {
  return user.peran === 'Staf Lapangan' ? user.id_proyek : null;
}

async function listRA(req, res, ctx, body, query) {
  let rows = db.all('risk_assessment');
  const scope = scopedProyek(ctx.user);
  if (scope) rows = rows.filter((r) => r.id_proyek === scope);
  if (query.proyek_id) rows = rows.filter((r) => r.id_proyek === query.proyek_id);
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.level) rows = rows.filter((r) => r.level_risiko === query.level);
  rows.sort((a, b) => (a.tanggal_assessment < b.tanggal_assessment ? 1 : -1));
  const withProyek = rows.map((r) => ({ ...r, nama_proyek: (db.findById('proyek', 'id_proyek', r.id_proyek) || {}).nama_proyek }));
  sendJson(res, 200, { data: withProyek });
}

async function getRA(req, res, ctx, body, query, params) {
  const ra = db.findById('risk_assessment', 'id_assessment', params.id);
  if (!ra) return sendError(res, 404, 'Data tidak ditemukan.');
  const scope = scopedProyek(ctx.user);
  if (scope && ra.id_proyek !== scope) return sendError(res, 403, 'Akses ditolak.');
  const approvals = db.all('approval').filter((a) => a.tipe_referensi === 'Risk Assessment' && a.id_referensi === ra.id_assessment);
  sendJson(res, 200, { data: ra, approvals });
}

// pengajuan + skor & klasifikasi otomatis + cascade approval
async function createRA(req, res, ctx, body) {
  if (!['Admin HSE', 'Staf Lapangan', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const { id_proyek, aktivitas_kerja, bahaya_teridentifikasi, likelihood, severity, rencana_mitigasi } = body;
  const p = db.findById('proyek', 'id_proyek', id_proyek);
  if (!p) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (ctx.user.peran === 'Staf Lapangan' && ctx.user.id_proyek !== id_proyek) return sendError(res, 403, 'Akses ditolak.');
  if (!aktivitas_kerja || !bahaya_teridentifikasi || !likelihood || !severity || !rencana_mitigasi) {
    return sendError(res, 400, 'Semua field wajib diisi (aktivitas_kerja, bahaya_teridentifikasi, likelihood, severity, rencana_mitigasi).');
  }
  if (likelihood < 1 || likelihood > 5 || severity < 1 || severity > 5) {
    return sendError(res, 400, 'Likelihood dan severity harus bernilai 1-5.');
  }
  const { skor_risiko, level_risiko } = computeRiskLevel(likelihood, severity);
  const needsApproval = level_risiko === 'Tinggi' || level_risiko === 'Kritis';
  const ra = {
    id_assessment: genId('RA'), id_proyek, aktivitas_kerja, bahaya_teridentifikasi,
    likelihood: Number(likelihood), severity: Number(severity), skor_risiko, level_risiko,
    rencana_mitigasi, assessor: ctx.user.id_user, tanggal_assessment: todayISO(),
    status: needsApproval ? 'Menunggu Approval' : 'Disetujui',
  };
  db.insert('risk_assessment', ra);

  if (needsApproval) {
    // Tinggi -> min 1 approver; Kritis -> 2 approver berjenjang (level 2 dibuat setelah level 1 disetujui)
    const approvers = db.all('users').filter((u) => u.peran === 'Approver' && u.status_akun === 'Aktif');
    const approver1 = approvers[0];
    db.insert('approval', {
      id_approval: genId('APR'), tipe_referensi: 'Risk Assessment', id_referensi: ra.id_assessment,
      level_approval: 1, approver: approver1 ? approver1.id_user : null, status: 'Menunggu',
      tanggal_submit: nowISO(), tanggal_keputusan: null, catatan_keputusan: null,
    });
  } else {
    refreshProyekRiskLevel(id_proyek);
  }
  logAudit(ctx.user, `Pengajuan risk assessment baru (${level_risiko})`, p.nama_proyek);
  if (ctx.user.peran === 'Staf Lapangan') {
    notify('Admin HSE', 'risk_assessment', 'Pengajuan risk assessment baru', `Proyek "${p.nama_proyek}" mengajukan penilaian risiko untuk "${aktivitas_kerja}" (estimasi level ${level_risiko}).`, ra.id_assessment);
  }
  sendJson(res, 201, { data: ra });
}

module.exports = { listRA, getRA, createRA };
