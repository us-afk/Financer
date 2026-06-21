// ======= Global State =======
let transactions = [];
let categories = {};
let settings = {
  balance: 0,
  monthlyLimit: 0,
  startDate: null,
  endDate: null
};
let monthlyDivisions = [];
let spendingChart = null;
let editingTransactionId = null;
let recurringSettings = {};
let currentFilter = 'total';

// ======= Theme Management =======
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const themeIcon = document.querySelector('.theme-icon');
  if (themeIcon) {
    themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
  }
}

// ======= API Configuration =======
const API_BASE = window.location.origin;
const API_HEADERS = {
  'Content-Type': 'application/json'
};

function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  if (token) {
    return {
      ...API_HEADERS,
      'Authorization': `Bearer ${token}`
    };
  }
  return API_HEADERS;
}

// ======= Authentication Functions =======
function showLoginForm() {
  const loginHTML = `
    <div id="loginModal" style="
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.8); z-index: 10000; display: flex; 
      align-items: center; justify-content: center;">
      <div style="
        background: var(--bg-card); padding: 2.5rem; border-radius: 16px; 
        width: 420px; max-width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.6);">
        <h2 style="color: var(--accent-primary); margin-bottom: 1.5rem; text-align: center; font-size: 1.8rem;">💰 Finance Tracker</h2>
        
        <div id="authTabs" style="display: flex; margin-bottom: 1.5rem; gap: 0.5rem;">
          <button onclick="showAuthTab('login')" id="loginTab" 
            style="flex: 1; padding: 0.7rem; background: var(--accent-primary); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
            Login
          </button>
          <button onclick="showAuthTab('register')" id="registerTab"
            style="flex: 1; padding: 0.7rem; background: var(--bg-secondary); color: var(--text-primary); border: none; border-radius: 8px; font-weight: 500; cursor: pointer;">
            Register
          </button>
        </div>

        <form id="loginForm" onsubmit="handleLogin(event)">
          <input type="text" id="loginUsername" placeholder="Username" required 
            style="width: 100%; padding: 0.8rem; margin: 0.5rem 0; border: 2px solid var(--border-color); 
            border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 1rem;">
          <input type="password" id="loginPassword" placeholder="Password" required
            style="width: 100%; padding: 0.8rem; margin: 0.5rem 0; border: 2px solid var(--border-color); 
            border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 1rem;">
          <button type="submit" style="width: 100%; padding: 0.8rem; margin: 1rem 0; 
            background: var(--accent-primary); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 1rem;">
            Login
          </button>
        </form>

        <form id="registerForm" onsubmit="handleRegister(event)" style="display: none;">
          <input type="text" id="registerUsername" placeholder="Username" required
            style="width: 100%; padding: 0.8rem; margin: 0.5rem 0; border: 2px solid var(--border-color); 
            border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 1rem;">
          <input type="email" id="registerEmail" placeholder="Email" required
            style="width: 100%; padding: 0.8rem; margin: 0.5rem 0; border: 2px solid var(--border-color); 
            border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 1rem;">
          <input type="password" id="registerPassword" placeholder="Password" required
            style="width: 100%; padding: 0.8rem; margin: 0.5rem 0; border: 2px solid var(--border-color); 
            border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 1rem;">
          <button type="submit" style="width: 100%; padding: 0.8rem; margin: 1rem 0; 
            background: var(--accent-primary); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 1rem;">
            Register
          </button>
        </form>

        <div id="authMessage" style="color: var(--danger); text-align: center; margin-top: 1rem; font-weight: 500;"></div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', loginHTML);
}

function showAuthTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  
  if (tab === 'login') {
    loginTab.style.background = 'var(--accent-primary)';
    loginTab.style.color = 'white';
    registerTab.style.background = 'var(--bg-secondary)';
    registerTab.style.color = 'var(--text-primary)';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    registerTab.style.background = 'var(--accent-primary)';
    registerTab.style.color = 'white';
    loginTab.style.background = 'var(--bg-secondary)';
    loginTab.style.color = 'var(--text-primary)';
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      localStorage.setItem('authToken', data.access_token);
      const modal = document.getElementById('loginModal');
      if (modal) { modal.remove(); document.body.style.overflow = ''; }
      await initializeApp();
    } else {
      document.getElementById('authMessage').textContent = data.detail || 'Login failed';
    }
  } catch (error) {
    document.getElementById('authMessage').textContent = 'Connection error';
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const username = document.getElementById('registerUsername').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      localStorage.setItem('authToken', data.access_token);
      const modal = document.getElementById('loginModal');
      if (modal) { modal.remove(); document.body.style.overflow = ''; }
      await initializeApp();
    } else {
      document.getElementById('authMessage').textContent = data.detail || 'Registration failed';
    }
  } catch (error) {
    document.getElementById('authMessage').textContent = 'Connection error';
  }
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('authToken');
    
    // Clear all user data
    transactions = [];
    categories = {};
    monthlyDivisions = [];
    settings = {
      balance: 0,
      monthlyLimit: 0,
      startDate: null,
      endDate: null
    };
    
    // Destroy chart if it exists
    if (spendingChart && spendingChart.destroy) {
      try { spendingChart.destroy(); } catch (e) { }
      spendingChart = null;
    }
    
    location.reload();
  }
}

// ======= API Functions =======
async function fetchTransactions() {
  try {
    const response = await fetch(`${API_BASE}/transactions/full`, {
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      transactions = await response.json();
      updateCategoriesFromTransactions();
    } else if (response.status === 401) {
      handleAuthError();
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
  }
}

async function fetchSettings() {
  try {
    const response = await fetch(`${API_BASE}/settings`, {
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      const settingsData = await response.json();
      settings = {
        balance: settingsData.balance || 0,
        monthlyLimit: settingsData.monthly_limit || 0,
        startDate: settingsData.start_date,
        endDate: settingsData.end_date
      };
    } else if (response.status === 401) {
      handleAuthError();
    }
  } catch (error) {
    console.error('Error fetching settings:', error);
  }
}

async function fetchAnalytics() {
  try {
    const response = await fetch(`${API_BASE}/analytics`, {
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      const analytics = await response.json();
      categories = analytics.categories || {};
    } else if (response.status === 401) {
      handleAuthError();
    }
  } catch (error) {
    console.error('Error fetching analytics:', error);
  }
}

async function fetchMonthlyDivisions() {
  try {
    const response = await fetch(`${API_BASE}/monthly-divisions`, {
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      const data = await response.json();
      monthlyDivisions = data.divisions || [];
    } else if (response.status === 401) {
      handleAuthError();
    }
  } catch (error) {
    console.error('Error fetching monthly divisions:', error);
  }
}

async function fetchRecurringSettings() {
  try {
    const response = await fetch(`${API_BASE}/recurring-settings`, {
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      recurringSettings = await response.json();
    } else if (response.status === 404) {
      recurringSettings = {};
    } else if (response.status === 401) {
      handleAuthError();
    }
  } catch (error) {
    console.error('Error fetching recurring settings:', error);
  }
}

async function saveRecurringSettings(data) {
  try {
    // Try PUT (update) first; if 404, fall back to POST (create)
    let response = await fetch(`${API_BASE}/recurring-settings`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (response.status === 404 || response.status === 405) {
      response = await fetch(`${API_BASE}/recurring-settings`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
    if (response.ok) {
      recurringSettings = await response.json();
      displayRecurringStatus();
      showToast('Recurring setup saved!', 'success');
    } else {
      const err = await response.json().catch(() => ({}));
      showToast(`Failed to save recurring setup: ${err.detail || response.status}`, 'error');
    }
  } catch (error) {
    showToast('Connection error', 'error');
  }
}

async function checkAndApplyRecurring() {
  try {
    const response = await fetch(`${API_BASE}/check-and-apply-recurring`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.applied) {
        showToast('New monthly period applied automatically!', 'success');
        await fetchSettings();
        updateDashboard();
      }
    }
  } catch (error) {
    console.error('Error checking recurring:', error);
  }
}


// ======= Clear Data Functions =======
async function clearManualPeriod() {
  if (!confirm('Clear the current budget period? Your transactions will NOT be deleted.')) return;
  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ balance: 0, monthly_limit: 0, start_date: null, end_date: null })
    });
    if (res.ok) {
      // Clear the form fields visually
      ['manualBalance','manualLimit'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
      ['manualStartDate','manualEndDate'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
      await fetchSettings();
      updateDashboard();
      displayRecurringStatus();
      showToast('Budget period cleared.', 'success');
    } else {
      showToast('Failed to clear period.', 'error');
    }
  } catch(e) { showToast('Connection error', 'error'); }
}

async function clearBudgetSettings() {
  if (!confirm('Clear your budget period and limits? Your transactions will NOT be deleted.')) return;
  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ balance: 0, monthly_limit: 0, start_date: null, end_date: null })
    });
    if (res.ok) {
      await fetchSettings();
      updateDashboard();
      displayRecurringStatus();
      showToast('Budget period cleared.', 'success');
    } else {
      showToast('Failed to clear budget settings.', 'error');
    }
  } catch(e) { showToast('Connection error', 'error'); }
}

async function clearRecurringSetup() {
  if (!confirm('Clear your automatic setup? This will stop auto-renewal.')) return;
  try {
    const res = await fetch(`${API_BASE}/recurring-settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ income_amount: 0, monthly_limit: 0, start_date: null, is_active: false, rollover_enabled: false })
    });
    if (res.ok) {
      recurringSettings = {};
      displayRecurringStatus();
      showToast('Automatic setup cleared.', 'success');
    } else {
      showToast('Failed to clear recurring setup.', 'error');
    }
  } catch(e) { showToast('Connection error', 'error'); }
}

