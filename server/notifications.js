// notifications.js — lightweight in-app notifications.
// Notifications are role-targeted (e.g. every "Admin HSE" user sees the same
// pool) rather than per-user, which keeps this simple for a small internal HSE team.
const db = require('./db');
const { genId, nowISO } = require('./utils');

// targetProyekId (optional): when set, only Staf Lapangan users assigned to
// that project see the notification. Leave unset for role-wide broadcasts
// (e.g. every Admin HSE user).
function notify(targetRole, tipe, judul, pesan, terkaitId, targetProyekId) {
  db.insert('notifications', {
    id: genId('NOTIF'),
    target_role: targetRole,
    target_proyek_id: targetProyekId || null,
    tipe, // 'proyek_baru' | 'dokumen' | 'risk_assessment' | 'corrective_action' | 'ptw' | 'mcu' | 'reminder_dokumen' | 'reminder_mcu' | 'facility'
    judul,
    pesan,
    terkait_id: terkaitId || null,
    dibaca: false,
    waktu: nowISO(),
  });
}

module.exports = { notify };
