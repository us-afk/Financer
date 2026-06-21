// ======= Smart Features Module =======
// 1. Budget Predictor
// 2. Anomaly Detection
// 3. Natural Language Entry
// 4. Monthly Report Card
// 5. Savings Goal Tracker

// ─────────────────────────────────────────────────────────────
// 1. BUDGET PREDICTOR
// ─────────────────────────────────────────────────────────────

let forecastSparklineChart = null; // track instance to avoid infinite loop on re-render

function runBudgetPredictor() {
  const panel = document.getElementById('budgetPredictorPanel');
  if (!panel) return;

  if (!transactions || transactions.length === 0 || !settings.startDate || !settings.endDate) {
    panel.innerHTML = `<p class="predictor-empty">Set a budget period and add transactions to see predictions.</p>`;
    return;
  }

  const start = new Date(settings.startDate);
  const end   = new Date(settings.endDate);
  const today = new Date();
  today.setHours(0,0,0,0);

  const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const elapsed   = Math.max(1, Math.round((today - start) / 86400000) + 1);
  const remaining = Math.max(0, totalDays - elapsed);

  // Filter transactions within period
  const periodTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  });

  const totalSpent = periodTx.reduce((s, t) => s + t.amount, 0);
  const dailyRate  = totalSpent / elapsed;
  const projected  = dailyRate * totalDays;
  const limit      = settings.monthlyLimit || settings.balance || 1;

  // Day when budget runs out
  let runoutHTML = '';
  if (dailyRate > 0 && limit > 0) {
    const daysUntilEmpty = (limit - totalSpent) / dailyRate;
    const runoutDate = new Date(today);
    runoutDate.setDate(runoutDate.getDate() + Math.round(daysUntilEmpty));

    if (runoutDate <= end) {
      const fmtDate = runoutDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
      runoutHTML = `
        <div class="predictor-alert danger">
          ⚠️ At current rate, budget runs out <strong>${fmtDate}</strong>
          &nbsp;(${Math.max(0, Math.round(daysUntilEmpty))} days away)
        </div>`;
    } else {
      runoutHTML = `
        <div class="predictor-alert success">
          ✅ On track — projected to finish within budget
        </div>`;
    }
  }

  const projectedPct = Math.min(200, Math.round((projected / limit) * 100));
  const spentPct     = Math.min(100, Math.round((totalSpent / limit) * 100));
  const barColor     = spentPct > 85 ? 'var(--danger)' : spentPct > 65 ? 'var(--warning)' : 'var(--success)';

  // Build forecast sparkline data (last 14 days of spend + 14-day projection)
  const sparkData = buildSparklineData(periodTx, start, today, dailyRate, 14);

  panel.innerHTML = `
    <div class="predictor-grid">
      <div class="predictor-stat">
        <span class="predictor-label">Daily Burn Rate</span>
        <span class="predictor-value">₹${dailyRate.toFixed(0)}/day</span>
      </div>
      <div class="predictor-stat">
        <span class="predictor-label">Projected Total</span>
        <span class="predictor-value ${projectedPct > 100 ? 'text-danger' : ''}">₹${projected.toFixed(0)}</span>
      </div>
      <div class="predictor-stat">
        <span class="predictor-label">Days Remaining</span>
        <span class="predictor-value">${remaining}</span>
      </div>
      <div class="predictor-stat">
        <span class="predictor-label">Safe Daily Budget</span>
        <span class="predictor-value">₹${remaining > 0 ? ((limit - totalSpent) / remaining).toFixed(0) : 0}/day</span>
      </div>
    </div>
    ${runoutHTML}
    <div class="predictor-bar-wrap">
      <div class="predictor-bar-labels">
        <span>Spent: ₹${totalSpent.toFixed(0)}</span>
        <span>Budget: ₹${limit.toFixed(0)}</span>
      </div>
      <div class="predictor-bar-track">
        <div class="predictor-bar-fill" style="width:${spentPct}%;background:${barColor}"></div>
        <div class="predictor-bar-projected" style="width:${Math.min(100, projectedPct)}%;border-color:${barColor}88"></div>
      </div>
      <div class="predictor-bar-labels">
        <span style="color:var(--text-secondary);font-size:0.75rem">Actual spent</span>
        <span style="color:var(--text-secondary);font-size:0.75rem">Projected end: ${projectedPct}% of budget</span>
      </div>
    </div>
    <canvas id="forecastSparkline" height="70"></canvas>
  `;

  // Draw sparkline after DOM update
  requestAnimationFrame(() => renderSparkline('forecastSparkline', sparkData));
}