async function clearAllTransactions() {
  if (!confirm('Delete ALL transactions? This cannot be undone.')) return;
  if (!confirm('Are you sure? All transaction history will be permanently deleted.')) return;
  try {
    const res = await fetch(`${API_BASE}/transactions/all`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      transactions = [];
      renderTransactions();
      updateDashboard();
      showToast('All transactions cleared.', 'success');
    } else {
      showToast('Failed to clear transactions.', 'error');
    }
  } catch(e) { showToast('Connection error', 'error'); }
}

function handleAuthError() {
  localStorage.removeItem('authToken');
  showToast('Your session has expired. Please login again.', 'error');
  setTimeout(() => location.reload(), 2000);
}

function updateCategoriesFromTransactions() {
  categories = {};
  transactions.forEach(t => {
    if (!categories[t.category]) categories[t.category] = 0;
    categories[t.category] += t.amount;
  });
}

// ======= Initialize on page load =======
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM Content Loaded'); // Debug log
  console.log('Toast container exists:', !!document.getElementById('toastContainer')); // Debug log
  
  initializeTheme();
  const token = localStorage.getItem('authToken');
  if (token) {
    initializeApp();
  } else {
    showLoginForm();
  }
  

});

async function initializeApp() {
  // Clear any cached data when switching users
  categories = {};
  transactions = [];
  monthlyDivisions = [];
  
  await fetchTransactions();
  await fetchSettings();
  await fetchAnalytics();
  await fetchMonthlyDivisions();
  await fetchRecurringSettings();
  await checkAndApplyRecurring(); // Check recurring on load
  renderTransactions();
  updateDashboard();
  populateProfileForm();
  if (typeof refreshSmartFeatures === "function") refreshSmartFeatures();
  populateDivisionForm();
  displaySavedDivisions();
  displayRecurringStatus();
  populateTransactionFilter();
  switchTab('dashboard');
  // V4: apply due recurring transactions on load
  if (typeof applyDueRecurring === "function") setTimeout(applyDueRecurring, 1500);

  // Wire AI description → category suggest
  const descInput = document.getElementById('dashDesc');
  if (descInput) descInput.addEventListener('input', onDescriptionInput);
}

