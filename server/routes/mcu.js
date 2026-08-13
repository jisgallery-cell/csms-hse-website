// mcu.js — Roster Medical Checkup (MCU) pekerja per proyek: nama, hasil, dan
// masa berlaku, dengan reminder 3 tahap (90/60/30 hari, lihat business.js
// syncMcuReminders) sebelum kedaluwarsa. Kolom email & no_wa disiapkan
// sekarang untuk pengiriman reminder eksternal di fase berikutnya — belum
// benar-benar mengirim email/WA.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { sendJson, sendError, genId, todayISO } = require('../utils');
const { logAudit } = require('../auth');
const { syncMcuReminders, mcuTierFor } = require('../business');
const { UPLOAD_DIR } = require('../config');

const HASIL_OPTIONS = ['Fit', 'Fit dengan Catatan', 'Tidak Fit'];

function scopedProyek(user) {
  return user.peran === 'PIC' ? user.id_proyek : null;
}

async function listMCU(req, res, ctx, body, query) {
  syncMcuReminders();
  let rows = db.all('pekerja_mcu');
  const scope = scopedProyek(ctx.user);
  if (scope) rows = rows.filter((m) => m.id_proyek === scope);
  if (query.proyek_id) rows = rows.filter((m) => m.id_proyek === query.proyek_id);
  if (query.hasil) rows = rows.filter((m) => m.hasil === query.hasil);
  if (query.q) {
    const q = query.q.toLowerCase();
    rows = rows.filter((m) => m.nama.toLowerCase().includes(q));
  }
  rows.sort((a, b) => (a.tanggal_berlaku_sampai < b.tanggal_berlaku_sampai ? -1 : 1));
  const today = todayISO();
  const withTier = rows.map((m) => {
    const p = db.findById('proyek', 'id_proyek', m.id_proyek) || {};
    return { ...m, nama_proyek: p.nama_proyek, tier_reminder: mcuTierFor(m, today) };
  });
  sendJson(res, 200, { data: withTier, hasil_options: HASIL_OPTIONS });
}

async function getMCU(req, res, ctx, body, query, params) {
  const m = db.findById('pekerja_mcu', 'id_pekerja_mcu', params.id);
  if (!m) return sendError(res, 404, 'Data MCU tidak ditemukan.');
  const scope = scopedProyek(ctx.user);
  if (scope && m.id_proyek !== scope) return sendError(res, 403, 'Akses ditolak.');
  sendJson(res, 200, { data: m });
}

// Tambah pekerja baru ke roster MCU proyek (oleh Admin HSE dari klinik/mitra,
// atau PIC unggah mandiri).
async function createMCU(req, res, ctx, body) {
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const { id_proyek, nama, no_identitas, email, no_wa, tanggal_mcu, hasil, tanggal_berlaku_sampai, catatan, file_name, file_base64 } = body;
  const p = db.findById('proyek', 'id_proyek', id_proyek);
  if (!p) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== id_proyek) return sendError(res, 403, 'Akses ditolak.');
  if (!nama || !tanggal_mcu || !hasil || !tanggal_berlaku_sampai) {
    return sendError(res, 400, 'Nama, tanggal MCU, hasil, dan tanggal berlaku sampai wajib diisi.');
  }
  if (!HASIL_OPTIONS.includes(hasil)) return sendError(res, 400, 'Hasil MCU tidak valid.');
  if (tanggal_berlaku_sampai < tanggal_mcu) return sendError(res, 400, 'Tanggal berlaku sampai tidak boleh sebelum tanggal MCU.');

  let filePath = null;
  if (file_base64 && file_name) {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}-${file_name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const buf = Buffer.from(file_base64.split(',').pop(), 'base64');
    if (buf.length > 5 * 1024 * 1024) return sendError(res, 400, 'Ukuran file maksimum 5MB.');
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buf);
    filePath = `/uploads/${safeName}`;
  }

  const m = {
    id_pekerja_mcu: genId('MCU'), id_proyek, nama, no_identitas: no_identitas || '',
    email: email || '', no_wa: no_wa || '',
    tanggal_mcu, hasil, tanggal_berlaku_sampai, catatan: catatan || '', file_path: filePath,
    dicatat_oleh: ctx.user.id_user, _mcu_reminder_stage: null,
  };
  db.insert('pekerja_mcu', m);
  logAudit(ctx.user, `Tambah pekerja roster MCU: ${nama} (${hasil})`, p.nama_proyek);
  sendJson(res, 201, { data: m });
}

// Update kontak (email/no_wa) atau hasil MCU pekerja yang sudah ada di roster.
async function updateMCU(req, res, ctx, body, query, params) {
  const m = db.findById('pekerja_mcu', 'id_pekerja_mcu', params.id);
  if (!m) return sendError(res, 404, 'Data MCU tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== m.id_proyek) return sendError(res, 403, 'Akses ditolak.');
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const patch = {};
  ['nama', 'no_identitas', 'email', 'no_wa', 'tanggal_mcu', 'hasil', 'tanggal_berlaku_sampai', 'catatan'].forEach((f) => {
    if (body[f] !== undefined) patch[f] = body[f];
  });
  if (patch.hasil && !HASIL_OPTIONS.includes(patch.hasil)) return sendError(res, 400, 'Hasil MCU tidak valid.');
  if (patch.tanggal_berlaku_sampai) patch._mcu_reminder_stage = null; // reset tahap reminder kalau masa berlaku diperbarui
  const updated = db.updateById('pekerja_mcu', 'id_pekerja_mcu', params.id, patch);
  const p = db.findById('proyek', 'id_proyek', m.id_proyek);
  logAudit(ctx.user, `Perbarui data roster MCU: ${m.nama}`, p ? p.nama_proyek : m.id_proyek);
  sendJson(res, 200, { data: updated });
}

module.exports = { listMCU, getMCU, createMCU, updateMCU, HASIL_OPTIONS };
