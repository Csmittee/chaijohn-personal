/* expenses.injector.js — Expenses panel (M2.3)
 * Stats: spent, budget remaining, locked budgets, debt ratio
 * Charts: Pareto (horizontal bar) + 6-month trend
 * Cards: budget cards (liability-card ratio style)
 */
(function () {
  'use strict';

  const fmt = n => '฿' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lid = v => (Array.isArray(v) ? v[0] : v) || null;

  function mbr(b) {
    const a = Number(b.amount || 0), p = b.period || 'Monthly';
    if (p === 'Annual')  return a / 12;
    if (p === '3x-year') return (a * 3) / 12;
    if (p === '6x-year') return (a * 6) / 12;
    return a;
  }

  let paretoChart = null, trendChart = null;
  let txData = [], budgets = [], categories = [], liabilities = [];
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
  function renderStats(catMap, budgetMap, spendByBudget) {
    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense';
    });
    const totalBudget = expBudgets.reduce((s, b) => s + mbr(b), 0);
    const totalSpent  = txData.filter(t => t.type === 'Expense').reduce((s,t) => s+Number(t.amount||0), 0);
    const remaining   = Math.max(0, totalBudget - totalSpent);
    const locked      = expBudgets.filter(b => (spendByBudget[b.id] || 0) >= mbr(b)).length;
    const fcLoan      = liabilities.filter(l => l.active !== false && Number(l.current_balance||0) > 0)
                          .reduce((s,l) => s+Number(l.monthly_payment||0), 0);
    const debtRatio   = totalSpent > 0 ? Math.round(fcLoan / totalSpent * 100) : 0;

    const set = (id,v) => { const e = el(id); if (e) e.textContent = v; };
    set('exp-spent',         fmt(totalSpent));
    set('exp-remain',        fmt(remaining));
    set('exp-locked',        locked + ' over limit');
    set('exp-debt-ratio',    debtRatio + '% of spend');

    const spentEl = el('exp-spent');
    if (spentEl && totalSpent > totalBudget) spentEl.style.color = 'var(--red)';
  }

  /* ── Pareto chart ── */
  function renderPareto(catMap, budgetMap, spendByBudget) {
    const canvas = el('exp-pareto-chart');
    if (!canvas) return;
    if (paretoChart) { paretoChart.destroy(); paretoChart = null; }

    const groupTotals = {};
    Object.entries(spendByBudget).forEach(([bid, amt]) => {
      const b = budgetMap[bid]; if (!b) return;
      const cat = catMap[lid(b.category_id)];
      const g = cat?.group || cat?.name || 'Other';
      groupTotals[g] = (groupTotals[g] || 0) + amt;
    });
    // Legacy: tx without budget_id
    txData.filter(t => t.type==='Expense' && !lid(t.budget_id) && lid(t.category_id)).forEach(t => {
      const cat = catMap[lid(t.category_id)];
      const g = cat?.group || cat?.name || 'Other';
      groupTotals[g] = (groupTotals[g] || 0) + Number(t.amount||0);
    });

    const sorted = Object.entries(groupTotals).sort((a,b) => b[1]-a[1]).slice(0, 10);
    const palette = ['#ef4444','#f59e0b','#3b82f6','#8b5cf6','#22c55e','#ec4899','#14b8a6','#64748b','#f97316','#0ea5e9'];

    paretoChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: sorted.map(([g])=>g), datasets: [{ data: sorted.map(([,v])=>v), backgroundColor: palette, borderRadius: 4 }]},
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font:{size:9}, callback: v => '฿'+(v/1000).toFixed(0)+'k' } },
          y: { ticks: { font:{size:9} } }
        }
      }
    });
  }

  /* ── Trend chart ── */
  async function renderTrend() {
    const canvas = el('exp-trend-chart');
    if (!canvas) return;
    if (trendChart) { trendChart.destroy(); trendChart = null; }

    let allTx = [];
    try {
      const res = await api('/api/transactions?start=' + monthStart(5));
      allTx = (res.records || []).map(r => ({...r.fields}));
    } catch { return; }

    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    const totals = Object.fromEntries(months.map(m => [m, 0]));
    allTx.filter(t => t.type === 'Expense').forEach(t => {
      const ym = (t.date||'').slice(0,7);
      if (totals[ym] !== undefined) totals[ym] += Number(t.amount||0);
    });
    const labels = months.map(m => {
      const [y,mo] = m.split('-');
      return new Date(y,mo-1,1).toLocaleDateString('en',{month:'short'});
    });

    trendChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Monthly Expenses', data: months.map(m=>totals[m]),
        borderColor: '#ef4444', borderWidth: 2, fill: true, backgroundColor: 'rgba(239,68,68,0.08)',
        pointRadius: 3, tension: 0.3 }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font:{size:9} } },
          y: { ticks: { font:{size:9}, callback: v => '฿'+(v/1000).toFixed(0)+'k' } }
        }
      }
    });
  }

  /* ── Budget cards ── */
  function renderCards(catMap, spendByBudget) {
    const zone = el('exp-cards');
    if (!zone) return;
    const expB = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense';
    }).sort((a,b) => mbr(b) - mbr(a));

    if (!expB.length) { zone.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem;padding:0.75rem">No active expense budgets</p>'; return; }

    const maxAmt = Math.max(...expB.map(b => mbr(b)), 1);
    zone.innerHTML = expB.map(b => {
      const bAmt   = mbr(b);
      const spent  = spendByBudget[b.id] || 0;
      const pct    = bAmt > 0 ? Math.round(spent / bAmt * 100) : 0;
      const barC   = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
      const h      = Math.max(72, Math.sqrt(bAmt / maxAmt) * 160);
      const cat    = catMap[lid(b.category_id)];
      const grp    = cat?.group || cat?.name || '—';
      return `<div class="liab-content-card" style="min-height:${h}px;display:flex;flex-direction:column;justify-content:space-between;background:var(--bg-card,var(--bg-raised))">
        <div style="padding:0.7rem 0.85rem">
          <div style="font-size:0.68rem;color:var(--text-dim,var(--text-secondary))">${esc(grp)}</div>
          <div style="font-size:0.82rem;font-weight:600;color:var(--text,var(--text-primary));margin-top:0.1rem">${esc(b.label||'—')}</div>
          <div style="font-size:0.7rem;color:var(--text-dim,var(--text-secondary));margin-top:0.15rem">${fmt(spent)} / ${fmt(bAmt)}</div>
        </div>
        <div style="padding:0 0.85rem 0.7rem">
          <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="width:${Math.min(pct,100)}%;height:100%;background:${barC};border-radius:3px;transition:width 0.4s"></div>
          </div>
          <div style="font-size:0.68rem;text-align:right;margin-top:0.15rem;color:${pct>=100?'#ef4444':pct>=80?'#f59e0b':'var(--text-dim,var(--text-secondary))'}">${pct}%</div>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Load ── */
  async function loadAndRender() {
    const start = monthStart(0);
    const [txR, bR, cR, lR] = await Promise.allSettled([
      api('/api/transactions?start=' + start),
      api('/api/budgets'),
      api('/api/categories'),
      api('/api/liabilities')
    ]);
    txData      = txR.status==='fulfilled' ? (txR.value.records||[]).map(r=>({id:r.id,...r.fields})) : [];
    budgets     = bR.status==='fulfilled'  ? (bR.value.records||[]).map(r=>({id:r.id,...r.fields}))  : [];
    categories  = cR.status==='fulfilled'  ? (cR.value.records||[]).map(r=>({id:r.id,...r.fields}))  : [];
    liabilities = lR.status==='fulfilled'  ? (lR.value.records||[]).map(r=>({id:r.id,...r.fields}))  : [];

    const catMap    = Object.fromEntries(categories.map(c => [c.id, c]));
    const budgetMap = Object.fromEntries(budgets.map(b => [b.id, b]));
    const spendByBudget = {};
    txData.filter(t => t.type==='Expense').forEach(t => {
      const bid = lid(t.budget_id);
      if (bid) spendByBudget[bid] = (spendByBudget[bid] || 0) + Number(t.amount||0);
    });

    renderStats(catMap, budgetMap, spendByBudget);
    renderPareto(catMap, budgetMap, spendByBudget);
    renderTrend();
    renderCards(catMap, spendByBudget);
  }

  function init() {
    if (initialized) return; initialized = true;
    loadAndRender().catch(console.error);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (el('panel-expenses')?.classList.contains('active')) init();
  });
  window.addEventListener('panelactivated', e => { if (e.detail === 'expenses') init(); });
})();