function buildSparklineData(txList, start, today, dailyRate, lookback) {
  const actuals = {};
  txList.forEach(t => {
    const k = t.date.slice(0, 10);
    actuals[k] = (actuals[k] || 0) + t.amount;
  });

  const labels = [], actual = [], forecast = [];
  for (let i = lookback - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d < start) continue;
    const k = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    actual.push(actuals[k] || 0);
    forecast.push(null);
  }
  // Add 7 forecast days
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    actual.push(null);
    forecast.push(+(dailyRate.toFixed(0)));
  }
  return { labels, actual, forecast };
}

function renderSparkline(canvasId, { labels, actual, forecast }) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;

  // Destroy existing chart instance to prevent Chart.js infinite loop on re-render
  if (forecastSparklineChart) {
    try { forecastSparklineChart.destroy(); } catch (e) { }
    forecastSparklineChart = null;
  }

  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
  forecastSparklineChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Spent',
          data: actual,
          backgroundColor: 'var(--accent-primary)99',
          borderColor: 'var(--accent-primary)',
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: 'Forecast',
          data: forecast,
          backgroundColor: '#f59e0b44',
          borderColor: '#f59e0b',
          borderWidth: 1,
          borderRadius: 3,
          borderDash: [4, 4],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `₹${ctx.parsed.y || 0}` } }
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
        y: { display: false }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// 2. ANOMALY DETECTION
// ─────────────────────────────────────────────────────────────

const ANOMALY_THRESHOLD = 2.5; // z-score / std-dev multiplier

function detectAnomalies(txList) {
  if (!txList || txList.length < 3) return new Set();

  // Group by category, compute mean + std per category
  const catGroups = {};
  txList.forEach(t => {
    if (!catGroups[t.category]) catGroups[t.category] = [];
    catGroups[t.category].push(t.amount);
  });

  const anomalyIds = new Set();

  txList.forEach(t => {
    const group = catGroups[t.category];
    if (!group || group.length < 2) return;

    const mean = group.reduce((s, v) => s + v, 0) / group.length;
    const std  = Math.sqrt(group.reduce((s, v) => s + (v - mean) ** 2, 0) / group.length);

    if (std < 1) return; // too little variance

    const zScore = (t.amount - mean) / std;
    if (zScore > ANOMALY_THRESHOLD) {
      anomalyIds.add(t.id);
    }
  });

  return anomalyIds;
}

// Called after transactions render to highlight anomalies
function applyAnomalyHighlights() {
  const anomalies = detectAnomalies(window._currentFilteredTransactions || transactions);

  document.querySelectorAll('.transaction-item').forEach(el => {
    const id = parseInt(el.dataset.id);
    if (anomalies.has(id)) {
      el.classList.add('anomaly-flag');
      if (!el.querySelector('.anomaly-badge')) {
        const badge = document.createElement('span');
        badge.className = 'anomaly-badge';
        badge.title = 'Unusually high for this category';
        badge.textContent = '⚠️ Unusual';
        el.querySelector('.transaction-info')?.appendChild(badge);
      }
    } else {
      el.classList.remove('anomaly-flag');
    }
  });

  // Update anomaly counter in dashboard
  const counter = document.getElementById('anomalyCounter');
  if (counter) {
    const allAnomalies = detectAnomalies(transactions);
    counter.textContent = allAnomalies.size;
    counter.style.display = allAnomalies.size > 0 ? 'inline-flex' : 'none';
  }
}

// ─────────────────────────────────────────────────────────────
// 3. NATURAL LANGUAGE TRANSACTION ENTRY
// ─────────────────────────────────────────────────────────────

let nlParsing = false;

