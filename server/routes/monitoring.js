// monitoring.js — nama file dipertahankan, tapi modul ini sekarang adalah
// "Work In Progress Assessment" (WIP): tahap 2 dari alur inti CSMS,
// mencakup checklist kondisi lapangan (termasuk item Izin Kerja/PTW, hasil
// MCU pekerja, dan kepatuhan fasilitas) serta pencatatan temuan & tindakan
// korektif (corrective action). Hanya proyek dengan PJA Approved yang bisa
// membuat WIP baru.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { sendJson, sendError, genId, todayISO, nowISO, saveAttachments } = require('../utils');
const { logAudit } = require('../auth');
const { syncOverdueCorrectiveActions } = require('../business');
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

// --- Work In Progress Assessment ---

async function listWIP(req, res, ctx, body, query) {
  let rows = db.all('wip');
  const scope = scopedProyek(ctx.user);
  if (scope) rows = rows.filter((w) => w.id_proyek === scope);
  if (query.proyek_id) rows = rows.filter((w) => w.id_proyek === query.proyek_id);
  if (query.status) rows = rows.filter((w) => w.status === query.status);
  rows.sort((a, b) => (a.tanggal_submit < b.tanggal_submit ? 1 : -1));
  const withProyek = rows.map((w) => ({ ...w, nama_proyek: (db.findById('proyek', 'id_proyek', w.id_proyek) || {}).nama_proyek }));
  sendJson(res, 200, { data: withProyek });
}

async function getWIP(req, res, ctx, body, query, params) {
  const w = db.findById('wip', 'id_wip', params.id);
  if (!w) return sendError(res, 404, 'WIP Assessment tidak ditemukan.');
  const scope = scopedProyek(ctx.user);
  if (scope && w.id_proyek !== scope) return sendError(res, 403, 'Akses ditolak.');
  const temuan = db.all('corrective_action').filter((c) => c.id_wip === w.id_wip);
  sendJson(res, 200, { data: w, temuan });
}

async function createWIP(req, res, ctx, body) {
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const { id_proyek, checklist, catatan_pengaju, lampiran } = body;
  const p = db.findById('proyek', 'id_proyek', id_proyek);
  if (!p) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== id_proyek) return sendError(res, 403, 'Akses ditolak.');
  const pja = db.all('pja').find((x) => x.id_proyek === id_proyek);
  if (!pja || pja.status !== 'Approved') {
    return sendError(res, 400, 'Proyek harus memiliki Pre Job Assessment berstatus Approved sebelum WIP Assessment dapat diajukan.');
  }
  if (!Array.isArray(checklist) || checklist.length === 0) return sendError(res, 400, 'Checklist WIP wajib diisi.');
  let savedLampiran;
  try {
    savedLampiran = saveAttachments(lampiran, UPLOAD_DIR);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const w = {
    id_wip: genId('WIP'), id_proyek, tanggal_assessment: todayISO(),
    checklist, compliance_percent: complianceFromChecklist(checklist),
    lampiran: savedLampiran, catatan_pengaju: catatan_pengaju || '',
    pengaju: ctx.user.id_user, tanggal_submit: todayISO(),
    status: 'Menunggu Review', reviewer: null, catatan_review: null, tanggal_review: null,
  };
  db.insert('wip', w);

  const reviewers = db.all('users').filter((u) => u.peran === 'Reviewer' && u.status_akun === 'Aktif');
  db.insert('approval', {
    id_approval: genId('APR'), tipe_referensi: 'WIP', id_referensi: w.id_wip,
    level_approval: 1, approver: reviewers[0] ? reviewers[0].id_user : null, status: 'Menunggu',
    tanggal_submit: nowISO(), tanggal_keputusan: null, catatan_keputusan: null,
  });

  logAudit(ctx.user, 'Pengajuan Work In Progress Assessment', p.nama_proyek);
  if (ctx.user.peran === 'PIC') {
    notify('Reviewer', 'approval', 'WIP Assessment menunggu review', `Proyek "${p.nama_proyek}" mengajukan WIP Assessment untuk direview.`, w.id_wip);
  }
  sendJson(res, 201, { data: w });
}

// --- Temuan & Tindakan Korektif (bagian 2.3, tertaut ke WIP) ---

