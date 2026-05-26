/* budget-panel.injector.js — Budget panel (M2.4)
 * Stats: plan/month, plan/12mo, earn booked, avg balance, gap, hit/miss count
 * Chart: T4 budget vs actual (horizontal bar)
 * Cards: budget cards with hit/miss status
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

  let budgetChart = null;
  let txData = [], budgets = [], categories = [];
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
  function renderStats(catMap, spendByBudget, earnTotal) {
    const expBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Expense';
    });
    const incBudgets = budgets.filter(b => {
      const cat = catMap[lid(b.category_id)];
      return b.active !== false && cat?.type === 'Income';
    });

    const planMonth  = expBudgets.reduce((s, b) => s + mbr(b), 0);
    const plan12     = planMonth * 12;
    const earnBooked = incBudgets.reduce((s, b) => s + mbr(b), 0);
    const avgBalance = earnBooked - planMonth;

    // hit = spent <= budget, miss = spent > budget (only budgets with any spend tracked)
    let hitCount = 0, missCount = 0, totalGap = 0;
    expBudgets.forEach(b => {
      const bAmt  = mbr(b);
      const spent = spendByBudget[b.id] || 0;
      const gap   = bAmt - spent;
      totalGap += gap;
      if (spent >= bAmt) missCount++; else hitCount++;
    });

    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('bud-plan-month',  fmt(planMonth));
    set('bud-plan-12',     fmt(plan12));
    set('bud-earn',        fmt(earnBooked));
    set('bud-avg-balance', fmt(avgBalance));
    set('bud-gap',         (totalGap >= 0 ? '+' : '') + fmt(totalGap));
    set('bud-hit-count',   hitCount + ' on track');
    set('bud-miss-count',  missCount + ' over limit');

    const gapEl = el('bud-gap');
    if (gapEl) gapEl.style.color = totalGap >= 0 ? 'var(--green)' : 'var(--red)';
    const missEl = el('bud-miss-count');
    if (missEl) missEl.style.color = missCount > 0 ? 'var(--red)' : 'var(--green)';
  }

  /* ── T4 Budget vs Actual chart ── */
  function renderChart(catMap, spendByBudget) {
    const canvas = el('bud-chart');
    if (!canvas) return;
    if (budgetChart) { budgetChart.destroy(); budgetChart = null; }

    const expBudgets = budgets
      .filter(b => {
        const cat = catMap[lid(b.category_id)];
        return b.active !== false && cat?.type === 'Expense';
      })
      .sort((a, b) => mbr(b) - mbr(a))
      .slice(0, 12);

    if (!expBudgets.length) return;

    const labels  = expBudgets.map(b => b.label || '—');
    const planned = expBudgets.map(b => mbr(b));
    const actual  = expBudgets.map(b => spendByBudget[b.id] || 0);
    const barColors = actual.map((a, i) => a > planned[i] ? '#ef4444' : a / planned[i] >= 0.8 ? '#f59e0b' : '#22c55e');

    budgetChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Budget',  data: planned, backgroundColor: 'rgba(59,130,246,0.2)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 4 },
          { label: 'Actual',  data: actual,  backgroundColor: barColors, borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 12 } }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { ticks: { font: { size: 9 }, callback: v => '฿' + (v/1000).toFixed(0) + 'k' } },
          y: { ticks: { font: { size: 9 } } }
        }
      }
    });
  }

  /* ── Cards ── */
  function renderCards(catMap, spendByBudget) {
    const zone = el('bud-cards');
    if (!zone) return;

    const expBudgets = budgets
      .filter(b => {
        const cat = catMap[lid(b.category_id)];
        return b.active !== false && cat?.type === 'Expense';
      })
      .sort((a, b) => mbr(b) - mbr(a));

    if (!expBudgets.length) {
      zone.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem;padding:0.75rem">No active budgets</p>';
      return;
    }

    zone.innerHTML = expBudgets.map(b => {
      const bAmt   = mbr(b);
      const spent  = spendByBudget[b.id] || 0;
      const pct    = bAmt > 0 ? Math.round(spent / bAmt * 100) : 0;
      const remain = bAmt - spent;
      const barC   = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
      const cat    = catMap[lid(b.category_id)];
      const grp    = cat?.group || cat?.name || '—';
      const status = pct >= 100 ? '🔴 Over' : pct >= 80 ? '🟡 Near' : '🟢 OK';

      return `<div class="liab-content-card">
        <div class="liab-content-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'">
          <div>
            <div style="font-size:0.85rem;font-weight:600;color:var(--text,var(--text-primary))">${esc(b.label || '—')}</div>
            <div style="font-size:0.72rem;color:var(--text-dim,var(--text-secondary))">${esc(grp)} · ${b.period || 'Monthly'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:0.9rem;font-weight:700;color:${barC}">${pct}%</div>
            <div style="font-size:0.68rem;color:var(--text-dim,var(--text-secondary))">${status}</div>
          </div>
        </div>
        <div class="liab-content-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.3rem;margin-bottom:0.5rem">
            <div style="font-size:0.75rem"><span style="color:var(--text-dim)">Budget: </span>${fmt(bAmt)}</div>
            <div style="font-size:0.75rem"><span style="color:var(--text-dim)">Spent: </span>${fmt(spent)}</div>
            <div style="font-size:0.75rem"><span style="color:var(--text-dim)">Remain: </span><span style="color:${remain>=0?'var(--green)':'var(--red)'}">${fmt(Math.abs(remain))}${remain<0?' over':''}</span></div>
            <div style="font-size:0.75rem"><span style="color:var(--text-dim)">Due day: </span>${b.payment_due_day || '—'}</div>
          </div>
          <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:0.2rem">
            <div style="width:${Math.min(pct,100)}%;height:100%;background:${barC};border-radius:3px;transition:width 0.4s"></div>
          </div>
          <div style="font-size:0.68rem;color:var(--text-dim,var(--text-secondary))">${fmt(spent)} spent of ${fmt(bAmt)} budgeted</div>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Load ── */
  async function loadAndRender() {
    const start = monthStart(0);
    const [txR, bR, cR] = await Promise.allSettled([
      api('/api/transactions?start=' + start),
      api('/api/budgets'),
      api('/api/categories')
    ]);
    txData     = txR.status === 'fulfilled' ? (txR.value.records || []).map(r => ({ id: r.id, ...r.fields })) : [];
    budgets    = bR.status  === 'fulfilled' ? (bR.value.records  || []).map(r => ({ id: r.id, ...r.fields })) : [];
    categories = cR.status  === 'fulfilled' ? (cR.value.records  || []).map(r => ({ id: r.id, ...r.fields })) : [];

    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

    const spendByBudget = {};
    txData.filter(t => t.type === 'Expense').forEach(t => {
      const bid = lid(t.budget_id);
      if (bid) spendByBudget[bid] = (spendByBudget[bid] || 0) + Number(t.amount || 0);
    });

    const earnTotal = txData.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount || 0), 0);

    renderStats(catMap, spendByBudget, earnTotal);
    renderChart(catMap, spendByBudget);
    renderCards(catMap, spendByBudget);
  }

  function init() {
    if (initialized) return; initialized = true;
    loadAndRender().catch(console.error);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (el('panel-budget')?.classList.contains('active')) init();
  });
  window.addEventListener('panelactivated', e => { if (e.detail === 'budget') init(); });
})();
