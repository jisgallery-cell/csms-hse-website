// index.js — zero-dependency HTTP server for CSMS HSE (PT Expro Yard Cibitung)
// Boots the API (server/routes/*) and serves the static frontend (public/).
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const db = require('./db');
const seed = require('./seed');
const { readBody, sendJson, sendError } = require('./utils');
const { requireAuth } = require('./auth');

const authRoutes = require('./routes/auth');
const proyekRoutes = require('./routes/kontraktor'); // file historis: sekarang rute Proyek
const pjaRoutes = require('./routes/prequalification'); // file historis: sekarang Pre Job Assessment
const wipRoutes = require('./routes/monitoring'); // file historis: sekarang WIP Assessment + temuan
const finalRoutes = require('./routes/evaluasi'); // file historis: sekarang Final Evaluation
const approvalRoutes = require('./routes/approval');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const notifRoutes = require('./routes/notifications');
const ptwRoutes = require('./routes/ptw');
const mcuRoutes = require('./routes/mcu');
const facilityRoutes = require('./routes/facility');
const publicRoutes = require('./routes/public');

const { UPLOAD_DIR } = require('./config');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// --- Ensure DB seeded on first boot ---
if (!fs.existsSync(seed.DB_PATH)) {
  console.log('Belum ada database, menjalankan seed awal...');
  seed.run();
}
db.ensureLoaded();

const ALL_ROLES_AUTH = null; // any authenticated user

const routes = [];
function route(method, pattern, roles, handler) {
  const paramNames = [];
  const regexStr = pattern.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ method, regex, paramNames, handler: requireAuth(roles, handler) });
}
function publicRoute(method, pattern, handler) {
  const paramNames = [];
  const regexStr = pattern.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ method, regex, paramNames, handler: async (req, res, ctx) => handler(req, res, ctx, ctx.body, ctx.query, ctx.params) });
}

// --- Auth ---
publicRoute('POST', '/api/auth/login', async (req, res, ctx, body) => authRoutes.login(req, res, ctx, body));
publicRoute('POST', '/api/auth/logout', authRoutes.logout);
publicRoute('GET', '/api/auth/me', authRoutes.me);