async function parseNLTransaction() {
  if (nlParsing) return;
  const input = document.getElementById('nlInput');
  const text = input?.value?.trim();
  if (!text) return;

  nlParsing = true;
  const btn = document.getElementById('nlParseBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Parsing...'; }

  try {
    const res = await apiFetch('/ai/parse-transaction', {
      method: 'POST',
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail || `Server error (${res.status})`;
      throw new Error(msg);
    }
    const data = await res.json();

    // Fill the form fields
    if (data.category)    document.getElementById('dashCategory').value = data.category.toUpperCase();
    if (data.amount)      document.getElementById('dashAmount').value = data.amount;
    if (data.date)        document.getElementById('dashDate').value = data.date;
    if (data.description) document.getElementById('dashDesc').value = data.description;

    showToast(`✅ Parsed: ₹${data.amount} in ${data.category}`, 'success');
    input.value = '';
    document.getElementById('nlPanel').style.display = 'none';
  } catch (err) {
    showToast(`Could not parse: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    nlParsing = false;
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Fill Form'; }
  }
}

function toggleNLPanel() {
  const panel = document.getElementById('nlPanel');
  if (!panel) return;
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  if (!visible) document.getElementById('nlInput')?.focus();
}

// ─────────────────────────────────────────────────────────────
// 4. MONTHLY REPORT CARD
// ─────────────────────────────────────────────────────────────

function renderReportCard() {
  const panel = document.getElementById('reportCardPanel');
  if (!panel) return;

  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);

  const monthTx = transactions.filter(t => t.date.slice(0, 7) === monthKey);
  const prevKey  = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const prevTx   = transactions.filter(t => t.date.slice(0, 7) === prevKey);

  if (monthTx.length === 0 && prevTx.length === 0) {
    panel.innerHTML = `<p class="predictor-empty">Not enough data to generate a report card yet.</p>`;
    return;
  }

  const spent     = monthTx.reduce((s, t) => s + t.amount, 0);
  const prevSpent = prevTx.reduce((s, t) => s + t.amount, 0);
  const limit     = settings.monthlyLimit || 0;

  // Grade logic
  let grade = 'A', gradeColor = 'var(--success)', gradeDesc = 'Excellent!';
  if (limit > 0) {
    const pct = spent / limit;
    if (pct <= 0.7)       { grade = 'A'; gradeColor = 'var(--success)';  gradeDesc = 'Excellent budgeting!'; }
    else if (pct <= 0.85) { grade = 'B'; gradeColor = '#10b981';         gradeDesc = 'Good, minor adjustments needed.'; }
    else if (pct <= 1.0)  { grade = 'C'; gradeColor = 'var(--warning)';  gradeDesc = 'Borderline — watch your spending.'; }
    else if (pct <= 1.2)  { grade = 'D'; gradeColor = '#f97316';         gradeDesc = 'Over budget. Cut back!'; }
    else                  { grade = 'F'; gradeColor = 'var(--danger)';   gradeDesc = 'Significantly over budget!'; }
  }

  // Category analysis
  const catTotals = {};
  monthTx.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const prevCatTotals = {};
  prevTx.forEach(t => { prevCatTotals[t.category] = (prevCatTotals[t.category] || 0) + t.amount; });

  const catRows = Object.entries(catTotals)
    .sort((a,b) => b[1] - a[1])
    .map(([cat, amt]) => {
      const prev = prevCatTotals[cat] || 0;
      const delta = prev > 0 ? ((amt - prev) / prev * 100) : null;
      const deltaHTML = delta !== null
        ? `<span class="${delta > 0 ? 'text-danger' : 'text-success'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}%</span>`
        : '<span style="color:var(--text-secondary)">—</span>';
      const barW = spent > 0 ? (amt / spent * 100).toFixed(1) : 0;
      return `
        <div class="rc-cat-row">
          <span class="rc-cat-name">${cat}</span>
          <div class="rc-cat-bar-wrap"><div class="rc-cat-bar" style="width:${barW}%"></div></div>
          <span class="rc-cat-amt">₹${amt.toFixed(0)}</span>
          ${deltaHTML}
        </div>`;
    }).join('');

  const momChange = prevSpent > 0 ? ((spent - prevSpent) / prevSpent * 100).toFixed(1) : null;
  const momHTML = momChange !== null
    ? `<span class="${+momChange > 0 ? 'text-danger' : 'text-success'}">${+momChange > 0 ? '▲' : '▼'} ${Math.abs(+momChange)}% vs last month</span>`
    : '';

  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  panel.innerHTML = `
    <div class="rc-header">
      <div class="rc-grade" style="border-color:${gradeColor};color:${gradeColor}">${grade}</div>
      <div class="rc-meta">
        <div class="rc-month">${monthName} Report</div>
        <div class="rc-desc" style="color:${gradeColor}">${gradeDesc}</div>
        <div class="rc-spent">Spent ₹${spent.toFixed(0)}${limit > 0 ? ` of ₹${limit.toFixed(0)}` : ''} &nbsp;${momHTML}</div>
      </div>
      <button class="rc-export-btn" onclick="exportReportCardPDF()">📄 PDF</button>
    </div>
    <div class="rc-cats">${catRows || '<p style="color:var(--text-secondary)">No transactions this month.</p>'}</div>
  `;
}

async function exportReportCardPDF() {
  showToast('Use your browser\'s Print → Save as PDF on the Analytics page.', 'info');
}

// ─────────────────────────────────────────────────────────────
// 5. SAVINGS GOAL TRACKER
// ─────────────────────────────────────────────────────────────

const GOALS_KEY = 'ft_savings_goals';

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY)) || []; }
  catch { return []; }
}

function saveGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

function renderGoalsPanel() {
  const panel = document.getElementById('goalsPanel');
  if (!panel) return;

  const goals = loadGoals();

  if (goals.length === 0) {
    panel.innerHTML = `<p class="predictor-empty">No goals yet. Add one below!</p>`;
    return;
  }

  // Calculate current balance from settings
  const spent = transactions.reduce((s, t) => s + t.amount, 0);
  const currentBalance = (settings.balance || 0) - spent;
  const monthlyLeftover = (settings.monthlyLimit || 0) > 0
    ? (settings.monthlyLimit - (transactions
        .filter(t => t.date.slice(0, 7) === new Date().toISOString().slice(0, 7))
        .reduce((s, t) => s + t.amount, 0)))
    : 0;

  panel.innerHTML = goals.map((goal, idx) => {
    const target   = goal.target;
    const saved    = goal.saved || 0;
    const pct      = Math.min(100, (saved / target) * 100);
    const remaining = Math.max(0, target - saved);

    // Project completion using monthly leftover as potential saving
    let projHTML = '';
    if (monthlyLeftover > 0 && remaining > 0) {
      const monthsNeeded = Math.ceil(remaining / monthlyLeftover);
      const projDate = new Date();
      projDate.setMonth(projDate.getMonth() + monthsNeeded);
      const fmt = projDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      projHTML = `<span class="goal-proj">📅 On track: ~${fmt}</span>`;
    }

    const alertClass = pct >= 100 ? 'goal-done' : pct >= 75 ? 'goal-near' : '';

    return `
      <div class="goal-card ${alertClass}" data-idx="${idx}">
        <div class="goal-top">
          <div>
            <div class="goal-name">${goal.name}</div>
            <div class="goal-amounts">₹${saved.toFixed(0)} / ₹${target.toFixed(0)}</div>
          </div>
          <div class="goal-actions">
            <button class="goal-add-btn" onclick="addToGoal(${idx})">+ Add</button>
            <button class="goal-del-btn" onclick="deleteGoal(${idx})">🗑</button>
          </div>
        </div>
        <div class="goal-bar-track">
          <div class="goal-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="goal-footer">
          <span class="${pct >= 100 ? 'text-success' : ''}">${pct >= 100 ? '🎉 Goal Reached!' : pct.toFixed(0) + '% complete'}</span>
          ${projHTML}
        </div>
      </div>`;
  }).join('');
}

function addGoal() {
  const nameEl   = document.getElementById('goalName');
  const targetEl = document.getElementById('goalTarget');
  const name   = nameEl?.value?.trim();
  const target = parseFloat(targetEl?.value);

  if (!name || isNaN(target) || target <= 0) {
    showToast('Enter a valid goal name and amount', 'warning');
    return;
  }

  const goals = loadGoals();
  goals.push({ name, target, saved: 0, createdAt: new Date().toISOString() });
  saveGoals(goals);

  if (nameEl)   nameEl.value = '';
  if (targetEl) targetEl.value = '';
  renderGoalsPanel();
  showToast(`Goal "${name}" added!`, 'success');
}

function addToGoal(idx) {
  const amount = parseFloat(prompt('How much have you saved for this goal? (₹)'));
  if (isNaN(amount) || amount <= 0) return;

  const goals = loadGoals();
  goals[idx].saved = (goals[idx].saved || 0) + amount;
  saveGoals(goals);
  renderGoalsPanel();
  showToast(`Added ₹${amount} to "${goals[idx].name}"`, 'success');
}

function deleteGoal(idx) {
  const goals = loadGoals();
  const name = goals[idx].name;
  goals.splice(idx, 1);
  saveGoals(goals);
  renderGoalsPanel();
  showToast(`Deleted goal "${name}"`, 'info');
}

// ─────────────────────────────────────────────────────────────
// HOOK: Called after transactions load / render
// ─────────────────────────────────────────────────────────────

function refreshSmartFeatures() {
  runBudgetPredictor();
  applyAnomalyHighlights();
  renderReportCard();
  renderGoalsPanel();
}
