// evaluasi.js — nama file dipertahankan, tapi modul ini sekarang adalah
// "Final Evaluation": tahap 3 (terakhir) dari alur inti CSMS. Hanya proyek
// dengan WIP Assessment terakhir berstatus Approved yang dapat mengajukan
// Final Evaluation.
const db = require('../db');
const { sendJson, sendError, genId, todayISO, nowISO, saveAttachments } = require('../utils');
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

async function listEval(req, res, ctx, body, query) {
  let rows = db.all('final_evaluation');
  const scope = scopedProyek(ctx.user);
  if (scope) rows = rows.filter((e) => e.id_proyek === scope);
  if (query.proyek_id) rows = rows.filter((e) => e.id_proyek === query.proyek_id);
  rows.sort((a, b) => (a.tanggal_submit < b.tanggal_submit ? 1 : -1));
  const withProyek = rows.map((e) => ({ ...e, nama_proyek: (db.findById('proyek', 'id_proyek', e.id_proyek) || {}).nama_proyek }));
  sendJson(res, 200, { data: withProyek });
}

async function createEval(req, res, ctx, body) {
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const { id_proyek, checklist, catatan_pengaju, lampiran } = body;
  const p = db.findById('proyek', 'id_proyek', id_proyek);
  if (!p) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== id_proyek) return sendError(res, 403, 'Akses ditolak.');
  const wipList = db.all('wip').filter((w) => w.id_proyek === id_proyek).sort((a, b) => (a.tanggal_submit < b.tanggal_submit ? 1 : -1));
  if (wipList.length === 0 || wipList[0].status !== 'Approved') {
    return sendError(res, 400, 'Proyek harus memiliki WIP Assessment terakhir berstatus Approved sebelum Final Evaluation dapat diajukan.');
  }
  if (!Array.isArray(checklist) || checklist.length === 0) return sendError(res, 400, 'Checklist Final Evaluation wajib diisi.');

  const prev = db.all('final_evaluation').find((x) => x.id_proyek === id_proyek);
  if (prev && prev.status === 'Approved') return sendError(res, 400, 'Final Evaluation proyek ini sudah Approved.');

  let savedLampiran;
  try {
    savedLampiran = saveAttachments(lampiran, UPLOAD_DIR);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const record = {
    id_final: prev ? prev.id_final : genId('FIN'), id_proyek, checklist,
    compliance_percent: complianceFromChecklist(checklist), lampiran: savedLampiran,
    catatan_pengaju: catatan_pengaju || '', pengaju: ctx.user.id_user, tanggal_submit: todayISO(),
    status: 'Menunggu Review', reviewer: null, catatan_review: null, tanggal_review: null,
  };
  if (prev) db.updateById('final_evaluation', 'id_final', prev.id_final, record);
  else db.insert('final_evaluation', record);

  const existingApr = db.all('approval').find((a) => a.tipe_referensi === 'Final Evaluation' && a.id_referensi === record.id_final && a.status === 'Menunggu');
  if (!existingApr) {
    const reviewers = db.all('users').filter((u) => u.peran === 'Reviewer' && u.status_akun === 'Aktif');
    db.insert('approval', {
      id_approval: genId('APR'), tipe_referensi: 'Final Evaluation', id_referensi: record.id_final,
      level_approval: 1, approver: reviewers[0] ? reviewers[0].id_user : null, status: 'Menunggu',
      tanggal_submit: nowISO(), tanggal_keputusan: null, catatan_keputusan: null,
    });
  }

  logAudit(ctx.user, 'Pengajuan Final Evaluation', p.nama_proyek);
  if (ctx.user.peran === 'PIC') {
    notify('Reviewer', 'approval', 'Final Evaluation menunggu review', `Proyek "${p.nama_proyek}" mengajukan Final Evaluation untuk direview.`, record.id_final);
  }
  sendJson(res, 201, { data: db.findById('final_evaluation', 'id_final', record.id_final) });
}

module.exports = { listEval, createEval };