// ======= Tab Switching =======
function switchTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll(".tab-content").forEach(sec => {
    sec.classList.remove("active");
    sec.style.display = "none";
  });
  
  // Show selected tab
  const target = document.getElementById(tabId);
  if (target) {
    target.classList.add("active");
    target.style.display = "block";
  }

  // Update nav tab highlighting (desktop + mobile bottom nav)
  document.querySelectorAll(".nav-tab, .bottom-nav-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(btn => btn.classList.add("active"));

  // Update content based on tab
  if (tabId === "dashboard") {
    updateDashboard();
  } else if (tabId === "profile") {
    populateProfileForm();
    populateDivisionForm();
    displaySavedDivisions();
    displayRecurringStatus();
  } else if (tabId === "transactions") {
    renderTransactions();
    populateTransactionFilter();
  } else if (tabId === "analytics") {
    renderAnalyticsTab();
    if (typeof renderReportCard === "function") renderReportCard();
    if (typeof renderGoalsPanel === "function") renderGoalsPanel();
    if (typeof loadHeatmap === "function") loadHeatmap();
  } else if (tabId === "recurring") {
    if (typeof loadRecurringTransactions === "function") loadRecurringTransactions();
  }
}

// ======= Toast Notifications =======
function showToast(message, type = 'info') {
  console.log('showToast called:', message, type); // Debug log
  
  const container = document.getElementById('toastContainer');
  if (!container) {
    console.error('Toast container not found in DOM!');
    alert(message); // Fallback to alert if container missing
    return;
  }

  console.log('Toast container found, creating toast element'); // Debug log

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.display = 'block'; // Ensure it's visible

  container.appendChild(toast);
  console.log('Toast appended to container'); // Debug log

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => {
      toast.remove();
      console.log('Toast removed'); // Debug log
    }, 300);
  }, 3000);
}

