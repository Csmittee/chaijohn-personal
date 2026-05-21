/**
 * dashboard.injector.js — Finance dashboard page logic.
 * Depends on: Chart.js (loaded via CDN in dashboard.html)
 */

/* ─── Utility helpers ─── */
function formatThb(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '฿—';
  const n = Math.round(Number(amount));
  if (Math.abs(n) >= 100) return '฿' + n.toLocaleString('en-US');
  return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

async function api(path, options) {
  options = options || {};
  const res = await fetch(path, Object.assign({}, options, {
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    credentials: 'same-origin'
  }));
  if (res.status === 401) { window.location.href = '/index.html'; throw new Error('Unauthorized'); }
  return res;
}

function showFlash(msg, type) {
  type = type || 'success';
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:1rem;right:1rem;padding:0.75rem 1.25rem;border-radius:8px;' +
    'background:' + (type === 'success' ? '#22c55e' : '#ef4444') + ';color:white;font-weight:500;z-index:9999;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.2)';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.remove(); }, 3000);
}

/* ─── Period helpers ─── */
function getPeriodRange(period) {
  const now = new Date();
  let start, end, days;
  if (period === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    days = end.getDate();
  } else if (period === 'weekly') {
    const day = now.getDay();
    start = new Date(now); start.setDate(now.getDate() - day);
    end = new Date(start); end.setDate(start.getDate() + 6);
    days = 7;
  } else { // daily
    start = new Date(now);
    end = new Date(now);
    days = 1;
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
    days: days
  };
}

function getWeekNum(d) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
}

function getLast6PeriodLabels(period) {
  const labels = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    if (period === 'monthly') {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
    } else if (period === 'weekly') {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      labels.push('W' + getWeekNum(d) + "'" + String(d.getFullYear()).slice(-2));
    } else {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
  }
  return labels;
}

function getLast6PeriodRanges(period) {
  const ranges = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    if (period === 'monthly') {
      const y = now.getFullYear() + Math.floor((now.getMonth() - i) / 12);
      const m = ((now.getMonth() - i) % 12 + 12) % 12;
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      ranges.push({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
    } else if (period === 'weekly') {
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() - i * 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      ranges.push({ start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] });
    } else {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      ranges.push({ start: iso, end: iso });
    }
  }
  return ranges;
}

function sumTransactionsForRange(allTransactions, rangeStart, rangeEnd, type) {
  return allTransactions
    .filter(function (t) {
      const date = t.fields.date || '';
      return t.fields.type === type && date >= rangeStart && date <= rangeEnd;
    })
    .reduce(function (sum, t) { return sum + (t.fields.amount || 0); }, 0);
}

/* ─── Quote banner ─── */
async function loadQuote() {
  try {
    const res = await api('/api/quotes/random');
    if (!res.ok) return;
    const data = await res.json();
    const record = data.record || (data.records && data.records[0]);
    if (!record) return;
    const f = record.fields || {};
    const banner = document.getElementById('quote-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    banner.style.display = 'block';
    banner.innerHTML = `
      <button id="dismiss-quote" style="position:absolute;top:0.5rem;right:0.75rem;background:none;border:none;color:inherit;font-size:1.2rem;cursor:pointer;opacity:0.6;line-height:1" title="Dismiss">×</button>
      <div style="font-style:italic;font-size:1rem;margin-bottom:0.35rem;padding-right:1.5rem">"${f.text || ''}"</div>
      <div style="font-size:0.78rem;opacity:0.7">— ${f.author || 'Unknown'}${f.source ? ' · ' + f.source : ''}</div>
    `;
    banner.style.position = 'relative';
    const dismissBtn = document.getElementById('dismiss-quote');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        banner.style.display = 'none';
      });
    }
  } catch (e) { /* non-critical */ }
}

