// business.js — aturan bisnis lintas modul untuk alur inti CSMS PT Expro
// Yard Cibitung: Pre Job Assessment -> Work In Progress Assessment -> Final
// Evaluation, dijalankan "on read" (tanpa cron) lewat runAllSyncs().
const db = require('./db');
const { todayISO, daysBetween } = require('./utils');
const { notify } = require('./notifications');

// Tenggat corrective action lewat & belum Closed -> "Overdue"
function syncOverdueCorrectiveActions() {
  const today = todayISO();
  let changed = false;
  db.table('corrective_action').forEach((ca) => {
    if (ca.status !== 'Closed' && ca.status !== 'Overdue' && ca.tenggat_waktu < today) {
      ca.status = 'Overdue';
      changed = true;
    }
  });
  if (changed) db.persist();
}

// "Pengingat Assessment": proyek Aktif dengan PJA Approved tapi belum ada
// WIP Assessment baru dalam N hari (system_config.wip_reminder_interval_hari)
// -> notifikasi ke Admin HSE & PIC proyek terkait. Idempotent per hari
// (ditandai di field _last_wip_reminder_date pada proyek).
function syncWipReminders() {
  const cfg = db.ensureLoaded().system_config;
  const intervalHari = cfg.wip_reminder_interval_hari || 14;
  const today = todayISO();
  let changed = false;

  db.table('proyek').forEach((p) => {
    if (p.status_proyek !== 'Aktif') return;
    const pja = db.table('pja').find((x) => x.id_proyek === p.id_proyek);
    if (!pja || pja.status !== 'Approved') return;

    const wipList = db.table('wip').filter((w) => w.id_proyek === p.id_proyek)
      .sort((a, b) => (a.tanggal_submit < b.tanggal_submit ? 1 : -1));
    const acuanTanggal = wipList[0] ? wipList[0].tanggal_submit : pja.tanggal_review || pja.tanggal_submit;
    const hariBerlalu = daysBetween(acuanTanggal, today);

    if (hariBerlalu >= intervalHari && p._last_wip_reminder_date !== today) {
      notify('Admin HSE', 'pengingat_assessment', 'Pengingat WIP Assessment',
        `Proyek "${p.nama_proyek}" belum ada Work In Progress Assessment baru dalam ${hariBerlalu} hari.`, p.id_proyek);
      notify('PIC', 'pengingat_assessment', 'Pengingat WIP Assessment',
        `Proyek Anda "${p.nama_proyek}" perlu WIP Assessment baru — terakhir dicek ${hariBerlalu} hari lalu.`, p.id_proyek, p.id_proyek);
      p._last_wip_reminder_date = today;
      changed = true;
    }
  });
  if (changed) db.persist();
}

// PTW Aktif yang tanggal_selesai-nya sudah lewat -> "Kadaluwarsa"
function syncPTWExpiry() {
  const today = todayISO();
  let changed = false;
  db.table('ptw').forEach((p) => {
    if (p.status === 'Aktif' && p.tanggal_selesai && p.tanggal_selesai < today) {
      p.status = 'Kadaluwarsa';
      changed = true;
    }
  });
  if (changed) db.persist();
}

// Label warna reminder MCU: 90/60/30 hari sebelum tanggal_berlaku_sampai.
function mcuTierFor(pekerja, today) {
  if (!pekerja.tanggal_berlaku_sampai) return null;
  const sisaHari = daysBetween(today, pekerja.tanggal_berlaku_sampai);
  if (sisaHari < 0) return 'Kedaluwarsa';
  if (sisaHari <= 30) return 'Merah';
  if (sisaHari <= 60) return 'Kuning';
  if (sisaHari <= 90) return 'Hijau';
  return null;
}

// Reminder MCU 3 tahap (90/60/30 hari + Kedaluwarsa) ke PIC proyek & Admin HSE.
// Idempotent per tahap (_mcu_reminder_stage disimpan di record pekerja, hanya
// notify ulang kalau tahapnya berubah/naik).
function syncMcuReminders() {
  const today = todayISO();
  let changed = false;
  db.table('pekerja_mcu').forEach((pk) => {
    const tier = mcuTierFor(pk, today);
    if (tier && pk._mcu_reminder_stage !== tier) {
      const proyek = db.findById('proyek', 'id_proyek', pk.id_proyek);
      const namaProyek = proyek ? proyek.nama_proyek : pk.id_proyek;
      const sisaHari = daysBetween(today, pk.tanggal_berlaku_sampai);
      const pesanSisa = tier === 'Kedaluwarsa' ? `sudah kedaluwarsa ${Math.abs(sisaHari)} hari lalu` : `akan kedaluwarsa dalam ${sisaHari} hari`;
      notify('Admin HSE', 'reminder_mcu', `Pengingat MCU (${tier})`,
        `MCU "${pk.nama}" pada proyek "${namaProyek}" ${pesanSisa}.`, pk.id_pekerja_mcu);
      notify('PIC', 'reminder_mcu', `Pengingat MCU (${tier})`,
        `MCU pekerja "${pk.nama}" di proyek Anda ${pesanSisa}.`, pk.id_pekerja_mcu, pk.id_proyek);
      pk._mcu_reminder_stage = tier;
      changed = true;
    }
  });
  if (changed) db.persist();
}

// Tenggat temuan Facility/Workshop Compliance lewat & belum Closed -> "Overdue"
function syncFacilityOverdue() {
  const today = todayISO();
  let changed = false;
  db.table('facility_finding').forEach((f) => {
    if (f.status !== 'Closed' && f.status !== 'Overdue' && f.tenggat_waktu < today) {
      f.status = 'Overdue';
      changed = true;
    }
  });
  if (changed) db.persist();
}

function runAllSyncs() {
  syncOverdueCorrectiveActions();
  syncWipReminders();
  syncPTWExpiry();
  syncMcuReminders();
  syncFacilityOverdue();
}

module.exports = {
  syncOverdueCorrectiveActions,
  syncWipReminders,
  syncPTWExpiry,
  syncMcuReminders,
  syncFacilityOverdue,
  mcuTierFor,
  runAllSyncs,
};