// ======= Transactions =======
async function addTransaction(event) {
  event.preventDefault();

  let category = document.getElementById("dashCategory").value.trim();
  const amount = parseFloat(document.getElementById("dashAmount").value);
  const dateInput = document.getElementById("dashDate").value;
  const desc = document.getElementById("dashDesc").value.trim();

  if (!category || isNaN(amount)) {
    showToast("Please enter category and amount", 'error');
    return;
  }

  const transactionDate = dateInput || new Date().toISOString().split('T')[0];

  try {
    const response = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        category: category.toUpperCase(),
        amount,
        description: desc,
        date: transactionDate
      })
    });

    if (response.ok) {
      await fetchTransactions();
      await fetchAnalytics();
      renderTransactions();
      updateDashboard();
      if (typeof refreshSmartFeatures === "function") setTimeout(refreshSmartFeatures, 100);
      updateSpendingChart();
      showToast('Transaction added successfully!', 'success');
      document.getElementById("dashboardTransactionForm").reset();
    } else {
      showToast('Failed to add transaction', 'error');
    }
  } catch (error) {
    showToast('Connection error', 'error');
  }
}

async function updateTransaction(event) {
  event.preventDefault();

  const id = document.getElementById("editId").value;
  const category = document.getElementById("editCategory").value.trim().toUpperCase();
  const amount = parseFloat(document.getElementById("editAmount").value);
  const date = document.getElementById("editDate").value;
  const desc = document.getElementById("editDesc").value.trim();

  if (!category || isNaN(amount) || !date) {
    showToast("Please fill all required fields", 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/transactions/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ category, amount, description: desc, date })
    });

    if (response.ok) {
      await fetchTransactions();
      await fetchAnalytics();
      renderTransactions();
      updateDashboard();
      if (typeof refreshSmartFeatures === "function") setTimeout(refreshSmartFeatures, 100);
      updateSpendingChart();
      closeEditModal();
      showToast('Transaction updated!', 'success');
    } else {
      showToast('Failed to update transaction', 'error');
    }
  } catch (error) {
    showToast('Connection error', 'error');
  }
}

