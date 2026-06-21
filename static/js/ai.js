// ======= AI Features (via backend HuggingFace proxy) =======

// ---- 1. Spending Insights ----

async function analyseSpending() {
  const btn = document.getElementById('analyseBtn');
  const panel = document.getElementById('insightsPanel');

  if (!transactions || transactions.length === 0) {
    showToast('Add some transactions first!', 'warning');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Analysing...';
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="insights-loading">
      <div class="insights-spinner"></div>
      <p>Crunching your numbers…</p>
    </div>`;

  try {
    const res = await apiFetch('/ai/insights', {
      method: 'POST',
      body: JSON.stringify({
        transactions: transactions.map(t => ({
          date: t.date,
          category: t.category,
          amount: t.amount,
          description: t.description || ''
        })),
        balance: settings.balance,
        monthly_limit: settings.monthlyLimit,
        start_date: settings.startDate,
        end_date: settings.endDate
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Server error (${res.status})`);
    }

    const data = await res.json();
    renderInsights(data.insights);
  } catch (err) {
    panel.innerHTML = `<p class="insights-error">⚠️ Could not fetch insights: ${err.message || 'Unknown error'}. Check your GROQ_API_KEY in .env and try again.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 Analyse My Spending';
  }
}

function renderInsights(text) {
  const panel = document.getElementById('insightsPanel');

  // Split into lines and render nicely
  const lines = text.split('\n').filter(l => l.trim());
  const html = lines.map(line => {
    line = line.trim();
    if (line.startsWith('##')) {
      return `<h4 class="insights-heading">${line.replace(/^##\s*/, '')}</h4>`;
    }
    if (line.match(/^[-*•]\s/)) {
      return `<li class="insights-tip">${line.replace(/^[-*•]\s*/, '')}</li>`;
    }
    if (line.match(/^\d+\./)) {
      return `<li class="insights-tip">${line.replace(/^\d+\.\s*/, '')}</li>`;
    }
    return `<p class="insights-line">${line}</p>`;
  }).join('');

  panel.innerHTML = `
    <div class="insights-header">
      <span class="insights-icon">🤖</span>
      <strong>AI Spending Insights</strong>
      <button class="insights-close" onclick="document.getElementById('insightsPanel').style.display='none'">✕</button>
    </div>
    <div class="insights-body">${html}</div>`;
}


// ---- 2. Smart Category Suggestion ----

let suggestTimeout = null;

function onDescriptionInput(e) {
  const desc = e.target.value.trim();
  const btn = document.getElementById('suggestCategoryBtn');
  if (btn) btn.style.display = desc.length >= 3 ? 'inline-block' : 'none';
}

async function suggestCategory() {
  const desc = document.getElementById('dashDesc').value.trim();
  const categoryInput = document.getElementById('dashCategory');
  const btn = document.getElementById('suggestCategoryBtn');

  if (!desc) {
    showToast('Type a description first', 'warning');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    const res = await apiFetch('/ai/suggest-category', {
      method: 'POST',
      body: JSON.stringify({ description: desc })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Server error (${res.status})`);
    }

    const data = await res.json();
    if (data.category) {
      categoryInput.value = data.category.toUpperCase();
      showToast(`Category suggested: ${data.category}`, 'success');
    } else {
      showToast('Could not suggest a category', 'warning');
    }
  } catch (err) {
    showToast(`AI suggestion failed: ${err.message || 'Unknown error'}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Suggest';
  }
}
