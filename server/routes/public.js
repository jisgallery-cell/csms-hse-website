// public.js — endpoint publik TANPA LOGIN untuk "Sistem Barcode Daily Safety
// Finding": tiap proyek punya QR/link unik (lihat halaman publik di
// public/report.html), pekerja cukup memasukkan Employee ID lalu memilih
// "Lapor Temuan" atau "Tidak Ada Temuan Hari Ini" — tanpa akun.
// Hanya data non-sensitif yang boleh dikembalikan lewat modul ini.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { sendJson, sendError, genId, todayISO, nowISO } = require('../utils');
const { notify } = require('../notifications');
const { UPLOAD_DIR } = require('../config');

// Info minimal proyek untuk landing halaman publik — tanpa data sensitif.
async function getProyekPublic(req, res, ctx, body, query, params) {
  const p = db.findById('proyek', 'id_proyek', params.id);
  if (!p || p.status_proyek !== 'Aktif') return sendError(res, 404, 'Proyek tidak ditemukan atau sudah tidak aktif.');
  sendJson(res, 200, { data: { id_proyek: p.id_proyek, nama_proyek: p.nama_proyek, area: p.area } });
}

// Daftar proyek aktif (id + nama saja) untuk halaman /report generik (tanpa
// kode proyek di URL) — dipakai saat pekerja masuk lewat tombol "Lapor Temuan
// Safety" di halaman login, bukan lewat QR proyek tertentu.
async function listProyekPublic(req, res, ctx) {
  const rows = db.all('proyek').filter((p) => p.status_proyek === 'Aktif')
    .map((p) => ({ id_proyek: p.id_proyek, nama_proyek: p.nama_proyek, area: p.area }));
  sendJson(res, 200, { data: rows });
}

// Cocokkan Employee ID ke roster MCU proyek tsb agar nama otomatis tampil.
// Tetap boleh lanjut walau tidak ditemukan (misal subkontraktor/pekerja baru).
async function lookupPekerja(req, res, ctx, body, query) {
  const { id_proyek, employee_id } = query;
  if (!id_proyek || !employee_id) return sendError(res, 400, 'id_proyek dan employee_id wajib diisi.');
  const match = db.all('pekerja_mcu')
    .filter((m) => m.id_proyek === id_proyek && m.no_identitas && m.no_identitas.toLowerCase() === String(employee_id).toLowerCase())
    .sort((a, b) => (a.tanggal_mcu < b.tanggal_mcu ? 1 : -1))[0];
  if (!match) return sendJson(res, 200, { found: false });
  sendJson(res, 200, { found: true, nama: match.nama });
}

// Daftar kategori temuan (dipakai juga di WIP) — aman diekspos publik.
async function getKategoriTemuan(req, res, ctx) {
  const dbi = db.ensureLoaded();
  sendJson(res, 200, { data: dbi.master_kategori_temuan || [] });
}

// Submit dari halaman barcode: "Aman" (check-in kepatuhan harian) atau
// "Temuan" (masuk ke tabel Temuan yang sama dipakai WIP, ditandai sumber Barcode).
async function submitCheckin(req, res, ctx, body) {
  const { id_proyek, employee_id, employee_nama, tipe } = body;
  const p = db.findById('proyek', 'id_proyek', id_proyek);
  if (!p) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (!employee_id) return sendError(res, 400, 'Employee ID wajib diisi.');
  if (!['Aman', 'Temuan'].includes(tipe)) return sendError(res, 400, 'Tipe laporan tidak valid.');

  if (tipe === 'Aman') {
    const entry = {
      id_checkin: genId('CHK'), id_proyek, employee_id, employee_nama: employee_nama || '',
      tipe: 'Aman', waktu: nowISO(),
    };
    db.insert('daily_checkin', entry);
    return sendJson(res, 201, { ok: true, reference: entry.id_checkin });
  }

  // tipe === 'Temuan'
  const { kategori_temuan, deskripsi_temuan, lokasi, file_name, file_base64 } = body;
  if (!kategori_temuan || !deskripsi_temuan) return sendError(res, 400, 'Kategori dan deskripsi temuan wajib diisi.');

  let fotoPath = null;
  if (file_base64 && file_name) {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}-barcode-${String(file_name).replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const buf = Buffer.from(String(file_base64).split(',').pop(), 'base64');
    if (buf.length > 5 * 1024 * 1024) return sendError(res, 400, 'Ukuran foto maksimum 5MB.');
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buf);
    fotoPath = `/uploads/${safeName}`;
  }

  const cfg = db.ensureLoaded().system_config;
  const tanggal_temuan = todayISO();
  const d = new Date(tanggal_temuan);
  d.setDate(d.getDate() + (cfg.ca_deadline_default_hari || 14));
  const tenggat = d.toISOString().slice(0, 10);

  const ca = {
    id_ca: genId('CA'), id_proyek, id_wip: null, kategori_temuan,
    deskripsi_temuan: lokasi ? `[${lokasi}] ${deskripsi_temuan}` : deskripsi_temuan,
    tingkat_urgensi: 'Sedang', // menunggu triase Admin HSE
    pic_tindak_lanjut: 'Belum ditentukan', tanggal_temuan, tenggat_waktu: tenggat,
    status: 'Open', bukti_penyelesaian: null, foto_temuan: fotoPath,
    sumber: 'Barcode', pelapor_employee_id: employee_id, pelapor_nama: employee_nama || '',
  };
  db.insert('corrective_action', ca);
  notify('Admin HSE', 'tindakan_korektif', `Temuan baru via Barcode: ${kategori_temuan}`,
    `Proyek "${p.nama_proyek}": ${deskripsi_temuan} (dilaporkan oleh Employee ID ${employee_id}${employee_nama ? ' — ' + employee_nama : ''}).`, ca.id_ca, id_proyek);
  sendJson(res, 201, { ok: true, reference: ca.id_ca });
}

module.exports = { getProyekPublic, listProyekPublic, lookupPekerja, getKategoriTemuan, submitCheckin };
