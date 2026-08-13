const db = require('../db');
const { sendJson, sendError } = require('../utils');
const { runAllSyncs } = require('../business');

function avg(nums) {
  const valid = nums.filter((n) => typeof n === 'number' && !isNaN(n));
  if (valid.length === 0) return 0;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

// Ringkasan real-time diambil langsung dari data operasional
async function summary(req, res, ctx, body, query) {
  runAllSyncs();
  let proyekList = db.all('proyek');
  if (ctx.user.peran === 'PIC') proyekList = proyekList.filter((p) => p.id_proyek === ctx.user.id_proyek);
  const proyekIds = new Set(proyekList.map((p) => p.id_proyek));

  const pjaList = db.all('pja').filter((x) => proyekIds.has(x.id_proyek));
  const wipList = db.all('wip').filter((x) => proyekIds.has(x.id_proyek));
  const finalList = db.all('final_evaluation').filter((x) => proyekIds.has(x.id_proyek));

  const totalProyek = proyekList.length;
  const aktif = proyekList.filter((p) => p.status_proyek === 'Aktif').length;
  const pjaMenunggu = pjaList.filter((x) => x.status === 'Menunggu Review').length;
  const wipMenunggu = wipList.filter((x) => x.status === 'Menunggu Review').length;
  const finalMenunggu = finalList.filter((x) => x.status === 'Menunggu Review').length;
  const caOverdue = db.all('corrective_action').filter((c) => c.status === 'Overdue' && proyekIds.has(c.id_proyek)).length;

  const complianceRata = avg([...pjaList, ...wipList, ...finalList].map((x) => x.compliance_percent));

  const riskDist = { Rendah: 0, Sedang: 0, Tinggi: 0, Kritis: 0 };
  proyekList.filter((p) => p.status_proyek === 'Aktif' && p.tingkat_risiko_terkini).forEach((p) => {
    riskDist[p.tingkat_risiko_terkini] = (riskDist[p.tingkat_risiko_terkini] || 0) + 1;
  });

  const menungguApproval = db.all('approval').filter((a) => a.status === 'Menunggu' &&
    (ctx.user.peran !== 'Reviewer' || a.approver === ctx.user.id_user));

  let auditLog = db.all('audit_log').sort((a, b) => (a.waktu < b.waktu ? 1 : -1)).slice(0, 8);

  // tren bulanan pengajuan PJA (jumlah + rata-rata compliance)
  const trendMap = {};
  pjaList.forEach((x) => {
    const bulan = (x.tanggal_submit || '').slice(0, 7);
    if (!bulan) return;
    if (!trendMap[bulan]) trendMap[bulan] = { bulan, jumlah: 0, totalCompliance: 0 };
    trendMap[bulan].jumlah += 1;
    trendMap[bulan].totalCompliance += x.compliance_percent || 0;
  });
  const trend = Object.values(trendMap).sort((a, b) => (a.bulan < b.bulan ? -1 : 1))
    .map((t) => ({ bulan: t.bulan, jumlah: t.jumlah, rataCompliance: Math.round((t.totalCompliance / t.jumlah) * 10) / 10 }));

  sendJson(res, 200, {
    kpi: {
      proyek_terdaftar: totalProyek,
      proyek_aktif: aktif,
      pja_menunggu: pjaMenunggu,
      wip_menunggu: wipMenunggu,
      final_menunggu: finalMenunggu,
      corrective_action_overdue: caOverdue,
      compliance_rata: complianceRata,
    },
    distribusi_risiko: riskDist,
    approval_menunggu: menungguApproval.length,
    aktivitas_terbaru: auditLog,
    tren_bulanan: trend,
  });
}

// Ekspor CSV (native, no deps).
async function exportCsv(req, res, ctx, body, query) {
  runAllSyncs();
  let rows = db.all('proyek');
  if (ctx.user.peran === 'PIC') rows = rows.filter((p) => p.id_proyek === ctx.user.id_proyek);
  const headers = ['id_proyek', 'nama_proyek', 'nama_client', 'area', 'jenis_pekerjaan', 'status_proyek', 'tingkat_risiko_terkini', 'tanggal_mulai'];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  rows.forEach((r) => lines.push(headers.map((h) => esc(r[h])).join(',')));
  const filterNote = `# CSMS HSE Export (PT Expro Yard Cibitung) - dibuat: ${new Date().toISOString()}`;
  const csv = filterNote + '\n' + lines.join('\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="csms-ringkasan-proyek.csv"',
  });
  res.end(csv);
}

module.exports = { summary, exportCsv };