async function listCA(req, res, ctx, body, query) {
  syncOverdueCorrectiveActions();
  let rows = db.all('corrective_action');
  const scope = scopedProyek(ctx.user);
  if (scope) rows = rows.filter((c) => c.id_proyek === scope);
  if (query.proyek_id) rows = rows.filter((c) => c.id_proyek === query.proyek_id);
  if (query.wip_id) rows = rows.filter((c) => c.id_wip === query.wip_id);
  if (query.status) rows = rows.filter((c) => c.status === query.status);
  rows.sort((a, b) => (a.tenggat_waktu < b.tenggat_waktu ? -1 : 1));
  const withProyek = rows.map((c) => ({ ...c, nama_proyek: (db.findById('proyek', 'id_proyek', c.id_proyek) || {}).nama_proyek }));
  sendJson(res, 200, { data: withProyek });
}

async function createCA(req, res, ctx, body) {
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const { id_proyek, id_wip, kategori_temuan, deskripsi_temuan, tingkat_urgensi, pic_tindak_lanjut, tenggat_waktu } = body;
  const p = db.findById('proyek', 'id_proyek', id_proyek);
  if (!p) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (!kategori_temuan || !deskripsi_temuan || !tingkat_urgensi || !pic_tindak_lanjut) {
    return sendError(res, 400, 'Semua field wajib diisi.');
  }
  const config = db.ensureLoaded().system_config;
  const deadlineDays = tingkat_urgensi === 'Tinggi' ? config.ca_deadline_tinggi_hari : config.ca_deadline_default_hari;
  const tanggal_temuan = todayISO();
  let tenggat = tenggat_waktu;
  if (!tenggat) {
    const d = new Date(tanggal_temuan);
    d.setDate(d.getDate() + deadlineDays);
    tenggat = d.toISOString().slice(0, 10);
  }
  const ca = {
    id_ca: genId('CA'), id_proyek, id_wip: id_wip || null, kategori_temuan, deskripsi_temuan, tingkat_urgensi,
    pic_tindak_lanjut, tanggal_temuan, tenggat_waktu: tenggat, status: 'Open', bukti_penyelesaian: null,
  };
  db.insert('corrective_action', ca);
  logAudit(ctx.user, `Temuan baru (${tingkat_urgensi}): ${kategori_temuan}`, p.nama_proyek);
  notify('Admin HSE', 'tindakan_korektif', `Temuan baru: ${kategori_temuan}`, `Proyek "${p.nama_proyek}": ${deskripsi_temuan}`, ca.id_ca);
  sendJson(res, 201, { data: ca });
}

async function updateCA(req, res, ctx, body, query, params) {
  const ca = db.findById('corrective_action', 'id_ca', params.id);
  if (!ca) return sendError(res, 404, 'Data tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== ca.id_proyek) return sendError(res, 403, 'Akses ditolak.');
  const { status, file_name, file_base64 } = body;
  const patch = {};
  if (status) {
    if (!['Open', 'In Progress', 'Closed'].includes(status)) return sendError(res, 400, 'Status tidak valid.');
    if (status === 'Closed' && !ca.bukti_penyelesaian && !file_base64) {
      return sendError(res, 400, 'Bukti penyelesaian wajib diunggah untuk menutup temuan.');
    }
    patch.status = status;
  }
  if (file_base64 && file_name) {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}-${file_name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), Buffer.from(file_base64.split(',').pop(), 'base64'));
    patch.bukti_penyelesaian = `/uploads/${safeName}`;
  }
  const updated = db.updateById('corrective_action', 'id_ca', params.id, patch);
  const p = db.findById('proyek', 'id_proyek', ca.id_proyek);
  logAudit(ctx.user, `Update tindakan korektif -> ${patch.status || ca.status}`, p ? p.nama_proyek : ca.id_proyek);
  if (ctx.user.peran === 'PIC' && patch.status) {
    notify('Admin HSE', 'tindakan_korektif', `Update tindakan korektif: ${patch.status}`, `Proyek "${p ? p.nama_proyek : ca.id_proyek}" memperbarui status temuan "${ca.kategori_temuan}" menjadi ${patch.status}.`, ca.id_ca);
  }
  sendJson(res, 200, { data: updated });
}

module.exports = { listWIP, getWIP, createWIP, listCA, createCA, updateCA };
