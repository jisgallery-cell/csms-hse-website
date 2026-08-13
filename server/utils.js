// utils.js — shared helpers (no external deps)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    const MAX = 25 * 1024 * 1024; // 25MB cap (covers base64 file uploads up to ~5MB raw)
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error('Payload terlalu besar'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Body bukan JSON yang valid'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push('Path=/');
  parts.push('HttpOnly');
  parts.push('SameSite=Lax');
  if (opts.maxAgeSeconds) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  if (opts.expire) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  const existing = res.getHeader('Set-Cookie');
  const cookieStr = parts.join('; ');
  if (existing) {
    res.setHeader('Set-Cookie', Array.isArray(existing) ? existing.concat(cookieStr) : [existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', cookieStr);
  }
}

function genId(prefix) {
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${Date.now().toString(36)}${rand}`.toUpperCase();
}

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, useSalt, 64).toString('hex');
  return `${useSalt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(':') === -1) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch (e) {
    return false;
  }
}

// --- Business-rule calculations (mirrors SRS §3.3, §3.6) ---

function computeRiskLevel(likelihood, severity) {
  const skor = Number(likelihood) * Number(severity);
  let level;
  if (skor >= 15) level = 'Kritis';
  else if (skor >= 9) level = 'Tinggi';
  else if (skor >= 4) level = 'Sedang';
  else level = 'Rendah';
  return { skor_risiko: skor, level_risiko: level };
}

function computeEvaluationRating(skorTotal) {
  if (skorTotal >= 85) return 'A';
  if (skorTotal >= 70) return 'B';
  if (skorTotal >= 55) return 'C';
  return 'D';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// Menulis lampiran base64 (PJA/WIP/Final Evaluation, dsb.) ke UPLOAD_DIR dan
// mengembalikan array {nama_file, file_path} siap disimpan ke db.json —
// menghindari string base64 raksasa tersimpan langsung di database.
function saveAttachments(lampiran, uploadDir) {
  if (!Array.isArray(lampiran)) return [];
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  return lampiran.map((item) => {
    if (!item || !item.file_base64) return item;
    const safeName = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${String(item.nama_file || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const buf = Buffer.from(String(item.file_base64).split(',').pop(), 'base64');
    if (buf.length > 5 * 1024 * 1024) throw new Error(`Ukuran file "${item.nama_file}" melebihi 5MB.`);
    fs.writeFileSync(path.join(uploadDir, safeName), buf);
    return { nama_file: item.nama_file || safeName, file_path: `/uploads/${safeName}` };
  });
}

module.exports = {
  sendJson,
  sendError,
  readBody,
  parseCookies,
  setCookie,
  genId,
  genToken,
  hashPassword,
  verifyPassword,
  computeRiskLevel,
  computeEvaluationRating,
  todayISO,
  nowISO,
  daysBetween,
  saveAttachments,
};
