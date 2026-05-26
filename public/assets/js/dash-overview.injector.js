/* dash-overview.injector.js — Dashboard overview (M1)
 * Stats: days-to-zero, days-to-earn, project idea value (placeholder), net worth
 * TODAY PRIORITY: placeholder section
 * Mini charts: cashflow, expenses, liabilities, budget (click → navigate to panel)
 */
(function () {
  'use strict';

  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const lid = v => (Array.isArray(v) ? v[0] : v) || null;

  let miniCfChart = null, miniExpChart = null, miniLiabChart = null, miniBudChart = null;
  let initialized = false;
  function el(id) { return document.getElementById(id); }

  async function api(path) {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  }

  function monthStart(monthsBack) {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() - monthsBack, 1).toISOString().split('T')[0];
  }

  /* ── Stats ── */
  function renderStats(txData, liabilities, syncPoint, assets) {
    const today = new Date().toISOString().split('T')[0];
    const totalIn  = txData.filter(t => t.type === 'Income' ).reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalOut = txData.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0);

    // Current cash (sync-point adjusted)
    const syncBal  = syncPoint ? Number(syncPoint.balance || 0) : null;
    const syncDate = syncPoint ? (syncPoint.date || null) : null;
    let currentCash = totalIn - totalOut;
    if (syncBal !== null && syncDate) {
      const delta = txData.filter(t => t.date > syncDate);
      const dIn  = delta.filter(t => t.type === 'Income' ).reduce((s, t) => s + Number(t.amount || 0), 0);
      const dOut = delta.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0);
      currentCash = syncBal + dIn - dOut;
    }

    // Daily burn rate
    const daysPassed = new Date().getDate();
    const avgDailyOut = daysPassed > 0 ? totalOut / daysPassed : 0;
    const fcLoan = liabilities
      .filter(l => l.active !== false && Number(l.current_balance || 0) > 0)
      .reduce((s, l) => s + Number(l.monthly_payment || 0), 0);
    const dailyNet = -(avgDailyOut + fcLoan / 30);

    let daysToZeroStr = '—';
    if (currentCash <= 0) {
      daysToZeroStr = '⚠ Now';
    } else if (dailyNet < 0) {
      const d = Math.floor(currentCash / -dailyNet);
      const zd = new Date(); zd.setDate(zd.getDate() + d);
      daysToZeroStr = d + 'd (' + zd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ')';
    }

    // Next income
    const futureEarns = txData
      .filter(t => t.type === 'Income' && t.date > today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const nextEarnDate = futureEarns.length ? futureEarns[0].date : null;
    let daysToEarnStr = '—';
    if (nextEarnDate) {
      const diff = Math.ceil((new Date(nextEarnDate) - new Date(today)) / 86400000);
      daysToEarnStr = diff + 'd (' + nextEarnDate.slice(5) + ')';
    }

    // Net worth: assets - liabilities
    const totalAssets = assets.reduce((s, a) => s + Number(a.current_value || a.purchase_price || 0), 0);
    const totalDebt   = liabilities
      .filter(l => l.active !== false)
      .reduce((s, l) => s + Number(l.current_balance || 0), 0);
    const netWorth = totalAssets + currentCash - totalDebt;

    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('dash-days-zero',  daysToZeroStr);
    set('dash-days-earn',  daysToEarnStr);
    set('dash-project-val','—');   // placeholder
    set('dash-net-worth',  fmt(netWorth));

    const nwEl = el('dash-net-worth');
    if (nwEl) nwEl.style.color = netWorth >= 0 ? 'var(--green)' : 'var(--red)';
  }

  /* ── Mini charts ── */
  function renderMiniCashflow(txData, syncPoint) {
    const canvas = el('dash-mini-cf');
    if (!canvas) return;
    if (miniCfChart) { miniCfChart.destroy(); miniCfChart = null; }

    // 7-day rolling balance
    const today     = new Date();
    const todayStr  = today.toISOString().split('T')[0];
    const dailyDelta = {};
    txData.forEach(t => {
      dailyDelta[t.date] = (dailyDelta[t.date] || 0) + (t.type === 'Income' ? 1 : -1) * Number(t.amount || 0);
    });

    const totalIn  = txData.filter(t => t.type === 'Income' ).reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalOut = txData.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    const syncBal  = syncPoint ? Number(syncPoint.balance || 0) : null;
    const syncDate = syncPoint ? (syncPoint.date || null) : null;
    let currentCash = totalIn - totalOut;
    if (syncBal !== null && syncDate) {
      const delta = txData.filter(t => t.date > syncDate);
      const dIn  = delta.filter(t => t.type === 'Income' ).reduce((s, t) => s + Number(t.amount || 0), 0);
      const dOut = delta.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount || 0), 0);
      currentCash = syncBal + dIn - dOut;
    }

    const labels = [], data = [];
    let bal = currentCash;
    // Reconstruct last 14 days
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      if (i > 0) bal -= (dailyDelta[ds] || 0);
    }
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      bal += (dailyDelta[ds] || 0);
      labels.push(ds.slice(8));
      data.push(bal);
    }

    miniCfChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: '#3b82f6', borderWidth: 1.5, fill: true,
        backgroundColor: 'rgba(59,130,246,0.08)', pointRadius: 0, tension: 0.3 }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }

  function renderMiniExpenses(txData) {
    const canvas = el('dash-mini-exp');
    if (!canvas) return;
    if (miniExpChart) { miniExpChart.destroy(); miniExpChart = null; }

    // Last 6 months totals
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    const totals = Object.fromEntries(months.map(m => [m, 0]));
    txData.filter(t => t.type === 'Expense').forEach(t => {
      const ym = (t.date || '').slice(0, 7);
      if (totals[ym] !== undefined) totals[ym] += Number(t.amount || 0);
    });

    miniExpChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map(m => m.slice(5)),
        datasets: [{ data: months.map(m => totals[m]), backgroundColor: 'rgba(239,68,68,0.6)', borderRadius: 3 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }

  function renderMiniLiabilities(liabilities) {
    const canvas = el('dash-mini-liab');
    if (!canvas) return;
    if (miniLiabChart) { miniLiabChart.destroy(); miniLiabChart = null; }

    const active = liabilities
      .filter(l => l.active !== false && Number(l.current_balance || 0) > 0)
      .sort((a, b) => Number(b.current_balance || 0) - Number(a.current_balance || 0))
      .slice(0, 5);

    if (!active.length) return;

    miniLiabChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: active.map(l => l.name || '—'),
        datasets: [{ data: active.map(l => Number(l.current_balance || 0)),
          backgroundColor: 'rgba(239,68,68,0.6)', borderRadius: 3 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }

  function renderMiniBudget(budgets, categories, txData) {
    const canvas = el('dash-mini-bud');
    if (!canvas) return;
    if (miniBudChart) { miniBudChart.destroy(); miniBudChart = null; }

    const lid2 = v => (Array.isArray(v) ? v[0] : v) || null;
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    function mbr(b) {
      const a = Number(b.amount || 0), p = b.period || 'Monthly';
      if (p === 'Annual')  return a / 12;
      if (p === '3x-year') return (a * 3) / 12;
      if (p === '6x-year') return (a * 6) / 12;
      return a;
    }

    const expB = budgets
      .filter(b => { const cat = catMap[lid2(b.category_id)]; return b.active !== false && cat?.type === 'Expense'; })
      .sort((a, b) => mbr(b) - mbr(a))
      .slice(0, 6);

    if (!expB.length) return;

    const spendByBudget = {};
    txData.filter(t => t.type === 'Expense').forEach(t => {
      const bid = lid2(t.budget_id);
      if (bid) spendByBudget[bid] = (spendByBudget[bid] || 0) + Number(t.amount || 0);
    });

    const planned = expB.map(b => mbr(b));
    const actual  = expB.map(b => spendByBudget[b.id] || 0);

    miniBudChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: expB.map(b => b.label || '—'),
        datasets: [
          { data: planned, backgroundColor: 'rgba(59,130,246,0.25)', borderRadius: 3 },
          { data: actual,  backgroundColor: actual.map((a, i) => a > planned[i] ? 'rgba(239,68,68,0.7)' : 'rgba(34,197,94,0.6)'), borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }

  /* ── Load ── */
  async function loadAndRender() {
    const start = monthStart(5);
    const [txR, liR, syR, asR, bR, cR] = await Promise.allSettled([
      api('/api/transactions?start=' + start),
      api('/api/liabilities'),
      api('/api/cashflow-sync'),
      api('/api/assets'),
      api('/api/budgets'),
      api('/api/categories')
    ]);

    const txData      = txR.status === 'fulfilled' ? (txR.value.records || []).map(r => ({ id: r.id, ...r.fields })) : [];
    const liabilities = liR.status === 'fulfilled' ? (liR.value.records || []).map(r => ({ id: r.id, ...r.fields })) : [];
    const syncPoint   = syR.status === 'fulfilled' ? (syR.value.syncPoint || null) : null;
    const assets      = asR.status === 'fulfilled' ? (asR.value.records || []).map(r => ({ id: r.id, ...r.fields })) : [];
    const budgets     = bR.status  === 'fulfilled' ? (bR.value.records  || []).map(r => ({ id: r.id, ...r.fields })) : [];
    const categories  = cR.status  === 'fulfilled' ? (cR.value.records  || []).map(r => ({ id: r.id, ...r.fields })) : [];

    // Use current-month tx for stats
    const curMonthStart = monthStart(0);
    const curTx = txData.filter(t => t.date >= curMonthStart);

    renderStats(curTx, liabilities, syncPoint, assets);
    renderMiniCashflow(txData, syncPoint);
    renderMiniExpenses(txData);
    renderMiniLiabilities(liabilities);
    renderMiniBudget(budgets, categories, curTx);
  }

  function init() {
    if (initialized) return; initialized = true;
    loadAndRender().catch(console.error);
  }

  window.addEventListener('panelactivated', e => { if (e.detail === 'dashboard') init(); });
  if (el('panel-dashboard')?.classList.contains('active')) init();
})();
