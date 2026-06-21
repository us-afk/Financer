// ======= Recurring Transactions =======

let recurringList = [];

async function loadRecurringTransactions() {
  try {
    const res = await fetch(`${API_BASE}/recurring-transactions`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const json = await res.json();
    recurringList = json.recurring_transactions || [];
    renderRecurringList();
    renderUpcomingRecurring();
  } catch (e) {
    console.error('Recurring load error', e);
  }
}

async function applyDueRecurring() {
  try {
    const res = await fetch(`${API_BASE}/recurring-transactions/apply-due`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const json = await res.json();
    if (json.count > 0) {
      showToast(`✅ Auto-applied ${json.count} recurring transaction(s)`, 'success');
      await loadData(); // refresh transactions
    }
  } catch (e) {
    console.error('Apply recurring error', e);
  }
}

function renderRecurringList() {
  const container = document.getElementById('recurringList');
  if (!container) return;

  if (!recurringList.length) {
    container.innerHTML = '<p class="empty-state-sm">No recurring transactions yet.</p>';
    return;
  }

  container.innerHTML = recurringList.map(rt => `
    <div class="recurring-item ${rt.is_active ? '' : 'recurring-inactive'}">
      <div class="recurring-item-left">
        <div class="recurring-icon">${getCategoryEmoji(rt.category)}</div>
        <div class="recurring-info">
          <div class="recurring-desc">${rt.description}</div>
          <div class="recurring-meta">
            <span class="recurring-cat-badge">${rt.category}</span>
            <span class="recurring-day">Every ${ordinal(rt.day_of_month)} of month</span>
            ${rt.tags ? `<span class="recurring-tags">${formatTags(rt.tags)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="recurring-item-right">
        <span class="recurring-amount">₹${rt.amount.toFixed(2)}</span>
        <div class="recurring-actions">
          <button class="icon-btn" title="${rt.is_active ? 'Pause' : 'Resume'}" onclick="toggleRecurring(${rt.id}, ${rt.is_active})">
            ${rt.is_active ? '⏸' : '▶️'}
          </button>
          <button class="icon-btn danger-btn" title="Delete" onclick="deleteRecurring(${rt.id})">🗑</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderUpcomingRecurring() {
  const container = document.getElementById('upcomingRecurring');
  if (!container) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const currentDay = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const upcoming = recurringList
    .filter(rt => rt.is_active)
    .map(rt => {
      let dueDay = rt.day_of_month;
      let dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
      if (dueDay <= currentDay) {
        // Already passed — show next month
        dueDate = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
      }
      const diffMs = dueDate - today;
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      return { ...rt, dueDate, diffDays };
    })
    .sort((a, b) => a.diffDays - b.diffDays)
    .slice(0, 5);

  if (!upcoming.length) {
    container.innerHTML = '<p class="empty-state-sm">No upcoming payments.</p>';
    return;
  }

  container.innerHTML = upcoming.map(rt => `
    <div class="upcoming-item">
      <div class="upcoming-left">
        <span class="upcoming-emoji">${getCategoryEmoji(rt.category)}</span>
        <div>
          <div class="upcoming-desc">${rt.description}</div>
          <div class="upcoming-due">Due in <strong>${rt.diffDays}</strong> day${rt.diffDays !== 1 ? 's' : ''} — ${rt.dueDate.toLocaleDateString('en-IN', {day:'numeric',month:'short'})}</div>
        </div>
      </div>
      <span class="upcoming-amount">₹${rt.amount.toFixed(2)}</span>
    </div>
  `).join('');
}

async function saveRecurringTransaction(event) {
  event.preventDefault();
  const desc = document.getElementById('rtDesc').value.trim();
  const category = document.getElementById('rtCategory').value.trim().toUpperCase();
  const amount = parseFloat(document.getElementById('rtAmount').value);
  const day = parseInt(document.getElementById('rtDay').value);
  const tags = document.getElementById('rtTags').value.trim();

  if (!desc || !category || !amount || !day) {
    showToast('Please fill all required fields', 'error');
    return;
  }
  if (day < 1 || day > 28) {
    showToast('Day must be between 1 and 28', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/recurring-transactions`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc, category, amount, day_of_month: day, tags, is_active: true })
    });
    if (!res.ok) throw new Error();
    showToast('✅ Recurring transaction added!', 'success');
    document.getElementById('recurringForm').reset();
    await loadRecurringTransactions();
  } catch (e) {
    showToast('Failed to save', 'error');
  }
}

async function toggleRecurring(id, currentlyActive) {
  try {
    await fetch(`${API_BASE}/recurring-transactions/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentlyActive })
    });
    await loadRecurringTransactions();
  } catch (e) {
    showToast('Failed to update', 'error');
  }
}

async function deleteRecurring(id) {
  if (!confirm('Delete this recurring transaction?')) return;
  try {
    await fetch(`${API_BASE}/recurring-transactions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    showToast('Deleted', 'success');
    await loadRecurringTransactions();
  } catch (e) {
    showToast('Failed to delete', 'error');
  }
}

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getCategoryEmoji(cat) {
  const map = {
    FOOD: '🍕', TRANSPORT: '🚗', ENTERTAINMENT: '🎬', HEALTH: '💊',
    UTILITIES: '⚡', SHOPPING: '🛍', EDUCATION: '📚', RENT: '🏠',
    PERSONAL: '💆', OTHER: '📌'
  };
  return map[(cat || '').toUpperCase()] || '📌';
}