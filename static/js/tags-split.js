// ======= Split Transaction =======

let splitRows = [];
let splitTotal = 0;

function openSplitModal() {
  splitRows = [];
  splitTotal = 0;
  document.getElementById('splitDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('splitDesc').value = '';
  document.getElementById('splitTags').value = '';
  document.getElementById('splitRowsContainer').innerHTML = '';
  document.getElementById('splitTotalDisplay').textContent = '₹0.00';
  addSplitRow();
  addSplitRow();
  document.getElementById('splitModal').style.display = 'flex';
}

function closeSplitModal() {
  document.getElementById('splitModal').style.display = 'none';
}

function addSplitRow() {
  const container = document.getElementById('splitRowsContainer');
  const idx = container.children.length;
  const row = document.createElement('div');
  row.className = 'split-row';
  row.innerHTML = `
    <select class="split-cat-select" onchange="updateSplitTotal()">
      ${['FOOD','TRANSPORT','ENTERTAINMENT','HEALTH','UTILITIES','SHOPPING','EDUCATION','RENT','PERSONAL','OTHER']
        .map(c => `<option value="${c}">${getCategoryEmoji(c)} ${c}</option>`).join('')}
    </select>
    <input type="text" class="split-row-desc" placeholder="Description (optional)">
    <input type="number" class="split-row-amt" placeholder="₹ Amount" step="0.01" min="0.01" oninput="updateSplitTotal()">
    <button class="icon-btn danger-btn" onclick="removeSplitRow(this)" title="Remove">✕</button>
  `;
  container.appendChild(row);
  updateSplitTotal();
}

function removeSplitRow(btn) {
  const container = document.getElementById('splitRowsContainer');
  if (container.children.length <= 2) {
    showToast('Need at least 2 splits', 'error');
    return;
  }
  btn.closest('.split-row').remove();
  updateSplitTotal();
}

function updateSplitTotal() {
  const amts = [...document.querySelectorAll('.split-row-amt')].map(i => parseFloat(i.value) || 0);
  const total = amts.reduce((s, v) => s + v, 0);
  document.getElementById('splitTotalDisplay').textContent = `₹${total.toFixed(2)}`;
}

async function submitSplit() {
  const date = document.getElementById('splitDate').value;
  const desc = document.getElementById('splitDesc').value.trim();
  const tags = document.getElementById('splitTags').value.trim();

  const rows = [...document.querySelectorAll('.split-row')];
  const splits = rows.map(row => ({
    category: row.querySelector('.split-cat-select').value,
    amount: parseFloat(row.querySelector('.split-row-amt').value) || 0,
    description: row.querySelector('.split-row-desc').value.trim() || desc
  })).filter(s => s.amount > 0);

  if (!date) { showToast('Please select a date', 'error'); return; }
  if (splits.length < 2) { showToast('Add at least 2 splits with amounts', 'error'); return; }

  try {
    const res = await fetch(`${API_BASE}/transactions/split`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc, date, tags, splits })
    });
    if (!res.ok) throw new Error();
    const json = await res.json();
    showToast(`✅ Split into ${json.count} transactions!`, 'success');
    closeSplitModal();
    await fetchTransactions();
    await fetchAnalytics();
    renderTransactions();
    updateDashboard();
  } catch (e) {
    showToast('Failed to create split', 'error');
  }
}


// ======= Tags & Notes on Transactions =======

function formatTags(tags) {
  if (!tags) return '';
  return tags.split(/[\s,]+/).filter(Boolean).map(t => {
    const tag = t.startsWith('#') ? t : '#' + t;
    return `<span class="tag-pill">${tag}</span>`;
  }).join('');
}

function openTagsModal(transactionId, currentTags, currentNotes) {
  document.getElementById('tagsTransactionId').value = transactionId;
  document.getElementById('tagsInput').value = currentTags || '';
  document.getElementById('notesInput').value = currentNotes || '';
  document.getElementById('tagsModal').style.display = 'flex';
  renderTagSuggestions();
}

