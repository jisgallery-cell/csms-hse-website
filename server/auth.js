// auth.js — in-memory session store + RBAC helpers
const db = require('./db');
const { parseCookies, setCookie, genToken, sendError, nowISO } = require('./utils');

const SESSION_COOKIE = 'csms_session';
const sessions = new Map(); // token -> { id_user, createdAt }

function createSession(res, user) {
  const token = genToken();
  sessions.set(token, { id_user: user.id_user, createdAt: nowISO() });
  setCookie(res, SESSION_COOKIE, token, { maxAgeSeconds: 60 * 60 * 8 }); // 8h
  return token;
}

function destroySession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) sessions.delete(token);
  setCookie(res, SESSION_COOKIE, '', { expire: true });
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  const user = db.findById('users', 'id_user', sess.id_user);
  if (!user || user.status_akun !== 'Aktif') return null;
  return user;
}

// Wraps a route handler, requiring authentication.
// allowedRoles: array of role strings, or null/[] to allow any authenticated user.
function requireAuth(allowedRoles, handler) {
  return async (req, res, ctx) => {
    const user = getCurrentUser(req);
    if (!user) return sendError(res, 401, 'Belum login. Silakan login terlebih dahulu.');
    if (allowedRoles && allowedRoles.length && !allowedRoles.includes(user.peran)) {
      return sendError(res, 403, `Akses ditolak untuk peran "${user.peran}".`);
    }
    ctx.user = user;
    return handler(req, res, ctx);
  };
}

function logAudit(actor, aksi, target) {
  db.insert('audit_log', {
    id: db.nextSeq('audit_log'),
    actor: actor ? actor.id_user : 'SYSTEM',
    actor_nama: actor ? actor.nama : 'Sistem',
    aksi,
    target,
    waktu: nowISO(),
  });
}

module.exports = { createSession, destroySession, getCurrentUser, requireAuth, logAudit };