async function deleteTransaction(id) {
  if (!confirm('Are you sure you want to delete this transaction?')) return;

  try {
    const response = await fetch(`${API_BASE}/transactions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (response.ok) {
      await fetchTransactions();
      await fetchAnalytics();
      renderTransactions();
      updateDashboard();
      if (typeof refreshSmartFeatures === "function") setTimeout(refreshSmartFeatures, 100);
      updateSpendingChart();
      showToast('Transaction deleted', 'success');
    } else {
      showToast('Failed to delete transaction', 'error');
    }
  } catch (error) {
    showToast('Connection error', 'error');
  }
}

function openEditModal(transaction) {
  document.getElementById("editId").value = transaction.id;
  document.getElementById("editCategory").value = transaction.category;
  document.getElementById("editAmount").value = transaction.amount;
  document.getElementById("editDate").value = transaction.date;
  document.getElementById("editDesc").value = transaction.description;
  document.getElementById("editModal").style.display = "block";
}

function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
}

// ======= Render Functions =======
function renderTransactions(filteredTransactions = null) {
  const container = document.getElementById("transactionsList");
  if (!container) return;

  let toRender = filteredTransactions || transactions;

  // V4: apply tag filter if any
  if (typeof filterTransactionsByTag === "function") {
    toRender = filterTransactionsByTag(toRender);
  }

  container.innerHTML = "";

  if (toRender.length === 0) {
    container.innerHTML = '<p class="empty-state">No transactions yet.</p>';
    updateSpendingChart();
    return;
  }

  toRender.forEach(t => {
    const card = document.createElement("div");
    card.className = "card";
    const tagsHtml = t.tags ? `<div class="transaction-tags">${typeof formatTags === 'function' ? formatTags(t.tags) : t.tags}</div>` : '';
    const notesHtml = t.notes ? `<div class="transaction-notes">📝 ${t.notes}</div>` : '';
    const splitBadge = t.is_split ? `<span class="split-badge">SPLIT</span>` : '';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <h3 style="margin: 0; font-size: 1.1rem; color: var(--accent-primary);">${t.category}${splitBadge}</h3>
        <span style="font-weight: 600; color: var(--danger);">₹${t.amount.toFixed(2)}</span>
      </div>
      <p style="margin: 0.3rem 0; color: var(--text-secondary); font-size: 0.9rem;">${new Date(t.date + 'T00:00:00').toLocaleDateString('en-IN')}</p>
      <p style="margin: 0.3rem 0; color: var(--text-secondary); font-size: 0.9rem;">${t.description || 'No description'}</p>
      ${tagsHtml}
      ${notesHtml}
      <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
        <button class="icon-btn" title="Tags & Notes" onclick='openTagsModal(${t.id}, ${JSON.stringify(t.tags||"")}, ${JSON.stringify(t.notes||"")})'>🏷</button>
        <button class="edit" onclick='openEditModal(${JSON.stringify(t)})'>Edit</button>
        <button class="delete" onclick="deleteTransaction(${t.id})">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });

  updateSpendingChart();
  if (typeof applyAnomalyHighlights === "function") setTimeout(applyAnomalyHighlights, 50);
}

// ======= Dashboard Updates =======
function updateDashboard() {
  const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
  const remaining = Math.max(0, settings.balance - totalSpent);
  const _today = new Date(); _today.setHours(0,0,0,0);
  const _end = settings.endDate ? new Date(settings.endDate + 'T00:00:00') : null;
  const daysLeft = _end ? Math.max(0, Math.round((_end - _today) / (1000 * 60 * 60 * 24))) : 0;
  const dailyBudget = daysLeft > 0 ? (remaining / daysLeft).toFixed(2) : 0;

  document.getElementById("statBalance").textContent = `₹${settings.balance.toFixed(2)}`;
  document.getElementById("statLimit").textContent = `₹${settings.monthlyLimit.toFixed(2)}`;
  document.getElementById("statSpent").textContent = `₹${totalSpent.toFixed(2)}`;
  document.getElementById("statRemaining").textContent = `₹${remaining.toFixed(2)}`;
  document.getElementById("statDays").textContent = daysLeft;
  document.getElementById("statDaily").textContent = `₹${dailyBudget}`;

  updateCategorySpending();
}

function updateCategorySpending() {
  const container = document.getElementById("categorySpendingGrid");
  if (!container) return;

  container.innerHTML = "";

  if (monthlyDivisions.length === 0) {
    container.innerHTML = '<p class="empty-state">Set up monthly divisions in Profile to see breakdowns.</p>';
    return;
  }

  monthlyDivisions.forEach(division => {
    const categoryName = division.category.toUpperCase();
    const budgetAmount = division.amount;
    
    // Find how much has been spent in this category
    const spentAmount = categories[categoryName] || 0;
    const remaining = Math.max(0, budgetAmount - spentAmount);
    const percentage = budgetAmount > 0 ? ((spentAmount / budgetAmount) * 100).toFixed(1) : 0;
    
    // Color coding: green if under budget, red if over budget
    let color = '#10b981'; // green
    if (spentAmount > budgetAmount) {
      color = '#ef4444'; // red - over budget
    } else if (percentage > 80) {
      color = '#f59e0b'; // orange - warning
    }

    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
      <div class="mini-pie" style="background: conic-gradient(${color} 0% ${Math.min(percentage, 100)}%, var(--bg-secondary) ${Math.min(percentage, 100)}% 100%);"></div>
      <div class="category-name">${division.category}</div>
      <div class="category-percentage">${percentage}%</div>
      <div class="category-amount">₹${spentAmount.toFixed(2)} / ₹${budgetAmount.toFixed(2)}</div>
      <div class="category-remaining" style="font-size: 0.85rem; color: ${remaining > 0 ? 'var(--success)' : 'var(--danger)'};">
        ${remaining > 0 ? `₹${remaining.toFixed(2)} left` : `₹${Math.abs(remaining).toFixed(2)} over`}
      </div>
    `;
    container.appendChild(item);
  });
}

function updateSpendingChart() {
  const canvas = document.getElementById("spendingChart");
  if (!canvas) return;

  const labels = Object.keys(categories || {});
  const data = labels.map(l => categories[l]);

  if (spendingChart && spendingChart.destroy) {
    try { spendingChart.destroy(); } catch (e) { }
    spendingChart = null;
  }

  if (labels.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const colors = ['#e94560', '#533483', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  spendingChart = new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card')
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary'),
            padding: 15,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              return `${label}: ₹${value.toFixed(2)}`;
            }
          }
        }
      }
    }
  });
}

