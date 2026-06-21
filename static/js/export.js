// ======= CSV Export =======

function exportCSV() {
  // Get currently filtered transactions (set by filterTransactions in script.js)
  const toExport = window._currentFilteredTransactions || transactions;

  if (!toExport || toExport.length === 0) {
    showToast('No transactions to export', 'warning');
    return;
  }

  const header = ['Date', 'Category', 'Amount', 'Description'];
  const rows = toExport.map(t => [
    t.date,
    t.category,
    t.amount.toFixed(2),
    `"${(t.description || '').replace(/"/g, '""')}"`  // escape quotes
  ]);

  const csvContent = [header, ...rows]
    .map(row => row.join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  const label = window._currentFilterLabel || 'all';
  link.download = `transactions_${label}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Exported ${toExport.length} transactions`, 'success');
}
