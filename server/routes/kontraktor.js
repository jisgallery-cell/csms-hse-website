// kontraktor.js — nama file dipertahankan agar path import tidak berubah,
// tapi modul ini sekarang berisi rute "Proyek": data proyek internal PT
// Expro (Yard Cibitung), pintu masuk ke alur Pre Job Assessment -> Work In
// Progress Assessment -> Final Evaluation.
const db = require('../db');
const { sendJson, sendError, genId } = require('../utils');
const { logAudit } = require('../auth');
const { notify } = require('../notifications');

function scoped(user, list) {
  if (user.peran === 'PIC') return list.filter((p) => p.id_proyek === user.id_proyek);
  return list;
}

function enrichStatusTahap(p) {
  const pja = db.all('pja').find((x) => x.id_proyek === p.id_proyek);
  const wipList = db.all('wip').filter((x) => x.id_proyek === p.id_proyek).sort((a, b) => (a.tanggal_submit < b.tanggal_submit ? 1 : -1));
  const finalEval = db.all('final_evaluation').find((x) => x.id_proyek === p.id_proyek);
  return {
    ...p,
    pja_status: pja ? pja.status : 'Belum Diajukan',
    wip_count: wipList.length,
    wip_terakhir_status: wipList[0] ? wipList[0].status : 'Belum Ada',
    final_status: finalEval ? finalEval.status : 'Belum Diajukan',
  };
}

async function listProyek(req, res, ctx, body, query) {
  let rows = scoped(ctx.user, db.all('proyek'));
  if (query.q) {
    const q = query.q.toLowerCase();
    rows = rows.filter((p) => p.nama_proyek.toLowerCase().includes(q) || p.nama_client.toLowerCase().includes(q));
  }
  if (query.status) rows = rows.filter((p) => p.status_proyek === query.status);
  if (query.risiko) rows = rows.filter((p) => p.tingkat_risiko_terkini === query.risiko);
  rows = rows.map(enrichStatusTahap);
  sendJson(res, 200, { data: rows });
}

async function getProyek(req, res, ctx, body, query, params) {
  const p = db.findById('proyek', 'id_proyek', params.id);
  if (!p) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== p.id_proyek) {
    return sendError(res, 403, 'Akses ditolak.');
  }
  const pja = db.all('pja').find((x) => x.id_proyek === p.id_proyek) || null;
  const wipList = db.all('wip').filter((x) => x.id_proyek === p.id_proyek).sort((a, b) => (a.tanggal_submit < b.tanggal_submit ? 1 : -1));
  const finalEval = db.all('final_evaluation').find((x) => x.id_proyek === p.id_proyek) || null;
  // Riwayat dokumen: gabungan lampiran dari PJA, tiap WIP, dan Final Evaluation
  const riwayat_dokumen = [];
  if (pja) (pja.lampiran || []).forEach((f) => riwayat_dokumen.push({ ...f, sumber: 'Pre Job Assessment', tanggal: pja.tanggal_submit }));
  wipList.forEach((w) => (w.lampiran || []).forEach((f) => riwayat_dokumen.push({ ...f, sumber: `Work In Progress (${w.tanggal_assessment})`, tanggal: w.tanggal_submit })));
  if (finalEval) (finalEval.lampiran || []).forEach((f) => riwayat_dokumen.push({ ...f, sumber: 'Final Evaluation', tanggal: finalEval.tanggal_submit }));
  sendJson(res, 200, { data: enrichStatusTahap(p), pja, wip_list: wipList, final_evaluation: finalEval, riwayat_dokumen });
}

// Admin HSE/Admin Sistem membuat entri proyek baru di Yard Cibitung.
async function createProyek(req, res, ctx, body) {
  if (!['Admin HSE', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const required = ['nama_proyek', 'nama_client', 'area', 'jenis_pekerjaan', 'pic_nama', 'kontak_pic', 'tanggal_mulai'];
  for (const f of required) {
    if (!body[f]) return sendError(res, 400, `Field "${f}" wajib diisi.`);
  }
  const p = {
    id_proyek: genId('PRY'),
    nama_proyek: body.nama_proyek,
    nama_client: body.nama_client,
    area: body.area,
    lokasi_detail: body.lokasi_detail || '',
    kontraktor_vendor: body.kontraktor_vendor || '',
    jenis_pekerjaan: body.jenis_pekerjaan,
    pic_nama: body.pic_nama,
    kontak_pic: body.kontak_pic,
    tanggal_mulai: body.tanggal_mulai,
    tanggal_selesai_rencana: body.tanggal_selesai_rencana || null,
    status_proyek: 'Aktif',
    tingkat_risiko_terkini: null,
    catatan: body.catatan || '',
  };
  db.insert('proyek', p);
  logAudit(ctx.user, 'Proyek baru dibuat', p.nama_proyek);
  notify('Admin HSE', 'sistem', 'Proyek baru dibuat', `Proyek "${p.nama_proyek}" di ${p.area} (client: ${p.nama_client}) telah dibuat — menunggu Pre Job Assessment.`, p.id_proyek);
  sendJson(res, 201, { data: p });
}

async function updateProyek(req, res, ctx, body, query, params) {
  const p = db.findById('proyek', 'id_proyek', params.id);
  if (!p) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== p.id_proyek) {
    return sendError(res, 403, 'Akses ditolak.');
  }
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const allowed = ['nama_proyek', 'nama_client', 'area', 'lokasi_detail', 'kontraktor_vendor', 'jenis_pekerjaan', 'pic_nama', 'kontak_pic', 'tanggal_selesai_rencana', 'status_proyek', 'catatan'];
  const patch = {};
  allowed.forEach((f) => { if (body[f] !== undefined) patch[f] = body[f]; });
  if (ctx.user.peran === 'PIC') delete patch.status_proyek; // hanya Admin yang boleh ubah status proyek
  if (patch.status_proyek && !['Aktif', 'Selesai', 'Ditunda'].includes(patch.status_proyek)) {
    return sendError(res, 400, 'status_proyek tidak valid.');
  }
  const updated = db.updateById('proyek', 'id_proyek', params.id, patch);
  logAudit(ctx.user, 'Perbarui data proyek', p.nama_proyek);
  sendJson(res, 200, { data: updated });
}

module.exports = { listProyek, getProyek, createProyek, updateProyek };