// --- Proyek ---
route('GET', '/api/proyek', ALL_ROLES_AUTH, (req, res, ctx) => proyekRoutes.listProyek(req, res, ctx, ctx.body, ctx.query));
route('POST', '/api/proyek', ['Admin HSE', 'Admin Sistem'], (req, res, ctx) => proyekRoutes.createProyek(req, res, ctx, ctx.body));
route('GET', '/api/proyek/:id', ALL_ROLES_AUTH, (req, res, ctx) => proyekRoutes.getProyek(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('PUT', '/api/proyek/:id', ALL_ROLES_AUTH, (req, res, ctx) => proyekRoutes.updateProyek(req, res, ctx, ctx.body, ctx.query, ctx.params));

// --- Tahap 1: Pre Job Assessment ---
route('GET', '/api/pja', ALL_ROLES_AUTH, (req, res, ctx) => pjaRoutes.listPQ(req, res, ctx, ctx.body, ctx.query));
route('POST', '/api/pja', ALL_ROLES_AUTH, (req, res, ctx) => pjaRoutes.createPQ(req, res, ctx, ctx.body));
route('GET', '/api/pja/:id', ALL_ROLES_AUTH, (req, res, ctx) => pjaRoutes.getPQ(req, res, ctx, ctx.body, ctx.query, ctx.params));

// --- Tahap 2: Work In Progress Assessment + Temuan & Tindakan ---
route('GET', '/api/wip', ALL_ROLES_AUTH, (req, res, ctx) => wipRoutes.listWIP(req, res, ctx, ctx.body, ctx.query));
route('POST', '/api/wip', ALL_ROLES_AUTH, (req, res, ctx) => wipRoutes.createWIP(req, res, ctx, ctx.body));
route('GET', '/api/wip/:id', ALL_ROLES_AUTH, (req, res, ctx) => wipRoutes.getWIP(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('GET', '/api/monitoring', ALL_ROLES_AUTH, (req, res, ctx) => wipRoutes.listCA(req, res, ctx, ctx.body, ctx.query));
route('POST', '/api/monitoring', ALL_ROLES_AUTH, (req, res, ctx) => wipRoutes.createCA(req, res, ctx, ctx.body));
route('PUT', '/api/monitoring/:id', ALL_ROLES_AUTH, (req, res, ctx) => wipRoutes.updateCA(req, res, ctx, ctx.body, ctx.query, ctx.params));

// --- Tahap 3: Final Evaluation ---
route('GET', '/api/evaluasi', ALL_ROLES_AUTH, (req, res, ctx) => finalRoutes.listEval(req, res, ctx, ctx.body, ctx.query));
route('POST', '/api/evaluasi', ALL_ROLES_AUTH, (req, res, ctx) => finalRoutes.createEval(req, res, ctx, ctx.body));

// --- PTW Digital (tertaut ke Proyek, direview lewat /api/approval) ---
route('GET', '/api/ptw', ALL_ROLES_AUTH, (req, res, ctx) => ptwRoutes.listPTW(req, res, ctx, ctx.body, ctx.query));
route('POST', '/api/ptw', ALL_ROLES_AUTH, (req, res, ctx) => ptwRoutes.createPTW(req, res, ctx, ctx.body));
route('GET', '/api/ptw/:id', ALL_ROLES_AUTH, (req, res, ctx) => ptwRoutes.getPTW(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('PUT', '/api/ptw/:id', ALL_ROLES_AUTH, (req, res, ctx) => ptwRoutes.updatePTW(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('POST', '/api/ptw/:id/validasi-harian', ALL_ROLES_AUTH, (req, res, ctx) => ptwRoutes.addValidasiHarian(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('PUT', '/api/ptw/:id/selesai', ALL_ROLES_AUTH, (req, res, ctx) => ptwRoutes.selesaikanPTW(req, res, ctx, ctx.body, ctx.query, ctx.params));

// --- Medical Checkup (MCU) roster ---
route('GET', '/api/mcu', ALL_ROLES_AUTH, (req, res, ctx) => mcuRoutes.listMCU(req, res, ctx, ctx.body, ctx.query));
route('POST', '/api/mcu', ALL_ROLES_AUTH, (req, res, ctx) => mcuRoutes.createMCU(req, res, ctx, ctx.body));
route('GET', '/api/mcu/:id', ALL_ROLES_AUTH, (req, res, ctx) => mcuRoutes.getMCU(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('PUT', '/api/mcu/:id', ALL_ROLES_AUTH, (req, res, ctx) => mcuRoutes.updateMCU(req, res, ctx, ctx.body, ctx.query, ctx.params));

// --- Facility/Workshop Compliance (internal, tidak terikat proyek) ---
route('GET', '/api/facility', ALL_ROLES_AUTH, (req, res, ctx) => facilityRoutes.listFinding(req, res, ctx, ctx.body, ctx.query));
route('POST', '/api/facility', ALL_ROLES_AUTH, (req, res, ctx) => facilityRoutes.createFinding(req, res, ctx, ctx.body));
route('GET', '/api/facility/:id', ALL_ROLES_AUTH, (req, res, ctx) => facilityRoutes.getFinding(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('PUT', '/api/facility/:id', ALL_ROLES_AUTH, (req, res, ctx) => facilityRoutes.updateFinding(req, res, ctx, ctx.body, ctx.query, ctx.params));

// --- Approval (Reviewer) ---
route('GET', '/api/approval', ALL_ROLES_AUTH, (req, res, ctx) => approvalRoutes.listApproval(req, res, ctx, ctx.body, ctx.query));
route('PUT', '/api/approval/:id/decision', ['Reviewer', 'Admin Sistem'], (req, res, ctx) => approvalRoutes.decideApproval(req, res, ctx, ctx.body, ctx.query, ctx.params));

// --- Dashboard ---
route('GET', '/api/dashboard/summary', ALL_ROLES_AUTH, (req, res, ctx) => dashboardRoutes.summary(req, res, ctx, ctx.body, ctx.query));
route('GET', '/api/dashboard/export.csv', ALL_ROLES_AUTH, (req, res, ctx) => dashboardRoutes.exportCsv(req, res, ctx, ctx.body, ctx.query));

// --- Administrasi: User Management & Master Data ---
route('GET', '/api/admin/users', ['Admin Sistem'], adminRoutes.listUsers);
route('POST', '/api/admin/users', ['Admin Sistem'], (req, res, ctx) => adminRoutes.createUser(req, res, ctx, ctx.body));
route('PUT', '/api/admin/users/:id', ['Admin Sistem'], (req, res, ctx) => adminRoutes.updateUser(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('GET', '/api/admin/config', ['Admin Sistem', 'Admin HSE'], adminRoutes.getConfig);
route('PUT', '/api/admin/config', ['Admin Sistem'], (req, res, ctx) => adminRoutes.updateConfig(req, res, ctx, ctx.body));
route('GET', '/api/admin/masterdata', ALL_ROLES_AUTH, adminRoutes.getMasterData);
route('POST', '/api/admin/masterdata/:list', ['Admin Sistem', 'Admin HSE'], (req, res, ctx) => adminRoutes.addMasterItem(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('GET', '/api/admin/auditlog', ['Admin Sistem', 'Admin HSE'], (req, res, ctx) => adminRoutes.getAuditLog(req, res, ctx, ctx.body, ctx.query));

// --- Barcode Daily Safety Finding (publik, TANPA LOGIN) ---
publicRoute('GET', '/api/public/proyek-list', (req, res, ctx) => publicRoutes.listProyekPublic(req, res, ctx));
publicRoute('GET', '/api/public/proyek/:id', (req, res, ctx, body, query, params) => publicRoutes.getProyekPublic(req, res, ctx, body, query, params));
publicRoute('GET', '/api/public/pekerja-lookup', (req, res, ctx, body, query) => publicRoutes.lookupPekerja(req, res, ctx, body, query));
publicRoute('GET', '/api/public/kategori-temuan', (req, res, ctx) => publicRoutes.getKategoriTemuan(req, res, ctx));
publicRoute('POST', '/api/public/checkin', (req, res, ctx, body) => publicRoutes.submitCheckin(req, res, ctx, body));

// --- Notifikasi ---
route('GET', '/api/notifications', ALL_ROLES_AUTH, (req, res, ctx) => notifRoutes.listNotifications(req, res, ctx, ctx.body, ctx.query));
route('PUT', '/api/notifications/:id/read', ALL_ROLES_AUTH, (req, res, ctx) => notifRoutes.markRead(req, res, ctx, ctx.body, ctx.query, ctx.params));
route('PUT', '/api/notifications/read-all', ALL_ROLES_AUTH, (req, res, ctx) => notifRoutes.markAllRead(req, res, ctx));

// --- Static file serving (public/ + uploads/) ---
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  // Halaman publik Barcode Daily Safety Finding: /report/:id_proyek — id
  // dibaca di sisi client dari URL, jadi setiap /report/* selalu melayani
  // file statis report.html yang sama.
  if (pathname.startsWith('/report/') || pathname === '/report') {
    return fs.readFile(path.join(PUBLIC_DIR, 'report.html'), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  }
  let rel = pathname === '/' ? '/index.html' : pathname;
  let base = PUBLIC_DIR;
  if (rel.startsWith('/uploads/')) {
    base = UPLOAD_DIR;
    rel = rel.replace('/uploads', '');
  }
  const filePath = path.normalize(path.join(base, rel));
  if (!filePath.startsWith(base)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (!pathname.startsWith('/api/') && !pathname.startsWith('/uploads/')) {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, data2) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data2);
        });
        return;
      }
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  if (!pathname.startsWith('/api/')) {
    return serveStatic(req, res, pathname);
  }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.regex);
    if (!m) continue;
    const params = {};
    r.paramNames.forEach((name, i) => { params[name] = m[i + 1]; });
    try {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const ctx = { params, query: parsed.query, body };
      await r.handler(req, res, ctx);
    } catch (err) {
      console.error(err);
      sendError(res, 500, 'Terjadi kesalahan pada server: ' + err.message);
    }
    return;
  }
  sendError(res, 404, 'Endpoint tidak ditemukan.');
});

server.listen(PORT, () => {
  console.log(`CSMS HSE server berjalan di http://localhost:${PORT}`);
});
