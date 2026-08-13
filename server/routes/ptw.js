// ptw.js — PTW Digital: replika penuh form fisik "Permit to Work / Izin
// Untuk Bekerja" (mengikuti struktur form client, 10 bagian) yang dipakai
// tim lapangan Expro saat bekerja di lokasi client.
const db = require('../db');
const { sendJson, sendError, genId, todayISO, nowISO } = require('../utils');
const { logAudit } = require('../auth');
const { notify } = require('../notifications');
const { syncPTWExpiry } = require('../business');

const JENIS_IZIN = ['Hot Work', 'Cold Work', 'Confined Space', 'Bekerja di Ketinggian', 'Kelistrikan', 'Penggalian', 'Lainnya'];
const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

// Struktur default tiap bagian — dikirim ke frontend agar checklist selalu
// konsisten meskipun sebagian data belum diisi.
const DEFAULT_BAHAYA = {
  cairan_gas_bertekanan: false, bahan_beracun: false, bahan_korosif: false, bahan_mudah_terbakar: false,
  operasi_pengangkatan: false, penanganan_manual: false, bekerja_ketinggian: false, ruang_terbatas: false,
  partikel_percikan: false, peralatan_percikan: false, mesin_bergerak: false, listrik: false,
  segel_lsa: false, api_busur_terbuka: false, bahan_panas: false, cuaca_ekstrem: false,
  tumpahan_saluran: false, lingkungan: false, pekerjaan_berdekatan: false, penggalian: false,
  pengujian_gas: false, lainnya: false, lainnya_text: '',
};
const DEFAULT_PERSIAPAN = {
  toolbox_talk_ref: '', toolbox_talk_yn: null,
  ra_reviewed_ref: '', ra_reviewed_yn: null,
  coshh_reviewed_ref: '', coshh_reviewed_yn: null,
  lift_plan_ref: '', lift_plan_yn: null,
  rescue_plan_ref: '', rescue_plan_yn: null,
  trained_persons: false, emergency_systems: false, earthing: false,
  trac_attached: null, ra_attached: null, coshh_attached: null, lift_plan_attached: null, rescue_plan_attached: null,
  tools_inspected: false, environment_reviewed: false, spill_kit: false,
  communication_agreed: false, ventilation_required: false, gas_detection_required: false,
  lainnya: false, lainnya_text: '',
};
const DEFAULT_APD = {
  dust_mask: false, face_shield: false, hearing_protection: false, full_chemical_suit: false,
  safety_harness: false, inertia_reel: false, respirator: false, breathing_apparatus: false,
  gloves: false, gloves_text: '', lainnya: false, lainnya_text: '',
};
const DEFAULT_KONTROL = {
  fire_watcher: false, fire_extinguisher: false, lifeline: false, radio: false,
  hose_reel: false, torch_light: false, isolations_lockouts: false, warning_signs: false,
  lainnya: false, lainnya_text: '',
};
const DEFAULT_GAS_TESTING = {
  diperlukan: false, nama_tester: '', nama_perusahaan_tester: '', tanggal: '', waktu: '',
  monitoring_berkelanjutan: null,
  readings: {
    oksigen: { limit: '18 - 23%', reading: '' },
    lel: { limit: '<10% LEL', reading: '' },
    h2s: { limit: '<5 ppm', reading: '' },
    co: { limit: '<30 ppm', reading: '' },
  },
};

function mergeDefaults(base, incoming) {
  return Object.assign({}, base, incoming || {});
}

function scopedProyek(user) {
  return user.peran === 'PIC' ? user.id_proyek : null;
}

