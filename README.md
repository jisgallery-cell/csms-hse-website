# CSMS HSE — Contractor Safety Management System

Website enterprise untuk mendigitalkan siklus keselamatan kontraktor: registrasi,
pre-qualification, risk assessment, approval berjenjang, monitoring & corrective
action, evaluasi kinerja, dashboard real-time, dan administrasi sistem.

Dibangun berdasarkan `SRS_CSMS_HSE.docx` (v1.0, JS Digital) dan mengembangkan
`csms-hse-prototype.html` dari kickoff deck menjadi aplikasi full-stack yang
berfungsi (bukan lagi mockup statis).

## Menjalankan aplikasi

Tidak perlu `npm install` — backend hanya memakai modul bawaan Node.js (tanpa
dependency eksternal), jadi bisa langsung dijalankan:

```bash
node server/index.js
```

Lalu buka **http://localhost:3000** di browser. Port bisa diubah lewat env var `PORT`.

Database awal (data/db.json) sudah berisi data demo dan akan otomatis dibuat
saat pertama kali server dijalankan jika belum ada. Untuk mengembalikan ke data
demo awal kapan saja:

```bash
npm run seed
```

### Akun demo (password untuk semua: `csms2026`)

| Peran | Email |
|---|---|
| Admin HSE | admin.hse@csms.local |
| Approver | approver1@csms.local / approver2@csms.local |
| Manajemen | manajemen@csms.local |
| Admin Sistem | admin.sistem@csms.local |
| Kontraktor | pic@alamjayateknik.co.id (dan PIC kontraktor lain di data demo) |

Kontraktor baru juga bisa mendaftar mandiri lewat tombol "Daftar sebagai
kontraktor" di halaman login (FR-REG-01).

## Struktur proyek

```
server/
  index.js         Router HTTP + static file server (murni Node core, tanpa Express)
  db.js             Datastore JSON (data/db.json) dengan API ala tabel
  seed.js           Data demo awal (kontraktor, user, RA, approval, CA, evaluasi)
  auth.js           Session cookie + RBAC per peran
  business.js       Aturan bisnis lintas modul (dokumen kedaluwarsa, CA overdue)
  utils.js          Helper umum (hashing, kalkulasi risiko/rating, dsb.)
  routes/           Satu file per modul SRS (kontraktor, prequalification, ...)
public/
  index.html        Shell SPA (layar login + layar aplikasi)
  css/style.css     Desain diperluas dari prototype kickoff (dark HSE theme)
  js/app.js         Router sisi klien + navigasi berbasis peran
  js/views/*.js      Satu file per modul (dashboard, kontraktor, risk, dst.)
uploads/            Berkas dokumen/bukti yang diunggah pengguna
data/db.json        "Database" JSON (lihat catatan produksi di bawah)
```

## Modul & pemetaan ke SRS

| # | Modul SRS | Endpoint utama | Frontend |
|---|---|---|---|
| 3.1 | Registrasi & Master Data Kontraktor | `/api/kontraktor*`, `/api/dokumen/:id/verifikasi` | Data kontraktor |
| 3.2 | Pre-Qualification | `/api/prequalification` | Pre-Qualification |
| 3.3 | Risk Assessment | `/api/riskassessment` | Risk assessment (matriks 5×5) |
| 3.4 | Approval Workflow | `/api/approval` | Approval |
| 3.5 | Monitoring & Corrective Action | `/api/monitoring` | Monitoring pekerjaan |
| 3.6 | Evaluasi Kinerja | `/api/evaluasi` | Evaluasi kinerja |
| 3.7 | Dashboard | `/api/dashboard/*` | Dashboard |
| 3.8 | Administrasi & Pengaturan | `/api/admin/*` | Administrasi & Pengaturan (khusus Admin Sistem) |

## Aturan bisnis yang sudah diimplementasikan

- Dokumen kedaluwarsa otomatis berubah "Tidak Valid"; jika dokumen wajib tidak
  valid, kontraktor otomatis "Tidak Aktif" (§3.1).
- Skor & hasil Pre-Qualification dihitung otomatis dari checklist terbobot,
  ambang lolos dapat dikonfigurasi (default 70) (§3.2).
- Skor & level risiko (Rendah/Sedang/Tinggi/Kritis) dihitung otomatis dari
  Likelihood × Severity (§3.3).
- Risk assessment Tinggi wajib 1 approver, Kritis wajib 2 approver berjenjang;
  penolakan mengembalikan status ke pengaju (§3.4).
- Corrective action otomatis berstatus "Overdue" saat tenggat terlewati;
  penutupan wajib bukti penyelesaian (§3.5).
- Evaluasi kinerja: skor gabungan terbobot (dokumen/keselamatan/CA, default
  30/40/30), rating A–D otomatis, deteksi 2 periode rating D berturut-turut
  (§3.6).
- Dashboard membaca langsung dari data operasional yang sama (tanpa
  sinkronisasi terpisah) dan mengikuti visibilitas berbasis peran (§3.7).
- Log aktivitas bersifat append-only untuk audit (§3.8).
- Role-based access control untuk 5 peran: Admin HSE, Kontraktor/Vendor,
  Approver, Manajemen, Admin Sistem — sesuai tabel peran di SRS §2.2.

## Catatan untuk tahap produksi

Fase ini adalah MVP yang bisa langsung dijalankan tanpa instalasi dependency
(sandbox pengembangan tidak memiliki akses ke registry npm). Sebelum go-live,
pertimbangkan:

- **Database**: ganti `server/db.js` (datastore JSON) dengan PostgreSQL/MySQL
  untuk skala di atas ~10.000 baris data dan akses konkuren yang lebih aman.
  Struktur field sudah mengikuti field dictionary di SRS sehingga migrasi
  skema relatif langsung.
- **Auth**: password sudah di-hash dengan `crypto.scrypt` (bawaan Node, bukan
  plaintext), tapi pertimbangkan menambahkan 2FA untuk peran Admin sesuai
  kebutuhan non-fungsional keamanan di SRS §4.
- **HTTPS/TLS**: jalankan di belakang reverse proxy (nginx/Caddy) dengan TLS
  untuk memenuhi kebutuhan non-fungsional keamanan.
- **Notifikasi**: SRS meminta notifikasi H-30/H-14/H-7 sebelum dokumen
  kedaluwarsa dan reminder H-3 untuk corrective action — saat ini sync
  berjalan saat data diakses (on-read), belum ada pengiriman email terjadwal.
  Tambahkan job scheduler (mis. cron) + layanan email pada fase berikutnya.
- **Ekspor**: ekspor CSV sudah tersedia; ekspor PDF saat ini memakai
  print-to-PDF browser. Untuk PDF/Excel generator sisi server, tambahkan
  library sesuai kebutuhan saat lingkungan deployment sudah memiliki akses
  package registry.
- **File storage**: dokumen/bukti disimpan di folder lokal `uploads/`; untuk
  produksi pertimbangkan object storage (S3-compatible) dengan enkripsi saat
  disimpan sesuai kebutuhan non-fungsional di SRS §4.

## Dokumen sumber

- `SRS_CSMS_HSE.docx` — System Requirement Specification v1.0
- `csms-hse-kickoff11.pptx` — Kickoff presentation
- `csms-hse-prototype.html` — Prototype dashboard awal (dikembangkan menjadi
  aplikasi ini)
