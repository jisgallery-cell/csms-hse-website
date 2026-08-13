const db = require('../db');
const { sendJson, sendError, verifyPassword, nowISO } = require('../utils');
const { createSession, destroySession, getCurrentUser, logAudit } = require('../auth');

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

async function login(req, res, ctx, body) {
  const { email, password } = body;
  if (!email || !password) return sendError(res, 400, 'Email dan password wajib diisi.');
  const user = db.all('users').find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return sendError(res, 401, 'Email atau password salah.');
  }
  if (user.status_akun !== 'Aktif') return sendError(res, 403, 'Akun tidak aktif. Hubungi Admin Sistem.');
  createSession(res, user);
  db.updateById('users', 'id_user', user.id_user, { log_login_terakhir: nowISO() });
  logAudit(user, 'Login ke sistem', user.email);
  sendJson(res, 200, { user: publicUser(user) });
}

async function logout(req, res, ctx) {
  const user = getCurrentUser(req);
  destroySession(req, res);
  if (user) logAudit(user, 'Logout dari sistem', user.email);
  sendJson(res, 200, { ok: true });
}

async function me(req, res, ctx) {
  const user = getCurrentUser(req);
  if (!user) return sendError(res, 401, 'Belum login.');
  sendJson(res, 200, { user: publicUser(user) });
}

module.exports = { login, logout, me, publicUser };