/* ─── Data fetching ─── */
async function fetchDashboardData(start, end) {
  const [txRes, catRes, debtRes, assetRes, budgetRes] = await Promise.all([
    fetch('/api/transactions?start=' + start + '&end=' + end, { credentials: 'same-origin' }),
    fetch('/api/categories', { credentials: 'same-origin' }),
    fetch('/api/debts', { credentials: 'same-origin' }),
    fetch('/api/assets', { credentials: 'same-origin' }),
    fetch('/api/budgets', { credentials: 'same-origin' })
  ]);
  const [txData, catData, debtData, assetData, budgetData] = await Promise.all([
    txRes.json().catch(function () { return {}; }),
    catRes.json().catch(function () { return {}; }),
    debtRes.json().catch(function () { return {}; }),
    assetRes.json().catch(function () { return {}; }),
    budgetRes.json().catch(function () { return {}; })
  ]);
  return {
    transactions: txData.records || [],
    categories: catData.records || [],
    debts: debtData.records || [],
    assets: assetData.records || [],
    budgets: budgetData.records || []
  };
}

/* ─── Section A: Cashflow Speed Panel ─── */
function loadCashflowSection(transactions, budgets, periodDays) {
  const expenses = transactions.filter(function (t) { return t.fields.type === 'Expense'; });
  const incomes = transactions.filter(function (t) { return t.fields.type === 'Income'; });
  const totalExpense = expenses.reduce(function (s, t) { return s + (t.fields.amount || 0); }, 0);
  const totalIncome = incomes.reduce(function (s, t) { return s + (t.fields.amount || 0); }, 0);
  const dailySpend = periodDays > 0 ? totalExpense / periodDays : 0;
  const net = totalIncome - totalExpense;

  // Card: totals
  const incomeEl = document.getElementById('dash-total-income');
  if (incomeEl) incomeEl.textContent = formatThb(totalIncome);
  const expenseEl = document.getElementById('dash-total-expense');
  if (expenseEl) expenseEl.textContent = formatThb(totalExpense);

  // Card: Net cash position
  const netEl = document.getElementById('cash-net');
  if (netEl) {
    netEl.textContent = formatThb(Math.abs(net));
    netEl.className = net >= 0 ? 'metric-value amount-positive' : 'metric-value amount-negative';
  }
  const subEl = document.getElementById('cash-sub');
  if (subEl) subEl.textContent = net >= 0 ? 'surplus' : 'deficit';

  // Card: Daily spend rate
  const dailyEl = document.getElementById('daily-spend');
  if (dailyEl) dailyEl.textContent = formatThb(dailySpend) + '/day';

  // Card: Days to critical (how many days current income covers at current spend rate)
  const daysLeft = dailySpend > 0 ? Math.floor(totalIncome / dailySpend) : 999;
  const daysEl = document.getElementById('days-value');
  if (daysEl) {
    daysEl.textContent = daysLeft >= 999 ? '∞' : daysLeft;
    daysEl.style.color = daysLeft < 14
      ? 'var(--color-expense, #ef4444)'
      : daysLeft < 30
        ? 'var(--color-warning, #f59e0b)'
        : 'var(--color-income, #22c55e)';
  }
  const critDateEl = document.getElementById('critical-date');
  if (critDateEl) {
    if (daysLeft >= 999) {
      critDateEl.textContent = 'No critical date';
    } else {
      const critDate = new Date();
      critDate.setDate(critDate.getDate() + daysLeft);
      critDateEl.textContent = critDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }

  // Gauge chart for spend rate vs budget
  const gaugeCtx = document.getElementById('spend-gauge');
  if (gaugeCtx && typeof Chart !== 'undefined') {
    const plannedMonthly = budgets.reduce(function (s, b) {
      const f = b.fields || {};
      if (f.active === false) return s;
      return s + (f.amount || 0);
    }, 0);
    const plannedDaily = plannedMonthly / 30;
    const gaugeValue = plannedDaily > 0 ? Math.min(Math.round((dailySpend / plannedDaily) * 100), 150) : 0;
    const used = Math.min(gaugeValue, 100);
    const over = Math.max(gaugeValue - 100, 0);
    const remaining = Math.max(100 - gaugeValue, 0);

    if (window._spendGaugeChart) window._spendGaugeChart.destroy();
    window._spendGaugeChart = new Chart(gaugeCtx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [used, over, remaining],
          backgroundColor: [
            gaugeValue > 100 ? '#ef4444' : gaugeValue > 80 ? '#f59e0b' : '#22c55e',
            '#ef4444',
            'rgba(255,255,255,0.05)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        rotation: -90,
        circumference: 180,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
    const gaugeLabel = document.getElementById('gauge-label');
    if (gaugeLabel) gaugeLabel.textContent = gaugeValue + '% of budget';
  }
}

/* ─── Section B: Trend chart (last 6 periods) ─── */
let trendChart = null;
function loadTrendChart(allTransactions, period) {
  const ctx = document.getElementById('trend-chart');
  if (!ctx || typeof Chart === 'undefined') return;

  const labels = getLast6PeriodLabels(period);
  const ranges = getLast6PeriodRanges(period);

  const incomeData = ranges.map(function (r) {
    return sumTransactionsForRange(allTransactions, r.start, r.end, 'Income');
  });
  const expenseData = ranges.map(function (r) {
    return sumTransactionsForRange(allTransactions, r.start, r.end, 'Expense');
  });

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.09)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#22c55e',
          pointRadius: 3,
          borderWidth: 2
        },
        {
          label: 'Expense',
          data: expenseData,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.09)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#ef4444',
          pointRadius: 3,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: 'rgba(255,255,255,0.7)', boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + ': ฿' + (ctx.raw || 0).toLocaleString('en-US');
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: {
            color: 'rgba(255,255,255,0.5)',
            font: { size: 10 },
            callback: function (v) { return '฿' + v.toLocaleString('en-US'); }
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

/* ─── Section C: Pareto chart ─── */
let paretoChart = null;
function loadParetoChart(transactions) {
  const ctx = document.getElementById('pareto-chart');
  if (!ctx || typeof Chart === 'undefined') return;

  const expenses = transactions.filter(function (t) { return t.fields.type === 'Expense'; });
  const byCategory = {};
  expenses.forEach(function (t) {
    const cat = t.fields.category_name || 'Uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + (t.fields.amount || 0);
  });

  const sorted = Object.entries(byCategory).sort(function (a, b) { return b[1] - a[1]; });
  const labels = sorted.map(function (s) { return s[0]; });
  const amounts = sorted.map(function (s) { return s[1]; });
  const total = amounts.reduce(function (a, b) { return a + b; }, 0);

  let cum = 0;
  const cumPct = amounts.map(function (a) {
    cum += a;
    return total > 0 ? Math.round((cum / total) * 100) : 0;
  });

  if (paretoChart) paretoChart.destroy();
  paretoChart = new Chart(ctx, {
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'Expense',
          data: amounts,
          backgroundColor: 'rgba(239,68,68,0.72)',
          borderColor: 'rgba(239,68,68,0.9)',
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Cumulative %',
          data: cumPct,
          borderColor: '#60a5fa',
          backgroundColor: 'transparent',
          yAxisID: 'y1',
          tension: 0.25,
          pointRadius: 3,
          pointBackgroundColor: '#60a5fa',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: function (evt, elements) {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          openDrillDown(labels[idx], transactions);
        }
      },
      plugins: {
        legend: {
          labels: { color: 'rgba(255,255,255,0.7)', boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              if (ctx.datasetIndex === 0) return '฿' + (ctx.raw || 0).toLocaleString('en-US');
              return ctx.raw + '%';
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'rgba(255,255,255,0.5)',
            font: { size: 9 },
            maxRotation: 35,
            minRotation: 0
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: {
            color: 'rgba(255,255,255,0.5)',
            font: { size: 10 },
            callback: function (v) { return '฿' + v.toLocaleString('en-US'); }
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y1: {
          position: 'right',
          min: 0,
          max: 100,
          ticks: {
            color: 'rgba(255,255,255,0.4)',
            font: { size: 10 },
            callback: function (v) { return v + '%'; }
          },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

/* ─── Drill-down panel ─── */
function openDrillDown(categoryName, transactions) {
  const panel = document.getElementById('drilldown-panel');
  const backdrop = document.getElementById('drilldown-backdrop');
  const titleEl = document.getElementById('drilldown-title');
  const content = document.getElementById('drilldown-content');
  if (!panel || !content) return;

  if (titleEl) titleEl.textContent = categoryName;

  const txForCat = transactions.filter(function (t) {
    const cat = t.fields.category_name || 'Uncategorized';
    return cat === categoryName;
  });

  txForCat.sort(function (a, b) { return (b.fields.date || '') > (a.fields.date || '') ? 1 : -1; });

  if (txForCat.length === 0) {
    content.innerHTML = '<p style="color:var(--text-secondary,#94a3b8);text-align:center;padding:1rem">No transactions</p>';
  } else {
    const rows = txForCat.map(function (t) {
      const f = t.fields;
      const isExpense = f.type === 'Expense';
      return '<tr>' +
        '<td style="white-space:nowrap">' + (f.date || '') + '</td>' +
        '<td>' + (f.description || f.entity || '') + '</td>' +
        '<td class="' + (isExpense ? 'amount-negative' : 'amount-positive') + '" style="text-align:right;white-space:nowrap">' +
        (isExpense ? '-' : '+') + formatThb(f.amount) + '</td>' +
        '</tr>';
    }).join('');

    const categoryTotal = txForCat.reduce(function (s, t) { return s + (t.fields.amount || 0); }, 0);
    content.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">' +
      '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:0.75rem">' +
      '<th style="text-align:left;padding:0.4rem 0.3rem">Date</th>' +
      '<th style="text-align:left;padding:0.4rem 0.3rem">Description</th>' +
      '<th style="text-align:right;padding:0.4rem 0.3rem">Amount</th>' +
      '</tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr style="border-top:1px solid rgba(255,255,255,0.08);font-weight:600">' +
      '<td colspan="2" style="padding:0.4rem 0.3rem">Total</td>' +
      '<td class="amount-negative" style="text-align:right;padding:0.4rem 0.3rem">' + formatThb(categoryTotal) + '</td>' +
      '</tr></tfoot></table>';
  }

  if (panel) panel.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
}

function closeDrillDown() {
  const panel = document.getElementById('drilldown-panel');
  const backdrop = document.getElementById('drilldown-backdrop');
  if (panel) panel.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

/* ─── Section D: Paynter Table (budget vs actual by category) ─── */
function loadPaynterTable(transactions, categories, budgets) {
  const container = document.getElementById('paynter-table-container');
  if (!container) return;

  const expenses = transactions.filter(function (t) { return t.fields.type === 'Expense'; });

  // Group expenses by category
  const expByCategory = {};
  expenses.forEach(function (t) {
    const cat = t.fields.category_name || 'Uncategorized';
    expByCategory[cat] = (expByCategory[cat] || 0) + (t.fields.amount || 0);
  });

  // Build budget map by label
  const budgetByLabel = {};
  budgets.forEach(function (b) {
    const f = b.fields || {};
    if (f.label) budgetByLabel[f.label] = f.amount || 0;
  });

  // Get top 8 expense categories
  const sorted = Object.entries(expByCategory)
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 8);

  if (sorted.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary,#94a3b8);text-align:center;padding:1.5rem">No expense data for this period</p>';
    return;
  }

  const rows = sorted.map(function (entry) {
    const cat = entry[0];
    const spent = entry[1];
    const budgetAmt = budgetByLabel[cat] || 0;
    const pct = budgetAmt > 0 ? Math.round((spent / budgetAmt) * 100) : null;

    let rowClass = '';
    let progressColor = '#22c55e';
    let pctText = budgetAmt > 0 ? pct + '%' : '—';
    if (pct !== null) {
      if (pct > 100) { rowClass = 'style="background:rgba(239,68,68,0.06)"'; progressColor = '#ef4444'; }
      else if (pct > 80) { rowClass = 'style="background:rgba(245,158,11,0.06)"'; progressColor = '#f59e0b'; }
    }

    const progressBar = budgetAmt > 0 ? `
      <div style="background:rgba(255,255,255,0.06);border-radius:3px;height:5px;margin-top:0.3rem;width:100%;max-width:80px">
        <div style="background:${progressColor};width:${Math.min(pct, 100)}%;height:100%;border-radius:3px"></div>
      </div>` : '';

    return '<tr ' + rowClass + ' style="cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04)" class="paynter-row" data-category="' + cat + '">' +
      '<td style="padding:0.5rem 0.4rem;font-size:0.82rem">' + cat + '</td>' +
      '<td style="padding:0.5rem 0.4rem;text-align:right;font-size:0.82rem">' + (budgetAmt > 0 ? formatThb(budgetAmt) : '—') + '</td>' +
      '<td style="padding:0.5rem 0.4rem;text-align:right;font-size:0.82rem" class="amount-negative">' + formatThb(spent) + '</td>' +
      '<td style="padding:0.5rem 0.4rem;font-size:0.82rem">' + pctText + progressBar + '</td>' +
      '</tr>';
  }).join('');

  container.innerHTML = '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.45);font-size:0.73rem">' +
    '<th style="text-align:left;padding:0.4rem">Category</th>' +
    '<th style="text-align:right;padding:0.4rem">Budget</th>' +
    '<th style="text-align:right;padding:0.4rem">Actual</th>' +
    '<th style="text-align:left;padding:0.4rem">vs Budget</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';

  // Wire row clicks → drilldown
  container.querySelectorAll('.paynter-row').forEach(function (row) {
    row.addEventListener('click', function () {
      openDrillDown(row.dataset.category, transactions);
    });
  });
}

/* ─── Section E: Debt Wave ─── */
let debtWaveChart = null;
function loadDebtWave(debts) {
  const ctx = document.getElementById('debt-wave-chart');
  const tableContainer = document.getElementById('debt-summary-table');

  const activeDebts = debts.filter(function (d) {
    const status = (d.fields.status || '').toLowerCase();
    return status !== 'paid' && status !== 'closed';
  });

  if (tableContainer) {
    if (activeDebts.length === 0) {
      tableContainer.innerHTML = '<p style="color:var(--text-secondary,#94a3b8);text-align:center;padding:1rem">No active debts</p>';
    } else {
      const rows = activeDebts.map(function (d) {
        const f = d.fields || {};
        const typeColors = { 'Bank': '#3b82f6', 'Family': '#f59e0b', 'Other': '#94a3b8' };
        const color = typeColors[f.creditor_type] || '#94a3b8';
        return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">' +
          '<td style="padding:0.45rem 0.4rem;font-size:0.82rem">' + (f.creditor_name || '') + '</td>' +
          '<td style="padding:0.45rem 0.4rem">' +
          '<span style="background:' + color + '22;color:' + color + ';padding:0.15rem 0.4rem;border-radius:4px;font-size:0.7rem;font-weight:600">' +
          (f.creditor_type || 'Other') + '</span></td>' +
          '<td style="padding:0.45rem 0.4rem;text-align:right;font-size:0.82rem" class="amount-negative">' + formatThb(f.current_balance || f.original_amount) + '</td>' +
          '<td style="padding:0.45rem 0.4rem;text-align:right;font-size:0.82rem">' + (f.interest_rate ? f.interest_rate + '%' : '—') + '</td>' +
          '<td style="padding:0.45rem 0.4rem;text-align:right;font-size:0.82rem">' + formatThb(f.monthly_payment) + '</td>' +
          '<td style="padding:0.45rem 0.4rem;text-align:right;font-size:0.82rem;opacity:0.65">' + (f.due_date || '—') + '</td>' +
          '</tr>';
      }).join('');

      const totalBalance = activeDebts.reduce(function (s, d) {
        return s + (d.fields.current_balance || d.fields.original_amount || 0);
      }, 0);
      const totalMonthly = activeDebts.reduce(function (s, d) {
        return s + (d.fields.monthly_payment || 0);
      }, 0);

      tableContainer.innerHTML = '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.45);font-size:0.72rem">' +
        '<th style="text-align:left;padding:0.35rem">Creditor</th><th style="padding:0.35rem">Type</th>' +
        '<th style="text-align:right;padding:0.35rem">Balance</th><th style="text-align:right;padding:0.35rem">Rate</th>' +
        '<th style="text-align:right;padding:0.35rem">Monthly</th><th style="text-align:right;padding:0.35rem">Due</th>' +
        '</tr></thead><tbody>' + rows + '</tbody>' +
        '<tfoot><tr style="border-top:1px solid rgba(255,255,255,0.1);font-weight:600;font-size:0.82rem">' +
        '<td colspan="2" style="padding:0.4rem">Total</td>' +
        '<td class="amount-negative" style="text-align:right;padding:0.4rem">' + formatThb(totalBalance) + '</td>' +
        '<td></td><td style="text-align:right;padding:0.4rem">' + formatThb(totalMonthly) + '</td><td></td>' +
        '</tr></tfoot></table>';
    }
  }

  // Debt wave bar chart: next 1, 3, 6 month buckets
  if (!ctx || typeof Chart === 'undefined' || activeDebts.length === 0) return;

  const buckets = [1, 3, 6];
  const now = new Date();
  const debtColors = { 'Bank': '#3b82f6', 'Family': '#f59e0b', 'Other': '#94a3b8' };

  // For each debt, show monthly payment * months for each bucket
  const datasets = activeDebts.map(function (d, idx) {
    const f = d.fields || {};
    const monthly = f.monthly_payment || 0;
    const balance = f.current_balance || f.original_amount || 0;
    const color = debtColors[f.creditor_type] || '#94a3b8';
    return {
      label: f.creditor_name || ('Debt ' + (idx + 1)),
      data: buckets.map(function (mo) { return Math.min(monthly * mo, balance); }),
      backgroundColor: color + 'bb',
      borderColor: color,
      borderWidth: 1
    };
  });

  if (debtWaveChart) debtWaveChart.destroy();
  debtWaveChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Next 1 Month', 'Next 3 Months', 'Next 6 Months'],
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 10, font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + ': ฿' + (ctx.raw || 0).toLocaleString('en-US');
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: 'rgba(255,255,255,0.4)', callback: function (v) { return '฿' + v.toLocaleString('en-US'); } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          stacked: true,
          ticks: { color: 'rgba(255,255,255,0.6)' },
          grid: { display: false }
        }
      }
    }
  });
}

/* ─── Section F: Net Worth ─── */
let netWorthChart = null;
function loadNetWorth(assets, debts) {
  const ctx = document.getElementById('networth-chart');
  const numberEl = document.getElementById('networth-number');
  const breakdownEl = document.getElementById('networth-breakdown');

  const totalAssets = assets.reduce(function (s, a) {
    const f = a.fields || {};
    if (f.status === 'Sold') return s;
    return s + (f.estimated_value || f.cost_price || 0);
  }, 0);

  const totalDebts = debts.reduce(function (s, d) {
    const f = d.fields || {};
    const status = (f.status || '').toLowerCase();
    if (status === 'paid' || status === 'closed') return s;
    return s + (f.current_balance || f.original_amount || 0);
  }, 0);

  const netWorth = totalAssets - totalDebts;

  if (numberEl) {
    numberEl.textContent = formatThb(netWorth);
    numberEl.className = netWorth >= 0 ? 'amount-positive' : 'amount-negative';
    numberEl.style.fontSize = '1.8rem';
    numberEl.style.fontWeight = '700';
  }

  // Breakdown by asset category
  const assetByCategory = {};
  assets.forEach(function (a) {
    const f = a.fields || {};
    if (f.status === 'Sold') return;
    const cat = f.category || 'Other';
    assetByCategory[cat] = (assetByCategory[cat] || 0) + (f.estimated_value || f.cost_price || 0);
  });

  if (breakdownEl) {
    const catRows = Object.entries(assetByCategory)
      .sort(function (a, b) { return b[1] - a[1]; })
      .map(function (e) {
        const pct = totalAssets > 0 ? Math.round((e[1] / totalAssets) * 100) : 0;
        return '<tr><td style="padding:0.3rem 0.4rem;font-size:0.8rem">' + e[0] + '</td>' +
          '<td style="text-align:right;padding:0.3rem 0.4rem;font-size:0.8rem">' + formatThb(e[1]) + '</td>' +
          '<td style="text-align:right;padding:0.3rem 0.4rem;font-size:0.75rem;opacity:0.6">' + pct + '%</td></tr>';
      }).join('');
    breakdownEl.innerHTML = '<table style="width:100%;border-collapse:collapse">' +
      '<thead><tr style="font-size:0.72rem;color:rgba(255,255,255,0.4);border-bottom:1px solid rgba(255,255,255,0.07)">' +
      '<th style="text-align:left;padding:0.3rem 0.4rem">Category</th>' +
      '<th style="text-align:right;padding:0.3rem 0.4rem">Value</th>' +
      '<th style="text-align:right;padding:0.3rem 0.4rem">%</th>' +
      '</tr></thead><tbody>' + catRows + '</tbody></table>';
  }

  if (!ctx || typeof Chart === 'undefined') return;
  if (netWorthChart) netWorthChart.destroy();
  netWorthChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Net Worth'],
      datasets: [
        {
          label: 'Assets',
          data: [totalAssets],
          backgroundColor: 'rgba(34,197,94,0.7)',
          borderColor: '#22c55e',
          borderWidth: 1
        },
        {
          label: 'Debts',
          data: [totalDebts],
          backgroundColor: 'rgba(239,68,68,0.7)',
          borderColor: '#ef4444',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + ': ฿' + (ctx.raw || 0).toLocaleString('en-US');
            }
          }
        }
      },
      scales: {
        x: {
          stacked: false,
          ticks: { color: 'rgba(255,255,255,0.4)', callback: function (v) { return '฿' + v.toLocaleString('en-US'); } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: { display: false },
          grid: { display: false }
        }
      }
    }
  });
}

/* ─── Section G: Alerts ─── */
function loadAlerts(transactions, debts, assets, budgets) {
  const container = document.getElementById('alerts-container');
  if (!container) return;

  const alerts = [];

  // Check budgets: categories over 100%
  const expByCategory = {};
  transactions.filter(function (t) { return t.fields.type === 'Expense'; }).forEach(function (t) {
    const cat = t.fields.category_name || 'Uncategorized';
    expByCategory[cat] = (expByCategory[cat] || 0) + (t.fields.amount || 0);
  });

  budgets.forEach(function (b) {
    const f = b.fields || {};
    if (!f.active && f.active !== undefined) return;
    if (!f.label || !f.amount) return;
    const spent = expByCategory[f.label] || 0;
    const pct = Math.round((spent / f.amount) * 100);
    if (pct > 100) {
      alerts.push({ type: 'error', text: f.label + ' is ' + pct + '% over budget (' + formatThb(spent) + ' / ' + formatThb(f.amount) + ')' });
    } else if (pct > 80) {
      alerts.push({ type: 'warning', text: f.label + ' at ' + pct + '% of budget (' + formatThb(spent) + ' / ' + formatThb(f.amount) + ')' });
    }
  });

  // Check assets "For Sale" with no update for 30+ days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyIso = thirtyDaysAgo.toISOString().split('T')[0];

  assets.forEach(function (a) {
    const f = a.fields || {};
    if (f.status !== 'For Sale') return;
    const lastUpdate = f.date_acquired || f.last_modified || '';
    if (lastUpdate && lastUpdate < thirtyIso) {
      alerts.push({ type: 'info', text: '"' + f.name + '" has been for sale 30+ days with no update' });
    }
  });

  // Check debts with due date in next 7 days
  const sevenDaysOut = new Date();
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const sevenIso = sevenDaysOut.toISOString().split('T')[0];
  const today = todayIso();

  debts.forEach(function (d) {
    const f = d.fields || {};
    const status = (f.status || '').toLowerCase();
    if (status === 'paid' || status === 'closed') return;
    if (f.due_date && f.due_date >= today && f.due_date <= sevenIso) {
      alerts.push({ type: 'warning', text: f.creditor_name + ' payment due on ' + f.due_date + ' — ' + formatThb(f.monthly_payment) });
    }
  });

  const alertsSection = document.getElementById('alerts-section');
  if (alerts.length === 0) {
    if (alertsSection) alertsSection.style.display = 'none';
    return;
  }
  if (alertsSection) alertsSection.style.display = 'block';

  const colorMap = { error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
  const bgMap = { error: 'rgba(239,68,68,0.1)', warning: 'rgba(245,158,11,0.1)', info: 'rgba(59,130,246,0.1)' };
  const iconMap = { error: '🔴', warning: '⚠️', info: 'ℹ️' };

  container.innerHTML = alerts.map(function (a) {
    return '<div style="display:inline-flex;align-items:center;gap:0.4rem;background:' + bgMap[a.type] + ';' +
      'border:1px solid ' + colorMap[a.type] + '33;border-radius:20px;padding:0.3rem 0.75rem;' +
      'font-size:0.78rem;color:' + colorMap[a.type] + ';margin:0.25rem">' +
      iconMap[a.type] + ' ' + a.text + '</div>';
  }).join('');
}

/* ─── Main: load all dashboard sections ─── */
let currentPeriod = 'monthly';

async function loadAllSections(period, start, end) {
  // Show loading state
  const sections = document.querySelectorAll('.section-loading');
  sections.forEach(function (el) { el.style.display = 'block'; });

  try {
    const data = await fetchDashboardData(start, end);
    const { transactions, categories, debts, assets, budgets } = data;

    // Calculate period days
    const startDate = new Date(start);
    const endDate = new Date(end);
    const periodDays = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);

    // Run sections
    loadCashflowSection(transactions, budgets, periodDays);
    loadTrendChart(transactions, period);
    loadParetoChart(transactions);
    loadPaynterTable(transactions, categories, budgets);
    loadDebtWave(debts);
    loadNetWorth(assets, debts);
    loadAlerts(transactions, debts, assets, budgets);

    // Update filter display
    const periodLabel = document.getElementById('period-label');
    if (periodLabel) {
      periodLabel.textContent = period.charAt(0).toUpperCase() + period.slice(1) +
        ': ' + start + ' → ' + end;
    }
  } catch (e) {
    console.error('Dashboard load error:', e);
    showFlash('Failed to load dashboard data', 'error');
  } finally {
    sections.forEach(function (el) { el.style.display = 'none'; });
  }
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', function () {
  // Load quote banner
  loadQuote();

  // Set up period toggle buttons
  const periodBtns = document.querySelectorAll('[data-period]');
  periodBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      periodBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentPeriod = btn.dataset.period;
      const range = getPeriodRange(currentPeriod);
      const startInput = document.getElementById('filter-start');
      const endInput = document.getElementById('filter-end');
      if (startInput) startInput.value = range.start;
      if (endInput) endInput.value = range.end;
      loadAllSections(currentPeriod, range.start, range.end);
    });
  });

  // Date range apply button
  const applyBtn = document.getElementById('apply-daterange');
  if (applyBtn) {
    applyBtn.addEventListener('click', function () {
      const start = document.getElementById('filter-start').value;
      const end = document.getElementById('filter-end').value;
      if (!start || !end) { showFlash('Please select start and end dates', 'error'); return; }
      loadAllSections('custom', start, end);
    });
  }

  // Drill-down panel close
  const drilldownClose = document.getElementById('drilldown-close');
  if (drilldownClose) drilldownClose.addEventListener('click', closeDrillDown);
  const drilldownBackdrop = document.getElementById('drilldown-backdrop');
  if (drilldownBackdrop) drilldownBackdrop.addEventListener('click', closeDrillDown);

  // Initial load with monthly defaults
  const range = getPeriodRange('monthly');
  const startInput = document.getElementById('filter-start');
  const endInput = document.getElementById('filter-end');
  if (startInput) startInput.value = range.start;
  if (endInput) endInput.value = range.end;

  // Set monthly button active
  const monthlyBtn = document.querySelector('[data-period="monthly"]');
  if (monthlyBtn) monthlyBtn.classList.add('active');

  loadAllSections('monthly', range.start, range.end);
});
