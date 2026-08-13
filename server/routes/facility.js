const fs = require('fs');
const path = require('path');
const db = require('../db');
const { sendJson, sendError, genId, todayISO } = require('../utils');
const { logAudit } = require('../auth');
const { notify } = require('../notifications');
const { syncFacilityOverdue } = require('../business');
const { UPLOAD_DIR } = require('../config');

const TINGKAT_RISIKO = ['Rendah', 'Sedang', 'Tinggi'];

// Modul ini internal (bukan milik kontraktor tertentu) — temuan kepatuhan
// fasilitas/workshop milik perusahaan sendiri (SRS tambahan, bukan modul kontraktor).

function saveOneFile(file_name, file_base64) {
  if (!file_base64 || !file_name) return null;
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const safeName = `${Date.now()}-${String(file_name).replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  const buf = Buffer.from(String(file_base64).split(',').pop(), 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new Error('Ukuran file maksimum 5MB.');
  fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buf);
  return `/uploads/${safeName}`;
}

async function listFinding(req, res, ctx, body, query) {
  syncFacilityOverdue();
  let rows = db.all('facility_finding');
  if (query.status) rows = rows.filter((f) => f.status === query.status);
  if (query.lokasi) rows = rows.filter((f) => f.lokasi_fasilitas === query.lokasi);
  if (query.tingkat_risiko) rows = rows.filter((f) => f.tingkat_risiko === query.tingkat_risiko);
  rows.sort((a, b) => (a.tanggal_lapor < b.tanggal_lapor ? 1 : -1));
  const masterFasilitas = db.ensureLoaded().master_fasilitas || [];
  sendJson(res, 200, { data: rows, master_fasilitas: masterFasilitas, tingkat_risiko_options: TINGKAT_RISIKO });
}

async function getFinding(req, res, ctx, body, query, params) {
  const f = db.findById('facility_finding', 'id_finding', params.id);
  if (!f) return sendError(res, 404, 'Temuan tidak ditemukan.');
  sendJson(res, 200, { data: f });
}

// Pelaporan temuan kepatuhan fasilitas/workshop internal — foto "sebelum
// perbaikan" wajib/opsional diunggah di sini; foto "sesudah perbaikan" juga
// boleh langsung dilampirkan di form yang sama kalau perbaikannya sudah
// selesai duluan sebelum sempat dilaporkan (opsional, bisa juga menyusul
// saat menutup temuan lewat updateFinding).
async function createFinding(req, res, ctx, body) {
  const { judul_temuan, deskripsi_temuan, lokasi_fasilitas, tingkat_risiko, penanggung_jawab, tenggat_waktu, file_name, file_base64, file_name_sesudah, file_base64_sesudah } = body;
  if (!judul_temuan || !deskripsi_temuan || !lokasi_fasilitas || !tingkat_risiko || !penanggung_jawab || !tenggat_waktu) {
    return sendError(res, 400, 'Semua field wajib diisi.');
  }
  if (!TINGKAT_RISIKO.includes(tingkat_risiko)) return sendError(res, 400, 'Tingkat risiko tidak valid.');
  if (tenggat_waktu < todayISO()) return sendError(res, 400, 'Tenggat waktu tidak boleh di masa lalu.');

  let fotoSebelum, fotoSesudah;
  try {
    fotoSebelum = saveOneFile(file_name, file_base64);
    fotoSesudah = saveOneFile(file_name_sesudah, file_base64_sesudah);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const f = {
    id_finding: genId('FAC'), judul_temuan, deskripsi_temuan, lokasi_fasilitas, tingkat_risiko,
    penanggung_jawab, tenggat_waktu, status: 'Open', foto_sebelum: fotoSebelum, foto_sesudah: fotoSesudah, catatan_penutupan: '',
    dilaporkan_oleh: ctx.user.id_user, tanggal_lapor: todayISO(),
  };
  db.insert('facility_finding', f);
  logAudit(ctx.user, `Temuan fasilitas baru: ${judul_temuan} (${lokasi_fasilitas})`, lokasi_fasilitas);
  notify('Admin HSE', 'facility', 'Temuan kepatuhan fasilitas baru', `${judul_temuan} di ${lokasi_fasilitas} (risiko ${tingkat_risiko}), tenggat ${tenggat_waktu}.`, f.id_finding);
  if (tingkat_risiko === 'Tinggi') {
    notify('Manajemen', 'facility', 'Temuan fasilitas risiko Tinggi', `${judul_temuan} di ${lokasi_fasilitas} memerlukan perhatian segera (tenggat ${tenggat_waktu}).`, f.id_finding);
  }
  sendJson(res, 201, { data: f });
}

// Perbarui status temuan — foto "sesudah perbaikan" diunggah saat menutup
// (atau kapan saja proses perbaikan berjalan) sebagai bukti hasil perbaikan.
async function updateFinding(req, res, ctx, body, query, params) {
  const f = db.findById('facility_finding', 'id_finding', params.id);
  if (!f) return sendError(res, 404, 'Temuan tidak ditemukan.');
  const { status, catatan_penutupan, file_name_sesudah, file_base64_sesudah } = body;
  if (!status || !['Open', 'In Progress', 'Closed', 'Overdue'].includes(status)) {
    return sendError(res, 400, 'Status tidak valid.');
  }

  let fotoSesudah;
  try {
    fotoSesudah = saveOneFile(file_name_sesudah, file_base64_sesudah);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  if (status === 'Closed' && !catatan_penutupan) {
    return sendError(res, 400, 'Catatan penutupan wajib diisi saat menutup temuan.');
  }
  if (status === 'Closed' && !fotoSesudah && !f.foto_sesudah) {
    return sendError(res, 400, 'Foto sesudah perbaikan wajib diunggah saat menutup temuan.');
  }

  const patch = { status };
  if (catatan_penutupan !== undefined) patch.catatan_penutupan = catatan_penutupan;
  if (fotoSesudah) patch.foto_sesudah = fotoSesudah;
  const updated = db.updateById('facility_finding', 'id_finding', f.id_finding, patch);
  logAudit(ctx.user, `Perbarui status temuan fasilitas -> ${status}`, f.judul_temuan);
  sendJson(res, 200, { data: updated });
}

module.exports = { listFinding, getFinding, createFinding, updateFinding, TINGKAT_RISIKO };
