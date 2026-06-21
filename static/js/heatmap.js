// ======= Spending Heatmap Calendar =======
// GitHub-style contribution graph — darker = more spent

let heatmapData = {};

async function loadHeatmap() {
  try {
    const res = await fetch(`${API_BASE}/analytics/heatmap`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const json = await res.json();
    heatmapData = json.heatmap || {};
    renderHeatmap();
  } catch (e) {
    console.error('Heatmap load error', e);
  }
}

function renderHeatmap() {
  const container = document.getElementById('heatmapGrid');
  const legend = document.getElementById('heatmapLegend');
  const tooltip = document.getElementById('heatmapTooltip');
  if (!container) return;

  container.innerHTML = '';

  // Build 52-week grid (364 days back from today + today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the Sunday on or before 364 days ago
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - 364);
  // Roll back to Sunday
  startDay.setDate(startDay.getDate() - startDay.getDay());

  // Max spend for scale
  const values = Object.values(heatmapData).filter(v => v > 0);
  const maxSpend = values.length ? Math.max(...values) : 1;

  // Month labels row
  const monthRow = document.createElement('div');
  monthRow.className = 'heatmap-month-row';

  // Week columns
  const weeks = [];
  let cursor = new Date(startDay);

  while (cursor <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  // Build month label positions
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabels = document.createElement('div');
  monthLabels.className = 'heatmap-months';

  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const m = week[0].getMonth();
    if (m !== lastMonth) {
      const label = document.createElement('span');
      label.textContent = monthNames[m];
      label.style.gridColumnStart = wi + 2; // offset for day-of-week labels
      monthLabels.appendChild(label);
      lastMonth = m;
    }
  });
  container.appendChild(monthLabels);

  // Grid body
  const gridBody = document.createElement('div');
  gridBody.className = 'heatmap-body';

  // Day labels col
  const dayLabels = document.createElement('div');
  dayLabels.className = 'heatmap-day-labels';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach((d, i) => {
    const lbl = document.createElement('span');
    lbl.textContent = i % 2 === 1 ? d : ''; // alternating for compactness
    dayLabels.appendChild(lbl);
  });
  gridBody.appendChild(dayLabels);

  // Week columns
  weeks.forEach(week => {
    const col = document.createElement('div');
    col.className = 'heatmap-week-col';

    week.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';

      const dateStr = day.toISOString().slice(0, 10);
      const amount = heatmapData[dateStr] || 0;
      const intensity = amount > 0 ? Math.min(4, Math.ceil((amount / maxSpend) * 4)) : 0;

      cell.setAttribute('data-level', intensity);
      cell.setAttribute('data-date', dateStr);
      cell.setAttribute('data-amount', amount);

      // Future days styled differently
      if (day > today) {
        cell.setAttribute('data-future', 'true');
      }

      // Tooltip
      cell.addEventListener('mouseenter', (e) => {
        if (!tooltip) return;
        const label = amount > 0
          ? `₹${amount.toFixed(2)} on ${formatDateFriendly(dateStr)}`
          : `No spending on ${formatDateFriendly(dateStr)}`;
        tooltip.textContent = label;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.pageX + 10) + 'px';
        tooltip.style.top = (e.pageY - 32) + 'px';
      });
      cell.addEventListener('mousemove', (e) => {
        if (!tooltip) return;
        tooltip.style.left = (e.pageX + 10) + 'px';
        tooltip.style.top = (e.pageY - 32) + 'px';
      });
      cell.addEventListener('mouseleave', () => {
        if (tooltip) tooltip.style.display = 'none';
      });

      col.appendChild(cell);
    });

    gridBody.appendChild(col);
  });

  container.appendChild(gridBody);

  // Stats below heatmap
  renderHeatmapStats();
}

function renderHeatmapStats() {
  const statsEl = document.getElementById('heatmapStats');
  if (!statsEl) return;

  const values = Object.entries(heatmapData);
  if (!values.length) {
    statsEl.innerHTML = '<span class="heatmap-stat">No data yet</span>';
    return;
  }

  const totalDays = values.filter(([,v]) => v > 0).length;
  const totalSpent = values.reduce((s, [,v]) => s + v, 0);
  const maxEntry = values.reduce((a, b) => b[1] > a[1] ? b : a, ['', 0]);
  const avgPerActiveDay = totalDays ? (totalSpent / totalDays) : 0;

  statsEl.innerHTML = `
    <div class="heatmap-stat"><span class="heatmap-stat-icon">📅</span><span class="heatmap-stat-val">${totalDays}</span><span class="heatmap-stat-lbl">spending days</span></div>
    <div class="heatmap-stat"><span class="heatmap-stat-icon">🔥</span><span class="heatmap-stat-val">₹${maxEntry[1].toFixed(0)}</span><span class="heatmap-stat-lbl">peak day (${maxEntry[0]})</span></div>
    <div class="heatmap-stat"><span class="heatmap-stat-icon">📊</span><span class="heatmap-stat-val">₹${avgPerActiveDay.toFixed(0)}</span><span class="heatmap-stat-lbl">avg/active day</span></div>
  `;
}

function formatDateFriendly(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
