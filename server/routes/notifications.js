const db = require('../db');
const { sendJson } = require('../utils');

async function listNotifications(req, res, ctx, body, query) {
  const rows = db.all('notifications').filter((n) => {
    if (n.target_role !== ctx.user.peran) return false;
    if (n.target_proyek_id && n.target_proyek_id !== ctx.user.id_proyek) return false;
    return true;
  });
  rows.sort((a, b) => (a.waktu < b.waktu ? 1 : -1));
  const limit = Math.min(Number(query.limit) || 30, 100);
  const unread_count = rows.filter((n) => !n.dibaca).length;
  sendJson(res, 200, { data: rows.slice(0, limit), unread_count });
}

async function markRead(req, res, ctx, body, query, params) {
  db.updateById('notifications', 'id', params.id, { dibaca: true });
  sendJson(res, 200, { ok: true });
}

async function markAllRead(req, res, ctx) {
  const rows = db.table('notifications');
  let changed = false;
  rows.forEach((n) => {
    const matchesRole = n.target_role === ctx.user.peran;
    const matchesProyek = !n.target_proyek_id || n.target_proyek_id === ctx.user.id_proyek;
    if (matchesRole && matchesProyek && !n.dibaca) {
      n.dibaca = true;
      changed = true;
    }
  });
  if (changed) db.persist();
  sendJson(res, 200, { ok: true });
}

module.exports = { listNotifications, markRead, markAllRead };