// ======= Profile / Settings Functions =======
function populateProfileForm() {
  const balanceInput = document.getElementById('manualBalance');
  const limitInput = document.getElementById('manualLimit');
  const startInput = document.getElementById('manualStartDate');
  const endInput = document.getElementById('manualEndDate');

  if (balanceInput) balanceInput.value = settings.balance || '';
  if (limitInput) limitInput.value = settings.monthlyLimit || '';
  if (startInput && settings.startDate) startInput.value = settings.startDate;
  if (endInput && settings.endDate) endInput.value = settings.endDate;

  // Populate automatic setup defaults
  const autoStartDateInput = document.getElementById('autoStartDateInput');
  if (autoStartDateInput) {
    let defaultStart;
    if (settings.endDate) {
      const nextDay = new Date(settings.endDate + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      const y = nextDay.getFullYear();
      const m = String(nextDay.getMonth() + 1).padStart(2, '0');
      const d = String(nextDay.getDate()).padStart(2, '0');
      defaultStart = `${y}-${m}-${d}`;
    } else {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      defaultStart = `${y}-${m}-${d}`;
    }
    autoStartDateInput.value = defaultStart;
  }
}

function populateDivisionForm() {
  const container = document.getElementById('divisionRows');
  if (!container) return;
  
  // Clear existing rows
  container.innerHTML = '';
  
  if (monthlyDivisions.length === 0) {
    // Add one empty row if no divisions
    addDivisionRow();
  } else {
    // Populate with saved divisions
    monthlyDivisions.forEach(division => {
      const newRow = document.createElement('div');
      newRow.className = 'division-row';
      newRow.innerHTML = `
        <input type="text" placeholder="Where to Spend" class="division-category" value="${division.category}">
        <input type="number" placeholder="Amount" step="0.01" class="division-amount" value="${division.amount}">
        <button type="button" class="remove-row-btn" onclick="removeDivisionRow(this)">✕</button>
      `;
      container.appendChild(newRow);
    });
  }
}

async function saveManualSetup(event) {
  event.preventDefault();

  const newSettings = {
    balance: parseFloat(document.getElementById('manualBalance').value) || 0,
    monthly_limit: parseFloat(document.getElementById('manualLimit').value) || 0,
    start_date: document.getElementById('manualStartDate').value || null,
    end_date: document.getElementById('manualEndDate').value || null
  };

  try {
    const response = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(newSettings)
    });

    if (response.ok) {
      const data = await response.json();
      settings.balance = data.balance;
      settings.monthlyLimit = data.monthly_limit;
      settings.startDate = data.start_date;
      settings.endDate = data.end_date;

      populateProfileForm();
      updateDashboard();
      displayRecurringStatus();
      showToast("Manual setup saved successfully!", 'success');
    } else {
      const err = await response.json();
      showToast(err.detail || "Failed to save settings", 'error');
    }
  } catch (err) {
    showToast("Connection error", 'error');
  }
}

async function resetBalance() {
  if (!confirm('Are you sure you want to reset balance to 0?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        balance: 0,
        monthly_limit: settings.monthlyLimit,
        start_date: settings.startDate,
        end_date: settings.endDate
      })
    });

    if (response.ok) {
      settings.balance = 0;
      document.getElementById('manualBalance').value = 0;
      updateDashboard();
      displayRecurringStatus();
      showToast("Balance reset to 0!", 'success');
    }
  } catch (err) {
    showToast("Connection error", 'error');
  }
}

async function addToCurrent() {
  const addAmount = parseFloat(document.getElementById('manualBalance').value);
  
  if (isNaN(addAmount) || addAmount === 0) {
    showToast('Please enter a valid amount to add', 'error');
    return;
  }

  const newBalance = settings.balance + addAmount;

  try {
    const response = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        balance: newBalance,
        monthly_limit: settings.monthlyLimit,
        start_date: settings.startDate,
        end_date: settings.endDate
      })
    });

    if (response.ok) {
      settings.balance = newBalance;
      document.getElementById('manualBalance').value = newBalance;
      updateDashboard();
      displayRecurringStatus();
      showToast(`Added ₹${addAmount.toFixed(2)} to balance!`, 'success');
    }
  } catch (err) {
    showToast("Connection error", 'error');
  }
}

