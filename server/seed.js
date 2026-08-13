// seed.js — builds data/db.json dengan data demo untuk CSMS HSE PT Expro
// Yard Cibitung, mengikuti alur inti: Pre Job Assessment (PJA) -> Work In
// Progress Assessment (WIP, mencakup checklist Izin Kerja/PTW, MCU, dan
// Fasilitas/Workshop) -> Final Evaluation. Run with: npm run seed (juga
// otomatis jalan saat boot pertama).
const path = require('path');
const fs = require('fs');
const { hashPassword, computeRiskLevel } = require('./utils');
const { DB_PATH } = require('./config');

function build() {
  const db = {
    _counters: {},
    system_config: {
      ca_deadline_tinggi_hari: 7,
      ca_deadline_default_hari: 14,
      wip_reminder_interval_hari: 14,
    },
    master_area: [
      'Site Cilegon, Banten', 'Site Balikpapan, Kalimantan Timur', 'Site Cikarang, Jawa Barat',
      'Site Bekasi, Jawa Barat', 'Site Tangerang, Banten', 'Yard Cibitung (Internal)',
    ],
    master_kontraktor_vendor: [
      'Tidak ada / Internal', 'PT Mitra Rigging Nusantara', 'PT Scaffolding Prima Sejahtera',
    ],
    master_jenis_pekerjaan: [
      'Mekanikal & Piping', 'Inspeksi & Well Testing', 'Konstruksi Sipil',
      'Kelistrikan Tegangan Tinggi', 'Scaffolding & Bekerja di Ketinggian',
      'Instalasi Kelistrikan', 'Maintenance Rutin Fasilitas',
    ],
    master_checklist_pja: [
      'Dokumen kontrak & izin kerja dari client lengkap',
      'Tim & kompetensi personel siap ditugaskan',
      'APD & peralatan kerja tersedia dan layak pakai',
      'HSE Plan / rencana K3 proyek telah disusun',
      'Koordinasi awal dengan client selesai',
      'Estimasi risiko pekerjaan (likelihood x severity) telah dinilai',
    ],
    master_checklist_wip: [
      'Izin Kerja (PTW) aktif dan sesuai jenis pekerjaan',
      'Seluruh pekerja memiliki hasil Medical Checkup (MCU) yang masih berlaku',
      'APD digunakan sesuai ketentuan di lapangan',
      'Kondisi fasilitas/workshop area kerja memenuhi standar',
      'Alat & peralatan kerja terinspeksi dan layak pakai',
      'Toolbox talk / briefing K3 harian dilaksanakan',
      'Tidak ada temuan pelanggaran prosedur kerja yang masih terbuka',
    ],
    master_checklist_final: [
      'Seluruh temuan/tindakan korektif telah ditutup',
      'Dokumentasi pekerjaan lengkap dan diarsipkan',
      'Area kerja dikembalikan ke kondisi aman/bersih',
      'Evaluasi kinerja K3 proyek telah dilakukan',
      'Client menyatakan pekerjaan selesai dan diterima',
    ],
    master_risk_kategori: ['Rendah', 'Sedang', 'Tinggi', 'Kritis'],
    master_kategori_temuan: [
      'Izin Kerja/PTW', 'Medical Checkup (MCU)', 'Fasilitas/Workshop', 'APD',
      'Prosedur Kerja', 'Alat & Peralatan', 'Lingkungan Kerja', 'Lainnya',
    ],
    master_fasilitas: [
      'Workshop Mekanikal Utama', 'Gudang Material B3', 'Area Genset & Panel Listrik',
      'Bengkel Fabrikasi', 'Pos Keamanan & Gerbang Utama',
    ],
    users: [],
    proyek: [],
    pja: [],
    wip: [],
    corrective_action: [],
    final_evaluation: [],
    approval: [],
    ptw: [],
    pekerja_mcu: [],
    facility_finding: [],
    daily_checkin: [],
    audit_log: [],
    notifications: [],
  };

  let ctr = { user: 0, pry: 0, pja: 0, wip: 0, ca: 0, fin: 0, apr: 0, ptw: 0, mcu: 0, fac: 0 };
  const uid = () => 'USR-' + String(++ctr.user).padStart(3, '0');
  const pid = () => 'PRY-' + String(++ctr.pry).padStart(4, '0');
  const pjaid = () => 'PJA-' + String(++ctr.pja).padStart(4, '0');
  const wipid = () => 'WIP-' + String(++ctr.wip).padStart(4, '0');
  const caid = () => 'CA-' + String(++ctr.ca).padStart(4, '0');
  const finid = () => 'FIN-' + String(++ctr.fin).padStart(4, '0');
  const aprid = () => 'APR-' + String(++ctr.apr).padStart(4, '0');
  const mcuid = () => 'MCU-' + String(++ctr.mcu).padStart(4, '0');
  const facid = () => 'FAC-' + String(++ctr.fac).padStart(4, '0');

  function addUser(nama, email, peran, id_proyek = null) {
    const u = {
      id_user: uid(), nama, email, password_hash: hashPassword('csms2026'),
      peran, // Admin HSE | PIC | Reviewer | Manajemen | Admin Sistem
      status_akun: 'Aktif', id_proyek, log_login_terakhir: null,
    };
    db.users.push(u);
    return u;
  }

  const admHse = addUser('Rina Anggraeni', 'admin.hse@csms.local', 'Admin HSE');
  const reviewer1 = addUser('Bambang Sutrisno', 'reviewer1@csms.local', 'Reviewer');
  const reviewer2 = addUser('Dewi Kartika', 'reviewer2@csms.local', 'Reviewer');
  const manajemen = addUser('Hendra Wijaya', 'manajemen@csms.local', 'Manajemen');
  const adminSys = addUser('Fajar Nugroho', 'admin.sistem@csms.local', 'Admin Sistem');

  function addProyek(opts) {
    const p = {
      id_proyek: pid(), nama_proyek: opts.nama, nama_client: opts.client, area: opts.area,
      lokasi_detail: opts.lokasi_detail || '', kontraktor_vendor: opts.kontraktor_vendor || '',
      jenis_pekerjaan: opts.jenis, pic_nama: opts.pic_nama, kontak_pic: opts.kontak_pic,
      tanggal_mulai: opts.mulai, tanggal_selesai_rencana: opts.selesai || null,
      status_proyek: opts.status || 'Aktif', tingkat_risiko_terkini: opts.risiko || null,
      catatan: opts.catatan || '',
    };
    db.proyek.push(p);
    return p;
  }

  // --- Proyek 1: pipeline lengkap PJA -> WIP -> Final, semua Approved, proyek Selesai ---
  const p1 = addProyek({
    nama: 'Maintenance Rig Cilegon', client: 'PT Petro Client Indonesia', area: 'Site Cilegon, Banten',
    lokasi_detail: 'Kawasan Industri Cilegon Blok C', kontraktor_vendor: 'Tidak ada / Internal',
    jenis: 'Mekanikal & Piping', pic_nama: 'Sutedjo Alam', kontak_pic: '0812-1000-2001',
    mulai: '2026-02-14', selesai: '2026-04-14', status: 'Selesai', risiko: 'Rendah',
    catatan: 'Proyek selesai tepat waktu tanpa insiden.',
  });

  // --- Proyek 2: berjalan aktif, PJA Approved, 1 WIP Approved + 1 WIP menunggu review ---
  const p2 = addProyek({
    nama: 'Well Testing & Inspeksi Balikpapan', client: 'PT Energi Migas Nusantara', area: 'Site Balikpapan, Kalimantan Timur',
    lokasi_detail: 'Terminal Migas Balikpapan', kontraktor_vendor: 'PT Mitra Rigging Nusantara',
    jenis: 'Inspeksi & Well Testing', pic_nama: 'Joko Purnomo', kontak_pic: '0813-2000-3002',
    mulai: '2025-11-02', status: 'Aktif', risiko: 'Tinggi',
  });

  // --- Proyek 3: PJA baru diajukan, menunggu review Reviewer ---
  const p3 = addProyek({
    nama: 'Konstruksi Struktur Cikarang', client: 'PT Baja Konstruksi Nasional', area: 'Site Cikarang, Jawa Barat',
    lokasi_detail: 'Kawasan Industri Cikarang', kontraktor_vendor: 'Tidak ada / Internal',
    jenis: 'Konstruksi Sipil', pic_nama: 'Ahmad Fauzi', kontak_pic: '0814-3000-4003',
    mulai: '2026-07-20', status: 'Aktif',
  });

  // --- Proyek 4: PJA dikembalikan untuk Rework ---
  const p4 = addProyek({
    nama: 'Pemeliharaan Panel Tegangan Tinggi Bekasi', client: 'PT Sumber Energi Nasional', area: 'Site Bekasi, Jawa Barat',
    lokasi_detail: 'Kawasan Industri Bekasi', kontraktor_vendor: 'Tidak ada / Internal',
    jenis: 'Kelistrikan Tegangan Tinggi', pic_nama: 'Siti Rahmawati', kontak_pic: '0815-4000-5004',
    mulai: '2026-06-01', status: 'Aktif',
  });

  // --- Proyek 5: proyek baru, belum ada PJA sama sekali ---
  const p5 = addProyek({
    nama: 'Scaffolding Tower Crane Tangerang', client: 'PT Cipta Menara Migas', area: 'Site Tangerang, Banten',
    lokasi_detail: 'Terminal Tangerang', kontraktor_vendor: 'PT Scaffolding Prima Sejahtera',
    jenis: 'Scaffolding & Bekerja di Ketinggian', pic_nama: 'Rudi Hartono', kontak_pic: '0816-5000-6005',
    mulai: '2026-08-10', status: 'Aktif',
  });

  // --- PIC per proyek ---
  const pic2 = addUser('Joko Purnomo', 'pic1@csms.local', 'PIC', p2.id_proyek);
  addUser('Sutedjo Alam', 'pic2@csms.local', 'PIC', p1.id_proyek);
  addUser('Ahmad Fauzi', 'pic3@csms.local', 'PIC', p3.id_proyek);
  addUser('Siti Rahmawati', 'pic4@csms.local', 'PIC', p4.id_proyek);
  addUser('Rudi Hartono', 'pic5@csms.local', 'PIC', p5.id_proyek);

  function checklistFrom(items, falseIdx = []) {
    return items.map((item, i) => ({ item, terpenuhi: !falseIdx.includes(i) }));
  }
  function compliance(checklist) {
    const terpenuhi = checklist.filter((c) => c.terpenuhi).length;
    return Math.round((terpenuhi / checklist.length) * 1000) / 10;
  }

  // --- PJA Proyek 1 (Approved) ---
  const pja1checklist = checklistFrom(db.master_checklist_pja);
  const pja1Risk = computeRiskLevel(1, 3); // Rendah
  const pja1 = {
    id_pja: pjaid(), id_proyek: p1.id_proyek, checklist: pja1checklist,
    likelihood: 1, severity: 3, skor_risiko: pja1Risk.skor_risiko, level_risiko: pja1Risk.level_risiko,
    compliance_percent: compliance(pja1checklist), lampiran: [], catatan_pengaju: 'Checklist kesiapan lengkap.',
    pengaju: pic2.id_user, tanggal_submit: '2026-02-15',
    status: 'Approved', reviewer: reviewer1.id_user, catatan_review: 'Checklist lengkap, disetujui.', tanggal_review: '2026-02-16T09:00:00.000Z',
  };
  db.pja.push(pja1);
  db.approval.push({
    id_approval: aprid(), tipe_referensi: 'PJA', id_referensi: pja1.id_pja, level_approval: 1,
    approver: reviewer1.id_user, status: 'Approved', tanggal_submit: '2026-02-15T09:00:00.000Z',
    tanggal_keputusan: '2026-02-16T09:00:00.000Z', catatan_keputusan: 'Checklist lengkap, disetujui.',
  });

  // --- WIP Proyek 1 x2 (keduanya Approved) ---
  const wip1a = {
    id_wip: wipid(), id_proyek: p1.id_proyek, tanggal_assessment: '2026-02-25',
    checklist: checklistFrom(db.master_checklist_wip), compliance_percent: 100, lampiran: [],
    catatan_pengaju: 'Kondisi lapangan awal sesuai standar.', pengaju: pic2.id_user, tanggal_submit: '2026-02-25',
    status: 'Approved', reviewer: reviewer1.id_user, catatan_review: 'Sesuai standar.', tanggal_review: '2026-02-26T09:00:00.000Z',
  };
  db.wip.push(wip1a);
  db.approval.push({
    id_approval: aprid(), tipe_referensi: 'WIP', id_referensi: wip1a.id_wip, level_approval: 1,
    approver: reviewer1.id_user, status: 'Approved', tanggal_submit: '2026-02-25T09:00:00.000Z',
    tanggal_keputusan: '2026-02-26T09:00:00.000Z', catatan_keputusan: 'Sesuai standar.',
  });

  const wip1bChecklist = checklistFrom(db.master_checklist_wip, [1]); // MCU item belum terpenuhi saat itu
  const wip1b = {
    id_wip: wipid(), id_proyek: p1.id_proyek, tanggal_assessment: '2026-03-15',
    checklist: wip1bChecklist, compliance_percent: compliance(wip1bChecklist), lampiran: [],
    catatan_pengaju: 'Ada satu pekerja dengan MCU yang perlu diperbarui.', pengaju: pic2.id_user, tanggal_submit: '2026-03-15',
    status: 'Approved', reviewer: reviewer1.id_user, catatan_review: 'Disetujui dengan syarat MCU pekerja terkait segera diperbarui.', tanggal_review: '2026-03-16T09:00:00.000Z',
  };
  db.wip.push(wip1b);
  db.approval.push({
    id_approval: aprid(), tipe_referensi: 'WIP', id_referensi: wip1b.id_wip, level_approval: 1,
    approver: reviewer1.id_user, status: 'Approved', tanggal_submit: '2026-03-15T09:00:00.000Z',
    tanggal_keputusan: '2026-03-16T09:00:00.000Z', catatan_keputusan: 'Disetujui dengan syarat MCU pekerja terkait segera diperbarui.',
  });
  const ca1 = {
    id_ca: caid(), id_proyek: p1.id_proyek, id_wip: wip1b.id_wip, kategori_temuan: 'Medical Checkup (MCU)',
    deskripsi_temuan: 'Satu pekerja dengan hasil MCU mendekati kedaluwarsa belum diperbarui.', tingkat_urgensi: 'Sedang',
    pic_tindak_lanjut: 'Sutedjo Alam', tanggal_temuan: '2026-03-15', tenggat_waktu: '2026-03-29',
    status: 'Closed', bukti_penyelesaian: '/uploads/demo-mcu-update.pdf',
  };
  db.corrective_action.push(ca1);

  // --- Final Evaluation Proyek 1 (Approved -> proyek Selesai) ---
  const finalChecklist1 = checklistFrom(db.master_checklist_final);
  const final1 = {
    id_final: finid(), id_proyek: p1.id_proyek, checklist: finalChecklist1,
    compliance_percent: compliance(finalChecklist1), lampiran: [], catatan_pengaju: 'Seluruh temuan telah ditutup, siap final evaluation.',
    pengaju: pic2.id_user, tanggal_submit: '2026-04-10',
    status: 'Approved', reviewer: reviewer1.id_user, catatan_review: 'Proyek selesai dengan baik, tidak ada temuan terbuka.', tanggal_review: '2026-04-12T09:00:00.000Z',
  };
  db.final_evaluation.push(final1);
  db.approval.push({
    id_approval: aprid(), tipe_referensi: 'Final Evaluation', id_referensi: final1.id_final, level_approval: 1,
    approver: reviewer1.id_user, status: 'Approved', tanggal_submit: '2026-04-10T09:00:00.000Z',
    tanggal_keputusan: '2026-04-12T09:00:00.000Z', catatan_keputusan: 'Proyek selesai dengan baik, tidak ada temuan terbuka.',
  });

  // --- PJA Proyek 2 (Approved, risiko Tinggi) ---
  const pja2checklist = checklistFrom(db.master_checklist_pja);
  const pja2Risk = computeRiskLevel(3, 3); // Tinggi
  const pja2 = {
    id_pja: pjaid(), id_proyek: p2.id_proyek, checklist: pja2checklist,
    likelihood: 3, severity: 3, skor_risiko: pja2Risk.skor_risiko, level_risiko: pja2Risk.level_risiko,
    compliance_percent: compliance(pja2checklist), lampiran: [], catatan_pengaju: 'Well testing sumur produksi bertekanan tinggi.',
    pengaju: pic2.id_user, tanggal_submit: '2025-11-05',
    status: 'Approved', reviewer: reviewer2.id_user, catatan_review: 'Disetujui, pastikan gas testing berkala.', tanggal_review: '2025-11-06T09:00:00.000Z',
  };
  db.pja.push(pja2);
  db.approval.push({
    id_approval: aprid(), tipe_referensi: 'PJA', id_referensi: pja2.id_pja, level_approval: 1,
    approver: reviewer2.id_user, status: 'Approved', tanggal_submit: '2025-11-05T09:00:00.000Z',
    tanggal_keputusan: '2025-11-06T09:00:00.000Z', catatan_keputusan: 'Disetujui, pastikan gas testing berkala.',
  });

  // --- WIP Proyek 2: 1 Approved (lama), 1 Menunggu Review (baru diajukan) ---
  const wip2a = {
    id_wip: wipid(), id_proyek: p2.id_proyek, tanggal_assessment: '2025-11-20',
    checklist: checklistFrom(db.master_checklist_wip), compliance_percent: 100, lampiran: [],
    catatan_pengaju: 'Kondisi lapangan aman, gas testing normal.', pengaju: pic2.id_user, tanggal_submit: '2025-11-20',
    status: 'Approved', reviewer: reviewer2.id_user, catatan_review: 'Aman, lanjutkan.', tanggal_review: '2025-11-21T09:00:00.000Z',
  };
  db.wip.push(wip2a);
  db.approval.push({
    id_approval: aprid(), tipe_referensi: 'WIP', id_referensi: wip2a.id_wip, level_approval: 1,
    approver: reviewer2.id_user, status: 'Approved', tanggal_submit: '2025-11-20T09:00:00.000Z',
    tanggal_keputusan: '2025-11-21T09:00:00.000Z', catatan_keputusan: 'Aman, lanjutkan.',
  });

  const wip2bChecklist = checklistFrom(db.master_checklist_wip, [0]); // Izin Kerja/PTW belum terpenuhi
  const wip2b = {
    id_wip: wipid(), id_proyek: p2.id_proyek, tanggal_assessment: '2026-07-25',
    checklist: wip2bChecklist, compliance_percent: compliance(wip2bChecklist), lampiran: [],
    catatan_pengaju: 'PTW hot work sedang dalam proses perpanjangan.', pengaju: pic2.id_user, tanggal_submit: '2026-07-25',
    status: 'Menunggu Review', reviewer: null, catatan_review: null, tanggal_review: null,
  };
  db.wip.push(wip2b);
  db.approval.push({
    id_approval: aprid(), tipe_referensi: 'WIP', id_referensi: wip2b.id_wip, level_approval: 1,
    approver: reviewer2.id_user, status: 'Menunggu', tanggal_submit: '2026-07-25T09:00:00.000Z',
    tanggal_keputusan: null, catatan_keputusan: null,
  });

  // --- Corrective actions Proyek 2 (termasuk yang Overdue, untuk uji sync) ---
  db.corrective_action.push({
    id_ca: caid(), id_proyek: p2.id_proyek, id_wip: wip2a.id_wip, kategori_temuan: 'Izin Kerja/PTW',
    deskripsi_temuan: 'PIC lapangan tidak memegang hot work permit saat pengujian sumur.', tingkat_urgensi: 'Tinggi',
    pic_tindak_lanjut: 'Joko Purnomo', tanggal_temuan: '2026-07-20', tenggat_waktu: '2026-07-27',
    status: 'Overdue', bukti_penyelesaian: null,
  });
  db.corrective_action.push({
    id_ca: caid(), id_proyek: p2.id_proyek, id_wip: wip2b.id_wip, kategori_temuan: 'APD',
    deskripsi_temuan: 'Sebagian pekerja belum menggunakan APD tahan gas secara konsisten.', tingkat_urgensi: 'Sedang',
    pic_tindak_lanjut: 'Joko Purnomo', tanggal_temuan: '2026-08-01', tenggat_waktu: '2026-08-15',
    status: 'Open', bukti_penyelesaian: null,
  });

  // --- PJA Proyek 3 (baru diajukan, Menunggu Review, risiko tinggi ditemukan) ---
  const pja3checklist = checklistFrom(db.master_checklist_pja, [3, 4]); // HSE Plan & koordinasi client belum selesai
  const pja3Risk = computeRiskLevel(3, 5); // Kritis
  const pja3 = {
    id_pja: pjaid(), id_proyek: p3.id_proyek, checklist: pja3checklist,
    likelihood: 3, severity: 5, skor_risiko: pja3Risk.skor_risiko, level_risiko: pja3Risk.level_risiko,
    compliance_percent: compliance(pja3checklist), lampiran: [], catatan_pengaju: 'Menunggu HSE Plan final dan konfirmasi jadwal dari client.',
    pengaju: adminSys.id_user, tanggal_submit: '2026-08-05',
    status: 'Menunggu Review', reviewer: null, catatan_review: null, tanggal_review: null,
  };
  db.pja.push(pja3);
  db.approval.push({
    id_approval: aprid(), tipe_referensi: 'PJA', id_referensi: pja3.id_pja, level_approval: 1,
    approver: reviewer1.id_user, status: 'Menunggu', tanggal_submit: '2026-08-05T09:00:00.000Z',
    tanggal_keputusan: null, catatan_keputusan: null,
  });

  // --- PJA Proyek 4 (dikembalikan untuk Rework) ---
  const pja4checklist = checklistFrom(db.master_checklist_pja, [3]); // HSE Plan belum lengkap
  const pja4Risk = computeRiskLevel(3, 4); // Tinggi
  const pja4 = {
    id_pja: pjaid(), id_proyek: p4.id_proyek, checklist: pja4checklist,
    likelihood: 3, severity: 4, skor_risiko: pja4Risk.skor_risiko, level_risiko: pja4Risk.level_risiko,
    compliance_percent: compliance(pja4checklist), lampiran: [], catatan_pengaju: 'Pengajuan awal HSE Plan pemeliharaan panel.',
    pengaju: adminSys.id_user, tanggal_submit: '2026-06-02',
    status: 'Rework', reviewer: reviewer1.id_user, catatan_review: 'HSE Plan belum mencakup prosedur LOTO secara rinci — mohon lengkapi dan ajukan ulang.', tanggal_review: '2026-06-03T09:00:00.000Z',
  };
  db.pja.push(pja4);
  db.approval.push({
    id_approval: aprid(), tipe_referensi: 'PJA', id_referensi: pja4.id_pja, level_approval: 1,
    approver: reviewer1.id_user, status: 'Rework', tanggal_submit: '2026-06-02T09:00:00.000Z',
    tanggal_keputusan: '2026-06-03T09:00:00.000Z', catatan_keputusan: 'HSE Plan belum mencakup prosedur LOTO secara rinci — mohon lengkapi dan ajukan ulang.',
  });

  // Proyek 5 sengaja dibiarkan tanpa PJA sama sekali (demo status "Belum Diajukan").

  // --- PTW Digital (form 10 bagian, tertaut ke proyek) ---
  function addPTW(proyek, opts) {
    const seq = ++ctr.ptw;
    const ptw = {
      id_ptw: 'PTW-' + String(seq).padStart(4, '0'), ptw_no: 'PTW-' + String(seq).padStart(5, '0'),
      id_proyek: proyek.id_proyek, jenis_izin: opts.jenis, lokasi_kerja: opts.lokasi,
      pekerjaan_dilakukan: opts.deskripsi, nama_karyawan: opts.karyawan,
      tanggal_mulai: opts.mulai, waktu_mulai: opts.waktuMulai || '08:00', durasi_perkiraan: opts.durasi,
      tanggal_berakhir_rencana: opts.selesai, nama_perusahaan_kontraktor: 'PT Expro',
      penanggung_jawab_lokasi: opts.pjLokasi,
      bahaya: opts.bahaya || {}, persiapan_lokasi: opts.persiapan || {}, apd: opts.apd || {}, kontrol: opts.kontrol || {},
      gas_testing: opts.gasTesting ? {
        diperlukan: true, nama_tester: 'Ari Wibowo', nama_perusahaan_tester: 'PT Expro', tanggal: opts.mulai, waktu: '07:00',
        monitoring_berkelanjutan: 'Ya',
        readings: {
          oksigen: { limit: '18 - 23%', reading: '20.9%' }, lel: { limit: '<10% LEL', reading: '0%' },
          h2s: { limit: '<5 ppm', reading: '0 ppm' }, co: { limit: '<30 ppm', reading: '2 ppm' },
        },
      } : { diperlukan: false, readings: { oksigen: {}, lel: {}, h2s: {}, co: {} } },
      deklarasi_performing_authority: { nama: opts.pa, jabatan: opts.paJabatan || 'Site Supervisor', konfirmasi: true, waktu_konfirmasi: opts.mulai + 'T07:30:00.000Z' },
      deklarasi_responsible_person: { nama: opts.rp, jabatan: opts.rpJabatan || 'HSE Officer', konfirmasi: true, waktu_konfirmasi: opts.mulai + 'T07:35:00.000Z' },
      validasi_harian: opts.validasi || [],
      penyelesaian: opts.penyelesaian || null,
      komentar_tindak_lanjut: opts.komentar || '',
      pengaju: admHse.id_user, tanggal_pengajuan: opts.mulai, tanggal_selesai: opts.selesai, status: opts.status,
    };
    db.ptw.push(ptw);
    if (opts.status === 'Menunggu Approval') {
      db.approval.push({
        id_approval: aprid(), tipe_referensi: 'PTW', id_referensi: ptw.id_ptw, level_approval: 1,
        approver: reviewer1.id_user, status: 'Menunggu', tanggal_submit: opts.mulai + 'T07:00:00.000Z',
        tanggal_keputusan: null, catatan_keputusan: null,
      });
    }
    return ptw;
  }
  addPTW(p1, {
    jenis: 'Cold Work', lokasi: 'Area Piping Unit 3', deskripsi: 'Penggantian sambungan pipa proses.',
    karyawan: 'Bagus Prasetyo, Deni Kurnia', mulai: '2026-03-01', durasi: '3 hari', selesai: '2026-03-04',
    pjLokasi: 'Sutedjo Alam', pa: 'Sutedjo Alam', rp: 'Rina Anggraeni', status: 'Selesai',
    bahaya: { partikel_percikan: true }, apd: { face_shield: true },
    penyelesaian: {
      performing_authority: { nama: 'Sutedjo Alam', jabatan: 'Site Supervisor', tanggal: '2026-03-04' },
      responsible_person: { nama: 'Rina Anggraeni', jabatan: 'HSE Officer', tanggal: '2026-03-04' },
    },
    komentar: 'Pekerjaan selesai tanpa insiden.',
  });
  addPTW(p2, {
    jenis: 'Confined Space', lokasi: 'Tangki Proses Sumur 12', deskripsi: 'Inspeksi internal tangki sebelum well testing.',
    karyawan: 'Wahyu Setiawan', mulai: '2026-08-01', durasi: '2 hari', selesai: '2026-09-30',
    pjLokasi: 'Joko Purnomo', pa: 'Joko Purnomo', rp: 'Rina Anggraeni', status: 'Aktif',
    bahaya: { ruang_terbatas: true, pengujian_gas: true }, gasTesting: true,
    validasi: [{ id: 'VAL-0001', hari: 'Senin', tanggal: '2026-08-04', jam_mulai: '08:00', ttd_performing_authority_mulai: 'Joko Purnomo', ttd_responsible_person_mulai: 'Rina Anggraeni', jam_selesai: null, ttd_performing_authority_selesai: null, ttd_responsible_person_selesai: null }],
  });
  addPTW(p2, {
    jenis: 'Hot Work', lokasi: 'Area Wellhead', deskripsi: 'Pengelasan perbaikan dudukan pipa.',
    karyawan: 'Eko Prasetyo', mulai: '2026-08-13', durasi: '1 hari', selesai: '2026-08-13',
    pjLokasi: 'Joko Purnomo', pa: 'Joko Purnomo', rp: 'Rina Anggraeni', status: 'Menunggu Approval',
    bahaya: { api_busur_terbuka: true, bahan_mudah_terbakar: true }, kontrol: { fire_watcher: true, fire_extinguisher: true },
  });
  addPTW(p4, {
    jenis: 'Kelistrikan', lokasi: 'Ruang Panel Tegangan Tinggi', deskripsi: 'Pemeliharaan rutin panel distribusi.',
    karyawan: 'Siti Rahmawati, Bayu Aji', mulai: '2026-06-05', durasi: '2 hari', selesai: '2026-06-06',
    pjLokasi: 'Siti Rahmawati', pa: 'Siti Rahmawati', rp: 'Rina Anggraeni', status: 'Ditolak',
    bahaya: { listrik: true }, kontrol: { isolations_lockouts: true },
  });
  db._counters.ptw_no = ctr.ptw; // supaya nomor PTW baru dari aplikasi lanjut, bukan mengulang dari 1

  // --- Roster Medical Checkup (MCU) per proyek — mendemokan 3 tahap reminder ---
  function addMCU(proyek, opts) {
    db.pekerja_mcu.push({
      id_pekerja_mcu: mcuid(), id_proyek: proyek.id_proyek, nama: opts.nama, no_identitas: opts.noId || '',
      email: opts.email || '', no_wa: opts.noWa || '',
      tanggal_mcu: opts.tglMcu, hasil: opts.hasil, tanggal_berlaku_sampai: opts.berlaku,
      catatan: opts.catatan || '', file_path: null, dicatat_oleh: admHse.id_user, _mcu_reminder_stage: null,
    });
  }
  // Berlaku lama (jauh dari kedaluwarsa, tidak masuk tahap reminder manapun)
  addMCU(p1, { nama: 'Bagus Prasetyo', noId: '3201-0101', email: 'bagus.p@expro-crew.local', noWa: '0812-1000-1001', tglMcu: '2026-02-10', hasil: 'Fit', berlaku: '2027-02-10', catatan: 'Kondisi sehat.' });
  // Tahap Hijau (~90 hari sebelum kedaluwarsa dari 2026-08-12)
  addMCU(p2, { nama: 'Wahyu Setiawan', noId: '3202-0202', email: '', noWa: '0813-2000-2002', tglMcu: '2025-11-15', hasil: 'Fit', berlaku: '2026-11-01', catatan: 'Kontrol rutin dijadwalkan.' });
  // Tahap Kuning (~60 hari)
  addMCU(p2, { nama: 'Eko Prasetyo', noId: '3202-0303', email: 'eko.p@expro-crew.local', noWa: '', tglMcu: '2025-10-05', hasil: 'Fit dengan Catatan', berlaku: '2026-10-08', catatan: 'Tekanan darah sedikit tinggi.' });
  // Tahap Merah (~30 hari)
  addMCU(p3, { nama: 'Dedi Kurniawan', noId: '3203-0404', email: '', noWa: '', tglMcu: '2025-09-10', hasil: 'Fit', berlaku: '2026-09-05', catatan: 'Perlu segera dijadwalkan ulang.' });
  // Kedaluwarsa
  addMCU(p5, { nama: 'Anton Wijaya', noId: '3205-0505', email: 'anton.w@expro-crew.local', noWa: '0816-5000-5005', tglMcu: '2025-07-15', hasil: 'Tidak Fit', berlaku: '2026-07-15', catatan: 'Gangguan pendengaran — belum MCU ulang.' });

  // --- Base Facility/Workshop Compliance (internal, tidak terikat proyek) ---
  function addFinding(judul, deskripsi, lokasi, risiko, pj, lapor, tenggat, status, catatanPenutupan) {
    db.facility_finding.push({
      id_finding: facid(), judul_temuan: judul, deskripsi_temuan: deskripsi, lokasi_fasilitas: lokasi,
      tingkat_risiko: risiko, penanggung_jawab: pj, tenggat_waktu: tenggat, status,
      foto_bukti: null, catatan_penutupan: catatanPenutupan || '', dilaporkan_oleh: admHse.id_user, tanggal_lapor: lapor,
    });
  }
  addFinding('APAR kedaluwarsa', 'Tabung APAR di dekat pintu masuk melewati tanggal inspeksi ulang.', 'Workshop Mekanikal Utama', 'Sedang', 'Rina Anggraeni', '2026-07-20', '2026-08-25', 'Open');
  addFinding('Label B3 pudar', 'Label bahan B3 pada beberapa drum penyimpanan sudah tidak terbaca jelas.', 'Gudang Material B3', 'Tinggi', 'Rina Anggraeni', '2026-07-15', '2026-08-20', 'In Progress');
  addFinding('Kabel panel terkelupas', 'Ditemukan kabel instalasi panel genset dengan isolasi terkelupas.', 'Area Genset & Panel Listrik', 'Tinggi', 'Fajar Nugroho', '2026-06-10', '2026-06-24', 'Overdue');
  addFinding('Rambu K3 pudar', 'Rambu peringatan area bising di bengkel fabrikasi sudah pudar dan sulit terbaca.', 'Bengkel Fabrikasi', 'Rendah', 'Rina Anggraeni', '2026-05-05', '2026-05-19', 'Closed', 'Rambu baru telah dipasang dan diverifikasi.');

  // --- Audit log ---
  function log(actorUser, aksi, target, waktu) {
    db.audit_log.push({ id: db.audit_log.length + 1, actor: actorUser ? actorUser.id_user : 'SYSTEM', actor_nama: actorUser ? actorUser.nama : 'Sistem', aksi, target, waktu });
  }
  log(admHse, 'Proyek baru dibuat', p1.nama_proyek, '2026-02-14T08:00:00.000Z');
  log(pic2, 'Pengajuan Pre Job Assessment', p1.nama_proyek, '2026-02-15T09:00:00.000Z');
  log(reviewer1, 'PJA Approved', p1.nama_proyek, '2026-02-16T09:00:00.000Z');
  log(reviewer1, 'Final Evaluation Approved', p1.nama_proyek, '2026-04-12T09:00:00.000Z');
  log(null, 'Corrective action jatuh tempo', p2.nama_proyek, '2026-07-27T07:15:00.000Z');
  log(adminSys, 'Pengajuan Pre Job Assessment', p3.nama_proyek, '2026-08-05T09:00:00.000Z');
  log(reviewer1, 'PJA dikembalikan untuk Rework', p4.nama_proyek, '2026-06-03T09:00:00.000Z');
  log(admHse, 'Proyek baru dibuat', p5.nama_proyek, '2026-08-10T08:00:00.000Z');
  db._counters.audit_log = db.audit_log.length;

  return db;
}

function run() {
  const data = build();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Seed selesai ->', DB_PATH);
  console.log('Akun demo (password untuk semua: csms2026):');
  data.users.forEach((u) => console.log(`  ${u.peran.padEnd(12)} ${u.email}`));
}

if (require.main === module) run();

module.exports = { build, run, DB_PATH };
