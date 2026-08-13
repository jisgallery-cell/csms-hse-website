import { api } from '../api.js';
import { esc, timeAgo, toast } from '../ui.js';
import { navigate } from '../app.js';

let riskChartInstance = null;
let trendChartInstance = null;

// Peta kartu KPI -> tujuan menu (key NAV + opts filter) saat diklik.
const KPI_TARGETS = {
  'kpi-proyek-terdaftar': ['proyek', {}],
  'kpi-proyek-aktif': ['proyek', { status: 'Aktif' }],
  'kpi-pja-menunggu': ['pja', {}],
  'kpi-wip-menunggu': ['wip', { tab: 'wip' }],
  'kpi-final-menunggu': ['evaluasi', {}],
  'kpi-ca-overdue': ['wip', { tab: 'ca' }],
  'kpi-compliance': ['proyek', {}],
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export async function renderDashboard(root, user) {
  root.innerHTML = `<div class="empty-state">Memuat ringkasan…</div>`;
  const { kpi, distribusi_risiko, approval_menunggu, aktivitas_terbaru, tren_bulanan } = await api.get('/api/dashboard/summary');

  const riskOrder = [['Rendah', '--green'], ['Sedang', '--amber'], ['Tinggi', '--orange'], ['Kritis', '--red']];

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Ringkasan CSMS</h1>
        <p>Status kepatuhan &amp; keselamatan Pre Job Assessment, WIP Assessment, dan Final Evaluation${user.peran === 'PIC' ? ' — proyek Anda' : ''}</p>
      </div>
      <button class="btn-ghost no-print" id="btn-export-csv">⤓ Ekspor CSV</button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card clickable" id="kpi-proyek-terdaftar" tabindex="0"><div class="bar blue"></div>
        <div class="label">Proyek terdaftar</div>
        <div class="value">${kpi.proyek_terdaftar}</div>
        <div class="delta" style="color:var(--text-dim)">total tercatat</div>
      </div>
      <div class="kpi-card clickable" id="kpi-proyek-aktif" tabindex="0"><div class="bar green"></div>
        <div class="label">Proyek aktif</div>
        <div class="value">${kpi.proyek_aktif}</div>
        <div class="delta" style="color:var(--text-dim)">${kpi.proyek_terdaftar ? Math.round(kpi.proyek_aktif / kpi.proyek_terdaftar * 100) : 0}% dari total</div>
      </div>
      <div class="kpi-card clickable" id="kpi-pja-menunggu" tabindex="0"><div class="bar amber"></div>
        <div class="label">PJA menunggu review</div>
        <div class="value">${kpi.pja_menunggu}</div>
        <div class="delta" style="color:var(--amber)">perlu ditinjau</div>
      </div>
      <div class="kpi-card clickable" id="kpi-wip-menunggu" tabindex="0"><div class="bar amber"></div>
        <div class="label">WIP menunggu review</div>
        <div class="value">${kpi.wip_menunggu}</div>
        <div class="delta" style="color:var(--amber)">perlu ditinjau</div>
      </div>
      <div class="kpi-card clickable" id="kpi-final-menunggu" tabindex="0"><div class="bar amber"></div>
        <div class="label">Final Evaluation menunggu</div>
        <div class="value">${kpi.final_menunggu}</div>
        <div class="delta" style="color:var(--amber)">perlu ditinjau</div>
      </div>
      <div class="kpi-card clickable" id="kpi-ca-overdue" tabindex="0"><div class="bar red"></div>
        <div class="label">Corrective action overdue</div>
        <div class="value">${kpi.corrective_action_overdue}</div>
        <div class="delta" style="color:var(--red)">lewat tenggat</div>
      </div>
      <div class="kpi-card clickable" id="kpi-compliance" tabindex="0"><div class="bar blue"></div>
        <div class="label">Rata-rata compliance</div>
        <div class="value">${kpi.compliance_rata}%</div>
        <div class="delta" style="color:var(--text-dim)">PJA + WIP + Final</div>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div class="panel">
          <h3>Distribusi tingkat risiko proyek aktif</h3>
          <div class="field-hint" style="margin-bottom:10px;">Arahkan kursor atau klik batang untuk melihat jumlah proyek.</div>
          <div style="height:220px;"><canvas id="chart-risk"></canvas></div>
        </div>
        <div class="panel">
          <h3>Tren pengajuan Pre Job Assessment bulanan</h3>
          <div class="field-hint" style="margin-bottom:10px;">Arahkan kursor atau klik titik untuk melihat jumlah &amp; rata-rata compliance per bulan.</div>
          ${tren_bulanan.length === 0 ? '<div class="empty-state">Belum ada data.</div>' : `<div style="height:240px;"><canvas id="chart-trend"></canvas></div>`}
        </div>
      </div>

      <div class="panel">
        <h3>Aktivitas terbaru</h3>
        ${aktivitas_terbaru.length === 0 ? '<div class="empty-state">Belum ada aktivitas.</div>' : aktivitas_terbaru.map((a) => `
          <div class="activity-item">
            <div class="badge-dot" style="background:var(--blue)"></div>
            <div><div class="txt"><b>${esc(a.target)}</b> — ${esc(a.aksi)}</div><div class="time">${timeAgo(a.waktu).toUpperCase()} · ${esc(a.actor_nama)}</div></div>
          </div>`).join('')}
        ${approval_menunggu ? `<div class="field-hint" style="margin-top:12px;">${approval_menunggu} pengajuan menunggu approval Anda.</div>` : ''}
      </div>
    </div>
  `;

  root.querySelector('#btn-export-csv').onclick = () => { window.open('/api/dashboard/export.csv', '_blank'); };

  Object.entries(KPI_TARGETS).forEach(([id, [key, opts]]) => {
    const el = root.querySelector(`#${id}`);
    if (!el) return;
    const go = () => navigate(key, opts);
    el.onclick = go;
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  renderRiskChart(root, riskOrder, distribusi_risiko);
  if (tren_bulanan.length > 0) renderTrendChart(root, tren_bulanan);
}

function renderRiskChart(root, riskOrder, distribusi_risiko) {
  const canvas = root.querySelector('#chart-risk');
  if (!canvas || !window.Chart) return;
  if (riskChartInstance) { riskChartInstance.destroy(); riskChartInstance = null; }

  const labels = riskOrder.map(([label]) => label);
  const colors = riskOrder.map(([, varName]) => cssVar(varName));
  const values = riskOrder.map(([label]) => distribusi_risiko[label] || 0);

  riskChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Jumlah proyek', data: values, backgroundColor: colors, borderRadius: 6, maxBarThickness: 56 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y} proyek dengan risiko ${ctx.label}`,
          },
        },
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        toast(`${values[idx]} proyek aktif dengan tingkat risiko ${labels[idx]}.`, 'info');
      },
    },
  });
}