// ======= Monthly Division Functions =======
function addDivisionRow() {
  const container = document.getElementById('divisionRows');
  if (!container) return;
  
  const newRow = document.createElement('div');
  newRow.className = 'division-row';
  newRow.innerHTML = `
    <input type="text" placeholder="Where to Spend" class="division-category">
    <input type="number" placeholder="Amount" step="0.01" class="division-amount">
    <button type="button" class="remove-row-btn" onclick="removeDivisionRow(this)">✕</button>
  `;
  container.appendChild(newRow);
}

function removeDivisionRow(button) {
  const row = button.parentElement;
  const container = document.getElementById('divisionRows');
  
  if (container && container.children.length > 1) {
    row.remove();
  } else {
    showToast('You must have at least one division row', 'warning');
  }
}

async function saveMonthlyDivision(event) {
  event.preventDefault();
  
  const rows = document.querySelectorAll('.division-row');
  const divisions = [];
  
  rows.forEach(row => {
    const category = row.querySelector('.division-category').value.trim();
    const amount = parseFloat(row.querySelector('.division-amount').value);
    
    if (category && !isNaN(amount) && amount > 0) {
      divisions.push({ category, amount });
    }
  });
  
  if (divisions.length === 0) {
    showToast('Please add at least one valid division', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/monthly-divisions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ divisions })
    });

    if (response.ok) {
      await fetchMonthlyDivisions();
      displaySavedDivisions();
      updateDashboard();
      showToast("Monthly divisions saved! Go to Dashboard to see category spending.", 'success');
    } else {
      const error = await response.json();
      showToast(error.detail || "Failed to save divisions", 'error');
    }
  } catch (error) {
    showToast("Connection error", 'error');
  }
}

function displaySavedDivisions() {
  const container = document.getElementById('savedDivisions');
  if (!container) return;
  
  if (monthlyDivisions.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  const total = monthlyDivisions.reduce((sum, d) => sum + d.amount, 0);
  
  container.innerHTML = '<h3 style="color: var(--accent-primary); margin-bottom: 1rem;">Saved Divisions</h3>';
  
  monthlyDivisions.forEach(division => {
    const item = document.createElement('div');
    item.className = 'saved-division-item';
    item.innerHTML = `
      <span style="color: var(--text-primary); font-weight: 500;">${division.category}</span>
      <span style="color: var(--accent-primary); font-weight: 600;">₹${division.amount.toFixed(2)}</span>
    `;
    container.appendChild(item);
  });
  
  const totalItem = document.createElement('div');
  totalItem.className = 'saved-division-item';
  totalItem.style.borderTop = '2px solid var(--border-color)';
  totalItem.style.marginTop = '0.5rem';
  totalItem.style.paddingTop = '0.8rem';
  totalItem.innerHTML = `
    <span style="color: var(--text-primary); font-weight: 600;">TOTAL</span>
    <span style="color: var(--accent-primary); font-weight: 700; font-size: 1.1rem;">₹${total.toFixed(2)}</span>
  `;
  container.appendChild(totalItem);
}

// ======= Automatic Setup Functions =======
async function saveAutoSetup(event) {
  event.preventDefault();
  
  const income = Math.round(parseFloat(document.getElementById('autoIncome').value) * 100) / 100;
  const limit = Math.round((parseFloat(document.getElementById('autoLimit').value) || income) * 100) / 100;
  const startFrom = document.getElementById('autoStartDateInput').value;
  const receiveDate = document.getElementById('autoReceiveDate').value;
  const rollover = document.getElementById('enableRollover').checked;
  const autoRenewal = document.getElementById('enableAutoRenewal').checked;
  
  if (isNaN(income) || !startFrom) {
    showToast('Please fill in all required fields', 'error');
    return;
  }
  
  const startDate = new Date(startFrom + 'T00:00:00');
  // End = last day of same month as start
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
  
  const startDateStr = startFrom;
  const endDateStr = endDate.toISOString().split('T')[0];
  
  document.getElementById('autoStartDate').textContent = new Date(startDateStr).toLocaleDateString('en-IN');
  document.getElementById('autoEndDate').textContent = new Date(endDateStr).toLocaleDateString('en-IN');
  document.getElementById('autoInfo').style.display = 'block';
  
  // Save to recurring settings
  await saveRecurringSettings({
    income_amount: income,
    monthly_limit: limit,
    start_date: startDateStr,
    is_active: autoRenewal,
    rollover_enabled: rollover
  });

  // If start date is today, apply immediately
  if (startDateStr === new Date().toISOString().split('T')[0]) {
    await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        balance: income,
        monthly_limit: limit,
        start_date: startDateStr,
        end_date: endDateStr
      })
    });
    await checkAndApplyRecurring();
    await fetchSettings();
    updateDashboard();
    displayRecurringStatus();
    showToast("Automatic setup applied!", 'success');
  } else {
    showToast("Automatic setup scheduled for future date!", 'info');
  }
}

