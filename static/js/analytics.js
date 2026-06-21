// ======= Analytics Tab =======

let monthlyBarChart = null;
let categoryTrendChart = null;

function renderAnalyticsTab() {
  if (!transactions || transactions.length === 0) {
    document.getElementById('analyticsEmpty').style.display = 'block';
    document.getElementById('analyticsContent').style.display = 'none';
    return;
  }

  document.getElementById('analyticsEmpty').style.display = 'none';
  document.getElementById('analyticsContent').style.display = 'block';

  const monthlyData = buildMonthlyData();
  renderMonthlyBarChart(monthlyData);
  renderCategoryTrendChart(monthlyData);
  renderSummaryCards(monthlyData);
}

// ---- Build monthly aggregation ----
function buildMonthlyData() {
  // Get last 6 calendar months (including current)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(key);
  }

  // Category totals per month
  const data = {}; // { 'YYYY-MM': { FOOD: 200, ... , _total: 500 } }
  months.forEach(m => { data[m] = { _total: 0 }; });

  transactions.forEach(t => {
    const month = t.date.slice(0, 7);
    if (!data[month]) return; // outside our 6-month window
    if (!data[month][t.category]) data[month][t.category] = 0;
    data[month][t.category] += t.amount;
    data[month]._total += t.amount;
  });

  return { months, data };
}

// ---- Monthly spending bar chart ----
function renderMonthlyBarChart({ months, data }) {
  const canvas = document.getElementById('monthlyBarChart');
  if (!canvas) return;

  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
  const bgCard = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim();

  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  });
  const totals = months.map(m => data[m]._total || 0);

  if (monthlyBarChart) { try { monthlyBarChart.destroy(); } catch(e){} }

  monthlyBarChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Spent (₹)',
        data: totals,
        backgroundColor: accent + 'cc',
        borderColor: accent,
        borderWidth: 2,
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `₹${ctx.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: {
          ticks: { color: textColor, callback: v => `₹${v}` },
          grid: { color: gridColor }
        }
      }
    }
  });
}

// ---- Category trend lines ----
function renderCategoryTrendChart({ months, data }) {
  const canvas = document.getElementById('categoryTrendChart');
  if (!canvas) return;

  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();

  // Collect all categories that appear in these 6 months
  const catSet = new Set();
  months.forEach(m => Object.keys(data[m]).forEach(k => { if (k !== '_total') catSet.add(k); }));
  const categories = [...catSet].slice(0, 6); // cap at 6 lines for readability

  const palette = ['#e94560', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  });

  const datasets = categories.map((cat, i) => ({
    label: cat,
    data: months.map(m => data[m][cat] || 0),
    borderColor: palette[i % palette.length],
    backgroundColor: palette[i % palette.length] + '22',
    borderWidth: 2,
    tension: 0.4,
    fill: false,
    pointRadius: 4,
    pointHoverRadius: 6
  }));

  if (categoryTrendChart) { try { categoryTrendChart.destroy(); } catch(e){} }

  if (categories.length === 0) {
    canvas.parentElement.style.display = 'none';
    return;
  }
  canvas.parentElement.style.display = 'block';

  categoryTrendChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: textColor, padding: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: ₹${ctx.parsed.y.toFixed(2)}` }
        }
      },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: {
          ticks: { color: textColor, callback: v => `₹${v}` },
          grid: { color: gridColor }
        }
      }
    }
  });
}

// ---- Best / Worst month summary cards ----
function renderSummaryCards({ months, data }) {
  const container = document.getElementById('analyticsSummaryCards');
  if (!container) return;

  const monthsWithData = months.filter(m => data[m]._total > 0);
  if (monthsWithData.length === 0) {
    container.innerHTML = '';
    return;
  }

  const sorted = [...monthsWithData].sort((a, b) => data[a]._total - data[b]._total);
  const best = sorted[0];  // lowest spend
  const worst = sorted[sorted.length - 1]; // highest spend

  function friendlyMonth(m) {
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  // Top category this month
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentData = data[currentMonth] || {};
  const topCat = Object.entries(currentData)
    .filter(([k]) => k !== '_total')
    .sort((a, b) => b[1] - a[1])[0];

  // Avg monthly spend
  const avg = monthsWithData.reduce((s, m) => s + data[m]._total, 0) / monthsWithData.length;

  container.innerHTML = `
    <div class="summary-card summary-best">
      <div class="summary-icon">🏆</div>
      <div>
        <div class="summary-label">Best Month</div>
        <div class="summary-value">${friendlyMonth(best)}</div>
        <div class="summary-sub">₹${data[best]._total.toFixed(2)} spent</div>
      </div>
    </div>
    <div class="summary-card summary-worst">
      <div class="summary-icon">⚠️</div>
      <div>
        <div class="summary-label">Highest Spend</div>
        <div class="summary-value">${friendlyMonth(worst)}</div>
        <div class="summary-sub">₹${data[worst]._total.toFixed(2)} spent</div>
      </div>
    </div>
    <div class="summary-card summary-avg">
      <div class="summary-icon">📊</div>
      <div>
        <div class="summary-label">Monthly Average</div>
        <div class="summary-value">₹${avg.toFixed(2)}</div>
        <div class="summary-sub">over ${monthsWithData.length} month${monthsWithData.length > 1 ? 's' : ''}</div>
      </div>
    </div>
    ${topCat ? `
    <div class="summary-card summary-top">
      <div class="summary-icon">🔥</div>
      <div>
        <div class="summary-label">Top Category (This Month)</div>
        <div class="summary-value">${topCat[0]}</div>
        <div class="summary-sub">₹${topCat[1].toFixed(2)}</div>
      </div>
    </div>` : ''}
  `;
}