function renderTrendChart(root, tren_bulanan) {
  const canvas = root.querySelector('#chart-trend');
  if (!canvas || !window.Chart) return;
  if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }

  const labels = tren_bulanan.map((t) => t.bulan);
  const jumlah = tren_bulanan.map((t) => t.jumlah);
  const compliance = tren_bulanan.map((t) => t.rataCompliance);
  const teal = cssVar('--teal');
  const amber = cssVar('--amber');

  trendChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Jumlah PJA diajukan', data: jumlah, borderColor: teal, backgroundColor: teal, yAxisID: 'y', tension: 0.3, pointRadius: 4, pointHoverRadius: 6 },
        { label: 'Rata-rata compliance (%)', data: compliance, borderColor: amber, backgroundColor: amber, yAxisID: 'y1', tension: 0.3, pointRadius: 4, pointHoverRadius: 6 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.dataset.label.includes('compliance') ? `${ctx.dataset.label}: ${ctx.parsed.y}%` : `${ctx.dataset.label}: ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        y: { type: 'linear', position: 'left', beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Jumlah PJA' } },
        y1: { type: 'linear', position: 'right', beginAtZero: true, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: 'Compliance (%)' } },
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        toast(`${labels[idx]}: ${jumlah[idx]} PJA diajukan, rata-rata compliance ${compliance[idx]}%.`, 'info');
      },
    },
  });
}