// ======= Recurring Status Display =======
function displayRecurringStatus() {
  const currentStatus = document.getElementById('currentPeriodStatus');
  const scheduledStatus = document.getElementById('scheduledRecurringStatus');

  if (currentStatus) {
    const period = settings.startDate && settings.endDate ? `${new Date(settings.startDate + 'T00:00:00').toLocaleDateString('en-IN')} - ${new Date(settings.endDate + 'T00:00:00').toLocaleDateString('en-IN')}` : 'Not set';
    const type = settings.startDate ? 'Manual' : 'None';
    currentStatus.innerHTML = `
      <p><strong>Current Period:</strong> ${period}</p>
      <p><strong>Balance:</strong> ₹${settings.balance.toFixed(2)} | <strong>Limit:</strong> ₹${settings.monthlyLimit.toFixed(2)} | <strong>Type:</strong> ${type}</p>
    `;
  }

  if (scheduledStatus && recurringSettings.start_date) {
    scheduledStatus.innerHTML = `
      <p><strong>Scheduled Recurring:</strong> Starting ${new Date(recurringSettings.start_date + 'T00:00:00').toLocaleDateString('en-IN')}</p>
      <p><strong>Income:</strong> ₹${recurringSettings.income_amount}/month | <strong>Limit:</strong> ₹${recurringSettings.monthly_limit} | <strong>Rollover:</strong> ${recurringSettings.rollover_enabled ? 'Enabled' : 'Disabled'}</p>
    `;
  } else if (scheduledStatus) {
    scheduledStatus.innerHTML = '<p>No scheduled recurring setup.</p>';
  }
}

// ======= Transaction Filtering =======
function populateTransactionFilter() {
  const container = document.getElementById('transactionFilterSlider');
  if (!container) return;

  // Clear existing items
  container.innerHTML = '';

  // Add filter options
  const filters = [
    { value: 'total', label: 'All Time' },
    { value: 'current', label: 'Current Month' }
  ];

  // Get unique months from transactions (sorted descending)
  const months = [...new Set(transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const pastMonths = months.filter(m => m < currentMonth).slice(0, 2);

  pastMonths.forEach(month => {
    filters.push({
      value: month,
      label: new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })
    });
  });

  filters.forEach(filter => {
    const item = document.createElement('div');
    item.className = 'filter-item' + (filter.value === currentFilter ? ' active' : '');
    item.textContent = filter.label;
    item.dataset.value = filter.value;
    item.onclick = () => filterTransactions(filter.value);
    container.appendChild(item);
  });

  // Apply initial filter
  filterTransactions(currentFilter);
}

function filterTransactions(value) {
  currentFilter = value;
  let filtered = transactions;

  if (value === 'current') {
    const currentMonth = new Date().toISOString().slice(0, 7);
    filtered = transactions.filter(t => t.date.startsWith(currentMonth));
  } else if (value !== 'total') {
    filtered = transactions.filter(t => t.date.startsWith(value));
  }

  // Expose for CSV export
  window._currentFilteredTransactions = filtered;
  window._currentFilterLabel = value === 'total' ? 'all_time' :
                               value === 'current' ? 'current_month' : value;

  const spent = filtered.reduce((sum, t) => sum + t.amount, 0);
  const savings = value === 'total'
    ? settings.balance - spent
    : settings.monthlyLimit - spent;
  
  const displayLabel = value === 'total' ? 'All Time' : 
                       value === 'current' ? 'Current Month' : 
                       new Date(value + '-01').toLocaleString('default', { month: 'long', year: 'numeric' });
  
  document.getElementById('transactionSummary').textContent = `${displayLabel} | Spent: ₹${spent.toFixed(2)} | Savings: ₹${savings.toFixed(2)}`;

  // Update filter item highlighting using data-value attribute
  document.querySelectorAll('.filter-item').forEach(item => {
    item.classList.toggle('active', item.dataset.value === value);
  });

  renderTransactions(filtered);
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('editModal');
  if (event.target === modal) {
    closeEditModal();
  }
}