async function listPTW(req, res, ctx, body, query) {
  syncPTWExpiry();
  let rows = db.all('ptw');
  const scope = scopedProyek(ctx.user);
  if (scope) rows = rows.filter((p) => p.id_proyek === scope);
  if (query.proyek_id) rows = rows.filter((p) => p.id_proyek === query.proyek_id);
  if (query.status) rows = rows.filter((p) => p.status === query.status);
  rows.sort((a, b) => (a.tanggal_pengajuan < b.tanggal_pengajuan ? 1 : -1));
  const withProyek = rows.map((p) => ({ ...p, nama_proyek: (db.findById('proyek', 'id_proyek', p.id_proyek) || {}).nama_proyek }));
  sendJson(res, 200, { data: withProyek, jenis_izin_options: JENIS_IZIN, hari_options: HARI_LIST });
}

async function getPTW(req, res, ctx, body, query, params) {
  const p = db.findById('ptw', 'id_ptw', params.id);
  if (!p) return sendError(res, 404, 'PTW tidak ditemukan.');
  const scope = scopedProyek(ctx.user);
  if (scope && p.id_proyek !== scope) return sendError(res, 403, 'Akses ditolak.');
  const approvals = db.all('approval').filter((a) => a.tipe_referensi === 'PTW' && a.id_referensi === p.id_ptw);
  const proyek = db.findById('proyek', 'id_proyek', p.id_proyek);
  sendJson(res, 200, { data: { ...p, nama_proyek: proyek ? proyek.nama_proyek : null }, approvals, hari_options: HARI_LIST });
}

