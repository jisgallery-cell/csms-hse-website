const db = require('../db');
const { sendJson, sendError, genId, hashPassword } = require('../utils');
const { logAudit } = require('../auth');

function publicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

async function listUsers(req, res, ctx) {
  sendJson(res, 200, { data: db.all('users').map(publicUser) });
}

async function createUser(req, res, ctx, body) {
  const { nama, email, peran, password, id_proyek } = body;
  if (!nama || !email || !peran || !password) return sendError(res, 400, 'nama, email, peran, dan password wajib diisi.');
  if (!['Admin HSE', 'PIC', 'Reviewer', 'Manajemen', 'Admin Sistem'].includes(peran)) {
    return sendError(res, 400, 'Peran tidak valid.');
  }
  if (peran === 'PIC' && !id_proyek) return sendError(res, 400, 'PIC wajib ditugaskan ke sebuah proyek.');
  if (db.all('users').some((u) => u.email.toLowerCase() === email.toLowerCase())) return sendError(res, 409, 'Email sudah digunakan.');
  const u = {
    id_user: genId('USR'), nama, email, password_hash: hashPassword(password),
    peran, status_akun: 'Aktif', id_proyek: id_proyek || null, log_login_terakhir: null,
  };
  db.insert('users', u);
  logAudit(ctx.user, `Membuat pengguna baru (${peran})`, email);
  sendJson(res, 201, { data: publicUser(u) });
}

async function updateUser(req, res, ctx, body, query, params) {
  const u = db.findById('users', 'id_user', params.id);
  if (!u) return sendError(res, 404, 'Pengguna tidak ditemukan.');
  const patch = {};
  ['nama', 'peran', 'status_akun', 'id_proyek'].forEach((f) => { if (body[f] !== undefined) patch[f] = body[f]; });
  if (body.password) patch.password_hash = hashPassword(body.password);
  const updated = db.updateById('users', 'id_user', params.id, patch);
  logAudit(ctx.user, `Perbarui pengguna: ${Object.keys(patch).join(', ')}`, u.email);
  sendJson(res, 200, { data: publicUser(updated) });
}

async function getConfig(req, res, ctx) {
  sendJson(res, 200, { data: db.ensureLoaded().system_config });
}

async function updateConfig(req, res, ctx, body) {
  const cfg = db.ensureLoaded().system_config;
  const allowed = ['ca_deadline_tinggi_hari', 'ca_deadline_default_hari', 'wip_reminder_interval_hari'];
  allowed.forEach((f) => { if (body[f] !== undefined) cfg[f] = Number(body[f]); });
  db.persist();
  logAudit(ctx.user, 'Perbarui konfigurasi ambang batas sistem', JSON.stringify(body));
  sendJson(res, 200, { data: cfg });
}

async function getMasterData(req, res, ctx) {
  const dbi = db.ensureLoaded();
  sendJson(res, 200, {
    area: dbi.master_area,
    kontraktor_vendor: dbi.master_kontraktor_vendor,
    jenis_pekerjaan: dbi.master_jenis_pekerjaan,
    checklist_pja: dbi.master_checklist_pja,
    checklist_wip: dbi.master_checklist_wip,
    checklist_final: dbi.master_checklist_final,
    risk_kategori: dbi.master_risk_kategori,
    kategori_temuan: dbi.master_kategori_temuan,
  });
}

const MASTER_LIST_FIELDS = {
  area: 'master_area',
  'kontraktor-vendor': 'master_kontraktor_vendor',
  'jenis-pekerjaan': 'master_jenis_pekerjaan',
  'checklist-pja': 'master_checklist_pja',
  'checklist-wip': 'master_checklist_wip',
  'checklist-final': 'master_checklist_final',
  'risk-kategori': 'master_risk_kategori',
  'kategori-temuan': 'master_kategori_temuan',
};

async function addMasterItem(req, res, ctx, body, query, params) {
  const field = MASTER_LIST_FIELDS[params.list];
  if (!field) return sendError(res, 404, 'Daftar master data tidak dikenal.');
  const { nama } = body;
  if (!nama) return sendError(res, 400, 'nama wajib diisi.');
  const dbi = db.ensureLoaded();
  if (!dbi[field]) dbi[field] = [];
  if (!dbi[field].includes(nama)) {
    dbi[field].push(nama);
    db.persist();
  }
  logAudit(ctx.user, `Tambah master data (${params.list})`, nama);
  sendJson(res, 201, { data: dbi[field] });
}

// audit log (append-only, read-only here)
async function getAuditLog(req, res, ctx, body, query) {
  let rows = db.all('audit_log').sort((a, b) => (a.waktu < b.waktu ? 1 : -1));
  const limit = Math.min(Number(query.limit) || 100, 500);
  sendJson(res, 200, { data: rows.slice(0, limit) });
}

module.exports = { listUsers, createUser, updateUser, getConfig, updateConfig, getMasterData, addMasterItem, getAuditLog };