function closeTagsModal() {
  document.getElementById('tagsModal').style.display = 'none';
}

async function saveTagsAndNotes() {
  const id = document.getElementById('tagsTransactionId').value;
  const tags = document.getElementById('tagsInput').value.trim();
  const notes = document.getElementById('notesInput').value.trim();

  try {
    await Promise.all([
      fetch(`${API_BASE}/transactions/${id}/tags`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags })
      }),
      fetch(`${API_BASE}/transactions/${id}/notes`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
    ]);
    showToast('✅ Tags & notes saved!', 'success');
    closeTagsModal();
    await fetchTransactions();
    await fetchAnalytics();
    renderTransactions();
    updateDashboard();
  } catch (e) {
    showToast('Failed to save', 'error');
  }
}

async function aiSuggestTags(description, category) {
  if (!description) return '';
  try {
    const res = await fetch(`${API_BASE}/ai/suggest-category`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    const json = await res.json();
    // Build smart tag suggestions based on category + description keywords
    const baseTags = buildTagSuggestions(description, category || json.category || '');
    return baseTags;
  } catch (e) {
    return buildTagSuggestions(description, category);
  }
}

function buildTagSuggestions(desc, category) {
  const suggestions = new Set();
  const lower = (desc || '').toLowerCase();

  // Category-based
  const catTags = {
    FOOD: ['#food', '#dining'], TRANSPORT: ['#travel', '#transport'],
    ENTERTAINMENT: ['#fun', '#leisure'], HEALTH: ['#health', '#wellness'],
    UTILITIES: ['#bills', '#essential'], SHOPPING: ['#shopping'],
    EDUCATION: ['#study', '#learning'], RENT: ['#housing', '#essential'],
    PERSONAL: ['#personal']
  };
  (catTags[(category||'').toUpperCase()] || []).forEach(t => suggestions.add(t));

  // Keyword-based
  if (/emi|loan|credit/.test(lower)) suggestions.add('#emi');
  if (/netflix|prime|spotify|subscription/.test(lower)) suggestions.add('#subscription');
  if (/zomato|swiggy|restaurant|café|coffee/.test(lower)) suggestions.add('#dining');
  if (/impulse|random/.test(lower)) suggestions.add('#impulse');
  if (/essential|necessity|must/.test(lower)) suggestions.add('#essential');
  if (/grocery|vegetables|fruits|milk/.test(lower)) suggestions.add('#grocery');
  if (/uber|ola|auto|taxi|metro/.test(lower)) suggestions.add('#commute');
  if (/medicine|doctor|hospital|pharmacy/.test(lower)) suggestions.add('#medical');

  return [...suggestions].slice(0, 5).join(' ');
}

function renderTagSuggestions() {
  const container = document.getElementById('tagSuggestions');
  if (!container) return;

  const commonTags = ['#emi', '#essential', '#impulse', '#food', '#bills', '#subscription', '#medical', '#grocery', '#commute', '#dining', '#study', '#housing'];
  container.innerHTML = commonTags.map(t => `
    <button class="tag-suggest-btn" onclick="appendTag('${t}')">${t}</button>
  `).join('');
}

function appendTag(tag) {
  const input = document.getElementById('tagsInput');
  const current = input.value.trim();
  if (!current.includes(tag)) {
    input.value = current ? current + ' ' + tag : tag;
  }
}

async function autoTagTransaction(transactionId, description, category) {
  const suggestedTags = await aiSuggestTags(description, category);
  if (suggestedTags) {
    openTagsModal(transactionId, suggestedTags, '');
    showToast('✨ AI suggested tags for you!', 'info');
  }
}

// Tag filter search
function getActiveTagFilter() {
  const input = document.getElementById('tagFilterInput');
  return input ? input.value.trim().toLowerCase() : '';
}

function filterTransactionsByTag(txList) {
  const filter = getActiveTagFilter();
  if (!filter) return txList;
  const search = filter.startsWith('#') ? filter : '#' + filter;
  return txList.filter(t => (t.tags || '').toLowerCase().includes(search.replace('#', '')));
}