// Bagian 1-7: pengajuan izin kerja baru — satu approver sebelum berstatus Aktif.
async function createPTW(req, res, ctx, body) {
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  const {
    id_proyek, jenis_izin, lokasi_kerja, pekerjaan_dilakukan, nama_karyawan,
    tanggal_mulai, waktu_mulai, durasi_perkiraan, tanggal_berakhir_rencana,
    nama_perusahaan_kontraktor, penanggung_jawab_lokasi,
    bahaya, persiapan_lokasi, apd, kontrol, gas_testing,
    deklarasi_performing_authority, deklarasi_responsible_person,
  } = body;

  const proyek = db.findById('proyek', 'id_proyek', id_proyek);
  if (!proyek) return sendError(res, 404, 'Proyek tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== id_proyek) return sendError(res, 403, 'Akses ditolak.');
  if (proyek.status_proyek !== 'Aktif') return sendError(res, 400, 'Proyek harus berstatus Aktif untuk mengajukan izin kerja.');
  if (!jenis_izin || !lokasi_kerja || !pekerjaan_dilakukan || !nama_karyawan || !tanggal_mulai || !waktu_mulai || !durasi_perkiraan || !tanggal_berakhir_rencana || !penanggung_jawab_lokasi) {
    return sendError(res, 400, 'Bagian 1 (Work To Be Done) wajib dilengkapi.');
  }
  if (!JENIS_IZIN.includes(jenis_izin)) return sendError(res, 400, 'Jenis izin tidak valid.');
  if (tanggal_berakhir_rencana < tanggal_mulai) return sendError(res, 400, 'Tanggal berakhir tidak boleh sebelum tanggal mulai.');
  if (!deklarasi_performing_authority || !deklarasi_performing_authority.nama || !deklarasi_performing_authority.konfirmasi) {
    return sendError(res, 400, 'Deklarasi Performing Authority (Bagian 7) wajib diisi & dikonfirmasi.');
  }
  if (!deklarasi_responsible_person || !deklarasi_responsible_person.nama || !deklarasi_responsible_person.konfirmasi) {
    return sendError(res, 400, 'Deklarasi Responsible Person (Bagian 7) wajib diisi & dikonfirmasi.');
  }

  const seq = db.nextSeq('ptw_no');
  const ptw = {
    id_ptw: genId('PTW'),
    ptw_no: 'PTW-' + String(seq).padStart(5, '0'),
    id_proyek,
    // Bagian 1
    jenis_izin, lokasi_kerja, pekerjaan_dilakukan, nama_karyawan,
    tanggal_mulai, waktu_mulai, durasi_perkiraan, tanggal_berakhir_rencana,
    nama_perusahaan_kontraktor: nama_perusahaan_kontraktor || 'PT Expro',
    penanggung_jawab_lokasi,
    // Bagian 2-6
    bahaya: mergeDefaults(DEFAULT_BAHAYA, bahaya),
    persiapan_lokasi: mergeDefaults(DEFAULT_PERSIAPAN, persiapan_lokasi),
    apd: mergeDefaults(DEFAULT_APD, apd),
    kontrol: mergeDefaults(DEFAULT_KONTROL, kontrol),
    gas_testing: mergeDefaults(DEFAULT_GAS_TESTING, gas_testing),
    // Bagian 7
    deklarasi_performing_authority: {
      nama: deklarasi_performing_authority.nama, jabatan: deklarasi_performing_authority.jabatan || '',
      konfirmasi: true, waktu_konfirmasi: nowISO(),
    },
    deklarasi_responsible_person: {
      nama: deklarasi_responsible_person.nama, jabatan: deklarasi_responsible_person.jabatan || '',
      konfirmasi: true, waktu_konfirmasi: nowISO(),
    },
    // Bagian 8-10
    validasi_harian: [],
    penyelesaian: null,
    komentar_tindak_lanjut: '',

    pengaju: ctx.user.id_user, tanggal_pengajuan: todayISO(),
    tanggal_selesai: tanggal_berakhir_rencana, // dipakai oleh business.js untuk sync kedaluwarsa
    status: 'Menunggu Approval',
  };
  db.insert('ptw', ptw);

  const reviewers = db.all('users').filter((u) => u.peran === 'Reviewer' && u.status_akun === 'Aktif');
  db.insert('approval', {
    id_approval: genId('APR'), tipe_referensi: 'PTW', id_referensi: ptw.id_ptw,
    level_approval: 1, approver: reviewers[0] ? reviewers[0].id_user : null, status: 'Menunggu',
    tanggal_submit: nowISO(), tanggal_keputusan: null, catatan_keputusan: null,
  });

  logAudit(ctx.user, `Pengajuan PTW baru (${jenis_izin}) — ${ptw.ptw_no}`, proyek.nama_proyek);
  if (ctx.user.peran === 'PIC') {
    notify('Reviewer', 'approval', 'PTW menunggu review', `Proyek "${proyek.nama_proyek}" mengajukan izin kerja ${jenis_izin} di ${lokasi_kerja} (${ptw.ptw_no}) untuk direview.`, ptw.id_ptw);
  }
  sendJson(res, 201, { data: ptw });
}

// Update sebagian data (mis. melengkapi checklist bahaya/persiapan/APD/kontrol
// setelah draft dibuat, sebelum status berubah dari Menunggu Approval/Aktif).
async function updatePTW(req, res, ctx, body, query, params) {
  const p = db.findById('ptw', 'id_ptw', params.id);
  if (!p) return sendError(res, 404, 'PTW tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== p.id_proyek) return sendError(res, 403, 'Akses ditolak.');
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  if (['Selesai', 'Ditolak', 'Kadaluwarsa'].includes(p.status)) return sendError(res, 400, 'PTW yang sudah selesai/ditolak/kedaluwarsa tidak dapat diubah.');

  const patch = {};
  if (body.bahaya) patch.bahaya = mergeDefaults(p.bahaya, body.bahaya);
  if (body.persiapan_lokasi) patch.persiapan_lokasi = mergeDefaults(p.persiapan_lokasi, body.persiapan_lokasi);
  if (body.apd) patch.apd = mergeDefaults(p.apd, body.apd);
  if (body.kontrol) patch.kontrol = mergeDefaults(p.kontrol, body.kontrol);
  if (body.gas_testing) patch.gas_testing = mergeDefaults(p.gas_testing, body.gas_testing);
  if (body.komentar_tindak_lanjut !== undefined) patch.komentar_tindak_lanjut = body.komentar_tindak_lanjut;

  const updated = db.updateById('ptw', 'id_ptw', p.id_ptw, patch);
  logAudit(ctx.user, `Perbarui detail PTW ${p.ptw_no || p.id_ptw}`, '');
  sendJson(res, 200, { data: updated });
}

// Bagian 8: tambah satu baris validasi/tanda tangan harian (Senin-Minggu).
async function addValidasiHarian(req, res, ctx, body, query, params) {
  const p = db.findById('ptw', 'id_ptw', params.id);
  if (!p) return sendError(res, 404, 'PTW tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== p.id_proyek) return sendError(res, 403, 'Akses ditolak.');
  if (p.status !== 'Aktif') return sendError(res, 400, 'Validasi harian hanya bisa ditambahkan pada PTW berstatus Aktif.');
  const { hari, tanggal, jam_mulai, ttd_performing_authority_mulai, ttd_responsible_person_mulai } = body;
  if (!hari || !HARI_LIST.includes(hari)) return sendError(res, 400, 'Hari tidak valid.');
  if (!tanggal || !jam_mulai || !ttd_performing_authority_mulai || !ttd_responsible_person_mulai) {
    return sendError(res, 400, 'Tanggal, jam mulai, dan tanda tangan (nama) Performing Authority & Responsible Person wajib diisi.');
  }
  const entry = {
    id: genId('VAL'), hari, tanggal, jam_mulai,
    ttd_performing_authority_mulai, ttd_responsible_person_mulai,
    jam_selesai: null, ttd_performing_authority_selesai: null, ttd_responsible_person_selesai: null,
  };
  const validasi = (p.validasi_harian || []).concat([entry]);
  const updated = db.updateById('ptw', 'id_ptw', p.id_ptw, { validasi_harian: validasi });
  logAudit(ctx.user, `Validasi harian PTW ${p.ptw_no || p.id_ptw} — ${hari} ${tanggal}`, '');
  sendJson(res, 201, { data: updated });
}

// Bagian 9: penyelesaian/pembatalan pekerjaan — menandai PTW Aktif sebagai Selesai.
async function selesaikanPTW(req, res, ctx, body, query, params) {
  const p = db.findById('ptw', 'id_ptw', params.id);
  if (!p) return sendError(res, 404, 'PTW tidak ditemukan.');
  if (ctx.user.peran === 'PIC' && ctx.user.id_proyek !== p.id_proyek) return sendError(res, 403, 'Akses ditolak.');
  if (!['Admin HSE', 'PIC', 'Admin Sistem'].includes(ctx.user.peran)) return sendError(res, 403, 'Akses ditolak.');
  if (p.status !== 'Aktif') return sendError(res, 400, 'Hanya izin kerja berstatus Aktif yang dapat diselesaikan.');
  const { performing_authority, responsible_person, komentar_tindak_lanjut } = body;
  if (!performing_authority || !performing_authority.nama || !responsible_person || !responsible_person.nama) {
    return sendError(res, 400, 'Konfirmasi Performing Authority & Responsible Person (Bagian 9) wajib diisi.');
  }
  const penyelesaian = {
    performing_authority: { nama: performing_authority.nama, jabatan: performing_authority.jabatan || '', tanggal: todayISO() },
    responsible_person: { nama: responsible_person.nama, jabatan: responsible_person.jabatan || '', tanggal: todayISO() },
  };
  const updated = db.updateById('ptw', 'id_ptw', p.id_ptw, {
    status: 'Selesai', penyelesaian, komentar_tindak_lanjut: komentar_tindak_lanjut || p.komentar_tindak_lanjut || '',
  });
  const proyek = db.findById('proyek', 'id_proyek', p.id_proyek);
  logAudit(ctx.user, `PTW ${p.ptw_no || p.id_ptw} diselesaikan`, proyek ? proyek.nama_proyek : p.id_proyek);
  sendJson(res, 200, { data: updated });
}

module.exports = {
  listPTW, getPTW, createPTW, updatePTW, addValidasiHarian, selesaikanPTW,
  JENIS_IZIN, HARI_LIST, DEFAULT_BAHAYA, DEFAULT_PERSIAPAN, DEFAULT_APD, DEFAULT_KONTROL, DEFAULT_GAS_TESTING,
};
