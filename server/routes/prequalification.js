// prequalification.js — nama file dipertahankan, tapi modul ini sekarang
// adalah "Pre Job Assessment" (PJA): tahap 1 dari alur inti CSMS. Setiap
// proyek butuh PJA berstatus Approved sebelum bisa masuk tahap Work In
// Progress Assessment.
const db = require('../db');
const { sendJson, sendError, genId, todayISO, nowISO, computeRiskLevel, saveAttachments } = require('../utils');
const { logAudit } = require('../auth');
const { notify } = require('../notifications');
const { UPLOAD_DIR } = require('../config');

function scopedProyek(user) {
  return user.peran === 'PIC' ? user.id_proyek : null;
}

function complianceFromChecklist(items) {
  if (!items || items.length === 0) return 0;
  const terpenuhi = items.filter((i) => i.terpenuhi).length;
  return Math.round((terpenuhi / items.length) * 1000) / 10;
}

async function listPQ(req, res, ctx, body, query) {
  let rows = db.all('pja');
  const scope = scopedProyek(ctx.user);
  if (scope) rows = rows.filter((c) => c.id_proyek === scope);
  if (query.proyek_id) rows = rows.filter((c) => c.id_proyek === query.proyek_id);
  rows.sort((a, b) => (a.tanggal_submit < b.tanggal_submit ? 1 : -1));
  const withProyek = rows.map((c) => ({ ...c, nama_proyek: (db.findById('proyek', 'id_proyek', c.id_proyek) || {}).nama_proyek }));
  sendJson(res, 200, { data: withProyek });
}

async function getPQ(req, res, ctx, body, query, params) {
  const pja = db.findById('pja', 'id_pja', params.id);
  if (!pja) return sendError(res, 404, 'Data tidak ditemukan.');
  const scope = scopedProyek(ctx.user);
  if (scope && pja.id_proyek !== scope) return sendError(res, 403, 'Akses ditolak.');
  sendJson(res, 200, { data: pja });
}

// Ajukan (atau ajukan ulang setelah Rework) Pre Job Assessment untuk sebuah proyek.
async function createPQ(req, res, ctx, body) {
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const { id_proyek, checklist, likelihood, severity, catatan_pengaju, lampiran } = body;
  const p = db.findById('proyek', 'id_proyek', id_proyek);
  if (!p) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== id_proyek) return sendError(res, 403, 'Akses ditolak.');
  if (!Array.isArray(checklist) || checklist.length === 0) return sendError(res, 400, 'Checklist PJA wajib diisi.');
  if (!likelihood || !severity) return sendError(res, 400, 'Estimasi likelihood dan severity wajib diisi.');

  const { skor_risiko, level_risiko } = computeRiskLevel(likelihood, severity);
  const compliance = complianceFromChecklist(checklist);
  const prev = db.all('pja').find((x) => x.id_proyek === id_proyek);
  let savedLampiran;
  try {
    savedLampiran = saveAttachments(lampiran, UPLOAD_DIR);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const record = {
    id_pja: prev ? prev.id_pja : genId('PJA'), id_proyek, checklist,
    likelihood: Number(likelihood), severity: Number(severity), skor_risiko, level_risiko,
    compliance_percent: compliance, lampiran: savedLampiran, catatan_pengaju: catatan_pengaju || '',
    pengaju: ctx.user.id_user, tanggal_submit: todayISO(),
    status: 'Menunggu Review', reviewer: null, catatan_review: null, tanggal_review: null,
  };

  if (prev) {
    if (prev.status === 'Approved') return sendError(res, 400, 'PJA proyek ini sudah Approved dan tidak dapat diajukan ulang.');
    db.updateById('pja', 'id_pja', prev.id_pja, record);
  } else {
    db.insert('pja', record);
  }

  // buat/ganti record approval yang menunggu
  const existingApr = db.all('approval').find((a) => a.tipe_referensi === 'PJA' && a.id_referensi === record.id_pja && a.status === 'Menunggu');
  if (!existingApr) {
    const reviewers = db.all('users').filter((u) => u.peran === 'Reviewer' && u.status_akun === 'Aktif');
    db.insert('approval', {
      id_approval: genId('APR'), tipe_referensi: 'PJA', id_referensi: record.id_pja,
      level_approval: 1, approver: reviewers[0] ? reviewers[0].id_user : null, status: 'Menunggu',
      tanggal_submit: nowISO(), tanggal_keputusan: null, catatan_keputusan: null,
    });
  }

  logAudit(ctx.user, `Pengajuan Pre Job Assessment (level risiko ${level_risiko})`, p.nama_proyek);
  if (ctx.user.peran === 'PIC') {
    notify('Reviewer', 'approval', 'PJA menunggu review', `Proyek "${p.nama_proyek}" mengajukan Pre Job Assessment untuk direview.`, record.id_pja);
  }
  sendJson(res, 201, { data: db.findById('pja', 'id_pja', record.id_pja) });
}

module.exports = { listPQ, createPQ, getPQ };
