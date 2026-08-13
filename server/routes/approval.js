const db = require('../db');
const { sendJson, sendError, genId, nowISO } = require('../utils');
const { logAudit } = require('../auth');
const { notify } = require('../notifications');

function enrich(a) {
  let refLabel = a.id_referensi;
  let proyekNama = '';
  if (a.tipe_referensi === 'PJA') {
    const pja = db.findById('pja', 'id_pja', a.id_referensi);
    if (pja) {
      refLabel = `Pre Job Assessment (risiko ${pja.level_risiko})`;
      proyekNama = (db.findById('proyek', 'id_proyek', pja.id_proyek) || {}).nama_proyek || '';
    }
  } else if (a.tipe_referensi === 'WIP') {
    const w = db.findById('wip', 'id_wip', a.id_referensi);
    if (w) {
      refLabel = `Work In Progress Assessment (${w.tanggal_assessment})`;
      proyekNama = (db.findById('proyek', 'id_proyek', w.id_proyek) || {}).nama_proyek || '';
    }
  } else if (a.tipe_referensi === 'Final Evaluation') {
    const f = db.findById('final_evaluation', 'id_final', a.id_referensi);
    if (f) {
      refLabel = `Final Evaluation (compliance ${f.compliance_percent}%)`;
      proyekNama = (db.findById('proyek', 'id_proyek', f.id_proyek) || {}).nama_proyek || '';
    }
  } else if (a.tipe_referensi === 'PTW') {
    const ptw = db.findById('ptw', 'id_ptw', a.id_referensi);
    if (ptw) {
      refLabel = `PTW ${ptw.ptw_no} (${ptw.jenis_izin})`;
      proyekNama = (db.findById('proyek', 'id_proyek', ptw.id_proyek) || {}).nama_proyek || '';
    }
  }
  const approverUser = db.findById('users', 'id_user', a.approver);
  return { ...a, ref_label: refLabel, proyek_nama: proyekNama, approver_nama: approverUser ? approverUser.nama : '—' };
}

async function listApproval(req, res, ctx, body, query) {
  let rows = db.all('approval');
  if (ctx.user.peran === 'Reviewer') rows = rows.filter((a) => a.approver === ctx.user.id_user);
  if (query.status) rows = rows.filter((a) => a.status === query.status);
  rows.sort((a, b) => (a.tanggal_submit < b.tanggal_submit ? 1 : -1));
  sendJson(res, 200, { data: rows.map(enrich) });
}

// Keputusan Reviewer: Approved atau Rework, untuk PJA / WIP / Final Evaluation.
async function decideApproval(req, res, ctx, body, query, params) {
  if (!['Reviewer', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Hanya Reviewer yang dapat memutuskan approval.');
  const apr = db.findById('approval', 'id_approval', params.id);
  if (!apr) return sendError(res, 404, 'Data approval tidak ditemukan.');
  if (apr.status !== 'Menunggu') return sendError(res, 400, 'Pengajuan ini sudah diputuskan sebelumnya.');
  const { status, catatan } = body;
  if (!['Approved', 'Rework'].includes(status)) return sendError(res, 400, 'status harus Approved atau Rework.');
  if (status === 'Rework' && !catatan) return sendError(res, 400, 'Catatan wajib diisi saat meminta Rework.');

  db.updateById('approval', 'id_approval', apr.id_approval, {
    status, catatan_keputusan: catatan || '', tanggal_keputusan: nowISO(),
  });

  let proyekId = null;
  let proyekNama = '';
  let pengajuId = null;

  if (apr.tipe_referensi === 'PJA') {
    const pja = db.findById('pja', 'id_pja', apr.id_referensi);
    if (pja) {
      db.updateById('pja', 'id_pja', pja.id_pja, { status, reviewer: ctx.user.id_user, catatan_review: catatan || '', tanggal_review: nowISO() });
      if (status === 'Approved') {
        db.updateById('proyek', 'id_proyek', pja.id_proyek, { tingkat_risiko_terkini: pja.level_risiko });
      }
      proyekId = pja.id_proyek; pengajuId = pja.pengaju;
    }
  } else if (apr.tipe_referensi === 'WIP') {
    const w = db.findById('wip', 'id_wip', apr.id_referensi);
    if (w) {
      db.updateById('wip', 'id_wip', w.id_wip, { status, reviewer: ctx.user.id_user, catatan_review: catatan || '', tanggal_review: nowISO() });
      proyekId = w.id_proyek; pengajuId = w.pengaju;
    }
  } else if (apr.tipe_referensi === 'Final Evaluation') {
    const f = db.findById('final_evaluation', 'id_final', apr.id_referensi);
    if (f) {
      db.updateById('final_evaluation', 'id_final', f.id_final, { status, reviewer: ctx.user.id_user, catatan_review: catatan || '', tanggal_review: nowISO() });
      if (status === 'Approved') {
        db.updateById('proyek', 'id_proyek', f.id_proyek, { status_proyek: 'Selesai' });
      }
      proyekId = f.id_proyek; pengajuId = f.pengaju;
    }
  } else if (apr.tipe_referensi === 'PTW') {
    const ptw = db.findById('ptw', 'id_ptw', apr.id_referensi);
    if (ptw) {
      db.updateById('ptw', 'id_ptw', ptw.id_ptw, { status: status === 'Approved' ? 'Aktif' : 'Ditolak', catatan_review: catatan || '' });
      proyekId = ptw.id_proyek; pengajuId = ptw.pengaju;
    }
  }

  if (proyekId) {
    const proyek = db.findById('proyek', 'id_proyek', proyekId);
    proyekNama = proyek ? proyek.nama_proyek : '';
    if (proyek) {
      notify('PIC', status === 'Approved' ? 'approval' : 'rework', `${apr.tipe_referensi} ${status === 'Approved' ? 'disetujui' : 'perlu Rework'}`,
        `${apr.tipe_referensi} untuk proyek "${proyek.nama_proyek}" telah ${status === 'Approved' ? 'disetujui' : 'dikembalikan untuk Rework'}.${catatan ? ' Catatan: ' + catatan : ''}`,
        apr.id_referensi, proyek.id_proyek);
    }
  }

  const target = enrich(db.findById('approval', 'id_approval', apr.id_approval));
  logAudit(ctx.user, `${apr.tipe_referensi} ${status}: ${target.ref_label}`, proyekNama);
  sendJson(res, 200, { data: target });
}

module.exports = { listApproval, decideApproval };
